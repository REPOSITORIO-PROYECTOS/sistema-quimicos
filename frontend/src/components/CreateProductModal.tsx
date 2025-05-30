// components/CreateProductModal.tsx
import React, { useState, useEffect, ChangeEvent, useCallback } from 'react';
import { useProductsContext } from '@/context/ProductsContext';

// --- Interfaces ---
interface IngredientItem {
    id: string; // uuid para React key
    ingrediente_id: string | number;
    porcentaje: number;
}

interface ComboComponentItem {
    id: string; // uuid para React key
    producto_id: string | number;
    cantidad: number | string; // string para el input, number para el payload
}

interface ProductOption { // Para seleccionar productos (ingredientes/componentes)
    id: string | number;
    nombre: string;
}

interface ProductDataForEditAPI {
    id: string | number;
    nombre: string;
    sku?: string | null;
    unidad_venta: string | null;
    costo_referencia_usd: number | null;
    es_receta: boolean;
    ajusta_por_tc: boolean;
    ref_calculo: number | null;
    margen: number | null; // Margen general del producto
    tipo_calculo: string | null;
    descripcion?: string | null; // Descripción general del producto

    // Campos para saber si es combo y obtener su ID si aplica
    es_combo?: boolean;
    combo_id?: number | null;
    // receta_id se puede obtener de un endpoint específico de receta si es_receta es true
}

interface RecipeItemForEditAPI {
    ingrediente_id: number | string;
    porcentaje: number;
}

interface ComboDataAPI { // Para /combos/obtener/<id>
    id: number;
    nombre: string; // El nombre del producto al que está asociado este combo
    sku_combo: string | null; // SKU específico del combo (puede ser diferente al SKU del producto)
    descripcion: string | null; // Descripción específica del combo
    margen_combo: number; // Margen específico para el cálculo del precio del combo
    activo: boolean;
    componentes: {
        producto_id: number | string;
        cantidad: number;
    }[];
}

interface CreateProductModalProps {
    onClose: () => void;
    onProductCreatedOrUpdated: () => void;
    productIdToEdit?: string | number | null;
}

const unidadesDeVenta = ["LT", "KG", "UNIDAD"];

