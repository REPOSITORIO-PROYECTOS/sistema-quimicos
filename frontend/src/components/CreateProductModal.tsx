// components/CreateProductModal.tsx
import React, { useState, useEffect, ChangeEvent, useCallback } from 'react';
import { useProductsContext, Producto as ContextProducto } from '@/context/ProductsContext';

// --- Interfaces (pueden necesitar ajustes para datos de la API) ---
interface IngredientItem {
    id: string;
    ingrediente_id: string | number;
    porcentaje: number;
    // Podrías añadir campos que vengan de la receta guardada, si los hay
    // como 'nombre_ingrediente' para mostrarlo si el ID ya no está en availableIngredients
}

interface IngredientOption {
    id: string | number;
    nombre: string;
}

// Interfaz para los datos del producto que se obtienen para editar
interface ProductDataForEdit {
    id: string; // El ID del producto que se está editando
    nombre: string;
    unidad_venta: string | null;
    costo_referencia_usd: number | null;
    es_receta: boolean;
    ajusta_por_tc: boolean;
    ref_calculo: number | null;
    margen: number | null;
    tipo_calculo: string | null;
    receta_id: number;
    // Asegúrate que estos campos coincidan con lo que devuelve tu API /productos/obtener_uno/{id}
}

// Interfaz para los items de la receta que se obtienen para editar
interface RecipeItemForEdit {
    ingrediente_id: number; // O string, según tu API
    porcentaje: number;
    // nombre_ingrediente?: string; // Opcional, si tu API lo devuelve
}


interface CreateProductModalProps {
    onClose: () => void;
    onProductCreatedOrUpdated: () => void; // Cambiado para reflejar ambos modos
    productIdToEdit?: string | number | null; // ID del producto a editar (opcional)
}

const unidadesDeVenta = ["LT", "KG", "UNIDAD"];

