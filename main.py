import sys
import os
import time
import requests
import base64
import json
import hmac
import hashlib
import concurrent.futures
from flask import Flask, request, jsonify, render_template, session
import firebase_config
from flask_cors import CORS
from flask_compress import Compress
from cachetools import TTLCache
from functools import wraps
from arca_client import create_arca_payment

def handle_error(e):
    err_str = str(e)
    if "autenticación" in err_str or "expirado" in err_str or "Sesión" in err_str or "token" in err_str.lower():
        return jsonify({"error": "Sesión inválida o expirada. Por favor inicie sesión."}), 401
    if isinstance(e, requests.exceptions.HTTPError):
        status = e.response.status_code if e.response is not None else 500
        if status in [401, 403]:
            return jsonify({"error": "Sesión inválida o expirada. Por favor inicie sesión."}), 401
        return jsonify({"error": str(e)}), status
    return jsonify({"error": str(e)}), 500

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
        return None
    # Para conservar compatibilidad con los tipos de negocio
    # (textil vs comercio), usamos f"{biz_type}_" como prefijo local
    # del documento en lugar de incluir el UID.
    biz_type = request.headers.get("X-Business-Type", "textil")
    if biz_type not in ["textil", "comercio"]:
        biz_type = "textil"
    return f"{biz_type}_"

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
            "User-Agent": "GestioSmart (klejavalentino@gmail.com)"
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

# --- Rutas de Autenticación ---

