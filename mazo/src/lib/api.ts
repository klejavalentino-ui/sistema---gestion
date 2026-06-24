import { auth } from './firebase';

/**
 * Obtiene los encabezados de autenticación necesarios para la API de Flask,
 * inyectando de forma asíncrona el ID Token del usuario logueado en Firebase.
 */
export async function getAuthHeaders(businessType?: string) {
  const user = auth.currentUser;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  if (user) {
    const token = await user.getIdToken();
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (businessType) {
    headers['X-Business-Type'] = businessType;
  }
  
  return headers;
}

/**
 * Función genérica para consumir la API de Flask de manera segura y autenticada.
 */
export async function apiRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: any,
  businessType?: string
): Promise<T> {
  const headers = await getAuthHeaders(businessType);
  const options: RequestInit = {
    method,
    headers,
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(endpoint, options);
  
  if (response.status === 401) {
    // Redirigir al login si el token ha expirado o no es válido
    window.dispatchEvent(new Event('firebase-unauthorized'));
    throw new Error('Sesión vencida. Por favor, vuelva a ingresar.');
  }

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Error HTTP: ${response.status}`);
  }
  
  return response.json() as Promise<T>;
}
