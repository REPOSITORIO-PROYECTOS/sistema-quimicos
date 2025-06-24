// app/proveedores/registrar/page.tsx (o tu ruta de creación)
"use client";

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import FormularioProveedorFields, { ProveedorFieldsData } from '@/components/FormularioProveedorFields'; // Ajusta la ruta

// Si necesitas metadata estática, considera un layout.tsx o generateMetadata en un page.server.tsx
// import type { Metadata } from 'next';
// export const metadata: Metadata = {
//   title: 'Registrar Nuevo Proveedor',
//   description: 'Formulario para registrar un nuevo proveedor en el sistema.',
// };

const API_BASE_URL = 'https://quimex.sistemataup.online'; // O usa variable de entorno

const initialPageFormData: ProveedorFieldsData = {
  nombre: '',
  cuit: '',
  direccion: '',
  telefono: '',
  email: '',
  contacto: '',
  condiciones_pago: '',
};

export default function RegistrarProveedorPage() {
  const [formData, setFormData] = useState<ProveedorFieldsData>(initialPageFormData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    if (!formData.nombre.trim()) {
      setError("El nombre del proveedor es obligatorio.");
      setIsLoading(false);
      return;
    }
    if (!token) {
      setError("No se encontró token de autenticación. Por favor, inicie sesión.");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/proveedores/crear`, {
        method: 'POST',
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Error al registrar el proveedor.' }));
        throw new Error(errorData.message || `Error ${response.status}: ${response.statusText}`);
      }

      // const result = await response.json(); // Podrías usar el resultado si lo necesitas
      setSuccessMessage('¡Proveedor registrado exitosamente!');
      setFormData(initialPageFormData); // Limpiar el formulario

      //eslint-disable-next-line
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error inesperado.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-start py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-3xl space-y-8 bg-white p-8 md:p-10 shadow-xl rounded-lg">
        <div>
          <h2 className="text-center text-3xl font-extrabold text-gray-900">
            Registrar Nuevo Proveedor
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Complete los siguientes campos para añadir un proveedor.
          </p>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">{error}</span>
          </div>
        )}
        {successMessage && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative" role="alert">
            <strong className="font-bold">Éxito: </strong>
            <span className="block sm:inline">{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <FormularioProveedorFields formData={formData} handleChange={handleChange} />

          {/* Botones de Acción para la página de creación */}
          <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3 pt-4">
            <Link
              href="/proveedores-acciones" // Ajusta a tu página de lista
              className="w-full sm:w-auto flex justify-center items-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Volver
            </Link>
            <button
              type="submit"
              disabled={isLoading || !!successMessage} // Deshabilitar si está cargando o si ya hay mensaje de éxito
              className="w-full sm:w-auto flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Registrando...' : 'Registrar Proveedor'}
            </button>
          </div>
        </form>

        {!isLoading && !successMessage && ( // Mostrar solo si no está cargando ni hay mensaje de éxito
            <div className="text-center mt-8">
                <Link href="/lista-proveedores" className="font-medium text-indigo-600 hover:text-indigo-500">
                    Ir a la lista de proveedores
                </Link>
            </div>
        )}
      </div>
    </div>
  );
}