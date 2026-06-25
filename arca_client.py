import os
import requests

ARCA_SECRET_KEY = os.environ.get("ARCA_SECRET_KEY")
ARCA_SANDBOX_MODE = os.environ.get("ARCA_SANDBOX_MODE", "true") == "true"
BASE_URL = "https://sandbox.api.arca.la/v1" if ARCA_SANDBOX_MODE else "https://api.arca.la/v1"

def create_arca_payment(sale_id, amount, return_url, webhook_url, tenant_uid):
    if not ARCA_SECRET_KEY:
        raise Exception("ARCA_SECRET_KEY no está configurada en las variables de entorno.")
        
    url = f"{BASE_URL}/payments"
    headers = {
        "Authorization": f"Bearer {ARCA_SECRET_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "external_reference": sale_id,
        "amount": float(amount),
        "currency": "ARS",
        "redirect_url": return_url,
        "webhook_url": webhook_url,
        "description": f"Compra GestioSmart - Orden {sale_id}",
        "metadata": {
            "tenant_uid": tenant_uid
        }
    }
    
    r = requests.post(url, json=payload, headers=headers, timeout=30)
    r.raise_for_status()
    return r.json()
