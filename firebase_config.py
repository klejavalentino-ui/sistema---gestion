import json
import os
import requests
import jwt
import time
import firebase_admin
from firebase_admin import credentials, auth
from cryptography.x509 import load_pem_x509_certificate

fb_config = None

# 1. Intentar cargar desde variables de entorno (producción en Render)
env_config = os.environ.get("FIREBASE_CONFIG")
if env_config:
    try:
        fb_config = json.loads(env_config)
    except Exception as e:
        print(f"Error parseando la variable de entorno FIREBASE_CONFIG: {e}")

# 2. Si no está en las variables de entorno, buscar el archivo de configuración local
if not fb_config:
    possible_paths = [
        os.path.join(os.path.dirname(__file__), 'mazo', 'firebase-applet-config.json'),
        os.path.join(os.path.dirname(__file__), 'firebase-applet-config.json'),
        'firebase-applet-config.json'
    ]
    for path in possible_paths:
        if os.path.exists(path):
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    fb_config = json.load(f)
                break
            except Exception as e:
                print(f"Error cargando {path}: {e}")

if not fb_config:
    raise FileNotFoundError("No se encontró la configuración de Firebase (definir FIREBASE_CONFIG o crear 'firebase-applet-config.json').")

API_KEY = fb_config['apiKey']
PROJECT_ID = fb_config['projectId']
DATABASE_ID = fb_config.get('firestoreDatabaseId', '(default)')
BASE_URL = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/{DATABASE_ID}/documents"

HAS_SERVICE_ACCOUNT = False

# Inicializar firebase-admin de forma segura
try:
    service_account_info = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    local_service_account = 'firebase-service-account.json'
    
    if service_account_info or os.path.exists(local_service_account):
        HAS_SERVICE_ACCOUNT = True
        
    if not firebase_admin._apps:
        if service_account_info:
            cred_dict = json.loads(service_account_info)
            cred = credentials.Certificate(cred_dict)
            firebase_admin.initialize_app(cred)
        elif os.path.exists(local_service_account):
            cred = credentials.Certificate(local_service_account)
            firebase_admin.initialize_app(cred)
        else:
            firebase_admin.initialize_app(options={'projectId': PROJECT_ID})
except Exception as e:
    print(f"Advertencia inicializando Firebase Admin SDK: {e}")

# --- Conversores de Tipos Firestore REST (Protobuf JSON) a Python ---

def to_firestore_value(val):
    if isinstance(val, str):
        return {"stringValue": val}
    elif isinstance(val, bool):
        return {"booleanValue": val}
    elif isinstance(val, (int, float)):
        if isinstance(val, bool):
            return {"booleanValue": val}
        if isinstance(val, int):
            return {"integerValue": str(val)}
        else:
            return {"doubleValue": val}
    elif isinstance(val, list):
        # Manejar listas vacías
        if not val:
            return {"arrayValue": {}}
        return {"arrayValue": {"values": [to_firestore_value(v) for v in val]}}
    elif isinstance(val, dict):
        # Manejar diccionarios vacíos
        if not val:
            return {"mapValue": {}}
        return {"mapValue": {"fields": {k: to_firestore_value(v) for k, v in val.items()}}}
    elif val is None:
        return {"nullValue": None}
    else:
        return {"stringValue": str(val)}

def from_firestore_value(field_val):
    if not isinstance(field_val, dict):
        return field_val
    for k, v in field_val.items():
        if k == "stringValue":
            return v
        elif k == "booleanValue":
            return v
        elif k == "integerValue":
            return int(v)
        elif k == "doubleValue":
            return float(v)
        elif k == "arrayValue":
            if not v or "values" not in v:
                return []
            return [from_firestore_value(item) for item in v["values"]]
        elif k == "mapValue":
            if not v or "fields" not in v:
                return {}
            return {mk: from_firestore_value(mv) for mk, mv in v["fields"].items()}
        elif k == "nullValue":
            return None
    return field_val

def to_firestore_fields(data):
    return {"fields": {k: to_firestore_value(v) for k, v in data.items()}}