const CreateProductModal: React.FC<CreateProductModalProps> = ({
    onClose,
    onProductCreatedOrUpdated,
    productIdToEdit
}) => {
    const isEditMode = !!productIdToEdit;

    // --- Estados del Formulario ---
    const [productCode, setProductCode] = useState(''); // ID/Código interno del producto
    const [nombre, setNombre] = useState('');
    const [unidadVenta, setUnidadVenta] = useState('');
    const [costoReferenciaUsd, setCostoReferenciaUsd] = useState('');
    const [esReceta, setEsReceta] = useState(false);
    const [ajustaPorTc, setAjustaPorTc] = useState(false);
    const [unidadReferencia, setUnidadReferencia] = useState('');
    const [margen, setMargen] = useState('');
    const [tipoCalculo, setTipoCalculo] = useState('');
    const token = localStorage.getItem("token");
    const [ingredients, setIngredients] = useState<IngredientItem[]>([]);
    const [availableIngredients, setAvailableIngredients] = useState<IngredientOption[]>([]);

    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [isLoadingData, setIsLoadingData] = useState(false); // Para cargar datos en modo edición

    const {
        productos: productosDelContexto,
        loading: loadingProductosContext,
        error: errorProductosContext
    } = useProductsContext();

    // --- Lógica para cargar datos en modo edición ---
    useEffect(() => {
        const fetchProductAndRecipeData = async () => {
            if (!isEditMode || !productIdToEdit) return;

            setIsLoadingData(true);
            setSaveError(null);
            try {
                // 1. Fetch datos del producto
                const productRes = await fetch(`https://quimex.sistemataup.online/productos/obtener/${productIdToEdit}`, {
                    headers: { "Authorization": `Bearer ${token}` }
                });
                if (!productRes.ok) throw new Error(`Error ${productRes.status} obteniendo datos del producto.`);
                const productData: ProductDataForEdit = await productRes.json();

                // Poblar campos del producto
                setProductCode(productData.id); // Asumiendo que el 'id' devuelto es el código que quieres mostrar y no se edita
                setNombre(productData.nombre || '');
                setUnidadVenta(productData.unidad_venta || '');
                setCostoReferenciaUsd(productData.costo_referencia_usd?.toString() || '');
                setEsReceta(productData.es_receta || false);
                setAjustaPorTc(productData.ajusta_por_tc || false);
                setUnidadReferencia(productData.ref_calculo?.toString() || '');
                setMargen(productData.margen?.toString() || '');
            
                setTipoCalculo((productData.tipo_calculo || '').toUpperCase());
                // 2. Fetch datos de la receta (si es_receta es true)
                if (productData.es_receta) {
                    const recipeRes = await fetch(`https://quimex.sistemataup.online/recetas/obtener/por-producto/${productIdToEdit}`, {
                        headers: { "Authorization": `Bearer ${token}` }
                    });
                    // Puede que no haya receta aún, o que el endpoint devuelva 404 si no existe
                    if (recipeRes.ok) {
                        const recipeData: { items: RecipeItemForEdit[] } = await recipeRes.json();
                        if (recipeData && recipeData.items) {
                            const fetchedIngredients = recipeData.items.map(item => ({
                                id: crypto.randomUUID(), // ID temporal para React
                                ingrediente_id: item.ingrediente_id.toString(), // Asegurar que sea string para el select
                                porcentaje: item.porcentaje,
                            }));
                            setIngredients(fetchedIngredients.length > 0 ? fetchedIngredients : [{ id: crypto.randomUUID(), ingrediente_id: '', porcentaje: 0 }]);
                        } else {
                             setIngredients([{ id: crypto.randomUUID(), ingrediente_id: '', porcentaje: 0 }]);
                        }
                    } else if (recipeRes.status === 404) {
                        // No hay receta para este producto, iniciar con una vacía
                        setIngredients([{ id: crypto.randomUUID(), ingrediente_id: '', porcentaje: 0 }]);
                    } else {
                        throw new Error(`Error ${recipeRes.status} obteniendo la receta.`);
                    }
                } else {
                    setIngredients([]); // No es receta, vaciar ingredientes
                }
                // eslint-disable-next-line 
            } catch (err: any) {
                console.error("Error cargando datos para edición:", err);
                setSaveError(err.message || "Error al cargar datos para editar.");
            } finally {
                setIsLoadingData(false);
            }
        };

        fetchProductAndRecipeData();
    }, [isEditMode, productIdToEdit, token]);


    useEffect(() => {
        if (productosDelContexto && productosDelContexto.length > 0) {
            const transformedIngredients = productosDelContexto.map((p: ContextProducto) => ({
                id: p.id.toString(), // Asegurar que el ID sea string para el value del select
                nombre: p.nombre,
            }));
            setAvailableIngredients(transformedIngredients);
        } else {
            setAvailableIngredients([]);
        }
    }, [productosDelContexto]);

    const addIngredientRow = useCallback(() => {
        setIngredients(prevIngredients => [
            ...prevIngredients,
            { id: crypto.randomUUID(), ingrediente_id: '', porcentaje: 0 }
        ]);
    }, []);

    const removeIngredientRow = (index: number) => {
        const list = [...ingredients];
        list.splice(index, 1);
        // Si se eliminan todos, y es receta, añadir uno vacío
        if (list.length === 0 && esReceta) {
            setIngredients([{ id: crypto.randomUUID(), ingrediente_id: '', porcentaje: 0 }]);
        } else {
            setIngredients(list);
        }
    };
    // Efecto para ingredientes al cambiar esReceta (ajustado para modo edición)
    useEffect(() => {
        if (isEditMode && isLoadingData) return; // No modificar mientras se cargan datos

        if (esReceta && ingredients.length === 0) {
            addIngredientRow();
        } else if (!esReceta) {
            setIngredients([]);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [esReceta, isLoadingData, isEditMode]); // ingredients.length removido para evitar bucles con addIngredientRow

    const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        // ... (sin cambios respecto a la versión anterior)
        const { name, value, type } = e.target;
        setSaveError(null);

        if (type === 'checkbox') {
            const { checked } = e.target as HTMLInputElement;
            if (name === 'esReceta') setEsReceta(checked);
            if (name === 'ajustaPorTc') setAjustaPorTc(checked);
        } else {
            let sanitizedValue = value;
            if (name === 'costoReferenciaUsd' || name === 'margen' || name === 'unidadReferencia') {
                sanitizedValue = value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
            }

            if (name === 'productCode') setProductCode(value); // Antes productId
            else if (name === 'nombre') setNombre(value);
            else if (name === 'unidadVenta') setUnidadVenta(value);
            else if (name === 'costoReferenciaUsd') setCostoReferenciaUsd(sanitizedValue);
            else if (name === 'unidadReferencia') setUnidadReferencia(sanitizedValue);
            else if (name === 'margen') setMargen(sanitizedValue);
            else if (name === 'tipoCalculo') setTipoCalculo(value);
        }
    };

    const handleIngredientChange = (index: number, e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        // ... (sin cambios)
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaveError(null);

        if (!productCode || !nombre) { setSaveError("El Código Interno y el Nombre son obligatorios."); return; }

        const parseAndValidateNumeric = (valStr: string, fieldName: string): number | null => {
            if (!valStr) return null;
            const num = parseFloat(valStr);
            if (isNaN(num)) {
                throw new Error(`${fieldName} debe ser un número válido.`);
            }
            return num;
        };

        let costoNum: number | null = null;
        let margenNum: number | null = null;
        let unidadRefNum: number | null = null;
        const tipoCalculoStr: string | null = tipoCalculo.trim() || null;

        try {
            costoNum = parseAndValidateNumeric(costoReferenciaUsd, "Costo Referencia USD");
            margenNum = parseAndValidateNumeric(margen, "Margen");
            unidadRefNum = parseAndValidateNumeric(unidadReferencia, "Unidad Referencia");
        } // eslint-disable-next-line
        catch (validationError: any) {
            setSaveError(validationError.message);
            return;
        }

        let recetaValida = true;
        if (esReceta) {
             costoNum = 0;
             if (ingredients.length === 0) {
                setSaveError("Si es una receta, debe añadir al menos un ingrediente.");
                recetaValida = false;
            } else if (ingredients.some(item => !item.ingrediente_id || parseFloat(item.porcentaje.toString()) <= 0)) { // Asegurar que porcentaje sea > 0
                 setSaveError("Todos los ingredientes deben tener producto y porcentaje > 0.");
                 recetaValida = false;
            }
        }
        if (!recetaValida) return;

        setIsSaving(true);

        // --- DATOS PARA LA API ---
        // El 'id' del producto que se envía es 'productCode'
        // En modo edición, el productCode no debería cambiar y ser el ID del producto existente.
        const productApiId = isEditMode ? productIdToEdit : productCode;
        // eslint-disable-next-line
        const productPayload: any = {
            id: productApiId, // En creación, es el nuevo código. En edición, es el ID existente.
            nombre,
            unidad_venta: unidadVenta || null,
            es_receta: false,
            ajusta_por_tc: ajustaPorTc,
            costo_referencia_usd: costoNum,
            ref_calculo: unidadRefNum,
            margen: margenNum,
            tipo_calculo: (tipoCalculoStr || '').toUpperCase() || null,
        };

        // Si es modo creación y usas el productCode como ID para el endpoint, está bien.
        // Si es modo edición, el productCode que envías como 'id' en el payload DEBERÍA SER el ID del producto
        // que tu API usa para identificarlo (productIdToEdit).
        // Y si el campo 'id' en la base de datos es autoincremental y no lo establece el usuario,
        // en modo CREACIÓN, NO DEBERÍAS enviar el campo 'id' o enviarlo como null si la API lo permite.
        // Vamos a asumir que en modo creación, `productCode` es el `id` que se envía.
        // En modo edición, `productPayload.id` ya es `productIdToEdit`.

        // Si el campo 'id' del producto NO es editable por el usuario y es generado por el backend,
        // en modo creación, el payload no debería incluir 'id'.
        // Revisa cómo tu API maneja la creación de 'id'. Por ahora, lo mantenemos como estaba.
        // Si el código/ID del producto no es editable, el input `productCode` debería ser `disabled` en modo edición.

        console.log(`Enviando Payload Producto (${isEditMode ? 'Actualización' : 'Creación'}):`, JSON.stringify(productPayload, null, 2));

        try {
            const productApiUrl = isEditMode
                ? `https://quimex.sistemataup.online/productos/actualizar/${productIdToEdit}`
                : 'https://quimex.sistemataup.online/productos/crear';
            const productApiMethod = isEditMode ? 'PUT' : 'POST';

            const productResponse = await fetch(productApiUrl, {
                method: productApiMethod,
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify(productPayload),
            });
            // ... (manejo de respuesta del producto, similar a antes) ...
            const productResultText = await productResponse.text(); // Leer siempre como texto primero
            console.log(`Respuesta Producto (${isEditMode ? 'Actualización' : 'Creación'}):`, productResultText);

            if (!productResponse.ok) {
                let errorMsg = `Error ${productResponse.status} ${isEditMode ? 'actualizando' : 'creando'} producto`;
                try { const errorJson = JSON.parse(productResultText); errorMsg += `: ${errorJson.detalle || errorJson.error || 'Detalle desconocido'}`; }
                catch (parseError) { errorMsg += `: ${productResultText}`+ parseError; }
                throw new Error(errorMsg);
           }

            const processedProduct = JSON.parse(productResultText);
            // En modo edición, el ID ya lo conocemos (productIdToEdit).
            // En modo creación, usamos el ID devuelto o el productCode si la API no devuelve un ID explícito.
            const effectiveProductId = isEditMode ? productIdToEdit : (processedProduct.id || productCode);

            console.log(`Producto ${isEditMode ? 'actualizado' : 'creado'} con ID efectivo:`, effectiveProductId);


            // --- MANEJO DE RECETA (Crear o Actualizar) ---
            if (esReceta && ingredients.length > 0) {
                const recipePayload = {
                    producto_final_id: effectiveProductId,
                    items: ingredients.map(item => ({
                        ingrediente_id: Number(item.ingrediente_id), // Asegurar que es número
                        porcentaje: parseFloat(item.porcentaje.toString()) // Asegurar que es número
                    }))
                };

                // Decidir si crear o actualizar receta.
                // Esto puede requerir saber si ya existía una receta o si la API maneja esto con un solo endpoint (ej. un PUT que crea si no existe).
                // Asumiremos un endpoint de "guardar" que crea o actualiza. Ajusta si tienes endpoints separados.
                // O, si tienes un endpoint específico para actualizar:
                 const recipeApiUrl = isEditMode ? `https://quimex.sistemataup.online/recetas/actualizar/por-producto/${productIdToEdit}` : 'https://quimex.sistemataup.online/recetas/crear';
                 const recipeApiMethod = isEditMode ? 'PUT' : 'POST';

                // Para simplificar, usaremos un endpoint "crear_o_actualizar" o similar.
                // Si solo tienes "crear", en modo edición podrías necesitar "borrar_existente" y luego "crear".
                // La opción más robusta es un PUT a `/recetas/{producto_id}` que maneje la lógica.
                // Por ahora, usaré el de crear, asumiendo que tu backend podría manejarlo o que lo ajustarás.
                // Lo ideal sería un endpoint tipo `PUT /recetas/producto/{producto_id}`

                console.log(`Enviando Payload Receta (${isEditMode ? 'Actualización' : 'Creación'}):`, JSON.stringify(recipePayload, null, 2));
                const recipeResponse = await fetch(recipeApiUrl, { // O usa el endpoint de crear si es el único
                    method: recipeApiMethod,
                    headers: { 'Content-Type': 'application/json', "Authorization": `Bearer ${token}` },
                    body: JSON.stringify(recipePayload),
                });
                // ... (manejo de respuesta de la receta, similar a antes) ...
                const recipeResultText = await recipeResponse.text();
                console.log(`Respuesta Receta (${isEditMode ? 'Actualización' : 'Creación'}):`, recipeResultText);
                if (!recipeResponse.ok) {
                    let errorMsg = `Producto ${isEditMode ? 'actualizado' : 'creado'}, pero Error ${recipeResponse.status} ${isEditMode ? 'actualizando' : 'creando'} receta`;
                    try { const errorJson = JSON.parse(recipeResultText); errorMsg += `: ${errorJson.detalle || errorJson.error || 'Detalle desconocido'}`; }
                    catch (parseError) { errorMsg += `: ${recipeResultText}`+ parseError; }
                    throw new Error(errorMsg);
                }
                console.log(`Receta ${isEditMode ? 'actualizada' : 'creada'} para producto ID:`, effectiveProductId);

            } else if (isEditMode && !esReceta) {
                // Si estamos en modo edición, el producto ya no es una receta,
                // podríamos querer borrar la receta existente si la API lo requiere.
                // Ejemplo: await fetch(`/api/recetas/producto/${productIdToEdit}`, { method: 'DELETE', headers: { "Authorization": `Bearer ${token}` } });
                console.log("Producto ya no es receta, considerar borrar receta existente si es necesario.");
            }


            alert(`Producto "${nombre}" ${isEditMode ? 'actualizado' : 'creado'} ${esReceta ? 'con receta ' : ''}exitosamente.`);
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
    if (isEditMode && isLoadingData) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex justify-center items-center">
                <div className="bg-white p-6 rounded-lg shadow-xl">
                    <p className="text-lg">Cargando datos del producto...</p>
                    {/* Puedes añadir un spinner aquí */}
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex justify-center items-start pt-10 md:pt-16 p-4 transition-opacity duration-300 ease-in-out overflow-y-auto">
            <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[calc(100vh-6rem)] md:max-h-[calc(100vh-8rem)] flex flex-col animate-fade-in-scale mb-10">
                <div className="flex-shrink-0 flex justify-between items-center p-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-800">
                        {isEditMode ? `Editar Producto: ${nombre || 'Cargando...'}` : 'Crear Nuevo Producto'}
                    </h2>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}> <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /> </svg>
                    </button>
                </div>

                <div className="p-5 overflow-y-auto flex-grow grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="productCode" className="block text-sm font-medium mb-1">Código Interno <span className="text-red-500">*</span></label>
                            <input
                                type="text"
                                id="productCode"
                                name="productCode"
                                value={productCode}
                                onChange={handleInputChange}
                                required
                                // El código del producto usualmente no es editable una vez creado.
                                // Si tu 'id' en el backend es el código y no es autoincremental, entonces SÍ es editable en creación.
                                // Si es autoincremental y el código es un campo aparte, el código es editable.
                                // Asumiré que el código es el ID principal que se puede establecer en la creación.
                                disabled={isEditMode} // Deshabilitar si el código no se puede cambiar después de crear
                                className={`w-full p-2 border rounded ${isEditMode ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                            />
                        </div>
                        {/* ... (resto de los campos del producto, igual que antes, solo asegúrate que usen los estados correctos) ... */}
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
                            <input type="text" inputMode='decimal' id="costoReferenciaUsd" name="costoReferenciaUsd" value={costoReferenciaUsd} onChange={handleInputChange} className="w-full p-2 border rounded" />
                        </div>

                        <div>
                            <label htmlFor="unidadReferencia" className="block text-sm font-medium mb-1">Unidad Referencia (Cálculo)</label>
                            <input type="text" inputMode="decimal" id="unidadReferencia" name="unidadReferencia" value={unidadReferencia} onChange={handleInputChange} className="w-full p-2 border rounded" />
                        </div>
                        <div>
                            <label htmlFor="margen" className="block text-sm font-medium mb-1">Margen</label>
                            <input type="text" inputMode="decimal" id="margen" name="margen" value={margen} onChange={handleInputChange} className="w-full p-2 border rounded" />
                        </div>
                        <div>
                            <label htmlFor="tipoCalculo" className="block text-sm font-medium mb-1">Tipo Cálculo</label>
                            <input type="text" id="tipoCalculo" name="tipoCalculo" value={tipoCalculo} onChange={handleInputChange} className="w-full p-2 border rounded" />
                        </div>

                         <div className="flex items-center gap-6 pt-3">
                            <div className="flex items-center"> <input id="esReceta" name="esReceta" type="checkbox" checked={esReceta} onChange={handleInputChange} className="h-4 w-4 text-indigo-600 rounded" /> <label htmlFor="esReceta" className="ml-2 text-sm">Es Receta</label> </div>
                             <div className="flex items-center"> <input id="ajustaPorTc" name="ajustaPorTc" type="checkbox" checked={ajustaPorTc} onChange={handleInputChange} className="h-4 w-4 text-indigo-600 rounded" /> <label htmlFor="ajustaPorTc" className="ml-2 text-sm">Ajusta por TC</label> </div>
                        </div>
                    </div>

                    {/* Columna 2: Receta (Condicional) */}
                    <div className={`space-y-3 transition-opacity duration-300 ${!esReceta ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                        <h3 className="text-md font-medium border-b pb-1 mb-3">Ingredientes de la Receta</h3>
                        {loadingProductosContext && <p className="text-xs text-gray-500">Cargando lista de ingredientes...</p>}
                        {errorProductosContext && <p className="text-xs text-red-500">Error cargando ingredientes: {errorProductosContext}</p>}

                         <div className={`hidden md:grid md:grid-cols-[minmax(0,1fr)_100px_50px] gap-2 items-center px-1 text-xs font-medium ${!esReceta ? 'text-gray-400' : 'text-gray-500'}`}> <span>Ingrediente</span> <span className="text-right">Porcentaje (%)</span> <span></span> </div>
                        <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                             {ingredients.map((item, index) => (
                                <div key={item.id} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_100px_50px] gap-2 items-center border rounded p-2 md:p-1 md:border-none">
                                    <div>
                                        <label className="md:hidden text-xs">Ingrediente</label>
                                        <select
                                            name="ingrediente_id"
                                            value={item.ingrediente_id} // Debe ser string
                                            onChange={(e) => handleIngredientChange(index, e)}
                                            required={esReceta}
                                            disabled={!esReceta || loadingProductosContext || availableIngredients.length === 0}
                                            className={`w-full p-2 border rounded text-sm ${!esReceta ? 'bg-gray-100' : 'border-gray-300 bg-white'}`}
                                        >
                                            <option value="" disabled>-- Seleccionar --</option>
                                            {availableIngredients.map(ing => (
                                                <option key={ing.id} value={ing.id.toString()}>{ing.nombre}</option> // Asegurar value es string
                                            ))}
                                        </select>
                                    </div>
                                    <div> <label className="md:hidden text-xs">Porcentaje (%)</label> <input type="text" inputMode='decimal' name="porcentaje" value={item.porcentaje === 0 && !isEditMode ? '' : item.porcentaje.toString()} onChange={(e) => handleIngredientChange(index, e)} required={esReceta} disabled={!esReceta} min="0.01" step="0.01" className={`w-full p-2 border rounded text-sm text-right ${!esReceta ? 'bg-gray-100' : 'border-gray-300'}`} /> </div>
                                     <div className="flex justify-end md:justify-center items-center pt-2 md:pt-0">
                                        {(ingredients.length > 1 || (ingredients.length === 1 && !esReceta)) && ( // Permitir eliminar si no es receta o hay más de uno
                                            <button type="button" onClick={() => removeIngredientRow(index)} disabled={!esReceta && ingredients.length === 1} className={`text-xl p-1 ${(!esReceta && ingredients.length ===1) ? 'text-gray-400' : 'text-red-500 hover:text-red-700'}`} title="Eliminar"> × </button>
                                        )}
                                     </div>
                                </div> ))}
                        </div>
                        <button type="button" onClick={addIngredientRow} disabled={!esReceta} className={`mt-2 text-sm px-3 py-1.5 rounded font-medium ${!esReceta ? 'bg-gray-200 text-gray-500' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}> + Agregar Ingrediente </button>
                    </div>
                </div>

                <div className="flex-shrink-0 flex justify-between items-center p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
                    {saveError && ( <p className="text-sm text-red-600 flex-grow mr-2">{saveError}</p> )}
                    {!saveError && <span className="flex-grow" />}
                    <div className="flex gap-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm bg-white border rounded hover:bg-gray-50"> Cancelar </button>
                        <button type="submit" disabled={isSaving || isLoadingData} className={`px-4 py-2 text-sm text-white rounded flex items-center ${ (isSaving || isLoadingData) ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700' }`}>
                            {(isSaving || isLoadingData) && <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"> <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle> <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" className="opacity-75"></path> </svg>}
                            {isSaving ? 'Guardando...' : (isLoadingData ? 'Cargando...' : (isEditMode ? 'Guardar Cambios' : 'Crear Producto'))}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
};

export default CreateProductModal;