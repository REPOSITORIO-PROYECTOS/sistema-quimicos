'use client';

import { useState, ChangeEvent, FormEvent } from 'react';
// Importa tu hook y el tipo Producto desde la ubicación correcta

import { useProductsContext, Producto } from "@/context/ProductsContext"; // <-- Asegúrate que incluya , Producto
import BotonVolver from '@/components/BotonVolver';


// Interfaz para un item de producto en el estado del formulario
interface ProductoItem {
  producto_id: string | number; // Coincide con Producto['id'] que es number, pero se maneja como string desde el select
  valor: number;
}

// Interfaz para el estado completo del formulario
interface FormState {
  nombre_razon_social: string;
  cuit: number;
  direccion: string;
  localidad: string;
  provincia: string;
  codigo_postal: number;
  telefono: string;
  email: string;
  contacto_principal: number;
  productos: ProductoItem[]; // Productos seleccionados para este cliente
  observaciones: string;
}

export default function RegistrarCliente() {
  const [mostrarPreciosEspeciales, setMostrarPreciosEspeciales] = useState(false);
  // Consume tu contexto usando el hook personalizado
  const {
    productos: productosDisponibles, // Renombrado para claridad (lista de todos los productos)
    loading: cargandoProductos,      // Estado de carga del contexto
    error: errorProductos,          // Error del contexto
    // refetch // No lo usamos aquí, pero está disponible si se necesita recargar
  } = useProductsContext();

  const [form, setForm] = useState<FormState>({
    nombre_razon_social: '',
    cuit: 0,
    direccion: '',
    localidad: '',
    provincia: '',
    codigo_postal: 0,
    telefono: '',
    email: '',
    contacto_principal: 0,
  productos: [], // Por defecto vacío, solo se agregan si el usuario lo pide
    observaciones: '',
  });

  const token = localStorage.getItem("token");

  // --- Manejadores de estado (sin cambios respecto a la versión anterior) ---
  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value,
    }));
  };

  const handleProductoItemChange = (
    index: number,
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    const list = [...form.productos];
    if (name === 'producto_id') {
      // El value del select siempre es string, aunque el ID original sea number
      list[index].producto_id = value;
    } else if (name === 'valor') {
      list[index].valor = Number(value) || 0;
    }
    setForm(prev => ({ ...prev, productos: list }));
  };

  const agregarProducto = () => {
    setForm(prev => ({
      ...prev,
      productos: [
        ...prev.productos.filter(p => p.producto_id !== ''),
        { producto_id: '', valor: 0 }
      ]
    }));
  };

  const eliminarProducto = (index: number) => {
    const list = [...form.productos];
    list.splice(index, 1);
    setForm(prev => ({ ...prev, productos: list }));
  };

 const handleSubmit = async (e: FormEvent) => {
  e.preventDefault();

  // 1. Preparar los datos del cliente
  const datosCliente = {
    nombre_razon_social: form.nombre_razon_social,
    cuit: form.cuit,
    direccion: form.direccion,
    localidad: form.localidad,
    provincia: form.provincia,
    codigo_postal: form.codigo_postal,
    telefono: form.telefono,
    email: form.email,
    contacto_principal: form.contacto_principal,
    observaciones: form.observaciones,
   
    productos_con_precio_especial: mostrarPreciosEspeciales
      ? form.productos
          .filter(p => p.producto_id !== '' && p.valor >= 0 && Number(p.producto_id) > 0)
          .map(p => ({
            producto_id: Number(p.producto_id),
            precio_unitario_fijo_ars: p.valor,
          }))
      : [],
  };


  try {
    // Petición para crear el cliente Y sus precios especiales asociados
    const resCliente = await fetch(`https://quimex.sistemataup.online/clientes/crear`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Aquí iría tu token si es necesario para crear clientes
        // 'Authorization': `Bearer ${tuToken}`,
      },
      body: JSON.stringify(datosCliente),
    });

    if (!resCliente.ok) {
      const errorData = await resCliente.json().catch(() => ({ message: 'Error en la respuesta del servidor al crear cliente.' }));
      console.error("Error response (crear cliente):", errorData);
      throw new Error(errorData.message || `Error ${resCliente.status}: ${resCliente.statusText}`);
    }

    const clienteCreado = await resCliente.json();

 
    if (clienteCreado.id && form.productos.length > 0) {
      if (mostrarPreciosEspeciales && form.productos.length > 0) {
        try {
          const preciosEspecialesPromises = form.productos
            .filter(p => p.producto_id !== '' && p.valor >= 0 && Number(p.producto_id) > 0)
            .map(item => {
              const payloadPrecioEspecial = {
                cliente_id: clienteCreado.id,
                producto_id: Number(item.producto_id),
                precio_unitario_fijo_ars: item.valor,
                activo: true,
              };
              return fetch(`https://quimex.sistemataup.online/precios_especiales/crear`, {
                method: 'POST',
                headers: {"Content-Type":"application/json","Authorization":`Bearer ${token}`},
                body: JSON.stringify(payloadPrecioEspecial),
              }).then(res => {
                if (!res.ok) {
                  return res.json().then(err => Promise.reject({ ...err, producto_id: item.producto_id }));
                }
                return res.json();
              });
            });
          const resultadosPrecios = await Promise.all(preciosEspecialesPromises);
          console.log('Precios especiales registrados:', resultadosPrecios);
        } catch (errorPrecios) {
          console.error('Error al registrar uno o más precios especiales:', errorPrecios);
          alert(`Cliente registrado, pero hubo errores al guardar algunos precios especiales. Revise la consola. Error: ${JSON.stringify(errorPrecios)}`);
        }
      }
    

    // Resetear formulario y dar feedback
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
      productos: [],
      observaciones: '',
    });
    alert('Cliente registrado con éxito!');

    }
  } catch (error) {
    console.error('Error en handleSubmit:', error);
    alert(`Error al guardar el cliente: ${error instanceof Error ? error.message : String(error)}`);
  }
};

  // ----- Renderizado -----
  return (
    <main className="min-h-screen bg-[#312b81] text-white p-8">
      <div className="max-w-xl mx-auto bg-white text-black p-6 rounded-lg shadow-md">
        <BotonVolver className="ml-0" />
        <h1 className="text-2xl font-bold mb-8 text-center">Registrar Cliente</h1>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
          {/* --- Campos del Cliente (sin cambios) --- */}
           {/* ... (todos los <label> e <input> para nombre, cuit, etc. van aquí) ... */}
          <label className="block">
            <span className="font-medium">Nombre o Razón Social <span className="text-red-600">(obligatorio)</span></span>
            <input type="text" name="nombre_razon_social" value={form.nombre_razon_social} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded" required />
          </label>
          <label className="block">
            <span className="font-medium">CUIT <span className="text-gray-500">(opcional)</span></span>
            <input type="number" name="cuit" value={form.cuit === 0 ? '' : form.cuit} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded" />
          </label>
          <label className="block">
            <span className="font-medium">Dirección <span className="text-gray-500">(opcional)</span></span>
            <input type="text" name="direccion" value={form.direccion} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded"/>
          </label>
          <label className="block">
            <span className="font-medium">Localidad <span className="text-red-600">(obligatorio)</span></span>
            <input type="text" name="localidad" value={form.localidad} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded" required />
          </label>
          <label className="block">
            <span className="font-medium">Provincia <span className="text-gray-500">(opcional)</span></span>
            <input type="text" name="provincia" value={form.provincia} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded"/>
          </label>
          <label className="block">
            <span className="font-medium">Código Postal <span className="text-gray-500">(opcional)</span></span>
            <input type="number" name="codigo_postal" value={form.codigo_postal === 0 ? '' : form.codigo_postal} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded"/>
          </label>
          <label className="block">
            <span className="font-medium">Teléfono <span className="text-gray-500">(opcional)</span></span>
            <input type="tel" name="telefono" value={form.telefono} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded"/>
          </label>
          <label className="block">
            <span className="font-medium">Email <span className="text-gray-500">(opcional)</span></span>
            <input type="email" name="email" value={form.email} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded"/>
          </label>
          <label className="block">
            <span className="font-medium">Contacto Principal <span className="text-gray-500">(opcional)</span></span>
            <input type="number" name="contacto_principal" value={form.contacto_principal === 0 ? '' : form.contacto_principal} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded"/>
          </label>


          {/* --- SECCIÓN DE PRODUCTOS (Usando datos del Contexto) --- */}
          {/* Botón para mostrar precios especiales */}
          <div className="mt-4">
            <button
              type="button"
              className="bg-yellow-500 text-black px-4 py-2 rounded hover:bg-yellow-600 text-sm font-semibold shadow-sm"
              onClick={() => {
                setMostrarPreciosEspeciales(true);
                if (form.productos.length === 0) {
                  setForm(prev => ({ ...prev, productos: [{ producto_id: '', valor: 0 }] }));
                }
              }}
              disabled={mostrarPreciosEspeciales}
            >
              Precio Especial
            </button>
          </div>
          {mostrarPreciosEspeciales && (
            <fieldset className="border p-4 rounded-md mt-4">
              <legend className="text-lg font-medium text-gray-700 px-2">Productos Asociados</legend>
              <div className="mb-2 hidden md:grid md:grid-cols-[minmax(0,1fr)_120px_32px] items-center gap-2 font-semibold text-sm text-gray-600 px-3">
                <span>Producto</span>
                <span className="text-right">Valor Asignado</span>
                <span />
              </div>
              <div className="space-y-3">
                {form.productos.map((item, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_120px_32px] items-center gap-2 border-b pb-2 last:border-b-0 md:border-none md:pb-0">
                    {/* Selector de Producto */}
                    <div className="w-full">
                      <label className="md:hidden text-xs font-medium text-gray-500">Producto (ID)</label>
                      <select
                        name="producto_id"
                        value={item.producto_id}
                        onChange={(e) => handleProductoItemChange(index, e)}
                        className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="" disabled> -- Seleccionar -- </option>
                        {cargandoProductos && <option disabled>Cargando productos...</option>}
                        {errorProductos && <option disabled>Error al cargar productos</option>}
                        {!cargandoProductos && !errorProductos  && (
                          <option disabled>No hay productos disponibles</option>
                        )}
                        {!cargandoProductos && !errorProductos && productosDisponibles && (
                          productosDisponibles.map((producto: Producto) => (
                            <option value={producto.id} key={producto.id}>
                              {producto.nombre} {producto.codigo ? `(${producto.codigo})` : `(ID: ${producto.id})`}
                            </option>
                          ))
                        )}
                      </select>
                      {index === 0 && errorProductos && <p className="text-xs text-red-600 mt-1">{errorProductos}</p>}
                    </div>
                    {/* Input para el Valor */}
                    <div className="w-full">
                      <label className="md:hidden text-xs font-medium text-gray-500">Valor</label>
                      <input
                        className="shadow-sm border rounded w-full py-2 px-2 text-gray-700 text-right focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        type="number"
                        name="valor"
                        placeholder="Valor"
                        value={item.valor === 0 ? '' : item.valor}
                        onChange={(e) => handleProductoItemChange(index, e)}
                        min="0"
                        step="0.01"
                      />
                    </div>
                    {/* Botón Eliminar Fila */}
                    <div className="flex justify-end md:justify-center items-center">
                      {form.productos.length > 1 && (
                        <button
                          type="button"
                          onClick={() => eliminarProducto(index)}
                          className="text-red-500 hover:text-red-700 font-bold text-xl leading-none p-1 rounded-full hover:bg-red-100"
                          title="Eliminar producto"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {/* Botón para agregar más productos */}
              <button
                type="button"
                onClick={agregarProducto}
                className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                + Agregar Producto
              </button>
            </fieldset>
          )}
          {/* --- FIN SECCIÓN DE PRODUCTOS --- */}


          {/* --- Observaciones y Botón Submit (sin cambios) --- */}
          <label className="block mt-4">
            <span className="font-medium">Observaciones</span>
            <textarea name="observaciones" value={form.observaciones} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded" rows={3} />
          </label>
          <button type="submit" className="bg-[#312b81] text-white font-bold py-2 px-4 rounded hover:bg-[#27226a] mt-4">
            Guardar Cliente
          </button>
        </form>
      </div>
    </main>
  );
}