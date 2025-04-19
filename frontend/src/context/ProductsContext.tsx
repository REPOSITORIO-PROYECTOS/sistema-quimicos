// context/ProductsContext.js
"use client"
import { createContext, useContext, useEffect, useState } from 'react';

type Producto = {
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

//TODO quitar este any
// eslint-disable-next-line
export const ProductsProvider = ({ children }:any) => {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const fetchProductos = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://82.25.69.192:8001/productos/obtener_todos'); // O tu URL completa si es un backend externo
      const data = await res.json();
      setProductos(data);
      if (data.status === 'success') {
        

      } else {
        console.log("error al obtener los productos");
        setError(data.message || 'Error al obtener productos');
      }
    } catch (err) {
      setError('Error de red al obtener productos');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProductos();
  }, []);

  return (
    <ProductsContext.Provider value={{ productos, loading, error, refetch: fetchProductos }}>
      {children}
    </ProductsContext.Provider>
  );
};

export const useProductsContext = () => useContext(ProductsContext);
