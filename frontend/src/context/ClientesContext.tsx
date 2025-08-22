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
  refetch: () => void;
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

  const fetchClientes = async () => {
    setLoading(true); // Inicia carga
    setError(null);   // Limpia error anterior
    try {
      const res = await fetch(`https://quimex.sistemataup.online/clientes/obtener_todos?per_page=1000`);
      if (!res.ok) {
        throw new Error(`Error ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      if (!Array.isArray(data.clientes)) { // Validación extra
          throw new Error("La respuesta de la API no es un array de clientes");
      }
      setClientes(data.clientes);
      //eslint-disable-next-line
    } catch (err: any) {
      const errorMsg = err.message || 'Error al obtener clientes';
      setError(errorMsg);
      console.error('Error al obtener clientes:', err);
      setClientes([]); // Asegura que clientes sea un array vacío en caso de error
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
      refetch: fetchClientes // Provee la función para recargar si es necesario
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