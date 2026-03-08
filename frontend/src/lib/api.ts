/**
 * API Helper - Centraliza todas las llamadas a la API con autenticación automática
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://quimex.sistemataup.online";

export interface FetchOptions extends RequestInit {
  requireAuth?: boolean;
}

/**
 * Fetch con autenticación automática
 * @param endpoint - Ruta relativa (ej: /productos/obtener_todos)
 * @param options - Opciones de fetch + requireAuth (default: true)
 */
export async function apiFetch(endpoint: string, options: FetchOptions = {}) {
  const { requireAuth = true, ...fetchOptions } = options;

  // Construir headers de forma segura con tipos correctos
  const headersList: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Agregar headers existentes si existen
  if (fetchOptions.headers) {
    const existingHeaders = fetchOptions.headers as Record<string, string>;
    Object.assign(headersList, existingHeaders);
  }

  // Si requiere autenticación, agregar token
  if (requireAuth) {
    const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
    if (!token) {
      throw new Error("No autenticado. Por favor, inicie sesión.");
    }
    headersList["Authorization"] = `Bearer ${token}`;
  }

  const url = endpoint.startsWith("http") ? endpoint : `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...fetchOptions,
    headers: headersList,
  });

  // Si no es 2xx, lanzar error
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: "Error desconocido" }));
    throw new Error(errorData.message || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * GET request con autenticación
 */
export async function apiGet(endpoint: string, options?: FetchOptions) {
  return apiFetch(endpoint, { ...options, method: "GET" });
}

/**
 * POST request con autenticación
 */
export async function apiPost(endpoint: string, body?: unknown, options?: FetchOptions) {
  return apiFetch(endpoint, {
    ...options,
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * PUT request con autenticación
 */
export async function apiPut(endpoint: string, body?: unknown, options?: FetchOptions) {
  return apiFetch(endpoint, {
    ...options,
    method: "PUT",
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * DELETE request con autenticación
 */
export async function apiDelete(endpoint: string, options?: FetchOptions) {
  return apiFetch(endpoint, { ...options, method: "DELETE" });
}
