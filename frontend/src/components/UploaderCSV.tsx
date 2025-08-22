// Ruta: src/components/UploaderCSV.tsx
"use client";

import React, { useState } from 'react';

// --- Tipos de datos (sin cambios) ---
interface FailedRow {
  linea: number;
  cliente: string;
  producto: string;
  precio: string;
  moneda: string;
  motivo: string;
}
interface UploadResult {
  status: 'success' | 'partial_success' | 'error';
  message: string;
  summary?: {
    creados: number;
    actualizados: number;
    errores: number;
  };
  failedRows?: FailedRow[];
  details?: string[];
}
interface UploaderProps {
  title: string;
  endpoint: string;
  fileKey: string;
  instructions: React.ReactNode;
}

// --- Componente ---
const UploaderCSV: React.FC<UploaderProps> = ({ title, endpoint, fileKey, instructions }) => {
  // --- LÓGICA DEL COMPONENTE (SIN CAMBIOS) ---
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
      setUploadResult(null);
    }
  };

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedFile) {
      setUploadResult({ status: 'error', message: 'Por favor, selecciona un archivo CSV primero.' });
      return;
    }
    setIsUploading(true);
    setUploadResult(null);
    const formData = new FormData();
    formData.append(fileKey, selectedFile);
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Usuario no autenticado.");
      const response = await fetch(`https://quimex.sistemataup.online${endpoint}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      const resultData = await response.json();
      if (!response.ok && response.status !== 207) {
        throw new Error(resultData.error || 'Ocurrió un error en el servidor.', {
          cause: resultData.detalles_errores || resultData.failed_rows || [],
        });
      }
      const status = resultData.failed_rows && resultData.failed_rows.length > 0 ? 'partial_success' : 'success';
      setUploadResult({
        status: status,
        message: resultData.message,
        summary: resultData.summary,
        failedRows: resultData.failed_rows,
      });
    } catch (error: unknown) {
        let message = 'Ocurrió un error desconocido.';
        let details: string[] = [];
        if (error instanceof Error) {
            message = error.message;
            if (error.cause && Array.isArray(error.cause)) {
                details = error.cause as string[];
            }
        }
        setUploadResult({ 
            status: 'error', 
            message: message,
            details: details,
        });
    } finally {
      setIsUploading(false);
    }
  };

  const getStatusColor = () => {
    if (!uploadResult) return '';
    if (uploadResult.status === 'success') return 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200 border-green-300';
    if (uploadResult.status === 'partial_success') return 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 border-yellow-300';
    return 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200 border-red-300';
  }

  // --- RENDERIZADO DEL COMPONENTE (CON ESTILOS MEJORADOS) ---
  return (
    <fieldset className="bg-gray-50 border border-gray-200 p-6 rounded-lg shadow-sm">
      <legend className="text-xl font-semibold text-gray-800 px-2">{title}</legend>
      <div className="text-sm text-gray-600 mb-4">
        {instructions}
      </div>

      <form onSubmit={handleUpload} className="space-y-4">
        <input
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
        />
        <button
          type="submit"
          disabled={!selectedFile || isUploading}
          className="w-full bg-indigo-600 text-white font-bold py-2 px-4 rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isUploading ? 'Procesando...' : 'Cargar y Procesar Archivo'}
        </button>
      </form>

      {uploadResult && (
        <div className={`mt-6 p-4 rounded-lg border text-sm ${getStatusColor()}`}>
          <p className="font-bold text-lg mb-3">{uploadResult.message}</p>
          
          {uploadResult.summary && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-2 mb-4 p-3 border-t border-b border-current border-opacity-20">
              <div className="flex items-center gap-2">
                <span className="text-green-500">✔️</span>
                <span>Registros Creados: <strong className="font-semibold">{uploadResult.summary.creados}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-blue-500">🔄</span>
                <span>Registros Actualizados: <strong className="font-semibold">{uploadResult.summary.actualizados}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-red-500">❌</span>
                <span>Filas con Errores: <strong className="font-semibold">{uploadResult.summary.errores}</strong></span>
              </div>
            </div>
          )}

          {uploadResult.failedRows && uploadResult.failedRows.length > 0 && (
            <div>
              <h4 className="font-bold mt-4 mb-2 text-md">Detalle de Filas con Errores:</h4>
              <div className="overflow-x-auto border border-gray-300 dark:border-gray-600 rounded-lg">
                <table className="min-w-full">
                  <thead className="bg-gray-200 dark:bg-gray-700">
                    <tr>
                      <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider">Línea</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider">Cliente</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider">Producto</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider">Precio</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider">Moneda</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-300">Motivo del Error</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {uploadResult.failedRows.map((row, index) => (
                      <tr key={index} className="even:bg-gray-50 dark:even:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-700/50">
                        <td className="px-3 py-2 text-center whitespace-nowrap">{row.linea}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{row.cliente}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{row.producto}</td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">{row.precio}</td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">{row.moneda}</td>
                        <td className="px-3 py-2 font-semibold text-red-600 dark:text-red-400">{row.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {uploadResult.details && uploadResult.details.length > 0 && (
             <ul className="list-disc list-inside mt-2 space-y-1">
              {uploadResult.details.map((error, index) => <li key={index}>{error}</li>)}
            </ul>
          )}
        </div>
      )}
    </fieldset>
  );
};

export default UploaderCSV;