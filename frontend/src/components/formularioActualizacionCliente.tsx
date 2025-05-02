'use client';

import { useEffect, useState, ChangeEvent, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
// Importa tu hook y el tipo Producto desde la ubicación correcta
import { useProductsContext, Producto } from '../context/ProductsContext'; // <-- AJUSTA ESTA RUTA SI ES NECESARIO

// Interfaz para un item de producto en el estado del formulario
interface ProductoItem {
  producto_id: string | number; // ID del producto seleccionado
  valor: number;                // Valor asignado por el usuario
  // Opcional: podrías añadir un ID único para la relación cliente-producto si tu backend lo usa
  // id_cliente_producto?: number;
}

// Interfaz para el estado completo del formulario de actualización
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
  productos: ProductoItem[]; // Productos asociados a este cliente
  observaciones: string;
}

export default function FormularioActualizacionCliente({ id_cliente }: { id_cliente: number | undefined }) {
  // Hook para manejar el estado del formulario
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
    productos: [], // Inicializa como array vacío hasta que se carguen los datos
    observaciones: '',
  });
  const [isLoading, setIsLoading] = useState(true); // Estado para la carga inicial del cliente
  const [errorCarga, setErrorCarga] = useState<string | null>(null); // Estado para errores de carga

  // Consume el contexto de productos (para el dropdown)
  const {
    productos: productosDisponibles,
    loading: cargandoProductosContext, // Renombrado para evitar conflicto con isLoading
    error: errorProductosContext,
  } = useProductsContext();

  const router = useRouter();

  // --- Carga inicial de datos del cliente ---
  useEffect(() => {
    // Solo cargar si id_cliente es válido
    if (id_cliente) {
      cargarFormulario();
    } else {
      setErrorCarga("ID de cliente no válido.");
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id_cliente]); // Depende solo de id_cliente para la carga inicial


  async function cargarFormulario() {
    setIsLoading(true);
    setErrorCarga(null);
    try {
      const response = await fetch(`https://quimex.sistemataup.online/clientes/obtener/${id_cliente}`);
      if (!response.ok) {
        throw new Error(`Error al cargar datos del cliente: ${response.statusText}`);
      }
      const datos = await response.json();
      console.log("Datos recibidos para actualizar:", datos);

      // **IMPORTANTE:** Asume que tu API devuelve los productos asociados
      // en un campo llamado 'productos_asignados' o similar. AJUSTA ESTE NOMBRE.
      // Asegúrate que cada objeto tenga 'producto_id' y 'valor'.
      const productosDelCliente = datos.productos_asignados || []; // Usa [] si no viene el campo

      setForm({
        nombre_razon_social: datos.nombre_razon_social || '',
        cuit: datos.cuit || 0,
        direccion: datos.direccion || '',
        localidad: datos.localidad || '',
        provincia: datos.provincia || '',
        codigo_postal: datos.codigo_postal || 0,
        telefono: datos.telefono || '',
        email: datos.email || '',
        contacto_principal: datos.contacto_principal || 0,
        // Carga los productos existentes del cliente
        //eslint-disable-next-line
        productos: productosDelCliente.map((p: any) => ({ // Mapea a la estructura de ProductoItem
            producto_id: p.producto_id, // Asegúrate que el nombre del campo sea correcto
            valor: p.valor            // Asegúrate que el nombre del campo sea correcto
        })),
        observaciones: datos.observaciones || '',
      });
    } catch (error) {
      console.error("Error en cargarFormulario:", error);
      setErrorCarga(error instanceof Error ? error.message : "Error desconocido al cargar datos.");
      // Opcional: podrías resetear el form aquí si falla la carga
      // setForm(initialFormState);
    } finally {
      setIsLoading(false);
    }
  }

  // --- Handlers para el formulario principal ---
  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value,
    }));
  };

  // --- Handlers para la lista de productos (igual que en registrar) ---
  const handleProductoItemChange = (
    index: number,
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    const list = [...form.productos];
    if (name === 'producto_id') {
      list[index].producto_id = value;
    } else if (name === 'valor') {
      list[index].valor = Number(value) || 0;
    }
    setForm(prev => ({ ...prev, productos: list }));
  };

  const agregarProducto = () => {
    setForm(prev => ({
      ...prev,
      productos: [...prev.productos, { producto_id: '', valor: 0 }] // Agrega fila vacía
    }));
  };

  const eliminarProducto = (index: number) => {
    const list = [...form.productos];
    list.splice(index, 1);
    // En actualización, generalmente quieres permitir que se quede vacío
    // if (list.length === 0) {
    //   list.push({ producto_id: '', valor: 0 });
    // }
    setForm(prev => ({ ...prev, productos: list }));
  };

  // --- Handler para el envío del formulario ---
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

     if (!id_cliente) {
        alert("Error: No se puede actualizar sin un ID de cliente.");
        return;
     }

    // Prepara los datos a enviar, convirtiendo ID a número
    const dataToSend = {
      ...form,
      productos: form.productos
        .filter(p => p.producto_id !== '' && p.valor >= 0) // Filtra filas válidas
        .map(p => ({
            producto_id: Number(p.producto_id), // Convierte ID a número
            valor: p.valor
            // Si tu backend necesita el id_cliente_producto para saber cuál actualizar/borrar, inclúyelo aquí
        })),
    };

    console.log("Enviando actualización:", JSON.stringify(dataToSend, null, 2));

    try {
      const res = await fetch(`https://quimex.sistemataup.online/clientes/actualizar/${id_cliente}`, {
        method: 'PUT', // Método correcto para actualizar
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataToSend),
      });

      if (!res.ok) {
        const errorData = await res.text();
        console.error("Error response:", errorData);
        throw new Error(`Error ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      console.log('Cliente actualizado:', data);
      alert('Cliente actualizado con éxito!'); // Feedback

      // Redirige después de actualizar
      router.push('/opciones-cliente'); // O a donde quieras ir

    } catch (error) {
      console.error('Error en handleSubmit (actualización):', error);
       alert(`Error al actualizar el cliente: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // --- Renderizado Condicional ---
  if (isLoading) {
    return <div className="text-center p-10">Cargando datos del cliente...</div>;
  }

  if (errorCarga) {
    return <div className="text-center p-10 text-red-500">Error: {errorCarga}</div>;
  }

  // --- Renderizado del Formulario ---
  return (
    <main className="min-h-screen bg-[#312b81] text-white p-8">
      <div className="max-w-xl mx-auto bg-white text-black p-6 rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-6">Actualizar Cliente (ID: {id_cliente})</h1>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
          {/* --- Campos del Cliente (igual que antes, usan form.) --- */}
           {/* ... (label/input para nombre_razon_social, cuit, etc.) ... */}
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


          {/* --- SECCIÓN DE PRODUCTOS (Copiada y adaptada) --- */}
          <fieldset className="border p-4 rounded-md mt-4">
             <legend className="text-lg font-medium text-gray-700 px-2">Productos Asociados</legend>
              {/* Encabezados opcionales */}
              <div className="mb-2 hidden md:grid md:grid-cols-[minmax(0,1fr)_120px_32px] items-center gap-2 font-semibold text-sm text-gray-600 px-3">
                <span>Producto</span>
                <span className="text-right">Valor Asignado</span>
                <span />
              </div>

              {/* Lista dinámica de productos */}
              <div className="space-y-3">
                {form.productos.length > 0 ? (
                    form.productos.map((item, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_120px_32px] items-center gap-2 border-b pb-2 last:border-b-0 md:border-none md:pb-0">
                        {/* Selector de Producto */}
                        <div className="w-full">
                            <label className="md:hidden text-xs font-medium text-gray-500">Producto (ID)</label>
                            <select
                                name="producto_id"
                                value={item.producto_id} // El valor existente
                                onChange={(e) => handleProductoItemChange(index, e)}
                                className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                required
                                disabled={cargandoProductosContext || !!errorProductosContext || !productosDisponibles || productosDisponibles.length === 0}
                            >
                                <option value="" disabled> -- Seleccionar -- </option>
                                {/* Lógica condicional para mostrar opciones del contexto */}
                                {cargandoProductosContext && <option disabled>Cargando...</option>}
                                {errorProductosContext && <option disabled>Error al cargar</option>}
                                {!cargandoProductosContext && !errorProductosContext && (!productosDisponibles || productosDisponibles.length === 0) && (
                                    <option disabled>No hay productos</option>
                                )}
                                {!cargandoProductosContext && !errorProductosContext && productosDisponibles && productosDisponibles.length > 0 && (
                                    productosDisponibles.map((producto: Producto) => (
                                        <option value={producto.id} key={producto.id}>
                                            {producto.nombre} {producto.codigo ? `(${producto.codigo})` : `(ID: ${producto.id})`}
                                        </option>
                                    ))
                                )}
                            </select>
                             {/* Mostrar error del contexto solo una vez */}
                             {index === 0 && errorProductosContext && <p className="text-xs text-red-600 mt-1">{errorProductosContext}</p>}
                        </div>

                        {/* Input para el Valor */}
                         <div className="w-full">
                            <label className="md:hidden text-xs font-medium text-gray-500">Valor</label>
                            <input
                                className="shadow-sm border rounded w-full py-2 px-2 text-gray-700 text-right focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                type="number"
                                name="valor"
                                placeholder="Valor"
                                value={item.valor === 0 ? '' : item.valor} // Muestra valor existente
                                onChange={(e) => handleProductoItemChange(index, e)}
                                min="0"
                                step="0.01"
                                required
                            />
                        </div>

                        {/* Botón Eliminar Fila */}
                        <div className="flex justify-end md:justify-center items-center">
                            {/* Siempre permitir eliminar en la actualización */}
                            <button
                                type="button"
                                onClick={() => eliminarProducto(index)}
                                className="text-red-500 hover:text-red-700 font-bold text-xl leading-none p-1 rounded-full hover:bg-red-100"
                                title="Eliminar producto"
                            >
                                ×
                            </button>
                        </div>
                    </div>
                    ))
                ) : (
                    // Mensaje si no hay productos asignados inicialmente
                    <p className="text-sm text-gray-500 px-3">Este cliente no tiene productos asociados.</p>
                )}
              </div>

              {/* Botón para agregar más productos */}
              <button
                type="button"
                onClick={agregarProducto}
                className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={cargandoProductosContext || !!errorProductosContext || !productosDisponibles || productosDisponibles.length === 0}
              >
                + Agregar Producto
              </button>
          </fieldset>
          {/* --- FIN SECCIÓN DE PRODUCTOS --- */}


          {/* --- Observaciones y Botón Submit --- */}
          <label className="block mt-4">
            <span className="font-medium">Observaciones</span>
            <textarea name="observaciones" value={form.observaciones} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded" rows={3} />
          </label>

          <button
            type="submit"
            className="bg-[#312b81] text-white font-bold py-2 px-4 rounded hover:bg-[#27226a] mt-4"
             // Deshabilitar mientras se carga o si falla la carga inicial
            disabled={isLoading}
          >
            {isLoading ? 'Cargando...' : 'Actualizar Cliente'}
          </button>
        </form>
      </div>
    </main>
  );
}