import os
import subprocess
import tempfile
import requests
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta

INVOICE_TYPES_MAP = {
    "Factura A": 1,
    "Nota de Débito A": 2,
    "Nota de Crédito A": 3,
    "Factura B": 6,
    "Nota de Débito B": 7,
    "Nota de Crédito B": 8,
    "Factura C": 11,
    "Nota de Débito C": 12,
    "Nota de Crédito C": 13,
}

def _post_request(url, data, headers, timeout=30):
    from requests.adapters import HTTPAdapter
    from urllib3.util import ssl_
    import ssl
    
    class LegacyContextAdapter(HTTPAdapter):
        def init_poolmanager(self, *args, **kwargs):
            ctx = ssl_.create_urllib3_context(ciphers="DEFAULT@SECLEVEL=1")
            kwargs['ssl_context'] = ctx
            return super().init_poolmanager(*args, **kwargs)
            
    session = requests.Session()
    session.mount("https://", LegacyContextAdapter())
    return session.post(url, data=data, headers=headers, timeout=timeout)

# Cache global de Tickets de Acceso (TA) de AFIP para evitar golpear WSAA repetidamente en facturación masiva
WSAA_TOKEN_CACHE = {}

def purge_wsaa_cache(cache_key=None):
    global WSAA_TOKEN_CACHE
    if cache_key and cache_key in WSAA_TOKEN_CACHE:
        del WSAA_TOKEN_CACHE[cache_key]
    else:
        WSAA_TOKEN_CACHE.clear()

class WSAAClient:
    def __init__(self, cert_content, key_content, sandbox=True):
        self.cert_content = cert_content
        self.key_content = key_content
        self.sandbox = sandbox
        self.url = "https://wsaahomo.afip.gov.ar/ws/services/LoginCms" if sandbox else "https://wsaa.afip.gov.ar/ws/services/LoginCms"

    def get_token_and_sign(self, service="wsfe", force_refresh=False):
        import hashlib
        import time
        global WSAA_TOKEN_CACHE
        
        # Generar clave única de cache basada en los primeros 100 caracteres del certificado y el ambiente
        cert_preview = str(self.cert_content)[:100] if self.cert_content else ""
        cert_hash = hashlib.md5(f"{cert_preview}_{service}_{self.sandbox}".encode('utf-8')).hexdigest()
        cache_key = f"{cert_hash}_{service}"
        
        now = datetime.now(timezone.utc)
        
        if not force_refresh and cache_key in WSAA_TOKEN_CACHE:
            cached = WSAA_TOKEN_CACHE[cache_key]
            # Reutilizar si aún es válido (con margen de 15 minutos)
            if cached.get("expires_at") and cached["expires_at"] > (now + timedelta(minutes=15)):
                return cached["token"], cached["sign"]
        
        timestamp = int(now.timestamp())
        generation_time = (now - timedelta(minutes=5)).isoformat().split(".")[0] + "Z"
        expiration_time = (now + timedelta(hours=11)).isoformat().split(".")[0] + "Z"
        
        tra_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
    <header>
        <uniqueId>{timestamp}</uniqueId>
        <generationTime>{generation_time}</generationTime>
        <expirationTime>{expiration_time}</expirationTime>
    </header>
    <service>{service}</service>
</loginTicketRequest>"""

        # Sign using cryptography library (pure Python)
        from cryptography.hazmat.primitives.serialization import pkcs7, load_pem_private_key
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography import x509

        cert_bytes = self.cert_content.encode("utf-8") if isinstance(self.cert_content, str) else self.cert_content
        key_bytes = self.key_content.encode("utf-8") if isinstance(self.key_content, str) else self.key_content

        cert = x509.load_pem_x509_certificate(cert_bytes)
        private_key = load_pem_private_key(key_bytes, password=None)

        signature_pem = (
            pkcs7.PKCS7SignatureBuilder()
            .set_data(tra_xml.encode("utf-8"))
            .add_signer(cert, private_key, hashes.SHA256())
            .sign(serialization.Encoding.PEM, [])
        )

        cms_content = signature_pem.decode("utf-8")
        lines = cms_content.splitlines()
        base64_lines = [l.strip() for l in lines if not l.startswith("-----")]
        cms_signature = "".join(base64_lines)

        soap_envelope = f"""<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
   <soapenv:Header/>
   <soapenv:Body>
      <wsaa:loginCms>
         <wsaa:in0>{cms_signature}</wsaa:in0>
      </wsaa:loginCms>
   </soapenv:Body>
