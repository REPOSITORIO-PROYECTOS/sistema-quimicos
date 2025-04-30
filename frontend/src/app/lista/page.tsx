"use client";

import React, { useState, useEffect, useCallback, ChangeEvent } from 'react';

// --- Tipos de Datos ---
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
type ProductDisplay = {
  id: number;
  nombre: string;
  fecha_actualizacion: string;
  tipo_calculo: string;
  margen: number;
  ref_calculo: string;
  costo_referencia_usd: number;
  precio?: number;
  isLoadingPrice: boolean;
  priceError: boolean;
};
type PaginationInfo = {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
};

// --- Componente Principal ---
export default function ProductPriceTable() {
  // --- Estados Productos/Paginación ---
  const [products, setProducts] = useState<ProductDisplay[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [errorInitial, setErrorInitial] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [paginationInfo, setPaginationInfo] = useState<PaginationInfo | null>(null);
  const [loadingPageChange, setLoadingPageChange] = useState(false);

  // --- Estados Dólar ---
  const [dolarOficial, setDolarOficial] = useState<number | null>(null);
  const [dolarQuimex, setDolarQuimex] = useState<number | null>(null);
  const [loadingDolar, setLoadingDolar] = useState(true);
  const [errorDolar, setErrorDolar] = useState<string | null>(null);

  // --- Estados Edición Dólar ---
  const [isEditingDolar, setIsEditingDolar] = useState(false);
  const [editDolarOficial, setEditDolarOficial] = useState<string>('');
  const [editDolarQuimex, setEditDolarQuimex] = useState<string>('');
  const [loadingDolarSave, setLoadingDolarSave] = useState(false);
  const [errorDolarSave, setErrorDolarSave] = useState<string | null>(null);

  // --- Función Cargar Valores Dólar (GET) ---
  const fetchDolarValues = useCallback(async () => {
    setLoadingDolar(true);
    setErrorDolar(null);
    setErrorDolarSave(errorDolar);
    try {
      const res = await fetch('https://sistemataup.online/tipos_cambio/obtener_todos');
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length < 2) throw new Error("Formato de respuesta inesperado");

      // Asume que el array tiene objetos con 'nombre' y 'valor'
      //eslint-disable-next-line
      const quimexValor = data.find((d: any) => d.nombre === "Empresa")?.valor; // Busca por nombre "Quimex"
      //eslint-disable-next-line
      const oficialValor = data.find((d: any) => d.nombre === "Oficial")?.valor; // Busca por nombre "Oficial"

      if (typeof quimexValor === 'number') setDolarQuimex(quimexValor); else { setDolarQuimex(null); console.error("Valor Quimex no encontrado o inválido");}
      if (typeof oficialValor === 'number') setDolarOficial(oficialValor); else { setDolarOficial(null); console.error("Valor Oficial no encontrado o inválido");}

    } catch (err) {
      console.error("Error fetchDolarValues:", err);
      setErrorDolar("Error al cargar valores dólar.");
      setDolarOficial(null); setDolarQuimex(null);
    } finally {
      setLoadingDolar(false);
    }
  }, []);

  // --- Función Guardar Valores Dólar (PUT individual) ---
  const handleSaveDolarValues = async () => {
     const oficialNum = parseFloat(editDolarOficial);
     const quimexNum = parseFloat(editDolarQuimex);

     if (isNaN(oficialNum) || oficialNum < 0 || isNaN(quimexNum) || quimexNum < 0) {
         setErrorDolarSave("Por favor, ingresa valores numéricos válidos y positivos.");
         return;
     }

     setLoadingDolarSave(true);
     setErrorDolarSave(null);

     // --- Nombres EXACTOS esperados por tu backend en la URL ---
     // AJUSTA ESTOS NOMBRES SI SON DIFERENTES EN TU BASE DE DATOS / MODELO TipoCambio
     const nombreDolarOficial = "Oficial";
     const nombreDolarQuimex = "Empresa";
     // ---------------------------------------------------------

     const baseUrl = 'https://sistemataup.online/tipos_cambio/actualizar';

     console.log(`Attempting to update ${nombreDolarOficial} to ${oficialNum} and ${nombreDolarQuimex} to ${quimexNum}`);

     try {
         const responses = await Promise.allSettled([
             fetch(`${baseUrl}/${nombreDolarOficial}`, { // Nombre en la URL
                 method: 'PUT',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ valor: oficialNum }), // Solo valor en body
             }),
             fetch(`${baseUrl}/${nombreDolarQuimex}`, { // Nombre en la URL
                 method: 'PUT',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ valor: quimexNum }), // Solo valor en body
             })
         ]);

         const errors: string[] = [];
         let success = true;

         // Verificar respuesta Oficial
         const oficialResult = responses[0];
         if (oficialResult.status === 'rejected' || !oficialResult.value.ok) {
             success = false;
             const errorMsg = oficialResult.status === 'fulfilled'
                 ? `${nombreDolarOficial}: Error ${oficialResult.value.status} - ${await oficialResult.value.text().catch(() => 'Detalle no disponible')}`
                 : `${nombreDolarOficial}: Error de Red - ${oficialResult.reason}`;
             errors.push(errorMsg);
             console.error(`Error updating ${nombreDolarOficial}:`, errorMsg);
         } else {
             console.log(`${nombreDolarOficial} updated successfully.`);
         }

         // Verificar respuesta Quimex
         const quimexResult = responses[1];
         if (quimexResult.status === 'rejected' || !quimexResult.value.ok) {
              success = false;
              const errorMsg = quimexResult.status === 'fulfilled'
                 ? `${nombreDolarQuimex}: Error ${quimexResult.value.status} - ${await quimexResult.value.text().catch(() => 'Detalle no disponible')}`
                 : `${nombreDolarQuimex}: Error de Red - ${quimexResult.reason}`;
              errors.push(errorMsg);
              console.error(`Error updating ${nombreDolarQuimex}:`, errorMsg);
         } else {
              console.log(`${nombreDolarQuimex} updated successfully.`);
         }

         // Concluir basado en el éxito de AMBAS peticiones
         if (success) {
             setDolarOficial(oficialNum);
             setDolarQuimex(quimexNum);
             setIsEditingDolar(false);
             alert("Valores del dólar actualizados con éxito.");
         } else {
             setErrorDolarSave(`Errores: ${errors.join('; ')}`);
         }

     } //eslint-disable-next-line
      catch (err: any) {
         console.error("Error general en handleSaveDolarValues:", err);
         setErrorDolarSave(err.message || "Error de red al intentar guardar.");
     } finally {
         setLoadingDolarSave(false);
     }
  };

  // --- Handler Activar Modo Edición ---
  const handleEditDolarClick = () => {
      setEditDolarOficial(dolarOficial?.toString() ?? '');
      setEditDolarQuimex(dolarQuimex?.toString() ?? '');
      setIsEditingDolar(true);
      setErrorDolarSave(null);
  };

  // --- Handler Cancelar Edición ---
  const handleCancelDolarEdit = () => {
      setIsEditingDolar(false);
      setErrorDolarSave(null);
  };

  // --- Handler Cambios Inputs Dólar ---
   const handleDolarInputChange = (e: ChangeEvent<HTMLInputElement>) => {
       const { name, value } = e.target;
       // Permitir solo números y un punto decimal
       const sanitizedValue = value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
       if (name === 'dolarOficial') {
           setEditDolarOficial(sanitizedValue);
       } else if (name === 'dolarQuimex') {
           setEditDolarQuimex(sanitizedValue);
       }
   };

  // --- useEffect Carga Inicial Dólar ---
  useEffect(() => {
    fetchDolarValues();
  }, [fetchDolarValues]);

  // --- Función Cargar Datos Productos ---
  const fetchDataAndPrices = useCallback(async (pageToFetch: number) => {
    if (pageToFetch === 1 && products.length === 0) { setLoadingInitial(true); }
    else { setLoadingPageChange(true); }
    setErrorInitial(null);
    try {
      const apiUrl = `https://sistemataup.online/productos/obtener_todos_paginado?page=${pageToFetch}`;
      const initialResponse = await fetch(apiUrl);
      if (!initialResponse.ok) throw new Error(`Error ${initialResponse.status}`);
      const data = await initialResponse.json();
      const rawProducts: ProductDataRaw[] = data.productos || [];
      const receivedPagination: PaginationInfo | undefined = data.pagination;
      if (!Array.isArray(rawProducts)) throw new Error("Formato API productos inválido.");
      setPaginationInfo(receivedPagination || { page: 1, per_page: rawProducts.length, total: rawProducts.length, total_pages: 1 });
      const productsToDisplay: ProductDisplay[] = rawProducts.map((p) => ({
        id: p.id, nombre: p.nombre, fecha_actualizacion: formatDate(p.fecha_actualizacion_costo),
        tipo_calculo: p.tipo_calculo, margen: p.margen, ref_calculo: p.ref_calculo,
        costo_referencia_usd: p.costo_referencia_usd, precio: undefined,
        isLoadingPrice: true, priceError: false,
      }));
      setProducts(productsToDisplay);
      setLoadingInitial(false); setLoadingPageChange(false);
      const pricePromises = productsToDisplay.map(p => calculatePrice(p.id));
      const priceResults = await Promise.allSettled(pricePromises);
      setProducts(currentProducts => {
           const updatedProducts = currentProducts.map(p => ({...p}));
           priceResults.forEach((result, index) => {
               const targetProductId = productsToDisplay[index].id;
               const productIndexInState = updatedProducts.findIndex(p => p.id === targetProductId);
               if (productIndexInState !== -1) {
                   if (result.status === 'fulfilled') {
                       updatedProducts[productIndexInState].precio = result.value;
                       updatedProducts[productIndexInState].isLoadingPrice = false;
                       updatedProducts[productIndexInState].priceError = false; // Limpiar error
                   } else {
                       console.error(`Error calc precio ID ${targetProductId}:`, result.reason);
                       updatedProducts[productIndexInState].isLoadingPrice = false;
                       updatedProducts[productIndexInState].priceError = true;
                   }
               }
           });
           return updatedProducts; });
          //eslint-disable-next-line
    } catch (err: any) {
        console.error("Error en fetchDataAndPrices:", err);
        setErrorInitial(err.message || 'Error al cargar datos.');
        setLoadingInitial(false); setLoadingPageChange(false);
        setProducts([]); setPaginationInfo(null);
    }
  }, [products.length]); // Ajustar dependencia si es necesario

  // --- useEffect Cargar Productos ---
  useEffect(() => { fetchDataAndPrices(currentPage); }, [currentPage, fetchDataAndPrices]);

  // --- Función Calcular Precio ---
  const calculatePrice = async (productoId: number): Promise<number> => {
    try {
      const response = await fetch(`https://sistemataup.online/productos/calcular_precio/${productoId}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ producto_id: productoId, quantity: 1 }),
      });
      if (!response.ok) { const errorData = await response.json().catch(() => ({})); throw new Error(errorData.mensaje || `Error ${response.status}`); }
      const data = await response.json();
      const precioCalculado = data.precio_total_calculado_ars;
      if (typeof precioCalculado !== 'number') { throw new Error('Formato de precio inválido recibido'); }
      return precioCalculado;
    } catch (error) { throw error; }
  };

  // --- Función Formatear Fecha ---
  const formatDate = (isoDateString: string | null | undefined): string => {
    if (!isoDateString) return 'N/A';
    try { const date = new Date(isoDateString); if (isNaN(date.getTime())) return 'Fecha inválida'; return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
    catch (e) { console.error("Error formateando fecha:", isoDateString, e); return 'Error fecha'; }
  };

  // --- Filtrar Productos ---
  const filteredProducts = products.filter(product =>
    product.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.id.toString().includes(searchTerm) ||
    product.tipo_calculo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.ref_calculo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // --- Handlers Paginación ---
  const goToPreviousPage = () => { if (currentPage > 1) setCurrentPage(prev => prev - 1); };
  const goToNextPage = () => { if (paginationInfo && currentPage < paginationInfo.total_pages) setCurrentPage(prev => prev + 1); };

  // --- Renderizado Filas ---
  let tableBodyContent;
  const numberOfColumns = 8;
  if (!loadingInitial && filteredProducts.length > 0) {
    tableBodyContent = filteredProducts.map((product) => (
      <tr key={product.id} className="hover:bg-indigo-50 transition duration-150 ease-in-out">
        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{product.id}</td>
        <td className="px-4 py-3 text-sm font-medium text-gray-900">{product.nombre}</td>
        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{product.fecha_actualizacion}</td>
        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{product.tipo_calculo}</td>
        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-left">
          {typeof product.margen === 'number' ? `${product.margen.toFixed(2)}%` : 'N/A'}
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{product.ref_calculo}</td>
        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-left">
          {typeof product.costo_referencia_usd === 'number' ? `$${product.costo_referencia_usd.toFixed(2)}` : 'N/A'}
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-left">
          {product.isLoadingPrice ? ( <span className="text-xs text-gray-400 italic">Calculando...</span> )
           : product.priceError ? ( <span className="text-xs text-red-500 font-medium">Error</span> )
           : typeof product.precio === 'number' ? ( `$${product.precio.toFixed(2)}` )
           : ( <span className="text-xs text-gray-400">N/A</span> )}
        </td>
      </tr>
    ));
  } else if (!loadingInitial && !errorInitial && filteredProducts.length === 0 && searchTerm) {
      tableBodyContent = ( <tr> <td colSpan={numberOfColumns} className="text-center text-gray-500 py-4 px-4">No se encontraron productos...</td> </tr> );
  } else if (!loadingInitial && !errorInitial && products.length === 0 && !searchTerm) {
       tableBodyContent = ( <tr> <td colSpan={numberOfColumns} className="text-center text-gray-500 py-4 px-4">No hay productos para mostrar.</td> </tr> );
   } else { tableBodyContent = null; }

  // --- Renderizado JSX del Componente ---
  return (
    <div className="p-4 md:p-6 bg-gray-100 min-h-screen">
      <div className="max-w-7xl mx-auto bg-white shadow-md rounded-lg p-4 md:p-6">

        {/* Barra Superior */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
          {/* Buscador */}
          <input
             type="text"
             placeholder="Buscar en página actual..."
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
             className="px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 w-full md:w-auto flex-grow md:flex-grow-0"
           />
          {/* Contenedor Info/Edición Dólar */}
          <div className="flex flex-col sm:flex-row items-center gap-x-4 gap-y-2 w-full md:w-auto justify-end flex-wrap">
            {/* Sección Dólar Oficial */}
            <div className="text-sm flex items-center gap-1">
              <label htmlFor="dolarOficialInput" className="font-medium text-gray-600 cursor-pointer">Dólar Oficial:</label>
              {loadingDolar ? ( <span className="text-gray-400 italic text-xs">Cargando...</span> )
               : isEditingDolar ? (
                  <input
                      id="dolarOficialInput" type="text" name="dolarOficial" // Cambiado a text para validación manual
                      value={editDolarOficial} onChange={handleDolarInputChange}
                      className="px-2 py-1 border border-gray-300 rounded-md shadow-sm text-sm w-24 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      disabled={loadingDolarSave}
                      inputMode="decimal" // Ayuda en móviles
                  />
               ) : typeof dolarOficial === 'number' ? (
                  <span className="font-semibold text-gray-800">${dolarOficial.toFixed(2)}</span>
               ) : (
                  <span className="text-red-500 text-xs font-medium">Error</span>
               )}
            </div>
            {/* Sección Dólar Quimex */}
            <div className="text-sm flex items-center gap-1">
              <label htmlFor="dolarQuimexInput" className="font-medium text-gray-600 cursor-pointer">Dólar Quimex:</label>
               {loadingDolar ? ( <span className="text-gray-400 italic text-xs">Cargando...</span> )
               : isEditingDolar ? (
                    <input
                      id="dolarQuimexInput" type="text" name="dolarQuimex" // Cambiado a text para validación manual
                      value={editDolarQuimex} onChange={handleDolarInputChange}
                      className="px-2 py-1 border border-gray-300 rounded-md shadow-sm text-sm w-24 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      disabled={loadingDolarSave}
                      inputMode="decimal" // Ayuda en móviles
                  />
               ) : typeof dolarQuimex === 'number' ? (
                  <span className="font-semibold text-gray-800">${dolarQuimex.toFixed(2)}</span>
               ) : (
                  <span className="text-red-500 text-xs font-medium">Error</span>
               )}
            </div>
             {/* Botones Editar/Guardar/Cancelar */}
             <div className="flex items-center gap-2">
                 {isEditingDolar ? (
                    <>
                        <button
                          onClick={handleSaveDolarValues}
                          disabled={loadingDolarSave || loadingDolar}
                          className={`px-3 py-1 text-xs font-medium rounded-md shadow-sm flex items-center gap-1 transition duration-150 ease-in-out ${
                            loadingDolarSave || loadingDolar ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-green-100 text-green-700 hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1'
                          }`}
                        >
                           <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 ${loadingDolarSave ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                           {loadingDolarSave ? 'Guardando...' : 'Guardar'}
                        </button>
                        <button
                          onClick={handleCancelDolarEdit}
                          disabled={loadingDolarSave}
                          className="px-3 py-1 text-xs font-medium rounded-md shadow-sm bg-gray-100 text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-1 disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                    </>
                 ) : (
                    <button
                      onClick={handleEditDolarClick}
                      disabled={loadingDolar || dolarOficial === null || dolarQuimex === null}
                      className={`px-3 py-1 text-xs font-medium rounded-md shadow-sm flex items-center gap-1 transition duration-150 ease-in-out ${
                        loadingDolar || dolarOficial === null || dolarQuimex === null ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-100 text-blue-700 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1'
                      }`}
                    >
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                       Editar Dólar
                    </button>
                 )}
             </div>
             {/* Mensaje error guardado */}
             {errorDolarSave && (
                 <p className="text-xs text-red-600 mt-1 w-full text-right sm:text-left sm:w-auto">{errorDolarSave}</p>
             )}
          </div>
        </div>

        {/* Indicador Carga/Error Productos */}
        {loadingInitial && <p className="text-center text-gray-600 my-6">Cargando lista de productos inicial...</p>}
        {errorInitial && <p className="text-center text-red-600 my-6">Error al cargar: {errorInitial}</p>}

        {/* Tabla y Paginación */}
        {!loadingInitial && !errorInitial && (
          <>
            <div className="overflow-x-auto border border-gray-200 rounded-md">
              <table className="min-w-full bg-white table-fixed">
                <thead className="bg-indigo-700 text-white sticky top-0 z-10">
                 <tr>
                    <th scope="col" className="w-[10%] px-4 py-2 text-left text-sm font-bold uppercase tracking-wider">ID</th>
                    <th scope="col" className="w-[25%] px-4 py-2 text-left text-sm font-bold uppercase tracking-wider">Nombre</th>
                    <th scope="col" className="w-[15%] px-4 py-2 text-left text-sm font-bold uppercase tracking-wider">Actualización</th>
                    <th scope="col" className="w-[10%] px-4 py-2 text-left text-sm font-bold uppercase tracking-wider">Cálculo</th>
                    <th scope="col" className="w-[10%] px-4 py-2 text-left text-sm font-bold uppercase tracking-wider ">Margen</th>
                    <th scope="col" className="w-[10%] px-4 py-2 text-left text-sm font-bold uppercase tracking-wider">Referencia</th>
                    <th scope="col" className="w-[10%] px-4 py-2 text-left text-sm font-bold uppercase tracking-wider ">Costo USD</th>
                    <th scope="col" className="w-[10%] px-4 py-2 text-left text-sm font-bold uppercase tracking-wider ">Precio ARS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {/* Indicador de carga para cambio de página */}
                  {loadingPageChange && (
                      <tr>
                          <td colSpan={numberOfColumns} className="text-center py-4 px-4">
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
                  {/* Renderiza las filas */}
                  {!loadingPageChange && tableBodyContent}
                </tbody>
              </table>
            </div>

            {/* Controles de Paginación */}
            {paginationInfo && paginationInfo.total_pages > 1 && (
              <div className="flex justify-between items-center mt-4 px-1 py-2 border-t border-gray-200">
                 <button onClick={goToPreviousPage} disabled={currentPage === 1 || loadingPageChange} className={`px-4 py-2 text-sm font-medium rounded-md ${ currentPage === 1 || loadingPageChange ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' }`}> Anterior </button>
                 <span className="text-sm text-gray-700"> Página {currentPage} de {paginationInfo.total_pages} </span>
                 <button onClick={goToNextPage} disabled={currentPage === paginationInfo.total_pages || loadingPageChange} className={`px-4 py-2 text-sm font-medium rounded-md ${ currentPage === paginationInfo.total_pages || loadingPageChange ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' }`}> Siguiente </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}