@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.json or {}
    email = data.get("email")
    password = data.get("password")
    
    if not email or not password:
        return jsonify({"error": "Correo y contraseña son requeridos"}), 400
        
    try:
        res = firebase_config.sign_in(email, password)
        return jsonify({
            "token": res.get("idToken"),
            "email": res.get("email"),
            "localId": res.get("localId")
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 401

@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.json or {}
    email = data.get("email")
    password = data.get("password")
    
    if not email or not password:
        return jsonify({"error": "Correo y contraseña son requeridos"}), 400
        
    try:
        res = firebase_config.sign_up(email, password)
        token = res.get("idToken")
        
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
            biz_type = request.headers.get("X-Business-Type", "textil")
            if biz_type not in ["textil", "comercio"]:
                biz_type = "textil"
            if biz_type == "comercio":
                initial_extras = {
                    "sku": f"{prefix}extras_config",
                    "name": "Extras Config",
                    "cost": 0.0,
                    "stock": 0,
                    "bolsas_caramelos": [],
                    "envoltorios_regalo": [],
                    "adicionales_kiosco": []
                }
            else:
                initial_extras = {
                    "sku": f"{prefix}extras_config",
                    "name": "Extras Config",
                    "cost": 0.0,
                    "stock": 0,
                    "estampados": [],
                    "packagings": [],
                    "bordados": []
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
        
        # Parallel fetch from both Firestore collections
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            future_products = executor.submit(firebase_config.list_documents, "products", token)
            future_sales = executor.submit(firebase_config.list_documents, "sales", token)
            
            all_products = future_products.result()
            all_sales = future_sales.result()
            
        user_docs = filter_user_docs(all_products, prefix)
        user_sales = filter_user_docs(all_sales, prefix)
        
        # 2. Get or initialize user profile (SaaS details)
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

        # Calculate trial remaining days
        created_at = profile_doc.get("createdAt", int(time.time()))
        trial_days = profile_doc.get("trialDays", 15)
        elapsed_seconds = time.time() - created_at
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
        
        return jsonify({
            "emailVerified": True,
            "trialExpired": False,
            "subscriptionStatus": subscription_status,
            "daysLeft": days_left,
            "businessType": profile_doc.get("businessType", "clothing"),
            "businessName": profile_doc.get("businessName", ""),
            "userProfile": {
                "sku": "user_profile",
                "name": "User Profile",
                "cost": 0.0,
                "stock": 0,
                "createdAt": profile_doc.get("createdAt"),
                "trialDays": profile_doc.get("trialDays", 15),
                "subscriptionStatus": subscription_status,
                "businessType": profile_doc.get("businessType", "clothing"),
                "businessName": profile_doc.get("businessName", "")
            },
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
            "stockIntakes": intakes
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
                sku = p.get("sku")
                p["cost"] = safe_float(p.get("cost", 0.0))
                p["stock"] = safe_int(p.get("stock", 0))
                p["sku"] = f"{prefix}{sku}"
                res = firebase_config.set_document("products", f"{prefix}{sku}", p, token)
                if res:
                    res["id"] = res["id"][len(prefix):]
                    if "sku" in res and res["sku"].startswith(prefix):
                        res["sku"] = res["sku"][len(prefix):]
                results.append(res)
            return jsonify(results)
        else:
            sku = data.get("sku")
            if not sku:
                return jsonify({"error": "SKU requerido"}), 400
            data["cost"] = safe_float(data.get("cost", 0.0))
            data["stock"] = safe_int(data.get("stock", 0))
            data["sku"] = f"{prefix}{sku}"
            res = firebase_config.set_document("products", f"{prefix}{sku}", data, token)
            if res:
                res["id"] = res["id"][len(prefix):]
                if "sku" in res and res["sku"].startswith(prefix):
                    res["sku"] = res["sku"][len(prefix):]
            return jsonify(res)
    except Exception as e:
        return handle_error(e)

@app.route("/api/products/<sku>", methods=["DELETE"])
def delete_product(sku):
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    prefix = get_user_prefix(token)
    if not prefix:
        return jsonify({"error": "Token inválido o expirado"}), 401
        
    try:
        deleted = firebase_config.delete_document("products", f"{prefix}{sku}", token)
        return jsonify({"success": deleted})
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
        s_id = int(time.time() * 1000)
        data["id"] = s_id
        
    sku = f"supplier_{s_id}"
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


# --- 5. Rutas de Cuentas Corrientes (Pagar & Cobrar) ---

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
        
        new_tx = {
            "id": f"tx-{int(time.time() * 1000)}",
            "date": data.get("date", time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())),
            "description": str(data.get("description", "")),
            "amount": safe_float(data.get("amount", 0.0)),
            "payment": safe_float(data.get("payment", 0.0))
        }
        
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
        return jsonify(res)
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
        user_sales = filter_user_docs(sales, prefix)
        return jsonify(user_sales)
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
    total = data.get("total")
    items = data.get("items")
    method = data.get("method", "Efectivo")
    origen = data.get("origen", "local")
    
    if not date or total is None or items is None:
        return jsonify({"error": "Campos obligatorios faltantes"}), 400
        
    try:
        # 1. Recuperar productos en paralelo para validar stock
        def get_single_prod(cart_item):
            prod_info = cart_item.get("product", {})
            sku = prod_info.get("sku")
            qty = safe_int(cart_item.get("quantity", 0))
            if sku and qty > 0:
                prod = firebase_config.get_document("products", f"{prefix}{sku}", token)
                return sku, qty, prod
            return None, 0, None

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            prods_data = list(executor.map(get_single_prod, items))

        # Validar stock (sólo para origen local)
        if origen == "local":
            for sku, qty, prod in prods_data:
                if not sku or qty <= 0:
                    continue
                if not prod:
                    return jsonify({"error": f"Producto con SKU {sku} no encontrado en inventario"}), 400
                current_stock = safe_int(prod.get("stock_local", prod.get("stock", 0)))
                if current_stock < qty:
                    return jsonify({"error": f"Stock insuficiente para '{prod.get('name')}' (Talle {prod.get('size')}). Disponible: {current_stock}, Solicitado: {qty}"}), 400

        sale_id = f"V-{time.strftime('%H%M%S', time.localtime())}"
        
        # Desprender el prefijo del payload antes de guardarlo para que quede limpio en el registro de ventas
        for cart_item in items:
            prod_info = cart_item.get("product", {})
            if "sku" in prod_info and str(prod_info["sku"]).startswith(prefix):
                prod_info["sku"] = str(prod_info["sku"])[len(prefix):]
            if "id" in prod_info and str(prod_info["id"]).startswith(prefix):
                prod_info["id"] = str(prod_info["id"])[len(prefix):]

        sale_data = {
            "date": str(date),
            "total": safe_float(total),
            "subtotal": safe_float(data.get("subtotal", total)),
            "discount_pct": safe_float(data.get("discount_pct", 0.0)),
            "method": str(method),
            "items": items,
            "extras": data.get("extras", {}),
            "origen": origen
        }

        # Calcular ganancias netas si el origen es Tiendanube
        if origen == "tiendanube":
            fee_fijo = safe_float(data.get("fee_fijo_tn", 300.0))
            comision = safe_float(data.get("comision_pasarela_pago", 5.0))
            costos_fin = fee_fijo + (comision / 100.0 * safe_float(total))
            total_neto = max(0.0, safe_float(total) - costos_fin)
            sale_data["fee_fijo_tn"] = fee_fijo
            sale_data["comision_pasarela_pago"] = comision
            sale_data["total_neto"] = total_neto
        else:
            sale_data["total_neto"] = safe_float(total)

        # Flujo especial para ARCA Pago
        if method == "ARCA":
            email = get_email_from_token(token)
            if email not in ["klejavalentino@gmail.com", "matiascuchettidiaz@gmail.com"]:
                return jsonify({"error": "ARCA no está habilitado para este usuario."}), 400
            sale_data["status"] = "pendiente"
            res = firebase_config.set_document("sales", f"{prefix}{sale_id}", sale_data, token)
            
            try:
                host_url = request.url_root.rstrip('/')
                webhook_url = f"{host_url}/api/webhooks/arca"
                return_url = f"{host_url}/"
                
                uid = get_uid_from_token(token)
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
        
        # Descontar stock local en paralelo (sólo para origen local)
        if origen == "local":
            def update_local_stock(prod_data):
                sku, qty, prod = prod_data
                if sku and qty > 0 and prod:
                    current_stock = safe_int(prod.get("stock_local", prod.get("stock", 0)))
                    prod["stock_local"] = max(0, current_stock - qty)
                    prod["stock"] = prod["stock_local"]
                    prod["sku"] = f"{prefix}{sku}"
                    firebase_config.set_document("products", f"{prefix}{sku}", prod, token)

            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                executor.map(update_local_stock, prods_data)
                    
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
                "name": "Mi Tienda GestioSmart",
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
            if email not in ["klejavalentino@gmail.com", "matiascuchettidiaz@gmail.com"]:
                return jsonify({"error": "ARCA no está habilitado para este usuario."}), 400
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

def clean_product_name_and_size(p_name, variant_size):
    if not p_name:
        return p_name, variant_size
    words = p_name.strip().split()
    if len(words) > 1:
        last_word = words[-1].upper()
        sizes = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "3XL"]
        if last_word in sizes:
            clean_name = " ".join(words[:-1])
            new_size = variant_size
            if variant_size in ["Único", "", None]:
                new_size = words[-1]
            return clean_name, new_size
    return p_name, variant_size

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
            "User-Agent": "GestioSmart (klejavalentino@gmail.com)",
            "Content-Type": "application/json"
        }
        
        # 1.5 Fetch all categories from Tiendanube
        tn_categories = {}
        cat_page = 1
        while True:
            cat_url = f"https://api.tiendanube.com/v1/{user_id}/categories?page={cat_page}&limit=100"
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
            url = f"https://api.tiendanube.com/v1/{user_id}/products?page={page}&limit=100"
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
        new_variants_count = 0
        
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
                    stock_taller_val = "infinito"
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
                    
                    # Actualizar stock de Tiendanube (si es infinito, local mantiene el suyo o es 0)
                    if raw_stock is None:
                        existing_prod["stock_taller"] = "infinito"
                        s_local = existing_prod.get("stock_local", existing_prod.get("stock", 0))
                        existing_prod["stock_local"] = safe_int(s_local)
                        existing_prod["stock"] = safe_int(s_local)
                    else:
                        existing_prod["stock_taller"] = stock_taller_val
                        existing_prod["stock_local"] = stock_local_val
                        existing_prod["stock"] = stock_local_val
                        
                    existing_prod["cost"] = safe_float(existing_prod.get("cost", 0.0))
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
                    new_variants_count += 1
                    
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
        def save_one_product(prod):
            sku_with_prefix = prod.get("sku")
            firebase_config.set_document("products", sku_with_prefix, prod, token)
            
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            executor.map(save_one_product, products_to_save)
            
        return jsonify({
            "success": True, 
            "count": new_variants_count,
            "synced_count": len(products_to_save)
        })
    except Exception as e:
        return handle_error(e)

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
            "User-Agent": "GestioSmart (klejavalentino@gmail.com)",
            "Content-Type": "application/json"
        }
        
        all_orders = []
        page = 1
        while True:
            url = f"https://api.tiendanube.com/v1/{user_id}/orders?page={page}&limit=100"
            r = requests.get(url, headers=headers, timeout=30)
            if not r.ok:
                return jsonify({"error": f"Error de Tiendanube API: {r.text}"}), 400
            data = r.json()
            if not data:
                break
            all_orders.extend(data)
            
            # Stop if last order in page is older than May 2026
            last_order_date_str = data[-1].get("created_at")
            if last_order_date_str:
                try:
                    year = int(last_order_date_str[0:4])
                    month = int(last_order_date_str[5:7])
                    if year < 2026 or (year == 2026 and month < 5):
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

        # Fetch existing sales to count only new ones imported
        sales_list = firebase_config.list_documents("sales", token)
        existing_sale_ids = set()
        for s in sales_list:
            doc_id = s.get("id", "")
            if doc_id.startswith(f"{prefix}TN-"):
                existing_sale_ids.add(doc_id)

        fee_fijo = safe_float(config.get("fee_fijo_tn", 300.0))
        comision = safe_float(config.get("comision_pasarela_pago", 5.0))
        
        sales_saved = 0
        new_sales_count = 0
        for order in all_orders:
            if order.get("status") == "cancelled":
                continue
            order_id = str(order.get("id"))
            
            gateway = order.get("payment_details", {}).get("method", "Tiendanube")
            if not gateway:
                gateway = "Tiendanube"
                
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
                
                prod_data = {
                    "sku": sku,
                    "name": item.get("name"),
                    "price_local": price,
                    "price_tiendanube": price,
                    "price": price,
                    "category": item.get("category", "General"),
                    "color": ""
                }
                
                if matched_local_prod:
                    prod_data["cost"] = safe_float(matched_local_prod.get("cost", 0.0))
                    prod_data["margin"] = safe_float(matched_local_prod.get("margin", 0.0))
                    prod_data["category"] = matched_local_prod.get("category", "General")
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
                "total_neto": total_neto
            }
            
            doc_id_with_prefix = f"{prefix}TN-{order_id}"
            if doc_id_with_prefix not in existing_sale_ids:
                new_sales_count += 1
                
            firebase_config.set_document("sales", doc_id_with_prefix, sale_data, token)
            sales_saved += 1
            
        return jsonify({
            "success": True,
            "count": new_sales_count
        })
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
    if email not in ["klejavalentino@gmail.com", "matiascuchettidiaz@gmail.com"]:
        return jsonify({"error": "ARCA no está habilitado para este usuario."}), 400
    try:
        # Recuperar facturas del usuario desde la subcolección invoices
        docs = firebase_config.list_documents("invoices", token)
        return jsonify(docs)
    except Exception as e:
        return handle_error(e)

@app.route("/api/invoices/simulate", methods=["POST"])
def simulate_invoice():
    token = get_auth_token()
    if not token:
        return jsonify({"error": "No autorizado"}), 401
    email = get_email_from_token(token)
    if email not in ["klejavalentino@gmail.com", "matiascuchettidiaz@gmail.com"]:
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

        # 3. Generar número secuencial contando las existentes
        existing_invoices = firebase_config.list_documents("invoices", token)
        next_num = len(existing_invoices) + 1
        invoice_number = f"{str(pos).zfill(4)}-{str(next_num).zfill(8)}"
        
        # 4. Generar CAE ficticio y vencimiento
        cae = "".join([str(random.randint(0, 9)) for _ in range(14)])
        cae_due = (datetime.now() + timedelta(days=10)).strftime("%Y-%m-%d")
        
        # Mock de cliente CUIT
        client_cuit = "20-99999999-9"
        
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

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