</soapenv:Envelope>"""

        headers = {
            "Content-Type": "text/xml; charset=utf-8",
            "SOAPAction": ""
        }
        
        last_exception = None
        for attempt in range(3):
            try:
                r = _post_request(self.url, data=soap_envelope.encode("utf-8"), headers=headers, timeout=30)
                r.raise_for_status()
                
                root = ET.fromstring(r.text)
                login_cms_return = root.find(".//loginCmsReturn") or root.find(".//{http://wsaa.view.sua.dvadac.desein.afip.gov}loginCmsReturn")
                if login_cms_return is None:
                    raise Exception("No se pudo obtener loginCmsReturn del WSAA")
                    
                ta_xml_str = login_cms_return.text
                ta_root = ET.fromstring(ta_xml_str)
                token = ta_root.find(".//token").text
                sign = ta_root.find(".//sign").text
                
                # Guardar en cache por 10.5 horas
                WSAA_TOKEN_CACHE[cache_key] = {
                    "token": token,
                    "sign": sign,
                    "expires_at": now + timedelta(hours=10, minutes=30)
                }
                
                return token, sign
            except Exception as ex:
                last_exception = ex
                if attempt < 2:
                    time.sleep(1.0)
                    
        raise Exception(f"Error AFIP: {last_exception}")

class WSFEClient:
    def __init__(self, token, sign, cuit, sandbox=True):
        self.token = token
        self.sign = sign
        self.cuit = "".join(c for c in str(cuit) if c.isdigit())
        self.sandbox = sandbox
        self.url = "https://wswhomo.afip.gov.ar/wsfev1/service.asmx" if sandbox else "https://servicios1.afip.gov.ar/wsfev1/service.asmx"

    def get_last_authorized_voucher(self, pto_vta, cbte_tipo):
        soap_envelope = f"""<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <FECompUltimoAutorizado xmlns="http://ar.gov.afip.dif.FEV1/">
      <Auth>
        <Token>{self.token}</Token>
        <Sign>{self.sign}</Sign>
        <Cuit>{self.cuit}</Cuit>
      </Auth>
      <PtoVta>{int(pto_vta)}</PtoVta>
      <CbteTipo>{int(cbte_tipo)}</CbteTipo>
    </FECompUltimoAutorizado>
  </soap:Body>
</soap:Envelope>"""

        headers = {
            "Content-Type": "text/xml; charset=utf-8",
            "SOAPAction": "http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado"
        }
        
        r = _post_request(self.url, data=soap_envelope.encode("utf-8"), headers=headers, timeout=30)
        r.raise_for_status()
        
        root = ET.fromstring(r.text)
        cbte_nro_node = root.find(".//CbteNro") or root.find(".//{http://ar.gov.afip.dif.FEV1/}CbteNro")
        if cbte_nro_node is None:
            err_node = root.find(".//Msg") or root.find(".//{http://ar.gov.afip.dif.FEV1/}Msg")
            err_msg = err_node.text if err_node is not None else "Error al consultar último comprobante autorizado."
            raise Exception(err_msg)
            
        return int(cbte_nro_node.text)

    def request_cae(self, pto_vta, cbte_tipo, cbte_nro, total, doc_tipo=99, doc_nro=0, concepto=1, cbte_fch=None, cbtes_asoc=None):
        if not cbte_fch:
            cbte_fch = datetime.now().strftime("%Y%m%d")
            
        cbtes_asoc_xml = ""
        if cbtes_asoc:
            cbtes_asoc_xml = f"""
            <CbtesAsoc>
              <CbteAsoc>
                <Tipo>{int(cbtes_asoc['tipo'])}</Tipo>
                <PtoVta>{int(cbtes_asoc['pto_vta'])}</PtoVta>
                <Nro>{int(cbtes_asoc['nro'])}</Nro>
              </CbteAsoc>
            </CbtesAsoc>"""
            
        soap_envelope = f"""<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <FECAESolicitar xmlns="http://ar.gov.afip.dif.FEV1/">
      <Auth>
        <Token>{self.token}</Token>
        <Sign>{self.sign}</Sign>
        <Cuit>{self.cuit}</Cuit>
      </Auth>
      <FeCAEReq>
        <FeCabReq>
          <CantReg>1</CantReg>
          <PtoVta>{int(pto_vta)}</PtoVta>
          <CbteTipo>{int(cbte_tipo)}</CbteTipo>
        </FeCabReq>
        <FeDetReq>
          <FECAEDetRequest>
            <Concepto>{int(concepto)}</Concepto>
            <DocTipo>{int(doc_tipo)}</DocTipo>
            <DocNro>{int(doc_nro)}</DocNro>
            <CbteDesde>{int(cbte_nro)}</CbteDesde>
            <CbteHasta>{int(cbte_nro)}</CbteHasta>
            <CbteFch>{cbte_fch}</CbteFch>
            <ImpTotal>{total:.2f}</ImpTotal>
            <ImpTotConc>0.00</ImpTotConc>
            <ImpNeto>{total:.2f}</ImpNeto>
            <ImpOpEx>0.00</ImpOpEx>
            <ImpTrib>0.00</ImpTrib>
            <ImpIVA>0.00</ImpIVA>
            <MonId>PES</MonId>
            <MonCotiz>1</MonCotiz>{cbtes_asoc_xml}
          </FECAEDetRequest>
        </FeDetReq>
      </FeCAEReq>
    </FECAESolicitar>
  </soap:Body>
