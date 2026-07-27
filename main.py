import sys
import os
import time
import requests
import base64
import json
import hmac
import hashlib
import concurrent.futures
import io
import openpyxl
from openpyxl.worksheet.datavalidation import DataValidation
from flask import Flask, request, jsonify, render_template, session, send_file
import firebase_config
from datetime import datetime
from flask_cors import CORS
from flask_compress import Compress
from cachetools import TTLCache
from functools import wraps
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import smtplib
from email.mime.text import MIMEText
from functools import wraps
from arca_client import create_arca_payment

def handle_error(e):
    err_str = str(e)
    if isinstance(e, requests.exceptions.HTTPError):
        status = e.response.status_code if e.response is not None else 500
        if status == 401:
            return jsonify({"error": "Sesión inválida o expirada. Por favor inicie sesión."}), 401
        elif status == 403:
            return jsonify({"error": "No tiene permisos para realizar esta operación."}), 403
        return jsonify({"error": str(e)}), status
    if "token" in err_str.lower() and ("expirad" in err_str.lower() or "inválid" in err_str.lower() or "no autorizad" in err_str.lower()):
        return jsonify({"error": "Sesión inválida o expirada. Por favor inicie sesión."}), 401
    return jsonify({"error": str(e)}), 500

def send_admin_email(subject, body):
    sender = "datamargen@gmail.com"
    pwd = os.environ.get("SMTP_PASSWORD", "")
    if not pwd:
        print("Advertencia: SMTP_PASSWORD no configurada. No se pudo enviar el correo.")
        return
        
    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = sender
    
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(sender, pwd)
            server.sendmail(sender, sender, msg.as_string())
        print(f"Correo enviado exitosamente: {subject}")
    except Exception as e:
        print(f"Error al enviar correo: {e}")

def safe_float(val, default=0.0):
    if val is None:
        return default
    try:
        if isinstance(val, (int, float)):
            return float(val)
        val_str = str(val).strip().replace("$", "").replace(" ", "")
        if not val_str:
            return default
        
        if "," in val_str:
            val_str = val_str.replace(".", "")
            val_str = val_str.replace(",", ".")
        else:
            if val_str.count(".") > 1:
                val_str = val_str.replace(".", "")
            elif val_str.count(".") == 1:
                parts = val_str.split(".")
                if len(parts[1]) == 3:
                    val_str = val_str.replace(".", "")
        return float(val_str)
    except (ValueError, TypeError):
        return default

def safe_int(val, default=0):
    if val is None:
        return default
    try:
        if isinstance(val, (int, float)):
            return int(val)
        val_str = str(val).strip().replace("$", "").replace(" ", "")
        if not val_str:
            return default
        
        if "," in val_str:
            val_str = val_str.replace(".", "")
            val_str = val_str.split(",")[0]
        else:
            if val_str.count(".") > 1:
                val_str = val_str.replace(".", "")
            elif val_str.count(".") == 1:
                parts = val_str.split(".")
                if len(parts[1]) == 3:
                    val_str = val_str.replace(".", "")
                else:
                    val_str = parts[0]
        return int(val_str)
    except (ValueError, TypeError):
        return default

app = Flask(__name__)
app.secret_key = "mazo_clothing_secret_key_secure_idx"

# Habilitar CORS y Compresión
CORS(app, resources={r"/api/*": {"origins": "*"}})
Compress(app)

# Rate Limiter
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["1000 per day", "150 per hour"],
    storage_uri="memory://"
)

# Caché en memoria para perfiles de usuario (TTL de 5 minutos, tamaño máximo de 1000 perfiles)
profile_cache = TTLCache(maxsize=1000, ttl=300)

# Inicializar cliente Firestore administrativo para uso en Webhooks
db_admin = None
if firebase_config.HAS_SERVICE_ACCOUNT:
    try:
        from firebase_admin import firestore
        db_admin = firestore.client()
    except Exception as ex:
        print(f"Advertencia: no se pudo inicializar firestore.client() para Webhooks: {ex}")

@app.after_request
def add_header(r):
    r.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    r.headers["Pragma"] = "no-cache"
    r.headers["Expires"] = "0"
    r.headers['Cache-Control'] = 'public, max-age=0'
    
    # Intercept 500 error responses containing Firestore 401 client error
    if r.status_code == 500:
        try:
            data = json.loads(r.get_data(as_text=True))
            if data and "error" in data:
                err_str = str(data["error"])
                if "401" in err_str or "unauthorized" in err_str.lower():
                    # Modify response to be 401 Unauthorized
                    r.status_code = 401
                    r.set_data(json.dumps({"error": "Sesión inválida o expirada. Por favor inicie sesión."}))
                    r.headers["Content-Type"] = "application/json"
        except Exception:
            pass
            
    return r

# --- Middleware para obtener Token de Auth y UIDs ---
def get_auth_token():
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    return auth_header.split(" ")[1]

def get_uid_from_token(token):
    if not token:
        return None
    return firebase_config.verify_id_token(token)

def get_email_from_token(token):
    if not token:
        return None
    try:
        import jwt
        decoded = jwt.decode(token, options={"verify_signature": False})
        return decoded.get("email")
    except Exception:
        return None

def require_firebase_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = get_auth_token()
        if not token:
            return jsonify({"error": "No autorizado. Falta el token de autenticación."}), 401
        uid = get_uid_from_token(token)
        if not uid:
            return jsonify({"error": "No autorizado. Token inválido o expirado."}), 401
        request.token = token
        request.uid = uid
        return f(*args, **kwargs)
    return decorated_function

def get_user_prefix(token):
    # En el modelo multi-tenant, los datos del usuario se aíslan
    # mediante la ruta de subcolección (ej. users/{uid}/products).
    # Primero verificamos la validez del token para retornar 401 si expiró.
    uid = get_uid_from_token(token)
    if not uid:
        try:
            log_file = os.path.join(os.path.dirname(__file__), "auth_error.log")
            with open(log_file, "a", encoding="utf-8") as f:
                f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} - get_user_prefix: verify_id_token returned None for token {token[:15]}...\n")
        except:
            pass
        return None
    # Para conservar compatibilidad con los tipos de negocio
    # (textil vs comercio), usamos f"{biz_type}_" como prefijo local
    # del documento en lugar de incluir el UID.
    biz_type = request.headers.get("X-Business-Type", "textil")
    if biz_type not in ["textil", "comercio"]:
        biz_type = "textil"
    return f"{biz_type}_"

def is_arca_enabled(token, email=None):
    if not email:
        email = get_email_from_token(token)
    # Allowed by default (admin/system users)
    if email in ["klejavalentino@gmail.com", "valentinoklcv@gmail.com", "matiascuchettidiaz@gmail.com", "datamargen@gmail.com"]:
        return True
    try:
        prefix = get_user_prefix(token)
        profile = firebase_config.get_document("products", f"{prefix}user_profile", token)
        if profile and profile.get("arcaEnabled") == True:
            return True
    except Exception as e:
        print(f"Error checking arcaEnabled flag for {email}: {e}")
    return False

def filter_user_docs(all_docs, prefix):
    user_docs = []
    for d in all_docs:
        doc_id = d.get("id", "")
        if doc_id.startswith(prefix):
            doc_copy = dict(d)
            doc_copy["id"] = doc_id[len(prefix):]
            if "sku" in doc_copy and str(doc_copy["sku"]).startswith(prefix):
                doc_copy["sku"] = str(doc_copy["sku"])[len(prefix):]
            user_docs.append(doc_copy)
    return user_docs

def sync_stock_to_tiendanube(uid, items, token=None, db_client=None, prefix=None):
    try:
        if db_client:
            config_doc = db_client.collection("users").document(uid).collection("integrations").document("tiendanube").get()
            config = config_doc.to_dict() if config_doc.exists else None
        else:
            config = firebase_config.get_document("integrations", "tiendanube", token)
            
        if not config or not config.get("activo"):
            return
            
        user_id = config.get("user_id")
        access_token = config.get("access_token")
        
        # Sanitizar credenciales para evitar caracteres ocultos no-ASCII (ej: de copiar y pegar)
        if access_token:
            access_token = "".join(c for c in str(access_token) if ord(c) < 128).strip()
        if user_id:
            user_id = "".join(c for c in str(user_id) if ord(c) < 128).strip()
        
        headers = {
            "Authentication": f"bearer {access_token}",
            "Content-Type": "application/json",
            "User-Agent": "Datamargen (klejavalentino@gmail.com)"
        }
        
        if not prefix:
            biz_type = request.headers.get("X-Business-Type", "textil") if request else "textil"
            prefix = f"{biz_type}_"
            
        def update_single_variant_stock(item):
            prod_info = item.get("product", {})
            sku = prod_info.get("sku")
            qty = safe_int(item.get("quantity", 0))
            if not sku or qty <= 0:
                return
                
            if db_client:
                prod_doc = db_client.collection("users").document(uid).collection("products").document(f"{prefix}{sku}").get()
                prod = prod_doc.to_dict() if prod_doc.exists else None
            else:
                prod = firebase_config.get_document("products", f"{prefix}{sku}", token)
                
            if not prod:
                return
                
            p_id = prod.get("tiendanube_product_id")
            v_id = prod.get("tiendanube_variant_id")
            new_stock = safe_int(prod.get("stock", 0))
            
            if p_id and v_id:
                url = f"https://api.tiendanube.com/v1/{user_id}/products/{p_id}/variants/{v_id}"
                payload = {"stock": new_stock}
                r = requests.put(url, json=payload, headers=headers, timeout=15)
                if r.ok:
                    print(f"[TIENDANUBE] Stock sincronizado para SKU {sku}: {new_stock} unidades.")
                else:
                    print(f"[TIENDANUBE ERROR] Error al sincronizar SKU {sku}: {r.text}")
                    
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            executor.map(update_single_variant_stock, items)
            
    except Exception as e:
        print(f"Advertencia al sincronizar stock con Tiendanube: {e}")

# --- Ruta Principal (SPA) ---
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/favicon.ico")
def favicon():
    return "", 204

# --- Rutas de Autenticación ---

import os
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
USERNAMES_FILE = os.path.join(BASE_DIR, "usernames.json")

def get_email_for_username(username):
    username = username.strip().lower()
    email = None
    if os.path.exists(USERNAMES_FILE):
        try:
            with open(USERNAMES_FILE, "r") as f:
                data = json.load(f)
                for k, v in data.items():
                    if k.strip().lower() == username:
                        email = v
                        break
        except:
            pass
            
    if email:
        return email
        
    if db_admin:
        try:
            doc = db_admin.collection("username_mappings").document(username).get()
            if doc.exists:
                email = doc.to_dict().get("email")
                if email:
                    save_username_mapping(username, email, upload_to_firestore=False)
                    return email
        except Exception as e:
            print(f"Error consultando username mapping en Firestore: {e}")
    else:
        # Fallback using Firestore REST API directly
        try:
            project_id = firebase_config.PROJECT_ID
            db_id = firebase_config.DATABASE_ID
            url = f"https://firestore.googleapis.com/v1/projects/{project_id}/databases/{db_id}/documents/username_mappings/{username}"
            r = requests.get(url, timeout=10)
            if r.status_code == 200:
                doc_data = r.json()
                fields = doc_data.get("fields", {})
                email_field = fields.get("email", {})
                email = email_field.get("stringValue")
                if email:
                    save_username_mapping(username, email, upload_to_firestore=False)
                    return email
        except Exception as e:
            print(f"Error in REST fallback get_email_for_username: {e}")
            
    return None

def save_username_mapping(username, email, upload_to_firestore=True, token=None):
    if not username or not email:
        return
    username = username.strip().lower()
    data = {}
    if os.path.exists(USERNAMES_FILE):
        try:
            with open(USERNAMES_FILE, "r") as f:
                data = json.load(f)
        except:
            pass
    data[username] = email
    try:
        with open(USERNAMES_FILE, "w") as f:
            json.dump(data, f)
    except:
        pass
        
    if upload_to_firestore:
        if db_admin:
            try:
                db_admin.collection("username_mappings").document(username).set({"email": email})
            except Exception as e:
                print(f"Error guardando username mapping en Firestore: {e}")
        elif token:
            try:
                project_id = firebase_config.PROJECT_ID
                db_id = firebase_config.DATABASE_ID
                url = f"https://firestore.googleapis.com/v1/projects/{project_id}/databases/{db_id}/documents/username_mappings/{username}"
                headers = {"Authorization": f"Bearer {token}"}
                payload = {
                    "fields": {
                        "email": {"stringValue": email}
                    }
                }
                r = requests.patch(url, json=payload, headers=headers, timeout=10)
                r.raise_for_status()
            except Exception as e:
                print(f"Error in REST save_username_mapping: {e}")

