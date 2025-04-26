"use client";

import React, { useState, useEffect, useCallback } from 'react';

// --- Tipos de Datos ---

// Tipo para los datos brutos recibidos de la primera API
type ProductDataRaw = {
  ajusta_por_tc: boolean;
  costo_referencia_usd: number;
  es_receta: boolean;
  fecha_actualizacion_costo: string;
  id: number;
  margen: number;
  nombre: string;
  receta_id: number | null;
  ref_calculo: string;
  tipo_calculo: string;
  unidad_venta: string;
};

// Tipo para los datos que mostraremos en la tabla
type ProductDisplay = {
  id: number;
  nombre: string;
  fecha_actualizacion: string;
  tipo_calculo: string;
  precio?: number;
  isLoadingPrice: boolean;
  priceError: boolean;
};

// ✨ NUEVO: Tipo para la información de paginación de la API
type PaginationInfo = {
  page: number;          // Página actual devuelta por la API
  per_page: number;      // Elementos por página
  total: number;         // Total de elementos en todas las páginas
  total_pages: number;   // Número total de páginas
  // Puedes añadir más campos si tu API los devuelve (e.g., next_url, prev_url)
};

// --- Componente Principal ---

export default function ProductPriceTable() {
  // --- Estados ---
  const [products, setProducts] = useState<ProductDisplay[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true); // Carga inicial de productos
  const [errorInitial, setErrorInitial] = useState<string | null>(null); // Error en carga inicial
  const [searchTerm, setSearchTerm] = useState(''); // Para el input de búsqueda

  // --- ✨ NUEVO: Estados para Paginación ---
  const [currentPage, setCurrentPage] = useState(1); // Página que queremos solicitar
  const [paginationInfo, setPaginationInfo] = useState<PaginationInfo | null>(null); // Info de paginación de la API
  const [loadingPageChange, setLoadingPageChange] = useState(false); // Carga al cambiar de página

  // --- ✨ MODIFICADO: Función para Cargar Datos y Precios (ahora con paginación) ---
  // Usamos useCallback para evitar recrear la función en cada render si no cambian sus dependencias (aunque aquí no es estrictamente necesario por cómo se usa)
  const fetchDataAndPrices = useCallback(async (pageToFetch: number) => {
    // Indicar carga (diferente para inicial vs cambio de página)
    if (pageToFetch === 1 && products.length === 0) { // Solo la primerísima carga
        setLoadingInitial(true);
    } else {
        setLoadingPageChange(true); // Cargando nueva página
    }
    setErrorInitial(null); // Limpiar errores previos al intentar cargar
    // No limpiar productos aquí para que no parpadee la tabla al cambiar de página

    try {
      // --- 1. Obtener Datos Iniciales para la Página Solicitada ---
      // !!! REEMPLAZA ESTA URL CON LA TUYA, asegurándote que acepta un parámetro de página (ej. ?page=N) !!!
      const apiUrl = `https://sistemataup.online/productos/obtener_todos?page=${pageToFetch}`; // Asumiendo que la API usa ?page=
      console.log("Fetching data from:", apiUrl); // Log para depuración

      const initialResponse = await fetch(apiUrl);
      
      if (!initialResponse.ok) {
        throw new Error(`Error ${initialResponse.status}: No se pudieron obtener los productos para la página ${pageToFetch}.`);
      }

      const data = await initialResponse.json();
      console.log("API Response:", data); // Log para depuración

      // --- ✨ MODIFICADO: Extraer productos y paginación ---
      const rawProducts: ProductDataRaw[] = data.productos || []; // Asegúrate que 'productos' es el nombre correcto
      const receivedPagination: PaginationInfo | undefined = data.pagination; // Asegúrate que 'pagination' es el nombre correcto

      // Validar datos recibidos
      if (!Array.isArray(rawProducts)) {
           console.error("La respuesta de 'productos' no es un array:", rawProducts);
           throw new Error("Formato de datos inesperado de la API de productos.");
      }
       if (!receivedPagination) {
          console.warn("Advertencia: La respuesta de la API no incluye información de 'pagination'. La paginación no funcionará correctamente.");
          // Podrías establecer una paginación por defecto si solo hay una página o manejarlo de otra forma
           setPaginationInfo({ page: 1, per_page: rawProducts.length, total: rawProducts.length, total_pages: 1 }); // Ejemplo paliativo
       } else {
           setPaginationInfo(receivedPagination); // Guardar info de paginación
       }

      console.log("Productos brutos recibidos (página " + pageToFetch + "):", rawProducts);
      console.log("Información de paginación recibida:", receivedPagination);


      // --- 2. Preparar Datos para Mostrar (solo los de la página actual) ---
      const productsToDisplay: ProductDisplay[] = rawProducts.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        fecha_actualizacion: formatDate(p.fecha_actualizacion_costo),
        tipo_calculo: p.tipo_calculo,
        precio: undefined,
        isLoadingPrice: true, // Marcar para calcular precio
        priceError: false,
      }));

      // Actualizar la lista de productos con los de la nueva página
      setProducts(productsToDisplay);

      // Quitar indicadores de carga
      setLoadingInitial(false);
      setLoadingPageChange(false);

      // --- 3. Calcular Precios Asincrónicamente para la Página Actual ---
      // Esta lógica sigue igual, pero ahora solo opera sobre los productos de la página actual
       const pricePromises = productsToDisplay.map(p => calculatePrice(p.id));
       const priceResults = await Promise.allSettled(pricePromises);

       // --- 4. Actualizar Estado con los Precios (o Errores) ---
       setProducts(currentProducts => {
            // Crear un nuevo array basado en el estado *actual* de esta página
            const updatedProducts = currentProducts.map(p => ({...p}));

            priceResults.forEach((result, index) => {
                const targetProductId = productsToDisplay[index].id;
                const productIndexInState = updatedProducts.findIndex(p => p.id === targetProductId);

                if (productIndexInState !== -1) {
                    if (result.status === 'fulfilled') {
                        updatedProducts[productIndexInState] = {
                            ...updatedProducts[productIndexInState],
                            precio: result.value,
                            isLoadingPrice: false,
                            priceError: false,
                        };
                    } else {
                        console.error(`Error calculando precio para ID ${targetProductId} (página ${pageToFetch}):`, result.reason);
                        updatedProducts[productIndexInState] = {
                            ...updatedProducts[productIndexInState],
                            isLoadingPrice: false,
                            priceError: true,
                        };
                    }
                }
            });
            return updatedProducts;
       });

    }//eslint-disable-next-line
     catch (err: any) {
      console.error("Error en fetchDataAndPrices:", err);
      setErrorInitial(err.message || 'Ocurrió un error al cargar los datos.');
      setLoadingInitial(false);
      setLoadingPageChange(false);
      setProducts([]); // Limpiar productos en caso de error grave
      setPaginationInfo(null); // Limpiar paginación en caso de error
    }
  }, [products.length]); // Incluir products.length en dependencias de useCallback si la lógica interna depende de si hay productos o no

  // --- ✨ MODIFICADO: Efecto para Cargar Datos Iniciales y al Cambiar de Página ---
  useEffect(() => {
    console.log(`useEffect disparado. currentPage: ${currentPage}`); // Log para depuración
    fetchDataAndPrices(currentPage);
     // La dependencia AHORA es currentPage. Cada vez que cambie, se ejecuta el efecto.
     // También necesitamos incluir fetchDataAndPrices si no está definida con useCallback fuera del efecto
  }, [currentPage, fetchDataAndPrices]);

  // --- Función para Calcular Precio (sin cambios) ---
  const calculatePrice = async (productoId: number): Promise<number> => {
    try {
      const response = await fetch(`https://sistemataup.online/productos/calcular_precio/${productoId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ producto_id: productoId, quantity: 1 }),
      });
      if (!response.ok) {
         const errorData = await response.json().catch(() => ({}));
         throw new Error(errorData.mensaje || `Error ${response.status} al calcular precio`);
      }
      const data = await response.json();
      const precioCalculado = data.precio_total_calculado_ars;
      if (typeof precioCalculado !== 'number') {
           console.error("Formato de precio inesperado:", data);
           throw new Error('Formato de precio inválido recibido');
      }
      return precioCalculado;
    } catch (error) {
      throw error;
    }
  };

  // --- Función para Formatear Fecha (sin cambios) ---
  const formatDate = (isoDateString: string | null | undefined): string => {
    if (!isoDateString) return 'N/A';
    try {
      const date = new Date(isoDateString);
      if (isNaN(date.getTime())) return 'Fecha inválida';
      return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
      console.error("Error formateando fecha:", isoDateString, e);
      return 'Error fecha';
    }
  };

  // --- Filtrar Productos (¡Ahora filtra solo la página actual!) ---
   const filteredProducts = products.filter(product =>
     product.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
     product.id.toString().includes(searchTerm) ||
     product.tipo_calculo.toLowerCase().includes(searchTerm.toLowerCase())
   );

  // --- ✨ NUEVO: Handlers para Paginación ---
  const goToPreviousPage = () => {
      if (currentPage > 1) {
          setCurrentPage(prev => prev - 1);
      }
  };

  const goToNextPage = () => {
      if (paginationInfo && currentPage < paginationInfo.total_pages) {
          setCurrentPage(prev => prev + 1);
      }
  };


  // --- Renderizado JSX ---

  // Pre-renderizar las filas del tbody (sin cambios en su lógica interna)
  let tableBodyContent;
  if (!loadingInitial && filteredProducts.length > 0) { // Mostrar solo si no es carga inicial y hay productos filtrados
    tableBodyContent = filteredProducts.map((product) => (
      <tr key={product.id} className="hover:bg-indigo-50 transition duration-150 ease-in-out">
        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{product.id}</td>
        <td className="px-4 py-3 text-sm font-medium text-gray-900">{product.nombre}</td>
        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{product.fecha_actualizacion}</td>
        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{product.tipo_calculo}</td>
        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
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
  } else if (!loadingInitial && !errorInitial && filteredProducts.length === 0 && searchTerm) {
      // Mensaje si la búsqueda no encontró resultados en la página actual
      tableBodyContent = (
          <tr>
              <td colSpan={5} className="text-center text-gray-500 py-4 px-4">No se encontraron productos que coincidan con la búsqueda en esta página.</td>
          </tr>
      );
  } else if (!loadingInitial && !errorInitial && products.length === 0 && !searchTerm) {
       // Mensaje si no hay productos en absoluto (después de la carga inicial)
       tableBodyContent = (
           <tr>
               <td colSpan={5} className="text-center text-gray-500 py-4 px-4">No hay productos para mostrar.</td>
           </tr>
       );
   } else {
       // Durante la carga inicial o si hay error, no mostramos filas (los mensajes de error/carga están fuera de la tabla)
       tableBodyContent = null; // O un spinner dentro de la tabla si se prefiere
   }


  // --- Renderizado JSX del Componente ---
  return (
    <div className="p-4 md:p-6 bg-gray-100 min-h-screen">
      <div className="max-w-7xl mx-auto bg-white shadow-md rounded-lg p-4 md:p-6">

        {/* Barra Superior (sin cambios) */}
        <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-3">
           <input
            type="text"
            placeholder="Buscar en página actual..." // Aclarar que busca en la página actual
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

        {/* Indicador de Carga Inicial */}
        {loadingInitial && <p className="text-center text-gray-600 my-6">Cargando lista de productos inicial...</p>}

        {/* Mensaje de Error Inicial */}
        {errorInitial && <p className="text-center text-red-600 my-6">Error al cargar: {errorInitial}</p>}

        {/* Tabla de Productos (solo se muestra si no hay carga inicial ni error) */}
        {!loadingInitial && !errorInitial && (
          <>
            <div className="overflow-x-auto border border-gray-200 rounded-md">
              <table className="min-w-full bg-white table-fixed">
              <thead className="bg-indigo-700 text-white sticky top-0 z-10">
               <tr>
                 {/* Ajusta los anchos si es necesario con w-x/y */}
                  <th scope="col" className="w-[10%] px-4 py-2 text-left text-sm font-bold uppercase tracking-wider">ID</th>
                  <th scope="col" className="w-[35%] px-4 py-2 text-left text-sm font-bold uppercase tracking-wider">Nombre</th>
                  <th scope="col" className="w-[20%] px-4 py-2 text-left text-sm font-bold uppercase tracking-wider">Actualización</th>
                  <th scope="col" className="w-[20%] px-4 py-2 text-left text-sm font-bold uppercase tracking-wider">Cálculo</th>
                  <th scope="col" className="w-[15%] px-4 py-2 text-left text-sm font-bold uppercase tracking-wider">Precio</th>
                </tr>
              </thead>
                <tbody className="divide-y divide-gray-200">
                  {/* Indicador de carga para cambio de página */}
                  {loadingPageChange && (
                      <tr>
                          <td colSpan={5} className="text-center py-4 px-4">
                              <div className="flex justify-center items-center space-x-2 text-gray-500">
                                  <svg className="animate-spin h-5 w-5 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  <span>Cargando página...</span>
                              </div>
                          </td>
                      </tr>
                  )}
                  {/* Renderiza las filas pre-calculadas si no está cargando página */}
                  {!loadingPageChange && tableBodyContent}
                </tbody>
              </table>
            </div>

            {/* --- ✨ NUEVO: Controles de Paginación --- */}
            {paginationInfo && paginationInfo.total_pages > 1 && ( // Mostrar solo si hay más de 1 página
              <div className="flex justify-between items-center mt-4 px-1 py-2 border-t border-gray-200">
                <button
                  onClick={goToPreviousPage}
                  disabled={currentPage === 1 || loadingPageChange}
                  className={`px-4 py-2 text-sm font-medium rounded-md ${
                    currentPage === 1 || loadingPageChange
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                  }`}
                >
                  Anterior
                </button>
           
                <button
                  onClick={goToNextPage}
                  disabled={currentPage === paginationInfo.total_pages || loadingPageChange}
                  className={`px-4 py-2 text-sm font-medium rounded-md ${
                    currentPage === paginationInfo.total_pages || loadingPageChange
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                  }`}
                >
                  Siguiente
                </button>
              </div>
            )}
          </>
        )}
        {/* Fin del contenedor condicional de la tabla y paginación */}

      </div>
    </div>
  );
}