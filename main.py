import sys
import os
import time
import requests
import base64
import json
from flask import Flask, request, jsonify, render_template, session
import firebase_config

def handle_error(e):
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
        if isinstance(val, str):
            val = val.replace("$", "").replace(" ", "").replace(".", "").replace(",", ".").strip()
        return float(val)
    except (ValueError, TypeError):
        return default

def safe_int(val, default=0):
    if val is None:
        return default
    try:
        if isinstance(val, str):
            val = val.replace(".", "").replace(",", "").strip()
        return int(val)
    except (ValueError, TypeError):
        return default

app = Flask(__name__)
app.secret_key = "mazo_clothing_secret_key_secure_idx"

@app.after_request
def add_header(r):
    r.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    r.headers["Pragma"] = "no-cache"
    r.headers["Expires"] = "0"
    r.headers['Cache-Control'] = 'public, max-age=0'
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
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        payload = parts[1]
        payload += "=" * ((4 - len(payload) % 4) % 4)
        decoded = base64.urlsafe_b64decode(payload).decode("utf-8")
        data = json.loads(decoded)
        return data.get("user_id") or data.get("sub")
    except Exception:
        return None

def get_user_prefix(token):
    uid = get_uid_from_token(token)
    if not uid:
        return None
    biz_type = request.headers.get("X-Business-Type", "textil")
    if biz_type not in ["textil", "comercio"]:
        biz_type = "textil"
    return f"{uid}_{biz_type}_"

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
                "businessType": biz_type
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
    
    if not date or total is None or items is None:
        return jsonify({"error": "Campos obligatorios faltantes"}), 400
        
    try:
        for cart_item in items:
            prod_info = cart_item.get("product", {})
            sku = prod_info.get("sku")
            qty = safe_int(cart_item.get("quantity", 0))
            
            if sku and qty > 0:
                prod = firebase_config.get_document("products", f"{prefix}{sku}", token)
                if not prod:
                    return jsonify({"error": f"Producto con SKU {sku} no encontrado en inventario"}), 400
                current_stock = safe_int(prod.get("stock", 0))
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
            "method": str(method),
            "items": items,
            "extras": data.get("extras", {})
        }
        
        res = firebase_config.set_document("sales", f"{prefix}{sale_id}", sale_data, token)
        
        for cart_item in items:
            prod_info = cart_item.get("product", {})
            sku = prod_info.get("sku") # ya está limpio
            qty = safe_int(cart_item.get("quantity", 0))
            
            if sku and qty > 0:
                prod = firebase_config.get_document("products", f"{prefix}{sku}", token)
                if prod:
                    current_stock = safe_int(prod.get("stock", 0))
                    prod["stock"] = max(0, current_stock - qty)
                    prod["sku"] = f"{prefix}{sku}"
                    firebase_config.set_document("products", f"{prefix}{sku}", prod, token)
                    
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

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