def from_firestore_document(doc):
    if not doc:
        return {}
    fields = doc.get("fields", {})
    data = {}
    for k, v in fields.items():
        data[k] = from_firestore_value(v)
    
    # Extraer el ID del documento del campo 'name' ("projects/.../databases/.../documents/{collection}/{doc_id}")
    name = doc.get("name", "")
    if name:
        data["id"] = name.split("/")[-1]
    else:
        data["id"] = None
    return data

# --- Métodos de Firebase Auth ---

def sign_in(email, password):
    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}"
    payload = {
        "email": email,
        "password": password,
        "returnSecureToken": True
    }
    r = requests.post(url, json=payload, timeout=30)
    if not r.ok:
        error_msg = r.json().get("error", {}).get("message", "Error desconocido en inicio de sesión.")
        raise Exception(error_msg)
    return r.json()

def sign_up(email, password):
    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}"
    payload = {
        "email": email,
        "password": password,
        "returnSecureToken": True
    }
    r = requests.post(url, json=payload, timeout=30)
    if not r.ok:
        error_msg = r.json().get("error", {}).get("message", "Error desconocido en el registro.")
        raise Exception(error_msg)
    return r.json()

def send_verification_email(id_token):
    url = f"https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key={API_KEY}"
    payload = {
        "requestType": "VERIFY_EMAIL",
        "idToken": id_token
    }
    r = requests.post(url, json=payload, timeout=30)
    if not r.ok:
        error_msg = r.json().get("error", {}).get("message", "Error al enviar el correo de verificación.")
        raise Exception(error_msg)
    return r.json()

def send_password_reset_email(email):
    url = f"https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key={API_KEY}"
    payload = {
        "requestType": "PASSWORD_RESET",
        "email": email
    }
    r = requests.post(url, json=payload, timeout=30)
    if not r.ok:
        error_msg = r.json().get("error", {}).get("message", "Error al enviar el correo de restablecimiento de contraseña.")
        raise Exception(error_msg)
    return r.json()


def get_account_info(id_token):
    url = f"https://identitytoolkit.googleapis.com/v1/accounts:lookup?key={API_KEY}"
    payload = {
        "idToken": id_token
    }
    r = requests.post(url, json=payload, timeout=30)
    if not r.ok:
        error_msg = r.json().get("error", {}).get("message", "Error al obtener la información de la cuenta.")
        raise Exception(error_msg)
    res = r.json()
    users = res.get("users", [])
    return users[0] if users else None

# --- Métodos de Firestore CRUD ---

GOOGLE_PUBLIC_KEYS_CACHE = {
    "keys": None,
    "expires_at": 0
}

def get_google_public_keys():
    global GOOGLE_PUBLIC_KEYS_CACHE
    now = time.time()
    if GOOGLE_PUBLIC_KEYS_CACHE["keys"] and GOOGLE_PUBLIC_KEYS_CACHE["expires_at"] > now:
        return GOOGLE_PUBLIC_KEYS_CACHE["keys"]
        
    url = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    keys = r.json()
    
    # Cachear en memoria por 1 hora
    GOOGLE_PUBLIC_KEYS_CACHE["keys"] = keys
    GOOGLE_PUBLIC_KEYS_CACHE["expires_at"] = now + 3600
    return keys

