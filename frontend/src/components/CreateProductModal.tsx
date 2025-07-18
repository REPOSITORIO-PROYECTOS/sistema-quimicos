// components/CreateProductModal.tsx
import React, { useState, useEffect, ChangeEvent, useCallback } from 'react';
import { useProductsContext } from '@/context/ProductsContext';

// --- Interfaces ---
// --- CAMBIO: 'porcentaje' ahora es un string para manejar inputs decimales correctamente ---
interface IngredientItem { id: string; ingrediente_id: string | number; porcentaje: string; }
interface ComboComponentItem { id: string; producto_id: string | number; cantidad: number | string; }
interface ProductOption { id: string | number; nombre: string; }

interface ProductDataForEditAPI {
    id: string | number;
    nombre: string;
    sku?: string | null;
    unidad_venta: string | null;
    costo_referencia_usd: number | null;
    es_receta: boolean;
    ajusta_por_tc: boolean;
    ref_calculo: number | null;
    margen: number | null;
    tipo_calculo: string | null;
    descripcion?: string | null;
    es_combo?: boolean;
    combo_id?: number | null;
}
interface RecipeItemForEditAPI { ingrediente_id: number | string; porcentaje: number; }

interface ApiComboComponente {
    cantidad: number;
    componente: {
        es_receta: boolean;
        nombre: string;
        producto_id: number | string;
    };
    id: number;
}
interface ComboDataAPI {
    id: number;
    nombre: string;
    sku_combo: string | null;
    descripcion: string | null;
    margen_combo: number;
    activo: boolean;
    componentes: ApiComboComponente[];
}

export interface CreateProductModalProps {
    onClose: () => void;
    onProductCreatedOrUpdated: () => void;
    productIdToEdit?: string | number | null;
    comboIdToEdit?: string | number | null;
    isInitiallyCombo?: boolean;
}

const unidadesDeVenta = ["LT", "KG", "UNIDAD"];

