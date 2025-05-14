'use client';

import { useState, ChangeEvent, FormEvent } from 'react';
// Importa tu hook y el tipo Producto desde la ubicación correcta

import { useProductsContext, Producto } from "@/context/ProductsContext"; // <-- Asegúrate que incluya , Producto


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
    productos: [{ producto_id: '', valor: 0 }], // Productos asociados a este cliente específico
    observaciones: '',
  });

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
      productos: [...prev.productos, { producto_id: '', valor: 0 }]
    }));
  };

  const eliminarProducto = (index: number) => {
    const list = [...form.productos];
    list.splice(index, 1);
    if (list.length === 0) {
      list.push({ producto_id: '', valor: 0 });
    }
    setForm(prev => ({ ...prev, productos: list }));
  };

  // --- Manejador de envío (sin cambios lógicos importantes) ---
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const dataToSend = {
      ...form,
      // Asegurarse de que producto_id se envíe como número si tu backend lo espera así
      productos: form.productos
        .filter(p => p.producto_id !== '' && p.valor >= 0) // Filtrar válidos (valor >= 0)
        .map(p => ({
            ...p,
            producto_id: Number(p.producto_id) // Convertir ID a número antes de enviar
        })),
    };


    console.log("Enviando:", JSON.stringify(dataToSend, null, 2));

    try {
      const res = await fetch(`https://quimex.sistemataup.online/clientes/crear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSend),
      });
      if (!res.ok) {
        const errorData = await res.text();
        console.error("Error response:", errorData);
        throw new Error(`Error ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      console.log('Cliente guardado:', data);
      // Resetear formulario
      setForm({
        nombre_razon_social: '', cuit: 0, direccion: '', localidad: '', provincia: '',
        codigo_postal: 0, telefono: '', email: '', contacto_principal: 0,
        productos: [{ producto_id: '', valor: 0 }], observaciones: '',
      });
      alert('Cliente registrado con éxito!'); // Feedback al usuario
    } catch (error) {
      console.error('Error en handleSubmit:', error);
      alert(`Error al guardar el cliente: ${error instanceof Error ? error.message : String(error)}`); // Feedback al usuario
    }
  };

  // ----- Renderizado -----
  return (
    <main className="min-h-screen bg-[#312b81] text-white p-8">
      <div className="max-w-xl mx-auto bg-white text-black p-6 rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-6">Registrar Cliente</h1>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
          {/* --- Campos del Cliente (sin cambios) --- */}
           {/* ... (todos los <label> e <input> para nombre, cuit, etc. van aquí) ... */}
           <label className="block">
            <span className="font-medium">Nombre o Razón Social</span>
            <input type="text" name="nombre_razon_social" value={form.nombre_razon_social} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded" required />
          </label>
          <label className="block">
            <span className="font-medium">CUIT</span>
            <input type="number" name="cuit" value={form.cuit === 0 ? '' : form.cuit} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded" />
          </label>
          {/* ... más campos ... */}
          <label className="block">
            <span className="font-medium">Dirección</span>
            <input type="text" name="direccion" value={form.direccion} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded"/>
          </label>
           <label className="block">
            <span className="font-medium">Localidad</span>
            <input type="text" name="localidad" value={form.localidad} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded"/>
          </label>
           <label className="block">
            <span className="font-medium">Provincia</span>
            <input type="text" name="provincia" value={form.provincia} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded"/>
          </label>
           <label className="block">
            <span className="font-medium">Código Postal</span>
            <input type="number" name="codigo_postal" value={form.codigo_postal === 0 ? '' : form.codigo_postal} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded"/>
          </label>
           <label className="block">
            <span className="font-medium">Teléfono</span>
            <input type="tel" name="telefono" value={form.telefono} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded"/>
          </label>
           <label className="block">
            <span className="font-medium">Email</span>
            <input type="email" name="email" value={form.email} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded"/>
          </label>
           <label className="block">
            <span className="font-medium">Contacto Principal</span>
            <input type="number" name="contacto_principal" value={form.contacto_principal === 0 ? '' : form.contacto_principal} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded"/>
          </label>


          {/* --- SECCIÓN DE PRODUCTOS (Usando datos del Contexto) --- */}
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
                                required
                            >
                                <option value="" disabled> -- Seleccionar -- </option>
                                {/* Lógica condicional para mostrar opciones */}
                                {cargandoProductos && <option disabled>Cargando productos...</option>}
                                {errorProductos && <option disabled>Error al cargar productos</option>}
                                {!cargandoProductos && !errorProductos  && (
                                    <option disabled>No hay productos disponibles</option>
                                )}
                             {!cargandoProductos && !errorProductos && productosDisponibles && ( // <-- Añade esta comprobación
                                productosDisponibles.map((producto: Producto) => (
                                    <option value={producto.id} key={producto.id}>
                                        {/* Muestra nombre y opcionalmente código o ID */}
                                        {producto.nombre} {producto.codigo ? `(${producto.codigo})` : `(ID: ${producto.id})`}
                                    </option>
                                ))
                            )}
                            </select>
                            {/* Mostrar error del contexto si existe */}
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
                                min="0" // Permitir valor 0 si es válido
                                step="0.01" // Para precios con decimales
                                required
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