"use client";

import React, { useState, useEffect } from 'react';

// --- Tipos de Datos ---

// Tipo para los datos brutos recibidos de la primera API
type ProductDataRaw = {
  ajusta_por_tc: boolean;
  costo_referencia_usd: number;
  es_receta: boolean;
  fecha_actualizacion_costo: string; // Mantener como string por ahora
  id: number;
  margen: number;
  nombre: string;
  receta_id: number | null;
  ref_calculo: string;
  tipo_calculo: string;
  unidad_venta: string;
  // Agrega otros campos si tu API los devuelve y los necesitas
};

// Tipo para los datos que mostraremos en la tabla (incluye el precio calculado)
type ProductDisplay = {
  id: number;
  nombre: string;
  fecha_actualizacion: string; // Fecha formateada
  tipo_calculo: string;
  precio?: number; // El precio será opcional hasta que se calcule
  isLoadingPrice: boolean; // Para mostrar feedback mientras se calcula el precio
  priceError: boolean; // Para indicar si hubo error al calcular el precio
};

// --- Componente Principal ---

export default function ProductPriceTable() {
  // --- Estados ---
  const [products, setProducts] = useState<ProductDisplay[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true); // Carga inicial de productos
  const [errorInitial, setErrorInitial] = useState<string | null>(null); // Error en carga inicial
  const [searchTerm, setSearchTerm] = useState(''); // Para el input de búsqueda

  // --- Efecto para Cargar Datos Iniciales y Precios ---
  useEffect(() => {
    const fetchDataAndPrices = async () => {
      setLoadingInitial(true);
      setErrorInitial(null);
      setProducts([]); // Limpiar productos anteriores

      try {
        // --- 1. Obtener Datos Iniciales ---
        // !!! REEMPLAZA ESTA URL CON LA TUYA !!!
        // Si tienes múltiples URLs, necesitarás hacer fetch a todas y combinar (usando Promise.all)
        const initialResponse = await fetch('https://sistemataup.online/productos/obtener_todos'); // URL de ejemplo

        if (!initialResponse.ok) {
          throw new Error(`Error ${initialResponse.status}: No se pudieron obtener los productos.`);
        }

        const data = await initialResponse.json();

        // Asumiendo que la API devuelve un objeto con una propiedad 'productos' que es un array
        // O directamente un array. Ajusta según tu API.
        const rawProducts: ProductDataRaw[] = data.productos || data || [];

        // Si la API devuelve múltiples arreglos (ej. [{productos:[]}, {productos:[]}]), necesitas unificarlos:
        // rawProducts = data.flatMap(item => item.productos || []); // Ejemplo de unificación

        if (!Array.isArray(rawProducts)) {
             console.error("La respuesta de la API inicial no es un array:", rawProducts);
             throw new Error("Formato de datos inesperado de la API de productos.");
        }

        console.log("Productos brutos recibidos:", rawProducts);

        // --- 2. Preparar Datos para Mostrar y Calcular Precios ---
        const productsToDisplay: ProductDisplay[] = rawProducts.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          fecha_actualizacion: formatDate(p.fecha_actualizacion_costo), // Formatear fecha
          tipo_calculo: p.tipo_calculo,
          precio: undefined, // Precio aún no calculado
          isLoadingPrice: true, // Marcar para calcular precio
          priceError: false,
        }));

        // Mostrar productos básicos inmediatamente (sin precio)
        setProducts(productsToDisplay);
        setLoadingInitial(false); // Termina carga inicial, empieza carga de precios

        // --- 3. Calcular Precios Asincrónicamente ---
        // Usamos Promise.allSettled para que si un precio falla, los demás continúen
        const pricePromises = productsToDisplay.map(p => calculatePrice(p.id));
        const priceResults = await Promise.allSettled(pricePromises);

        // --- 4. Actualizar Estado con los Precios (o Errores) ---
        setProducts(currentProducts => {
             // Creamos un nuevo array basado en el estado *actual*
             // para evitar problemas si el estado cambió mientras se calculaban los precios
             const updatedProducts = currentProducts.map(p => ({...p}));

             priceResults.forEach((result, index) => {
                 const targetProductId = productsToDisplay[index].id; // ID del producto procesado
                 const productIndexInState = updatedProducts.findIndex(p => p.id === targetProductId);

                 if (productIndexInState !== -1) { // Asegurarse que el producto aún existe en el estado
                     if (result.status === 'fulfilled') {
                         updatedProducts[productIndexInState] = {
                             ...updatedProducts[productIndexInState],
                             precio: result.value, // Precio calculado
                             isLoadingPrice: false,
                             priceError: false,
                         };
                     } else { // Si la promesa falló (rejected)
                         console.error(`Error calculando precio para ID ${targetProductId}:`, result.reason);
                         updatedProducts[productIndexInState] = {
                             ...updatedProducts[productIndexInState],
                             isLoadingPrice: false,
                             priceError: true, // Marcar error de precio
                         };
                     }
                 }
             });
             return updatedProducts; // Devolver el nuevo array de estado
        });

      }//eslint-disable-next-line
       catch (err: any) {
        console.error("Error en fetchDataAndPrices:", err);
        setErrorInitial(err.message || 'Ocurrió un error al cargar los datos.');
        setLoadingInitial(false);
      }
    };

    fetchDataAndPrices();
  }, []); // Se ejecuta solo una vez al montar el componente

  // --- Función para Calcular Precio (Llama a tu API) ---
  const calculatePrice = async (productoId: number): Promise<number> => {
    try {
      // console.log(`Calculando precio para ID: ${productoId}`);
      const response = await fetch(`https://sistemataup.online/productos/calcular_precio/${productoId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Quizás necesites headers de autenticación aquí si tu API los requiere
        },
        body: JSON.stringify({
          // Asegúrate que los nombres de campo coincidan con tu API
          producto_id: productoId,
          quantity: 1, // Cantidad siempre 1 como solicitaste
        }),
      });

      if (!response.ok) {
         const errorData = await response.json().catch(() => ({})); // Intenta obtener detalle del error
         throw new Error(errorData.mensaje || `Error ${response.status} al calcular precio`);
      }

      const data = await response.json();

      // !!! AJUSTA ESTA LÍNEA según el nombre del campo que contiene el precio en tu API !!!
      const precioCalculado = data.precio_total_calculado_ars; // O data.precio, data.price, etc.

      if (typeof precioCalculado !== 'number') {
           console.error("Formato de precio inesperado:", data);
           throw new Error('Formato de precio inválido recibido');
      }

      return precioCalculado;

    } catch (error) {
      // Relanzamos el error para que Promise.allSettled lo capture
      // console.error(`Error en calculatePrice para ID ${productoId}:`, error);
      throw error;
    }
  };

  // --- Función para Formatear Fecha ---
  const formatDate = (isoDateString: string | null | undefined): string => {
    if (!isoDateString) return 'N/A'; // Si no hay fecha
    try {
      // new Date() puede manejar el formato ISO "2025-04-22T05:59:11"
      const date = new Date(isoDateString);
      // Comprobar si la fecha es válida
      if (isNaN(date.getTime())) {
        return 'Fecha inválida';
      }
      // Formato DD/MM/YYYY para Argentina
      return date.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch (e) {
      console.error("Error formateando fecha:", isoDateString, e);
      return 'Error fecha';
    }
  };

  // --- Filtrar Productos para Mostrar basado en searchTerm ---
   const filteredProducts = products.filter(product =>
     product.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
     product.id.toString().includes(searchTerm) ||
     product.tipo_calculo.toLowerCase().includes(searchTerm.toLowerCase())
   );

  // --- Renderizado JSX ---
  
  // --- ✨ NUEVO: Pre-renderizar las filas del tbody ---
  let tableBodyContent;
  if (filteredProducts.length > 0) {
    tableBodyContent = filteredProducts.map((product) => (
      // El contenido de cada fila sigue igual
      <tr key={product.id} className="hover:bg-indigo-50 transition duration-150 ease-in-out">
        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{product.id}</td>
        <td className="px-4 py-3 text-sm font-medium text-gray-900">{product.nombre}</td>
        <td className="px-4  py-3 whitespace-nowrap text-sm text-gray-900">{product.fecha_actualizacion}</td>
        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{product.tipo_calculo}</td>
        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900"> {/* Alineado a la izquierda */}
          {product.isLoadingPrice ? (
            <span className="text-xs text-gray-400 italic">Calculando...</span>
          ) : product.priceError ? (
            <span className="text-xs text-red-500 font-medium">Error</span>
          ) : typeof product.precio === 'number' ? (
            `$${product.precio.toFixed(2)}`
          ) : (
            <span className="text-xs text-gray-400">N/A</span>
          )}
        </td>
      </tr>
    ));
  } else {
    // Fila para cuando no hay productos
    tableBodyContent = (
      <tr>
        <td colSpan={5} className="text-center text-gray-500 py-4 px-4">No se encontraron productos que coincidan con la búsqueda.</td>
      </tr>
    );
  }
  // --- FIN Pre-renderizado ---


  // --- Renderizado JSX ---
  return (
    <div className="p-4 md:p-6 bg-gray-100 min-h-screen">
      <div className="max-w-7xl mx-auto bg-white shadow-md rounded-lg p-4 md:p-6">

        {/* Barra Superior (sin cambios) */}
        <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-3">
          {/* ... input y botón ... */}
           <input
            type="text"
            placeholder="Buscar por nombre, ID, tipo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 w-full sm:w-auto"
          />
          <button
             // onClick={() => { /* Lógica para abrir modal/form de agregar */ alert("Agregar Item - Lógica pendiente"); }}
             className="w-full sm:w-auto bg-indigo-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 flex items-center justify-center gap-1"
          >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
             </svg>
             Agregar Item
          </button>
        </div>

        {/* Indicador de Carga Inicial (sin cambios) */}
        {loadingInitial && <p className="text-center text-gray-600 my-6">Cargando lista de productos...</p>}

        {/* Mensaje de Error Inicial (sin cambios) */}
        {errorInitial && <p className="text-center text-red-600 my-6">Error al cargar productos: {errorInitial}</p>}

        {/* Tabla de Productos */}
        {!loadingInitial && !errorInitial && (
          <div className="overflow-x-auto border border-gray-200 rounded-md">
             {/* Mantenemos table-fixed y quitamos ancho del último th */}
            <table className="min-w-full bg-white table-fixed">
            <thead className="bg-indigo-700 text-white sticky top-0 z-10">
            <tr>
                <th scope="col" className="w-1/12 px-4 py-1 text-left text-base font-bold uppercase tracking-wider">ID</th>
                <th scope="col" className="w-3/12 px-4 py-1 text-left text-base font-bold uppercase tracking-wider">Nombre de Producto</th>
                <th scope="col" className="w-2/12 px-4 py-1 text-left text-base font-bold uppercase tracking-wider">Fecha Actualización</th>
                <th scope="col" className="w-2/12 px-4 py-1 text-left text-base font-bold uppercase tracking-wider">Tipo de Cálculo</th>
                <th scope="col" className="w-1/12 px-4 py-1 text-left text-base font-bold uppercase tracking-wider">Precio</th>
                </tr>
            </thead>
              {/* ✨ CAMBIO: Renderiza la variable pre-calculada DENTRO de tbody */}
              <tbody className="divide-y divide-gray-200">
                {tableBodyContent}
              </tbody>
               {/* Asegúrate que no haya espacios/comentarios entre </tbody> y </table> */}
            </table>
          </div>
        )}
      </div>
    </div>
  );
} // Cierre del componente