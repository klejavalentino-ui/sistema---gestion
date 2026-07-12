import json
import requests
import sys
import time

# Firebase API details
OLD_PROJECT_ID = "gen-lang-client-0785712480"
OLD_API_KEY = "AIzaSyDVfiUpcdT6GN7a900vABflnmBLRQOUAA8"
OLD_DATABASE_ID = "ai-studio-08d8ed07-4907-4b62-b5af-0894f4a262f1"

NEW_PROJECT_ID = "datamargen"
NEW_API_KEY = "AIzaSyDEF951QOsOJSuPZAAgAZJOzAwbLyO85Ro"
NEW_DATABASE_ID = "(default)"

def to_firestore_value(val):
    if isinstance(val, bool):
        return {"booleanValue": val}
    elif isinstance(val, str):
        return {"stringValue": val}
    elif isinstance(val, (int, float)):
        if isinstance(val, bool):
            return {"booleanValue": val}
        if isinstance(val, int):
            return {"integerValue": str(val)}
        else:
            return {"doubleValue": val}
    elif isinstance(val, list):
        if not val:
            return {"arrayValue": {}}
        return {"arrayValue": {"values": [to_firestore_value(v) for v in val]}}
    elif isinstance(val, dict):
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
            return str(v)
        elif k == "booleanValue":
            return bool(v)
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

def from_firestore_document(doc):
    if not doc:
        return {}
    fields = doc.get("fields", {})
    data = {}
    for k, v in fields.items():
        data[k] = from_firestore_value(v)
    name = doc.get("name", "")
    if name:
        data["id"] = name.split("/")[-1]
    return data

def to_firestore_fields(data):
    clean_data = {k: v for k, v in data.items() if k != "id"}
    return {"fields": {k: to_firestore_value(v) for k, v in clean_data.items()}}

def run():
    print("==================================================")
    print("MIGRACION DE DATOS - DATAMARGEN")
    print("==================================================")
    
    if len(sys.argv) >= 3:
        email = sys.argv[1].strip()
        password = sys.argv[2].strip()
    else:
        email = input("Ingresa tu correo (el de Matias o Valentino): ").strip()
        password = input("Ingresa tu contraseña: ").strip()
    
    # 1. Sign in to old Firebase
    print("\nIniciando sesión en la base de datos vieja...")
    auth_url_old = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={OLD_API_KEY}"
    payload = {"email": email, "password": password, "returnSecureToken": True}
    res_old = requests.post(auth_url_old, json=payload)
    if not res_old.ok:
        print(f"Error al iniciar sesión en base vieja: {res_old.json().get('error', {}).get('message')}")
        sys.exit(1)
        
    user_old = res_old.json()
    old_token = user_old["idToken"]
    old_uid = user_old["localId"]
    print(f"Sesión en base vieja exitosa. UID: {old_uid}")
    
    # 2. Register/Sign in to new Firebase
    print("\nIniciando/Registrando sesión en la base de datos nueva...")
    auth_url_new_signup = f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={NEW_API_KEY}"
    res_new = requests.post(auth_url_new_signup, json=payload)
    if not res_new.ok:
        error_msg = res_new.json().get('error', {}).get('message')
        if error_msg == "EMAIL_EXISTS":
            auth_url_new_signin = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={NEW_API_KEY}"
            res_new = requests.post(auth_url_new_signin, json=payload)
            
    if not res_new.ok:
        print(f"Error al iniciar/registrar en base nueva: {res_new.json().get('error', {}).get('message')}")
        sys.exit(1)
        
    user_new = res_new.json()
    new_token = user_new["idToken"]
    new_uid = user_new["localId"]
    print(f"Sesión en base nueva exitosa. UID: {new_uid}")
    
    collections = ["products", "sales", "integrations"]
    
    for col in collections:
        print(f"\nProcesando colección: {col}...")
        
        old_url = f"https://firestore.googleapis.com/v1/projects/{OLD_PROJECT_ID}/databases/{OLD_DATABASE_ID}/documents/users/{old_uid}:runQuery"
        query_payload = {
            "structuredQuery": {
                "from": [{"collectionId": col}]
            }
        }
        headers_old = {"Authorization": f"Bearer {old_token}"}
        r_old = requests.post(old_url, json=query_payload, headers=headers_old)
        
        if r_old.status_code == 404:
            print(f"Colección {col} no encontrada en base vieja.")
            continue
            
        r_old.raise_for_status()
        res_docs = r_old.json()
        
        documents = []
        for item in res_docs:
            doc = item.get("document")
            if doc:
                documents.append(from_firestore_document(doc))
                
        print(f"Encontrados {len(documents)} documentos en {col}.")
        
        headers_new = {"Authorization": f"Bearer {new_token}"}
        uploaded_count = 0
        for idx, doc in enumerate(documents, 1):
            doc_id = doc.get("id")
            if not doc_id:
                continue
            
            new_url = f"https://firestore.googleapis.com/v1/projects/{NEW_PROJECT_ID}/databases/{NEW_DATABASE_ID}/documents/users/{new_uid}/{col}/{doc_id}"
            payload_new = to_firestore_fields(doc)
            
            # Retry mechanism
            success = False
            for attempt in range(3):
                try:
                    r_new = requests.patch(new_url, json=payload_new, headers=headers_new, timeout=15)
                    if r_new.ok:
                        success = True
                        break
                    else:
                        print(f"[{attempt+1}/3] Error subiendo {doc_id} (HTTP {r_new.status_code}): {r_new.text[:200]}")
                except Exception as e:
                    print(f"[{attempt+1}/3] Excepcion de conexion al subir {doc_id}: {str(e)[:200]}")
                time.sleep(1)
            
            if success:
                uploaded_count += 1
                if idx % 50 == 0:
                    print(f"Progreso {col}: {idx}/{len(documents)} subidos...")
            else:
                print(f"Falla definitiva al subir {doc_id} a {col}.")
            
            # Small delay to avoid overloading Firestore REST API
            time.sleep(0.05)
                
        print(f"Subidos {uploaded_count}/{len(documents)} documentos exitosamente a la colección {col}.")
        
    print("\n==================================================")
    print("MIGRACION COMPLETADA EXITOSAMENTE!")
    print("==================================================")
    print("Ya puedes ingresar a la web https://datamargen.com con tu cuenta y veras todos tus datos.")

if __name__ == "__main__":
    run()
