// context/ProveedoresContext.tsx
"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';

// Reutiliza la interfaz Proveedor que ya definiste en tu página de lista
// o define una nueva si los datos del contexto necesitan ser diferentes.
// Asegúrate que coincida con lo que devuelve `p.to_dict()` de tu API
export interface Proveedor {
  id: number;
  nombre: string;
  cuit: string | null;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  contacto: string | null;
  condiciones_pago: string | null;
  activo: boolean;
  // Añade cualquier otro campo que venga en `to_dict()` si es necesario
}

interface ProveedoresContextType {
  proveedores: Proveedor[];
  loading: boolean;
  error: string | null;
  fetchProveedores: () => Promise<void>; // Para permitir llamar a la recarga manualmente
  // Podrías añadir más funciones si necesitas manipular proveedores desde el contexto
  // por ejemplo: addProveedor, updateProveedor, deleteProveedor (que llamarían a la API y luego a fetchProveedores)
}

const ProveedoresContext = createContext<ProveedoresContextType | undefined>(undefined);

interface ProveedoresProviderProps {
  children: ReactNode;
}

export const ProveedoresProvider = ({ children }: ProveedoresProviderProps) => {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Asumimos que el token se maneja fuera del contexto por ahora,
  // o se podría pasar como prop si fuera necesario para el fetch.
  // Alternativamente, leerlo de localStorage aquí.
  const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;


  const fetchProveedores = useCallback(async () => {
    // Si no hay token, no intentar el fetch y marcar error o estado vacío
    if (!token) {
        setError("No autenticado. No se pueden cargar proveedores.");
        setProveedores([]);
        setLoading(false);
        return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch('https://quimex.sistemataup.online/proveedores/obtener-todos', {
        headers: {
          "Authorization": `Bearer ${token}`,
          // "Content-Type": "application/json", // No es necesario para GET sin body
        },
      });

      if (!response.ok) {
        // Intenta parsear el error del cuerpo si es posible
        let errorMessage = `Error ${response.status}: ${response.statusText}`;
        try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorData.error || errorMessage;
        } catch (e) {
          console.log(e);
        }
        throw new Error(errorMessage);
      }

      const data: Proveedor[] = await response.json();
      setProveedores(data);
      //eslint-disable-next-line
    } catch (err: any) {
      console.error('Error al obtener proveedores:', err);
      setError(err.message || 'Error desconocido al obtener proveedores');
      setProveedores([]); // Asegurar que proveedores esté vacío en caso de error
    } finally {
      setLoading(false);
    }
  }, [token]); // Dependencia del token para que se re-ejecute si el token cambia (ej. login/logout)

  useEffect(() => {
    fetchProveedores();
  }, [fetchProveedores]); // fetchProveedores está envuelto en useCallback, por lo que su identidad es estable

  return (
    <ProveedoresContext.Provider value={{
      proveedores,
      loading,
      error,
      fetchProveedores // Exponer la función para recargar manualmente
    }}>
      {children}
    </ProveedoresContext.Provider>
  );
};

export const useProveedoresContext = (): ProveedoresContextType => {
  const context = useContext(ProveedoresContext);
  if (context === undefined) {
    throw new Error("useProveedoresContext debe usarse dentro de un ProveedoresProvider");
  }
  return context;
};