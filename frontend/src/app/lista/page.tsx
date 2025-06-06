// components/ProductPriceTable.tsx
"use client";

import React, { useState, useEffect, useCallback, ChangeEvent } from 'react';
import CreateProductModal from '@/components/CreateProductModal';

// --- Tipos de Datos ---
type ProductDataRaw = {
  ajusta_por_tc: boolean;
  costo_referencia_usd: number | null;
  es_receta: boolean;
  fecha_actualizacion_costo: string | null;
  id: number;
  margen: number | null;
  nombre: string;
  receta_id: number | null;
  ref_calculo: string | null;
  tipo_calculo: string | null;
  unidad_venta: string | null;
  codigo?: string | null;
  es_combo?: boolean;
  combo_id?: number | null;
};

type ComboDataRaw = {
  costo_referencia_ars?: number;
  id: number;
  nombre: string;
  costo_referencia_usd: number | null;
  sku_combo?: string | null;
  margen_combo: number; // Este es el margen que se aplica al costo para obtener el precio
  activo: boolean;
  descripcion?: string | null;
  info_calculada?: {
    costo_total_usd?: number | null;
    // Este es el precio de VENTA del combo, no el costo.
    // Si tu API realmente devuelve el precio de VENTA como 'costo_referencia_ars', lo usamos.
    // Si 'costo_referencia_ars' es el costo y necesitas aplicar margen_combo, la lógica cambia.
    // ASUMIENDO que 'costo_referencia_ars' es el PRECIO DE VENTA FINAL del combo.
    costo_referencia_ars?: number | null; // <--- CAMBIO AQUÍ (si este es el PRECIO DE VENTA)
    // Si el campo es realmente `precio_venta_sugerido_ars` como antes, mantenemos ese.
    // Voy a usar `costo_referencia_ars` como dijiste.
  } | null;
  componentes?: ApiComboComponente[];
};

// Interfaz para el componente de combo de la API (usado en CreateProductModal)
interface ApiComboComponente {
    cantidad: number;
    componente: {
        es_receta: boolean;
        nombre: string;
        producto_id: number | string;
    };
    id: number;
}


export type DisplayItem = {
  id: number;
  displayId: string;
  type: 'product' | 'combo';
  nombre: string;
  codigo?: string | null;
  fecha_actualizacion?: string | null;
  tipo_calculo?: string | null;
  margen?: number | null;
  ref_calculo?: string | null;
  costo_referencia_ars?: string | null;
  costo_referencia_usd?: number | null; // Para productos, o costo USD del combo
  precio?: number | null; // Precio ARS final
  isLoadingPrice: boolean;
  priceError: boolean;
  es_combo_proxy?: boolean;
  combo_id_original?: number | null;
};



const ITEMS_PER_PAGE = 15;

