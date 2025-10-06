import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

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
  onDownloadPriceList,
  onDownloadExcel,
  onOpenUploadModal,
  onOpenCreateProductModal
}) => {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width?: number } | null>(null);

  // Botón para subir clasificación CSV
  const handleUploadClasificacion = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('https://quimex.sistemataup.online/categoria_productos/upload_clasificacion_csv', {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: formData,
      });
      if (!response.ok) throw new Error('Error al subir el archivo');
      const data = await response.json();
      alert(data.mensaje || 'Archivo subido y procesado correctamente');
    } catch (err) {
      alert('Error al subir el archivo: ' + (err as Error).message);
    }
  };

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const preferredTop = rect.bottom + window.scrollY;
      const preferredLeft = rect.left + window.scrollX;
      // Estimate menu width and height constraints
      const menuWidth = Math.max(rect.width, 260);
      const estimatedMenuHeight = Math.min(480, viewportHeight - 80); // allow scroll if too tall

      let left = preferredLeft;
      // If menu would overflow to the right, shift it left so it fits
      if (left + menuWidth > window.scrollX + viewportWidth - 16) {
        left = Math.max(8 + window.scrollX, window.scrollX + viewportWidth - menuWidth - 16);
      }

      // If not enough space below, position above the button
      let top = preferredTop;
      if (preferredTop + estimatedMenuHeight > window.scrollY + viewportHeight - 16) {
        // position above
        top = rect.top + window.scrollY - estimatedMenuHeight;
        if (top < window.scrollY + 8) top = window.scrollY + 8;
      }

      setMenuStyle({ top, left, width: menuWidth });
    };

    updatePosition();
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current && buttonRef.current.contains(target)) return;
      if (menuRef.current && menuRef.current.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, { passive: true });
    document.addEventListener('mousedown', onDocClick);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition);
      document.removeEventListener('mousedown', onDocClick);
    };
  }, [open]);

  return (
    <div className="inline-block text-left">
      <button
        ref={buttonRef}
        className="bg-indigo-700 text-white px-6 py-2 rounded-md shadow hover:bg-indigo-800 flex items-center gap-2"
        onClick={() => setOpen((v) => !v)}
        disabled={!token}
      >
        <span>Acciones</span>
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" strokeWidth="2" d="M6 9l6 6 6-6"/></svg>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: menuStyle?.top ?? 0, left: menuStyle?.left ?? 0, width: menuStyle?.width ?? 260, maxHeight: '70vh', overflowY: 'auto' }}
          className="bg-white border border-gray-200 rounded-md shadow-lg z-[9999] flex flex-col p-2 gap-2"
        >
          <div className="flex flex-col">
            <button onClick={onUpdateAllRecipeCosts} disabled={isUpdatingAllRecipes} className="w-full bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 disabled:bg-gray-400">{isUpdatingAllRecipes ? '...' : 'Actualizar Costo Recetas Global'}</button>
            <p className="text-xs text-gray-500 mt-1 ml-1">Recalcula los costos de todas las recetas usando costos actuales.</p>
          </div>

          <div className="flex flex-col">
            <button onClick={onDownloadFormulas} disabled={isDownloadingFormulas} className="w-full bg-teal-600 text-white px-4 py-2 rounded hover:bg-teal-700 disabled:bg-gray-400">{isDownloadingFormulas ? 'Generando...' : 'Descargar Fórmulas'}</button>
            <p className="text-xs text-gray-500 mt-1 ml-1">Exporta un Excel con las fórmulas de las recetas.</p>
          </div>

          <div className="flex flex-col">
            <button onClick={onCreateCategory} className="w-full bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700">+ Crear Categoría</button>
            <p className="text-xs text-gray-500 mt-1 ml-1">Agrega una nueva categoría para productos.</p>
          </div>


          <div className="flex flex-col">
            <button onClick={onDownloadPriceList} disabled={allItems.length === 0 || isPreparingPriceList} className="w-full bg-cyan-600 text-white px-4 py-2 rounded hover:bg-cyan-700 disabled:bg-gray-400">{isPreparingPriceList ? '...' : 'Precios (Kg/Lt)'}</button>
            <p className="text-xs text-gray-500 mt-1 ml-1">Genera precios por kg o litro según configuración.</p>
          </div>

          <div className="flex flex-col">
            <button onClick={onDownloadExcel} disabled={allItems.length === 0 || isPreparingDownload} className="w-full bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400">{isPreparingDownload ? '...' : 'Lista General'}</button>
            <p className="text-xs text-gray-500 mt-1 ml-1">Descarga la lista completa de productos y precios.</p>
          </div>

          <div className="flex flex-col">
            <button onClick={onOpenUploadModal} className="w-full bg-teal-500 text-white px-4 py-2 rounded hover:bg-teal-600">Actualizar Costos</button>
            <p className="text-xs text-gray-500 mt-1 ml-1">Sube un CSV para actualizar costos masivamente.</p>
          </div>

          <div className="flex flex-col">
            <button onClick={onOpenCreateProductModal} className="w-full bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700">Crear Item</button>
            <p className="text-xs text-gray-500 mt-1 ml-1">Crear un nuevo producto o combo en el catálogo.</p>
          </div>

          <div className="flex flex-col">
            <button
              className="w-full bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700 mt-2"
              onClick={() => document.getElementById('clasificacion-upload')?.click()}
            >
              Subir Clasificación CSV
            </button>
            <p className="text-xs text-gray-500 mt-1 ml-1">Carga CSV para asignar categorías de forma masiva.</p>
          </div>

          <input
            id="clasificacion-upload"
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={handleUploadClasificacion}
          />
        </div>,
        document.body
      )}
    </div>
  );
};