def verify_id_token(id_token):
    if not id_token:
        return None
        
    # 1. Intentar verificar usando firebase-admin si se cuenta con Service Account y está inicializado
    if HAS_SERVICE_ACCOUNT and firebase_admin._apps:
        try:
            decoded_token = auth.verify_id_token(id_token)
            return decoded_token.get("uid")
        except Exception as e:
            # Fallback a verificación manual por PyJWT en cualquier error de firebase-admin
            print(f"firebase-admin falló (se intentará PyJWT): {e}")

    # 2. Si firebase-admin no tiene credenciales válidas, realizar la verificación criptográfica manual con PyJWT
    try:
        unverified_header = jwt.get_unverified_header(id_token)
        kid = unverified_header.get("kid")
        if not kid:
            print("Token no contiene 'kid' en la cabecera.")
            return None
            
        public_keys = get_google_public_keys()
        cert_pem = public_keys.get(kid)
        if not cert_pem:
            print(f"No se encontró la llave pública de Google para el kid: {kid}")
            return None
            
        cert_obj = load_pem_x509_certificate(cert_pem.encode('utf-8'))
        public_key = cert_obj.public_key()
        decoded = jwt.decode(
            id_token,
            public_key,
            algorithms=["RS256"],
            audience=PROJECT_ID,
            issuer=f"https://securetoken.google.com/{PROJECT_ID}",
            leeway=60
        )
        return decoded.get("user_id") or decoded.get("sub")
    except Exception as e:
        print(f"Error en verificación manual de ID Token: {e}")
        # En desarrollo local o pruebas, si se permite usar tokens mock decodificados
        if os.environ.get("FLASK_ENV") == "development" or os.environ.get("ALLOW_MOCK_TOKENS") == "true":
            try:
                import base64
                parts = id_token.split(".")
                if len(parts) == 3:
                    payload = parts[1]
                    payload += "=" * ((4 - len(payload) % 4) % 4)
                    decoded_mock = base64.urlsafe_b64decode(payload).decode("utf-8")
                    data = json.loads(decoded_mock)
                    return data.get("user_id") or data.get("sub")
            except Exception:
                pass
        return None

def resolve_collection_path(collection, uid):
    if not uid:
        raise Exception("UID inválido al resolver la colección de base de datos.")
    if collection.startswith("users/"):
        return collection
    if collection in ["users", "usuarios", "comercios"]:
        return collection
    if collection == "products":
        return f"users/{uid}/products"
    elif collection == "sales":
        return f"users/{uid}/sales"
    elif collection == "integrations":
        return f"users/{uid}/integrations"
    else:
        return f"users/{uid}/{collection}"

def get_document(collection, doc_id, id_token):
    uid = verify_id_token(id_token)
    if not uid:
        raise Exception("Token de autenticación inválido o expirado.")
    resolved_path = resolve_collection_path(collection, uid)
    url = f"{BASE_URL}/{resolved_path}/{doc_id}"
    headers = {"Authorization": f"Bearer {id_token}"}
    r = requests.get(url, headers=headers, timeout=30)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return from_firestore_document(r.json())

def list_documents(collection, id_token):
    uid = verify_id_token(id_token)
    if not uid:
        raise Exception("Token de autenticación inválido o expirado.")
    resolved_path = resolve_collection_path(collection, uid)
    
    parts = resolved_path.split("/")
    if len(parts) >= 2:
        parent_path = "/".join(parts[:-1])
        collection_id = parts[-1]
        url = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/{DATABASE_ID}/documents/{parent_path}:runQuery"
    else:
        collection_id = resolved_path
        url = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/{DATABASE_ID}/documents:runQuery"
        
    headers = {"Authorization": f"Bearer {id_token}"}
    payload = {
        "structuredQuery": {
            "from": [{"collectionId": collection_id}]
        }
    }
    r = requests.post(url, json=payload, headers=headers, timeout=30)
    if r.status_code == 404:
        return []
    r.raise_for_status()
    res = r.json()
    documents = []
    for item in res:
        doc = item.get("document")
        if doc:
            documents.append(from_firestore_document(doc))
    return documents

def set_document(collection, doc_id, data, id_token):
    uid = verify_id_token(id_token)
    if not uid:
        raise Exception("Token de autenticación inválido o expirado.")
    resolved_path = resolve_collection_path(collection, uid)
    url = f"{BASE_URL}/{resolved_path}/{doc_id}"
    headers = {"Authorization": f"Bearer {id_token}"}
    payload = to_firestore_fields(data)
    r = requests.patch(url, json=payload, headers=headers, timeout=30)
    r.raise_for_status()
    return from_firestore_document(r.json())

def delete_document(collection, doc_id, id_token):
    uid = verify_id_token(id_token)
    if not uid:
        raise Exception("Token de autenticación inválido o expirado.")
    resolved_path = resolve_collection_path(collection, uid)
    url = f"{BASE_URL}/{resolved_path}/{doc_id}"
    headers = {"Authorization": f"Bearer {id_token}"}
    r = requests.delete(url, headers=headers, timeout=30)
    if r.status_code == 404:
        return False
    r.raise_for_status()
    return True
