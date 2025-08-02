// context/ProductsContextActivos.tsx
"use client"
import { createContext, useContext, useEffect, useState } from 'react';

export type Producto = {
  id: number;
  codigo: string;
  nombre: string;
  familia: string;
  unidad_medida: string;
  costo_unitario: number;
  coeficiente: number;
};

type ProductsContextActiveType = {
  productos: Producto[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

const ProductsContextActivos = createContext<ProductsContextActiveType | undefined>(undefined);

// eslint-disable-next-line
export const ProductsActivosProvider  = ({ children }: any) => {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProductos = async () => {
    try {
      setLoading(true);
      setError(null);
  
      const res = await fetch('https://quimex.sistemataup.online/productos/obtener_todos_activos');
      const data = await res.json();
      setProductos(data);
    // eslint-disable-next-line
    } catch (err: any) {
      setError(err.message || 'Error al obtener productos');
      console.error('Error al obtener productos:', err);
    } finally {
      setLoading(false);
    }
  };
  ;

  useEffect(() => {
    fetchProductos();
  }, []);

  return (
    <ProductsContextActivos.Provider value={{
      productos,
      loading,
      error,
      refetch: fetchProductos
    }}>
      {children}
    </ProductsContextActivos.Provider>
  );
};

export const useProductsContextActivos = () => {
  const context = useContext(ProductsContextActivos);
  if (context === undefined) {
    throw new Error("useProductsContext debe usarse dentro de un ProductsProvider");
  }
  return context;
};
