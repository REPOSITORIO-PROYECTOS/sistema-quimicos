import React from 'react';

interface DolarControlsProps {
  // Estados del dólar
  loadingDolar: boolean;
  isEditingDolar: boolean;
  dolarOficial: number | null;
  dolarQuimex: number | null;
  editDolarOficial: string;
  editDolarQuimex: string;
  loadingDolarSave: boolean;
  errorDolar: string | null;
  errorDolarSave: string | null;
  
  // Handlers
  onEditDolarClick: () => void;
  onDolarInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSaveDolarValues: () => void;
  onCancelDolarEdit: () => void;
}

export const DolarControls: React.FC<DolarControlsProps> = ({
  loadingDolar,
  isEditingDolar,
  dolarOficial,
  dolarQuimex,
  editDolarOficial,
  editDolarQuimex,
  loadingDolarSave,
  errorDolar,
  errorDolarSave,
  onEditDolarClick,
  onDolarInputChange,
  onSaveDolarValues,
  onCancelDolarEdit
}) => {
  return (
    <div className="flex items-center gap-x-4 gap-y-2 flex-wrap border p-2 rounded-md">
      <div className="text-sm flex items-center gap-1">
        <label htmlFor="dolarOficialInput" className="font-medium">
          Dólar Oficial:
        </label>
        {loadingDolar ? (
          "..."
        ) : isEditingDolar ? (
          <input
            id="dolarOficialInput"
            type="text"
            name="dolarOficial"
            value={editDolarOficial}
            onChange={onDolarInputChange}
            className="px-2 py-1 border rounded text-sm w-24"
            disabled={loadingDolarSave}
            inputMode="decimal"
          />
        ) : dolarOficial !== null ? (
          <span className="font-semibold">${dolarOficial.toFixed(2)}</span>
        ) : (
          <span className="text-red-500 text-xs">{errorDolar || 'Error'}</span>
        )}
      </div>
      
      <div className="text-sm flex items-center gap-1">
        <label htmlFor="dolarQuimexInput" className="font-medium">
          Dólar Empresa:
        </label>
        {loadingDolar ? (
          "..."
        ) : isEditingDolar ? (
          <input
            id="dolarQuimexInput"
            type="text"
            name="dolarQuimex"
            value={editDolarQuimex}
            onChange={onDolarInputChange}
            className="px-2 py-1 border rounded text-sm w-24"
            disabled={loadingDolarSave}
            inputMode="decimal"
          />
        ) : dolarQuimex !== null ? (
          <span className="font-semibold">${dolarQuimex.toFixed(2)}</span>
        ) : (
          <span className="text-red-500 text-xs">{errorDolar || 'Error'}</span>
        )}
      </div>
      
      <div className="flex items-center gap-2">
        {isEditingDolar ? (
          <>
            <button
              onClick={onSaveDolarValues}
              disabled={loadingDolarSave || loadingDolar}
              className={`px-3 py-1 text-xs rounded flex items-center gap-1 ${
                loadingDolarSave || loadingDolar
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              <svg
                className={`h-3 w-3 ${loadingDolarSave ? 'animate-spin' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                />
              </svg>
              {loadingDolarSave ? '...' : 'Guardar'}
            </button>
            <button
              onClick={onCancelDolarEdit}
              disabled={loadingDolarSave}
              className="px-3 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            onClick={onEditDolarClick}
            disabled={loadingDolar || dolarOficial === null || dolarQuimex === null}
            className={`px-3 py-1 text-xs rounded flex items-center gap-1 ${
              loadingDolar || dolarOficial === null || dolarQuimex === null
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            }`}
          >
            <svg
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
            Editar Dólar
          </button>
        )}
      </div>
      
      {errorDolarSave && (
        <p className="text-xs text-red-600 mt-1 w-full text-right sm:text-left sm:w-auto">
          {errorDolarSave}
        </p>
      )}
    </div>
  );
};