"use client";

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation'; // Para redireccionar después del envío

// Interfaz para los datos del proveedor (basada en tu modelo)
interface ProveedorData {
  nombre: string;
  cuit: string;
  direccion: string;
  telefono: string;
  email: string;
  contacto: string;
  condiciones_pago: string;
}

const initialFormData: ProveedorData = {
  nombre: '',
  cuit: '',
  direccion: '',
  telefono: '',
  email: '',
  contacto: '',
  condiciones_pago: '',
};

export default function FormularioRegistroProveedor() {
  const [formData, setFormData] = useState<ProveedorData>(initialFormData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const router = useRouter();

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

    // Validaciones básicas (puedes expandirlas)
    if (!formData.nombre.trim()) {
      setError("El nombre del proveedor es obligatorio.");
      setIsLoading(false);
      return;
    }

    try {
      // Aquí cambiarás 'TU_ENDPOINT_AQUI' por tu URL real
      const response = await fetch('TU_ENDPOINT_AQUI/proveedores', { // Asumiendo POST para crear
        method: 'POST', // Usar POST para crear un nuevo recurso
        headers: {
          'Content-Type': 'application/json',
          // Aquí podrías añadir cabeceras de autenticación si son necesarias
          // 'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Error al registrar el proveedor.' }));
        throw new Error(errorData.message || `Error ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      setSuccessMessage('¡Proveedor registrado exitosamente!');
      console.log('Proveedor registrado:', result);
      setFormData(initialFormData); // Limpiar el formulario

      // Opcional: Redireccionar después de un registro exitoso
      setTimeout(() => {
        router.push('/proveedores/lista'); // O a la página principal de proveedores
      }, 2000); // Espera 2 segundos antes de redirigir
      //eslint-disable-next-line
    } catch (err: any) {
      console.error("Error al registrar proveedor:", err);
      setError(err.message || 'Ocurrió un error inesperado.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-6 bg-white shadow-lg rounded-lg w-full max-w-2xl">
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

      {/* Nombre del Proveedor (Obligatorio) */}
      <div>
        <label htmlFor="nombre" className="block text-sm font-medium text-gray-700 mb-1">
          Nombre del Proveedor <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          name="nombre"
          id="nombre"
          value={formData.nombre}
          onChange={handleChange}
          required
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        />
      </div>

      {/* CUIT */}
      <div>
        <label htmlFor="cuit" className="block text-sm font-medium text-gray-700 mb-1">
          CUIT
        </label>
        <input
          type="text"
          name="cuit"
          id="cuit"
          value={formData.cuit}
          onChange={handleChange}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        />
      </div>

      {/* Dirección */}
      <div>
        <label htmlFor="direccion" className="block text-sm font-medium text-gray-700 mb-1">
          Dirección
        </label>
        <input
          type="text"
          name="direccion"
          id="direccion"
          value={formData.direccion}
          onChange={handleChange}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        />
      </div>

      {/* Teléfono */}
      <div>
        <label htmlFor="telefono" className="block text-sm font-medium text-gray-700 mb-1">
          Teléfono
        </label>
        <input
          type="tel" // Usar type="tel" para semántica y posibles teclados móviles
          name="telefono"
          id="telefono"
          value={formData.telefono}
          onChange={handleChange}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        />
      </div>

      {/* Email */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          Email
        </label>
        <input
          type="email" // Usar type="email" para validación básica del navegador
          name="email"
          id="email"
          value={formData.email}
          onChange={handleChange}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        />
      </div>

      {/* Persona de Contacto */}
      <div>
        <label htmlFor="contacto" className="block text-sm font-medium text-gray-700 mb-1">
         Contacto
        </label>
        <input
          type="text"
          name="contacto"
          id="contacto"
          value={formData.contacto}
          onChange={handleChange}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        />
      </div>

      {/* Condiciones de Pago */}
      <div>
        <label htmlFor="condiciones_pago" className="block text-sm font-medium text-gray-700 mb-1">
          Condiciones de Pago
        </label>
        <textarea
          name="condiciones_pago"
          id="condiciones_pago"
          value={formData.condiciones_pago}
          onChange={handleChange}
          rows={3}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        />
      </div>

      {/* Botón de Envío */}
      <div>
        <button
          type="submit"
          disabled={isLoading}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300"
        >
          {isLoading ? 'Registrando...' : 'Registrar Proveedor'}
        </button>
      </div>
    </form>
  );
}