"use client";

import React, { useState, useEffect, useCallback, ChangeEvent } from 'react';
import CreateProductModal from '@/components/CreateProductModal'; // Asegúrate que la ruta sea correcta

// --- Tipos de Datos (ACTUALIZADOS) ---
type ProductDataRaw = {
  ajusta_por_tc: boolean;
  costo_referencia_usd: number;
  es_receta: boolean;
  fecha_actualizacion_costo: string;
  id: number; // Asumo que este es el ID numérico que usas
  margen: number;
  nombre: string;
  receta_id: number | null;
  ref_calculo: string;
  tipo_calculo: string;
  unidad_venta: string;
  // Añade 'codigo' si es diferente de 'id' y lo usas para la UI o API
  codigo?: string;
  // NUEVO: Campos para Combo
  es_combo?: boolean;      // Indica si el producto está asociado a una definición de combo
  combo_id?: number | null; // El ID de la entidad Combo si es_combo es true
};

type ProductDisplay = {
  id: number; // ID numérico
  nombre: string;
  fecha_actualizacion: string;
  tipo_calculo: string;
  margen: number;
  ref_calculo: string;
  costo_referencia_usd: number;
  precio?: number;
  isLoadingPrice: boolean;
  priceError: boolean;
  // Si tienes un código de producto separado del ID numérico
  codigo?: string;
  // NUEVO: Campos para Combo
  es_combo?: boolean;
  combo_id?: number | null;
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

  // --- ESTADOS MODALES ACTUALIZADOS ---
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<number | string | null>(null);

  // --- Estados Eliminación ---
  const [deletingProductId, setDeletingProductId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const token = localStorage.getItem("token");

  // --- Función Cargar Valores Dólar (GET) ---
  const fetchDolarValues = useCallback(async () => {
    setLoadingDolar(true);
    setErrorDolar(null);
    setErrorDolarSave(null);
    try {
      const res = await fetch('https://quimex.sistemataup.online/tipos_cambio/obtener_todos', {
          headers: { "Authorization": `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length < 2) throw new Error("Formato inesperado TC");
      // eslint-disable-next-line
      const quimexValor = data.find((d: any) => d.nombre === "Empresa")?.valor;
      // eslint-disable-next-line
      const oficialValor = data.find((d: any) => d.nombre === "Oficial")?.valor;
      if (typeof quimexValor === 'number') setDolarQuimex(quimexValor); else { setDolarQuimex(null); console.error("Valor Empresa no encontrado"); }
      if (typeof oficialValor === 'number') setDolarOficial(oficialValor); else { setDolarOficial(null); console.error("Valor Oficial no encontrado"); }
    } catch (err) { console.error("Error fetchDolarValues:", err); setErrorDolar("Error cargando dólar."); setDolarOficial(null); setDolarQuimex(null); }
    finally { setLoadingDolar(false); }
  }, [token]);

  // --- Función Guardar Valores Dólar (PUT) ---
  const handleSaveDolarValues = async () => {
     const oficialNum = parseFloat(editDolarOficial);
     const quimexNum = parseFloat(editDolarQuimex);
     if (isNaN(oficialNum) || oficialNum < 0 || isNaN(quimexNum) || quimexNum < 0) { setErrorDolarSave("Valores inválidos."); return; }
     setLoadingDolarSave(true); setErrorDolarSave(null);
     const nombreOficial = "Oficial"; const nombreEmpresa = "Empresa";
     const baseUrl = 'https://quimex.sistemataup.online/tipos_cambio/actualizar';
     try {
         const responses = await Promise.allSettled([
             fetch(`${baseUrl}/${nombreOficial}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', "Authorization": `Bearer ${token}` }, body: JSON.stringify({ valor: oficialNum }), }),
             fetch(`${baseUrl}/${nombreEmpresa}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', "Authorization": `Bearer ${token}` }, body: JSON.stringify({ valor: quimexNum }), })
         ]);
         const errors: string[] = []; let success = true;
         const r1 = responses[0]; const r2 = responses[1];
         if (r1.status === 'rejected' || !r1.value.ok) { success = false; const e = r1.status === 'fulfilled' ? `${nombreOficial}: Error ${r1.value.status} - ${await r1.value.text()}` : `${nombreOficial}: Error Red ${r1.reason}`; errors.push(e); console.error(e); } else { console.log(`${nombreOficial} OK`); }
         if (r2.status === 'rejected' || !r2.value.ok) { success = false; const e = r2.status === 'fulfilled' ? `${nombreEmpresa}: Error ${r2.value.status} - ${await r2.value.text()}` : `${nombreEmpresa}: Error Red ${r2.reason}`; errors.push(e); console.error(e); } else { console.log(`${nombreEmpresa} OK`); }
         if (success) { setDolarOficial(oficialNum); setDolarQuimex(quimexNum); setIsEditingDolar(false); alert("Valores Dólar OK."); } else { setErrorDolarSave(`Errores: ${errors.join('; ')}`); }
     }
     // eslint-disable-next-line
     catch (err: any) { console.error("Error save Dólar:", errorDolar); setErrorDolarSave(err.message || "Error red."); }
     finally { setLoadingDolarSave(false); }
  };

  const handleEditDolarClick = () => { setEditDolarOficial(dolarOficial?.toString() ?? ''); setEditDolarQuimex(dolarQuimex?.toString() ?? ''); setIsEditingDolar(true); setErrorDolarSave(null); };
  const handleCancelDolarEdit = () => { setIsEditingDolar(false); setErrorDolarSave(null); };
  const handleDolarInputChange = (e: ChangeEvent<HTMLInputElement>) => { const { name, value } = e.target; const s = value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'); if (name === 'dolarOficial') setEditDolarOficial(s); else if (name === 'dolarQuimex') setEditDolarQuimex(s); };
  useEffect(() => { fetchDolarValues(); }, [fetchDolarValues]);

  // --- Función Cargar Datos Productos ---
  const fetchDataAndPrices = useCallback(async (pageToFetch: number) => {
    if (pageToFetch === 1 && products.length === 0 && !searchTerm) { // Solo loading initial si es la primera carga sin búsqueda
        setLoadingInitial(true);
    } else {
        setLoadingPageChange(true);
    }
    setErrorInitial(null); setDeleteError(null);

    try {
      let apiUrl = `https://quimex.sistemataup.online/productos/obtener_todos_paginado?page=${pageToFetch}`;
      if (searchTerm) {
        apiUrl = `https://quimex.sistemataup.online/productos/buscar_paginado?term=${encodeURIComponent(searchTerm)}&page=${pageToFetch}`;
      }

      const initialResponse = await fetch(apiUrl, {
          headers: { "Authorization": `Bearer ${token}` }
      });
      if (!initialResponse.ok) throw new Error(`Error ${initialResponse.status}`);
      const data = await initialResponse.json();
      const rawProducts: ProductDataRaw[] = data.productos || data.resultados || []; // 'resultados' para el endpoint de búsqueda
      const receivedPagination: PaginationInfo | undefined = data.pagination;

      if (!Array.isArray(rawProducts)) throw new Error("Formato API productos inválido.");
      setPaginationInfo(receivedPagination || { page: 1, per_page: rawProducts.length, total: rawProducts.length, total_pages: 1 });

      const productsToDisplay: ProductDisplay[] = rawProducts.map((p) => ({
        id: p.id,
        codigo: p.codigo || p.id.toString(), // Usar p.codigo si existe, sino p.id
        nombre: p.nombre,
        fecha_actualizacion: formatDate(p.fecha_actualizacion_costo),
        tipo_calculo: p.tipo_calculo,
        margen: p.margen,
        ref_calculo: p.ref_calculo,
        costo_referencia_usd: p.costo_referencia_usd,
        // NUEVO: Mapear datos del combo
        es_combo: p.es_combo || false,
        combo_id: p.combo_id || null,
        precio: undefined,
        isLoadingPrice: true,
        priceError: false,
      }));
      setProducts(productsToDisplay); // Actualiza la lista con los nuevos productos
      setLoadingInitial(false); setLoadingPageChange(false);

      // Calcular precios para los productos recién cargados
      const pricePromises = productsToDisplay.map(p => calculatePrice(p.id));
      const priceResults = await Promise.allSettled(pricePromises);

      setProducts(currentProducts => {
           const updatedProducts = currentProducts.map(p => ({...p}));
           priceResults.forEach((result, index) => {
               const targetProductId = productsToDisplay[index]?.id;
               if (targetProductId === undefined) return;
               const productIndexInState = updatedProducts.findIndex(p => p.id === targetProductId);
               if (productIndexInState !== -1) {
                   if (result.status === 'fulfilled') {
                       updatedProducts[productIndexInState].precio = result.value;
                       updatedProducts[productIndexInState].isLoadingPrice = false;
                       updatedProducts[productIndexInState].priceError = false;
                   } else {
                       console.error(`Error calc precio ID ${targetProductId}:`, result.reason);
                       updatedProducts[productIndexInState].isLoadingPrice = false;
                       updatedProducts[productIndexInState].priceError = true;
                   }
               }
           });
           return updatedProducts;
      });
      // eslint-disable-next-line
    } catch (err: any) {
        console.error("Error fetchDataAndPrices:", err);
        setErrorInitial(err.message || 'Error cargando datos.');
        setLoadingInitial(false); setLoadingPageChange(false);
        setProducts([]); setPaginationInfo(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, searchTerm, products.length]); // products.length añadido para que re-fetch si se borra el último item de una página y la lista queda vacía

  // useEffect para búsqueda y carga inicial/paginación
  useEffect(() => {
    if (searchTerm) {
        setCurrentPage(1); // Esto disparará el fetchDataAndPrices a través del otro useEffect si currentPage cambia
        // Si currentPage ya es 1, necesitamos llamar explícitamente
        if (currentPage === 1) {
            fetchDataAndPrices(1);
        }
    } else {
        fetchDataAndPrices(currentPage); // Carga normal si no hay término de búsqueda
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]); // No incluir fetchDataAndPrices aquí para evitar bucles con currentPage

  useEffect(() => {
    fetchDataAndPrices(currentPage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]); // No incluir fetchDataAndPrices aquí para evitar bucles con searchTerm


  const calculatePrice = async (productoId: number): Promise<number> => {
    try {
      const response = await fetch(`https://quimex.sistemataup.online/productos/calcular_precio/${productoId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ producto_id: productoId, quantity: 1 }),
      });
      if (!response.ok) { const errorData = await response.json().catch(() => ({})); throw new Error(errorData.mensaje || `Error ${response.status}`); }
      const data = await response.json();
      const precioCalculado = data.precio_total_calculado_ars;
      if (typeof precioCalculado !== 'number') { throw new Error('Precio inválido'); }
      return precioCalculado;
    } catch (error) { console.error(`Error calc precio para ${productoId}:`, error); throw error; }
  };

  const formatDate = (isoDateString: string | null | undefined): string => {
    if (!isoDateString) return 'N/A';
    try { const date = new Date(isoDateString); if (isNaN(date.getTime())) return 'Inválida'; return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
    catch (e) { return 'Error fecha'+ e; }
  };

  const goToPreviousPage = () => { if (currentPage > 1) setCurrentPage(prev => prev - 1); };
  const goToNextPage = () => { if (paginationInfo && currentPage < paginationInfo.total_pages) setCurrentPage(prev => prev + 1); };

  // --- HANDLERS MODAL PRODUCTO (Crear/Editar) ---
  const handleOpenCreateProductModal = () => {
    setEditingProductId(null);
    setIsProductModalOpen(true);
  };

  const handleOpenEditProductModal = (productId: number | string) => {
    setEditingProductId(productId);
    setIsProductModalOpen(true);
  };

  const handleCloseProductModal = () => {
    setIsProductModalOpen(false);
    setEditingProductId(null);
  };

  const handleProductCreatedOrUpdated = () => {
    console.log("Refrescando lista post-creación/actualización...");
    fetchDataAndPrices(currentPage);
    handleCloseProductModal();
  };

  const handleDeleteProduct = async (productToDelete: ProductDisplay) => {
     if (!window.confirm(`¿Seguro de eliminar "${productToDelete.nombre}" (ID: ${productToDelete.id})? Esta acción no se puede deshacer.`)) return;
     setDeletingProductId(productToDelete.id);
     setDeleteError(null);

     try {
        // Paso 1: Si el producto es un combo y tiene un combo_id, intentar eliminar el combo primero
        if (productToDelete.es_combo && productToDelete.combo_id) {
            console.log(`El producto ${productToDelete.id} es un combo (ID Combo: ${productToDelete.combo_id}). Intentando eliminar el combo...`);
            const deleteComboUrl = `https://quimex.sistemataup.online/combos/eliminar/${productToDelete.combo_id}`;
            const comboResponse = await fetch(deleteComboUrl, {
                method: 'DELETE',
                headers: { "Authorization": `Bearer ${token}` }
            });

            if (!comboResponse.ok && comboResponse.status !== 404) { // 404 significa que el combo ya no existía, lo cual está bien
                const comboErrorData = await comboResponse.json().catch(() => ({ error: `Error ${comboResponse.status} eliminando combo` }));
                throw new Error(`Combo: ${comboErrorData.error || comboErrorData.detalle || comboResponse.statusText}`);
            }
            console.log(`Combo ID ${productToDelete.combo_id} eliminado o no encontrado (status: ${comboResponse.status}). Procediendo a eliminar producto.`);
        }

        // Paso 2: Eliminar el producto principal
        const deleteProductUrl = `https://quimex.sistemataup.online/productos/eliminar/${productToDelete.id}`;
        const productResponse = await fetch(deleteProductUrl, {
            method: 'DELETE',
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (!productResponse.ok) {
            const productErrorData = await productResponse.json().catch(() => ({ error: `Error ${productResponse.status} eliminando producto` }));
            throw new Error(`Producto: ${productErrorData.error || productErrorData.detalle || productResponse.statusText}`);
        }
        
        console.log(`Producto ID ${productToDelete.id} eliminado exitosamente.`);
        alert(`"${productToDelete.nombre}" y su combo asociado (si existía) han sido eliminados.`);
        // Si la página actual queda vacía después de eliminar, ir a la página anterior si es posible
        if (products.length === 1 && currentPage > 1) {
            setCurrentPage(currentPage - 1);
        } else {
            fetchDataAndPrices(currentPage); // Refrescar la lista en la página actual
        }
      // eslint-disable-next-line  
     } catch (err: any) {
        console.error(`Error durante la eliminación del producto ID ${productToDelete.id}:`, err);
        setDeleteError(err.message);
        alert(`Error: ${err.message}`);
     } finally {
        setDeletingProductId(null);
     }
  };


  let tableBodyContent;
  const numberOfColumns = 9; // Ajusta si cambia el número de columnas

  if (!loadingInitial && products.length > 0) {
    tableBodyContent = products.map((product) => {
        const isDeleting = deletingProductId === product.id;
        return (
            <tr key={product.id} className={`transition duration-150 ease-in-out ${isDeleting ? 'opacity-50 bg-red-50' : 'hover:bg-indigo-50'}`}>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{product.codigo || product.id}</td> 
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{product.nombre}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{product.fecha_actualizacion}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{product.tipo_calculo}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-left">{typeof product.margen === 'number' ? `${product.margen.toFixed(2)}%` : 'N/A'}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{product.ref_calculo}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-left">{typeof product.costo_referencia_usd === 'number' ? `$${product.costo_referencia_usd.toFixed(2)}` : 'N/A'}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-left"> {product.isLoadingPrice ? ( <span className="text-xs text-gray-400 italic">Calculando...</span> ) : product.priceError ? ( <span className="text-xs text-red-500 font-medium">Error</span> ) : typeof product.precio === 'number' ? ( `$${product.precio.toFixed(2)}` ) : ( <span className="text-xs text-gray-400">N/A</span> )} </td>
                <td className="px-4 py-3 whitespace-nowrap text-center text-sm space-x-2">
                    <button
                        onClick={() => handleOpenEditProductModal(product.id)}
                        disabled={isDeleting}
                        className="text-indigo-600 hover:text-indigo-900 disabled:text-gray-400 hover:bg-indigo-100 px-2 py-1 rounded text-xs font-medium"
                    >
                        Editar
                    </button>
                    <button
                        onClick={() => handleDeleteProduct(product)}
                        disabled={isDeleting}
                        className={`text-red-600 hover:text-red-900 disabled:text-gray-400 hover:bg-red-100 px-2 py-1 rounded text-xs font-medium ${isDeleting ? 'animate-pulse' : ''}`}
                    >
                        {isDeleting ? '...' : 'Eliminar'}
                    </button>
                </td>
            </tr>
        );
    });
  } else if (!loadingInitial && !errorInitial && products.length === 0 && searchTerm) {
      tableBodyContent = ( <tr> <td colSpan={numberOfColumns} className="text-center text-gray-500 py-4 px-4">No se encontraron productos con {searchTerm}</td> </tr>);
  } else if (!loadingInitial && !errorInitial && products.length === 0 && !searchTerm) {
       tableBodyContent = ( <tr> <td colSpan={numberOfColumns} className="text-center text-gray-500 py-4 px-4">No hay productos para mostrar.</td> </tr> );
   } else { tableBodyContent = null; }

  return (
    <div className="p-4 md:p-6 bg-gray-100 min-h-screen">
      <div className="max-w-7xl mx-auto bg-white shadow-md rounded-lg p-4 md:p-6">

        <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
          <input
             type="text"
             placeholder="Buscar productos..."
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
             className="px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 w-full md:w-1/3 lg:w-1/4"
           />
          <div className="flex flex-col sm:flex-row items-center gap-x-4 gap-y-2 w-full md:w-auto justify-end flex-wrap flex-grow">
            <div className="text-sm flex items-center gap-1"> <label htmlFor="dolarOficialInput" className="font-medium">Dólar Oficial:</label> {loadingDolar ? (<span className="text-xs italic">Cargando...</span>) : isEditingDolar ? (<input id="dolarOficialInput" type="text" name="dolarOficial" value={editDolarOficial} onChange={handleDolarInputChange} className="px-2 py-1 border rounded text-sm w-24" disabled={loadingDolarSave} inputMode="decimal" />) : typeof dolarOficial === 'number' ? (<span className="font-semibold">${dolarOficial.toFixed(2)}</span>) : (<span className="text-red-500 text-xs">Error</span>)} </div>
            <div className="text-sm flex items-center gap-1"> <label htmlFor="dolarQuimexInput" className="font-medium">Dólar Empresa:</label> {loadingDolar ? (<span className="text-xs italic">Cargando...</span>) : isEditingDolar ? (<input id="dolarQuimexInput" type="text" name="dolarQuimex" value={editDolarQuimex} onChange={handleDolarInputChange} className="px-2 py-1 border rounded text-sm w-24" disabled={loadingDolarSave} inputMode="decimal" />) : typeof dolarQuimex === 'number' ? (<span className="font-semibold">${dolarQuimex.toFixed(2)}</span>) : (<span className="text-red-500 text-xs">Error</span>)} </div>
            <div className="flex items-center gap-2"> {isEditingDolar ? (<> <button onClick={handleSaveDolarValues} disabled={loadingDolarSave || loadingDolar} className={`px-3 py-1 text-xs rounded flex items-center gap-1 ${ loadingDolarSave || loadingDolar ? 'bg-gray-300' : 'bg-green-100 text-green-700 hover:bg-green-200' }`}> <svg className={`h-3 w-3 ${loadingDolarSave ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg> {loadingDolarSave ? '...' : 'Guardar'} </button> <button onClick={handleCancelDolarEdit} disabled={loadingDolarSave} className="px-3 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"> Cancelar </button> </>) : (<button onClick={handleEditDolarClick} disabled={loadingDolar || dolarOficial === null || dolarQuimex === null} className={`px-3 py-1 text-xs rounded flex items-center gap-1 ${ loadingDolar || dolarOficial === null || dolarQuimex === null ? 'bg-gray-300' : 'bg-blue-100 text-blue-700 hover:bg-blue-200' }`}> <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg> Editar Dólar </button> )} </div>
            {errorDolarSave && ( <p className="text-xs text-red-600 mt-1 w-full text-right sm:text-left sm:w-auto">{errorDolarSave}</p> )}

             <button
                onClick={handleOpenCreateProductModal}
                className="w-full sm:w-auto bg-indigo-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 flex items-center justify-center gap-1 mt-2 sm:mt-0"
             >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"> <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /> </svg>
                 Crear Producto
             </button>
          </div>
        </div>

        {loadingInitial && <p className="text-center text-gray-600 my-6">Cargando lista de productos inicial...</p>}
        {errorInitial && <p className="text-center text-red-600 my-6">Error al cargar productos: {errorInitial}</p>}
        {deleteError && <p className="text-center text-red-600 my-2 mx-auto max-w-xl bg-red-50 p-2 rounded border border-red-200 text-sm">Error al eliminar: {deleteError}</p>}

        {!loadingInitial && !errorInitial && (
          <>
            <div className="overflow-x-auto border border-gray-200 rounded-md">
              <table className="min-w-full bg-white table-fixed">
                <thead className="bg-indigo-700 text-white sticky top-0 z-10">
                 <tr>
                    <th className="w-[10%] px-4 py-2 text-left text-sm font-bold uppercase tracking-wider">ID/Cód.</th>
                    <th className="w-[20%] px-4 py-2 text-left text-sm font-bold uppercase tracking-wider">Nombre</th>
                    <th className="w-[12%] px-4 py-2 text-left text-sm font-bold uppercase tracking-wider">Actualización</th>
                    <th className="w-[10%] px-4 py-2 text-left text-sm font-bold uppercase tracking-wider">Cálculo</th>
                    <th className="w-[10%] px-4 py-2 text-left text-sm font-bold uppercase tracking-wider ">Margen</th>
                    <th className="w-[10%] px-4 py-2 text-left text-sm font-bold uppercase tracking-wider">Referencia</th>
                    <th className="w-[8%] px-4 py-2 text-left text-sm font-bold uppercase tracking-wider ">Costo USD</th>
                    <th className="w-[8%] px-4 py-2 text-left text-sm font-bold uppercase tracking-wider ">Precio ARS</th>
                    <th className="w-[12%] px-4 py-2 text-center text-sm font-bold uppercase tracking-wider">Acciones</th> 
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {loadingPageChange && ( <tr><td colSpan={numberOfColumns} className="text-center py-4"><div className="flex justify-center items-center space-x-2 text-gray-500"><svg className="animate-spin h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>Cargando...</span></div></td></tr> )}
                  {!loadingPageChange && tableBodyContent}
                </tbody>
              </table>
            </div>
            {paginationInfo && paginationInfo.total_pages > 1 && (
              <div className="flex justify-between items-center mt-4 px-1 py-2 border-t">
                 <button onClick={goToPreviousPage} disabled={currentPage === 1 || loadingPageChange} className={`px-4 py-2 text-sm rounded ${ currentPage === 1 || loadingPageChange ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700' }`}> Anterior </button>
                 <span className="text-sm text-gray-700"> Página {currentPage} de {paginationInfo.total_pages} </span>
                 <button onClick={goToNextPage} disabled={currentPage === paginationInfo.total_pages || loadingPageChange} className={`px-4 py-2 text-sm rounded ${ currentPage === paginationInfo.total_pages || loadingPageChange ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700' }`}> Siguiente </button>
              </div>
            )}
          </>
        )}
      </div>

      {isProductModalOpen && (
        <CreateProductModal
          onClose={handleCloseProductModal}
          onProductCreatedOrUpdated={handleProductCreatedOrUpdated}
          productIdToEdit={editingProductId}
        />
      )}
    </div>
  );
}