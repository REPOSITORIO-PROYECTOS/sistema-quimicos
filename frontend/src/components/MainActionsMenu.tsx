import React, { useState } from 'react';

interface MainActionsMenuProps {
  token: string | null;
  allItems: unknown[];
  isUpdatingAllRecipes: boolean;
  isDownloadingFormulas: boolean;
  isPreparingPriceList: boolean;
  isPreparingDownload: boolean;
  onUpdateAllRecipeCosts: () => void;
  onDownloadFormulas: () => void;
  onCreateCategory: () => void;
  onAssignByNames: () => void;
  onDownloadPriceList: () => void;
  onDownloadExcel: () => void;
  onOpenUploadModal: () => void;
  onOpenCreateProductModal: () => void;
}

export const MainActionsMenu: React.FC<MainActionsMenuProps> = ({
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
  const [open, setOpen] = useState(false);

  // Botón para subir clasificación CSV
  const handleUploadClasificacion = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      // Cambia la URL por la de tu endpoint backend real
      const response = await fetch('/api/upload-clasificacion', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error('Error al subir el archivo');
      alert('Archivo subido y procesado correctamente');
    } catch (err) {
      alert('Error al subir el archivo: ' + (err as Error).message);
    }
  };

  return (
    <div className="relative inline-block text-left">
      <button
        className="bg-indigo-700 text-white px-6 py-2 rounded-md shadow hover:bg-indigo-800 flex items-center gap-2"
        onClick={() => setOpen((v) => !v)}
        disabled={!token}
      >
        <span>Acciones</span>
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" strokeWidth="2" d="M6 9l6 6 6-6"/></svg>
      </button>
      {open && (
        <div className="absolute left-0 mt-2 w-64 bg-white border border-gray-200 rounded-md shadow-lg z-50 flex flex-col p-2 gap-2">
          <button onClick={onUpdateAllRecipeCosts} disabled={isUpdatingAllRecipes} className="w-full bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 disabled:bg-gray-400">{isUpdatingAllRecipes ? '...' : 'Actualizar Costo Recetas Global'}</button>
          <button onClick={onDownloadFormulas} disabled={isDownloadingFormulas} className="w-full bg-teal-600 text-white px-4 py-2 rounded hover:bg-teal-700 disabled:bg-gray-400">{isDownloadingFormulas ? 'Generando...' : 'Descargar Fórmulas'}</button>
          <button onClick={onCreateCategory} className="w-full bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700">+ Crear Categoría</button>
          <button onClick={onAssignByNames} className="w-full bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700">📝 Asignar por Nombres</button>
          <button onClick={onDownloadPriceList} disabled={allItems.length === 0 || isPreparingPriceList} className="w-full bg-cyan-600 text-white px-4 py-2 rounded hover:bg-cyan-700 disabled:bg-gray-400">{isPreparingPriceList ? '...' : 'Precios (Kg/Lt)'}</button>
          <button onClick={onDownloadExcel} disabled={allItems.length === 0 || isPreparingDownload} className="w-full bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400">{isPreparingDownload ? '...' : 'Lista General'}</button>
          <button onClick={onOpenUploadModal} className="w-full bg-teal-500 text-white px-4 py-2 rounded hover:bg-teal-600">Actualizar Costos</button>
          <button onClick={onOpenCreateProductModal} className="w-full bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700">Crear Item</button>
          <button
            className="w-full bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700 mt-2"
            onClick={() => document.getElementById('clasificacion-upload')?.click()}
          >
            Subir Clasificación CSV
          </button>
          <input
            id="clasificacion-upload"
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={handleUploadClasificacion}
          />
        </div>
      )}
    </div>
  );
};
