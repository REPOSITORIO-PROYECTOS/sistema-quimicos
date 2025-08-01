// components/ProductPriceTable.tsx
"use client";

import React, { useState, useEffect, useCallback, ChangeEvent } from 'react';
import CreateProductModal from '@/components/CreateProductModal';
import * as XLSX from 'xlsx';

// --- Tipos de Datos (sin cambios) ---
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
  margen_combo: number;
  activo: boolean;
  precio_base_combo_ars?: number;
  descripcion?: string | null;
  info_calculada?: {
    costo_total_usd?: number | null;
    costo_referencia_ars?: number | null;
  } | null;
  componentes?: ApiComboComponente[];
};

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
  costo_referencia_usd?: number | null;
  precio?: number | null;
  isLoadingPrice: boolean;
  priceError: boolean;
  es_combo_proxy?: boolean;
  combo_id_original?: number | null;
  ajusta_por_tc: boolean;
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

  const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;

  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadErrorMsg, setUploadErrorMsg] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const [isPreparingDownload, setIsPreparingDownload] = useState(false);
  const [, setDownloadError] = useState<string | null>(null);

  const [isPreparingPriceList, setIsPreparingPriceList] = useState(false);
  const [, setPriceListError] = useState<string | null>(null);

  const [isDownloadingFormulas, setIsDownloadingFormulas] = useState(false);
  const [downloadFormulasError, setDownloadFormulasError] = useState<string | null>(null);

  // --- NUEVOS ESTADOS PARA ACTUALIZACIÓN GLOBAL DE RECETAS ---
  const [isUpdatingAllRecipes, setIsUpdatingAllRecipes] = useState(false);
  const [updateAllRecipesError, setUpdateAllRecipesError] = useState<string | null>(null);


 useEffect(() => {
    const header = document.getElementById('product-table-header');
    const isAnyModalOpen = isProductModalOpen || isUploadModalOpen ;
    
    if (isAnyModalOpen) {
      document.body.classList.add('modal-open');
      document.body.style.overflow = 'hidden';
      if (header) {
        header.classList.remove('sticky', 'z-10');
      }
    } else {
      document.body.classList.remove('modal-open');
      document.body.style.overflow = 'auto';
      if (header) {
        header.classList.add('sticky', 'z-10');
      }
    }

    return () => {
      document.body.classList.remove('modal-open');
      document.body.style.overflow = 'auto';
      if (header) {
        header.classList.add('sticky', 'z-10');
      }
    };
  }, [isProductModalOpen, isUploadModalOpen]);

  const generateAndDownloadExcel = (itemsToExport: DisplayItem[]) => {
    // ... (tu lógica de Excel sin cambios)
    const dataForExcel = itemsToExport.map((item) => {
      let tipoDeItem = 'Producto';
      if (item.type === 'combo') tipoDeItem = 'Combo';
      else if (item.es_combo_proxy) tipoDeItem = 'Producto-Combo';

      let precioFinal: number | string;
      if (item.priceError) precioFinal = "Error de cálculo";
      else if (typeof item.precio === 'number') precioFinal = item.precio;
      else precioFinal = 'N/A';

      return {
        'ID/Código': item.codigo || item.id,
        'Nombre': item.nombre,
        'Tipo de Item': tipoDeItem,
        'Fecha Actualización': item.fecha_actualizacion,
        'Tipo Cálculo': item.tipo_calculo || 'N/A',
        'Margen (%)': typeof item.margen === 'number' ? item.margen : 'N/A',
        'Ref. Cálculo': item.ref_calculo || 'N/A',
        'Costo USD': typeof item.costo_referencia_usd === 'number' ? item.costo_referencia_usd : 'N/A',
        'Precio Venta ARS': precioFinal,
        'Ajusta por TC': item.ajusta_por_tc ? 'Sí' : 'No',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
    worksheet['!cols'] = [
      { wch: 15 }, { wch: 45 }, { wch: 20 }, { wch: 20 }, { wch: 15 },
      { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 15 }
    ];
    const range = XLSX.utils.decode_range(worksheet['!ref']!);
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      for (const C of [5, 7, 8]) { 
        const cell_address = { c: C, r: R };
        const cell_ref = XLSX.utils.encode_cell(cell_address);
        if (worksheet[cell_ref] && typeof worksheet[cell_ref].v === 'number') {
          worksheet[cell_ref].t = 'n';
          if (C === 7 || C === 8) {
            worksheet[cell_ref].z = '$#,##0.00';
          } else if (C === 5) {
            worksheet[cell_ref].z = '0.00"%"';
          }
        }
      }
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Lista de Precios");
    XLSX.writeFile(workbook, "Lista_De_Precios_Quimex.xlsx");
  };

  const handleDownloadExcel = async () => {
    // ... (tu lógica sin cambios)
    if (!window.confirm("Se calcularán todos los precios antes de descargar. Esto puede tardar unos segundos. ¿Deseas continuar?")) {
      return;
    }
    setIsPreparingDownload(true);
    setDownloadError(null);

    try {
      const itemsToCalculate = allItems.filter(item => item.precio === undefined);
      let finalItems = [...allItems];

      if (itemsToCalculate.length > 0) {
        const pricePromises = itemsToCalculate.map(item =>
          calculatePrice(item)
            .then(result => ({ id: item.displayId, price: result.totalPrice, status: 'fulfilled' as const }))
            .catch(error => ({ id: item.displayId, error, status: 'rejected' as const }))
        );

        const results = await Promise.all(pricePromises);
        
        const updatedItemsMap = new Map(finalItems.map(item => [item.displayId, {...item}]));
        
        results.forEach(result => {
          const item = updatedItemsMap.get(result.id);
          if (item) {
            if (result.status === 'fulfilled') {
              item.precio = result.price;
              item.priceError = false;
            } else {
              item.priceError = true;
            }
            item.isLoadingPrice = false;
          }
        });

        finalItems = Array.from(updatedItemsMap.values());
        setAllItems(finalItems);
      }
      generateAndDownloadExcel(finalItems);
      //eslint-disable-next-line
    } catch (err: any) {
      console.error("Error durante la preparación de la descarga:", err);
      setDownloadError("Ocurrió un error al calcular los precios. Inténtalo de nuevo.");
    } finally {
      setIsPreparingDownload(false);
    }
  };
  
  const calculatePrice = useCallback(async (item: DisplayItem, quantityOverride?: number): Promise<{ unitPrice: number, totalPrice: number }> => {
    // ... (tu lógica sin cambios)
    if (!token) throw new Error("Token no disponible.");
    try {
      const quantity = quantityOverride !== undefined ? quantityOverride : (parseFloat(item.ref_calculo || '1') || 1);
      const body = { quantity: quantity, producto_id: item.id };
      const calculateUrl = `https://quimex.sistemataup.online/productos/calcular_precio/${item.id}`;
      const response = await fetch(calculateUrl, { 
        method: "POST", 
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, 
        body: JSON.stringify(body) 
      });

      if (!response.ok) { 
        const errorData = await response.json().catch(() => ({ detail: `Error ${response.status}` })); 
        throw new Error(errorData.mensaje || errorData.detail || `Error ${response.status}`); 
      }
      const data = await response.json();
      const unitPrice = data.precio_venta_unitario_ars;
      const totalPrice = data.precio_venta_unitario_ars;
      if (typeof unitPrice !== 'number' || typeof totalPrice !== 'number') { 
        throw new Error('Formato de precio inválido desde la API'); 
      }
      return { unitPrice, totalPrice };
    } catch (error) {
       console.error(`Error calculando precio para ${item.type} ID ${item.id}:`, error); 
       throw error; 
    }
  }, [token]);

  const handleDownloadPriceList = async () => {
    if (!token) {
        alert("Error: No autenticado.");
        return;
    }
    
    if (!window.confirm("Se generará un reporte Excel con la lista de precios por volumen. Esto puede tardar unos segundos. ¿Deseas continuar?")) {
      return;
    }

    setIsPreparingPriceList(true);
    setPriceListError(null);

    try {
        // La URL completa del backend + la ruta del endpoint CORRECTO
        const response = await fetch('https://quimex.sistemataup.online/reportes/lista_precios/excel', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `Error del servidor: ${response.status}` }));
            throw new Error(errorData.error || `Error ${response.status}`);
        }

        // El backend ahora nos devuelve el archivo Excel ya generado y listo.
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        // Obtenemos el nombre del archivo desde las cabeceras de la respuesta
        const contentDisposition = response.headers.get('content-disposition');
        let filename = 'Lista_Precios_Volumen_Quimex.xlsx'; // Nombre por defecto
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="(.+)"/);
            if (filenameMatch && filenameMatch.length === 2) {
                filename = filenameMatch[1];
            }
        }
        
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.parentNode?.removeChild(link);
        window.URL.revokeObjectURL(url);

    } catch (error) {
        console.error("Error generando la lista de precios por volumen:", error);
        let errorMessage = "Ocurrió un error desconocido.";
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        setPriceListError(errorMessage);
        alert(`Error al generar el reporte: ${errorMessage}`);
    } finally {
        setIsPreparingPriceList(false);
    }
};

  const fetchDolarValues = useCallback(async () => {
    // ... (tu lógica sin cambios)
    if (!token) { setErrorDolar("Token no disponible."); setLoadingDolar(false); return; }
    setLoadingDolar(true); setErrorDolar(null);
    try {
      const res = await fetch('https://quimex.sistemataup.online/tipos_cambio/obtener_todos', { headers: { "Authorization": `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      //eslint-disable-next-line
      const quimexValor = data.find((d: any) => d.nombre === "Empresa")?.valor;
      //eslint-disable-next-line
      const oficialValor = data.find((d: any) => d.nombre === "Oficial")?.valor;
      setDolarQuimex(typeof quimexValor === 'number' ? quimexValor : null);
      setDolarOficial(typeof oficialValor === 'number' ? oficialValor : null);
    } catch (err) { console.error("Error fetchDolarValues:", err); setErrorDolar("Error cargando dólar."); }
    finally { setLoadingDolar(false); }
  }, [token]);

  const fetchAndCombineData = useCallback(async () => {
    // ... (tu lógica sin cambios)
    if (!token) { setErrorInitial("Token no disponible."); setLoadingInitial(false); return; }
    setLoadingInitial(true); setErrorInitial(null);
    try {
      const [productsResponse, combosResponse] = await Promise.all([
        fetch(`https://quimex.sistemataup.online/productos/obtener_todos_paginado?page=1&per_page=10000`, { headers: { "Authorization": `Bearer ${token}` } }),
        fetch('https://quimex.sistemataup.online/combos/obtener-todos?incluir_info_usd=true&incluir_componentes=false', { headers: { "Authorization": `Bearer ${token}` } })
      ]);

      if (!productsResponse.ok) throw new Error(`Productos: Error ${productsResponse.status}`);
      const productsData = await productsResponse.json();
      const rawProducts: ProductDataRaw[] = productsData.productos || productsData.resultados || [];

      if (!combosResponse.ok) throw new Error(`Combos: Error ${combosResponse.status}`);
      const rawCombos: ComboDataRaw[] = await combosResponse.json();
      
      const displayProducts: DisplayItem[] = rawProducts.map(p => ({
        id: p.id, displayId: `product-${p.id}`, type: 'product', nombre: p.nombre,
        codigo: p.codigo || p.id.toString(), fecha_actualizacion: formatDate(p.fecha_actualizacion_costo),
        tipo_calculo: p.tipo_calculo || undefined, margen: p.margen === null ? undefined : p.margen,
        ref_calculo: p.ref_calculo || undefined, costo_referencia_usd: p.costo_referencia_usd === null ? undefined : p.costo_referencia_usd,
        es_combo_proxy: p.es_combo || false, combo_id_original: p.combo_id || null,
        precio: undefined, isLoadingPrice: true, priceError: false,
        ajusta_por_tc : p.ajusta_por_tc,
      }));

      const productProxyComboIds = new Set(displayProducts.filter(p => p.es_combo_proxy && p.combo_id_original).map(p => p.combo_id_original));

const displayCombos: DisplayItem[] = rawCombos.filter(c => !productProxyComboIds.has(c.id)).map(c => ({
        id: c.id, 
        displayId: `combo-${c.id}`, 
        type: 'combo', 
        nombre: c.nombre,
        codigo: c.sku_combo || `CMB-${c.id}`, 
        fecha_actualizacion: 'N/A', 
        tipo_calculo: "COMBO",
        margen: c.margen_combo ? c.margen_combo * 100 : undefined, 
        ref_calculo: "-",
        costo_referencia_usd: c.costo_referencia_usd === null ? undefined : c.costo_referencia_usd, 
        es_combo_proxy: false, 
        combo_id_original: c.id,
        // --- INICIO DE LA CORRECCIÓN ---
        // Se lee el precio del campo 'precio_base_combo_ars' que envía la API
        precio: c.precio_base_combo_ars === null ? undefined : c.precio_base_combo_ars,
        // La condición ahora evalúa el campo correcto, resultando en 'false' si el precio existe
        isLoadingPrice: c.precio_base_combo_ars === undefined,
        // --- FIN DE LA CORRECCIÓN ---
        priceError: false,
        ajusta_por_tc: false,
      }));

      const combined = [...displayProducts, ...displayCombos].sort((a, b) => a.nombre.localeCompare(b.nombre));
      setAllItems(combined);
      //eslint-disable-next-line
    } catch (err: any) {
      console.error("Error fetchAndCombineData:", err);
      setErrorInitial(err.message || 'Error cargando datos combinados.');
    } finally {
      setLoadingInitial(false);
    }
  }, [token]);
  
const handleDownloadFormulas = async () => {
    if (!token) {
        alert("Error: No autenticado.");
        return;
    }
    setIsDownloadingFormulas(true);
    setDownloadFormulasError(null);
    try {
        const response = await fetch('https://quimex.sistemataup.online/reportes/formulas-excel', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `Error del servidor: ${response.status}` }));
            throw new Error(errorData.error);
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const contentDisposition = response.headers.get('content-disposition');
        let filename = 'Reporte_Formulas_Quimex.xlsx';
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="(.+)"/);
            if (filenameMatch && filenameMatch.length === 2) {
                filename = filenameMatch[1];
            }
        }
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.parentNode?.removeChild(link);
        window.URL.revokeObjectURL(url);
    } catch (error) { // <-- CORREGIDO: Quita ': any'
        console.error("Error al descargar el reporte de fórmulas:", error);
        let errorMessage = "Ocurrió un error desconocido.";
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        setDownloadFormulasError(errorMessage);
        alert(`Error al generar el reporte: ${errorMessage}`);
    } finally {
        setIsDownloadingFormulas(false);
    }
};

  // --- NUEVA FUNCIÓN PARA ACTUALIZAR COSTOS DE RECETAS ---
  const handleUpdateAllRecipeCosts = async () => {
    if (!window.confirm("Esta acción recalculará los costos de TODAS las recetas basado en los costos actuales de sus ingredientes. Puede tardar unos momentos. ¿Desea continuar?")) {
      return;
    }
    if (!token) {
      alert("Error: No autenticado.");
      return;
    }
    
    setIsUpdatingAllRecipes(true);
    setUpdateAllRecipesError(null);

    try {
      const response = await fetch('https://quimex.sistemataup.online/recetas/actualizar-costos-recetas', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || `Error ${response.status}`);
      }
      alert("Recetas actualizadas");
      await fetchAndCombineData(); // Recargar datos para ver los cambios
      //eslint-disable-next-line
    } catch (error: any) {
      setUpdateAllRecipesError(error.message || "Un error ocurrió.");
      alert(`Error: ${error.message}`);
    } finally {
      setIsUpdatingAllRecipes(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchAndCombineData();
      fetchDolarValues();
    }
  }, [token, fetchAndCombineData, fetchDolarValues]);

  useEffect(() => {
    // ... (tu lógica sin cambios)
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
    
    const itemsNeedingPrice = paginated.filter(item => item.isLoadingPrice && item.precio === undefined);
    if (itemsNeedingPrice.length > 0) {
      const pricePromises = itemsNeedingPrice.map(item =>
        calculatePrice(item)
          .then(result => ({...item, precio: result.totalPrice, isLoadingPrice: false, priceError: false}))
          .catch(() => ({...item, isLoadingPrice: false, priceError: true}))
      );
      Promise.all(pricePromises).then(resolvedItems => {
        setAllItems(currentAllItems => {
            const itemsMap = new Map(currentAllItems.map(i => [i.displayId, i]));
            resolvedItems.forEach(resolved => itemsMap.set(resolved.displayId, resolved));
            return Array.from(itemsMap.values());
        });
      });
    }
    setDisplayedItems(paginated);
  }, [allItems, searchTerm, currentPage, calculatePrice]);
  
  useEffect(() => { setCurrentPage(1); }, [searchTerm]);

  const formatDate = (isoDateString: string | null | undefined): string => {
    // ... (tu lógica sin cambios)
    if (!isoDateString) return 'N/A';
    try { const date = new Date(isoDateString); if (isNaN(date.getTime())) return 'Inválida'; return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
    catch (e) { console.log(e); return 'Error fecha'; }
  };
  
  const handleSaveDolarValues = async () => {
    // ... (tu lógica sin cambios)
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
           }
        });
        if (success) {
            setDolarOficial(oficialNum); setDolarQuimex(quimexNum); setIsEditingDolar(false); alert("Valores Dólar actualizados.");
        } else {
            setErrorDolarSave(`Errores: ${errors.join('; ')}`);
        }
    }
    //eslint-disable-next-line
    catch (err: any) { setErrorDolarSave(err.message || "Error de red."); }
    finally { setLoadingDolarSave(false); }
 };
  
  const goToPreviousPage = () => { if (currentPage > 1) setCurrentPage(prev => prev - 1); };
  const goToNextPage = () => { if (totalPages > 0 && currentPage < totalPages) setCurrentPage(prev => prev + 1); };
  const handleOpenCreateProductModal = () => { setEditingItemId(null); setEditingItemType(null); setIsProductModalOpen(true); };
  const handleOpenEditProductModal = (item: DisplayItem) => { setEditingItemId(item.id); setEditingItemType(item.type); setIsProductModalOpen(true); };
  const handleCloseProductModal = () => { setIsProductModalOpen(false); setEditingItemId(null); setEditingItemType(null); };
  const handleProductCreatedOrUpdated = () => { if (token) fetchAndCombineData(); handleCloseProductModal(); };
  const handleEditDolarClick = () => { setEditDolarOficial(dolarOficial?.toString() ?? ''); setEditDolarQuimex(dolarQuimex?.toString() ?? ''); setIsEditingDolar(true); setErrorDolarSave(null); };
  const handleCancelDolarEdit = () => { setIsEditingDolar(false); setErrorDolarSave(null); };
  const handleDolarInputChange = (e: ChangeEvent<HTMLInputElement>) => { const { name, value } = e.target; const s = value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'); if (name === 'dolarOficial') setEditDolarOficial(s); else if (name === 'dolarQuimex') setEditDolarQuimex(s); };

const handleDeleteProduct = async (itemToDelete: DisplayItem) => {
  if (!token) {
    alert("Error: Token no disponible. Por favor, inicie sesión de nuevo.");
    return;
  }

  // --- PASO 1: CONFIRMACIÓN INICIAL ---
  const confirmacionInicial = window.confirm(
    `¿Estás seguro de que quieres iniciar el proceso de eliminación para "${itemToDelete.nombre}"?`
  );

  if (!confirmacionInicial) {
    return; // El usuario canceló
  }

  setDeletingItem(itemToDelete); // Marcar el item como "en proceso de eliminación" en la UI

  try {
    // --- PASO 2: INTENTO DE ELIMINACIÓN (MODO ANÁLISIS) ---
    const deleteUrl = `https://quimex.sistemataup.online/productos/eliminar/${itemToDelete.id}`;
    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      // --- ÉXITO INMEDIATO (SIN DEPENDENCIAS) ---
      const result = await response.json();
      alert(result.message || `"${itemToDelete.nombre}" fue eliminado exitosamente.`);
      await fetchAndCombineData(); // Recargar la lista de productos
    } else if (response.status === 409) {
      // --- CONFLICTO (HAY DEPENDENCIAS) ---
      const informe = await response.json();
      
      // Construir un mensaje de advertencia detallado
      let mensajeAdvertencia = `${informe.error}\n\nEste producto está referenciado en:\n`;
      const deps = informe.dependencias;
      if (deps.es_ingrediente_en_recetas?.cantidad > 0) {
        mensajeAdvertencia += `- ${deps.es_ingrediente_en_recetas.cantidad} receta(s) (ej: "${deps.es_ingrediente_en_recetas.detalle[0]}").\n`;
      }
      if (deps.precios_especiales?.cantidad > 0) {
        mensajeAdvertencia += `- ${deps.precios_especiales.cantidad} precio(s) especial(es).\n`;
      }
      if (deps.detalles_venta?.cantidad > 0) {
        mensajeAdvertencia += `- ${deps.detalles_venta.cantidad} venta(s) registrada(s).\n`;
      }
      if (deps.detalles_compra?.cantidad > 0) {
        mensajeAdvertencia += `- ${deps.detalles_compra.cantidad} orden(es) de compra.\n`;
      }
      mensajeAdvertencia += `\n${informe.mensaje_accion.replace("vuelva a realizar esta petición añadiendo el parámetro '?forzar=true'", "¿Deseas forzar la eliminación ahora?")}`;

      // Mostrar el segundo diálogo de confirmación
      const confirmacionForzada = window.confirm(mensajeAdvertencia);

      if (confirmacionForzada) {
        // --- LLAMADA FINAL (MODO EJECUCIÓN) ---
        const responseForzada = await fetch(`${deleteUrl}?forzar=true`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!responseForzada.ok) {
          const errorFinal = await responseForzada.json();
          throw new Error(errorFinal.error || "Falló la eliminación forzada.");
        }

        const resultadoForzado = await responseForzada.json();
        alert(resultadoForzado.message);
        await fetchAndCombineData(); // Recargar la lista
      }
    } else {
      // Otro tipo de error (500, 401, 404, etc.)
      const errorData = await response.json();
      throw new Error(errorData.error || `Error del servidor: ${response.status}`);
    }
} catch (err) { // El tipo por defecto es 'unknown'
  let errorMessage = "Ocurrió un error desconocido.";
  
  // Verificamos si 'err' es una instancia de Error
  if (err instanceof Error) {
    errorMessage = err.message;
  }
  
  console.error("Error en el proceso de eliminación:", err);
  alert(`Error: ${errorMessage}`);
} finally {
  setDeletingItem(null); // Limpiar el estado de eliminación en la UI
}
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
    } catch (error: any) { setUploadErrorMsg(error.message || "Error al subir."); }
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
            <tr 
                key={item.displayId} 
                className={`transition duration-150 ease-in-out ${
                    isDeletingCurrent 
                        ? 'opacity-50 bg-red-50' 
                        : item.ajusta_por_tc
                            ? 'bg-amber-100 hover:bg-amber-200' 
                            : item.type === 'combo' 
                                ? 'bg-lime-50 hover:bg-lime-100' 
                                : (item.es_combo_proxy 
                                    ? 'bg-yellow-50 hover:bg-yellow-100' 
                                    : 'hover:bg-indigo-50')
                }`}
            >
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{item.codigo || item.id}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {item.nombre}
                    {item.type === 'combo' && <span className="ml-2 text-xs bg-lime-200 text-lime-800 px-1.5 py-0.5 rounded-full font-semibold">COMBO</span>}
                    {item.type === 'product' && item.es_combo_proxy && <span className="ml-2 text-xs bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded-full font-semibold">P-COMBO</span>}
                    {item.ajusta_por_tc && <span className="ml-2 text-xs bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full font-semibold">TC</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{item.fecha_actualizacion}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{item.tipo_calculo}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-left">{typeof item.margen === 'number' ? `${item.margen.toFixed(2)}%` : 'N/A'}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{item.ref_calculo}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-left">{typeof item.costo_referencia_usd === 'number' ? item.costo_referencia_usd.toFixed(2) : 'N/A'}</td>
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
          <input type="text" placeholder="Buscar por nombre o código..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="px-4 py-2 border rounded-md w-full md:w-auto"/>
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto flex-wrap justify-end">
            <div className="flex items-center gap-x-4 gap-y-2 flex-wrap border p-2 rounded-md">
                <div className="text-sm flex items-center gap-1"> <label htmlFor="dolarOficialInput" className="font-medium">Dólar Oficial:</label> {loadingDolar ? "..." : isEditingDolar ? <input id="dolarOficialInput" type="text" name="dolarOficial" value={editDolarOficial} onChange={handleDolarInputChange} className="px-2 py-1 border rounded text-sm w-24" disabled={loadingDolarSave} inputMode="decimal" /> : dolarOficial !== null ? <span className="font-semibold">${dolarOficial.toFixed(2)}</span> : <span className="text-red-500 text-xs">{errorDolar || 'Error'}</span>} </div>
                <div className="text-sm flex items-center gap-1"> <label htmlFor="dolarQuimexInput" className="font-medium">Dólar Empresa:</label> {loadingDolar ? "..." : isEditingDolar ? <input id="dolarQuimexInput" type="text" name="dolarQuimex" value={editDolarQuimex} onChange={handleDolarInputChange} className="px-2 py-1 border rounded text-sm w-24" disabled={loadingDolarSave} inputMode="decimal" /> : dolarQuimex !== null ? <span className="font-semibold">${dolarQuimex.toFixed(2)}</span> : <span className="text-red-500 text-xs">{errorDolar || 'Error'}</span>} </div>
                <div className="flex items-center gap-2"> {isEditingDolar ? (<> <button onClick={handleSaveDolarValues} disabled={loadingDolarSave || loadingDolar} className={`px-3 py-1 text-xs rounded flex items-center gap-1 ${ loadingDolarSave || loadingDolar ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-100 text-green-700 hover:bg-green-200' }`}> <svg className={`h-3 w-3 ${loadingDolarSave ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg> {loadingDolarSave ? '...' : 'Guardar'} </button> <button onClick={handleCancelDolarEdit} disabled={loadingDolarSave} className="px-3 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"> Cancelar </button> </> ) : (<button onClick={handleEditDolarClick} disabled={loadingDolar || dolarOficial === null || dolarQuimex === null} className={`px-3 py-1 text-xs rounded flex items-center gap-1 ${ loadingDolar || dolarOficial === null || dolarQuimex === null ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-100 text-blue-700 hover:bg-blue-200' }`}> <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg> Editar Dólar </button> )} </div>
                {errorDolarSave && ( <p className="text-xs text-red-600 mt-1 w-full text-right sm:text-left sm:w-auto">{errorDolarSave}</p> )}
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-2 flex-wrap">
                <button
                    onClick={handleUpdateAllRecipeCosts}
                    disabled={!token || isUpdatingAllRecipes}
                    className="w-full sm:w-auto bg-purple-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-purple-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
                >
                    {isUpdatingAllRecipes ? '...' : 'Actualizar Costo Recetas Global'}
                </button>
                <button
                    onClick={handleDownloadFormulas}
                    disabled={!token || isDownloadingFormulas}
                    className="w-full sm:w-auto bg-teal-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-teal-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
                >
                    {isDownloadingFormulas ? 'Generando...' : 'Descargar Fórmulas'}
                </button>
                <button
                    onClick={handleDownloadPriceList}
                    disabled={!token || allItems.length === 0 || isPreparingPriceList}
                    className="w-full sm:w-auto bg-cyan-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-cyan-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
                >
                    {isPreparingPriceList ? '...' : 'Precios (Kg/Lt)'}
                </button>
                <button
                    onClick={handleDownloadExcel}
                    disabled={!token || allItems.length === 0 || isPreparingDownload}
                    className="w-full sm:w-auto bg-green-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-green-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
                >
                    {isPreparingDownload ? '...' : 'Lista General'}
                </button>
                <button onClick={handleOpenUploadModal} disabled={!token} className="w-full sm:w-auto bg-teal-500 text-white px-4 py-2 rounded-md shadow-sm hover:bg-teal-600 disabled:bg-gray-400 flex items-center justify-center gap-1">Actualizar Costos</button>
                <button onClick={handleOpenCreateProductModal} disabled={!token} className="w-full sm:w-auto bg-indigo-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-indigo-700 disabled:bg-gray-400 flex items-center justify-center gap-1">Crear Item</button>
            </div>
          </div>
        </div>

        {updateAllRecipesError && <p className="text-center text-red-600 my-2 bg-red-50 p-2 rounded border text-sm">Error en actualización global: {updateAllRecipesError}</p>}
        {!token && <p className="text-center text-orange-600 my-6 bg-orange-50 p-3 rounded-md border">Inicie sesión.</p>}
        {loadingInitial && token && <p className="text-center text-gray-600 my-6">Cargando...</p>}
        {errorInitial && token && <p className="text-center text-red-600 my-6">Error: {errorInitial}</p>}

        {!loadingInitial && !errorInitial && token && (
          <>
            <div className="overflow-x-auto border rounded-md">
              <table className="min-w-full bg-white table-fixed">
                <thead id="product-table-header" className="bg-indigo-700 text-white sticky top-0 z-10">
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
                <tbody className="divide-y divide-gray-200">{tableBodyContent}</tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex justify-between items-center mt-4 px-1 py-2 border-t">
                 <button onClick={goToPreviousPage} disabled={currentPage === 1} className={`px-4 py-2 text-sm rounded ${ currentPage === 1 ? 'bg-gray-200' : 'bg-indigo-100 hover:bg-indigo-200' }`}> Anterior </button>
                 <span className="text-sm text-gray-700"> Página {currentPage} de {totalPages} (Total: {totalFilteredItems})</span>
                 <button onClick={goToNextPage} disabled={currentPage === totalPages} className={`px-4 py-2 text-sm rounded ${ currentPage === totalPages ? 'bg-gray-200' : 'bg-indigo-100 hover:bg-indigo-200' }`}> Siguiente </button>
              </div>
            )}
          </>
        )}
      </div>
      {downloadFormulasError && <p className="text-center text-red-600 my-2 bg-red-50 p-2 rounded border text-sm">Error en descarga de fórmulas: {downloadFormulasError}</p>}
      {isDownloadingFormulas && <div className="fixed inset-0 bg-gray-600 bg-opacity-75 z-50 flex justify-center items-center"><div className="bg-white p-6 rounded shadow-lg">Generando reporte de fórmulas...</div></div>}
      {isProductModalOpen && (<CreateProductModal onClose={handleCloseProductModal} onProductCreatedOrUpdated={handleProductCreatedOrUpdated} productIdToEdit={editingItemType === 'product' ? editingItemId : null} comboIdToEdit={editingItemType === 'combo' ? editingItemId : (editingItemType === 'product' && displayedItems.find(it => it.id === editingItemId && it.type === 'product')?.es_combo_proxy ? displayedItems.find(it => it.id === editingItemId && it.type === 'product')?.combo_id_original : null) } isInitiallyCombo={editingItemType === 'combo' || (editingItemType === 'product' && displayedItems.find(it => it.id === editingItemId && it.type === 'product')?.es_combo_proxy)} /> )}
      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 z-50 flex justify-center items-center px-4">
          <div className="relative mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <h3 className="text-lg font-medium text-gray-900">Actualizar Costos desde CSV</h3>
              <div className="mt-2 px-7 py-3">
                <p className="text-sm text-gray-500 mb-4">Selecciona o arrastra un archivo CSV.</p>
                <div className="mb-4">
                  <label htmlFor="csv-upload-input" className={`w-full flex flex-col items-center px-4 py-6 bg-white text-blue-500 rounded-lg shadow border-2 ${selectedFile ? 'border-green-400' : 'border-dashed'} cursor-pointer`}>
                    <span className="text-sm font-medium">{selectedFile ? selectedFile.name : "Seleccionar CSV"}</span>
                    <input id="csv-upload-input" type="file" className="hidden" accept=".csv" onChange={handleFileChange} disabled={isUploading}/>
                  </label>
                  {selectedFile && (<button onClick={() => { setSelectedFile(null); const el = document.getElementById('csv-upload-input') as HTMLInputElement; if(el) el.value = '';}} className="mt-2 text-xs text-red-500" disabled={isUploading}>Quitar</button>)}
                </div>
                {uploadErrorMsg && (<p className="text-sm text-red-600">{uploadErrorMsg}</p>)}
                {uploadSuccess && (<p className="text-sm text-green-600">{uploadSuccess}</p>)}
              </div>
              <div className="items-center px-4 py-3 gap-2 flex justify-end border-t pt-4">
                <button onClick={handleUploadFile} disabled={!selectedFile || isUploading} className="px-4 py-2 bg-teal-500 text-white rounded-md">{isUploading ? 'Procesando...' : "Subir"}</button>
                <button onClick={handleCloseUploadModal} disabled={isUploading} className="px-4 py-2 bg-gray-200 rounded-md">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}