// context/ProductsContext.js
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

type ProductsContextType = {
  productos: Producto[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

const ProductsContext = createContext<ProductsContextType | undefined>(undefined);

// eslint-disable-next-line
export const ProductsProvider = ({ children }: any) => {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProductos = async () => {
    try {
      setLoading(true);
      setError(null);
  
      const res = await fetch('https://quimex.sistemataup.online/productos/obtener_todos');
      const data = await res.json();
      console.log(data);
      /*const res1 = await fetch('https://quimex.sistemataup.online/recetas/obtener/1');
      const data1 = await res1.json();
      console.log(data1);*/

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
    <ProductsContext.Provider value={{
      productos,
      loading,
      error,
      refetch: fetchProductos
    }}>
      {children}
    </ProductsContext.Provider>
  );
};

export const useProductsContext = () => {
  const context = useContext(ProductsContext);
  if (context === undefined) {
    throw new Error("useProductsContext debe usarse dentro de un ProductsProvider");
  }
  return context;
};
