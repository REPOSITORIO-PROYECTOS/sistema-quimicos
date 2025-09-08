// context/ClientesContext.js // <-- RECOMIENDO Renombrar el archivo también
"use client"
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'; // Importa ReactNode

type Cliente = {
    activo: boolean,
    codigo_postal: number | null, // Puede ser null? Ajusta si es necesario
    condicion_iva: string,
    contacto_principal: string | null,
    cuit: number, // <-- Es number
    direccion: string,
    email: string | null,
    fecha_alta: string,
    id: number, // <-- Es number
    lista_precio_asignada: string | null,
    localidad: string,
    nombre_razon_social: string, // <-- Este es el campo clave
    observaciones: string | null,
    provincia: string,
    telefono: string | null
}

type ClientesContextType = {
  clientes: Cliente[];
  loading: boolean;
  error: string | null;
  fetchClientes: (searchTerm?: string, page?: number, perPage?: number) => Promise<void>;
  pagination: {
    total_items: number;
    total_pages: number;
    current_page: number;
    per_page: number;
    has_next: boolean;
    has_prev: boolean;
  } | null;
};

// Usa el tipo correcto aquí
const ClientesContext = createContext<ClientesContextType | undefined>(undefined);

// Define props para el Provider
interface ClientesProviderProps {
  children: ReactNode;
}

// --- RENOMBRADO: De ProductsProvider a ClientesProvider ---
export const ClientesProvider = ({ children }: ClientesProviderProps) => {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<ClientesContextType['pagination']>(null);

  const fetchClientes = async (searchTerm = '', page = 1, perPage = 20) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('per_page', String(perPage));
      if (searchTerm) params.append('search_term', searchTerm);
      const res = await fetch(`https://quimex.sistemataup.online/clientes/obtener_todos?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Error ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      if (!Array.isArray(data.clientes)) {
        throw new Error("La respuesta de la API no es un array de clientes");
      }
      setClientes(data.clientes);
      setPagination(data.pagination || null);
    } catch (err: unknown) {
      // Extraer mensaje de error de manera segura sin usar 'any'
      let errorMsg = 'Error al obtener clientes';
      if (err && typeof err === 'object') {
        const maybeMessage = (err as Record<string, unknown>)['message'];
        if (typeof maybeMessage === 'string') errorMsg = maybeMessage;
      }
      setError(errorMsg);
      setClientes([]);
      setPagination(null);
      console.error('Error al obtener clientes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClientes();
  }, []);

  return (
    <ClientesContext.Provider value={{
      clientes,
      loading,
      error,
      fetchClientes,
      pagination
    }}>
      {children}
    </ClientesContext.Provider>
  );
};

export const useClientesContext = () => {
  const context = useContext(ClientesContext);
  if (context === undefined) {
    // --- MENSAJE CORREGIDO ---
    throw new Error("useClientesContext debe usarse dentro de un ClientesProvider");
  }
  return context;
};

// Exporta el tipo Cliente si lo necesitas en otros lados
export type { Cliente };