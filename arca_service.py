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

class WSAAClient:
    def __init__(self, cert_content, key_content, sandbox=True):
        self.cert_content = cert_content
        self.key_content = key_content
        self.sandbox = sandbox
        self.url = "https://wsaahomo.afip.gov.ar/ws/services/LoginCms" if sandbox else "https://wsaa.afip.gov.ar/ws/services/LoginCms"

    def get_token_and_sign(self, service="wsfe"):
        timestamp = int(datetime.now().timestamp())
        generation_time = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat().split(".")[0] + "Z"
        expiration_time = (datetime.now(timezone.utc) + timedelta(hours=12)).isoformat().split(".")[0] + "Z"
        
        tra_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
    <header>
        <uniqueId>{timestamp}</uniqueId>
        <generationTime>{generation_time}</generationTime>
        <expirationTime>{expiration_time}</expirationTime>
    </header>
    <service>{service}</service>
</loginTicketRequest>"""

        with tempfile.TemporaryDirectory() as tmpdir:
            tra_file = os.path.join(tmpdir, "tra.xml")
            cert_file = os.path.join(tmpdir, "cert.crt")
            key_file = os.path.join(tmpdir, "key.key")
            out_file = os.path.join(tmpdir, "tra.xml.cms")
            
            with open(tra_file, "w", encoding="utf-8") as f:
                f.write(tra_xml)
            with open(cert_file, "w", encoding="utf-8") as f:
                f.write(self.cert_content)
            with open(key_file, "w", encoding="utf-8") as f:
                f.write(self.key_content)
                
            cmd = ["openssl", "cms", "-sign", "-in", tra_file, "-signer", cert_file, "-inkey", key_file, "-out", out_file, "-nodetach", "-outform", "PEM"]
            subprocess.run(cmd, capture_output=True, text=True, check=True)
            
            with open(out_file, "r") as f:
                cms_content = f.read()
                
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
        
        r = requests.post(self.url, data=soap_envelope.encode("utf-8"), headers=headers, timeout=30)
        r.raise_for_status()
        
        root = ET.fromstring(r.text)
        login_cms_return = root.find(".//loginCmsReturn") or root.find(".//{http://wsaa.view.sua.dvadac.desein.afip.gov}loginCmsReturn")
        if login_cms_return is None:
            raise Exception("No se pudo obtener loginCmsReturn del WSAA")
            
        ta_xml_str = login_cms_return.text
        ta_root = ET.fromstring(ta_xml_str)
        token = ta_root.find(".//token").text
        sign = ta_root.find(".//sign").text
        return token, sign

class WSFEClient:
    def __init__(self, token, sign, cuit, sandbox=True):
        self.token = token
        self.sign = sign
        self.cuit = "".join(c for c in str(cuit) if c.isdigit())
        self.sandbox = sandbox
        self.url = "https://wswhomo.afip.gov.ar/wsfev1/service.asmx" if sandbox else "https://servicios1.afip.gob.ar/wsfev1/service.asmx"

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
        
        r = requests.post(self.url, data=soap_envelope.encode("utf-8"), headers=headers, timeout=30)
        r.raise_for_status()
        
        root = ET.fromstring(r.text)
        cbte_nro_node = root.find(".//CbteNro") or root.find(".//{http://ar.gov.afip.dif.FEV1/}CbteNro")
        if cbte_nro_node is None:
            err_node = root.find(".//Msg") or root.find(".//{http://ar.gov.afip.dif.FEV1/}Msg")
            err_msg = err_node.text if err_node is not None else "Error al consultar último comprobante autorizado."
            raise Exception(err_msg)
            
        return int(cbte_nro_node.text)

    def request_cae(self, pto_vta, cbte_tipo, cbte_nro, total, doc_tipo=99, doc_nro=0, concepto=1, cbte_fch=None):
        if not cbte_fch:
            cbte_fch = datetime.now().strftime("%Y%m%d")
            
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
        
        r = requests.post(self.url, data=soap_envelope.encode("utf-8"), headers=headers, timeout=30)
        r.raise_for_status()
        
        root = ET.fromstring(r.text)
        
        resultado_node = root.find(".//Resultado") or root.find(".//{http://ar.gov.afip.dif.FEV1/}Resultado")
        if resultado_node is None or resultado_node.text != "A":
            obs_nodes = root.findall(".//Obs/Obs") or root.findall(".//{http://ar.gov.afip.dif.FEV1/}Obs")
            obs_msgs = []
            for obs in obs_nodes:
                msg_node = obs.find("Msg") or obs.find("{http://ar.gov.afip.dif.FEV1/}Msg")
                if msg_node is not None:
                    obs_msgs.append(msg_node.text)
            
            err_node = root.find(".//Msg") or root.find(".//{http://ar.gov.afip.dif.FEV1/}Msg")
            global_err = err_node.text if err_node is not None else "Rechazado por AFIP"
            err_msg_detailed = " | ".join(obs_msgs) if obs_msgs else ""
            raise Exception(f"{global_err}: {err_msg_detailed}".strip())
            
        cae_node = root.find(".//CAE") or root.find(".//{http://ar.gov.afip.dif.FEV1/}CAE")
        cae_due_node = root.find(".//CAEFchVto") or root.find(".//{http://ar.gov.afip.dif.FEV1/}CAEFchVto")
        
        return cae_node.text, cae_due_node.text
