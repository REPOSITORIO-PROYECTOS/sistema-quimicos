// Ruta: src/app/carga-masiva/page.tsx
"use client";

import BotonVolver from "@/components/BotonVolver";
import UploaderCSV from "@/components/UploaderCSV"; // Importamos nuestro nuevo componente
import { useState } from 'react';

// Use environment API base or local backend fallback when developing locally
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8001';

async function descargarPlantilla() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers: HeadersInit = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}/precios_especiales/descargar_plantilla_precios`, { headers });
  if (!res.ok) throw new Error('Error al descargar la plantilla');
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plantilla_precios_especiales.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export default function CargaMasivaPage() {
  const [descargando, setDescargando] = useState(false);
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-indigo-900 py-10 px-4">
      <div className="bg-white p-6 md:p-8 rounded-xl shadow-2xl w-full max-w-3xl border border-gray-200">
        <BotonVolver />
        <h1 className="text-3xl font-bold text-center text-indigo-800 mb-6">Carga Masiva de Datos</h1>
        
        <p className="text-center text-gray-600 mb-8">
          Utiliza estas herramientas para crear o actualizar registros en el sistema de forma masiva usando archivos CSV. 
          Sigue el orden y las instrucciones para asegurar una carga exitosa.
        </p>

        <div className="space-y-10">
          {/* --- UPLOADER PARA CLIENTES --- */}
          <UploaderCSV
            title="Paso 1: Cargar y Sincronizar Clientes"
            endpoint="/clientes/cargar_csv"
            fileKey="archivo_clientes"
            instructions={
              <>
                <p>Este proceso creará clientes nuevos y actualizará los existentes basándose en el nombre.</p>
                <p className="font-semibold mt-2">Columnas requeridas: <code className="bg-gray-200 p-1 rounded">NOMBRE</code>, <code className="bg-gray-200 p-1 rounded">TELEFONO</code>, <code className="bg-gray-200 p-1 rounded">DIRECCIÓN</code>, <code className="bg-gray-200 p-1 rounded">LOCALIDAD</code>.</p>
              </>
            }
          />

          {/* --- UPLOADER PARA PRECIOS ESPECIALES (CON LA CORRECCIÓN) --- */}
          <UploaderCSV
            title="Paso 2: Cargar Precios Especiales"
            endpoint="/precios_especiales/cargar_csv"
            fileKey="archivo_precios"
            instructions={
              <>
                <p className="font-bold text-red-600">Importante: Asegúrate de haber cargado a los clientes antes de subir este archivo.</p>
                <p>Este proceso creará o actualizará precios fijos. El sistema convertirá los precios en USD a ARS usando el Dólar Oficial actual.</p>
                {/* 
                  AQUÍ ESTÁ LA CORRECCIÓN:
                  Se eliminaron los apóstrofes y se usaron etiquetas <code> para consistencia.
                */}
                <p className="font-semibold mt-2">Columnas requeridas: <code className="bg-gray-200 p-1 rounded">Cliente</code>, <code className="bg-gray-200 p-1 rounded">Producto</code>, <code className="bg-gray-200 p-1 rounded">Precio</code>, <code className="bg-gray-200 p-1 rounded">Moneda</code> (usar <code className="bg-gray-200 p-1 rounded">ARS</code> o <code className="bg-gray-200 p-1 rounded">USD</code>).</p>
                <p className="mt-2">Si un cliente tiene 2 precios especiales para distintos productos o presentaciones, agrega dos filas con el mismo nombre de cliente y distintos valores en la columna <code className="bg-gray-200 p-1 rounded">Producto</code>.</p>
                <div className="mt-4 flex items-center gap-3">
                  <button
                    className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
                    onClick={async () => { setDescargando(true); try { await descargarPlantilla(); } catch (error) { console.error('Error descargando plantilla:', error); alert('Error al descargar plantilla'); } finally { setDescargando(false); } }}
                    disabled={descargando}
                  >
                    {descargando ? 'Descargando...' : 'Descargar plantilla (Excel)'}
                  </button>
                  <a className="text-sm text-gray-600">La plantilla incluye la hoja <code>PRECIOS_ACTUALES</code> con la lista de clientes y sus precios actuales para corregir fácilmente.</a>
                </div>
              </>
            }
          />
        </div>

      </div>
    </div>
  );
}