</soap:Envelope>"""

        headers = {
            "Content-Type": "text/xml; charset=utf-8",
            "SOAPAction": "http://ar.gov.afip.dif.FEV1/FECAESolicitar"
        }
        
        r = _post_request(self.url, data=soap_envelope.encode("utf-8"), headers=headers, timeout=30)
        r.raise_for_status()
        
        root = ET.fromstring(r.text)
        
        # Check cabecera result
        resultado_node = root.find(".//Resultado") or root.find(".//{http://ar.gov.afip.dif.FEV1/}Resultado")
        # Check detalle result
        det_resultado_node = root.find(".//FECAEDetResponse/Resultado") or root.find(".//{http://ar.gov.afip.dif.FEV1/}FECAEDetResponse/{http://ar.gov.afip.dif.FEV1/}Resultado")
        
        # Si alguno de los dos resultados es distinto de "A" (Aprobado), lanzar error
        if (resultado_node is None or resultado_node.text != "A") or (det_resultado_node is not None and det_resultado_node.text != "A"):
            obs_nodes = root.findall(".//Obs/Obs") or root.findall(".//{http://ar.gov.afip.dif.FEV1/}Obs")
            obs_msgs = []
            for obs in obs_nodes:
                msg_node = obs.find("Msg") or obs.find("{http://ar.gov.afip.dif.FEV1/}Msg")
                if msg_node is not None:
                    obs_msgs.append(msg_node.text)
            
            err_node = root.find(".//Msg") or root.find(".//{http://ar.gov.afip.dif.FEV1/}Msg")
            global_err = err_node.text if err_node is not None else "Rechazado por AFIP"
            err_msg_detailed = " | ".join(obs_msgs) if obs_msgs else ""
            
            # If we don't have obs but we have a det_resultado != A without Obs, it's weird, but we will catch it.
            if not err_msg_detailed and det_resultado_node is not None and det_resultado_node.text != "A":
                err_msg_detailed = "Rechazado a nivel detalle (sin observaciones adicionales de AFIP)"
                
            raise Exception(f"{global_err}: {err_msg_detailed}".strip())
            
        cae_node = root.find(".//CAE") or root.find(".//{http://ar.gov.afip.dif.FEV1/}CAE")
        cae_due_node = root.find(".//CAEFchVto") or root.find(".//{http://ar.gov.afip.dif.FEV1/}CAEFchVto")
        
        return cae_node.text, cae_due_node.text


class WSPadronClient:
    def __init__(self, token, sign, cuit, sandbox=True):
        self.token = token
        self.sign = sign
        self.cuit = "".join(c for c in str(cuit) if c.isdigit())
        self.sandbox = sandbox
        self.url = "https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13" if sandbox else "https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13"

    def get_persona(self, cuit_to_query):
        cuit_to_query = "".join(c for c in str(cuit_to_query) if c.isdigit())
        
        soap_envelope = f"""<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a13="http://a13.soap.ws.server.puc.sr/">
   <soapenv:Header/>
   <soapenv:Body>
      <a13:getPersona>
         <token>{self.token}</token>
         <sign>{self.sign}</sign>
         <cuitRepresentada>{self.cuit}</cuitRepresentada>
         <idPersona>{cuit_to_query}</idPersona>
      </a13:getPersona>
   </soapenv:Body>
