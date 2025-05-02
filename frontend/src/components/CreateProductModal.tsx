// components/CreateProductModal.tsx
import React, { useState, useEffect, ChangeEvent } from 'react';

// --- Interfaces ---
interface IngredientItem {
    id: string;
    ingrediente_id: string | number;
    porcentaje: number;
}

interface IngredientOption {
    id: string | number;
    nombre: string;
}

interface CreateProductModalProps {
    onClose: () => void;
    onProductCreated: () => void;
}

// --- Lista Estática de Ingredientes (Reemplazar con API) ---
const staticAvailableIngredients: IngredientOption[] = [
    { id: 101, nombre: 'Materia Prima A' },
    { id: 102, nombre: 'Materia Prima B' },
    { id: 103, nombre: 'Materia Prima C' },
    { id: 'XYZ-9', nombre: 'Componente Especial XYZ' },
    { id: 205, nombre: 'Aditivo Z' },
];

// --- Unidades de Venta ---
const unidadesDeVenta = ["LT", "KG", "UNIDAD"];

// --- Componente Modal ---
const CreateProductModal: React.FC<CreateProductModalProps> = ({ onClose, onProductCreated }) => {
    // --- Estados del Formulario ---
    const [productId, setProductId] = useState('');
    const [nombre, setNombre] = useState('');
    const [unidadVenta, setUnidadVenta] = useState('');
    const [costoReferenciaUsd, setCostoReferenciaUsd] = useState(''); // Siempre presente
    const [esReceta, setEsReceta] = useState(false);
    const [ajustaPorTc, setAjustaPorTc] = useState(false);

    const [ingredients, setIngredients] = useState<IngredientItem[]>([]);
    const [availableIngredients, setAvailableIngredients] = useState<IngredientOption[]>([]);

    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    // --- Cargar Ingredientes Disponibles ---
    useEffect(() => {
        setAvailableIngredients(staticAvailableIngredients);
        // TODO: Fetch real de ingredientes aquí
    }, []);

    // --- Efecto para manejar ingredientes al cambiar esReceta ---
    useEffect(() => {
        if (esReceta && ingredients.length === 0) {
            addIngredientRow();
        } else if (!esReceta) {
            setIngredients([]);
        }
         // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [esReceta]); // Añadir addIngredientRow a dependencias si se define fuera

    // --- Handlers Inputs Producto ---
    const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        setSaveError(null);

        if (type === 'checkbox') {
            const { checked } = e.target as HTMLInputElement;
            if (name === 'esReceta') setEsReceta(checked);
            if (name === 'ajustaPorTc') setAjustaPorTc(checked);
        } else {
            const isNumericField = name === 'costoReferenciaUsd';
            const sanitizedValue = isNumericField
                ? value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
                : value;

            if (name === 'productId') setProductId(value);
            if (name === 'nombre') setNombre(sanitizedValue);
            if (name === 'unidadVenta') setUnidadVenta(sanitizedValue);
            if (name === 'costoReferenciaUsd') setCostoReferenciaUsd(sanitizedValue);
        }
    };

    // --- Handlers Ingredientes ---
    const handleIngredientChange = (index: number, e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        const list = [...ingredients];
        setSaveError(null);
        if (name === 'ingrediente_id') { list[index].ingrediente_id = value; }
        else if (name === 'porcentaje') {
            const sanitizedValue = value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
            const numValue = parseFloat(sanitizedValue);
            list[index].porcentaje = isNaN(numValue) || numValue < 0 ? 0 : numValue;
        }
        setIngredients(list);
    };
    const addIngredientRow = () => { setIngredients([ ...ingredients, { id: crypto.randomUUID(), ingrediente_id: '', porcentaje: 0 } ]); };
    const removeIngredientRow = (index: number) => { const list = [...ingredients]; list.splice(index, 1); setIngredients(list); };

    // --- Handler Submit ---
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaveError(null);

        // --- Validaciones Cliente ---
        if (!productId || !nombre) { setSaveError("El ID (Código Interno) y el Nombre son obligatorios."); return; }

        let costoNum: number | null = null;
        if (costoReferenciaUsd) {
             costoNum = parseFloat(costoReferenciaUsd);
             if (isNaN(costoNum) || costoNum < 0) { setSaveError("El Costo USD debe ser un número positivo."); return; }
        }

        let recetaValida = true;
        if (esReceta) {
             if (ingredients.length === 0) {
                setSaveError("Si es una receta, debe añadir al menos un ingrediente.");
                recetaValida = false;
            } else if (ingredients.some(item => !item.ingrediente_id || item.porcentaje <= 0)) {
                 setSaveError("Todos los ingredientes deben tener producto y porcentaje > 0.");
                 recetaValida = false;
            }
        }
        if (!recetaValida) return;

        setIsSaving(true);

        // --- API Call 1: Crear Producto ---
        //eslint-disable-next-line
        const productPayload: any = {
            id: productId,
            nombre,
            unidad_venta: unidadVenta || null,
            es_receta: esReceta,
            ajusta_por_tc: ajustaPorTc,
            costo_referencia_usd: costoNum,
        };

        console.log("Enviando Payload Producto:", JSON.stringify(productPayload, null, 2));

        try {
            const productResponse = await fetch('https://sistemataup.online/productos/crear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(productPayload), });
            const productResultText = await productResponse.text();
            console.log("Respuesta Producto:", productResultText);

            if (!productResponse.ok) {
                 let errorMsg = `Error ${productResponse.status} creando producto`;
                 try { const errorJson = JSON.parse(productResultText); errorMsg += `: ${errorJson.error || 'Detalle desconocido'}`; }
                 catch (parseError) { errorMsg += `${parseError}: ${productResultText}`; }
                 throw new Error(errorMsg);
            }

            const createdProduct = JSON.parse(productResultText);
            const effectiveProductId = createdProduct.id || productId; // Usar ID devuelto si existe

            console.log("Producto creado con ID efectivo:", effectiveProductId);

            // --- API Call 2: Crear Receta (si aplica) ---
            if (esReceta) {
                const recipePayload = {
                    producto_final_id: effectiveProductId,
                    items: ingredients.map(item => ({ ingrediente_id: item.ingrediente_id, porcentaje: item.porcentaje }))
                };
                console.log("Enviando Payload Receta:", JSON.stringify(recipePayload, null, 2));
                const recipeResponse = await fetch('https://sistemataup.online/recetas/crear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(recipePayload), });
                const recipeResultText = await recipeResponse.text();
                console.log("Respuesta Receta:", recipeResultText);
                if (!recipeResponse.ok) {
                     let errorMsg = `Producto creado (ID: ${effectiveProductId}), pero Error ${recipeResponse.status} creando receta`;
                     try { const errorJson = JSON.parse(recipeResultText); errorMsg += `: ${errorJson.error || 'Detalle desconocido'}`; }
                     catch (parseError) { errorMsg += `${parseError}: ${recipeResultText}`; }
                     throw new Error(errorMsg);
                }
                console.log("Receta creada para producto ID:", effectiveProductId);
            }

            alert(`Producto "${nombre}" ${esReceta ? 'con receta ' : ''}creado exitosamente.`);
            onProductCreated();
            onClose();

        } //eslint-disable-next-line
        catch (err: any) { console.error("Error en handleSubmit:", err); setSaveError(err.message || "Error inesperado."); }
        finally { setIsSaving(false); }
    };


    // --- Renderizado del Modal ---
    return (
        // Overlay con ajuste para header
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex justify-center items-start pt-16 md:pt-20 p-4 transition-opacity duration-300 ease-in-out overflow-y-auto">
            {/* Contenedor del Modal */}
            <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[calc(100vh-8rem)] md:max-h-[calc(100vh-10rem)] flex flex-col animate-fade-in-scale mb-10">
                {/* Cabecera */}
                <div className="flex-shrink-0 flex justify-between items-center p-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-800">Crear Nuevo Producto</h2>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}> <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /> </svg>
                    </button>
                </div>

                {/* Cuerpo del Modal (Scroll) */}
                <div className="p-5 overflow-y-auto flex-grow grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Columna 1: Datos Principales */}
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="productId" className="block text-sm font-medium mb-1">ID (Código Interno) <span className="text-red-500">*</span></label>
                            <input type="text" id="productId" name="productId" value={productId} onChange={handleInputChange} required className="w-full p-2 border rounded" />
                        </div>
                        <div>
                            <label htmlFor="nombre" className="block text-sm font-medium mb-1">Nombre <span className="text-red-500">*</span></label>
                            <input type="text" id="nombre" name="nombre" value={nombre} onChange={handleInputChange} required className="w-full p-2 border rounded" />
                        </div>
                        <div>
                            <label htmlFor="unidadVenta" className="block text-sm font-medium mb-1">Unidad Venta</label>
                             <select id="unidadVenta" name="unidadVenta" value={unidadVenta} onChange={handleInputChange} className="w-full p-2 border rounded bg-white">
                                <option value="">-- Seleccionar --</option>
                                {unidadesDeVenta.map(unidad => ( <option key={unidad} value={unidad}>{unidad}</option> ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="costoReferenciaUsd" className="block text-sm font-medium mb-1">Costo Referencia USD</label>
                            <input type="text" inputMode='decimal' id="costoReferenciaUsd" name="costoReferenciaUsd" value={costoReferenciaUsd} onChange={handleInputChange} className="w-full p-2 border rounded" placeholder="Ej: 15.75" />
                        </div>
                         {/* Checkboxes */}
                         <div className="flex items-center gap-6 pt-3">
                            <div className="flex items-center"> <input id="esReceta" name="esReceta" type="checkbox" checked={esReceta} onChange={handleInputChange} className="h-4 w-4 text-indigo-600 rounded" /> <label htmlFor="esReceta" className="ml-2 text-sm">Es Receta</label> </div>
                             <div className="flex items-center"> <input id="ajustaPorTc" name="ajustaPorTc" type="checkbox" checked={ajustaPorTc} onChange={handleInputChange} className="h-4 w-4 text-indigo-600 rounded" /> <label htmlFor="ajustaPorTc" className="ml-2 text-sm">Ajusta por TC</label> </div>
                        </div>
                    </div>

                    {/* Columna 2: Receta (Condicional) */}
                    <div className={`space-y-3 transition-opacity duration-300 ${!esReceta ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                        <h3 className="text-md font-medium border-b pb-1 mb-3">Ingredientes de la Receta</h3>
                         <div className={`hidden md:grid md:grid-cols-[minmax(0,1fr)_100px_50px] gap-2 items-center px-1 text-xs font-medium ${!esReceta ? 'text-gray-400' : 'text-gray-500'}`}> <span>Ingrediente</span> <span className="text-right">Porcentaje (%)</span> <span></span> </div>
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                             {ingredients.map((item, index) => (
                                <div key={item.id} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_100px_50px] gap-2 items-center border rounded p-2 md:p-1 md:border-none">
                                    <div> <label className="md:hidden text-xs">Ingrediente</label> <select name="ingrediente_id" value={item.ingrediente_id} onChange={(e) => handleIngredientChange(index, e)} required={esReceta} disabled={!esReceta} className={`w-full p-2 border rounded text-sm ${!esReceta ? 'bg-gray-100' : 'border-gray-300 bg-white'}`}> <option value="" disabled>-- Seleccionar --</option> {availableIngredients.map(ing => (<option key={ing.id} value={ing.id}>{ing.nombre}</option>))} </select> </div>
                                    <div> <label className="md:hidden text-xs">Porcentaje (%)</label> <input type="text" inputMode='decimal' name="porcentaje" value={item.porcentaje === 0 ? '' : item.porcentaje.toString()} onChange={(e) => handleIngredientChange(index, e)} required={esReceta} disabled={!esReceta} min="0.01" step="0.01" placeholder="%" className={`w-full p-2 border rounded text-sm text-right ${!esReceta ? 'bg-gray-100' : 'border-gray-300'}`} /> </div>
                                     <div className="flex justify-end md:justify-center items-center pt-2 md:pt-0"> <button type="button" onClick={() => removeIngredientRow(index)} disabled={!esReceta} className={`text-xl p-1 ${!esReceta ? 'text-gray-400' : 'text-red-500 hover:text-red-700'}`} title="Eliminar"> × </button> </div>
                                </div> ))}
                        </div>
                        <button type="button" onClick={addIngredientRow} disabled={!esReceta} className={`mt-2 text-sm px-3 py-1.5 rounded font-medium ${!esReceta ? 'bg-gray-200 text-gray-500' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}> + Agregar Ingrediente </button>
                    </div>
                </div>

                {/* Pie del Modal */}
                <div className="flex-shrink-0 flex justify-between items-center p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
                    {saveError && ( <p className="text-sm text-red-600">{saveError}</p> )}
                    {!saveError && <span />}
                    <div className="flex gap-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm bg-white border rounded hover:bg-gray-50"> Cancelar </button>
                        <button type="submit" disabled={isSaving} className={`px-4 py-2 text-sm text-white rounded flex items-center ${ isSaving ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700' }`}>
                            {isSaving && <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"> <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle> <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" className="opacity-75"></path> </svg>}
                            {isSaving ? 'Guardando...' : 'Crear Producto'}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
};

export default CreateProductModal;