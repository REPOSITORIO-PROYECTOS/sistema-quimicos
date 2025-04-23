'use client';

import { useState } from 'react';

export default function RegistrarCliente() {
  const [form, setForm] = useState({
    nombre_razon_social: '',
    cuit: 0,
    direccion: '',
    localidad: '',
    provincia: '',
    codigo_postal: 0,
    telefono: '',
    email: '',
    contacto_principal: 0,
    observaciones: '',
  });
 
  
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value,
    }));
  };
 

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
  
    try {
      const res = await fetch(`https://sistemataup.online/clientes/crear`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });
  
      if (!res.ok) {
        throw new Error('Error al enviar el formulario');
      }
  
      const data = await res.json();
      console.log('Cliente guardado:', data);
  
      setForm({
        nombre_razon_social: '',
        cuit: 0,
        direccion: '',
        localidad: '',
        provincia: '',
        codigo_postal: 0,
        telefono: '',
        email: '',
        contacto_principal: 0,
        observaciones: '',
      });

    } catch (error) {
      console.error('Error:', error);
    }
  };
  



  return (
    <main className="min-h-screen bg-[#312b81] text-white p-8">
      <div className="max-w-xl mx-auto bg-white text-black p-6 rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-6">Registrar Cliente</h1>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
          <label className="block">
            <span className="font-medium">Nombre o Razón Social</span>
            <input
              type="text"
              name="nombre_razon_social"
              value={form.nombre_razon_social}
              onChange={handleChange}
              className="w-full p-2 mt-1 border border-gray-300 rounded"
            />
          </label>

          <label className="block">
            <span className="font-medium">CUIT</span>
            <input
              type="number"
              name="cuit"
              value={form.cuit}
              onChange={handleChange}
              className="w-full p-2 mt-1 border border-gray-300 rounded"
            />
          </label>

          <label className="block">
            <span className="font-medium">Dirección</span>
            <input
              type="text"
              name="direccion"
              value={form.direccion}
              onChange={handleChange}
              className="w-full p-2 mt-1 border border-gray-300 rounded"
            />
          </label>

          <label className="block">
            <span className="font-medium">Localidad</span>
            <input
              type="text"
              name="localidad"
              value={form.localidad}
              onChange={handleChange}
              className="w-full p-2 mt-1 border border-gray-300 rounded"
            />
          </label>

          <label className="block">
            <span className="font-medium">Provincia</span>
            <input
              type="text"
              name="provincia"
              value={form.provincia}
              onChange={handleChange}
              className="w-full p-2 mt-1 border border-gray-300 rounded"
            />
          </label>

          <label className="block">
            <span className="font-medium">Código Postal</span>
            <input
              type="number"
              name="codigo_postal"
              value={form.codigo_postal}
              onChange={handleChange}
              className="w-full p-2 mt-1 border border-gray-300 rounded"
            />
          </label>

          <label className="block">
            <span className="font-medium">Teléfono</span>
            <input
              type="string"
              name="telefono"
              value={form.telefono}
              onChange={handleChange}
              className="w-full p-2 mt-1 border border-gray-300 rounded"
            />
          </label>

          <label className="block">
            <span className="font-medium">Email</span>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              className="w-full p-2 mt-1 border border-gray-300 rounded"
            />
          </label>

          <label className="block">
            <span className="font-medium">Contacto Principal</span>
            <input
              type="number"
              name="contacto_principal"
              value={form.contacto_principal}
              onChange={handleChange}
              className="w-full p-2 mt-1 border border-gray-300 rounded"
            />
          </label>

          <label className="block">
            <span className="font-medium">Observaciones</span>
            <textarea
              name="observaciones"
              value={form.observaciones}
              onChange={handleChange}
              className="w-full p-2 mt-1 border border-gray-300 rounded"
            />
          </label>

          <button
            type="submit"
            className="bg-[#312b81] text-white font-bold py-2 px-4 rounded hover:bg-[#27226a] mt-4"
          >
            Guardar Cliente
          </button>
        </form>
      </div>
    </main>
  );
}