const CreateProductModal: React.FC<CreateProductModalProps> = ({
    onClose,
    onProductCreatedOrUpdated,
    productIdToEdit
}) => {
    const isEditMode = !!productIdToEdit;
    const token = localStorage.getItem("token");

    // --- Estados del Formulario Principal (Producto) ---
    const [productCode, setProductCode] = useState(''); // SKU del producto / código interno
    const [nombre, setNombre] = useState('');
    const [descripcionProducto, setDescripcionProducto] = useState(''); // Descripción general del producto
    const [unidadVenta, setUnidadVenta] = useState('');
    const [costoReferenciaUsd, setCostoReferenciaUsd] = useState('');
    const [ajustaPorTc, setAjustaPorTc] = useState(false);
    const [unidadReferencia, setUnidadReferencia] = useState('');
    const [margenProducto, setMargenProducto] = useState(''); // Margen general del producto
    const [tipoCalculo, setTipoCalculo] = useState('');

    // --- Estados para Receta ---
    const [esReceta, setEsReceta] = useState(false);
    const [ingredients, setIngredients] = useState<IngredientItem[]>([]);
    const [recetaIdOriginal, setRecetaIdOriginal] = useState<number | null>(null);

    // --- Estados para Combo ---
    const [esCombo, setEsCombo] = useState(false);
    const [skuCombo, setSkuCombo] = useState(''); // SKU específico DEL COMBO
    const [descripcionCombo, setDescripcionCombo] = useState(''); // Descripción específica DEL COMBO
    const [margenCombo, setMargenCombo] = useState(''); // Margen específico DEL COMBO (0-1)
    const [comboComponents, setComboComponents] = useState<ComboComponentItem[]>([]);
    const [comboIdOriginal, setComboIdOriginal] = useState<number | null>(null); // ID del combo existente

    // --- Otros Estados ---
    const [availableProducts, setAvailableProducts] = useState<ProductOption[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [isLoadingData, setIsLoadingData] = useState(false);

    const { productos: productosDelContexto } = useProductsContext();

    useEffect(() => { // Cargar productos para selectores
        if (productosDelContexto && productosDelContexto.length > 0) {
            setAvailableProducts(
                productosDelContexto
                    .filter(p => p.id !== productIdToEdit)
                    .map(p => ({ id: p.id.toString(), nombre: p.nombre }))
            );
        } else {
            setAvailableProducts([]);
        }
    }, [productosDelContexto, productIdToEdit]);

    // --- Cargar datos para edición ---
    useEffect(() => {
        const fetchDetails = async () => {
            if (!isEditMode || !productIdToEdit) return;
            setIsLoadingData(true);
            setSaveError(null);
            try {
                // 1. Fetch datos del producto base
                const productRes = await fetch(`https://quimex.sistemataup.online/productos/obtener/${productIdToEdit}`, {
                    headers: { "Authorization": `Bearer ${token}` }
                });
                if (!productRes.ok) throw new Error(`Error ${productRes.status} obteniendo datos del producto.`);
                const productData: ProductDataForEditAPI = await productRes.json();

                // Poblar campos del producto base
                setProductCode(productData.sku || productData.id.toString());
                setNombre(productData.nombre || '');
                setDescripcionProducto(productData.descripcion || '');
                setUnidadVenta(productData.unidad_venta || '');
                setCostoReferenciaUsd(productData.costo_referencia_usd?.toString() || '');
                setAjustaPorTc(productData.ajusta_por_tc || false);
                setUnidadReferencia(productData.ref_calculo?.toString() || '');
                setMargenProducto(productData.margen?.toString() || ''); // Margen del producto
                setTipoCalculo((productData.tipo_calculo || '').toUpperCase());

                // 2. Manejar si es Receta
                setEsReceta(productData.es_receta || false);
                if (productData.es_receta) {
                    const recipeRes = await fetch(`https://quimex.sistemataup.online/recetas/obtener/por-producto/${productIdToEdit}`, {
                        headers: { "Authorization": `Bearer ${token}` }
                    });
                    if (recipeRes.ok) {
                        const recipeData: { id?: number, items: RecipeItemForEditAPI[] } = await recipeRes.json();
                        setRecetaIdOriginal(recipeData.id || null);
                        if (recipeData.items) {
                            setIngredients(recipeData.items.map(item => ({
                                id: crypto.randomUUID(),
                                ingrediente_id: item.ingrediente_id.toString(),
                                porcentaje: item.porcentaje,
                            })));
                        }
                    } else if (recipeRes.status !== 404) console.warn(`Error ${recipeRes.status} obteniendo receta.`);
                }

                // 3. Manejar si es Combo
                setEsCombo(productData.es_combo || false);
                if (productData.es_combo && productData.combo_id) { // combo_id debe venir de la API de producto
                    setComboIdOriginal(productData.combo_id);
                    const comboRes = await fetch(`https://quimex.sistemataup.online/combos/obtener/${productData.combo_id}`, {
                        headers: { "Authorization": `Bearer ${token}` }
                    });
                    if (comboRes.ok) {
                        const comboData: ComboDataAPI = await comboRes.json();
                        setSkuCombo(comboData.sku_combo || '');
                        setDescripcionCombo(comboData.descripcion || '');
                        setMargenCombo(comboData.margen_combo?.toString() || ''); // Margen específico del combo
                        if (comboData.componentes) {
                            setComboComponents(comboData.componentes.map(comp => ({
                                id: crypto.randomUUID(),
                                producto_id: comp.producto_id.toString(),
                                cantidad: comp.cantidad,
                            })));
                        }
                    } else if (comboRes.status !== 404) console.warn(`Error ${comboRes.status} obteniendo combo.`);
                }
                // eslint-disable-next-line
            } catch (err: any) {
                console.error("Error cargando datos para edición:", err);
                setSaveError(err.message || "Error al cargar datos.");
            } finally {
                setIsLoadingData(false);
            }
        };
        fetchDetails();
    }, [isEditMode, productIdToEdit, token]);

    // --- Manejadores para Receta (sin cambios) ---
    const addIngredientRow = useCallback(() => setIngredients(prev => [...prev, { id: crypto.randomUUID(), ingrediente_id: '', porcentaje: 0 }]), []);
    const removeIngredientRow = (index: number) => setIngredients(prev => prev.filter((_, i) => i !== index));
    const handleIngredientChange = (index: number, e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target; setSaveError(null);
        setIngredients(prev => prev.map((item, i) => i === index ? { ...item, [name]: name === 'porcentaje' ? (parseFloat(value.replace(/[^0-9.]/g, '')) || 0) : value } : item));
    };

    // --- Manejadores para Combo (sin cambios) ---
    const addComboComponentRow = useCallback(() => setComboComponents(prev => [...prev, { id: crypto.randomUUID(), producto_id: '', cantidad: 1 }]), []);
    const removeComboComponentRow = (index: number) => setComboComponents(prev => prev.filter((_, i) => i !== index));
    const handleComboComponentChange = (index: number, e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target; setSaveError(null);
        setComboComponents(prev => prev.map((item, i) => i === index ? { ...item, [name]: name === 'cantidad' ? (parseInt(value.replace(/[^0-9]/g, ''), 10) || 1) : value } : item));
    };

    // --- Manejador de Inputs Generales y Checkboxes ---
    const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        setSaveError(null);

        if (type === 'checkbox') {
            const { checked } = e.target as HTMLInputElement;
            if (name === 'esReceta') {
                setEsReceta(checked);
                if (checked && ingredients.length === 0) addIngredientRow();
                else if (!checked) setIngredients([]);
            }
            if (name === 'esCombo') {
                setEsCombo(checked);
                if (checked && comboComponents.length === 0) addComboComponentRow();
                else if (!checked) { setComboComponents([]); setSkuCombo(''); setDescripcionCombo(''); setMargenCombo(''); }
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
            // Para Combo
            else if (name === 'skuCombo') setSkuCombo(sanitizedValue.toUpperCase());
            else if (name === 'descripcionCombo') setDescripcionCombo(value);
            else if (name === 'margenCombo') setMargenCombo(sanitizedValue);
        }
    };

    useEffect(() => { // Inicializar filas si se marcan y están vacías (no en carga de edición)
        if (isEditMode && isLoadingData) return;
        if (esReceta && ingredients.length === 0) addIngredientRow();
        if (esCombo && comboComponents.length === 0) addComboComponentRow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [esReceta, esCombo, isLoadingData, isEditMode]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaveError(null);
        setIsSaving(true);

        if (!nombre.trim()) { setSaveError("El Nombre del producto es obligatorio."); setIsSaving(false); return; }
        // productCode (SKU) puede ser opcional o validado según tu lógica de negocio

        try {
            // 1. Crear o Actualizar el Producto Principal
            // eslint-disable-next-line
            const productPayload: any = {
                ...(isEditMode && productIdToEdit ? { id: productIdToEdit } : (productCode.trim() ? { id: productCode.trim() } : {})), // Enviar ID/código solo si tiene valor en creación. En edición, siempre el ID.
                id: productCode.trim() || null,
                nombre: nombre.trim(),
                descripcion: descripcionProducto.trim() || null,
                unidad_venta: unidadVenta || null,
                costo_referencia_usd: parseFloat(costoReferenciaUsd) || null,
                ajusta_por_tc: ajustaPorTc,
                ref_calculo: parseFloat(unidadReferencia) || null,
                margen: parseFloat(margenProducto) || null,
                tipo_calculo: (tipoCalculo.trim() || '').toUpperCase() || null,
                es_receta: esReceta,
                es_combo: esCombo, // Importante para que el backend sepa
                 // El backend debería actualizar combo_id si se crea/asocia un combo
            };
            // Si productCode es el ID y no es editable, en creación no se debería poder definir.
            // Asumo que si productCode está vacío en creación, el backend lo genera o usa SKU.

            const productApiUrl = isEditMode
                ? `https://quimex.sistemataup.online/productos/actualizar/${productIdToEdit}`
                : 'https://quimex.sistemataup.online/productos/crear';
            const productApiMethod = isEditMode ? 'PUT' : 'POST';

            const productResponse = await fetch(productApiUrl, {
                method: productApiMethod,
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify(productPayload),
            });
            const productResult = await productResponse.json();
            if (!productResponse.ok) {
                throw new Error(productResult.detalle || productResult.error || `Error ${isEditMode ? 'actualizando' : 'creando'} producto`);
            }
            const effectiveProductId = productResult.id || productIdToEdit; // ID del producto creado/actualizado

            // 2. Manejar Receta si aplica
            if (esReceta && effectiveProductId) {
                if (ingredients.some(item => !item.ingrediente_id || parseFloat(item.porcentaje.toString()) <= 0)) {
                    throw new Error("En recetas, todos los ingredientes deben tener producto y porcentaje > 0.");
                }
                const recipePayload = {
                    producto_final_id: effectiveProductId,
                    items: ingredients.map(item => ({
                        ingrediente_id: Number(item.ingrediente_id),
                        porcentaje: parseFloat(item.porcentaje.toString())
                    }))
                };
                // En edición, el endpoint de receta podría ser un PUT a /recetas/producto/{producto_id}
                const recipeApiUrl = (isEditMode && recetaIdOriginal) // recetaIdOriginal debe venir de la carga
                    ? `https://quimex.sistemataup.online/recetas/actualizar/por-producto/${effectiveProductId}` // o por receta_id si lo tienes
                    : 'https://quimex.sistemataup.online/recetas/crear';
                const recipeApiMethod = (isEditMode && recetaIdOriginal) ? 'PUT' : 'POST';

                const recipeResponse = await fetch(recipeApiUrl, {
                    method: recipeApiMethod,
                    headers: { 'Content-Type': 'application/json', "Authorization": `Bearer ${token}` },
                    body: JSON.stringify(recipePayload),
                });
                const recipeResult = await recipeResponse.json();
                if (!recipeResponse.ok) throw new Error(recipeResult.detalle || recipeResult.error || `Error con la receta`);
            
            } else if (!esReceta && isEditMode && recetaIdOriginal) { // Si dejó de ser receta
                 console.log("Producto ya no es receta. ID receta a eliminar/desactivar (si aplica):", recetaIdOriginal);
                 // Lógica para eliminar/desvincular la receta si es necesario
                 // await fetch(`https://quimex.sistemataup.online/recetas/eliminar/${recetaIdOriginal}`, { method: 'DELETE', ... });
            }

            // 3. Manejar Combo si aplica
            if (esCombo && effectiveProductId) {
                const margenComboNum = parseFloat(margenCombo);
                if (isNaN(margenComboNum) || margenComboNum < 0 || margenComboNum >= 1) {
                    throw new Error("El Margen del Combo es requerido y debe ser un número entre 0 (inclusive) y 1 (exclusive).");
                }
                if (comboComponents.length === 0 || comboComponents.some(c => !c.producto_id || parseInt(c.cantidad.toString()) <= 0)) {
                    throw new Error("En combos, todos los componentes deben tener producto y cantidad > 0.");
                }

                // El `nombre` del combo es el mismo que el del producto. La API de combo lo toma de `data.get('nombre')`.
                // `id_producto_asociado` o similar podría ser necesario si la API de combo no usa el nombre para vincular.
                // Asumimos que el `effectiveProductId` (del producto) se usa para asociar el combo si es necesario,
                // o que la API de combo puede recibir el `nombre` del producto.
                // Por el endpoint `/combos/crear`, parece que el combo es una entidad separada
                // que se referencia desde el producto (a través de `producto.es_combo` y `producto.combo_id`).
                const comboPayload = {
                    nombre: nombre.trim(), // Nombre del producto que actúa como combo
                    sku_combo: skuCombo.trim() || null,
                    descripcion: descripcionCombo.trim() || null,
                    margen_combo: margenComboNum,
                    activo: true, // O tomar de un estado si tienes checkbox "Activo Combo"
                    componentes: comboComponents.map(c => ({
                        producto_id: Number(c.producto_id),
                        cantidad: parseInt(c.cantidad.toString(), 10)
                    })),
                    // Si la API de combo necesita el ID del producto al que se asocia:
                    // producto_principal_id: effectiveProductId 
                };

                const comboApiUrl = (isEditMode && comboIdOriginal)
                    ? `https://quimex.sistemataup.online/combos/editar/${comboIdOriginal}`
                    : 'https://quimex.sistemataup.online/combos/crear';
                const comboApiMethod = (isEditMode && comboIdOriginal) ? 'PUT' : 'POST';
                
                const comboResponse = await fetch(comboApiUrl, {
                    method: comboApiMethod,
                    headers: { 'Content-Type': 'application/json', "Authorization": `Bearer ${token}` },
                    body: JSON.stringify(comboPayload),
                });
                const comboResult = await comboResponse.json();
                if (!comboResponse.ok) throw new Error(comboResult.error || `Error con el combo`);
                
                // Importante: Si se crea un combo nuevo (POST), la API de combo debería devolver el ID del combo.
                // Ese ID de combo (comboResult.id) debería luego actualizarse en el registro del Producto Principal (campo producto.combo_id).
                // Esto es crucial para que en la próxima edición se cargue correctamente.
                // Si tu API de /productos/actualizar permite actualizar solo `combo_id`, podrías hacer otra llamada aquí.
                if (comboApiMethod === 'POST' && comboResult.id && effectiveProductId) {
                    await fetch(`https://quimex.sistemataup.online/productos/actualizar/${effectiveProductId}`, {
                        method: 'PUT',
                        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                        body: JSON.stringify({ combo_id: comboResult.id, es_combo: true }), // Asegurar que el producto se marca como combo
                    });
                }

            } else if (!esCombo && isEditMode && comboIdOriginal) { // Si dejó de ser combo
                console.log("Producto ya no es combo. ID combo a desactivar:", comboIdOriginal);
                 await fetch(`https://quimex.sistemataup.online/combos/editar/${comboIdOriginal}`, {
                     method: 'PUT',
                     headers: { 'Content-Type': 'application/json', "Authorization": `Bearer ${token}` },
                     body: JSON.stringify({ activo: false }), // Desactivar el combo
                 });
                 // También actualizar el producto para que es_combo = false y combo_id = null
                 await fetch(`https://quimex.sistemataup.online/productos/actualizar/${productIdToEdit}`, {
                    method: 'PUT',
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                    body: JSON.stringify({ es_combo: false, combo_id: null }),
                });
            }

            alert(`Producto "${nombre}" ${isEditMode ? 'actualizado' : 'creado'} exitosamente.`);
            onProductCreatedOrUpdated();
            onClose();
            // eslint-disable-next-line
        } catch (err: any) {
            console.error("Error en handleSubmit:", err);
            setSaveError(err.message || "Error inesperado.");
        } finally {
            setIsSaving(false);
        }
    };


    // --- Renderizado del Modal ---
    if (isEditMode && isLoadingData) { /* ... loading UI ... */ }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex justify-center items-start pt-10 md:pt-16 p-4 transition-opacity duration-300 ease-in-out overflow-y-auto">
            <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[calc(100vh-6rem)] md:max-h-[calc(100vh-8rem)] flex flex-col animate-fade-in-scale mb-10">
                {/* Header */}
                <div className="flex-shrink-0 flex justify-between items-center p-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-800">
                        {isEditMode ? `Editar Producto: ${nombre || 'Cargando...'}` : 'Crear Nuevo Producto'}
                    </h2>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"> {/* Close Icon */} </button>
                </div>

                {/* Content Body */}
                <div className="p-5 overflow-y-auto flex-grow grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    {/* Columna 1: Datos del Producto y Checkboxes */}
                    <div className="space-y-4">
                        {/* --- CAMPOS DEL PRODUCTO PRINCIPAL --- */}
                        <div>
                            <label htmlFor="productCode" className="block text-sm font-medium mb-1">SKU / Código Interno</label>
                            <input type="text" id="productCode" name="productCode" value={productCode} onChange={handleInputChange} 
                                className={`w-full p-2 border rounded ${isEditMode ? 'bg-gray-100 cursor-not-allowed' : ''}`} 
                                disabled={isEditMode} // SKU usualmente no se edita. Si es ID principal, puede ser editable en creación.
                            />
                        </div>
                        <div>
                            <label htmlFor="nombre" className="block text-sm font-medium mb-1">Nombre <span className="text-red-500">*</span></label>
                            <input type="text" id="nombre" name="nombre" value={nombre} onChange={handleInputChange} required className="w-full p-2 border rounded" />
                        </div>
                        <div>
                            <label htmlFor="descripcionProducto" className="block text-sm font-medium mb-1">Descripción General Producto</label>
                            <textarea id="descripcionProducto" name="descripcionProducto" value={descripcionProducto} onChange={handleInputChange} rows={2} className="w-full p-2 border rounded" />
                        </div>
                        <div>
                            <label htmlFor="unidadVenta" className="block text-sm font-medium mb-1">Unidad Venta</label>
                            <select id="unidadVenta" name="unidadVenta" value={unidadVenta} onChange={handleInputChange} className="w-full p-2 border rounded bg-white">
                                <option value="">-- Seleccionar --</option>
                                {unidadesDeVenta.map(unidad => (<option key={unidad} value={unidad}>{unidad}</option>))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="costoReferenciaUsd" className="block text-sm font-medium mb-1">Costo Referencia USD</label>
                            <input type="text" inputMode='decimal' id="costoReferenciaUsd" name="costoReferenciaUsd" value={costoReferenciaUsd} onChange={handleInputChange} className="w-full p-2 border rounded" />
                        </div>
                        <div>
                            <label htmlFor="margenProducto" className="block text-sm font-medium mb-1">Margen General Producto (ej: 0.3)</label>
                            <input type="text" inputMode="decimal" id="margenProducto" name="margenProducto" value={margenProducto} onChange={handleInputChange} className="w-full p-2 border rounded" />
                        </div>
                        <div>
                            <label htmlFor="tipoCalculo" className="block text-sm font-medium mb-1">Tipo Cálculo</label>
                            <input type="text" id="tipoCalculo" name="tipoCalculo" value={tipoCalculo} onChange={handleInputChange} className="w-full p-2 border rounded" />
                        </div>
                         <div>
                            <label htmlFor="unidadReferencia" className="block text-sm font-medium mb-1">Unidad Referencia (Cálculo)</label>
                            <input type="text" inputMode="decimal" id="unidadReferencia" name="unidadReferencia" value={unidadReferencia} onChange={handleInputChange} className="w-full p-2 border rounded" />
                        </div>
                        <div className="flex items-center gap-6 pt-3">
                            <div className="flex items-center">
                                <input id="esReceta" name="esReceta" type="checkbox" checked={esReceta} onChange={handleInputChange} className="h-4 w-4 text-indigo-600 rounded" />
                                <label htmlFor="esReceta" className="ml-2 text-sm">Es Receta</label>
                            </div>
                            <div className="flex items-center">
                                <input id="esCombo" name="esCombo" type="checkbox" checked={esCombo} onChange={handleInputChange} className="h-4 w-4 text-indigo-600 rounded" />
                                <label htmlFor="esCombo" className="ml-2 text-sm">Es Combo</label>
                            </div>
                            <div className="flex items-center">
                                <input id="ajustaPorTc" name="ajustaPorTc" type="checkbox" checked={ajustaPorTc} onChange={handleInputChange} className="h-4 w-4 text-indigo-600 rounded" />
                                <label htmlFor="ajustaPorTc" className="ml-2 text-sm">Ajusta por TC</label>
                            </div>
                        </div>
                    </div>

                    {/* Columna 2: Secciones de Receta y Combo (pueden estar ambas activas) */}
                    <div className="space-y-6"> {/* Aumentar espacio si ambas secciones están activas */}
                        {/* Sección Receta */}
                        {esReceta && (
                            <section className="space-y-3 p-3 border rounded-md bg-gray-50">
                                <h3 className="text-md font-semibold text-gray-700 border-b pb-2">Ingredientes de la Receta</h3>
                                <div className={`hidden md:grid md:grid-cols-[minmax(0,1fr)_100px_50px] gap-2 items-center px-1 text-xs font-medium text-gray-500`}> <span>Ingrediente</span> <span className="text-right">Porcentaje (%)</span> <span></span> </div>
                                <div className="space-y-2 max-h-48 overflow-y-auto pr-2"> {/* max-h para scroll si hay muchos */}
                                    {ingredients.map((item, index) => (
                                        <div key={item.id} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_100px_50px] gap-2 items-center border-b pb-1">
                                            <div> <select name="ingrediente_id" value={item.ingrediente_id} onChange={(e) => handleIngredientChange(index, e)} required className={`w-full p-2 border rounded text-sm border-gray-300 bg-white`}> <option value="" disabled>-- Seleccionar --</option> {availableProducts.map(p => (<option key={p.id} value={p.id.toString()}>{p.nombre}</option>))} </select> </div>
                                            <div> <input type="text" inputMode='decimal' name="porcentaje" value={item.porcentaje === 0 && !isEditMode ? '' : item.porcentaje.toString()} onChange={(e) => handleIngredientChange(index, e)} required min="0.01" step="0.01" className={`w-full p-2 border rounded text-sm text-right border-gray-300`} /> </div>
                                            <div className="flex justify-end md:justify-center"> {(ingredients.length > 0) && (<button type="button" onClick={() => removeIngredientRow(index)} className={`text-xl p-1 text-red-500 hover:text-red-700`} title="Eliminar"> × </button>)} </div>
                                        </div>))}
                                    {ingredients.length === 0 && <p className="text-xs text-gray-500 text-center py-2">Añada ingredientes para la receta.</p>}
                                </div>
                                <button type="button" onClick={addIngredientRow} className={`mt-2 text-sm px-3 py-1.5 rounded font-medium bg-blue-50 text-blue-600 hover:bg-blue-100`}>+ Agregar Ingrediente</button>
                            </section>
                        )}

                        {/* Sección Combo */}
                        {esCombo && (
                            <section className="space-y-3 p-3 border rounded-md bg-gray-50">
                                <h3 className="text-md font-semibold text-gray-700 border-b pb-2">Definición del Combo</h3>
                                <div>
                                    <label htmlFor="skuCombo" className="block text-sm font-medium mb-1">SKU Específico del Combo (Opcional)</label>
                                    <input type="text" id="skuCombo" name="skuCombo" value={skuCombo} onChange={handleInputChange} className="w-full p-2 border rounded" />
                                </div>
                                <div>
                                    <label htmlFor="descripcionCombo" className="block text-sm font-medium mb-1">Descripción Específica del Combo (Opcional)</label>
                                    <textarea id="descripcionCombo" name="descripcionCombo" value={descripcionCombo} onChange={handleInputChange} rows={2} className="w-full p-2 border rounded" />
                                </div>
                                <div>
                                    <label htmlFor="margenCombo" className="block text-sm font-medium mb-1">Margen Específico del Combo (ej: 0.25 para 25%) <span className="text-red-500">*</span></label>
                                    <input type="text" inputMode='decimal' id="margenCombo" name="margenCombo" value={margenCombo} onChange={handleInputChange} required placeholder="0.00 - 0.99" className="w-full p-2 border rounded" />
                                </div>

                                <h4 className="text-sm font-medium pt-2">Componentes del Combo</h4>
                                <div className={`hidden md:grid md:grid-cols-[minmax(0,1fr)_100px_50px] gap-2 items-center px-1 text-xs font-medium text-gray-500`}> <span>Producto Componente</span> <span className="text-right">Cantidad</span> <span></span> </div>
                                <div className="space-y-2 max-h-48 overflow-y-auto pr-2"> {/* max-h para scroll */}
                                    {comboComponents.map((item, index) => (
                                        <div key={item.id} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_100px_50px] gap-2 items-center border-b pb-1">
                                            <div>
                                                <select name="producto_id" value={item.producto_id} onChange={(e) => handleComboComponentChange(index, e)} required className={`w-full p-2 border rounded text-sm border-gray-300 bg-white`}>
                                                    <option value="" disabled>-- Seleccionar Producto --</option>
                                                    {availableProducts.map(p => (<option key={p.id} value={p.id.toString()}>{p.nombre}</option>))}
                                                </select>
                                            </div>
                                            <div><input type="number" inputMode='numeric' name="cantidad" value={item.cantidad.toString()} onChange={(e) => handleComboComponentChange(index, e)} required min="1" step="1" className={`w-full p-2 border rounded text-sm text-right border-gray-300`} /></div>
                                            <div className="flex justify-end md:justify-center">{(comboComponents.length > 0) && (<button type="button" onClick={() => removeComboComponentRow(index)} className={`text-xl p-1 text-red-500 hover:text-red-700`} title="Eliminar Componente"> × </button>)}</div>
                                        </div>
                                    ))}
                                     {comboComponents.length === 0 && <p className="text-xs text-gray-500 text-center py-2">Añada componentes para el combo.</p>}
                                </div>
                                <button type="button" onClick={addComboComponentRow} className={`mt-2 text-sm px-3 py-1.5 rounded font-medium bg-green-50 text-green-600 hover:bg-green-100`}>+ Agregar Componente</button>
                            </section>
                        )}
                        {/* Mensaje si no es ni receta ni combo */}
                        {!esReceta && !esCombo && (
                             <p className="text-sm text-gray-500 text-center py-4">
                                Marque Es Receta o Es Combo para definir sus componentes.
                            </p>
                        )}
                    </div>
                </div>

                {/* Footer con Botones y Errores */}
                <div className="flex-shrink-0 flex justify-between items-center p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
                    {saveError && (<p className="text-sm text-red-600 flex-grow mr-2">{saveError}</p>)}
                    {!saveError && <span className="flex-grow" />}
                    <div className="flex gap-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm bg-white border rounded hover:bg-gray-50"> Cancelar </button>
                        <button type="submit" disabled={isSaving || isLoadingData} className={`px-4 py-2 text-sm text-white rounded flex items-center ${(isSaving || isLoadingData) ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                            {isSaving ? 'Guardando...' : (isLoadingData ? 'Cargando...' : (isEditMode ? 'Guardar Cambios' : 'Crear Producto'))}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
};

export default CreateProductModal;