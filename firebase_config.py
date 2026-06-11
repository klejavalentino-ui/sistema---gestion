import json
import os
import requests

# Buscar el archivo de configuración en la ubicación del proyecto
possible_paths = [
    os.path.join(os.path.dirname(__file__), 'mazo', 'firebase-applet-config.json'),
    os.path.join(os.path.dirname(__file__), 'firebase-applet-config.json'),
    'firebase-applet-config.json'
]

fb_config = None
for path in possible_paths:
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                fb_config = json.load(f)
            break
        except Exception as e:
            print(f"Error cargando {path}: {e}")

if not fb_config:
    # Si no se encuentra en las rutas relativas locales, intentamos buscar en el directorio actual
    raise FileNotFoundError("No se encontró el archivo 'firebase-applet-config.json' en la estructura del proyecto.")

API_KEY = fb_config['apiKey']
PROJECT_ID = fb_config['projectId']
DATABASE_ID = fb_config.get('firestoreDatabaseId', '(default)')
BASE_URL = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/{DATABASE_ID}/documents"

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
    r = requests.post(url, json=payload)
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
    r = requests.post(url, json=payload)
    if not r.ok:
        error_msg = r.json().get("error", {}).get("message", "Error desconocido en el registro.")
        raise Exception(error_msg)
    return r.json()

# --- Métodos de Firestore CRUD ---

def get_document(collection, doc_id, id_token):
    url = f"{BASE_URL}/{collection}/{doc_id}"
    headers = {"Authorization": f"Bearer {id_token}"}
    r = requests.get(url, headers=headers)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return from_firestore_document(r.json())

def list_documents(collection, id_token):
    url = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/{DATABASE_ID}/documents:runQuery"
    headers = {"Authorization": f"Bearer {id_token}"}
    payload = {
        "structuredQuery": {
            "from": [{"collectionId": collection}]
        }
    }
    r = requests.post(url, json=payload, headers=headers)
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
    url = f"{BASE_URL}/{collection}/{doc_id}"
    headers = {"Authorization": f"Bearer {id_token}"}
    payload = to_firestore_fields(data)
    r = requests.patch(url, json=payload, headers=headers)
    r.raise_for_status()
    return from_firestore_document(r.json())

def delete_document(collection, doc_id, id_token):
    url = f"{BASE_URL}/{collection}/{doc_id}"
    headers = {"Authorization": f"Bearer {id_token}"}
    r = requests.delete(url, headers=headers)
    if r.status_code == 404:
        return False
    r.raise_for_status()
    return True