const CreateProductModal: React.FC<CreateProductModalProps> = ({
    onClose,
    onProductCreatedOrUpdated,
    productIdToEdit,
    comboIdToEdit,
    isInitiallyCombo
}) => {
    const isEditMode = !!(productIdToEdit || comboIdToEdit);
    const token = localStorage.getItem("token");

    const [productCode, setProductCode] = useState('');
    const [nombre, setNombre] = useState('');
    const [descripcionProducto, setDescripcionProducto] = useState('');
    const [unidadVenta, setUnidadVenta] = useState('');
    const [costoReferenciaUsd, setCostoReferenciaUsd] = useState('');
    const [ajustaPorTc, setAjustaPorTc] = useState(false);
    const [unidadReferencia, setUnidadReferencia] = useState('');
    const [margenProducto, setMargenProducto] = useState('');
    const [tipoCalculo, setTipoCalculo] = useState('');
    const [esReceta, setEsReceta] = useState(false);
    const [ingredients, setIngredients] = useState<IngredientItem[]>([]);
    const [recetaIdOriginal, setRecetaIdOriginal] = useState<number | null>(null);
    const [esCombo, setEsCombo] = useState(isInitiallyCombo || false);
    const [skuCombo, setSkuCombo] = useState('');
    const [descripcionCombo, setDescripcionCombo] = useState('');
    const [margenCombo, setMargenCombo] = useState('');
    const [comboComponents, setComboComponents] = useState<ComboComponentItem[]>([]);
    const [comboIdOriginal, setComboIdOriginal] = useState<number | null>(comboIdToEdit ? Number(comboIdToEdit) : null);
    const [availableProducts, setAvailableProducts] = useState<ProductOption[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [isLoadingData, setIsLoadingData] = useState(false);

    const { productos: productosDelContexto } = useProductsContext();

    useEffect(() => {
        if (productosDelContexto && productosDelContexto.length > 0) {
            const currentEditingIdStr = (isInitiallyCombo ? comboIdToEdit : productIdToEdit)?.toString();
            setAvailableProducts(
                productosDelContexto
                    .filter(p => p.id.toString() !== currentEditingIdStr)
                    .map(p => ({ id: p.id.toString(), nombre: p.nombre }))
            );
        } else { setAvailableProducts([]); }
    }, [productosDelContexto, productIdToEdit, comboIdToEdit, isInitiallyCombo]);

    const getComboIdFromProductId = useCallback(async (pId: string | number): Promise<number | null> => {
        if (!token) return null;
        try {
            const productRes = await fetch(`https://quimex.sistemataup.online/productos/obtener/${pId}`, { headers: { "Authorization": `Bearer ${token}` } });
            if (productRes.ok) {
                const productData = await productRes.json();
                if (productData.es_combo && productData.combo_id) return productData.combo_id;
            }
        } catch (e) { console.error("Error en getComboIdFromProductId", e); }
        return null;
    }, [token]);

    useEffect(() => {
        const fetchDetails = async () => {
            if (!isEditMode) return;
            setIsLoadingData(true); setSaveError(null);
            let currentComboIdToLoad = comboIdToEdit ? Number(comboIdToEdit) : null;
            let localEsCombo = isInitiallyCombo || false;

            try {
                if (isInitiallyCombo && productIdToEdit && !comboIdToEdit) {
                    const actualComboId = await getComboIdFromProductId(productIdToEdit);
                    if (actualComboId) {
                        currentComboIdToLoad = actualComboId;
                        setComboIdOriginal(actualComboId);
                        localEsCombo = true;
                    } else {
                        console.warn(`Producto ${productIdToEdit} marcado como combo pero no se encontró combo_id.`);
                        localEsCombo = true;
                    }
                }
                setEsCombo(localEsCombo);

                if (localEsCombo && currentComboIdToLoad) {
                    const comboRes = await fetch(`https://quimex.sistemataup.online/combos/obtener/${currentComboIdToLoad}`, { headers: { "Authorization": `Bearer ${token}` } });
                    if (comboRes.ok) {
                        const comboData: ComboDataAPI = await comboRes.json();
                        setNombre(comboData.nombre || '');
                        setSkuCombo(comboData.sku_combo || '');
                        setDescripcionCombo(comboData.descripcion || '');
                        setMargenCombo(comboData.margen_combo?.toString() || '');
                        setComboIdOriginal(currentComboIdToLoad);
                        if (comboData.componentes) {
                            setComboComponents(comboData.componentes.map(compApi => ({
                                id: crypto.randomUUID(),
                                producto_id: compApi.componente.producto_id.toString(),
                                cantidad: compApi.cantidad,
                            })));
                        } else {
                            setComboComponents([]);
                        }
                        if (productIdToEdit) {
                             const productProxyRes = await fetch(`https://quimex.sistemataup.online/productos/obtener/${productIdToEdit}`, { headers: { "Authorization": `Bearer ${token}` } });
                             if (productProxyRes.ok) { const proxyData = await productProxyRes.json(); setProductCode(proxyData.sku || proxyData.id.toString()); }
                        }
                    } else if (comboRes.status !== 404) { console.warn(`Error obteniendo combo ${currentComboIdToLoad}`); setEsCombo(false); }
                      else { setEsCombo(false); }
                }

                if (productIdToEdit && !localEsCombo) {
                    const productRes = await fetch(`https://quimex.sistemataup.online/productos/obtener/${productIdToEdit}`, { headers: { "Authorization": `Bearer ${token}` } });
                    if (!productRes.ok) throw new Error(`Error obteniendo producto ${productIdToEdit}.`);
                    const productData: ProductDataForEditAPI = await productRes.json();
                    setNombre(productData.nombre || '');
                    setProductCode(productData.sku || productData.id.toString());
                    setDescripcionProducto(productData.descripcion || '');
                    setUnidadVenta(productData.unidad_venta || '');
                    setCostoReferenciaUsd(productData.costo_referencia_usd?.toString() || '');
                    setAjustaPorTc(productData.ajusta_por_tc || false);
                    setUnidadReferencia(productData.ref_calculo?.toString() || '');
                    setMargenProducto(productData.margen?.toString() || '');
                    setTipoCalculo((productData.tipo_calculo || '').toUpperCase());
                    setEsReceta(productData.es_receta || false);
                    if (productData.es_receta) {
                        const recipeRes = await fetch(`https://quimex.sistemataup.online/recetas/obtener/por-producto/${productIdToEdit}`, { headers: { "Authorization": `Bearer ${token}` } });
                        if (recipeRes.ok) {
                            const recipeData: { id?: number, items: RecipeItemForEditAPI[] } = await recipeRes.json();
                            setRecetaIdOriginal(recipeData.id || null);
                            // --- CAMBIO: Se convierte `porcentaje` a string al cargar los datos ---
                            setIngredients(recipeData.items?.map(item => ({ id: crypto.randomUUID(), ingrediente_id: item.ingrediente_id.toString(), porcentaje: item.porcentaje.toString() })) || []);
                        }
                    }
                }
                //eslint-disable-next-line
            } catch (err: any) { console.error("Error cargando detalles:", err); setSaveError(err.message || "Error al cargar."); }
            finally { setIsLoadingData(false); }
        };
        if (isEditMode) fetchDetails();
    }, [isEditMode, productIdToEdit, comboIdToEdit, isInitiallyCombo, token, getComboIdFromProductId]);

    // --- CAMBIO: 'porcentaje' se inicializa como string vacío ('') en lugar de 0 ---
    const addIngredientRow = useCallback(() => setIngredients(prev => [...prev, { id: crypto.randomUUID(), ingrediente_id: '', porcentaje: '' }]), []);
    const removeIngredientRow = (index: number) => setIngredients(prev => prev.filter((_, i) => i !== index));

    // --- CAMBIO: Función reemplazada para manejar correctamente la entrada de decimales ---
    const handleIngredientChange = (index: number, e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setSaveError(null);

        setIngredients(prev =>
            prev.map((item, i) => {
                if (i !== index) {
                    return item;
                }

                if (name === 'porcentaje') {
                    const decimalRegex = /^\d*\.?\d*$/;
                    if (decimalRegex.test(value)) {
                        return { ...item, [name]: value }; // Guarda como string
                    }
                    return item; 
                } else {
                    return { ...item, [name]: value };
                }
            })
        );
    };
    
    const addComboComponentRow = useCallback(() => setComboComponents(prev => [...prev, { id: crypto.randomUUID(), producto_id: '', cantidad: 1 }]), []);
    const removeComboComponentRow = (index: number) => setComboComponents(prev => prev.filter((_, i) => i !== index));
    const handleComboComponentChange = (index: number, e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target; setSaveError(null);
        setComboComponents(prev => prev.map((item, i) => i === index ? { ...item, [name]: name === 'cantidad' ? (parseInt(value.replace(/[^0-9]/g, ''), 10) || 1) : value } : item));
    };
    const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        setSaveError(null);
        if (type === 'checkbox') {
            const { checked } = e.target as HTMLInputElement;
            if (name === 'esReceta') {
                setEsReceta(checked);
                if (checked) { setEsCombo(false); if (ingredients.length === 0 && !isLoadingData) addIngredientRow(); }
                else setIngredients([]);
            }
            if (name === 'esCombo') {
                setEsCombo(checked);
                if (checked) { setEsReceta(false); if (comboComponents.length === 0 && !isLoadingData) addComboComponentRow(); }
                else { setComboComponents([]); setSkuCombo(''); setDescripcionCombo(''); setMargenCombo(''); }
            }
            if (name === 'ajustaPorTc') setAjustaPorTc(checked);
        } else {
            let sanitizedValue = value;
            if (['costoReferenciaUsd', 'margenProducto', 'unidadReferencia', 'margenCombo'].includes(name)) {
                sanitizedValue = value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
            }
            if (name === 'productCode') setProductCode(sanitizedValue.toUpperCase());
            else if (name === 'nombre') setNombre(value);
            else if (name === 'descripcionProducto') setDescripcionProducto(value);
            else if (name === 'unidadVenta') setUnidadVenta(value);
            else if (name === 'costoReferenciaUsd') setCostoReferenciaUsd(sanitizedValue);
            else if (name === 'unidadReferencia') setUnidadReferencia(sanitizedValue);
            else if (name === 'margenProducto') setMargenProducto(sanitizedValue);
            else if (name === 'tipoCalculo') setTipoCalculo(value);
            else if (name === 'skuCombo') setSkuCombo(sanitizedValue.toUpperCase());
            else if (name === 'descripcionCombo') setDescripcionCombo(value);
            else if (name === 'margenCombo') setMargenCombo(sanitizedValue);
        }
    };
    useEffect(() => {
        if (!isEditMode && !isLoadingData) {
            if (esReceta && ingredients.length === 0) addIngredientRow();
            if (esCombo && comboComponents.length === 0) addComboComponentRow();
        }
    }, [esReceta, esCombo, isLoadingData, isEditMode, addIngredientRow, addComboComponentRow]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaveError(null); setIsSaving(true);
        if (!nombre.trim()) { setSaveError("El Nombre es obligatorio."); setIsSaving(false); return; }

        try {
            if (esCombo) {
                const margenComboNum = parseFloat(margenCombo);
                if (isNaN(margenComboNum) || margenComboNum < 0 || margenComboNum >= 1) throw new Error("Margen Combo: 0 a <1.");
                if (comboComponents.length === 0 || comboComponents.some(c => !c.producto_id || parseInt(c.cantidad.toString()) <= 0)) throw new Error("Componentes Combo incompletos.");

                const comboPayload = {
                    nombre: nombre.trim(), sku_combo: skuCombo.trim() || null, descripcion: descripcionCombo.trim() || null,
                    margen_combo: margenComboNum, activo: true,
                    componentes: comboComponents.map(c => ({ producto_id: Number(c.producto_id), cantidad: parseInt(c.cantidad.toString(), 10) })),
                };
                let effectiveComboIdForEdit = comboIdOriginal;
                if(isEditMode && productIdToEdit && !comboIdOriginal && !comboIdToEdit){
                    const existingComboIdFromProduct = await getComboIdFromProductId(productIdToEdit);
                    if(existingComboIdFromProduct) effectiveComboIdForEdit = existingComboIdFromProduct;
                }

                const comboApiUrl = (isEditMode && effectiveComboIdForEdit) ? `https://quimex.sistemataup.online/combos/editar/${effectiveComboIdForEdit}` : 'https://quimex.sistemataup.online/combos/crear';
                const comboApiMethod = (isEditMode && effectiveComboIdForEdit) ? 'PUT' : 'POST';
                const comboResponse = await fetch(comboApiUrl, { method: comboApiMethod, headers: { 'Content-Type': 'application/json', "Authorization": `Bearer ${token}` }, body: JSON.stringify(comboPayload) });
                const comboResult = await comboResponse.json();
                if (!comboResponse.ok) throw new Error(comboResult.error || `Error ${isEditMode ? 'actualizando' : 'creando'} combo`);

                const comboIdGuardado = comboResult.id || effectiveComboIdForEdit;

                if (comboIdGuardado) {
                    //eslint-disable-next-line
                    const productoProxyPayload: any = {
                        nombre: nombre.trim(), es_combo: true, combo_id: comboIdGuardado,
                        sku: productCode.trim() || skuCombo.trim() || null, es_receta: false, descripcion: null, unidad_venta: null,
                        costo_referencia_usd: null, ajusta_por_tc: false, ref_calculo: null, margen: null, tipo_calculo: null,
                    };
                    if (comboApiMethod === 'POST' && productCode.trim()) productoProxyPayload.id = productCode.trim();
                    else if (comboApiMethod === 'POST') delete productoProxyPayload.id;

                    const productoProxyUrl = (isEditMode && productIdToEdit)
                        ? `https://quimex.sistemataup.online/productos/actualizar/${productIdToEdit}`
                        : 'https://quimex.sistemataup.online/productos/crear';
                    const productoProxyMethod = (isEditMode && productIdToEdit) ? 'PUT' : 'POST';
                    const productoProxyResponse = await fetch(productoProxyUrl, { method: productoProxyMethod, headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(productoProxyPayload) });
                    if (!productoProxyResponse.ok) { const proxyError = await productoProxyResponse.json(); console.warn("Advertencia: Combo guardado, error al actualizar/crear producto asociado:", proxyError.detalle || proxyError.error); }
                }
                alert(`Combo "${nombre}" ${isEditMode && effectiveComboIdForEdit ? 'actualizado' : 'creado'}.`);

            } else {
                //eslint-disable-next-line
                const productPayload: any = {
                    id: productCode.trim() || null, nombre: nombre.trim(), descripcion: descripcionProducto.trim() || null,
                    unidad_venta: unidadVenta || null, costo_referencia_usd: parseFloat(costoReferenciaUsd) || null,
                    ajusta_por_tc: ajustaPorTc, ref_calculo: parseFloat(unidadReferencia) || null,
                    margen: parseFloat(margenProducto) || null, tipo_calculo: (tipoCalculo.trim() || '').toUpperCase() || null,
                    es_receta: esReceta, es_combo: false, combo_id: null,
                };
                const productApiUrl = isEditMode && productIdToEdit ? `https://quimex.sistemataup.online/productos/actualizar/${productIdToEdit}` : 'https://quimex.sistemataup.online/productos/crear';
                const productApiMethod = isEditMode && productIdToEdit ? 'PUT' : 'POST';
                const productResponse = await fetch(productApiUrl, { method: productApiMethod, headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(productPayload) });
                const productResult = await productResponse.json();
                if (!productResponse.ok) throw new Error(productResult.detalle || productResult.error || `Error producto`);
                const effectiveProductId = productResult.id || productIdToEdit;

                if (esReceta && effectiveProductId) {
                    // --- CAMBIO: Limpieza de la lógica de validación y conversión a número ---
                    if (ingredients.some(item => !item.ingrediente_id || !item.porcentaje || parseFloat(item.porcentaje) <= 0)) throw new Error("Ingredientes de receta incompletos.");
                    const recipePayload = { producto_final_id: effectiveProductId, items: ingredients.map(item => ({ ingrediente_id: Number(item.ingrediente_id), porcentaje: parseFloat(item.porcentaje) || 0 })) };
                    const recipeApiUrl = (isEditMode && recetaIdOriginal) ? `https://quimex.sistemataup.online/recetas/actualizar/por-producto/${effectiveProductId}` : 'https://quimex.sistemataup.online/recetas/crear';
                    const recipeApiMethod = (isEditMode && recetaIdOriginal) ? 'PUT' : 'POST';
                    const recipeResponse = await fetch(recipeApiUrl, { method: recipeApiMethod, headers: { 'Content-Type': 'application/json', "Authorization": `Bearer ${token}` }, body: JSON.stringify(recipePayload) });
                    if (!recipeResponse.ok) { const recipeError = await recipeResponse.json(); throw new Error(recipeError.detalle || recipeError.error || `Error receta`);}
                } else if (!esReceta && isEditMode && recetaIdOriginal) {
                    // console.log("Receta a eliminar/desactivar:", recetaIdOriginal);
                }
                if (isEditMode && comboIdOriginal) {
                    await fetch(`https://quimex.sistemataup.online/combos/editar/${comboIdOriginal}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', "Authorization": `Bearer ${token}` }, body: JSON.stringify({ activo: false }) });
                }
                alert(`Producto "${nombre}" ${isEditMode ? 'actualizado' : 'creado'}.`);
            }
            onProductCreatedOrUpdated();
            onClose();
            //eslint-disable-next-line
        } catch (err: any) { console.error("Error handleSubmit:", err); setSaveError(err.message || "Error."); }
        finally { setIsSaving(false); }
    };

    const isProductFieldsDisabled = esCombo;
    if (isEditMode && isLoadingData) { return (<div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex justify-center items-center"><div className="bg-white p-6 rounded-lg shadow-xl">Cargando...</div></div>); }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex justify-center items-start pt-10 md:pt-16 p-4 transition-opacity duration-300 ease-in-out overflow-y-auto">
            <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[calc(100vh-6rem)] md:max-h-[calc(100vh-8rem)] flex flex-col animate-fade-in-scale mb-10">
                <div className="flex-shrink-0 flex justify-between items-center p-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-800">{isEditMode ? `Editar: ${nombre || '...'}` : (esCombo ? 'Crear Nuevo Combo' : 'Crear Nuevo Producto')}</h2>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>
                <div className="p-5 overflow-y-auto flex-grow grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    <div className="space-y-4">
                        <div><label htmlFor="nombre" className="block text-sm font-medium mb-1">Nombre <span className="text-red-500">*</span></label><input type="text" id="nombre" name="nombre" value={nombre} onChange={handleInputChange} required className="w-full p-2 border rounded" /></div>
                        <div><label htmlFor="productCode" className="block text-sm font-medium mb-1">SKU / Código Interno</label><input type="text" id="productCode" name="productCode" value={productCode} onChange={handleInputChange} className={`w-full p-2 border rounded ${isEditMode || isProductFieldsDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} disabled={isEditMode || isProductFieldsDisabled} /></div>
                        <div><label htmlFor="descripcionProducto" className="block text-sm font-medium mb-1">Descripción General</label><textarea id="descripcionProducto" name="descripcionProducto" value={descripcionProducto} onChange={handleInputChange} rows={2} className={`w-full p-2 border rounded ${isProductFieldsDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} disabled={isProductFieldsDisabled} /></div>
                        <div><label htmlFor="unidadVenta" className="block text-sm font-medium mb-1">Unidad Venta</label><select id="unidadVenta" name="unidadVenta" value={unidadVenta} onChange={handleInputChange} className={`w-full p-2 border rounded bg-white ${isProductFieldsDisabled ? 'bg-gray-100 cursor-not-allowed appearance-none' : ''}`} disabled={isProductFieldsDisabled}><option value="">-- Seleccionar --</option> {unidadesDeVenta.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
                        <div><label htmlFor="costoReferenciaUsd" className="block text-sm font-medium mb-1">Costo Ref. USD</label><input type="text" inputMode='decimal' id="costoReferenciaUsd" name="costoReferenciaUsd" value={costoReferenciaUsd} onChange={handleInputChange} className={`w-full p-2 border rounded ${isProductFieldsDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} disabled={isProductFieldsDisabled} /></div>
                        <div><label htmlFor="margenProducto" className="block text-sm font-medium mb-1">Margen Producto (ej: 0.3)</label><input type="text" inputMode="decimal" id="margenProducto" name="margenProducto" value={margenProducto} onChange={handleInputChange} className={`w-full p-2 border rounded ${isProductFieldsDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} disabled={isProductFieldsDisabled} /></div>
                        <div><label htmlFor="tipoCalculo" className="block text-sm font-medium mb-1">Tipo Cálculo</label><input type="text" id="tipoCalculo" name="tipoCalculo" value={tipoCalculo} onChange={handleInputChange} className={`w-full p-2 border rounded ${isProductFieldsDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} disabled={isProductFieldsDisabled} /></div>
                        <div><label htmlFor="unidadReferencia" className="block text-sm font-medium mb-1">Unidad Ref. (Cálculo)</label><input type="text" inputMode="decimal" id="unidadReferencia" name="unidadReferencia" value={unidadReferencia} onChange={handleInputChange} className={`w-full p-2 border rounded ${isProductFieldsDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} disabled={isProductFieldsDisabled} /></div>
                        <div className="flex items-center gap-6 pt-3">
                            <div className="flex items-center"><input id="esReceta" name="esReceta" type="checkbox" checked={esReceta} onChange={handleInputChange} className={`h-4 w-4 text-indigo-600 rounded ${isProductFieldsDisabled ? 'cursor-not-allowed opacity-50' : ''}`} disabled={isProductFieldsDisabled} /><label htmlFor="esReceta" className={`ml-2 text-sm ${isProductFieldsDisabled ? 'text-gray-400' : ''}`}>Es Receta</label></div>
                            <div className="flex items-center"><input id="esCombo" name="esCombo" type="checkbox" checked={esCombo} onChange={handleInputChange} className="h-4 w-4 text-indigo-600 rounded" /><label htmlFor="esCombo" className="ml-2 text-sm">Es Combo</label></div>
                            <div className="flex items-center"><input id="ajustaPorTc" name="ajustaPorTc" type="checkbox" checked={ajustaPorTc} onChange={handleInputChange} className={`h-4 w-4 text-indigo-600 rounded ${isProductFieldsDisabled ? 'cursor-not-allowed opacity-50' : ''}`} disabled={isProductFieldsDisabled} /><label htmlFor="ajustaPorTc" className={`ml-2 text-sm ${isProductFieldsDisabled ? 'text-gray-400' : ''}`}>Ajusta por TC</label></div>
                        </div>
                    </div>
                    <div className="space-y-6">
                        {esReceta && !esCombo && (
                            <section className="space-y-3 p-3 border rounded-md bg-gray-50">
                                <h3 className="text-md font-semibold text-gray-700 border-b pb-2">Ingredientes de la Receta</h3>
                                <div className={`hidden md:grid md:grid-cols-[minmax(0,1fr)_100px_50px] gap-2 items-center px-1 text-xs font-medium text-gray-500`}><span>Ingrediente</span><span className="text-right">Porcentaje (%)</span><span/></div>
                                <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                                    {ingredients.map((item, index) => (<div key={item.id} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_100px_50px] gap-2 items-center border-b pb-1"><div><select name="ingrediente_id" value={item.ingrediente_id} onChange={(e) => handleIngredientChange(index, e)} required className={`w-full p-2 border rounded text-sm bg-white`}>{availableProducts.length === 0 ? <option value="" disabled>Cargando productos...</option> : <option value="" disabled>-- Seleccionar --</option>}{availableProducts.map(p => (<option key={p.id} value={p.id.toString()}>{p.nombre}</option>))}</select></div><div>
                                        {/* --- CAMBIO: Simplificación del input de porcentaje --- */}
                                        <input 
                                            type="text" 
                                            inputMode='decimal' 
                                            name="porcentaje" 
                                            value={item.porcentaje} 
                                            onChange={(e) => handleIngredientChange(index, e)} 
                                            required 
                                            placeholder="0.00"
                                            className={`w-full p-2 border rounded text-sm text-right`} 
                                        />
                                    </div><div className="flex justify-end md:justify-center">{(<button type="button" onClick={() => removeIngredientRow(index)} className={`text-xl p-1 text-red-500 hover:text-red-700`} title="Eliminar">×</button>)}</div></div>))}
                                    {ingredients.length === 0 && <p className="text-xs text-gray-500 text-center py-2">Añada ingredientes.</p>}
                                </div>
                                <button type="button" onClick={addIngredientRow} className={`mt-2 text-sm px-3 py-1.5 rounded font-medium bg-blue-50 text-blue-600 hover:bg-blue-100`}>+ Agregar Ingrediente</button>
                            </section>
                        )}
                        {esCombo && (
                            <section className="space-y-3 p-3 border rounded-md bg-lime-50">
                                <h3 className="text-md font-semibold text-gray-700 border-b pb-2">Definición del Combo</h3>
                                <div><label htmlFor="skuCombo" className="block text-sm font-medium mb-1">SKU Específico Combo (Opcional)</label><input type="text" id="skuCombo" name="skuCombo" value={skuCombo} onChange={handleInputChange} className="w-full p-2 border rounded" /></div>
                                <div><label htmlFor="descripcionCombo" className="block text-sm font-medium mb-1">Descripción Específica Combo (Opcional)</label><textarea id="descripcionCombo" name="descripcionCombo" value={descripcionCombo} onChange={handleInputChange} rows={2} className="w-full p-2 border rounded" /></div>
                                <div><label htmlFor="margenCombo" className="block text-sm font-medium mb-1">Margen Específico Combo (ej: 0.25) <span className="text-red-500">*</span></label><input type="text" inputMode='decimal' id="margenCombo" name="margenCombo" value={margenCombo} onChange={handleInputChange} required placeholder="0.00 - 0.99" className="w-full p-2 border rounded" /></div>
                                <h4 className="text-sm font-medium pt-2">Componentes del Combo</h4>
                                <div className={`hidden md:grid md:grid-cols-[minmax(0,1fr)_100px_50px] gap-2 items-center px-1 text-xs font-medium text-gray-500`}><span>Producto Componente</span><span className="text-right">Cantidad</span><span /></div>
                                <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                                    {comboComponents.map((item, index) => (<div key={item.id} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_100px_50px] gap-2 items-center border-b pb-1"><div><select name="producto_id" value={item.producto_id} onChange={(e) => handleComboComponentChange(index, e)} required className={`w-full p-2 border rounded text-sm bg-white`}>{availableProducts.length === 0 ? <option value="" disabled>Cargando productos...</option> :<option value="" disabled>-- Seleccionar --</option>}{availableProducts.map(p => (<option key={p.id} value={p.id.toString()}>{p.nombre}</option>))}</select></div><div><input type="number" inputMode='numeric' name="cantidad" value={item.cantidad.toString()} onChange={(e) => handleComboComponentChange(index, e)} required min="1" step="1" className={`w-full p-2 border rounded text-sm text-right`} /></div><div className="flex justify-end md:justify-center">{(<button type="button" onClick={() => removeComboComponentRow(index)} className={`text-xl p-1 text-red-500 hover:text-red-700`} title="Eliminar">×</button>)}</div></div>))}
                                    {comboComponents.length === 0 && <p className="text-xs text-gray-500 text-center py-2">Añada componentes.</p>}
                                </div>
                                <button type="button" onClick={addComboComponentRow} className={`mt-2 text-sm px-3 py-1.5 rounded font-medium bg-green-50 text-green-600 hover:bg-green-100`}>+ Agregar Componente</button>
                            </section>
                        )}
                        {!esReceta && !esCombo && (<p className="text-sm text-gray-500 text-center py-4">Marque Es Receta o Es Combo para definir.</p>)}
                    </div>
                </div>
                <div className="flex-shrink-0 flex justify-between items-center p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
                    {saveError && (<p className="text-sm text-red-600 flex-grow mr-2">{saveError}</p>)}
                    {!saveError && <span className="flex-grow" />}
                    <div className="flex gap-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm bg-white border rounded hover:bg-gray-50">Cancelar</button>
                        <button type="submit" disabled={isSaving || isLoadingData} className={`px-4 py-2 text-sm text-white rounded flex items-center ${(isSaving || isLoadingData) ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}>{isSaving ? 'Guardando...' : (isLoadingData ? 'Cargando...' : (isEditMode ? 'Guardar Cambios' : (esCombo ? 'Crear Combo' : 'Crear Producto')))}</button>
                    </div>
                </div>
            </form>
        </div>
    );
};
export default CreateProductModal;