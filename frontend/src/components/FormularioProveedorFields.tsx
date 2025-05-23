// components/FormularioProveedorFields.tsx
"use client";

import React from 'react';

// Interfaz para los datos del proveedor que manejan los campos
export interface ProveedorFieldsData {
  nombre: string;
  cuit: string;
  direccion: string;
  telefono: string;
  email: string;
  contacto: string;
  condiciones_pago: string;
}

interface FormularioProveedorFieldsProps {
  formData: ProveedorFieldsData;
  handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  // Podríamos añadir una prop 'isEditMode' si algunos campos deben comportarse diferente,
  // pero por ahora lo mantenemos simple.
}

export default function FormularioProveedorFields({
  formData,
  handleChange,
}: FormularioProveedorFieldsProps) {
  return (
    <>
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
          type="tel"
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
          type="email"
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
    </>
  );
}