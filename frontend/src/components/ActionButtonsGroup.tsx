import React from 'react';
import { Button } from '@/components/ui/button';

interface ActionButtonsGroupProps {
  // Estados generales
  token: string | null;
  allItems: any[];
  
  // Estados de carga
  isUpdatingAllRecipes: boolean;
  isDownloadingFormulas: boolean;
  isPreparingPriceList: boolean;
  isPreparingDownload: boolean;
  
  // Handlers de acciones
  onUpdateAllRecipeCosts: () => void;
  onDownloadFormulas: () => void;
  onCreateCategory: () => void;
  onAssignByNames: () => void;
  onDownloadPriceList: () => void;
  onDownloadExcel: () => void;
  onOpenUploadModal: () => void;
  onOpenCreateProductModal: () => void;
}

export const ActionButtonsGroup: React.FC<ActionButtonsGroupProps> = ({
  token,
  allItems,
  isUpdatingAllRecipes,
  isDownloadingFormulas,
  isPreparingPriceList,
  isPreparingDownload,
  onUpdateAllRecipeCosts,
  onDownloadFormulas,
  onCreateCategory,
  onAssignByNames,
  onDownloadPriceList,
  onDownloadExcel,
  onOpenUploadModal,
  onOpenCreateProductModal
}) => {
  return (
    <div className="flex flex-col sm:flex-row items-center gap-2 flex-wrap">
      {/* Botón de actualizar recetas */}
      <button
        onClick={onUpdateAllRecipeCosts}
        disabled={!token || isUpdatingAllRecipes}
        className="w-full sm:w-auto bg-purple-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-purple-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
      >
        {isUpdatingAllRecipes ? '...' : 'Actualizar Costo Recetas Global'}
      </button>

      {/* Botón de descargar fórmulas */}
      <button
        onClick={onDownloadFormulas}
        disabled={!token || isDownloadingFormulas}
        className="w-full sm:w-auto bg-teal-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-teal-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
      >
        {isDownloadingFormulas ? 'Generando...' : 'Descargar Fórmulas'}
      </button>

      {/* Separador visual para categorías */}
      <div className="hidden sm:block w-px h-8 bg-gray-300 mx-2"></div>

      {/* Botones de categorías */}
      <button
        onClick={onCreateCategory}
        disabled={!token}
        className="w-full sm:w-auto bg-indigo-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-indigo-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
      >
        + Crear Categoría
      </button>

      <button
        onClick={onAssignByNames}
        disabled={!token}
        className="w-full sm:w-auto bg-purple-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-purple-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
      >
        📝 Asignar por Nombres
      </button>

      {/* Separador visual para reportes */}
      <div className="hidden sm:block w-px h-8 bg-gray-300 mx-2"></div>

      {/* Botones de reportes y descargas */}
      <button
        onClick={onDownloadPriceList}
        disabled={!token || allItems.length === 0 || isPreparingPriceList}
        className="w-full sm:w-auto bg-cyan-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-cyan-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
      >
        {isPreparingPriceList ? '...' : 'Precios (Kg/Lt)'}
      </button>

      <button
        onClick={onDownloadExcel}
        disabled={!token || allItems.length === 0 || isPreparingDownload}
        className="w-full sm:w-auto bg-green-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-green-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
      >
        {isPreparingDownload ? '...' : 'Lista General'}
      </button>

      {/* Separador visual para acciones de productos */}
      <div className="hidden sm:block w-px h-8 bg-gray-300 mx-2"></div>

      {/* Botones de acciones de productos */}
      <button 
        onClick={onOpenUploadModal} 
        disabled={!token} 
        className="w-full sm:w-auto bg-teal-500 text-white px-4 py-2 rounded-md shadow-sm hover:bg-teal-600 disabled:bg-gray-400 flex items-center justify-center gap-1"
      >
        Actualizar Costos
      </button>

      <button 
        onClick={onOpenCreateProductModal} 
        disabled={!token} 
        className="w-full sm:w-auto bg-indigo-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-indigo-700 disabled:bg-gray-400 flex items-center justify-center gap-1"
      >
        Crear Item
      </button>
    </div>
  );
};