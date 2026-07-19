import pytest
import requests
import math

BASE_URL = "http://localhost:5000/api"
TEST_TOKEN = "TEST_ENVIRONMENT_TOKEN_HERE"

def get_headers():
    return {
        "Authorization": f"Bearer {TEST_TOKEN}",
        "Content-Type": "application/json"
    }

class TestSalesAPIEdgeCases:
    def test_negative_total_sale(self):
        """Prueba de inyección de valores negativos (CWE-20)."""
        payload = {
            "date": "2026-07-19",
            "total": -1000000,
            "items": [{"product": {"sku": "TEST_SKU"}, "quantity": 1}]
        }
        res = requests.post(f"{BASE_URL}/sales", json=payload, headers=get_headers())
        assert res.status_code == 400
        assert "negativo" in res.json().get("error", "").lower()

    def test_missing_required_fields(self):
        """Prueba con payload incompleto/nulo."""
        payload = {"date": "2026-07-19"}
        res = requests.post(f"{BASE_URL}/sales", json=payload, headers=get_headers())
        assert res.status_code == 400

    def test_string_injection_in_numeric_fields(self):
        """Prueba de inyección de strings en campos que deben ser numéricos."""
        payload = {
            "date": "2026-07-19",
            "total": "CIEN_MIL_PESOS",
            "items": [{"product": {"sku": "TEST_SKU"}, "quantity": "UNO"}]
        }
        res = requests.post(f"{BASE_URL}/sales", json=payload, headers=get_headers())
        assert res.status_code in [400, 500]

class TestSecurityAudit:
    def test_rate_limiter_brute_force(self):
        """Simula un ataque de fuerza bruta al endpoint de login para validar el Rate Limiter."""
        payload = {"email": "admin@test.com", "password": "wrong_password"}
        responses = []
        for _ in range(10):
            res = requests.post(f"{BASE_URL}/auth/login", json=payload)
            responses.append(res.status_code)
            
        # El límite es 5 por min. Las primeras 5 son procesadas, el resto bloqueadas por el limitador
        assert 429 in responses, "El Rate Limiter no está funcionando."