</soapenv:Envelope>"""

        headers = {
            "Content-Type": "text/xml; charset=utf-8",
            "SOAPAction": "http://a13.soap.ws.server.puc.sr/personaServiceA13/getPersonaRequest",
        }
        
        r = _post_request(self.url, data=soap_envelope.encode("utf-8"), headers=headers, timeout=30)
        r.raise_for_status()
        
        print(f"[AFIP API RESPONSE] {r.text}")
        
        root = ET.fromstring(r.text)
        
        # Check for errors safely without namespace prefix issues
        fault = None
        for elem in root.iter():
            if elem.tag.endswith("Fault"):
                fault = elem
                break
                
        if fault is not None:
            fault_string = ""
            for child in fault.iter():
                if child.tag.endswith("faultstring"):
                    fault_string = child.text
                    break
            if not fault_string:
                fault_string = "Error en el servicio AFIP Padrón."
            raise Exception(f"{fault_string}")
            
        persona_return = None
        for elem in root.iter():
            if elem.tag.lower().endswith("return"):
                persona_return = elem
                break
                
        if persona_return is None:
            raise Exception("No se encontraron datos para el CUIT ingresado.")
            
        # Revisar si hay un error devuelto dentro del return
        error_constancia = None
        for elem in persona_return.iter():
            if elem.tag.endswith("errorConstancia") or elem.tag.endswith("errorMonotributo"):
                error_constancia = elem
                break
        
        if error_constancia is not None:
            err_msg = ""
            for child in error_constancia.iter():
                if child.tag.endswith("error") or child.tag.endswith("mensaje"):
                    err_msg = child.text
                    break
            if err_msg:
                raise Exception(f"AFIP: {err_msg}")
            raise Exception("El CUIT ingresado no es válido o no está inscripto.")
            
        datos = {}
        
        def find_child_text(parent, tag_name, default=""):
            for child in parent.iter():
                if child.tag.endswith(tag_name):
                    return child.text or default
            return default
            
        persona = None
        for elem in persona_return.iter():
            if elem.tag.endswith("persona"):
                persona = elem
                break
                
        target_obj = persona if persona is not None else persona_return
        datos["razonSocial"] = find_child_text(target_obj, "razonSocial", "")
        if not datos["razonSocial"]:
            nombre = find_child_text(target_obj, "nombre", "")
            apellido = find_child_text(target_obj, "apellido", "")
            if nombre or apellido:
                datos["razonSocial"] = f"{apellido} {nombre}".strip()
        datos["estadoClave"] = find_child_text(target_obj, "estadoClave", "ACTIVO")
            
        # Domicilio
        domicilio = None
        for elem in persona_return.iter():
            if elem.tag.endswith("domicilio"):
                domicilio = elem
                break
                
        if domicilio is not None:
            calle = find_child_text(domicilio, "calle", "")
            numero = find_child_text(domicilio, "numero", "")
            localidad = find_child_text(domicilio, "localidad", "")
            cp = find_child_text(domicilio, "codigoPostal", "")
            prov = find_child_text(domicilio, "descripcionProvincia", "")
            
            addr_parts = []
            if calle: addr_parts.append(calle)
            if numero: addr_parts.append(numero)
            if localidad: addr_parts.append(localidad)
            if prov: addr_parts.append(prov)
            if cp: addr_parts.append(f"CP {cp}")
            
            datos["direccion"] = ", ".join(addr_parts)
        else:
            datos["direccion"] = ""
            
        # Impuestos para deducir condición IVA
        condicion_iva = "CONSUMIDOR FINAL"
        for elem in persona_return.iter():
            if elem.tag.endswith("impuesto"):
                id_impuesto = find_child_text(elem, "idImpuesto", "")
                if id_impuesto == "30":
                    condicion_iva = "IVA EXENTO"
                elif id_impuesto == "32":
                    condicion_iva = "IVA SUJETO EXENTO"
                elif id_impuesto in ["10", "11"]:
                    condicion_iva = "RESPONSABLE INSCRIPTO"
                elif id_impuesto == "20" and condicion_iva != "RESPONSABLE INSCRIPTO":
                    condicion_iva = "MONOTRIBUTO"
                    
        if condicion_iva == "CONSUMIDOR FINAL":
            for elem in persona_return.iter():
                if elem.tag.endswith("monotributo") or elem.tag.endswith("regimen"):
                    condicion_iva = "MONOTRIBUTO"
                    break
                    
        datos["condicion_iva"] = condicion_iva
        return datos
