/**
 * Base pública de la API (entorno de prueba / despliegue acordado).
 * Sin variable de entorno: evita que el front apunte por error a otro host.
 */
export const PUBLIC_API_BASE_URL = "https://quimex.sistemataup.online/api".replace(/\/$/, "");