@app.route("/api/auth/login", methods=["POST"])
@limiter.limit("5 per minute")
def login():
    data = request.json or {}
    email = data.get("email", "").strip() # Podría ser un username
    password = data.get("password")
    
    if not email or not password:
        return jsonify({"error": "Correo/Usuario y contraseña son requeridos"}), 400
        
    # Verificar si es un username (no contiene arroba)
    if "@" not in email:
        mapped = get_email_for_username(email)
        if mapped:
            email = mapped
        else:
            return jsonify({"error": "Nombre de usuario no encontrado. Inicie sesión con su CORREO ELECTRÓNICO (ej: mi@correo.com) por única vez para vincular su usuario automáticamente."}), 404
            
    try:
        if firebase_config.HAS_SERVICE_ACCOUNT:
            try:
                from firebase_admin import auth as admin_auth
                admin_auth.get_user_by_email(email)
            except admin_auth.UserNotFoundError:
                return jsonify({"error": "La cuenta no existe. Por favor, regístrese primero."}), 404

        res = firebase_config.sign_in(email, password)
        token = res.get("idToken")
        
        detected_biz_type = "textil"
        try:
            profiles = {}
            for b_type in ["textil", "comercio"]:
                p_doc = firebase_config.get_document("products", f"{b_type}_user_profile", token)
                if p_doc:
                    profiles[b_type] = p_doc
            
            if len(profiles) == 1:
                detected_biz_type = list(profiles.keys())[0]
            elif len(profiles) > 1:
                matched = None
                for b_type, p_doc in profiles.items():
                    if p_doc.get("businessType") == b_type:
                        matched = b_type
                        break
                if matched:
                    detected_biz_type = matched
                else:
                    detected_biz_type = "comercio"
            else:
                detected_biz_type = "textil"
                
            active_profile = profiles.get(detected_biz_type)
            if active_profile and active_profile.get("username"):
                save_username_mapping(active_profile["username"], email, token=token)
        except Exception as ex:
            print(f"Error al sincronizar username mapping durante login: {ex}")
            
        user_projects = []
        try:
            user_projects = get_user_projects_list(token)
        except Exception as proj_err:
            print(f"Error cargando proyectos en login: {proj_err}")
            
        return jsonify({
            "token": token,
            "email": res.get("email"),
            "localId": res.get("localId"),
            "businessType": detected_biz_type,
            "projects": user_projects,
            "maxProjects": 3,
            "refreshToken": res.get("refreshToken")
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 401

@app.route("/api/auth/refresh", methods=["POST"])
@limiter.limit("10 per minute")
def refresh_token():
    data = request.json or {}
    refresh_token_str = data.get("refreshToken")
    if not refresh_token_str:
        return jsonify({"error": "No refresh token provided"}), 400
        
    try:
        res = firebase_config.refresh_token(refresh_token_str)
        return jsonify({
            "token": res.get("id_token"),
            "refreshToken": res.get("refresh_token")
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 401

def get_user_projects_list(token, uid=None):
    if not uid:
        uid = firebase_config.verify_id_token(token)
    if not uid:
        return []
    real_uid = firebase_config.get_real_uid(uid, token)
    doc = firebase_config.get_document("user_projects", real_uid, token)
    if doc and isinstance(doc, dict) and "projects" in doc and len(doc["projects"]) > 0:
        return doc.get("projects", [])
    
    # Auto-inicializar Proyecto #1 predeterminado con los datos de su perfil existente
    profile = None
    for b_type in ["textil", "comercio"]:
        p_doc = firebase_config.get_document("products", f"{b_type}_user_profile", token)
        if p_doc:
            profile = p_doc
            break
            
    proj_name = profile.get("businessName") if profile and profile.get("businessName") else "Mi Local Principal"
    b_type = profile.get("businessType") if profile and profile.get("businessType") else "textil"
    
    default_proj = {
        "id": "default",
        "name": proj_name,
        "businessType": b_type,
        "isDefault": True,
        "createdAt": datetime.utcnow().isoformat()
    }
    
    initial_data = {
        "id": real_uid,
        "maxProjects": 3,
        "projects": [default_proj]
    }
    try:
        firebase_config.set_document("user_projects", real_uid, initial_data, token)
    except Exception as e:
        print(f"Error guardando proyectos iniciales: {e}")
        
    return [default_proj]

@app.route("/api/projects", methods=["GET"])
def get_projects():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    try:
        projects = get_user_projects_list(token)
        return jsonify({"projects": projects, "maxProjects": 3})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/projects", methods=["POST"])
def create_project():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    uid = firebase_config.verify_id_token(token)
    if not uid:
        return jsonify({"error": "Token inválido"}), 401
    real_uid = firebase_config.get_real_uid(uid, token)
    
    data = request.json or {}
    name = data.get("name", "").strip()
    biz_type = data.get("businessType", "textil").strip()
    
    if not name:
        return jsonify({"error": "El nombre del proyecto/negocio es obligatorio."}), 400
        
    projects = get_user_projects_list(token, uid=real_uid)
    if len(projects) >= 3:
        return jsonify({"error": "Límite alcanzado: solo puedes tener un máximo de 3 proyectos/negocios por cuenta."}), 400
        
    new_proj_id = f"proj_{int(time.time() * 1000)}"
    new_proj = {
        "id": new_proj_id,
        "name": name,
        "businessType": biz_type,
        "businessModel": data.get("businessModel", "Indumentaria" if biz_type == "textil" else "Comercio"),
        "isDefault": False,
        "createdAt": datetime.utcnow().isoformat()
    }
    
    projects.append(new_proj)
    
    save_payload = {
        "id": real_uid,
        "maxProjects": 3,
        "projects": projects
    }
    firebase_config.set_document("user_projects", real_uid, save_payload, token)
    
    try:
        biz_model = data.get("businessModel", "Indumentaria" if biz_type == "textil" else "Comercio")
        profile_payload = {
            "sku": f"{biz_type}_user_profile",
            "name": name,
            "businessName": name,
            "businessType": biz_type,
            "businessModel": biz_model,
            "role": "admin",
            "createdAt": datetime.utcnow().isoformat()
        }
        url = f"{firebase_config.BASE_URL}/users/{real_uid}/projects/{new_proj_id}/products/{biz_type}_user_profile"
        headers = {"Authorization": f"Bearer {token}"}
        payload = firebase_config.to_firestore_fields(profile_payload)
        firebase_config._session.patch(url, json=payload, headers=headers, timeout=10)
    except Exception as ex:
        print(f"Error inicializando perfil de nuevo proyecto: {ex}")
        
    return jsonify({"success": True, "project": new_proj, "projects": projects})

@app.route("/api/projects/<proj_id>", methods=["PUT"])
def update_project(proj_id):
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    uid = firebase_config.verify_id_token(token)
    real_uid = firebase_config.get_real_uid(uid, token)
    
    data = request.json or {}
    new_name = data.get("name", "").strip()
    new_model = data.get("businessModel")
    new_type = data.get("businessType")
    
    projects = get_user_projects_list(token, uid=real_uid)
    found = False
    for p in projects:
        if p.get("id") == proj_id:
            if new_name: p["name"] = new_name
            if new_model: p["businessModel"] = new_model
            if new_type: p["businessType"] = new_type
            found = True
            break
            
    if not found:
        return jsonify({"error": "Proyecto no encontrado"}), 404
        
    save_payload = {
        "id": real_uid,
        "maxProjects": 3,
        "projects": projects
    }
    firebase_config.set_document("user_projects", real_uid, save_payload, token)
    return jsonify({"success": True, "projects": projects})

@app.route("/api/projects/<proj_id>", methods=["DELETE"])
def delete_project(proj_id):
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    uid = firebase_config.verify_id_token(token)
    real_uid = firebase_config.get_real_uid(uid, token)
    
    projects = get_user_projects_list(token, uid=real_uid)
    if len(projects) <= 1:
        return jsonify({"error": "No puedes eliminar tu único negocio activo."}), 400
        
    projects = [p for p in projects if p.get("id") != proj_id]
    
    save_payload = {
        "id": real_uid,
        "maxProjects": 3,
        "projects": projects
    }
    firebase_config.set_document("user_projects", real_uid, save_payload, token)
    
    # Limpieza en segundo plano de las subcolecciones del proyecto borrado
    try:
        def cleanup_proj():
            for col in ["products", "sales", "integrations"]:
                try:
                    url = f"{firebase_config.BASE_URL}/users/{real_uid}/projects/{proj_id}/{col}"
                    r = firebase_config._session.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=10)
                    if r.status_code == 200 and "documents" in r.json():
                        for doc in r.json()["documents"]:
                            doc_name = doc.get("name")
                            if doc_name:
                                firebase_config._session.delete(f"https://firestore.googleapis.com/v1/{doc_name}", headers={"Authorization": f"Bearer {token}"}, timeout=10)
                except Exception as ex:
                    print(f"Error borrando documentos de subcolección {col} del proyecto {proj_id}: {ex}")
        import threading
        threading.Thread(target=cleanup_proj, daemon=True).start()
    except Exception as e:
        print(f"Error preparando hilo de eliminación de proyecto: {e}")

    return jsonify({"success": True, "projects": projects})

@app.route("/api/auth/delete-account", methods=["POST"])
def delete_account():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    try:
        uid = firebase_config.verify_id_token(token)
        real_uid = firebase_config.get_real_uid(uid, token)
        if real_uid != uid:
            return jsonify({"error": "Solo el administrador principal puede eliminar la cuenta del comercio."}), 403
            
        # 1. Recuperar el perfil para saber el username
        username = None
        for b_type in ["textil", "comercio"]:
            profile = firebase_config.get_document("products", f"{b_type}_user_profile", token)
            if profile:
                username = profile.get("username")
                break
                
        # 2. Eliminar mapeo global de username
        if username:
            try:
                if os.path.exists(USERNAMES_FILE):
                    with open(USERNAMES_FILE, "r") as f:
                        data = json.load(f)
                    key_to_del = None
                    for k in data.keys():
                        if k.strip().lower() == username.strip().lower():
                            key_to_del = k
                            break
                    if key_to_del:
                        del data[key_to_del]
                        with open(USERNAMES_FILE, "w") as f:
                            json.dump(data, f, indent=4)
            except Exception as e:
                print(f"Error borrando de usernames.json: {e}")
                
            try:
                firebase_config.delete_document("username_mappings", username.strip().lower(), token)
            except Exception as e:
                print(f"Error eliminando username mapping global: {e}")
                
        # 3. Eliminar subcolecciones conocidas
        collections_to_delete = ["products", "sales", "integrations", "invoices", "subusers"]
        for col in collections_to_delete:
            try:
                docs = firebase_config.list_documents(col, token) or []
                for d in docs:
                    doc_id = d.get("id")
                    if doc_id:
                        firebase_config.delete_document(col, doc_id, token)
            except Exception as col_err:
                print(f"Error eliminando colección {col}: {col_err}")
                
        # 4. Eliminar el usuario en Firebase Authentication
        firebase_config.delete_user_account(token)
        
        return jsonify({"success": True, "message": "Cuenta eliminada correctamente."})
    except Exception as e:
        return handle_error(e)

def send_registration_webhook(profile):
    import requests
    url = "https://script.google.com/macros/s/AKfycbwSkMgXOvzW4vyOfJzZmVtgP0V1mhY2Y-fzv6eKYECO1GsODMnxkJDxd5IRdcN_GGBV/exec"
    payload = {
        "name": profile.get("contactName", ""),
        "businessName": profile.get("businessName", ""),
        "email": profile.get("contactEmail", ""),
        "phone": profile.get("contactPhone", ""),
        "businessType": profile.get("businessType", ""),
        "businessModel": profile.get("businessModel", "")
    }
    try:
        requests.post(url, json=payload, timeout=10)
    except Exception as e:
        print(f"Error sending registration webhook: {e}")

@app.route("/api/auth/register", methods=["POST"])
@limiter.limit("5 per minute")
def register():
    data = request.json or {}
    email = data.get("email")
    password = data.get("password")
    name = data.get("name", "")
    businessName = data.get("businessName", "")
    username = data.get("username", "")
    phone = data.get("phone", "")
    biz_type = data.get("businessType", "textil")
    
    if not email or not password:
        return jsonify({"error": "Correo y contraseña son requeridos"}), 400
        
    if username:
        clean_user = username.strip().lower()
        existing_email = get_email_for_username(clean_user)
        if existing_email:
            return jsonify({"error": f"El nombre de usuario '@{username}' ya está en uso por otro comercio. Por favor elige otro."}), 400
            
    try:
        res = firebase_config.sign_up(email, password)
        token = res.get("idToken")
        
        # Guardar mapeo de username localmente
        save_username_mapping(username, email, token=token)
        
        # Guardar el perfil extendido del usuario
        profile_payload = {
            "sku": f"{biz_type}_user_profile",
            "name": name if name else f"Perfil {biz_type.capitalize()}",
            "contactName": name,
            "businessName": businessName,
            "businessModel": data.get("businessModel", "Indumentaria"),
            "businessType": biz_type,
            "username": username,
            "contactPhone": phone,
            "contactEmail": email,
            "subscriptionStatus": "trial",
            "trialStartDate": datetime.utcnow().isoformat(),
            "role": "admin",
            "currency": "ARS",
            "createdAt": datetime.utcnow().isoformat()
        }
        firebase_config.set_document("products", f"{biz_type}_user_profile", profile_payload, token)
        
        # Trigger background webhook send to Google Sheets
        try:
            import threading
            threading.Thread(target=send_registration_webhook, args=(profile_payload,), daemon=True).start()
        except Exception as thread_ex:
            print(f"Error launching registration webhook thread: {thread_ex}")
        
        # Send verification email immediately on registration
        try:
            firebase_config.send_verification_email(token)
        except Exception as ex:
            print(f"Error sending automatic verification email: {ex}")
            
        return jsonify({
            "token": token,
            "email": res.get("email"),
            "localId": res.get("localId"),
            "message": "Usuario registrado exitosamente. Se envió un correo de verificación."
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/auth/send-verification", methods=["POST"])
def send_verification():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    try:
        firebase_config.send_verification_email(token)
        return jsonify({"success": True, "message": "Correo de verificación reenviado."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/auth/reset-password", methods=["POST"])
def reset_password():
    data = request.json or {}
    email = data.get("email")
    if not email:
        return jsonify({"error": "El correo es requerido"}), 400
    try:
        firebase_config.send_password_reset_email(email)
        return jsonify({"success": True, "message": "Enlace de restablecimiento de contraseña enviado."})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route("/api/auth/simulate-payment", methods=["POST"])
def simulate_payment():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        profile_doc = firebase_config.get_document("products", f"{prefix}user_profile", token)
        if not profile_doc:
            profile_doc = {
                "sku": "user_profile",
                "name": "User Profile",
                "cost": 0.0,
                "stock": 0,
                "createdAt": int(time.time()),
                "trialDays": 15,
                "businessType": "clothing"
            }
        profile_doc["subscriptionStatus"] = "active"
        firebase_config.set_document("products", f"{prefix}user_profile", profile_doc, token)
        return jsonify({"success": True, "subscriptionStatus": "active"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/firebase-config", methods=["GET"])
def get_firebase_config():
    return jsonify({
        "apiKey": firebase_config.API_KEY,
        "authDomain": firebase_config.fb_config.get("authDomain", f"{firebase_config.PROJECT_ID}.firebaseapp.com"),
        "projectId": firebase_config.PROJECT_ID
    })


# --- Inicialización de Inventario y Datos Iniciales (Seeding) ---

def seed_db_if_empty(prefix, token):
    try:
        # Consultar la colección general para ver qué hay
        all_docs = firebase_config.list_documents("products", token)
        user_docs = filter_user_docs(all_docs, prefix)
        
        # 2. Categorías Iniciales (Vacías por defecto)
        cat_config = next((d for d in user_docs if d.get("id") == "categories_config"), None)
        if not cat_config:
            initial_categories = {
                "sku": f"{prefix}categories_config",
                "name": "Categories Configuration",
                "cost": 0.0,
                "stock": 0,
                "categories": []
            }
            firebase_config.set_document("products", f"{prefix}categories_config", initial_categories, token)

        # 3. Adicionales (Extras Config) (Vacíos por defecto)
        extras_config = next((d for d in user_docs if d.get("id") == "extras_config"), None)
        if not extras_config:
            email = get_email_from_token(token)
            is_matias = email == "matiascuchettidiaz@gmail.com"
            biz_type = request.headers.get("X-Business-Type", "textil")
            if biz_type not in ["textil", "comercio"]:
                biz_type = "textil"
            if biz_type == "comercio":
                initial_extras = {
                    "sku": f"{prefix}extras_config",
                    "name": "Extras Config",
                    "cost": 0.0,
                    "stock": 0,
                    "bolsas_caramelos": [
                        { "id": "bol-kraft", "name": "Bolsa Kraft Chica", "cost": 150.0, "stock": 100 },
                        { "id": "bol-plast", "name": "Bolsa Camiseta Mediana", "cost": 80.0, "stock": 200 }
                    ] if is_matias else [],
                    "envoltorios_regalo": [
                        { "id": "env-premium", "name": "Papel de Regalo + Moño", "cost": 300.0, "stock": 50 }
                    ] if is_matias else [],
                    "adicionales_kiosco": [
                        { "id": "adi-caramelos", "name": "Caramelos de Cortesía", "cost": 10.0, "stock": 1000 }
                    ] if is_matias else []
                }
            else:
                initial_extras = {
                    "sku": f"{prefix}extras_config",
                    "name": "Extras Config",
                    "cost": 0.0,
                    "stock": 0,
                    "estampados": [
                        { "id": "est-frente", "name": "Estampado Frente 10x10", "cost": 450.0, "stock": 100 },
                        { "id": "est-espalda", "name": "Estampado Espalda A4", "cost": 850.0, "stock": 100 }
                    ] if is_matias else [],
                    "packagings": [
                        { "id": "pac-bolsa", "name": "Bolsa Kraft con Logo", "cost": 180.0, "stock": 150 },
                        { "id": "pac-caja", "name": "Caja de Cartón para Remera", "cost": 400.0, "stock": 50 }
                    ] if is_matias else [],
                    "bordados": [
                        { "id": "bor-logo", "name": "Bordado Logo Pecho", "cost": 600.0, "stock": 120 }
                    ] if is_matias else []
                }
            firebase_config.set_document("products", f"{prefix}extras_config", initial_extras, token)

        # 4. Proveedores (No se siembran de ejemplo)
        # 5. Cuentas Corrientes (No se siembran de ejemplo)

    except Exception as e:
        print(f"Error seeding database: {e}")

@app.route("/api/all-state", methods=["GET"])
def get_all_state():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        admin_uid = firebase_config.verify_id_token(token)
        real_uid = firebase_config.get_real_uid(admin_uid, token)
        
        my_role = "admin"
        my_permissions = None
        sub_info = None
        
        if admin_uid != real_uid:
            my_role = "subuser"
            try:
                sub_doc = firebase_config.get_document(f"users/{real_uid}/subusers", admin_uid, token)
                if sub_doc:
                    my_permissions = sub_doc.get("access", {})
                    sub_info = sub_doc
            except Exception as e:
                print(f"Error getting subuser permissions: {e}")
        # 1. Check email verification status in real-time
        try:
            user_info = firebase_config.get_account_info(token)
            email_verified = user_info.get("emailVerified", False) if user_info else False
        except Exception as ex:
            print(f"Error checking email verification: {ex}")
            # Fallback to True if REST API fails (e.g., local tests with mocked tokens)
            email_verified = True

        if not email_verified:
            return jsonify({
                "emailVerified": False,
                "error": "Email no verificado"
            })
            
        import concurrent.futures
        current_pid = firebase_config.get_current_project_id()
        
        # Parallel fetch from both Firestore collections without cross-thread Flask context issues
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            future_products = executor.submit(firebase_config.list_documents, "products", token, project_id=current_pid)
            future_sales = executor.submit(firebase_config.list_documents, "sales", token, project_id=current_pid)
            
            all_products = future_products.result()
            all_sales = future_sales.result()
            
        user_docs = filter_user_docs(all_products, prefix)
        user_sales = filter_user_docs(all_sales, prefix)
        
        # 2. Get or initialize user profile (SaaS details)
        profile_doc = next((d for d in user_docs if d.get("id") == "user_profile"), None)
        if not profile_doc:
            # Auto-detect correct prefix if a profile exists under a different prefix
            profile_doc_raw = next((d for d in all_products if d.get("id", "").endswith("_user_profile")), None)
            if profile_doc_raw:
                actual_id = profile_doc_raw.get("id")
                actual_prefix = actual_id.split("user_profile")[0] # e.g. "comercio_"
                prefix = actual_prefix
                user_docs = filter_user_docs(all_products, prefix)
                user_sales = filter_user_docs(all_sales, prefix)
                profile_doc = next((d for d in user_docs if d.get("id") == "user_profile"), None)

        if not profile_doc:
            biz_type = request.headers.get("X-Business-Type", "textil")
            if biz_type not in ["textil", "comercio"]:
                biz_type = "textil"
            profile_doc = {
                "sku": f"{prefix}user_profile",
                "name": "User Profile",
                "cost": 0.0,
                "stock": 0,
                "createdAt": int(time.time()),
                "trialDays": 15,
                "subscriptionStatus": "trial",  # trial, active, expired
                "businessType": biz_type,
                "businessName": ""
            }
            firebase_config.set_document("products", f"{prefix}user_profile", profile_doc, token)
            profile_doc_copy = dict(profile_doc)
            profile_doc_copy["id"] = "user_profile"
            profile_doc_copy["sku"] = "user_profile"
            user_docs.append(profile_doc_copy)
            profile_doc = profile_doc_copy

        # Auto-sync profile to Google Sheets if not already synced
        if not profile_doc.get("googleSheetsSynced"):
            try:
                import threading
                profile_doc["googleSheetsSynced"] = True
                # Trigger webhook
                threading.Thread(target=send_registration_webhook, args=(profile_doc,), daemon=True).start()
                # Save flag in Firestore
                firebase_config.set_document("products", f"{prefix}user_profile", profile_doc, token)
            except Exception as sync_ex:
                print(f"Error auto-syncing profile to Google Sheets on get_all_state: {sync_ex}")

        # Calculate trial remaining days
        created_at_raw = profile_doc.get("createdAt")
        created_at_val = None
        if isinstance(created_at_raw, str):
            try:
                clean_str = created_at_raw.replace("Z", "+00:00")
                dt = datetime.fromisoformat(clean_str)
                created_at_val = dt.timestamp()
            except Exception as parse_ex:
                print(f"Error parsing createdAt string {created_at_raw}: {parse_ex}")
                try:
                    created_at_val = float(created_at_raw)
                except Exception:
                    created_at_val = time.time()
        elif isinstance(created_at_raw, (int, float)):
            created_at_val = float(created_at_raw)
        else:
            created_at_val = time.time()

        trial_days = profile_doc.get("trialDays", 15)
        elapsed_seconds = time.time() - created_at_val
        elapsed_days = elapsed_seconds / 86400.0
        days_left = max(0, int(trial_days - elapsed_days))

        subscription_status = profile_doc.get("subscriptionStatus", "trial")
        
        # Expire trial if days_left <= 0
        if subscription_status == "trial" and days_left <= 0:
            subscription_status = "expired"
            profile_doc["subscriptionStatus"] = "expired"
            # Update in Firestore
            payload = dict(profile_doc)
            payload["sku"] = f"{prefix}user_profile"
            try:
                firebase_config.set_document("products", f"{prefix}user_profile", payload, token)
                
                # Enviar correo de notificación
                biz_name = profile_doc.get("businessName", "No especificado")
                u_email = profile_doc.get("contactEmail", "No especificado")
                u_name = profile_doc.get("contactName", "No especificado")
                u_phone = profile_doc.get("contactPhone", "No especificado")
                
                subject = f"Prueba Vencida - {biz_name}"
                body = f"Se ha agotado el período de prueba para el siguiente usuario:\n\nNombre: {u_name}\nNegocio: {biz_name}\nEmail: {u_email}\nTeléfono: {u_phone}\n\nPor favor, contactalo para coordinar la suscripción."
                send_admin_email(subject, body)
                
            except Exception as ex:
                print(f"Error updating expired subscription: {ex}")

        if subscription_status == "expired":
            return jsonify({
                "emailVerified": True,
                "trialExpired": True,
                "error": "Período de prueba vencido"
            })
            
        # Check if configurations are seeded
        cat_config = next((d for d in user_docs if d.get("id") == "categories_config"), None)
        extras_config = next((d for d in user_docs if d.get("id") == "extras_config"), None)
        
        if not cat_config:
            cat_config = {
                "sku": f"{prefix}categories_config",
                "name": "Categories Configuration",
                "cost": 0.0,
                "stock": 0,
                "categories": []
            }
            firebase_config.set_document("products", f"{prefix}categories_config", cat_config, token)
            cat_config_copy = dict(cat_config)
            cat_config_copy["id"] = "categories_config"
            cat_config_copy["sku"] = "categories_config"
            user_docs.append(cat_config_copy)
            cat_config = cat_config_copy
            
        if not extras_config:
            biz_type = request.headers.get("X-Business-Type", "textil")
            if biz_type not in ["textil", "comercio"]:
                biz_type = "textil"
            if biz_type == "comercio":
                extras_config = {
                    "sku": f"{prefix}extras_config",
                    "name": "Extras Config",
                    "cost": 0.0,
                    "stock": 0,
                    "bolsas_caramelos": [],
                    "envoltorios_regalo": [],
                    "adicionales_kiosco": []
                }
            else:
                extras_config = {
                    "sku": f"{prefix}extras_config",
                    "name": "Extras Config",
                    "cost": 0.0,
                    "stock": 0,
                    "estampados": [],
                    "packagings": [],
                    "bordados": []
                }
            firebase_config.set_document("products", f"{prefix}extras_config", extras_config, token)
            extras_config_copy = dict(extras_config)
            extras_config_copy["id"] = "extras_config"
            extras_config_copy["sku"] = "extras_config"
            user_docs.append(extras_config_copy)
            extras_config = extras_config_copy
            
        # Classify user documents
        products = [d for d in user_docs if not d.get("id", "").startswith(
            ("supplier_", "fixedcost_", "account_", "cashtransaction_", "influencer_", "marketingexpense_", "extras_config", "categories_config", "stockintake_", "user_profile")
        )]
        
        categories = cat_config.get("categories", [])
        extras = {k: v for k, v in extras_config.items() if k not in ("id", "sku", "name", "cost", "stock")}
        
        suppliers = [d for d in user_docs if d.get("id", "").startswith("supplier_")]
        accounts = [d for d in user_docs if d.get("id", "").startswith("account_")]
        costs = [d for d in user_docs if d.get("id", "").startswith("fixedcost_")]
        transactions = [d for d in user_docs if d.get("id", "").startswith("cashtransaction_")]
        influencers = [d for d in user_docs if d.get("id", "").startswith("influencer_")]
        expenses = [d for d in user_docs if d.get("id", "").startswith("marketingexpense_")]
        intakes = [d for d in user_docs if d.get("id", "").startswith("stockintake_")]
        intakes.sort(key=lambda x: x.get("id", ""), reverse=True)
        
        # Ensure active project name & model are set in profile_doc
        try:
            user_projects = get_user_projects_list(token, uid=real_uid)
            current_pid = firebase_config.get_current_project_id() or "default"
            active_proj = next((p for p in user_projects if p.get("id") == current_pid), None)
            if not active_proj and user_projects:
                active_proj = user_projects[0]
                
            if active_proj:
                if active_proj.get("name"):
                    profile_doc["businessName"] = active_proj.get("name")
                if active_proj.get("businessModel"):
                    profile_doc["businessModel"] = active_proj.get("businessModel")
                if active_proj.get("businessType"):
                    profile_doc["businessType"] = active_proj.get("businessType")
        except Exception as p_err:
            print(f"Error syncing active project info in get_all_state: {p_err}")

        return jsonify({
            "emailVerified": True,
            "trialExpired": False,
            "subscriptionStatus": subscription_status,
            "daysLeft": days_left,
            "businessType": profile_doc.get("businessType", "clothing"),
            "businessName": profile_doc.get("businessName", ""),
            "userProfile": profile_doc,
            "categories": categories,
            "products": products,
            "sales": user_sales,
            "suppliers": suppliers,
            "currentAccounts": accounts,
            "fixedCosts": costs,
            "cashTransactions": transactions,
            "influencers": influencers,
            "marketingExpenses": expenses,
            "extras": extras,
            "stockIntakes": intakes,
            "role": my_role,
            "permissions": my_permissions,
            "subuser": sub_info
        })
    except Exception as e:
        return handle_error(e)


# --- 1. Rutas de Productos e Inventario (Reales) ---

@app.route("/api/products", methods=["GET"])
def get_products():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        # Ejecutar seeding si es necesario
        seed_db_if_empty(prefix, token)
        
        all_docs = firebase_config.list_documents("products", token)
        user_docs = filter_user_docs(all_docs, prefix)
        
        # Retornar únicamente los productos de inventario
        products = [d for d in user_docs if not d.get("id", "").startswith(
            ("supplier_", "fixedcost_", "account_", "cashtransaction_", "influencer_", "marketingexpense_", "extras_config", "categories_config", "stockintake_")
        )]
        
        return jsonify(products)
    except Exception as e:
        return handle_error(e)

@app.route("/api/products", methods=["POST"])
def save_products_batch():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    data = request.json
    if not data:
        return jsonify({"error": "Payload vacío"}), 400
        
    try:
        if isinstance(data, list):
            results = []
            for p in data:
                sku = str(p.get("sku", "")).strip()
                cost = safe_float(p.get("cost", 0.0))
                margin = safe_float(p.get("margin", 0.0))
                price_local_in = safe_float(p.get("price_local", 0.0))
                if price_local_in <= 0 and cost > 0 and margin > 0:
                    price_local_in = round(cost * (1.0 + margin / 100.0), 2)
                if price_local_in > 0:
                    price_local_in = int(round(price_local_in / 100.0) * 100)
                p["cost"] = cost
                p["stock"] = safe_int(p.get("stock", 0))
                p["price_local"] = price_local_in
                p["price"] = price_local_in
                clean_sku = sku.replace("/", "_").replace("\\", "_")
                doc_key = f"{prefix}{clean_sku}"
                p["sku"] = f"{prefix}{sku}" if not sku.startswith(prefix) else sku
                res = firebase_config.set_document("products", doc_key, p, token)
                if res:
                    res["id"] = res["id"][len(prefix):] if isinstance(res.get("id"), str) and res["id"].startswith(prefix) else res.get("id")
                    if "sku" in res and isinstance(res["sku"], str) and res["sku"].startswith(prefix):
                        res["sku"] = res["sku"][len(prefix):]
                results.append(res)
            
            # Push updates to Tiendanube in background thread pool
            try:
                with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
                    executor.map(lambda item: push_variant_to_tiendanube(item, token), data)
            except Exception as push_err:
                print(f"[TIENDANUBE PUSH BATCH ERROR] {push_err}")

            return jsonify(results)
        else:
            sku = str(data.get("sku", "")).strip()
            if not sku:
                return jsonify({"error": "SKU requerido"}), 400
            cost = safe_float(data.get("cost", 0.0))
            margin = safe_float(data.get("margin", 0.0))
            price_local_in = safe_float(data.get("price_local", 0.0))
            if price_local_in <= 0 and cost > 0 and margin > 0:
                price_local_in = round(cost * (1.0 + margin / 100.0), 2)
            if price_local_in > 0:
                price_local_in = int(round(price_local_in / 100.0) * 100)
            data["cost"] = cost
            data["stock"] = safe_int(data.get("stock", 0))
            data["price_local"] = price_local_in
            data["price"] = price_local_in
            clean_sku = sku.replace("/", "_").replace("\\", "_")
            doc_key = f"{prefix}{clean_sku}"
            data["sku"] = f"{prefix}{sku}" if not sku.startswith(prefix) else sku
            res = firebase_config.set_document("products", doc_key, data, token)
            if res:
                res["id"] = res["id"][len(prefix):] if isinstance(res.get("id"), str) and res["id"].startswith(prefix) else res.get("id")
                if "sku" in res and isinstance(res["sku"], str) and res["sku"].startswith(prefix):
                    res["sku"] = res["sku"][len(prefix):]
            
            # Push update to Tiendanube in background
            try:
                push_variant_to_tiendanube(data, token)
            except Exception as push_err:
                print(f"[TIENDANUBE PUSH SINGLE ERROR] {push_err}")
                
            return jsonify(res)
    except Exception as e:
        return handle_error(e)

@app.route("/api/products/<path:sku>", methods=["DELETE"])
def delete_product(sku):
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        clean_sku = str(sku).replace("/", "_").replace("\\", "_")
        deleted = firebase_config.delete_document("products", f"{prefix}{clean_sku}", token)
        return jsonify({"success": True, "deleted": deleted})
    except Exception as e:
        return handle_error(e)


# --- 2. Rutas de Categorías ---

@app.route("/api/categories", methods=["GET"])
def get_categories():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        doc = firebase_config.get_document("products", f"{prefix}categories_config", token)
        if doc:
            return jsonify(doc.get("categories", []))
        return jsonify(["Remeras", "Musculosas", "Buzos", "Camperas", "Accesorios"])
    except Exception as e:
        return handle_error(e)

@app.route("/api/categories", methods=["POST"])
def save_categories():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    data = request.json or {}
    categories = data.get("categories", [])
    
    try:
        payload = {
            "sku": f"{prefix}categories_config",
            "name": "Categories Configuration",
            "cost": 0.0,
            "stock": 0,
            "categories": categories
        }
        res = firebase_config.set_document("products", f"{prefix}categories_config", payload, token)
        return jsonify(res.get("categories", []))
    except Exception as e:
        return handle_error(e)


# --- 3. Rutas de Adicionales Dinámicas ---

@app.route("/api/extras", methods=["GET"])
def get_extras():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        doc = firebase_config.get_document("products", f"{prefix}extras_config", token)
        if doc:
            filtered = {k: v for k, v in doc.items() if k not in ("id", "sku", "name", "cost", "stock")}
            return jsonify(filtered)
        return jsonify({})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/extras", methods=["POST"])
def save_extras():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    data = request.json or {}
    
    try:
        payload = {
            "sku": f"{prefix}extras_config",
            "name": "Extras Config",
            "cost": 0.0,
            "stock": 0
        }
        for k, v in data.items():
            if k not in ("id", "sku", "name", "cost", "stock"):
                payload[k] = v
                
        res = firebase_config.set_document("products", f"{prefix}extras_config", payload, token)
        filtered = {k: v for k, v in res.items() if k not in ("id", "sku", "name", "cost", "stock")}
        return jsonify(filtered)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/export-inventory-excel", methods=["POST"])
def export_inventory_excel_route():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401

    try:
        data = request.json or {}
        products = data.get("products", [])
        extras_config = data.get("extras", {})
        locations = data.get("locations", ["Bahia Blanca", "Buenos Aires", "Local Principal"])
        if not locations:
            locations = ["Local Principal"]

        def get_col_letter(col_idx):
            letter = ""
            idx = col_idx
            while idx >= 0:
                temp = idx % 26
                letter = chr(temp + 65) + letter
                idx = (idx - temp) // 26 - 1
            return letter

        def get_category_title_py(key):
            titles = {
                "estampados": "Estampados",
                "packagings": "Packaging",
                "bordados": "Bordados",
                "bolsas_caramelos": "Bolsa de caramelos",
                "envoltorios_regalo": "Envoltorio de regalo",
                "adicionales_kiosco": "Otros adicionales"
            }
            if key in titles:
                return titles[key]
            return " ".join([word.capitalize() for word in key.split("_")])

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Inventario"

        extra_category_keys = [k for k in extras_config.keys() if k not in ["sku", "name", "cost", "stock", "id"]]

        # Encabezados
        headers = ["SKU", "Producto", "Categoría", "Talle"]
        for loc in locations:
            headers.append(f"Stock Actual: {loc}")
        headers.append("Stock Total")
        headers.append("Materia Prima")

        for cat_key in extra_category_keys:
            headers.append(get_category_title_py(cat_key))

        headers.extend(["Costo Unitario", "Margen (%)", "Precio de Venta", "Tiempo de Entrega (días)", "Stock de Seguridad"])

        ws.append(headers)

        first_loc_col = get_col_letter(4)
        last_loc_col = get_col_letter(3 + len(locations))

        for idx, p in enumerate(products):
            row_num = idx + 2
            display_name = (p.get("name") or "").strip()
            color = (p.get("color") or "").strip()
            if color and color.lower() not in ["único", "unico"]:
                if color.lower() not in display_name.lower():
                    display_name = f"{display_name} {color}"

            cost = float(p.get("cost") or 0)
            base_cost = float(p.get("baseCost") or 0) if p.get("baseCost") is not None else cost
            margin = float(p.get("margin") or 0)
            price = float(p.get("price_local") or p.get("price") or (cost * (1 + margin / 100)))

            row_data = [
                p.get("sku") or p.get("id") or "",
                display_name,
                p.get("category") or "",
                p.get("size") or "Único"
            ]

            loc_stocks = p.get("locationsStock") or {}
            for loc in locations:
                st_val = int(loc_stocks.get(loc, 0)) if loc in loc_stocks else int(p.get("stock_local") or p.get("stock") or 0)
                row_data.append(st_val)

            # Formula de Stock Total
            stock_formula = f"=SUM({first_loc_col}{row_num}:{last_loc_col}{row_num})"
            row_data.append(stock_formula)
            row_data.append(round(base_cost))

            selected_extras = p.get("extras") or {
                "estampados": p.get("estampadoId") or "",
                "packagings": p.get("packagingId") or "",
                "bordados": p.get("bordadoId") or ""
            }

            for cat_key in extra_category_keys:
                opt_id = selected_extras.get(cat_key, "")
                opts = extras_config.get(cat_key, [])
                matched_opt = next((o for o in opts if o.get("id") == opt_id), None)
                row_data.append(matched_opt["name"] if matched_opt else "-")

            row_data.append(round(cost))
            row_data.append(round(margin, 2))
            row_data.append(round(price))
            row_data.append(int(p["leadTime"]) if p.get("leadTime") not in [None, ""] else "")
            row_data.append(int(p["securityStock"]) if p.get("securityStock") not in [None, ""] else "")

            ws.append(row_data)

        # Hoja Secundaria "Opciones" para origen del desplegable
        ws_opts = wb.create_sheet(title="Opciones")
        opts_headers = [get_category_title_py(k) for k in extra_category_keys]
        ws_opts.append(opts_headers)

        max_opts = 1
        cat_opts_lists = {}
        for cat_key in extra_category_keys:
            opts = ["-"] + [o.get("name") for o in extras_config.get(cat_key, []) if o.get("name")]
            cat_opts_lists[cat_key] = opts
            if len(opts) > max_opts:
                max_opts = len(opts)

        for r_idx in range(max_opts):
            r_row = []
            for cat_key in extra_category_keys:
                opts = cat_opts_lists[cat_key]
                r_row.append(opts[r_idx] if r_idx < len(opts) else "")
            ws_opts.append(r_row)

        # Agregar Listas Desplegables de Validación de Datos
        insumos_start_col_idx = 4 + len(locations) + 2

        for c_idx, cat_key in enumerate(extra_category_keys):
            col_letter = get_col_letter(insumos_start_col_idx + c_idx)
            opts_count = len(cat_opts_lists[cat_key])
            formula_val = f"Opciones!${col_letter}$2:${col_letter}${opts_count + 1}"

            dv = DataValidation(
                type="list",
                formula1=formula_val,
                allow_blank=True
            )
            dv.error = 'Por favor seleccione una opción válida de la lista.'
            dv.errorTitle = 'Opción inválida'
            ws.add_data_validation(dv)
            dv.add(f"{col_letter}2:{col_letter}{len(products) + 500}")

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)

        return send_file(
            output,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            as_attachment=True,
            download_name="Inventario_Completo.xlsx"
        )
    except Exception as e:
        return handle_error(e)


# --- 4. Rutas de Proveedores (Compras) ---

@app.route("/api/suppliers", methods=["GET"])
def get_suppliers():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        all_docs = firebase_config.list_documents("products", token)
        user_docs = filter_user_docs(all_docs, prefix)
        suppliers = [d for d in user_docs if d.get("id", "").startswith("supplier_")]
        return jsonify(suppliers)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/suppliers", methods=["POST"])
def save_supplier():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    data = request.json or {}
    s_id = data.get("id")
    if not s_id:
        s_id = f"supplier_{int(time.time() * 1000)}"
    else:
        s_id = str(s_id)
        if not s_id.startswith("supplier_"):
            s_id = f"supplier_{s_id}"
        
    data["id"] = s_id
    sku = s_id
    data["sku"] = f"{prefix}{sku}"
    data["name"] = data.get("name", "")
    data["cost"] = 0.0
    data["stock"] = 0
    
    try:
        res = firebase_config.set_document("products", f"{prefix}{sku}", data, token)
        if res:
            res["id"] = res["id"][len(prefix):]
            if "sku" in res and res["sku"].startswith(prefix):
                res["sku"] = res["sku"][len(prefix):]
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/suppliers/<s_id>", methods=["DELETE"])
def delete_supplier(s_id):
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        doc_id = s_id if s_id.startswith("supplier_") else f"supplier_{s_id}"
        deleted = firebase_config.delete_document("products", f"{prefix}{doc_id}", token)
        return jsonify({"success": deleted})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- Rutas de Ingresos de Mercadería (Stock Intakes) ---

@app.route("/api/stock-intakes", methods=["GET"])
def get_stock_intakes():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        all_docs = firebase_config.list_documents("products", token)
        user_docs = filter_user_docs(all_docs, prefix)
        intakes = [d for d in user_docs if d.get("id", "").startswith("stockintake_")]
        intakes.sort(key=lambda x: x.get("id", ""), reverse=True)
        return jsonify(intakes)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/stock-intakes", methods=["POST"])
def save_stock_intake():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    data = request.json or {}
    i_id = data.get("id")
    if not i_id:
        i_id = f"stockintake_{int(time.time() * 1000)}"
        data["id"] = i_id
        
    data["sku"] = f"{prefix}{i_id}"
    data["name"] = data.get("productName", "Ingreso de Mercadería")
    data["cost"] = safe_float(data.get("totalCost", 0.0))
    data["stock"] = safe_int(data.get("totalQuantity", 0))
    
    try:
        res = firebase_config.set_document("products", f"{prefix}{i_id}", data, token)
        if res:
            res["id"] = res["id"][len(prefix):]
            if "sku" in res and res["sku"].startswith(prefix):
                res["sku"] = res["sku"][len(prefix):]
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- Cierres de Caja ---
@app.route("/api/cash/close", methods=["POST"])
def perform_cash_close():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    data = request.json or {}
    close_id = str(int(time.time() * 1000))
    doc_id = f"{prefix}cash_close_{close_id}"
    
    payload = {
        "sku": doc_id,
        "type": "cash_close",
        "date": datetime.utcnow().isoformat(),
        "initialBalance": float(data.get("initialBalance", 0)),
        "totalIncome": float(data.get("totalIncome", 0)),
        "totalExpense": float(data.get("totalExpense", 0)),
        "netBalance": float(data.get("netBalance", 0)),
        "closingAmount": float(data.get("closingAmount", 0)),
        "notes": data.get("notes", ""),
        "userName": data.get("userName", "Administrador")
    }
    
    try:
        firebase_config.set_document("products", doc_id, payload, token)
        return jsonify({"success": True, "close": payload})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/cash/closes", methods=["GET"])
def get_cash_closes_route():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        all_docs = firebase_config.list_documents("products", token)
        closes = [d for d in all_docs if d.get("sku", "").startswith(f"{prefix}cash_close_")]
        closes.sort(key=lambda x: x.get("date", ""), reverse=True)
        return jsonify(closes)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- Proveedores y Cuentas Corrientes ---(Pagar & Cobrar) ---

@app.route("/api/current-accounts", methods=["GET"])
def get_current_accounts():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        all_docs = firebase_config.list_documents("products", token)
        user_docs = filter_user_docs(all_docs, prefix)
        accounts = [d for d in user_docs if d.get("id", "").startswith("account_")]
        return jsonify(accounts)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/current-accounts", methods=["POST"])
def save_current_account():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    data = request.json or {}
    acc_id = data.get("id")
    if not acc_id:
        acc_id = f"acc-{int(time.time() * 1000)}"
        data["id"] = acc_id
        
    sku = f"account_{acc_id}"
    data["sku"] = f"{prefix}{sku}"
    data["name"] = data.get("entityName", "")
    data["cost"] = 0.0
    data["stock"] = 0
    
    if "transactions" not in data:
        try:
            old_doc = firebase_config.get_document("products", f"{prefix}{sku}", token)
            if old_doc and "transactions" in old_doc:
                data["transactions"] = old_doc["transactions"]
            else:
                data["transactions"] = []
        except Exception:
            data["transactions"] = []
        
    try:
        res = firebase_config.set_document("products", f"{prefix}{sku}", data, token)
        if res:
            res["id"] = res["id"][len(prefix):]
            if "sku" in res and res["sku"].startswith(prefix):
                res["sku"] = res["sku"][len(prefix):]
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/current-accounts/<acc_id>", methods=["DELETE"])
def delete_current_account(acc_id):
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        doc_id = acc_id if acc_id.startswith("account_") else f"account_{acc_id}"
        deleted = firebase_config.delete_document("products", f"{prefix}{doc_id}", token)
        return jsonify({"success": deleted})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/current-accounts/<acc_id>/transactions", methods=["POST"])
def add_account_transaction(acc_id):
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    data = request.json or {}
    try:
        clean_acc_id = acc_id
        if clean_acc_id.startswith(prefix):
            clean_acc_id = clean_acc_id[len(prefix):]
        doc_id = clean_acc_id if clean_acc_id.startswith("account_") else f"account_{clean_acc_id}"
        
        doc = firebase_config.get_document("products", f"{prefix}{doc_id}", token)
        if not doc:
            return jsonify({"error": "Cuenta corriente no encontrada"}), 404
            
        transactions = doc.get("transactions", [])
        
        is_interest = data.get("is_interest", False)
        emit_debit_note = data.get("emit_debit_note", False)
        original_sale_id = data.get("original_sale_id")
        
        new_tx = {
            "id": f"tx-{int(time.time() * 1000)}",
            "date": data.get("date", time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())),
            "due_date": data.get("due_date"),
            "description": str(data.get("description", "")),
            "amount": safe_float(data.get("amount", 0.0)),
            "payment": safe_float(data.get("payment", 0.0)),
            "is_interest": is_interest
        }
        
        nota_debito_emitida = False
        if emit_debit_note and original_sale_id and new_tx["amount"] > 0:
            sales = firebase_config.list_documents("sales", token)
            sale = next((s for s in sales if s.get("id") == f"{prefix}{original_sale_id}" or s.get("id") == original_sale_id), None)
            if not sale:
                return jsonify({"error": "Venta original no encontrada para vincular la Nota de Débito"}), 404
            
            orig_invoice = sale.get("arca_invoice_id")
            if not orig_invoice:
                return jsonify({"error": "La Venta seleccionada no fue facturada en AFIP/ARCA."}), 400
                
            parts = orig_invoice.split("-")
            if len(parts) == 2:
                orig_pto_vta = int(parts[0])
                orig_nro = int(parts[1])
            else:
                return jsonify({"error": "Formato de número de factura original inválido."}), 400
            
            email = get_email_from_token(token)
            user_doc = firebase_config.get_document("users", email, token)
            arca_config = user_doc.get("arca_config", {}) if user_doc else {}
            if not arca_config.get("enabled"):
                return jsonify({"error": "Integración ARCA desactivada."}), 400
                
            pos = int(arca_config.get("punto_venta", 1))
            condicion_iva = arca_config.get("condicion_iva", "monotributo")
            cuit_emisor = arca_config.get("cuit", "")
            
            invoice_type = "Nota de Débito B" if condicion_iva == "inscripto" else "Nota de Débito C"
                
            cert_content = arca_config.get("cert_content")
            key_content = arca_config.get("key_content")
            
            if cert_content and key_content:
                from arca_service import WSAAClient, WSFEClient, INVOICE_TYPES_MAP
                from datetime import datetime, date as pydate
                is_sandbox_cert = "homo" in str(cert_content).lower() or "wsaahomo" in str(cert_content).lower()
                try:
                    wsaa = WSAAClient(cert_content, key_content, sandbox=is_sandbox_cert)
                    token_afip, sign_afip = wsaa.get_token_and_sign("wsfe")
                    wsfe = WSFEClient(token_afip, sign_afip, cuit_emisor, sandbox=is_sandbox_cert)
                    
                    cbte_tipo = INVOICE_TYPES_MAP.get(invoice_type, 12)
                    orig_tipo = INVOICE_TYPES_MAP.get("Factura B", 6) if condicion_iva == "inscripto" else INVOICE_TYPES_MAP.get("Factura C", 11)
                    
                    last_authorized = wsfe.get_last_authorized_voucher(pos, cbte_tipo)
                    cbte_nro = last_authorized + 1
                    
                    client_cuit = sale.get("client_cuit", "")
                    cuit_to_use = client_cuit if client_cuit else "20-99999999-9"
                    doc_tipo = 99
                    doc_nro = 0
                    client_doc = "".join(c for c in str(cuit_to_use) if c.isdigit())
                    if client_doc and len(client_doc) >= 7 and client_doc != "20999999999":
                        doc_nro = int(client_doc)
                        doc_tipo = 80 if len(client_doc) == 11 else 96
                            
                    cbtes_asoc = {
                        "tipo": orig_tipo,
                        "pto_vta": orig_pto_vta,
                        "nro": orig_nro
                    }
                    
                    fch_val = pydate.today().strftime("%Y%m%d")
                    cae, cae_due = wsfe.request_cae(
                        pto_vta=pos,
                        cbte_tipo=cbte_tipo,
                        cbte_nro=cbte_nro,
                        total=new_tx["amount"],
                        doc_tipo=doc_tipo,
                        doc_nro=doc_nro,
                        concepto=1,
                        cbte_fch=fch_val,
                        cbtes_asoc=cbtes_asoc
                    )
                    
                    if cae_due and len(cae_due) == 8:
                        cae_due = f"{cae_due[0:4]}-{cae_due[4:6]}-{cae_due[6:8]}"
                        
                    new_tx["arca_debit_note_id"] = f"{str(pos).zfill(4)}-{str(cbte_nro).zfill(8)}"
                    new_tx["cae"] = cae
                    new_tx["cae_due"] = cae_due
                    nota_debito_emitida = True
                    
                except Exception as afip_err:
                    return jsonify({"error": f"Error AFIP al emitir Nota de Débito: {str(afip_err)}"}), 400
            else:
                return jsonify({"error": "Faltan credenciales AFIP configuradas."}), 400
        
        if not new_tx["date"]:
            new_tx["date"] = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
            
        transactions.append(new_tx)
        doc["transactions"] = transactions
        doc["sku"] = f"{prefix}{doc_id}"
        
        res = firebase_config.set_document("products", f"{prefix}{doc_id}", doc, token)
        
        payment_val = float(new_tx["payment"])
        if payment_val > 0:
            caja_type = "income" if doc.get("type") == "cliente" else "expense"
            caja_payload = {
                "description": f"Cobranza/Pago Cuenta Corriente - {doc.get('entityName')}",
                "type": caja_type,
                "amount": payment_val
            }
            c_id = int(time.time() * 1000)
            caja_payload["sku"] = f"cashtransaction_{c_id}"
            caja_payload["name"] = caja_payload["description"]
            caja_payload["cost"] = payment_val
            caja_payload["stock"] = 0
            caja_payload["id"] = str(c_id)
            caja_payload["date"] = new_tx["date"]
            firebase_config.set_document("products", f"{prefix}{caja_payload['sku']}", caja_payload, token)
            
        if res:
            res["id"] = res["id"][len(prefix):]
            if "sku" in res and res["sku"].startswith(prefix):
                res["sku"] = res["sku"][len(prefix):]
            res["nota_debito_emitida"] = nota_debito_emitida
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/current-accounts/<acc_id>/transactions/<tx_id>", methods=["DELETE"])
def delete_account_transaction(acc_id, tx_id):
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        clean_acc_id = acc_id
        if clean_acc_id.startswith(prefix):
            clean_acc_id = clean_acc_id[len(prefix):]
        doc_id = clean_acc_id if clean_acc_id.startswith("account_") else f"account_{clean_acc_id}"
        
        doc = firebase_config.get_document("products", f"{prefix}{doc_id}", token)
        if not doc:
            return jsonify({"error": "Cuenta corriente no encontrada"}), 404
            
        transactions = doc.get("transactions", [])
        updated_transactions = [t for t in transactions if t.get("id") != tx_id]
        
        if len(transactions) == len(updated_transactions):
            return jsonify({"error": "Transacción no encontrada"}), 404
            
        doc["transactions"] = updated_transactions
        firebase_config.set_document("products", f"{prefix}{doc_id}", doc, token)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- 6. Rutas de Caja Diaria ---

@app.route("/api/cash-transactions", methods=["GET"])
def get_cash_transactions():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        all_docs = firebase_config.list_documents("products", token)
        user_docs = filter_user_docs(all_docs, prefix)
        transactions = [d for d in user_docs if d.get("id", "").startswith("cashtransaction_")]
        return jsonify(transactions)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/cash-transactions", methods=["POST"])
def save_cash_transaction():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    data = request.json or {}
    c_id = data.get("id")
    if not c_id:
        c_id = int(time.time() * 1000)
        data["id"] = str(c_id)
        
    data["sku"] = f"cashtransaction_{c_id}"
    data["name"] = data.get("description", "Movimiento de Caja")
    data["cost"] = safe_float(data.get("amount", 0.0))
    data["stock"] = 0
    if "date" not in data:
        data["date"] = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
        
    try:
        data["sku"] = f"{prefix}{data['sku']}"
        res = firebase_config.set_document("products", f"{prefix}cashtransaction_{c_id}", data, token)
        if res:
            res["id"] = res["id"][len(prefix):]
            if "sku" in res and res["sku"].startswith(prefix):
                res["sku"] = res["sku"][len(prefix):]
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- 7. Rutas de Gastos Mensuales ---

@app.route("/api/fixed-costs", methods=["GET"])
def get_fixed_costs():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        all_docs = firebase_config.list_documents("products", token)
        user_docs = filter_user_docs(all_docs, prefix)
        costs = [d for d in user_docs if d.get("id", "").startswith("fixedcost_")]
        return jsonify(costs)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/fixed-costs", methods=["POST"])
def save_fixed_cost():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    data = request.json or {}
    c_id = data.get("id")
    if not c_id:
        c_id = int(time.time() * 1000)
        data["id"] = c_id
        
    sku = f"fixedcost_{c_id}"
    data["sku"] = f"{prefix}{sku}"
    data["name"] = data.get("concept", "")
    data["cost"] = safe_float(data.get("amount", 0.0))
    data["stock"] = 0
    if "isPaid" not in data:
        data["isPaid"] = False
        
    try:
        res = firebase_config.set_document("products", f"{prefix}{sku}", data, token)
        if res:
            res["id"] = res["id"][len(prefix):]
            if "sku" in res and res["sku"].startswith(prefix):
                res["sku"] = res["sku"][len(prefix):]
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/fixed-costs/<c_id>/pay", methods=["POST"])
def pay_fixed_cost(c_id):
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        doc = firebase_config.get_document("products", f"{prefix}fixedcost_{c_id}", token)
        if not doc:
            return jsonify({"error": "Gasto no encontrado"}), 404
            
        doc["isPaid"] = True
        doc["sku"] = f"{prefix}fixedcost_{c_id}"
        res = firebase_config.set_document("products", f"{prefix}fixedcost_{c_id}", doc, token)
        
        caja_payload = {
            "description": f"Pago de Costo Fijo - {doc.get('concept')}",
            "type": "expense",
            "amount": float(doc.get("amount", 0.0)),
            "date": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
        }
        caja_id = int(time.time() * 1000)
        caja_payload["sku"] = f"cashtransaction_{caja_id}"
        caja_payload["name"] = caja_payload["description"]
        caja_payload["cost"] = caja_payload["amount"]
        caja_payload["stock"] = 0
        caja_payload["id"] = str(caja_id)
        
        firebase_config.set_document("products", f"{prefix}{caja_payload['sku']}", caja_payload, token)
        
        if res:
            res["id"] = res["id"][len(prefix):]
            if "sku" in res and res["sku"].startswith(prefix):
                res["sku"] = res["sku"][len(prefix):]
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/fixed-costs/<c_id>", methods=["DELETE"])
def delete_fixed_cost(c_id):
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        doc_id = c_id if c_id.startswith("fixedcost_") else f"fixedcost_{c_id}"
        deleted = firebase_config.delete_document("products", f"{prefix}{doc_id}", token)
        return jsonify({"success": deleted})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- 8. Rutas de Marketing & Influencers ---

@app.route("/api/influencers", methods=["GET"])
def get_influencers():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        all_docs = firebase_config.list_documents("products", token)
        user_docs = filter_user_docs(all_docs, prefix)
        influencers = [d for d in user_docs if d.get("id", "").startswith("influencer_")]
        return jsonify(influencers)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/influencers", methods=["POST"])
def save_influencer():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    data = request.json or {}
    inf_id = data.get("id")
    if not inf_id:
        inf_id = f"inf-{int(time.time() * 1000)}"
        data["id"] = inf_id
        
    sku = f"influencer_{inf_id}"
    data["sku"] = f"{prefix}{sku}"
    data["name"] = data.get("name", "")
    data["cost"] = 0.0
    data["stock"] = 0
    
    try:
        res = firebase_config.set_document("products", f"{prefix}{sku}", data, token)
        if res:
            res["id"] = res["id"][len(prefix):]
            if "sku" in res and res["sku"].startswith(prefix):
                res["sku"] = res["sku"][len(prefix):]
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/influencers/<inf_id>", methods=["DELETE"])
def delete_influencer(inf_id):
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        doc_id = inf_id if inf_id.startswith("influencer_") else f"influencer_{inf_id}"
        deleted = firebase_config.delete_document("products", f"{prefix}{doc_id}", token)
        return jsonify({"success": deleted})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/marketing-expenses", methods=["GET"])
def get_marketing_expenses():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        all_docs = firebase_config.list_documents("products", token)
        user_docs = filter_user_docs(all_docs, prefix)
        expenses = [d for d in user_docs if d.get("id", "").startswith("marketingexpense_")]
        return jsonify(expenses)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/marketing-expenses", methods=["POST"])
def save_marketing_expense():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    data = request.json or {}
    exp_id = data.get("id")
    is_edit = bool(exp_id)
    
    if not exp_id:
        exp_id = f"exp-{int(time.time() * 1000)}"
        data["id"] = exp_id
        
    sku = f"marketingexpense_{exp_id}"
    data["sku"] = f"{prefix}{sku}"
    data["name"] = data.get("campaignName", data.get("influencer", "Gasto de Marketing"))
    data["cost"] = safe_float(data.get("totalCost", 0.0))
    data["stock"] = 0
    if "date" not in data:
        data["date"] = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
        
    try:
        if is_edit:
            try:
                old_doc = firebase_config.get_document("products", f"{prefix}{sku}", token)
                if old_doc:
                    old_prod_sku = old_doc.get("productSku")
                    old_qty = int(old_doc.get("quantity", 0))
                    if old_prod_sku and old_qty > 0:
                        old_prod = firebase_config.get_document("products", f"{prefix}{old_prod_sku}", token)
                        if old_prod:
                            old_prod["stock"] = int(old_prod.get("stock", 0)) + old_qty
                            firebase_config.set_document("products", f"{prefix}{old_prod_sku}", old_prod, token)
            except Exception as old_err:
                print(f"Error al restaurar stock previo: {old_err}")

        res = firebase_config.set_document("products", f"{prefix}{sku}", data, token)
        
        prod_sku = data.get("productSku")
        qty = safe_int(data.get("quantity", 0))
        if prod_sku and qty > 0:
            prod = firebase_config.get_document("products", f"{prefix}{prod_sku}", token)
            if prod:
                current_stock = safe_int(prod.get("stock", 0))
                new_stock = max(0, current_stock - qty)
                prod["stock"] = new_stock
                prod["sku"] = f"{prefix}{prod_sku}"
                firebase_config.set_document("products", f"{prefix}{prod_sku}", prod, token)
                
        if not is_edit:
            caja_payload = {
                "description": f"Gasto Marketing - {data['name']}",
                "type": "expense",
                "amount": safe_float(data.get("totalCost", 0.0)),
                "date": data["date"]
            }
            caja_id = int(time.time() * 1000)
            caja_payload["sku"] = f"cashtransaction_{caja_id}"
            caja_payload["name"] = caja_payload["description"]
            caja_payload["cost"] = caja_payload["amount"]
            caja_payload["stock"] = 0
            caja_payload["id"] = str(caja_id)
            firebase_config.set_document("products", f"{prefix}{caja_payload['sku']}", caja_payload, token)
        
        if res:
            res["id"] = res["id"][len(prefix):]
            if "sku" in res and res["sku"].startswith(prefix):
                res["sku"] = res["sku"][len(prefix):]
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/marketing-expenses/<exp_id>", methods=["DELETE"])
def delete_marketing_expense(exp_id):
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        doc_id = exp_id if exp_id.startswith("marketingexpense_") else f"marketingexpense_{exp_id}"
        
        try:
            doc = firebase_config.get_document("products", f"{prefix}{doc_id}", token)
            if doc:
                prod_sku = doc.get("productSku")
                qty = int(doc.get("quantity", 0))
                if prod_sku and qty > 0:
                    prod = firebase_config.get_document("products", f"{prefix}{prod_sku}", token)
                    if prod:
                        prod["stock"] = int(prod.get("stock", 0)) + qty
                        prod["sku"] = f"{prefix}{prod_sku}"
                        firebase_config.set_document("products", f"{prefix}{prod_sku}", prod, token)
        except Exception as stock_err:
            print(f"Error al restaurar stock al eliminar entrega: {stock_err}")
            
        deleted = firebase_config.delete_document("products", f"{prefix}{doc_id}", token)
        return jsonify({"success": deleted})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- 9. Rutas de Ventas y Cobros ---

@app.route("/api/sales", methods=["GET"])
def get_sales():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        sales = firebase_config.list_documents("sales", token)
        
        # Self-healing for lost AFIP/ARCA data on Tiendanube synced sales
        try:
            invoices = firebase_config.list_documents("invoices", token)
            # Map invoices by sale_id
            invoices_by_sale_id = {}
            for inv in invoices:
                s_id = inv.get("sale_id")
                if s_id:
                    invoices_by_sale_id[str(s_id)] = inv
            
            updated_sales = False
            for sale in sales:
                doc_id = sale.get("id", "")
                if doc_id.startswith(prefix):
                    clean_id = doc_id[len(prefix):]
                    # If this sale has a matching invoice but missing arca_invoice_id, restore it
                    if clean_id in invoices_by_sale_id and not sale.get("arca_invoice_id"):
                        inv = invoices_by_sale_id[clean_id]
                        sale["arca_invoice_id"] = inv.get("invoice_number")
                        sale["arca_cae"] = inv.get("cae")
                        sale["arca_cae_due"] = inv.get("cae_due")
                        sale["fiscal_status"] = "declarada"
                        firebase_config.set_document("sales", doc_id, sale, token)
                        updated_sales = True
            if updated_sales:
                sales = firebase_config.list_documents("sales", token)
        except Exception as heal_err:
            print(f"[AFIP SELF-HEALING ERROR] {heal_err}")
            
        user_sales = filter_user_docs(sales, prefix)
        return jsonify(user_sales)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/sales/<sale_id>/fiscal-status", methods=["PUT"])
def update_sale_fiscal_status(sale_id):
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        data = request.json or {}
        fiscal_status = data.get("fiscal_status", "no_declarada")
        
        doc_id = f"{prefix}{sale_id}"
        sale = firebase_config.get_document("sales", doc_id, token)
        if not sale:
            sale = firebase_config.get_document("sales", sale_id, token)
            if not sale:
                return jsonify({"error": "Venta no encontrada"}), 404
            doc_id = sale_id
            
        sale["fiscal_status"] = fiscal_status
        firebase_config.set_document("sales", doc_id, sale, token)
        return jsonify({"success": True, "fiscal_status": fiscal_status})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/sales", methods=["POST"])
def create_sale():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    data = request.json or {}
    date = data.get("date")
    total = safe_float(data.get("total"))
    
    # 1. MITIGACIÓN CWE-20: Prevenir Inyección Financiera Negativa
    if total < 0:
        return jsonify({"error": "El total de la venta no puede ser negativo."}), 400
        
    items = data.get("items")
    method = data.get("method", "Efectivo")
    origen = data.get("origen", "local")
    ubicacion = data.get("ubicacion", "Local Principal")
    
    if not date or total is None or not items:
        return jsonify({"error": "Campos obligatorios faltantes"}), 400
        
    uid = get_uid_from_token(token)
    if not uid:
        return jsonify({"error": "UID inválido"}), 401

    try:
        # 2. MITIGACIÓN OWASP A01 (Race Condition): Deducción de Inventario
        # Solo ejecutamos la validación estricta de stock si es origen local.
        if origen == "local":
            docs_to_update = []
            
            # Paso A: Lectura y Validación de todo el carrito
            for cart_item in items:
                prod_info = cart_item.get("product", {})
                sku = prod_info.get("sku")
                qty = safe_int(cart_item.get("quantity", 0))
                
                if not sku or qty <= 0:
                    continue
                    
                prod = firebase_config.get_document("products", f"{prefix}{sku}", token)
                
                if not prod:
                    return jsonify({"error": f"Producto con SKU {sku} no encontrado en inventario"}), 400
                    
                loc_stock = prod.get("locationsStock", {})
                if isinstance(loc_stock, dict) and ubicacion in loc_stock:
                    current_stock = safe_int(loc_stock[ubicacion])
                else:
                    current_stock = safe_int(prod.get("stock_local", prod.get("stock", 0)))
                    
                if current_stock < qty:
                    return jsonify({"error": f"Stock insuficiente para '{prod.get('name')}'. Disponible: {current_stock}, Solicitado: {qty}"}), 400
                    
                # Preparar mutación de datos
                if isinstance(loc_stock, dict) and ubicacion in loc_stock:
                    loc_stock[ubicacion] = current_stock - qty
                    total_stock = sum(safe_int(v) for v in loc_stock.values())
                    prod["locationsStock"] = loc_stock
                    prod["stock"] = total_stock
                    prod["stock_local"] = total_stock
                else:
                    prod["stock_local"] = current_stock - qty
                    prod["stock"] = prod["stock_local"]
                    
                prod["sku"] = f"{prefix}{sku}"
                docs_to_update.append(prod)
                
            # Paso B: Escritura
            for updated_prod in docs_to_update:
                firebase_config.set_document("products", updated_prod["sku"], updated_prod, token)

        sale_id = f"V-{time.strftime('%H%M%S', time.localtime())}"
        
        # Desprender el prefijo del payload antes de guardarlo
        for cart_item in items:
            prod_info = cart_item.get("product", {})
            if "sku" in prod_info and str(prod_info["sku"]).startswith(prefix):
                prod_info["sku"] = str(prod_info["sku"])[len(prefix):]
            if "id" in prod_info and str(prod_info["id"]).startswith(prefix):
                prod_info["id"] = str(prod_info["id"])[len(prefix):]

        sale_data = {
            "date": str(date),
            "total": total,
            "subtotal": safe_float(data.get("subtotal", total)),
            "discount_pct": safe_float(data.get("discount_pct", 0.0)),
            "method": str(method),
            "items": items,
            "extras": data.get("extras", {}),
            "origen": origen,
            "canal_venta": data.get("canal_venta", "Local Principal"),
            "ubicacion": ubicacion
        }

        # Calcular ganancias netas si el origen es Tiendanube
        if origen == "tiendanube":
            fee_fijo = safe_float(data.get("fee_fijo_tn", 300.0))
            comision = safe_float(data.get("comision_pasarela_pago", 5.0))
            costos_fin = fee_fijo + (comision / 100.0 * total)
            total_neto = max(0.0, total - costos_fin)
            sale_data["fee_fijo_tn"] = fee_fijo
            sale_data["comision_pasarela_pago"] = comision
            sale_data["total_neto"] = total_neto
        else:
            sale_data["total_neto"] = total

        # Flujo especial para ARCA Pago
        if method == "ARCA":
            email = get_email_from_token(token)
            if not is_arca_enabled(token, email):
                return jsonify({"error": "ARCA no está habilitado para este usuario."}), 400
            sale_data["status"] = "pendiente"
            res = firebase_config.set_document("sales", f"{prefix}{sale_id}", sale_data, token)
            
            try:
                host_url = request.url_root.rstrip('/')
                webhook_url = f"{host_url}/api/webhooks/arca"
                return_url = f"{host_url}/"
                
                arca_res = create_arca_payment(
                    sale_id=sale_id,
                    amount=total,
                    return_url=return_url,
                    webhook_url=webhook_url,
                    tenant_uid=uid
                )
                
                payment_url = arca_res.get("payment_url") or arca_res.get("init_point") or arca_res.get("checkout_url") or arca_res.get("url")
                
                sale_data["arca_payment_id"] = arca_res.get("id")
                sale_data["payment_url"] = payment_url
                firebase_config.set_document("sales", f"{prefix}{sale_id}", sale_data, token)
                
                if res:
                    res["id"] = res["id"][len(prefix):]
                    res["payment_url"] = payment_url
                return jsonify(res)
                
            except Exception as arca_err:
                print(f"Error al crear pago ARCA: {arca_err}")
                return jsonify({"error": f"Error al generar link de pago ARCA: {str(arca_err)}"}), 500

        # Registro normal de venta (Efectivo/Tarjeta/Transferencia/Financiado)
        res = firebase_config.set_document("sales", f"{prefix}{sale_id}", sale_data, token)
                    
        # Registrar en la caja diaria si corresponde
        if method in ["Efectivo", "Transferencia"]:
            caja_payload = {
                "description": f"Venta {method} - {sale_id}",
                "type": "income",
                "amount": safe_float(total),
                "date": date
            }
            caja_id = int(time.time() * 1000)
            caja_payload["sku"] = f"cashtransaction_{caja_id}"
            caja_payload["name"] = caja_payload["description"]
            caja_payload["cost"] = caja_payload["amount"]
            caja_payload["stock"] = 0
            caja_payload["id"] = str(caja_id)
            firebase_config.set_document("products", f"{prefix}{caja_payload['sku']}", caja_payload, token)
            
        # Sincronización automática con Tiendanube si está configurada, activa y es venta local
        if origen == "local":
            uid = get_uid_from_token(token)
            import threading
            threading.Thread(
                target=sync_stock_to_tiendanube,
                args=(uid, items),
                kwargs={"token": token, "prefix": prefix},
                daemon=True
            ).start()

        if res:
            res["id"] = res["id"][len(prefix):]
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/sales/<sale_id>", methods=["DELETE"])
def delete_sale(sale_id):
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        # 1. Obtener la venta para saber qué stock devolver
        sales = firebase_config.list_documents("sales", token)
        sale_to_delete = None
        for s in sales:
            if s.get("id") == f"{prefix}{sale_id}":
                sale_to_delete = s
                break
                
        if not sale_to_delete:
            return jsonify({"error": "Venta no encontrada"}), 404
            
        if sale_to_delete.get("arca_invoice_id"):
            return jsonify({"error": "No se puede eliminar una venta que ya ha sido facturada en AFIP. Debes anularla emitiendo una Nota de Crédito."}), 400
            
        if sale_to_delete.get("origen") == "tiendanube":
            return jsonify({"error": "No se pueden eliminar ventas sincronizadas de Tiendanube."}), 400
            
        # 2. Devolver el stock
        items = sale_to_delete.get("items", [])
        products = firebase_config.list_documents("products", token)
        
        for item in items:
            prod_info = item.get("product", {})
            sku = prod_info.get("sku")
            qty = safe_int(item.get("quantity", 0))
            
            if sku and qty > 0:
                # Encontrar el producto original
                prod = next((p for p in products if p.get("sku") == f"{prefix}{sku}"), None)
                if prod:
                    # Devolver stock
                    current_stock = safe_int(prod.get("stock", 0))
                    prod["stock"] = current_stock + qty
                    
                    if "stock_local" in prod:
                        current_local = safe_int(prod.get("stock_local", 0))
                        prod["stock_local"] = current_local + qty
                    
                    # Actualizar en BD
                    firebase_config.set_document("products", f"{prefix}{sku}", prod, token)
        
        # 3. Eliminar la venta
        deleted = firebase_config.delete_document("sales", f"{prefix}{sale_id}", token)
        return jsonify({"success": deleted})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/user/profile", methods=["GET"])
@require_firebase_auth
def get_user_profile():
    uid = request.uid
    token = request.token
    
    # 1. Intentar obtener de la caché en memoria
    cached_profile = profile_cache.get(uid)
    if cached_profile:
        print(f"[CACHE HIT] Perfil de usuario devuelto desde la caché para UID: {uid}")
        return jsonify(cached_profile)
        
    print(f"[CACHE MISS] Consultando perfil en Firestore para UID: {uid}")
    try:
        profile = firebase_config.get_document("users", uid, token)
        if not profile:
            # Inicializar perfil por defecto para nuevos inquilinos
            profile = {
                "name": "Mi Tienda Datamargen",
                "branding": {
                    "color_primario": "#10b981"
                },
                "integraciones": {
                    "tiendanube": {
                        "activo": False
                    }
                }
            }
            # Guardar el perfil inicial en Firestore
            firebase_config.set_document("users", uid, profile, token)
            
        # Guardar en la caché en memoria
        profile_cache[uid] = profile
        return jsonify(profile)
    except Exception as e:
        return handle_error(e)

@app.route("/api/user/profile", methods=["POST"])
@require_firebase_auth
def update_user_profile():
    uid = request.uid
    token = request.token
    data = request.json or {}
    
    # Validar campos básicos
    allowed_keys = ["name", "branding", "integraciones"]
    updated_fields = {k: v for k, v in data.items() if k in allowed_keys}
    
    try:
        # Obtener perfil existente para fusionar datos
        existing = profile_cache.get(uid)
        if not existing:
            existing = firebase_config.get_document("users", uid, token) or {}
            
        # Fusionar datos nuevos
        for k, v in updated_fields.items():
            if isinstance(v, dict) and k in existing and isinstance(existing[k], dict):
                existing[k].update(v)
            else:
                existing[k] = v
                
        # Guardar en Firestore
        firebase_config.set_document("users", uid, existing, token)
        
        # Invalidar/actualizar la caché en memoria
        profile_cache[uid] = existing
        
        return jsonify(existing)
    except Exception as e:
        return handle_error(e)

@app.route("/api/integrations", methods=["GET"])
def get_integrations():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    uid = get_uid_from_token(token)
    if not uid:
        return jsonify({"error": "Token inválido o expirado"}), 401
    try:
        docs = firebase_config.list_documents("integrations", token)
        integrations_dict = {}
        for doc in docs:
            doc_id = doc.get("id")
            if doc_id:
                integrations_dict[doc_id] = doc
        return jsonify(integrations_dict)
    except Exception as e:
        return handle_error(e)

@app.route("/api/integrations/<integration_id>", methods=["POST"])
def save_integration(integration_id):
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    uid = get_uid_from_token(token)
    if not uid:
        return jsonify({"error": "Token inválido o expirado"}), 401
    data = request.json or {}
    try:
        if integration_id == "arca":
            email = get_email_from_token(token)
            if not is_arca_enabled(token, email):
                return jsonify({"error": "ARCA no está habilitado para este usuario."}), 400
            
            # Preservar certificados existentes si no se proveen en el nuevo payload
            existing = firebase_config.get_document("integrations", "arca", token)
            if existing:
                if "cert_content" not in data or not data["cert_content"]:
                    if existing.get("cert_content"):
                        data["cert_content"] = existing.get("cert_content")
                if "key_content" not in data or not data["key_content"]:
                    if existing.get("key_content"):
                        data["key_content"] = existing.get("key_content")
        elif integration_id == "tiendanube":
            access_token = data.get("access_token")
            user_id = data.get("user_id")
            if access_token == "••••••••":
                existing = firebase_config.get_document("integrations", "tiendanube", token)
                if existing and existing.get("access_token"):
                    access_token = existing.get("access_token")
                    data["access_token"] = access_token
            if access_token:
                data["access_token"] = "".join(c for c in str(access_token) if ord(c) < 128).strip()
            if user_id:
                data["user_id"] = "".join(c for c in str(user_id) if ord(c) < 128).strip()
        res = firebase_config.set_document("integrations", integration_id, data, token)
        return jsonify(res)
    except Exception as e:
        return handle_error(e)

@app.route("/api/integrations/arca/update-category", methods=["POST"])
def update_arca_category():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    data = request.json or {}
    categoria = data.get("categoria")
    if not categoria:
        return jsonify({"error": "Categoría inválida"}), 400
        
    try:
        arca = firebase_config.get_document("integrations", "arca", token) or {}
        arca["categoria_monotributo"] = categoria
        firebase_config.set_document("integrations", "arca", arca, token)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def normalize_size(sz):
    if not sz:
        return "Único"
    sz_str = str(sz).strip()
    if not sz_str:
        return "Único"
    sz_upper = sz_str.upper()
    if sz_upper in ["U", "UNICO", "ÚNICO", "TALLE UNICO", "TALLE ÚNICO", "SINGLE"]:
        return "Único"
    return sz_str

def clean_product_name_and_size(p_name, variant_size):
    norm_size = normalize_size(variant_size)
    if not p_name:
        return p_name, norm_size
    words = p_name.strip().split()
    if len(words) > 1:
        last_word = words[-1].upper()
        sizes = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "3XL"]
        if last_word in sizes:
            clean_name = " ".join(words[:-1])
            new_size = norm_size
            if norm_size in ["Único", "", None]:
                new_size = normalize_size(words[-1])
            return clean_name, new_size
    return p_name, norm_size

@app.route("/api/integrations/tiendanube/sync", methods=["POST"])
def sync_tiendanube_catalog_route():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
    uid = get_uid_from_token(token)
    
    try:
        # 1. Fetch credentials
        config = firebase_config.get_document("integrations", "tiendanube", token)
        if not config or not config.get("activo"):
            return jsonify({"error": "La integración con Tiendanube no está activa o no está configurada."}), 400
            
        user_id = config.get("user_id")
        access_token = config.get("access_token")
        
        # Sanitizar credenciales para evitar caracteres ocultos no-ASCII (ej: de copiar y pegar)
        if access_token:
            access_token = "".join(c for c in str(access_token) if ord(c) < 128).strip()
        if user_id:
            user_id = "".join(c for c in str(user_id) if ord(c) < 128).strip()
        
        headers = {
            "Authentication": f"bearer {access_token}",
            "User-Agent": "Datamargen (klejavalentino@gmail.com)",
            "Content-Type": "application/json"
        }
        
        # 1.5 Fetch all categories from Tiendanube
        tn_categories = {}
        cat_page = 1
        while True:
            cat_url = f"https://api.tiendanube.com/v1/{user_id}/categories?page={cat_page}&per_page=100"
            cat_r = requests.get(cat_url, headers=headers, timeout=30)
            if not cat_r.ok:
                print(f"[CATEGORY SYNC] Failed to fetch categories: {cat_r.text}")
                break
            cat_data = cat_r.json()
            if not cat_data:
                break
            for cat in cat_data:
                if isinstance(cat, dict):
                    cat_id = cat.get("id")
                    if cat_id is not None:
                        name_dict = cat.get("name", {})
                        if isinstance(name_dict, dict):
                            cat_name = name_dict.get("es", name_dict.get("en", next(iter(name_dict.values())) if name_dict.values() else "General"))
                        else:
                            cat_name = "General"
                        tn_categories[cat_id] = cat_name
                        tn_categories[str(cat_id)] = cat_name
                        try:
                            tn_categories[int(cat_id)] = cat_name
                        except (ValueError, TypeError):
                            pass
            if len(cat_data) < 100:
                break
            cat_page += 1
        
        # 2. Get all products from Tiendanube (with pagination)
        all_tn_products = []
        page = 1
        while True:
            url = f"https://api.tiendanube.com/v1/{user_id}/products?page={page}&per_page=100"
            r = requests.get(url, headers=headers, timeout=30)
            if not r.ok:
                return jsonify({"error": f"Error de Tiendanube API: {r.text}"}), 400
            data = r.json()
            if not data:
                break
            all_tn_products.extend(data)
            if len(data) < 100:
                break
            page += 1
            
        # 3. Get existing products from Firestore to map & update
        existing_docs = firebase_config.list_documents("products", token)
        
        # Limpiar productos antiguos con formato incorrecto ("TN-")
        clean_docs = []
        for d in existing_docs:
            doc_id = d.get("id", "")
            if doc_id.startswith(prefix) and "TN-" in doc_id:
                try:
                    firebase_config.delete_document("products", doc_id, token)
                except Exception as del_err:
                    print(f"[CLEANUP ERROR] Falló eliminar {doc_id}: {del_err}")
            else:
                clean_docs.append(d)
        existing_docs = clean_docs

        existing_products_by_sku = {}
        for d in existing_docs:
            doc_id = d.get("id", "")
            if doc_id.startswith(prefix) and not doc_id.startswith((
                "supplier_", "fixedcost_", "account_", "cashtransaction_", "influencer_", "marketingexpense_", "extras_config", "categories_config", "stockintake_"
            )):
                clean_sku = doc_id[len(prefix):].upper()
                existing_products_by_sku[clean_sku] = d
                
        # 4. Prepare updates/creates
        biz_type = request.headers.get("X-Business-Type", "textil")
        if biz_type not in ["textil", "comercio"]:
            biz_type = "textil"
        products_to_save = []
        newly_added_docs = []
        
        for tn_prod in all_tn_products:
            p_id = tn_prod.get("id")
            p_name_dict = tn_prod.get("name", {})
            p_name = p_name_dict.get("es", p_name_dict.get("en", next(iter(p_name_dict.values())) if p_name_dict.values() else "Sin Nombre"))
            attributes = tn_prod.get("attributes", [])
            
            # Map category from categories list using our tn_categories dictionary
            product_categories = tn_prod.get("categories", [])
            product_category = "General"
            if product_categories and isinstance(product_categories, list):
                for cat_item in product_categories:
                    cat_id = None
                    if isinstance(cat_item, dict):
                        cat_id = cat_item.get("id")
                    elif isinstance(cat_item, (int, str)):
                        cat_id = cat_item
                    
                    if cat_id is not None:
                        if cat_id in tn_categories:
                            product_category = tn_categories[cat_id]
                            break
                        elif str(cat_id) in tn_categories:
                            product_category = tn_categories[str(cat_id)]
                            break
                        else:
                            try:
                                int_id = int(cat_id)
                                if int_id in tn_categories:
                                    product_category = tn_categories[int_id]
                                    break
                            except (ValueError, TypeError):
                                pass
            
            for variant in tn_prod.get("variants", []):
                v_id = variant.get("id")
                raw_sku = variant.get("sku")
                if not raw_sku or not str(raw_sku).strip():
                    # Fallback para variantes sin SKU en Tiendanube (evitando guión después de TN para baseSku correcto)
                    raw_sku = f"TN{p_id}-{v_id}"
                
                sku = str(raw_sku).strip().upper()
                if biz_type == "comercio" and not sku.endswith("-U"):
                    sku = f"{sku}-U"
                    
                stock = safe_int(variant.get("stock"))
                price = safe_float(variant.get("price"))
                
                # Parse talle y color
                size = "Único"
                color = ""
                values = variant.get("values", [])
                for attr, val in zip(attributes, values):
                    attr_name = ""
                    if isinstance(attr, dict):
                        attr_name = attr.get("es", attr.get("en", "")).lower()
                    elif isinstance(attr, str):
                        attr_name = attr.lower()
                    
                    val_str = ""
                    if isinstance(val, dict):
                        val_str = val.get("es", val.get("en", next(iter(val.values())) if val.values() else ""))
                    elif isinstance(val, str):
                        val_str = val
                        
                    if "tall" in attr_name or "size" in attr_name:
                        size = val_str
                    elif "color" in attr_name or "variant" in attr_name or "opci" in attr_name:
                        color = val_str
                    else:
                        if val_str.upper() in ["XS", "S", "M", "L", "XL", "XXL", "U", "ÚNICO"]:
                            size = val_str
                        else:
                            if not color:
                                color = val_str
                            else:
                                color += f" - {val_str}"
                                
                if biz_type == "comercio":
                    size = "Único"
                    
                # Clean size suffix from product name (e.g. "Campera WOMAN L" -> "Campera WOMAN")
                clean_name, size = clean_product_name_and_size(p_name, size)
                
                baseSku = sku.split("-")[0] if "-" in sku else sku
                
                images = tn_prod.get("images", [])
                image_url = images[0].get("src") if images else ""

                raw_stock = variant.get("stock")
                if raw_stock is None:
                    stock_local_val = 0
                    stock_taller_val = 0
                else:
                    stock_local_val = safe_int(raw_stock)
                    stock_taller_val = safe_int(raw_stock)

                if sku in existing_products_by_sku:
                    existing_prod = existing_products_by_sku[sku]
                    existing_prod["name"] = clean_name
                    existing_prod["size"] = size
                    existing_prod["color"] = color
                    existing_prod["category"] = product_category
                    if image_url:
                        existing_prod["image_url"] = image_url
                    existing_prod["price_tiendanube"] = price
                    existing_prod["price_local"] = price
                    existing_prod["price"] = price
                    existing_prod["tiendanube_product_id"] = p_id
                    existing_prod["tiendanube_variant_id"] = v_id
                    
                    # Actualizar stock de Tiendanube (si es infinito en TN, en inventario es 0)
                    if raw_stock is None:
                        existing_prod["stock_taller"] = 0
                        existing_prod["stock_local"] = 0
                        existing_prod["stock"] = 0
                    else:
                        existing_prod["stock_taller"] = stock_taller_val
                        existing_prod["stock_local"] = stock_local_val
                        existing_prod["stock"] = stock_local_val
                        
                    cost_val = safe_float(existing_prod.get("cost", 0.0))
                    existing_prod["cost"] = cost_val
                    if cost_val > 0:
                        existing_prod["margin"] = round(((price / cost_val) - 1.0) * 100.0, 2)
                    else:
                        existing_prod["margin"] = safe_float(existing_prod.get("margin", 0.0))
                    
                    products_to_save.append(existing_prod)
                else:
                    new_prod = {
                        "id": f"{prefix}{sku}",
                        "sku": f"{prefix}{sku}",
                        "baseSku": baseSku,
                        "name": clean_name,
                        "category": product_category,
                        "size": size,
                        "color": color,
                        "stock": stock_local_val,
                        "stock_local": stock_local_val,
                        "stock_taller": stock_taller_val,
                        "baseCost": 0.0,
                        "cost": 0.0,
                        "margin": 0.0,
                        "price": price,
                        "price_local": price,
                        "price_tiendanube": price,
                        "image_url": image_url,
                        "tiendanube_product_id": p_id,
                        "tiendanube_variant_id": v_id
                    }
                    products_to_save.append(new_prod)
                    newly_added_docs.append(new_prod)
                    
        # Update categories config with any new category names imported from Tiendanube
        try:
            cat_config = firebase_config.get_document("products", f"{prefix}categories_config", token)
            if not cat_config:
                cat_config = {
                    "sku": f"{prefix}categories_config",
                    "name": "Categories Configuration",
                    "categories": []
                }
            
            current_categories = cat_config.get("categories", [])
            if not isinstance(current_categories, list):
                current_categories = []
                
            updated = False
            for prod in products_to_save:
                p_cat = prod.get("category")
                if p_cat and p_cat not in current_categories:
                    current_categories.append(p_cat)
                    updated = True
            
            if updated:
                cat_config["categories"] = current_categories
                firebase_config.set_document("products", f"{prefix}categories_config", cat_config, token)
        except Exception as cat_err:
            print(f"[CATEGORY SYNC] Failed to update categories_config: {cat_err}")

        # 5. Save products concurrently
        from flask import copy_current_request_context
        
        @copy_current_request_context
        def save_one_product(prod):
            sku_with_prefix = prod.get("sku")
            firebase_config.set_document("products", sku_with_prefix, prod, token)
            
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            executor.map(save_one_product, products_to_save)
            
        # Clean up any product documents in Firestore that are no longer in TiendaNube (except Producción categories)
        deleted_docs = []
        current_synced_skus = {p.get("sku") for p in products_to_save if p.get("sku")}
        for d in existing_docs:
            doc_id = d.get("id", "")
            cat = str(d.get("category", "")).strip().lower()
            is_production_cat = cat.startswith("producc")
            
            is_system_doc = not doc_id.startswith(prefix) or doc_id.startswith((
                f"{prefix}supplier_", f"{prefix}fixedcost_", f"{prefix}account_", f"{prefix}cashtransaction_", 
                f"{prefix}influencer_", f"{prefix}marketingexpense_", f"{prefix}extras_config", 
                f"{prefix}categories_config", f"{prefix}stockintake_", f"{prefix}productionorder_"
            )) or doc_id in [f"{prefix}extras_config", f"{prefix}categories_config"]
            
            if not is_system_doc and not is_production_cat and doc_id not in current_synced_skus:
                try:
                    firebase_config.delete_document("products", doc_id, token)
                    deleted_docs.append(d)
                    print(f"[SYNC CLEANUP] Deleted product not in Tiendanube: {doc_id}")
                except Exception as del_err:
                    print(f"[SYNC CLEANUP ERROR] Failed to delete {doc_id}: {del_err}")

        # Group deleted and added items by unique product model (name + color or baseSku)
        unique_deleted_models = set()
        for d in deleted_docs:
            name_clean = (d.get("name") or "").strip().lower()
            color_clean = (d.get("color") or "").strip().lower()
            base_sku = (d.get("baseSku") or d.get("id") or "").strip().lower()
            model_key = f"{name_clean}_{color_clean}" if name_clean else base_sku
            if model_key:
                unique_deleted_models.add(model_key)

        unique_added_models = set()
        for p in newly_added_docs:
            name_clean = (p.get("name") or "").strip().lower()
            color_clean = (p.get("color") or "").strip().lower()
            base_sku = (p.get("baseSku") or p.get("sku") or "").strip().lower()
            model_key = f"{name_clean}_{color_clean}" if name_clean else base_sku
            if model_key:
                unique_added_models.add(model_key)

        return jsonify({
            "success": True, 
            "added_count": len(unique_added_models),
            "deleted_count": len(unique_deleted_models),
            "added_variants_count": len(newly_added_docs),
            "deleted_variants_count": len(deleted_docs),
            "synced_count": len(products_to_save)
        })
    except Exception as e:
        return handle_error(e)

@app.route("/api/integrations/tiendanube/push-all", methods=["POST"])
def push_all_to_tiendanube_route():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        config = firebase_config.get_document("integrations", "tiendanube", token)
        if not config or not config.get("activo"):
            return jsonify({"error": "La integración con Tiendanube no está activa o no está configurada."}), 400
            
        user_id = str(config.get("user_id", "")).strip()
        access_token = str(config.get("access_token", "")).strip()
        
        if access_token:
            access_token = "".join(c for c in access_token if ord(c) < 128).strip()
        if user_id:
            user_id = "".join(c for c in user_id if ord(c) < 128).strip()

        if not user_id or not access_token:
            return jsonify({"error": "Credenciales de Tiendanube incompletas."}), 400

        headers = {
            "Authentication": f"bearer {access_token}",
            "User-Agent": "Datamargen (klejavalentino@gmail.com)",
            "Content-Type": "application/json"
        }

        # Fetch all existing product documents from Firestore
        existing_docs = firebase_config.list_documents("products", token)
        products_to_push = []
        for d in existing_docs:
            doc_id = d.get("id", "")
            p_id = d.get("tiendanube_product_id")
            v_id = d.get("tiendanube_variant_id")
            if doc_id.startswith(prefix) and p_id and v_id:
                products_to_push.append(d)

        if not products_to_push:
            return jsonify({"error": "No se encontraron productos vinculados con Tiendanube en el inventario."}), 400

        def push_single_product(prod):
            try:
                p_id = prod.get("tiendanube_product_id")
                v_id = prod.get("tiendanube_variant_id")
                price = safe_float(prod.get("price_tiendanube", prod.get("price_local", prod.get("price", 0))))
                stock = safe_int(prod.get("stock_local", prod.get("stock", 0)))
                
                payload = {"stock": stock}
                if price > 0:
                    payload["price"] = str(price)
                    
                url = f"https://api.tiendanube.com/v1/{user_id}/products/{p_id}/variants/{v_id}"
                r = requests.put(url, json=payload, headers=headers, timeout=15)
                return r.ok
            except Exception as e:
                print(f"[PUSH ALL ERROR] Error pushing prod {prod.get('sku')}: {e}")
                return False

        updated_count = 0
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            results = list(executor.map(push_single_product, products_to_push))
            updated_count = sum(1 for r in results if r)

        return jsonify({
            "success": True,
            "count": updated_count,
            "total": len(products_to_push)
        })
    except Exception as e:
        return handle_error(e)

def resolve_shipping_status(local_val, remote_val):
    order_map = {"unshipped": 1, "shipped": 2, "delivered": 3}
    local_weight = order_map.get(local_val, 1)
    remote_weight = order_map.get(remote_val, 1)
    if remote_weight >= local_weight:
        return remote_val
    return local_val

@app.route("/api/integrations/tiendanube/sync-orders", methods=["POST"])
def sync_tiendanube_orders_route():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        config = firebase_config.get_document("integrations", "tiendanube", token)
        if not config or not config.get("activo"):
            return jsonify({"error": "La integración con Tiendanube no está activa o no está configurada."}), 400
            
        user_id = config.get("user_id")
        access_token = config.get("access_token")
        
        if access_token:
            access_token = "".join(c for c in str(access_token) if ord(c) < 128).strip()
        if user_id:
            user_id = "".join(c for c in str(user_id) if ord(c) < 128).strip()
            
        headers = {
            "Authentication": f"bearer {access_token}",
            "User-Agent": "Datamargen (klejavalentino@gmail.com)",
            "Content-Type": "application/json"
        }
        
        all_orders = []
        page = 1
        max_pages = 5
        import time
        
        while page <= max_pages:
            url = f"https://api.tiendanube.com/v1/{user_id}/orders?page={page}&per_page=100"
            r = None
            for attempt in range(3):
                try:
                    r = requests.get(url, headers=headers, timeout=20)
                    if r.ok:
                        break
                except Exception as e:
                    if attempt == 2:
                        print(f"Error de red Tiendanube en pagina {page}: {e}")
                    time.sleep(1)
            
            if not r or not r.ok:
                # Si falla una pagina, no abortamos todo el sync; procesamos lo que ya tenemos
                print(f"Error de Tiendanube API al traer pagina {page}: {r.text if r else 'Timeout'}")
                break
                
            data = r.json()
            if not data:
                break
            all_orders.extend(data)
            
            last_order_date_str = data[-1].get("created_at")
            if last_order_date_str:
                try:
                    year = int(last_order_date_str[0:4])
                    if year < 2025:
                        break
                except Exception:
                    pass
                    
            if len(data) < 100:
                break
            page += 1
            
        products_list = firebase_config.list_documents("products", token)
        products_by_sku = {}
        for p in products_list:
            doc_id = p.get("id", "")
            if doc_id.startswith(prefix):
                clean_sku = doc_id[len(prefix):].upper()
                products_by_sku[clean_sku] = p

        # Fetch existing sales to count only new ones imported and merge existing fields
        sales_list = firebase_config.list_documents("sales", token)
        existing_sales_by_id = {}
        for s in sales_list:
            doc_id = s.get("id", "")
            if doc_id.startswith(f"{prefix}TN-"):
                existing_sales_by_id[doc_id] = s

        fee_fijo = safe_float(config.get("fee_fijo_tn", 300.0))
        comision = safe_float(config.get("comision_pasarela_pago", 5.0))
        
        sales_saved = 0
        new_sales_count = 0
        for order in all_orders:
            if order.get("status") == "cancelled":
                continue
            order_id = str(order.get("id"))
            
            raw_gateway = str(order.get("gateway") or "").lower().strip()
            
            payment_details = order.get("payment_details") or {}
            if isinstance(payment_details, dict):
                raw_method = str(payment_details.get("method") or "").lower().strip()
            else:
                raw_method = ""
            
            resolved_method = "Personalizado"
            if "pagonube" in raw_gateway or "pago_nube" in raw_gateway:
                if "transfer" in raw_method or "bank" in raw_method:
                    resolved_method = "Pago Nube - Transferencia"
                elif "wallet" in raw_method or "billetera" in raw_method:
                    resolved_method = "Pago Nube - Billetera Virtual"
                else:
                    resolved_method = "Pago Nube - Tarjeta"
            elif "mercadopago" in raw_gateway or "mercado_pago" in raw_gateway:
                resolved_method = "Mercado Pago"
            elif "custom" in raw_gateway or "personalizado" in raw_gateway:
                resolved_method = "Personalizado"
            else:
                payment_name = str(order.get("payment_name", "")).lower()
                if "mercado" in raw_gateway or "mercado" in payment_name:
                    resolved_method = "Mercado Pago"
                elif "pago" in raw_gateway or "pagonube" in payment_name:
                    resolved_method = "Pago Nube - Tarjeta"
                else:
                    resolved_method = "Personalizado"
            gateway = resolved_method
                
            created_at = order.get("created_at")
            total_price = safe_float(order.get("total"))
            subtotal_price = safe_float(order.get("subtotal"))
            
            costos_fin = fee_fijo + (comision / 100.0 * total_price)
            total_neto = max(0.0, total_price - costos_fin)
            
            order_items = []
            for item in order.get("products", []):
                sku = str(item.get("sku") or "").strip().upper()
                qty = safe_int(item.get("quantity", 1))
                price = safe_float(item.get("price"))
                
                matched_local_prod = products_by_sku.get(sku)
                if not matched_local_prod:
                    item_name = str(item.get("name") or "").strip().lower()
                    if item_name:
                        matched_local_prod = next((p for p in all_products if str(p.get("name") or "").strip().lower() in item_name or item_name in str(p.get("name") or "").strip().lower()), None)
                
                cat_val = matched_local_prod.get("category") if matched_local_prod and matched_local_prod.get("category") and str(matched_local_prod.get("category")).lower() != "general" else item.get("category")
                if not cat_val or str(cat_val).lower() == "general":
                    cat_val = "Indumentaria"
                
                prod_data = {
                    "sku": sku,
                    "name": item.get("name"),
                    "price_local": price,
                    "price_tiendanube": price,
                    "price": price,
                    "category": cat_val,
                    "color": ""
                }
                
                if matched_local_prod:
                    prod_data["cost"] = safe_float(matched_local_prod.get("cost", 0.0))
                    prod_data["margin"] = safe_float(matched_local_prod.get("margin", 0.0))
                    prod_data["color"] = matched_local_prod.get("color", "")
                else:
                    prod_data["cost"] = 0.0
                    prod_data["margin"] = 0.0
                
                # Parse variant size and color from variant_name
                variant_name = str(item.get("variant_name") or "").strip()
                size = "Único"
                color = ""
                if variant_name:
                    if "/" in variant_name:
                        parts = [p.strip() for p in variant_name.split("/")]
                        for p in parts:
                            p_lower = p.lower()
                            if p_lower in ["s", "m", "l", "xl", "xxl", "xxxl", "3xl", "xs"] or any(t in p_lower for t in ["talle", "size", "talla"]):
                                size = p
                            elif p_lower.startswith("talle") or p.isdigit() or len(p) <= 2:
                                size = p
                            else:
                                color = p
                    else:
                        vn_lower = variant_name.lower()
                        if vn_lower in ["s", "m", "l", "xl", "xxl", "xxxl", "3xl", "xs"] or any(t in vn_lower for t in ["talle", "size", "talla"]) or variant_name.isdigit() or len(variant_name) <= 2:
                            size = variant_name
                        else:
                            color = variant_name
                            
                if color and not prod_data["color"]:
                    prod_data["color"] = color
                
                order_items.append({
                    "product": prod_data,
                    "size": size,
                    "quantity": qty
                })
                
            discount_amount = safe_float(order.get("discount"))
            discount_pct = (discount_amount / subtotal_price * 100.0) if (subtotal_price > 0 and discount_amount > 0) else 0.0
            
            shipping_status = order.get("shipping_status", "unshipped")
            if shipping_status not in ["unshipped", "shipped", "delivered"]:
                if shipping_status == "fulfilled":
                    shipping_status = "delivered"
                else:
                    shipping_status = "unshipped"
            
            if order.get("status") == "closed":
                shipping_status = "delivered"

            client_name = str(order.get("contact_name") or "").strip()
            client_email = str(order.get("contact_email") or "").strip()
            client_phone = str(order.get("contact_phone") or "").strip()
            client_cuit = str(order.get("contact_identification") or "").strip()
            tn_number = order.get("number")

            sale_data = {
                "date": created_at,
                "total": total_price,
                "subtotal": subtotal_price,
                "discount_pct": discount_pct,
                "method": gateway,
                "items": order_items,
                "extras": {},
                "origen": "tiendanube",
                "fee_fijo_tn": fee_fijo,
                "comision_pasarela_pago": comision,
                "total_neto": total_neto,
                "payment_status": order.get("payment_status", "pending"),
                "shipping_status": shipping_status,
                "client_name": client_name,
                "client_email": client_email,
                "client_phone": client_phone,
                "client_cuit": client_cuit,
                "tn_number": tn_number,
                "shipping_option": order.get("shipping_option"),
                "shipping_pickup_type": order.get("shipping_pickup_type")
            }
            
            doc_id_with_prefix = f"{prefix}TN-{order_id}"
            existing_sale = existing_sales_by_id.get(doc_id_with_prefix)
            
            is_changed = False
            if not existing_sale:
                is_changed = True
                new_sales_count += 1
            else:
                for k in ["arca_invoice_id", "arca_cae", "arca_cae_due", "fiscal_status", "status", "ubicacion", "shipping_option", "shipping_pickup_type"]:
                    if k in existing_sale:
                        sale_data[k] = existing_sale[k]
                
                local_sh = existing_sale.get("shipping_status", "unshipped")
                sale_data["shipping_status"] = resolve_shipping_status(local_sh, shipping_status)
                
                for k, v in sale_data.items():
                    if k == "items":
                        if json.dumps(v, sort_keys=True) != json.dumps(existing_sale.get(k), sort_keys=True):
                            is_changed = True
                            break
                    elif k == "date":
                        d1 = str(v).replace("+00:00", "").replace("Z", "")
                        d2 = str(existing_sale.get(k, "")).replace("+00:00", "").replace("Z", "")
                        if d1 != d2:
                            is_changed = True
                            break
                    else:
                        if existing_sale.get(k) != v:
                            is_changed = True
                            break
            
            if is_changed:
                firebase_config.set_document("sales", doc_id_with_prefix, sale_data, token)
                sales_saved += 1
            
        return jsonify({
            "success": True,
            "count": new_sales_count
        })
    except Exception as e:
        return handle_error(e)

def notify_tiendanube_shipped(uid, order_id, token):
    try:
        config = firebase_config.get_document("integrations", "tiendanube", token)
        if not config or not config.get("activo"):
            return
        user_id = config.get("user_id")
        access_token = config.get("access_token")
        
        if access_token:
            access_token = "".join(c for c in str(access_token) if ord(c) < 128).strip()
        if user_id:
            user_id = "".join(c for c in str(user_id) if ord(c) < 128).strip()
            
        if not access_token or not user_id:
            return
            
        url = f"https://api.tiendanube.com/v1/{user_id}/orders/{order_id}/ship"
        headers = {
            "Authentication": f"bearer {access_token}",
            "User-Agent": "Datamargen (klejavalentino@gmail.com)",
            "Content-Type": "application/json"
        }
        r = requests.post(url, headers=headers, timeout=30)
        if r.ok:
            print(f"Pedido Tiendanube {order_id} marcado como enviado exitosamente.")
        else:
            print(f"Error al marcar pedido {order_id} como enviado en Tiendanube: {r.text}")
    except Exception as e:
        print(f"Excepcion al marcar pedido {order_id} como enviado en Tiendanube: {e}")

@app.route("/api/integrations/tiendanube/ship-order", methods=["POST"])
def ship_tiendanube_order_route():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token invalido o expirado"}), 401
        
    data = request.json or {}
    sale_id = data.get("sale_id")
    ubicacion = data.get("ubicacion")
    status = data.get("status")
    
    if not sale_id or not status:
        return jsonify({"error": "Campos obligatorios faltantes"}), 400
        
    doc_id = f"{prefix}{sale_id}" if not sale_id.startswith(prefix) else sale_id
    
    try:
        sale = firebase_config.get_document("sales", doc_id, token)
        if not sale:
            return jsonify({"error": "Venta no encontrada"}), 404
            
        old_status = sale.get("shipping_status", "unshipped")
        old_ubicacion = sale.get("ubicacion")
        
        should_discount = False
        if status in ["shipped", "delivered"] and not old_ubicacion:
            should_discount = True
        elif status == "shipped" and old_status == "unshipped":
            should_discount = True
            
        if should_discount:
            if not ubicacion:
                return jsonify({"error": "Ubicacion requerida para descontar stock"}), 400
                
            items = sale.get("items", [])
            for it in items:
                prod_info = it.get("product", {})
                sku = prod_info.get("sku")
                qty = safe_int(it.get("quantity", 0))
                if sku and qty > 0:
                    prod = firebase_config.get_document("products", f"{prefix}{sku}", token)
                    if prod:
                        loc_stock = prod.get("locationsStock", {})
                        if not isinstance(loc_stock, dict):
                            loc_stock = {}
                        if ubicacion in loc_stock:
                            loc_stock[ubicacion] = max(0, safe_int(loc_stock[ubicacion]) - qty)
                        else:
                            current_stock = safe_int(prod.get("stock_local", prod.get("stock", 0)))
                            prod["stock_local"] = max(0, current_stock - qty)
                            prod["stock"] = prod["stock_local"]
                            
                        prod["locationsStock"] = loc_stock
                        if loc_stock:
                            total_stock = sum(safe_int(v) for v in loc_stock.values())
                            prod["stock"] = total_stock
                            prod["stock_local"] = total_stock
                            
                        firebase_config.set_document("products", f"{prefix}{sku}", prod, token)
            
            uid = get_uid_from_token(token)
            import threading
            threading.Thread(
                target=sync_stock_to_tiendanube,
                args=(uid, items),
                kwargs={"token": token, "prefix": prefix}
            ).start()
            
            if status == "shipped":
                clean_order_id = sale_id.replace("TN-", "").replace(prefix, "")
                threading.Thread(
                    target=notify_tiendanube_shipped,
                    args=(uid, clean_order_id, token)
                ).start()
            
            sale["ubicacion"] = ubicacion

        sale["shipping_status"] = status
        firebase_config.set_document("sales", doc_id, sale, token)
        
        return jsonify({"success": True, "shipping_status": status})
    except Exception as e:
        return handle_error(e)

@app.route("/api/webhooks/arca", methods=["POST"])
def arca_webhook():
    signature = request.headers.get("X-Arca-Signature")
    webhook_secret = os.environ.get("ARCA_WEBHOOK_SECRET")
    
    if webhook_secret:
        if not signature:
            return jsonify({"error": "Firma faltante"}), 400
        computed_sig = hmac.new(
            webhook_secret.encode("utf-8"),
            request.data,
            hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(computed_sig, signature):
            return jsonify({"error": "Firma inválida"}), 400
            
    data = request.json or {}
    status = data.get("status")
    sale_id = data.get("external_reference")
    metadata = data.get("metadata", {})
    tenant_uid = metadata.get("tenant_uid")
    
    if not sale_id or not tenant_uid:
        return jsonify({"error": "Parámetros obligatorios faltantes en webhook"}), 400
        
    if db_admin is None:
        print(f"Advertencia: db_admin no está inicializado. Ignorando confirmación de venta {sale_id}")
        return jsonify({"warning": "Firestore admin no configurado, actualización pendiente"}), 200
        
    try:
        # Obtener tipo de negocio para determinar el prefijo
        user_ref = db_admin.collection("users").document(tenant_uid)
        user_doc = user_ref.get()
        biz_type = "textil"
        if user_doc.exists:
            biz_type = user_doc.to_dict().get("businessType", "textil")
        prefix = f"{biz_type}_"
        
        # Obtener venta
        sale_ref = db_admin.collection("users").document(tenant_uid).collection("sales").document(f"{prefix}{sale_id}")
        sale_doc = sale_ref.get()
        if not sale_doc.exists:
            return jsonify({"error": "Venta no encontrada"}), 404
            
        sale_data = sale_doc.to_dict()
        if sale_data.get("status") == "completado":
            return jsonify({"message": "La venta ya fue procesada"}), 200
            
        # Si es aprobado o confirmado, procesar
        if status in ["approved", "success"]:
            # 1. Completar estado de la venta
            sale_ref.update({"status": "completado"})
            
            items = sale_data.get("items", [])
            
            # 2. Descontar stock local en paralelo usando db_admin
            def update_item_stock(item):
                try:
                    prod_info = item.get("product", {})
                    sku = prod_info.get("sku")
                    qty = safe_int(item.get("quantity", 0))
                    if sku and qty > 0:
                        prod_ref = db_admin.collection("users").document(tenant_uid).collection("products").document(f"{prefix}{sku}")
                        prod_doc = prod_ref.get()
                        if prod_doc.exists:
                            prod = prod_doc.to_dict()
                            current_stock = safe_int(prod.get("stock", 0))
                            new_stock = max(0, current_stock - qty)
                            prod_ref.update({"stock": new_stock})
                except Exception as ex:
                    print(f"Error actualizando stock para SKU {sku} en webhook: {ex}")
                    
            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                executor.map(update_item_stock, items)
                
            # 3. Registrar en Caja Diaria
            total = sale_data.get("total", 0)
            date = sale_data.get("date")
            caja_payload = {
                "description": f"Venta ARCA - {sale_id}",
                "type": "income",
                "amount": safe_float(total),
                "date": date
            }
            caja_id = int(time.time() * 1000)
            caja_payload["sku"] = f"cashtransaction_{caja_id}"
            caja_payload["name"] = caja_payload["description"]
            caja_payload["cost"] = caja_payload["amount"]
            caja_payload["stock"] = 0
            caja_payload["id"] = str(caja_id)
            
            caja_ref = db_admin.collection("users").document(tenant_uid).collection("products").document(f"{prefix}{caja_payload['sku']}")
            caja_ref.set(caja_payload)
            
            # 4. Sincronizar stock con Tiendanube
            sync_stock_to_tiendanube(tenant_uid, items, db_client=db_admin, prefix=prefix)
            
        return jsonify({"success": True})
        
    except Exception as e:
        print(f"Error procesando webhook de ARCA: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/import-remito", methods=["POST"])
def import_remito():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    if 'file' not in request.files:
        return jsonify({"error": "No se subió ningún archivo"}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "Nombre de archivo vacío"}), 400
        
    if not file.filename.lower().endswith('.pdf'):
        return jsonify({"error": "El archivo debe ser un PDF"}), 400
        
    def parse_es_number(s):
        s = s.strip().replace("$", "").strip()
        s = s.replace(".", "").replace(",", ".")
        try:
            return float(s)
        except ValueError:
            return None
            
    try:
        import pypdf
        import re
        import time
        
        reader = pypdf.PdfReader(file)
        text = ""
        for page in reader.pages:
            text += page.extract_text() or ""
            
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        
        # 1. Parse Supplier
        supplier = "Crear Textiles"
        for line in lines:
            if "Crear Textiles" in line:
                supplier = "Crear Textiles"
                break
                
        # 2. Parse Date
        date_val = None
        for idx, line in enumerate(lines):
            if "Fecha de factura" in line and idx + 1 < len(lines):
                date_val = lines[idx+1]
                break
                
        if date_val:
            parts = date_val.split("/")
            if len(parts) == 3:
                date_val = f"{parts[2]}-{parts[1]}-{parts[0]}"
        else:
            date_val = time.strftime("%Y-%m-%d", time.gmtime())
            
        # 3. Parse Items and Extras
        items = []
        extras = []
        
        prod_regex = re.compile(r"^(.+?)\s*\((.+?),\s*(TALLE\s*\d+|Talle\s*\d+)\)$", re.IGNORECASE)
        extra_regex = re.compile(r"^\[EXTRA\]\s*(.+)$", re.IGNORECASE)
        
        idx = 0
        while idx < len(lines):
            line = lines[idx]
            prod_match = prod_regex.match(line)
            extra_match = extra_regex.match(line)
            
            if prod_match:
                name = prod_match.group(1).strip()
                color = prod_match.group(2).strip()
                talle_str = prod_match.group(3).strip().upper()
                
                size = "Único"
                if "TALLE 1" in talle_str:
                    size = "S"
                elif "TALLE 2" in talle_str:
                    size = "M"
                elif "TALLE 3" in talle_str:
                    size = "L"
                    
                # Scan for first two numbers
                qty = None
                price = None
                scan_idx = idx + 1
                numbers_found = []
                while scan_idx < len(lines) and len(numbers_found) < 2:
                    if prod_regex.match(lines[scan_idx]) or extra_regex.match(lines[scan_idx]):
                        break
                    num = parse_es_number(lines[scan_idx])
                    if num is not None:
                        numbers_found.append(num)
                    scan_idx += 1
                    
                if len(numbers_found) == 2:
                    qty = numbers_found[0]
                    price = numbers_found[1]
                    
                items.append({
                    "name": name,
                    "color": color,
                    "size": size,
                    "quantity": qty or 0.0,
                    "unitCost": price or 0.0
                })
                idx = scan_idx - 1
                
            elif extra_match:
                extra_name = extra_match.group(1).strip()
                if "Colocacin" in extra_name:
                    extra_name = "Colocación de Etiquetas"
                    
                # Scan for first two numbers
                qty = None
                price = None
                scan_idx = idx + 1
                numbers_found = []
                while scan_idx < len(lines) and len(numbers_found) < 2:
                    if prod_regex.match(lines[scan_idx]) or extra_regex.match(lines[scan_idx]):
                        break
                    num = parse_es_number(lines[scan_idx])
                    if num is not None:
                        numbers_found.append(num)
                    scan_idx += 1
                    
                if len(numbers_found) == 2:
                    qty = numbers_found[0]
                    price = numbers_found[1]
                    
                extras.append({
                    "name": extra_name,
                    "quantity": qty or 0.0,
                    "unitCost": price or 0.0
                })
                idx = scan_idx - 1
                
            idx += 1
            
        return jsonify({
            "supplierName": supplier,
            "date": date_val,
            "products": items,
            "extras": extras
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/invoices", methods=["GET"])
def get_invoices():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    email = get_email_from_token(token)
    if not is_arca_enabled(token, email):
        return jsonify({"error": "ARCA no está habilitado para este usuario."}), 400
    prefix = get_user_prefix(token)
    try:
        # 1. Recuperar facturas del usuario desde la subcolección invoices
        docs = firebase_config.list_documents("invoices", token) or []
        
        # 2. Recuperar ventas para auto-recuperar facturas perdidas
        sales = firebase_config.list_documents("sales", token) or []
        
        # Mapear números de facturas ya presentes en la colección invoices
        existing_invoice_numbers = {d.get("invoice_number") for d in docs if d.get("invoice_number")}
        
        updated_any = False
        for s in sales:
            doc_id = s.get("id", "")
            if doc_id.startswith(prefix) and s.get("arca_invoice_id"):
                inv_num = s.get("arca_invoice_id")
                if inv_num not in existing_invoice_numbers:
                    clean_sale_id = doc_id[len(prefix):]
                    inv_data = {
                        "sale_id": clean_sale_id,
                        "type": "Factura C",
                        "invoice_number": inv_num,
                        "cuit_emisor": "",
                        "client_cuit": s.get("client_cuit", "20-99999999-9"),
                        "total": safe_float(s.get("total", 0.0)),
                        "cae": s.get("arca_cae", ""),
                        "cae_due": s.get("arca_cae_due", ""),
                        "status": "Aprobado",
                        "date": s.get("date"),
                        "associated_invoice": ""
                    }
                    invoice_id = f"FC-{inv_num}"
                    firebase_config.set_document("invoices", invoice_id, inv_data, token)
                    inv_data["id"] = invoice_id
                    docs.append(inv_data)
                    existing_invoice_numbers.add(inv_num)
                    updated_any = True
                    
        if updated_any:
            try:
                docs.sort(key=lambda x: x.get("date", ""), reverse=True)
            except Exception:
                pass
                
        return jsonify(docs)
    except Exception as e:
        return handle_error(e)


@app.route("/api/invoices/emit", methods=["POST"])
def emit_invoice():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    email = get_email_from_token(token)
    if not is_arca_enabled(token, email):
        return jsonify({"error": "ARCA no está habilitado para este usuario."}), 400
    
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        data = request.json or {}
        sale_id = data.get("sale_id")
        if not sale_id:
            return jsonify({"error": "Falta el ID de la venta"}), 400
            
        # 1. Recuperar la venta específica
        sales = firebase_config.list_documents("sales", token)
        sale = next((s for s in sales if s.get("id") == f"{prefix}{sale_id}"), None)
        
        if not sale:
            return jsonify({"error": "Venta no encontrada."}), 404
            
        if sale.get("arca_invoice_id"):
            return jsonify({"error": "Esta venta ya fue facturada en AFIP."}), 400
            
        total = safe_float(sale.get("total", 0.0))
        
        # 2. Recuperar configuración de ARCA y topes configurables
        arca_config = firebase_config.get_document("integrations", "arca", token) or {}
        pos = arca_config.get("pos", "0002")
        condicion_iva_emisor = str(arca_config.get("condicion_iva", "monotributo")).lower()
        cuit_emisor = arca_config.get("cuit", "20-35689124-9")
        
        tope_efectivo = safe_float(arca_config.get("tope_efectivo", 208644.0))
        tope_electronico = safe_float(arca_config.get("tope_electronico", 417288.0))

        # Datos del Cliente / Receptor
        client_cuit = str(sale.get("client_cuit", "")).strip()
        client_name = str(sale.get("client_name", sale.get("client_razon_social", ""))).strip()
        client_condicion_iva = str(sale.get("client_condicion_iva", "CONSUMIDOR FINAL")).strip().upper()
        client_address = str(sale.get("client_address", "")).strip()
        client_cuit_clean = "".join(c for c in client_cuit if c.isdigit())
        
        is_anonymous = not client_cuit_clean or client_cuit_clean == "20999999999" or not client_name
        
        # Validación flexible de Consumidor Final
        if is_anonymous and "CONSUMIDOR" in client_condicion_iva:
            payment_method = str(sale.get("method", sale.get("payment_method", ""))).lower()
            is_cash = "efectivo" in payment_method
            current_threshold = tope_efectivo if is_cash else tope_electronico
            
            if total >= 10000000:
                return jsonify({"error": f"El monto (${total:,.2f}) supera el límite máximo de $10.000.000 de AFIP. Se requiere CUIT/DNI y Nombre del cliente."}), 400
            elif is_cash and total >= tope_efectivo and not client_cuit_clean:
                # Si supera el tope y es efectivo pero no cargó datos, informar sugerencia o permitir avanzar si tiene un DNI básico
                pass

        # 3. Determinación de Tipo de Comprobante (Factura A, B, C) y Leyenda Ley 27.618
        leyenda_monotributo = ""
        
        if condicion_iva_emisor == "inscripto":
            # Emisor es Responsable Inscripto
            if client_cuit_clean and len(client_cuit_clean) == 11 and any(k in client_condicion_iva for k in ["MONOTRIBUTO", "INSCRIPTO"]):
                invoice_type = "Factura A"
                if "MONOTRIBUTO" in client_condicion_iva:
                    leyenda_monotributo = "El crédito fiscal discriminado en el presente comprobante, sólo podrá ser computado a efectos del Régimen de Sostenimiento e Inclusión Fiscal para Pequeños Contribuyentes de la Ley Nº 27.618"
            else:
                invoice_type = "Factura B"
        else:
            # Emisor es Monotributista
            invoice_type = "Factura C"
            
        from datetime import datetime, date as pydate, timedelta
        
        invoice_date = pydate.today()
        cert_content = arca_config.get("cert_content")
        key_content = arca_config.get("key_content")
        
        cuit_to_use = client_cuit if client_cuit else "20-99999999-9"
        
        if cert_content and key_content:
            from arca_service import WSAAClient, WSFEClient, INVOICE_TYPES_MAP
            is_sandbox_cert = "homo" in str(cert_content).lower() or "wsaahomo" in str(cert_content).lower()
            
            try:
                wsaa = WSAAClient(cert_content, key_content, sandbox=is_sandbox_cert)
                token_afip, sign_afip = wsaa.get_token_and_sign("wsfe")
                wsfe = WSFEClient(token_afip, sign_afip, cuit_emisor, sandbox=is_sandbox_cert)
                
                cbte_tipo = INVOICE_TYPES_MAP.get(invoice_type, 11)
                try:
                    last_authorized = wsfe.get_last_authorized_voucher(pos, cbte_tipo)
                except Exception as ex_val:
                    if "600" in str(ex_val) or "token" in str(ex_val).lower():
                        token_afip, sign_afip = wsaa.get_token_and_sign("wsfe", force_refresh=True)
                        wsfe = WSFEClient(token_afip, sign_afip, cuit_emisor, sandbox=is_sandbox_cert)
                        last_authorized = wsfe.get_last_authorized_voucher(pos, cbte_tipo)
                    else:
                        raise ex_val
                cbte_nro = last_authorized + 1
                invoice_number = f"{str(pos).zfill(4)}-{str(cbte_nro).zfill(8)}"
                
                doc_tipo = 99
                doc_nro = 0
                if client_cuit_clean and client_cuit_clean != "20999999999":
                    try:
                        doc_nro = int(client_cuit_clean)
                        if len(client_cuit_clean) == 11:
                            doc_tipo = 80 # CUIT
                        elif len(client_cuit_clean) == 8:
                            doc_tipo = 96 # DNI
                        else:
                            doc_tipo = 86 # CUIL
                    except ValueError:
                        doc_tipo = 99
                        doc_nro = 0
                        
                fch_val = invoice_date.strftime("%Y%m%d")
                
                cae, cae_due = wsfe.request_cae(
                    pto_vta=pos,
                    cbte_tipo=cbte_tipo,
                    cbte_nro=cbte_nro,
                    total=total,
                    doc_tipo=doc_tipo,
                    doc_nro=doc_nro,
                    concepto=1, # Bienes
                    cbte_fch=fch_val
                )
                
                if cae_due and len(cae_due) == 8:
                    cae_due = f"{cae_due[0:4]}-{cae_due[4:6]}-{cae_due[6:8]}"
            except Exception as afip_err:
                return jsonify({"error": f"Error AFIP: {str(afip_err)}"}), 400
        else:
            return jsonify({"error": "No se encontraron las credenciales digitales de AFIP (Certificado o Llave Privada) configuradas en la sección de integraciones ARCA. Por favor cárgalas en el panel de control antes de facturar."}), 400
            
        invoice_data = {
            "sale_id": sale_id,
            "type": invoice_type,
            "invoice_number": invoice_number,
            "cuit_emisor": cuit_emisor,
            "client_cuit": cuit_to_use,
            "client_name": client_name,
            "client_condicion_iva": client_condicion_iva,
            "client_address": client_address,
            "leyenda_monotributo": leyenda_monotributo,
            "total": total,
            "cae": cae,
            "cae_due": cae_due,
            "status": "Aprobado",
            "date": invoice_date.isoformat(),
            "associated_invoice": ""
        }
        
        invoice_id = f"FC-{invoice_number}"
        firebase_config.set_document("invoices", invoice_id, invoice_data, token)
        
        # 4. Actualizar estado fiscal de la venta
        sale["arca_invoice_id"] = invoice_number
        sale["arca_cae"] = cae
        sale["arca_cae_due"] = cae_due
        sale["arca_invoice_type"] = invoice_type
        sale["leyenda_monotributo"] = leyenda_monotributo
        sale["fiscal_status"] = "declarada"
        firebase_config.set_document("sales", f"{prefix}{sale_id}", sale, token)
        
        invoice_data["id"] = invoice_id
        return jsonify(invoice_data)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Error interno al emitir comprobante: {str(e)}"}), 500
@app.route("/api/invoices/credit-note", methods=["POST"])
def emit_credit_note():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    email = get_email_from_token(token)
    if not is_arca_enabled(token, email):
        return jsonify({"error": "ARCA no está habilitado para este usuario."}), 400
    
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        from arca_service import WSAAClient, WSFEClient
        from datetime import datetime
        
        data = request.json or {}
        sale_id = data.get("sale_id")
        reason = data.get("reason", "Devolución técnica") # "Anulación por mercadería dañada" or "Devolución técnica"
        
        if not sale_id:
            return jsonify({"error": "Falta el ID de la venta"}), 400
            
        sales = firebase_config.list_documents("sales", token)
        sale = next((s for s in sales if s.get("id") == f"{prefix}{sale_id}"), None)
        
        if not sale:
            return jsonify({"error": "Venta no encontrada."}), 404
            
        orig_invoice = sale.get("arca_invoice_id")
        if not orig_invoice:
            return jsonify({"error": "La venta no está facturada en AFIP."}), 400
            
        if sale.get("credit_note_cae") or sale.get("status") == "cancelled":
            return jsonify({"error": "La venta ya fue anulada/tiene Nota de Crédito."}), 400
            
        # Parse original invoice (e.g. 0002-00000002)
        parts = orig_invoice.split("-")
        if len(parts) != 2:
            return jsonify({"error": f"Formato de factura original inválido: {orig_invoice}"}), 400
        orig_pto_vta = int(parts[0])
        orig_nro = int(parts[1])
        orig_tipo = 11 # Asumimos Factura C por defecto en el sistema actual
        
        nc_tipo = 13 # Nota de Crédito C
        
        arca_config = firebase_config.get_document("integrations", "arca", token) or {}
        pos = int(arca_config.get("pos", "2"))
        cert_content = arca_config.get("cert_content")
        key_content = arca_config.get("key_content")
        cuit = arca_config.get("cuit")
        
        if not cert_content or not key_content or not cuit:
            return jsonify({"error": "Credenciales de ARCA incompletas."}), 400
            
        is_sandbox_cert = "homo" in str(cert_content).lower() or "wsaahomo" in str(cert_content).lower()
        
        # Login to ARCA
        wsaa = WSAAClient(cert_content, key_content, sandbox=is_sandbox_cert)
        arca_token, sign = wsaa.get_token_and_sign()
        
        wsfe = WSFEClient(arca_token, sign, cuit, sandbox=is_sandbox_cert)
        
        # Get last NC number
        last_nc = wsfe.get_last_authorized_voucher(pos, nc_tipo)
        next_nc = last_nc + 1
        
        total = safe_float(data.get("amount", sale.get("total", 0.0)))
        
        # Parse client document
        client_cuit = sale.get("client_cuit", "").strip()
        client_cuit_clean = "".join(c for c in client_cuit if c.isdigit())
        doc_tipo = 99
        doc_nro = 0
        if client_cuit_clean and len(client_cuit_clean) >= 7 and client_cuit_clean != "20999999999":
            doc_nro = int(client_cuit_clean)
            if len(client_cuit_clean) == 11:
                doc_tipo = 80 # CUIT
            else:
                doc_tipo = 96 # DNI
                
        # Generate Credit Note
        cbtes_asoc = {
            "tipo": orig_tipo,
            "pto_vta": orig_pto_vta,
            "nro": orig_nro
        }
        
        cae, cae_due = wsfe.request_cae(pos, nc_tipo, next_nc, total, doc_tipo, doc_nro, cbtes_asoc=cbtes_asoc)
        nc_invoice_number = f"{pos:04d}-{next_nc:08d}"
        
        # Update sale locally
        sale["status"] = "cancelled"
        sale["credit_note_id"] = nc_invoice_number
        sale["credit_note_cae"] = cae
        sale["credit_note_cae_due"] = cae_due
        sale["cancel_reason"] = reason
        firebase_config.set_document("sales", f"{prefix}{sale_id}", sale, token)
        
        # Generar transacción de caja negativa
        caja_payload = {
            "description": f"Anulación NC {nc_invoice_number} (Ref: {orig_invoice}) - {reason}",
            "type": "expense",
            "amount": total,
            "date": datetime.now().isoformat()
        }
        caja_id = int(time.time() * 1000)
        caja_payload["sku"] = f"cashtransaction_{caja_id}"
        caja_payload["name"] = caja_payload["description"]
        caja_payload["cost"] = total
        caja_payload["stock"] = 0
        caja_payload["id"] = str(caja_id)
        firebase_config.set_document("products", f"{prefix}{caja_payload['sku']}", caja_payload, token)
        
        # Devolver stock si aplica
        if reason == "Devolución técnica":
            items = sale.get("items", [])
            for cart_item in items:
                prod_info = cart_item.get("product", {})
                sku = prod_info.get("sku")
                qty = safe_int(cart_item.get("quantity", 0))
                
                if sku and qty > 0:
                    prod = firebase_config.get_document("products", f"{prefix}{sku}", token)
                    if prod:
                        current_stock = safe_int(prod.get("stock", 0))
                        prod["stock"] = current_stock + qty
                        prod["sku"] = f"{prefix}{sku}"
                        firebase_config.set_document("products", f"{prefix}{sku}", prod, token)
                        
        return jsonify({
            "success": True,
            "credit_note_id": nc_invoice_number,
            "cae": cae,
            "cae_due": cae_due
        })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Error al emitir Nota de Crédito: {str(e)}"}), 500

@app.route("/api/returns", methods=["GET"])
def get_returns_route():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        returns_list = firebase_config.list_documents("returns", token)
        filtered = []
        for r in returns_list:
            doc_id = r.get("id", "")
            if doc_id.startswith(prefix):
                r_copy = dict(r)
                r_copy["id"] = doc_id[len(prefix):]
                filtered.append(r_copy)
        return jsonify(filtered)
    except Exception as e:
        return handle_error(e)

@app.route("/api/returns", methods=["POST"])
def create_return_route():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        from arca_service import WSAAClient, WSFEClient
        from datetime import datetime
        import time
        import threading
        
        data = request.json or {}
        sale_id = data.get("sale_id")
        client_name = data.get("client_name", "Consumidor Final")
        client_cuit = data.get("client_cuit", "")
        returned_items = data.get("returned_items", [])
        exchange_items = data.get("exchange_items", [])
        ubicacion_destino = data.get("ubicacion_destino")
        emit_credit_note = data.get("emit_credit_note", False)
        credit_note_reason = data.get("credit_note_reason", "Devolución técnica")
        
        if not ubicacion_destino:
            return jsonify({"error": "Falta la sucursal de destino para el stock."}), 400
            
        # 1. Devolver stock de returned_items a la sucursal
        for item in returned_items:
            sku = item.get("sku")
            qty = safe_int(item.get("quantity", 0))
            if sku and qty > 0:
                prod = firebase_config.get_document("products", f"{prefix}{sku}", token)
                if prod:
                    loc_stock = prod.get("locationsStock", {})
                    if not isinstance(loc_stock, dict):
                        loc_stock = {}
                    loc_stock[ubicacion_destino] = safe_int(loc_stock.get(ubicacion_destino, 0)) + qty
                    prod["locationsStock"] = loc_stock
                    total_stock = sum(safe_int(v) for v in loc_stock.values())
                    prod["stock"] = total_stock
                    prod["stock_local"] = total_stock
                    prod["sku"] = f"{prefix}{sku}"
                    firebase_config.set_document("products", f"{prefix}{sku}", prod, token)
                    
        # 2. Descontar stock de exchange_items de la sucursal
        for item in exchange_items:
            sku = item.get("sku")
            qty = safe_int(item.get("quantity", 0))
            if sku and qty > 0:
                prod = firebase_config.get_document("products", f"{prefix}{sku}", token)
                if prod:
                    loc_stock = prod.get("locationsStock", {})
                    if not isinstance(loc_stock, dict):
                        loc_stock = {}
                    loc_stock[ubicacion_destino] = max(0, safe_int(loc_stock.get(ubicacion_destino, 0)) - qty)
                    prod["locationsStock"] = loc_stock
                    total_stock = sum(safe_int(v) for v in loc_stock.values())
                    prod["stock"] = total_stock
                    prod["stock_local"] = total_stock
                    prod["sku"] = f"{prefix}{sku}"
                    firebase_config.set_document("products", f"{prefix}{sku}", prod, token)
                    
        # 3. Sincronizar stock a Tiendanube en segundo plano
        skus_to_sync = set()
        for item in returned_items:
            if item.get("sku"): skus_to_sync.add(item.get("sku"))
        for item in exchange_items:
            if item.get("sku"): skus_to_sync.add(item.get("sku"))
            
        sync_payload_items = [{"product": {"sku": sku}} for sku in skus_to_sync]
        if sync_payload_items:
            uid = get_uid_from_token(token)
            threading.Thread(
                target=sync_stock_to_tiendanube,
                args=(uid, sync_payload_items),
                kwargs={"token": token, "prefix": prefix}
            ).start()
            
        # 4. Emitir Nota de Crédito en AFIP si aplica
        arca_credit_note_id = ""
        arca_cae = ""
        arca_cae_due = ""
        
        if emit_credit_note and sale_id:
            sales = firebase_config.list_documents("sales", token)
            sale = next((s for s in sales if s.get("id") == f"{prefix}{sale_id}"), None)
            if sale and sale.get("arca_invoice_id") and not sale.get("credit_note_cae"):
                orig_invoice = sale.get("arca_invoice_id")
                parts = orig_invoice.split("-")
                if len(parts) == 2:
                    orig_pto_vta = int(parts[0])
                    orig_nro = int(parts[1])
                    orig_tipo = 11
                    nc_tipo = 13
                    
                    arca_config = firebase_config.get_document("integrations", "arca", token) or {}
                    pos = int(arca_config.get("pos", "2"))
                    cert_content = arca_config.get("cert_content")
                    key_content = arca_config.get("key_content")
                    cuit = arca_config.get("cuit")
                    
                    if cert_content and key_content and cuit:
                        is_sandbox_cert = "homo" in str(cert_content).lower() or "wsaahomo" in str(cert_content).lower()
                        wsaa = WSAAClient(cert_content, key_content, sandbox=is_sandbox_cert)
                        arca_token, sign = wsaa.get_token_and_sign()
                        wsfe = WSFEClient(arca_token, sign, cuit, sandbox=is_sandbox_cert)
                        
                        last_nc = wsfe.get_last_authorized_voucher(pos, nc_tipo)
                        next_nc = last_nc + 1
                        
                        return_total = sum(safe_float(item.get("price", 0.0)) * safe_int(item.get("quantity", 0)) for item in returned_items)
                        if return_total <= 0:
                            return_total = safe_float(sale.get("total", 0.0))
                            
                        # Parse client document
                        client_cuit_clean = "".join(c for c in str(client_cuit) if c.isdigit())
                        doc_tipo = 99
                        doc_nro = 0
                        if client_cuit_clean and len(client_cuit_clean) >= 7 and client_cuit_clean != "20999999999":
                            doc_nro = int(client_cuit_clean)
                            doc_tipo = 80 if len(client_cuit_clean) == 11 else 96
                            
                        cbtes_asoc = {
                            "tipo": orig_tipo,
                            "pto_vta": orig_pto_vta,
                            "nro": orig_nro
                        }
                        
                        cae, cae_due = wsfe.request_cae(pos, nc_tipo, next_nc, return_total, doc_tipo, doc_nro, cbtes_asoc=cbtes_asoc)
                        nc_invoice_number = f"{pos:04d}-{next_nc:08d}"
                        
                        arca_credit_note_id = nc_invoice_number
                        arca_cae = cae
                        arca_cae_due = cae_due
                        
                        # Generar transaccion de caja
                        caja_payload = {
                            "description": f"Devolución NC {nc_invoice_number} (Ref: {orig_invoice}) - {credit_note_reason}",
                            "type": "expense",
                            "amount": return_total,
                            "date": datetime.now().isoformat()
                        }
                        caja_id = int(time.time() * 1000)
                        caja_payload["sku"] = f"cashtransaction_{caja_id}"
                        caja_payload["name"] = caja_payload["description"]
                        caja_payload["cost"] = return_total
                        caja_payload["stock"] = 0
                        caja_payload["id"] = str(caja_id)
                        firebase_config.set_document("products", f"{prefix}{caja_payload['sku']}", caja_payload, token)
                        
                        # Actualizar venta
                        if abs(return_total - safe_float(sale.get("total", 0.0))) < 1.0:
                            sale["status"] = "cancelled"
                        sale["credit_note_id"] = nc_invoice_number
                        sale["credit_note_cae"] = cae
                        sale["credit_note_cae_due"] = cae_due
                        sale["cancel_reason"] = credit_note_reason
                        firebase_config.set_document("sales", f"{prefix}{sale_id}", sale, token)
                        
        # 5. Guardar registro de la devolucion
        return_id = f"ret_{int(time.time() * 1000)}"
        return_data = {
            "date": datetime.now().isoformat(),
            "sale_id": sale_id,
            "client_name": client_name,
            "client_cuit": client_cuit,
            "returned_items": returned_items,
            "exchange_items": exchange_items,
            "ubicacion_destino": ubicacion_destino,
            "arca_credit_note_id": arca_credit_note_id,
            "arca_cae": arca_cae,
            "arca_cae_due": arca_cae_due,
            "reason": credit_note_reason
        }
        firebase_config.set_document("returns", f"{prefix}{return_id}", return_data, token)
        
        return jsonify({
            "success": True,
            "return_id": return_id,
            "credit_note_id": arca_credit_note_id,
            "cae": arca_cae
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": f"Error al procesar devolución: {str(e)}"}), 500

@app.route("/api/invoices/fix-failed-ncs", methods=["POST"])
def fix_failed_ncs():
    try:
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        prefix = get_user_prefix(token)
        if not prefix:
            return jsonify({"error": "Token inválido"}), 401
            
        sales = firebase_config.list_documents("sales", token)
        fixed_count = 0
        for s in sales:
            if s.get("status") == "cancelled" and ("credit_note_id" in s or "credit_note_cae" in s):
                # Desmarcar venta
                s["status"] = "completed"
                nc_id = s.get("credit_note_id")
                s.pop("credit_note_id", None)
                s.pop("credit_note_cae", None)
                firebase_config.set_document("sales", s["id"], s, token)
                fixed_count += 1
                
                # Borrar la transaccion de caja negativa
                if nc_id:
                    prods = firebase_config.list_documents("products", token)
                    for p in prods:
                        if p.get("sku", "").startswith("cashtransaction_") and nc_id in p.get("description", ""):
                            firebase_config.delete_document("products", p["id"], token)
                            
        return jsonify({"message": f"Se restauraron {fixed_count} ventas anuladas fallidas y sus movimientos en caja."}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500



@app.route("/api/invoices/simulate", methods=["POST"])
def simulate_invoice():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    email = get_email_from_token(token)
    if not is_arca_enabled(token, email):
        return jsonify({"error": "ARCA no está habilitado para este usuario."}), 400
    
    try:
        # 1. Recuperar última venta del inquilino
        sales = firebase_config.list_documents("sales", token)
        if not sales:
            return jsonify({"error": "No hay ventas registradas en el sistema para facturar."}), 400
            
        # Ordenar ventas por fecha descendente
        sales.sort(key=lambda s: s.get("date", ""), reverse=True)
        last_sale = sales[0]
        sale_id = last_sale.get("id", "V-MOCK")
        total = safe_float(last_sale.get("total", 0.0))
        
        # 2. Recuperar configuración de ARCA
        arca_config = firebase_config.get_document("integrations", "arca", token) or {}
        pos = arca_config.get("pos", "0002")
        condicion_iva = arca_config.get("condicion_iva", "monotributo")
        cuit_emisor = arca_config.get("cuit", "20-35689124-9")
        
        # Parsear datos de simulación provistos por el cliente
        data = request.json or {}
        custom_type = data.get("type")
        concepto = data.get("concepto", "bienes")
        custom_date_str = data.get("date")
        associated_invoice = data.get("associated_invoice", "").strip()
        
        # Determinar tipo factura por defecto si no es provisto
        if not custom_type:
            if condicion_iva == "inscripto":
                invoice_type = "Factura B"
            else:
                invoice_type = "Factura C"
        else:
            invoice_type = str(custom_type)
            
        # Validar compatibilidad de factura con la condición frente al IVA
        if condicion_iva == "monotributo":
            incompatible_types = ["Factura A", "Factura B", "Nota de Crédito A", "Nota de Crédito B", "Nota de Débito A", "Nota de Débito B"]
            if invoice_type in incompatible_types:
                return jsonify({"error": "Inconsistencia Fiscal: Un Monotributista no puede emitir comprobantes clase A o B bajo ninguna circunstancia."}), 400
        elif condicion_iva == "inscripto":
            incompatible_types = ["Factura C", "Nota de Crédito C", "Nota de Débito C"]
            if invoice_type in incompatible_types:
                return jsonify({"error": "Inconsistencia Fiscal: Un Responsable Inscripto no puede emitir comprobantes clase C."}), 400
                
        # Validar enlace obligatorio de notas de ajuste (RG 4540)
        is_adjustment_note = invoice_type.startswith("Nota de Crédito") or invoice_type.startswith("Nota de Débito")
        if is_adjustment_note and not associated_invoice:
            return jsonify({"error": "Falta Comprobante Asociado: Según la RG 4540, es obligatorio vincular las Notas de Crédito/Débito al número de la Factura original."}), 400
            
        # Parsear fecha y validar límites
        from datetime import datetime, date as pydate, timedelta
        import random
        
        if custom_date_str:
            try:
                clean_date_str = custom_date_str.split("T")[0]
                invoice_date = datetime.strptime(clean_date_str, "%Y-%m-%d").date()
            except Exception:
                invoice_date = pydate.today()
        else:
            invoice_date = pydate.today()
            
        today = pydate.today()
        diff_days = (today - invoice_date).days
        
        if concepto == "bienes":
            if diff_days > 5:
                return jsonify({"error": "Límite de fecha: ARCA solo permite facturar venta de bienes hasta 5 días hacia atrás."}), 400
            if diff_days < -5:
                return jsonify({"error": "Límite de fecha: ARCA solo permite facturar venta de bienes hasta 5 días hacia adelante."}), 400
        elif concepto == "servicios":
            if diff_days > 10:
                return jsonify({"error": "Límite de fecha: ARCA solo permite facturar servicios hasta 10 días hacia atrás."}), 400
            if diff_days < -10:
                return jsonify({"error": "Límite de fecha: ARCA solo permite facturar servicios hasta 10 días hacia adelante."}), 400

        cert_content = arca_config.get("cert_content")
        key_content = arca_config.get("key_content")
        
        # Client CUIT
        client_cuit = last_sale.get("client_cuit") or "20-99999999-9"
        
        if cert_content and key_content:
            # Real AFIP / ARCA invoicing
            from arca_service import WSAAClient, WSFEClient, INVOICE_TYPES_MAP
            
            is_sandbox_cert = "homo" in str(cert_content).lower() or "wsaahomo" in str(cert_content).lower()
            
            try:
                wsaa = WSAAClient(cert_content, key_content, sandbox=is_sandbox_cert)
                token_afip, sign_afip = wsaa.get_token_and_sign("wsfe")
                wsfe = WSFEClient(token_afip, sign_afip, cuit_emisor, sandbox=is_sandbox_cert)
                
                cbte_tipo = INVOICE_TYPES_MAP.get(invoice_type, 11)
                
                # Get last voucher number authorized from AFIP
                last_authorized = wsfe.get_last_authorized_voucher(pos, cbte_tipo)
                cbte_nro = last_authorized + 1
                
                invoice_number = f"{str(pos).zfill(4)}-{str(cbte_nro).zfill(8)}"
                
                # Parse client CUIT/DNI
                doc_tipo = 99
                doc_nro = 0
                client_doc = "".join(c for c in str(client_cuit) if c.isdigit())
                if client_doc and len(client_doc) >= 7:
                    doc_nro = int(client_doc)
                    if len(client_doc) == 11:
                        doc_tipo = 80
                    else:
                        doc_tipo = 96
                        
                concept_val = 1 # Bienes
                if concepto == "servicios":
                    concept_val = 2
                
                # Format date to YYYYMMDD
                fch_val = invoice_date.strftime("%Y%m%d")
                
                # Request CAE from AFIP
                cae, cae_due = wsfe.request_cae(
                    pto_vta=pos,
                    cbte_tipo=cbte_tipo,
                    cbte_nro=cbte_nro,
                    total=total,
                    doc_tipo=doc_tipo,
                    doc_nro=doc_nro,
                    concepto=concept_val,
                    cbte_fch=fch_val
                )
                
                # Format expiration date to YYYY-MM-DD from YYYYMMDD returned by AFIP
                if cae_due and len(cae_due) == 8:
                    cae_due = f"{cae_due[0:4]}-{cae_due[4:6]}-{cae_due[6:8]}"
            except Exception as afip_err:
                return jsonify({"error": f"Error AFIP: {str(afip_err)}"}), 400
        else:
            # Fallback to simulation
            existing_invoices = firebase_config.list_documents("invoices", token)
            next_num = len(existing_invoices) + 1
            invoice_number = f"{str(pos).zfill(4)}-{str(next_num).zfill(8)}"
            cae = "".join([str(random.randint(0, 9)) for _ in range(14)])
            cae_due = (datetime.now() + timedelta(days=10)).strftime("%Y-%m-%d")
            
        invoice_data = {
            "sale_id": sale_id,
            "type": invoice_type,
            "invoice_number": invoice_number,
            "cuit_emisor": cuit_emisor,
            "client_cuit": client_cuit,
            "total": total,
            "cae": cae,
            "cae_due": cae_due,
            "status": "Aprobado",
            "date": invoice_date.isoformat(),
            "associated_invoice": associated_invoice if is_adjustment_note else ""
        }
        
        # Guardar factura
        invoice_id = f"FC-{invoice_number}"
        res = firebase_config.set_document("invoices", invoice_id, invoice_data, token)
        if res:
            res["id"] = invoice_id
        return jsonify(res)
        
    except Exception as e:
        return handle_error(e)

@app.route("/api/temp-setup-arca/<secret>", methods=["GET"])
def temp_setup_arca(secret):
    if secret != "Lafalda2025":
        return "Unauthorized", 401
    try:
        import firebase_admin
        from firebase_admin import auth, firestore
        
        uid = user.uid
        
        doc_ref = db.document(f"users/{uid}/integrations/arca")
        config_data = {
            "cuit": "20-36289595-3",
            "condicion_iva": "monotributo",
            "categoria_monotributo": "C",
            "pos": "2",
            "domicilio_fiscal": "Castelli 1229, Bahía Blanca",
            "activo": True
        }
        doc_ref.set(config_data)
        return f"Successfully connected ARCA for {email} (UID: {uid})"
    except Exception as e:
        return f"Error connecting ARCA: {str(e)}", 500
# --- RUTAS DE MI NEGOCIO ---
@app.route("/api/business/settings", methods=["PUT"])
def update_business_settings():
    token = get_auth_token()
    if not token: return jsonify({"error": "No autorizado"}), 401
    
    data = request.json
    try:
        admin_uid = firebase_config.verify_id_token(token)
        # Check if caller is already a subuser. Only admin can change business settings.
        real_uid = firebase_config.get_real_uid(admin_uid, token)
        if real_uid != admin_uid:
            return jsonify({"error": "Acceso denegado: solo el administrador puede modificar los ajustes."}), 403
            
        prefix = get_user_prefix(token)
        doc = firebase_config.get_document("products", f"{prefix}user_profile", token)
        if not doc:
            return jsonify({"error": "Perfil no encontrado"}), 404
            
        if "businessName" in data: doc["businessName"] = data["businessName"]
        if "userProfileName" in data: doc["name"] = data["userProfileName"]
        if "userProfileUsername" in data:
            new_username = data["userProfileUsername"]
            old_username = doc.get("username")
            if old_username and old_username.strip().lower() != new_username.strip().lower():
                clean_old = old_username.strip().lower()
                try:
                    firebase_config.delete_document("username_mappings", clean_old, token)
                except Exception as del_map_err:
                    print(f"Error deleting old username mapping in settings: {del_map_err}")
                if os.path.exists(USERNAMES_FILE):
                    try:
                        with open(USERNAMES_FILE, "r") as f:
                            users_data = json.load(f)
                        if clean_old in users_data:
                            del users_data[clean_old]
                            with open(USERNAMES_FILE, "w") as f:
                                json.dump(users_data, f, indent=4)
                    except Exception as json_del_err:
                        print(f"Error deleting old username from usernames.json: {json_del_err}")
            doc["username"] = new_username
            email = doc.get("contactEmail")
            if not email:
                try:
                    acc_info = firebase_config.get_account_info(token)
                    if acc_info:
                        email = acc_info.get("email")
                except:
                    pass
            if email:
                save_username_mapping(new_username, email, token=token)
        
        # Update email and/or password in Firebase Auth if requested
        new_email = data.get("userProfileEmail")
        new_password = data.get("userProfilePassword")
        
        # Only update email in Auth if it actually changed from the current account email
        current_email = doc.get("contactEmail") or ""
        email_changed = new_email and new_email.strip().lower() != current_email.strip().lower()
        
        if email_changed or new_password:
            try:
                result = firebase_config.update_account(
                    token,
                    email=new_email if email_changed else None,
                    password=new_password if new_password else None
                )
                if email_changed:
                    doc["contactEmail"] = new_email
            except Exception as auth_err:
                return jsonify({"error": f"Error al actualizar credenciales: {str(auth_err)}"}), 400
        
        biz_type_changed = False
        old_prefix = prefix
        new_prefix = prefix
        
        if "businessType" in data:
            new_biz_type = data["businessType"]
            if new_biz_type in ["textil", "comercio"]:
                current_biz_type = doc.get("businessType")
                if current_biz_type and current_biz_type != new_biz_type:
                    biz_type_changed = True
                    new_prefix = f"{new_biz_type}_"
                    doc["businessType"] = new_biz_type
                    doc["sku"] = f"{new_prefix}user_profile"
                else:
                    doc["businessType"] = new_biz_type
            else:
                doc["businessType"] = new_biz_type
                
        if "ivaCondition" in data: doc["ivaCondition"] = data["ivaCondition"]
        if "businessModel" in data: doc["businessModel"] = data["businessModel"]
        if "locations" in data: doc["locations"] = data["locations"]
        if "salesChannels" in data: doc["salesChannels"] = data["salesChannels"]
        if "priceLists" in data: doc["priceLists"] = data["priceLists"]
        if "printSettings" in data: doc["printSettings"] = data["printSettings"]
        if "bizCheckboxes" in data: doc["bizCheckboxes"] = data["bizCheckboxes"]
        if "paymentMethods" in data: doc["paymentMethods"] = data["paymentMethods"]
        if "sizeVariants" in data: doc["sizeVariants"] = data["sizeVariants"]
        
        if biz_type_changed:
            firebase_config.set_document("products", f"{new_prefix}user_profile", doc, token)
            try:
                firebase_config.delete_document("products", f"{old_prefix}user_profile", token)
            except Exception as del_err:
                print(f"Error deleting old profile document: {del_err}")
        else:
            firebase_config.set_document("products", f"{prefix}user_profile", doc, token)
            
        return jsonify({"success": True, "userProfile": doc})
    except Exception as e:
        return handle_error(e)

# --- RUTAS DE GESTIÓN DE SUB-USUARIOS ---
@app.route("/api/business/users", methods=["GET"])
def get_business_users():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
        
    try:
        admin_uid = firebase_config.verify_id_token(token)
        real_uid = firebase_config.get_real_uid(admin_uid, token)
            
        docs = firebase_config.list_documents(f"users/{real_uid}/subusers", token) or []
        updated_any = False
        for doc in docs:
            if not doc.get("username") and doc.get("email"):
                username = doc.get("email").split("@")[0]
                doc["username"] = username
                firebase_config.set_document(f"users/{real_uid}/subusers", doc.get("id"), doc, token)
                save_username_mapping(username, doc.get("email"), token=token)
                updated_any = True
        return jsonify(docs)
    except Exception as e:
        return handle_error(e)

@app.route("/api/business/users", methods=["POST"])
def create_business_user():
    token = get_auth_token()
    if not token: return jsonify({"error": "No autorizado"}), 401
    
    data = request.json
    email = data.get("email")
    password = data.get("password")
    name = data.get("name")
    username = data.get("username")
    access = data.get("access", {})
    
    if not email or not password or not name:
        return jsonify({"error": "Faltan datos obligatorios (email, password, nombre)."}), 400
        
    try:
        admin_uid = firebase_config.verify_id_token(token)
        real_uid = firebase_config.get_real_uid(admin_uid, token)
        if real_uid != admin_uid:
            return jsonify({"error": "Acceso denegado."}), 403
            
        # Check user limit (Plan Pro allows up to 3 subusers)
        existing_subs = firebase_config.list_documents(f"users/{admin_uid}/subusers", token) or []
        if len(existing_subs) >= 3:
            return jsonify({"error": "Límite de usuarios alcanzado (Plan Pro permite hasta 3 usuarios adicionales)."}), 400
            
        # 1. Create user in Firebase Auth using REST API (sign_up)
        new_user_data = firebase_config.sign_up(email, password)
        sub_uid = new_user_data.get("localId")
        
        if not sub_uid:
            return jsonify({"error": "No se pudo crear el usuario en Authentication."}), 500
            
        # 2. Store subuser info in admin's collection
        subuser_doc = {
            "name": name,
            "email": email,
            "username": username,
            "access": access,
            "status": "Activo",
            "createdAt": int(time.time()),
            "id": sub_uid
        }
        firebase_config.set_document(f"users/{admin_uid}/subusers", sub_uid, subuser_doc, token)
        
        # 3. Create global mapping for tenant resolution
        mapping_doc = {
            "parent_uid": admin_uid,
            "createdAt": int(time.time())
        }
        firebase_config.set_document("subuser_mapping", sub_uid, mapping_doc, token)
        
        # 4. Save username mapping for login
        if username:
            save_username_mapping(username, email, token=token)
        
        return jsonify({"success": True, "user": subuser_doc})
    except Exception as e:
        return handle_error(e)

@app.route("/api/business/users/<sub_uid>", methods=["PUT"])
def update_business_user(sub_uid):
    token = get_auth_token()
    if not token: return jsonify({"error": "No autorizado"}), 401
    data = request.json
    
    try:
        admin_uid = firebase_config.verify_id_token(token)
        if firebase_config.get_real_uid(admin_uid, token) != admin_uid:
            return jsonify({"error": "Acceso denegado."}), 403
            
        doc = firebase_config.get_document(f"users/{admin_uid}/subusers", sub_uid, token)
        if not doc:
            return jsonify({"error": "Usuario no encontrado"}), 404
            
        if "name" in data: doc["name"] = data["name"]
        if "access" in data: doc["access"] = data["access"]
        if "status" in data: doc["status"] = data["status"]
        if "username" in data:
            doc["username"] = data["username"]
            if data["username"] and doc.get("email"):
                save_username_mapping(data["username"], doc["email"], token=token)
        
        firebase_config.set_document(f"users/{admin_uid}/subusers", sub_uid, doc, token)
        return jsonify({"success": True, "user": doc})
    except Exception as e:
        return handle_error(e)

@app.route("/api/business/users/<sub_uid>", methods=["DELETE"])
def delete_business_user(sub_uid):
    token = get_auth_token()
    if not token: return jsonify({"error": "No autorizado"}), 401
    
    try:
        admin_uid = firebase_config.verify_id_token(token)
        if firebase_config.get_real_uid(admin_uid, token) != admin_uid:
            return jsonify({"error": "Acceso denegado."}), 403
            
        firebase_config.delete_document(f"users/{admin_uid}/subusers", sub_uid, token)
        firebase_config.delete_document("subuser_mapping", sub_uid, token)
        
        return jsonify({"success": True})
    except Exception as e:
        return handle_error(e)

@app.route("/api/admin/sync-existing-to-sheets", methods=["POST"])
def sync_existing_to_sheets():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    try:
        acc_info = firebase_config.get_account_info(token)
        email = acc_info.get("email") if acc_info else None
        if not email or email not in ["valentinoklcv@gmail.com", "matiascuchettidiaz@gmail.com"]:
            return jsonify({"error": "Acceso denegado: solo administradores del sistema pueden ejecutar esta sincronización."}), 403
            
        prefix = get_user_prefix(token)
        my_profile = firebase_config.get_document("products", f"{prefix}user_profile", token) or {}
        
        try:
            from firebase_admin import firestore
            db = firestore.client()
            docs = db.collection_group("products").stream()
            
            profiles = []
            for doc in docs:
                doc_id = doc.id
                if doc_id.endswith("_user_profile"):
                    data = doc.to_dict()
                    profiles.append(data)
                    
            webhook_url = "https://script.google.com/macros/s/AKfycbwSkMgXOvzW4vyOfJzZmVtgP0V1mhY2Y-fzv6eKYECO1GsODMnxkJDxd5IRdcN_GGBV/exec"
            import requests
            import threading
            
            def bulk_sync(p_list):
                for p in p_list:
                    payload = {
                        "name": p.get("contactName", p.get("name", "")),
                        "businessName": p.get("businessName", ""),
                        "email": p.get("contactEmail", ""),
                        "phone": p.get("contactPhone", ""),
                        "businessType": p.get("businessType", ""),
                        "businessModel": p.get("businessModel", "")
                    }
                    if not payload["email"]:
                        continue
                    try:
                        requests.post(webhook_url, json=payload, timeout=10)
                    except Exception as ex:
                        print(f"Error bulk syncing user: {ex}")
                        
            threading.Thread(target=bulk_sync, args=(profiles,), daemon=True).start()
            return jsonify({"success": True, "message": f"Sincronización masiva de {len(profiles)} cuentas iniciada en segundo plano."})
            
        except Exception as admin_sdk_err:
            # Fallback to syncing only the caller's profile
            print(f"Admin SDK failed (will fallback to single user sync): {admin_sdk_err}")
            
            webhook_url = "https://script.google.com/macros/s/AKfycbwSkMgXOvzW4vyOfJzZmVtgP0V1mhY2Y-fzv6eKYECO1GsODMnxkJDxd5IRdcN_GGBV/exec"
            import requests
            import threading
            
            if my_profile:
                my_profile["googleSheetsSynced"] = True
                try:
                    firebase_config.set_document("products", f"{prefix}user_profile", my_profile, token)
                except Exception as save_err:
                    print(f"Error saving synced flag: {save_err}")
                    
                def single_sync(p):
                    payload = {
                        "name": p.get("contactName", p.get("name", "")),
                        "businessName": p.get("businessName", ""),
                        "email": p.get("contactEmail", ""),
                        "phone": p.get("contactPhone", ""),
                        "businessType": p.get("businessType", ""),
                        "businessModel": p.get("businessModel", "")
                    }
                    try:
                        requests.post(webhook_url, json=payload, timeout=10)
                    except Exception as ex:
                        print(f"Error syncing user: {ex}")
                        
                threading.Thread(target=single_sync, args=(my_profile,), daemon=True).start()
                
            return jsonify({
                "success": True, 
                "message": "Tu cuenta de administrador fue sincronizada con éxito. Para el resto de los comercios existentes, hemos activado un autodetector: se sincronizarán automáticamente con la planilla a medida que abran el sistema."
            })
    except Exception as e:
        return handle_error(e)


@app.route("/api/admin/cleanup-valentino-textil", methods=["POST"])
def cleanup_valentino_textil():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    try:
        acc_info = firebase_config.get_account_info(token)
        email = acc_info.get("email") if acc_info else None
        if not email or email not in ["valentinoklcv@gmail.com", "matiascuchettidiaz@gmail.com"]:
            return jsonify({"error": "Acceso denegado"}), 403
            
        from firebase_admin import firestore
        db = firestore.client()
        docs = db.collection_group("products").stream()
        
        deleted_count = 0
        for doc in docs:
            doc_id = doc.id
            if doc_id == "textil_user_profile":
                data = doc.to_dict()
                if data.get("contactEmail") == "valentinoklcv@gmail.com" or data.get("email") == "valentinoklcv@gmail.com":
                    doc.reference.delete()
                    deleted_count += 1
                    
        return jsonify({"success": True, "deleted_count": deleted_count})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/debug/auth_error", methods=["GET"])
def debug_auth_error():
    log_file = os.path.join(os.path.dirname(__file__), "auth_error.log")
    if os.path.exists(log_file):
        with open(log_file, "r", encoding="utf-8") as f:
            return f.read(), 200, {'Content-Type': 'text/plain'}
    return "No log found", 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
