"use client";

import React from 'react';

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
}

export default function FormularioProveedorFields({
  formData,
  handleChange,
}: FormularioProveedorFieldsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <label htmlFor="nombre" className="mb-1 block text-sm font-semibold text-slate-700">
          Nombre del Proveedor <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          name="nombre"
          id="nombre"
          value={formData.nombre}
          onChange={handleChange}
          required
          className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div>
        <label htmlFor="cuit" className="mb-1 block text-sm font-semibold text-slate-700">
          CUIT
        </label>
        <input
          type="text"
          name="cuit"
          id="cuit"
          value={formData.cuit}
          onChange={handleChange}
          className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div>
        <label htmlFor="telefono" className="mb-1 block text-sm font-semibold text-slate-700">
          Telefono
        </label>
        <input
          type="tel"
          name="telefono"
          id="telefono"
          value={formData.telefono}
          onChange={handleChange}
          className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div className="md:col-span-2">
        <label htmlFor="direccion" className="mb-1 block text-sm font-semibold text-slate-700">
          Direccion
        </label>
        <input
          type="text"
          name="direccion"
          id="direccion"
          value={formData.direccion}
          onChange={handleChange}
          className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-semibold text-slate-700">
          Email
        </label>
        <input
          type="email"
          name="email"
          id="email"
          value={formData.email}
          onChange={handleChange}
          className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div>
        <label htmlFor="contacto" className="mb-1 block text-sm font-semibold text-slate-700">
          Contacto
        </label>
        <input
          type="text"
          name="contacto"
          id="contacto"
          value={formData.contacto}
          onChange={handleChange}
          className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div className="md:col-span-2">
        <label htmlFor="condiciones_pago" className="mb-1 block text-sm font-semibold text-slate-700">
          Condiciones de Pago
        </label>
        <textarea
          name="condiciones_pago"
          id="condiciones_pago"
          value={formData.condiciones_pago}
          onChange={handleChange}
          rows={3}
          className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>
    </div>
  );
}