export default function ProductPriceTable() {
  const [allItems, setAllItems] = useState<DisplayItem[]>([]);
  const [displayedItems, setDisplayedItems] = useState<DisplayItem[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [errorInitial, setErrorInitial] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalFilteredItems, setTotalFilteredItems] = useState(0);

  const [dolarOficial, setDolarOficial] = useState<number | null>(null);
  const [dolarQuimex, setDolarQuimex] = useState<number | null>(null);
  const [loadingDolar, setLoadingDolar] = useState(true);
  const [errorDolar, setErrorDolar] = useState<string | null>(null);

  const [isEditingDolar, setIsEditingDolar] = useState(false);
  const [editDolarOficial, setEditDolarOficial] = useState<string>('');
  const [editDolarQuimex, setEditDolarQuimex] = useState<string>('');
  const [loadingDolarSave, setLoadingDolarSave] = useState(false);
  const [errorDolarSave, setErrorDolarSave] = useState<string | null>(null);

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingItemType, setEditingItemType] = useState<'product' | 'combo' | null>(null);

  const [deletingItem, setDeletingItem] = useState<DisplayItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadErrorMsg, setUploadErrorMsg] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const fetchDolarValues = useCallback(async () => {
    if (!token) { setErrorDolar("Token no disponible."); setLoadingDolar(false); return; }
    setLoadingDolar(true); setErrorDolar(null); setErrorDolarSave(null);
    try {
      const res = await fetch('https://quimex.sistemataup.online/tipos_cambio/obtener_todos', { headers: { "Authorization": `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length < 2) throw new Error("Formato inesperado TC");
      //eslint-disable-next-line
      const quimexValor = data.find((d: any) => d.nombre === "Empresa")?.valor;
      //eslint-disable-next-line
      const oficialValor = data.find((d: any) => d.nombre === "Oficial")?.valor;
      setDolarQuimex(typeof quimexValor === 'number' ? quimexValor : null);
      setDolarOficial(typeof oficialValor === 'number' ? oficialValor : null);
    } catch (err) { console.error("Error fetchDolarValues:", err); setErrorDolar("Error cargando dólar."); }
    finally { setLoadingDolar(false); }
  }, [token]);

  const handleSaveDolarValues = async () => {
     if (!token) { setErrorDolarSave("Token no disponible."); return; }
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
         responses.forEach((response, index) => {
            const name = index === 0 ? nombreOficial : nombreEmpresa;
            if (response.status === 'rejected' || (response.status === 'fulfilled' && !response.value.ok)) {
                success = false;
                let errorMsg = `${name}: Error Desconocido`;
                if(response.status === 'fulfilled' && response.value){
                    errorMsg = `${name}: Error ${response.value.status} - ${response.value.statusText}`;
                } else if(response.status === 'rejected'){
                    errorMsg = `${name}: Error Red ${response.reason}`;
                }
                errors.push(errorMsg);
                console.error(errorMsg);
            } else {
                console.log(`${name} OK`);
            }
         });
         if (success) {
             setDolarOficial(oficialNum); setDolarQuimex(quimexNum); setIsEditingDolar(false); alert("Valores Dólar actualizados.");
         } else {
             setErrorDolarSave(`Errores: ${errors.join('; ')}`);
         }
     }
     //eslint-disable-next-line
     catch (err: any) { console.error("Error al guardar Dólar:", err); setErrorDolarSave(err.message || "Error de red."); }
     finally { setLoadingDolarSave(false); }
  };

  const handleEditDolarClick = () => { setEditDolarOficial(dolarOficial?.toString() ?? ''); setEditDolarQuimex(dolarQuimex?.toString() ?? ''); setIsEditingDolar(true); setErrorDolarSave(null); };
  const handleCancelDolarEdit = () => { setIsEditingDolar(false); setErrorDolarSave(null); };
  const handleDolarInputChange = (e: ChangeEvent<HTMLInputElement>) => { const { name, value } = e.target; const s = value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'); if (name === 'dolarOficial') setEditDolarOficial(s); else if (name === 'dolarQuimex') setEditDolarQuimex(s); };
  useEffect(() => { if (token) fetchDolarValues(); }, [fetchDolarValues, token]);

  const fetchAndCombineData = useCallback(async () => {
    if (!token) {
      setErrorInitial("Token no disponible."); setLoadingInitial(false); setAllItems([]); setDisplayedItems([]); return;
    }
    setLoadingInitial(true); setErrorInitial(null); setDeleteError(null);

    try {
      const [productsResponse, combosResponse] = await Promise.all([
        fetch(`https://quimex.sistemataup.online/productos/obtener_todos_paginado?page=1&per_page=10000`, {
            headers: { "Authorization": `Bearer ${token}` }
        }),
        // Asegúrate de que `incluir_info_usd=true` también traiga `costo_referencia_ars` si ese es el campo
        fetch('https://quimex.sistemataup.online/combos/obtener-todos?incluir_info_usd=true&incluir_componentes=false', { // No necesitamos componentes aquí si el precio ya viene
            headers: { "Authorization": `Bearer ${token}` }
        })
      ]);

      if (!productsResponse.ok) throw new Error(`Productos: Error ${productsResponse.status}`);
      const productsData = await productsResponse.json();
      const rawProducts: ProductDataRaw[] = productsData.productos || productsData.resultados || [];

      if (!combosResponse.ok) throw new Error(`Combos: Error ${combosResponse.status}`);
      const rawCombos: ComboDataRaw[] = await combosResponse.json();

      const displayProducts: DisplayItem[] = rawProducts.map(p => ({
        id: p.id,
        displayId: `product-${p.id}`,
        type: 'product',
        nombre: p.nombre,
        codigo: p.codigo || p.id.toString(),
        fecha_actualizacion: formatDate(p.fecha_actualizacion_costo),
        tipo_calculo: p.tipo_calculo || undefined,
        margen: p.margen === null ? undefined : p.margen,
        ref_calculo: p.ref_calculo || undefined,
        costo_referencia_usd: p.costo_referencia_usd === null ? undefined : p.costo_referencia_usd,
        es_combo_proxy: p.es_combo || false,
        combo_id_original: p.combo_id || null,
        precio: undefined,
        isLoadingPrice: true, // Productos siempre necesitan calcular precio (o combos proxy si no viene de API combo)
        priceError: false,
      }));

      const productProxyComboIds = new Set(displayProducts.filter(p => p.es_combo_proxy && p.combo_id_original).map(p => p.combo_id_original));

      const displayCombos: DisplayItem[] = rawCombos
        .filter(c => !productProxyComboIds.has(c.id))
        .map(c => {
            // Usar 'costo_referencia_ars' de info_calculada como el precio del combo
            const precioComboArs = c.costo_referencia_ars;
            return {
                id: c.id,
                displayId: `combo-${c.id}`,
                type: 'combo',
                nombre: c.nombre,
                
                codigo: c.sku_combo || `CMB-${c.id}`,
                fecha_actualizacion: 'N/A',
                tipo_calculo: "COMBO",
                margen: c.margen_combo ? c.margen_combo * 100 : undefined,
                ref_calculo: "-",
                costo_referencia_usd: c.costo_referencia_usd,
                es_combo_proxy: false,
                combo_id_original: c.id,
                precio: c.costo_referencia_ars,  //VER SI ANDA
                isLoadingPrice: precioComboArs === undefined, // Si no vino 'costo_referencia_ars', necesita calcular
                priceError: false,
            };
      });

      const combined = [...displayProducts, ...displayCombos].sort((a, b) => a.nombre.localeCompare(b.nombre));
      setAllItems(combined);
      //eslint-disable-next-line
    } catch (err: any) {
      console.error("Error fetchAndCombineData:", err);
      setErrorInitial(err.message || 'Error cargando datos combinados.');
      setAllItems([]);
    } finally {
        setLoadingInitial(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchAndCombineData();
    }
  }, [token, fetchAndCombineData]);

  useEffect(() => {
    let filtered = allItems;
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filtered = allItems.filter(item =>
        item.nombre.toLowerCase().includes(lowerSearchTerm) ||
        (item.codigo && item.codigo.toLowerCase().includes(lowerSearchTerm))
      );
    }
    setTotalFilteredItems(filtered.length);
    setTotalPages(Math.ceil(filtered.length / ITEMS_PER_PAGE));
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginated = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    setDisplayedItems(paginated);

    const itemsNeedingPrice = paginated.filter(item => item.isLoadingPrice && item.precio === undefined);
    if (itemsNeedingPrice.length > 0) {
      const pricePromises = itemsNeedingPrice.map(item =>
        // Si el item es combo y su precio no vino de info_calculada.costo_referencia_ars, calculatePrice intentará obtenerlo.
        // Para productos, siempre se llamará a calculatePrice si isLoadingPrice es true.
        calculatePrice(item.id, item.type, item.combo_id_original)
      );
      Promise.allSettled(pricePromises).then(priceResults => {
        setDisplayedItems(currentDisplayed => {
          const updatedDisplayed = currentDisplayed.map(dispItem => ({...dispItem}));
          priceResults.forEach((result, index) => {
            const sourceItemForThisResult = itemsNeedingPrice[index];
            if (!sourceItemForThisResult) return;
            const itemIndexInDisplayed = updatedDisplayed.findIndex(it => it.displayId === sourceItemForThisResult.displayId);
            if (itemIndexInDisplayed !== -1) {
              if (result.status === 'fulfilled') {
                updatedDisplayed[itemIndexInDisplayed].precio = result.value;
                updatedDisplayed[itemIndexInDisplayed].priceError = false;
              } else {
                updatedDisplayed[itemIndexInDisplayed].priceError = true;
              }
              updatedDisplayed[itemIndexInDisplayed].isLoadingPrice = false;
            }
          });
          return updatedDisplayed;
        });
      });
    }
  }, [allItems, searchTerm, currentPage]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm]);

  const calculatePrice = async (originalId: number, type: 'product' | 'combo', comboIdForLookup?: number | null): Promise<number> => {
    if (!token) throw new Error("Token no disponible.");
    try {
      // Para combos, ya esperamos que el precio venga de `info_calculada.costo_referencia_ars`.
      // Esta función solo se llamará para combos si `isLoadingPrice` era true (es decir, el precio no vino).
      // En ese caso, es un fallback o un error en la data, así que intentamos calcularlo como producto proxy.
      // Si el item es un 'combo' puro y el precio no vino, esta llamada podría no ser la ideal.
      // Idealmente, si es 'combo' y isLoadingPrice es true, deberías tener un endpoint específico /combos/calcular_precio/{comboId}
      // o marcarlo como error si el precio es mandatorio del GET.

      //eslint-disable-next-line
      const body: any = { quantity: 1 };

      // Si es un combo (puro o proxy) y necesitamos calcular su precio (porque no vino de la API de combos)
      // Usamos el ID del producto (que sería el ID del proxy si es un producto-combo, o el ID del combo si es combo puro y originalId es el combo_id)
      // La API de productos/calcular_precio debe ser capaz de manejar esto.
      const calculateUrl = `https://quimex.sistemataup.online/productos/calcular_precio/${originalId}`;
      body.producto_id = originalId;
      // Si la API necesita una pista de que está calculando para un combo (aunque use el ID del producto proxy):
      // if (type === 'combo' || (type === 'product' && comboIdForLookup)) {
      //    body.for_combo_context = true; // Ejemplo de señal a la API
      // }

      const response = await fetch(calculateUrl, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(body) });
      if (!response.ok) { const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}` })); throw new Error(errorData.mensaje || errorData.detail || `Error ${response.status}`); }
      const data = await response.json();
      const precioCalculado = data.precio_total_calculado_ars;
      if (typeof precioCalculado !== 'number') { throw new Error('Formato de precio inválido API'); }
      return precioCalculado;
    } catch (error) {
        console.log(comboIdForLookup)
       console.error(`Error calculando precio para ${type} ID ${originalId}:`, error); throw error; }
  };

  const formatDate = (isoDateString: string | null | undefined): string => {
    if (!isoDateString) return 'N/A';
    try { const date = new Date(isoDateString); if (isNaN(date.getTime())) return 'Inválida'; return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
    catch (e) { console.log(e);
        return 'Error fecha'; }
  };
  const goToPreviousPage = () => { if (currentPage > 1) setCurrentPage(prev => prev - 1); };
  const goToNextPage = () => { if (totalPages > 0 && currentPage < totalPages) setCurrentPage(prev => prev + 1); };
  const handleOpenCreateProductModal = () => { setEditingItemId(null); setEditingItemType(null); setIsProductModalOpen(true); };
  const handleOpenEditProductModal = (item: DisplayItem) => { setEditingItemId(item.id); setEditingItemType(item.type); setIsProductModalOpen(true); };
  const handleCloseProductModal = () => { setIsProductModalOpen(false); setEditingItemId(null); setEditingItemType(null); };
  const handleProductCreatedOrUpdated = () => { if (token) fetchAndCombineData(); handleCloseProductModal(); };

  const handleDeleteProduct = async (itemToDelete: DisplayItem) => {
     if (!token) { setDeleteError("Token no disponible."); return; }
     if (!window.confirm(`¿Seguro de eliminar "${itemToDelete.nombre}" (ID: ${itemToDelete.id}, Tipo: ${itemToDelete.type})?`)) return;
     setDeletingItem(itemToDelete); setDeleteError(null);
     try {
        const comboIdParaBorrar = itemToDelete.type === 'combo' ? itemToDelete.id : itemToDelete.combo_id_original;
        if (comboIdParaBorrar) {
            const deleteComboUrl = `https://quimex.sistemataup.online/combos/eliminar/${comboIdParaBorrar}`;
            const comboResponse = await fetch(deleteComboUrl, { method: 'DELETE', headers: { "Authorization": `Bearer ${token}` }});
            if (!comboResponse.ok && comboResponse.status !== 404) { const err = await comboResponse.json().catch(()=>{}); throw new Error(`Combo: ${err?.error || err?.detalle || comboResponse.statusText || 'Error eliminando combo'}`);}
            console.log(`Combo ID ${comboIdParaBorrar} procesado (status ${comboResponse.status})`);
        }
        if (itemToDelete.type === 'product') {
            const deleteProductUrl = `https://quimex.sistemataup.online/productos/eliminar/${itemToDelete.id}`;
            const productResponse = await fetch(deleteProductUrl, { method: 'DELETE', headers: { "Authorization": `Bearer ${token}` }});
            if (!productResponse.ok) { const err = await productResponse.json().catch(()=>{}); throw new Error(`Producto: ${err?.error || err?.detalle || productResponse.statusText || 'Error eliminando producto'}`);}
            console.log(`Producto ID ${itemToDelete.id} eliminado.`);
        }
        alert(`"${itemToDelete.nombre}" eliminado.`);
        fetchAndCombineData();
        //eslint-disable-next-line
     } catch (err: any) { console.error("Error eliminando:", err); setDeleteError(err.message); alert(`Error: ${err.message}`); }
     finally { setDeletingItem(null); }
  };

  const handleOpenUploadModal = () => { setIsUploadModalOpen(true); setSelectedFile(null); setUploadErrorMsg(null); setUploadSuccess(null); };
  const handleCloseUploadModal = () => { setIsUploadModalOpen(false); setUploadErrorMsg(null); setUploadSuccess(null); };
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.type === "text/csv" || file.name.endsWith(".csv") || file.type === "application/vnd.ms-excel") {
        setSelectedFile(file); setUploadErrorMsg(null); setUploadSuccess(null);
      } else { setSelectedFile(null); setUploadErrorMsg("Por favor, selecciona un archivo CSV."); setUploadSuccess(null); }
    } else { setSelectedFile(null); }
  };

  const handleUploadFile = async () => {
    if (!selectedFile) { setUploadErrorMsg("Por favor, selecciona un archivo CSV primero."); return; }
    if (!token) { setUploadErrorMsg("Token no disponible. Inicie sesión."); return; }
    setIsUploading(true); setUploadErrorMsg(null); setUploadSuccess(null);
    const formData = new FormData(); formData.append('csvFile', selectedFile);
    try {
      const response = await fetch('https://quimex.sistemataup.online/import_csv/generar_sql', { method: 'POST', headers: { "Authorization": `Bearer ${token}` }, body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.details || `Error ${response.status}`);
      setUploadSuccess(result.message || "Archivo CSV procesado."); setSelectedFile(null);
      const fileInput = document.getElementById('csv-upload-input') as HTMLInputElement; if (fileInput) fileInput.value = '';
      alert(result.message + (result.details?.message ? `\nDetalles: ${result.details.message}` : ''));
      fetchAndCombineData();
      //eslint-disable-next-line
    } catch (error: any) { console.error("Error al subir CSV:", error); setUploadErrorMsg(error.message || "Error al subir."); }
    finally { setIsUploading(false); }
  };

  let tableBodyContent;
  const numberOfColumns = 9;

  if (loadingInitial) {
    tableBodyContent = (<tr><td colSpan={numberOfColumns} className="text-center py-10 text-gray-500">Cargando datos iniciales...</td></tr>);
  } else if (errorInitial) {
    tableBodyContent = (<tr><td colSpan={numberOfColumns} className="text-center py-10 text-red-500">Error: {errorInitial}</td></tr>);
  } else if (displayedItems.length > 0) {
    tableBodyContent = displayedItems.map((item) => {
        const isDeletingCurrent = deletingItem?.displayId === item.displayId;
        return (
            <tr key={item.displayId} className={`transition duration-150 ease-in-out ${isDeletingCurrent ? 'opacity-50 bg-red-50' : item.type === 'combo' ? 'bg-lime-50 hover:bg-lime-100' : (item.es_combo_proxy ? 'bg-yellow-50 hover:bg-yellow-100' : 'hover:bg-indigo-50')}`}>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{item.codigo || item.id}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {item.nombre}
                    {item.type === 'combo' && <span className="ml-2 text-xs bg-lime-200 text-lime-800 px-1.5 py-0.5 rounded-full font-semibold">COMBO</span>}
                    {item.type === 'product' && item.es_combo_proxy && <span className="ml-2 text-xs bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded-full font-semibold">P-COMBO</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{item.fecha_actualizacion}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{item.tipo_calculo}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-left">{typeof item.margen === 'number' ? `${item.margen.toFixed(2)}%` : 'N/A'}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{item.ref_calculo}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-left">{item.costo_referencia_usd}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-left"> {item.isLoadingPrice ? ( <span className="text-xs text-gray-400 italic">Calculando...</span> ) : item.priceError ? ( <span className="text-xs text-red-500 font-medium">Error Precio</span> ) : typeof item.precio === 'number' ? ( `$${item.precio.toFixed(2)}` ) : ( <span className="text-xs text-gray-400">N/A</span> )} </td>
                <td className="px-4 py-3 whitespace-nowrap text-center text-sm space-x-2">
                    <button onClick={() => handleOpenEditProductModal(item)} disabled={isDeletingCurrent} className="text-indigo-600 hover:text-indigo-900 disabled:text-gray-400 hover:bg-indigo-100 px-2 py-1 rounded text-xs font-medium">Editar</button>
                    <button onClick={() => handleDeleteProduct(item)} disabled={isDeletingCurrent} className={`text-red-600 hover:text-red-900 disabled:text-gray-400 hover:bg-red-100 px-2 py-1 rounded text-xs font-medium ${isDeletingCurrent ? 'animate-pulse' : ''}`}>{isDeletingCurrent ? 'Eliminando...' : 'Eliminar'}</button>
                </td>
            </tr>
        );
    });
  } else if (searchTerm) {
      tableBodyContent = ( <tr><td colSpan={numberOfColumns} className="text-center text-gray-500 py-4 px-4">No se encontraron ítems con {searchTerm}</td></tr>);
  } else {
       tableBodyContent = ( <tr><td colSpan={numberOfColumns} className="text-center text-gray-500 py-4 px-4">No hay productos ni combos para mostrar. {token ? '' : 'Inicie sesión.'}</td></tr> );
   }

  return (
    <div className="p-4 md:p-6 bg-gray-100 min-h-screen">
      <div className="max-w-7xl mx-auto bg-white shadow-md rounded-lg p-4 md:p-6">
        <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
          <input type="text" placeholder="Buscar por nombre o código..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="px-4 py-2 border rounded-md w-full md:w-1/3 lg:w-1/4"/>
          <div className="flex flex-col sm:flex-row items-center gap-x-4 gap-y-2 w-full md:w-auto justify-end flex-wrap flex-grow">
            <div className="text-sm flex items-center gap-1"> <label htmlFor="dolarOficialInput" className="font-medium">Dólar Oficial:</label> {loadingDolar ? "..." : isEditingDolar ? <input id="dolarOficialInput" type="text" name="dolarOficial" value={editDolarOficial} onChange={handleDolarInputChange} className="px-2 py-1 border rounded text-sm w-24" disabled={loadingDolarSave} inputMode="decimal" /> : dolarOficial !== null ? <span className="font-semibold">${dolarOficial.toFixed(2)}</span> : <span className="text-red-500 text-xs">{errorDolar || 'Error'}</span>} </div>
            <div className="text-sm flex items-center gap-1"> <label htmlFor="dolarQuimexInput" className="font-medium">Dólar Empresa:</label> {loadingDolar ? "..." : isEditingDolar ? <input id="dolarQuimexInput" type="text" name="dolarQuimex" value={editDolarQuimex} onChange={handleDolarInputChange} className="px-2 py-1 border rounded text-sm w-24" disabled={loadingDolarSave} inputMode="decimal" /> : dolarQuimex !== null ? <span className="font-semibold">${dolarQuimex.toFixed(2)}</span> : <span className="text-red-500 text-xs">{errorDolar || 'Error'}</span>} </div>
            <div className="flex items-center gap-2"> {isEditingDolar ? (<> <button onClick={handleSaveDolarValues} disabled={loadingDolarSave || loadingDolar} className={`px-3 py-1 text-xs rounded flex items-center gap-1 ${ loadingDolarSave || loadingDolar ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-100 text-green-700 hover:bg-green-200' }`}> <svg className={`h-3 w-3 ${loadingDolarSave ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg> {loadingDolarSave ? '...' : 'Guardar'} </button> <button onClick={handleCancelDolarEdit} disabled={loadingDolarSave} className="px-3 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"> Cancelar </button> </>) : (<button onClick={handleEditDolarClick} disabled={loadingDolar || dolarOficial === null || dolarQuimex === null} className={`px-3 py-1 text-xs rounded flex items-center gap-1 ${ loadingDolar || dolarOficial === null || dolarQuimex === null ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-100 text-blue-700 hover:bg-blue-200' }`}> <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg> Editar Dólar </button> )} </div>
            {errorDolarSave && ( <p className="text-xs text-red-600 mt-1 w-full text-right sm:text-left sm:w-auto">{errorDolarSave}</p> )}
            <button onClick={handleOpenUploadModal} disabled={!token} className="w-full sm:w-auto bg-teal-500 text-white px-4 py-2 rounded-md shadow-sm hover:bg-teal-600 disabled:bg-gray-400 flex items-center justify-center gap-1 mt-2 sm:mt-0"> <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg> Actualizar Costos </button>
            <button onClick={handleOpenCreateProductModal} disabled={!token} className="w-full sm:w-auto bg-indigo-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-indigo-700 disabled:bg-gray-400 flex items-center justify-center gap-1 mt-2 sm:mt-0"> <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"> <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /> </svg> Crear Item </button>
          </div>
        </div>

        {!token && <p className="text-center text-orange-600 my-6 bg-orange-50 p-3 rounded-md border">Inicie sesión.</p>}
        {loadingInitial && token && <p className="text-center text-gray-600 my-6">Cargando...</p>}
        {errorInitial && token && <p className="text-center text-red-600 my-6">Error: {errorInitial}</p>}
        {deleteError && token && <p className="text-center text-red-600 my-2 bg-red-50 p-2 rounded border text-sm">Error al eliminar: {deleteError}</p>}

        {!loadingInitial && !errorInitial && token && (
          <>
            <div className="overflow-x-auto border rounded-md">
              <table className="min-w-full bg-white table-fixed">
                <thead className="bg-indigo-700 text-white sticky top-0 z-10">
                 <tr>
                    <th className="w-[10%] px-4 py-2 text-left text-xs font-bold uppercase tracking-wider">ID/Cód.</th>
                    <th className="w-[25%] px-4 py-2 text-left text-xs font-bold uppercase tracking-wider">Nombre</th>
                    <th className="w-[10%] px-4 py-2 text-left text-xs font-bold uppercase tracking-wider">Actualización</th>
                    <th className="w-[10%] px-4 py-2 text-left text-xs font-bold uppercase tracking-wider">Tipo</th>
                    <th className="w-[8%] px-4 py-2 text-left text-xs font-bold uppercase tracking-wider ">Margen</th>
                    <th className="w-[8%] px-4 py-2 text-left text-xs font-bold uppercase tracking-wider">Ref.Calc</th>
                    <th className="w-[8%] px-4 py-2 text-left text-xs font-bold uppercase tracking-wider ">Costo USD</th>
                    <th className="w-[8%] px-4 py-2 text-left text-xs font-bold uppercase tracking-wider ">Precio ARS</th>
                    <th className="w-[13%] px-4 py-2 text-center text-xs font-bold uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {tableBodyContent}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex justify-between items-center mt-4 px-1 py-2 border-t">
                 <button onClick={goToPreviousPage} disabled={currentPage === 1} className={`px-4 py-2 text-sm rounded ${ currentPage === 1 ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700' }`}> Anterior </button>
                 <span className="text-sm text-gray-700"> Página {currentPage} de {totalPages} (Total: {totalFilteredItems})</span>
                 <button onClick={goToNextPage} disabled={currentPage === totalPages} className={`px-4 py-2 text-sm rounded ${ currentPage === totalPages ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700' }`}> Siguiente </button>
              </div>
            )}
          </>
        )}
      </div>
      {isProductModalOpen && (<CreateProductModal onClose={handleCloseProductModal} onProductCreatedOrUpdated={handleProductCreatedOrUpdated} productIdToEdit={editingItemType === 'product' ? editingItemId : null} comboIdToEdit={editingItemType === 'combo' ? editingItemId : (editingItemType === 'product' && displayedItems.find(it => it.id === editingItemId && it.type === 'product')?.es_combo_proxy ? displayedItems.find(it => it.id === editingItemId && it.type === 'product')?.combo_id_original : null) } isInitiallyCombo={editingItemType === 'combo' || (editingItemType === 'product' && displayedItems.find(it => it.id === editingItemId && it.type === 'product')?.es_combo_proxy)} /> )}
      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full z-50 flex justify-center items-center px-4">
          <div className="relative mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Actualizar Costos desde CSV</h3>
              <div className="mt-2 px-7 py-3">
                <p className="text-sm text-gray-500 mb-4">Selecciona o arrastra un archivo CSV.</p>
                <div className="mb-4">
                  <label htmlFor="csv-upload-input" className={`w-full flex flex-col items-center px-4 py-6 bg-white text-blue-500 rounded-lg shadow border-2 ${selectedFile ? 'border-green-400' : 'border-blue-300 border-dashed'} cursor-pointer hover:bg-blue-50 hover:text-blue-600`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                    <span className="text-sm font-medium">{selectedFile ? selectedFile.name : "Seleccionar CSV"}</span>
                    <input id="csv-upload-input" type="file" className="hidden" accept=".csv, text/csv, application/vnd.ms-excel" onChange={handleFileChange} disabled={isUploading}/>
                  </label>
                  {selectedFile && (<button onClick={() => { setSelectedFile(null); const el = document.getElementById('csv-upload-input') as HTMLInputElement; if(el) el.value = '';}} className="mt-2 text-xs text-red-500 hover:text-red-700" disabled={isUploading}>Quitar</button>)}
                </div>
                {uploadErrorMsg && (<p className="text-sm text-red-600 bg-red-100 p-3 rounded-md my-3 text-left">{uploadErrorMsg}</p>)}
                {uploadSuccess && (<p className="text-sm text-green-600 bg-green-100 p-3 rounded-md my-3 text-left">{uploadSuccess}</p>)}
              </div>
              <div className="items-center px-4 py-3 gap-2 flex flex-col sm:flex-row sm:justify-end border-t pt-4">
                <button onClick={handleUploadFile} disabled={!selectedFile || isUploading} className="w-full sm:w-auto px-4 py-2 bg-teal-500 text-white rounded-md shadow-sm hover:bg-teal-600 disabled:bg-gray-300 flex items-center justify-center gap-2">{isUploading ? (<><svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" className="opacity-75" fill="currentColor"></path></svg>Procesando...</>) : "Subir y Procesar"}</button>
                <button onClick={handleCloseUploadModal} disabled={isUploading} className="w-full sm:w-auto mt-2 sm:mt-0 px-4 py-2 bg-gray-200 text-gray-800 rounded-md shadow-sm hover:bg-gray-300 disabled:bg-gray-100">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}