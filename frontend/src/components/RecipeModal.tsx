// RecipeModal.tsx
import React, { useState, useEffect, ChangeEvent } from 'react';

// --- Interfaces ---
interface IngredientItem {
  id: string; // ID único para el mapeo de React (puede ser temporal)
  ingrediente_id: string | number; // ID del ingrediente seleccionado
  porcentaje: number;
}

interface IngredientOption {
  id: string | number;
  nombre: string;
  // Puedes añadir más campos si los necesitas (ej. unidad_medida)
}

interface RecipeModalProps {
  productId: number;
  productName: string;
  onClose: () => void; // Función para cerrar el modal
}

// --- Lista Estática de Ingredientes (Reemplazar con API LUEGO) ---
const staticAvailableIngredients: IngredientOption[] = [
  { id: 101, nombre: 'Materia Prima A' },
  { id: 102, nombre: 'Materia Prima B' },
  { id: 103, nombre: 'Materia Prima C' },
  { id: 'XYZ-9', nombre: 'Componente Especial XYZ' },
  { id: 205, nombre: 'Aditivo Z' },
];

// --- Componente Modal ---
const RecipeModal: React.FC<RecipeModalProps> = ({ productId, productName, onClose }) => {
  const [ingredients, setIngredients] = useState<IngredientItem[]>([
    // Inicia con una fila vacía
    { id: crypto.randomUUID(), ingrediente_id: '', porcentaje: 0 }
  ]);
  const [availableIngredients, setAvailableIngredients] = useState<IngredientOption[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // --- Cargar Ingredientes Disponibles (Estático por ahora) ---
  useEffect(() => {
    // Simular carga o setear directamente
    setAvailableIngredients(staticAvailableIngredients);

  }, [productId]); // Dependencia productId si cargas receta existente

  // --- Handlers para Ingredientes ---
  const handleIngredientChange = (index: number, e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const list = [...ingredients];

    if (name === 'ingrediente_id') {
      list[index].ingrediente_id = value;
    } else if (name === 'porcentaje') {
      // Validar que sea un número positivo
      const numValue = parseFloat(value);
      list[index].porcentaje = isNaN(numValue) || numValue < 0 ? 0 : numValue;
    }
    setIngredients(list);
    setSaveError(null); // Limpiar error al modificar
  };

  const addIngredientRow = () => {
    setIngredients([
      ...ingredients,
      { id: crypto.randomUUID(), ingrediente_id: '', porcentaje: 0 }
    ]);
  };

  const removeIngredientRow = (index: number) => {
    // No permitir eliminar la última fila si solo queda una
    if (ingredients.length <= 1) return;
    const list = [...ingredients];
    list.splice(index, 1);
    setIngredients(list);
  };

  // --- Handler para Guardar (Simulado) ---
  const handleSaveRecipe = async () => {
    setSaveError(null);

    // Validaciones básicas
   // const totalPercentage = ingredients.reduce((sum, item) => sum + item.porcentaje, 0);
    const hasEmptySelection = ingredients.some(item => !item.ingrediente_id);

    if (hasEmptySelection) {
        setSaveError("Por favor, selecciona un ingrediente para cada fila.");
        return;
    }
    if (ingredients.length === 0) {
         setSaveError("Añade al menos un ingrediente.");
         return;
    }
    // Opcional: Validar suma de porcentajes si es necesario
    // if (Math.abs(totalPercentage - 100) > 0.01) { // Permite pequeña imprecisión decimal
    //    setSaveError(`La suma de porcentajes debe ser 100% (actual: ${totalPercentage.toFixed(2)}%)`);
    //    return;
    // }

    setIsSaving(true);

    // Preparar datos para la API (quitar el 'id' temporal si no lo usa el backend)
    const payload = {
        //producto_id: productId,
        ingredientes: ingredients.map(({ ...rest }) => rest) 
    };

    console.log("Simulando guardado de receta:", JSON.stringify(payload, null, 2));

    // --- SIMULACIÓN DE LLAMADA API (Reemplazar con fetch real) ---
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simular delay
    // const response = await fetch('/api/recetas/guardar', { method: 'POST', ... });
    // if (!response.ok) { throw new Error('Error al guardar'); }
    // ---------------------------------------------------------

    setIsSaving(false);
    alert(`Receta para "${productName}" guardada (simulado).`);
    onClose(); // Cerrar modal después de guardar

    // try {
    //   // ... (Llamada API real) ...
    //   setIsSaving(false);
    //   alert(`Receta para "${productName}" guardada.`);
    //   onClose();
    // } catch (err: any) {
    //   console.error("Error guardando receta:", err);
    //   setSaveError(err.message || "Error al guardar la receta.");
    //   setIsSaving(false);
    // }
  };


  // --- Renderizado del Modal ---
  return (
    // Overlay oscuro
    <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex justify-center items-center p-4 transition-opacity duration-300 ease-in-out">
      {/* Contenedor del Modal */}
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-fade-in-scale"> {/* Ancho máximo y alto */}

        {/* Cabecera */}
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">
            Receta para: <span className="font-bold">{productName}</span> (ID: {productId})
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Cerrar modal"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Cuerpo del Modal (con scroll si es necesario) */}
        <div className="p-5 overflow-y-auto flex-grow"> {/* Habilitar scroll vertical */}
          {/* Encabezados de la lista de ingredientes */}
          <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_100px_50px] gap-2 items-center mb-2 px-1 text-sm font-medium text-gray-500">
            <span>Ingrediente</span>
            <span className="text-right">Porcentaje (%)</span>
            <span></span> {/* Espacio para botón eliminar */}
          </div>

          {/* Lista de Ingredientes */}
          <div className="space-y-3">
            {ingredients.map((item, index) => (
              <div key={item.id} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_100px_50px] gap-2 items-center border rounded p-2 md:p-1 md:border-none">

                {/* Selector de Ingrediente */}
                <div>
                  <label className="md:hidden text-xs font-medium text-gray-500">Ingrediente</label>
                  <select
                    name="ingrediente_id"
                    value={item.ingrediente_id}
                    onChange={(e) => handleIngredientChange(index, e)}
                    className="w-full p-2 border border-gray-300 rounded-md shadow-sm text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    required
                  >
                    <option value="" disabled>-- Seleccionar --</option>
                    {availableIngredients.map(ing => (
                      <option key={ing.id} value={ing.id}>{ing.nombre}</option>
                    ))}
                  </select>
                </div>

                {/* Input de Porcentaje */}
                 <div>
                    <label className="md:hidden text-xs font-medium text-gray-500">Porcentaje (%)</label>
                    <input
                      type="number"
                      name="porcentaje"
                      value={item.porcentaje === 0 ? '' : item.porcentaje} // Mostrar vacío si es 0
                      onChange={(e) => handleIngredientChange(index, e)}
                      className="w-full p-2 border border-gray-300 rounded-md shadow-sm text-sm text-right focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      min="0"
                      step="0.01" // Permite decimales
                      placeholder="%"
                      required
                    />
                 </div>

                 {/* Botón Eliminar Fila */}
                 <div className="flex justify-end md:justify-center items-center pt-2 md:pt-0">
                    {ingredients.length > 1 && ( // Solo mostrar si hay más de 1 fila
                      <button
                          type="button"
                          onClick={() => removeIngredientRow(index)}
                          className="text-red-500 hover:text-red-700 font-bold text-xl leading-none p-1 rounded-full hover:bg-red-100 transition-colors"
                          title="Eliminar ingrediente"
                      >
                          ×
                      </button>
                    )}
                 </div>

              </div>
            ))}
          </div>

          {/* Botón Añadir Fila */}
          <button
            type="button"
            onClick={addIngredientRow}
            className="mt-4 text-sm bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1.5 rounded-md font-medium transition-colors"
          >
            + Agregar Ingrediente
          </button>

           {/* Mensaje de Error de Guardado */}
            {saveError && (
                <p className="mt-3 text-sm text-red-600">{saveError}</p>
            )}

        </div>

        {/* Pie del Modal */}
        <div className="flex justify-end items-center p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 mr-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSaveRecipe}
            disabled={isSaving}
            className={`px-4 py-2 text-sm font-medium text-white rounded-md shadow-sm flex items-center ${
              isSaving ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
            }`}
          >
             {isSaving ? (
                 <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                     </svg>
                     Guardando...
                 </>
             ) : (
                 'Guardar Receta'
             )}
          </button>
        </div>

      </div>
    </div>
  );
};

export default RecipeModal;