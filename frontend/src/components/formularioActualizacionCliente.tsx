'use client';

import { useEffect, useState, ChangeEvent, FormEvent, useCallback } from 'react';
import { useProductsContext, Producto } from "@/context/ProductsContext";
import BotonVolver from './BotonVolver';

// Interfaz para un item de precio especial en el estado del formulario
interface ProductoPrecioEspecialItem {
  id_precio_especial?: number;   // ID de la entrada PrecioEspecialCliente (si ya existe, viene de la API)
  producto_id: string;           // ID del producto (en el form, lo manejaremos como string para el select)
  valor: number;                  // Precio especial asignado
  activo: boolean;                // Estado activo
  temp_key?: string;             // Key temporal para React si es un ítem nuevo
  api_producto_nombre?: string;    // Nombre del producto como vino de la API de precios especiales
  api_producto_id_original_api?: number; // El ID del producto como vino de la API de precios especiales
}

// Interfaz para el estado completo del formulario de actualización
interface FormState {
  nombre_razon_social: string;
  cuit: string; // CUIT como string
  direccion: string;
  localidad: string;
  provincia: string;
  codigo_postal: string; // CP como string
  telefono: string;
  email: string;
  contacto_principal: string; // Nombre/ID del contacto como string
  observaciones: string;
  precios_especiales_form: ProductoPrecioEspecialItem[];
}

// Tipo para los datos de UN precio especial como viene de la API /precios_especiales/obtener-por-cliente/ID_CLIENTE
interface PrecioEspecialDesdeAPI {
  id: number; // Este es id_precio_especial
  cliente_id: number;
  producto_id: number;
  producto_nombre: string;
  precio_unitario_fijo_ars: string; // Viene como string desde la API
  activo: boolean;
  // fecha_creacion y fecha_modificacion no son necesarias para el form
}

const initialFormState: FormState = {
  nombre_razon_social: '',
  cuit: '',
  direccion: '',
  localidad: '',
  provincia: '',
  codigo_postal: '',
  telefono: '',
  email: '',
  contacto_principal: '',
  observaciones: '',
  precios_especiales_form: [],
};


export default function FormularioActualizacionCliente({ id_cliente }: { id_cliente: number | undefined }) {
  const [form, setForm] = useState<FormState>(initialFormState);
  // Eliminado: preciosEspecialesOriginales, ya no se usa
  const [isLoading, setIsLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccessMessage, setSubmitSuccessMessage] = useState<string | null>(null);
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null);
  // Estado para mostrar/ocultar precios especiales
  const [mostrarPreciosEspeciales, setMostrarPreciosEspeciales] = useState(false);

  const {
    productos: productosDisponiblesContext,
    loading: cargandoProductosContext,
    error: errorProductosContext,
  } = useProductsContext();

  const cargarDatosCompletosCliente = useCallback(async (clienteId: number) => {
    setIsLoading(true);
    setErrorCarga(null);
    setSubmitSuccessMessage(null);
    setSubmitErrorMessage(null);
    setForm(initialFormState); 
  // Eliminado: setPreciosEspecialesOriginales([]);

    const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
    if (!token) {
        setErrorCarga("No se encontró token de autenticación.");
        setIsLoading(false);
        return;
    }

    try {
      // 1. Cargar datos del cliente
      const resCliente = await fetch(`https://quimex.sistemataup.online/clientes/obtener/${clienteId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!resCliente.ok) {
        const errDataCliente = await resCliente.json().catch(() => ({}));
        throw new Error(errDataCliente.message || `Error al cargar datos del cliente: ${resCliente.statusText}`);
      }
      const datosCliente = await resCliente.json();

      // 2. Cargar precios especiales para este cliente
      const resPrecios = await fetch(`https://quimex.sistemataup.online/precios_especiales/obtener-por-cliente/${clienteId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      let preciosDelClienteApi: PrecioEspecialDesdeAPI[] = [];
      if (resPrecios.ok) {
        // LA API DEVUELVE DIRECTAMENTE EL ARRAY
        preciosDelClienteApi = await resPrecios.json(); 
       
      } else if (resPrecios.status !== 404) { 
        const errorDataPrecios = await resPrecios.json().catch(() => ({}));
        console.error("Error API al cargar precios especiales (status no 404):", errorDataPrecios);
        throw new Error(errorDataPrecios.message || `Error al cargar precios especiales: ${resPrecios.statusText}`);
      }

      // Mapear los datos de la API de precios al formato del formulario
      const preciosFormateados: ProductoPrecioEspecialItem[] = preciosDelClienteApi.map(p => ({
        id_precio_especial: p.id,                 // ID del registro de precio especial
        producto_id: String(p.producto_id),       // ID del producto (como string para el select)
        valor: parseFloat(p.precio_unitario_fijo_ars) || 0,
        activo: p.activo,
        api_producto_nombre: p.producto_nombre,    // Nombre del producto para mostrar
        api_producto_id_original_api: p.producto_id, // ID original del producto de la API de precios
      }));  


      setForm({
        nombre_razon_social: datosCliente.nombre_razon_social || '',
        cuit: String(datosCliente.cuit || ''),
        direccion: datosCliente.direccion || '',
        localidad: datosCliente.localidad || '',
        provincia: datosCliente.provincia || '',
        codigo_postal: String(datosCliente.codigo_postal || ''),
        telefono: datosCliente.telefono || '',
        email: datosCliente.email || '',
        contacto_principal: datosCliente.contacto_principal || '',
        observaciones: datosCliente.observaciones || '',
        precios_especiales_form: preciosFormateados.length > 0 ? preciosFormateados : [],
      });
  // Eliminado: setPreciosEspecialesOriginales(preciosFormateados);
      setMostrarPreciosEspeciales(preciosFormateados.length > 0); // Mostrar sección si ya tiene precios

    } catch (error) {
      console.error("Error en cargarDatosCompletosCliente:", error);
      setErrorCarga(error instanceof Error ? error.message : "Error desconocido al cargar datos.");
    } finally {
      setIsLoading(false);
    }
  }, []); // id_cliente se maneja en el useEffect de abajo

  useEffect(() => {
    if (id_cliente) {
      cargarDatosCompletosCliente(id_cliente);
    } else {
      setErrorCarga("ID de cliente no válido.");
      setIsLoading(false);
    }
  }, [id_cliente, cargarDatosCompletosCliente]);


  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handlePrecioEspecialChange = (
    index: number,
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    const list = [...form.precios_especiales_form];
    const currentItem = list[index];

    if (name === 'producto_id') {
      currentItem.producto_id = value; // Value del select ya es string
      // Al cambiar el producto, si era un ítem existente (con id_precio_especial),
      // se debe considerar que el precio especial original para el producto anterior
      // podría necesitar ser eliminado, y este se tratará como uno nuevo para el nuevo producto.
      // La lógica de handleSubmit se encargará de esto.
      // También podríamos resetear el valor aquí, o buscar un precio por defecto para el nuevo producto.
      // currentItem.valor = 0; // Opcional: resetear valor
    } else if (name === 'valor') {
      currentItem.valor = Number(value) || 0;
    } else if (name === 'activo' && type === 'checkbox') {
      currentItem.activo = (e.target as HTMLInputElement).checked;
    }
    setForm(prev => ({ ...prev, precios_especiales_form: list }));
  };

  const agregarPrecioEspecial = () => {
    setForm(prev => ({
      ...prev,
      precios_especiales_form: [
        ...prev.precios_especiales_form,
        { temp_key: Date.now().toString(), producto_id: '', valor: 0, activo: true }
      ]
    }));
  };

  const eliminarPrecioEspecial = (index: number) => {
    const list = [...form.precios_especiales_form];
    // const itemEliminado = list[index];
    list.splice(index, 1);
    setForm(prev => ({ ...prev, precios_especiales_form: list }));
    // Si itemEliminado tenía un id_precio_especial, la lógica de handleSubmit lo marcará para eliminación.
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!id_cliente) {
      setSubmitErrorMessage("Error: No se puede actualizar sin un ID de cliente.");
      return;
    }
    setIsSubmitting(true);
    setSubmitSuccessMessage(null);
    setSubmitErrorMessage(null);

    const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
    if (!token) {
        setSubmitErrorMessage("Error: No se encontró token de autenticación.");
        setIsSubmitting(false);
        return;
    }

    const datosClienteActualizar = {
      nombre_razon_social: form.nombre_razon_social,
      cuit: form.cuit || null, // Enviar null si está vacío, o la API debe permitir string vacío
      direccion: form.direccion,
      localidad: form.localidad,
      provincia: form.provincia,
      codigo_postal: form.codigo_postal || null,
      telefono: form.telefono,
      email: form.email,
      contacto_principal: form.contacto_principal,
      observaciones: form.observaciones,
    };

    try {
      const resCliente = await fetch(`https://quimex.sistemataup.online/clientes/actualizar/${id_cliente}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(datosClienteActualizar),
      });

      if (!resCliente.ok) {
        const errorData = await resCliente.json().catch(() => ({ message: "Error al actualizar el cliente." }));
        throw new Error(errorData.message || `Error ${resCliente.status} actualizando cliente`);
      }

    // Sincronizar precios especiales
    // ...existing precios especiales logic...
  } catch (error) {
    setSubmitErrorMessage(error instanceof Error ? error.message : "Error desconocido al actualizar el cliente.");
  } finally {
    setIsSubmitting(false);
  }
};

  if (isLoading) {
    return <div className="text-center p-10 text-white">Cargando datos del cliente...</div>;
  }
  if (errorCarga) {
    return <div className="text-center p-10 text-red-300 bg-red-900 bg-opacity-50 rounded-md">Error al cargar: {errorCarga}</div>;
  }

  return (
    <main className="min-h-screen bg-[#20119d] text-white p-4 sm:p-8">
      <div className="max-w-3xl mx-auto bg-white text-black p-6 rounded-lg shadow-xl">
        <BotonVolver className="ml-0" />
        <h1 className="text-3xl font-bold mb-6 text-center text-indigo-700">
          Actualizar Cliente (ID: {id_cliente})
        </h1>
        {submitSuccessMessage && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4" role="alert">{submitSuccessMessage}</div>}
        {submitErrorMessage && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert">{submitErrorMessage}</div>}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Campos del Cliente */}
          <fieldset className="border p-4 rounded-md">
            <legend className="text-xl font-semibold text-gray-700 px-2 mb-2">Datos del Cliente</legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Nombre o Razón Social*</label>
                <input type="text" name="nombre_razon_social" value={form.nombre_razon_social} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">CUIT</label>
                <input type="text" name="cuit" value={form.cuit} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500" placeholder="Ej: 20123456789"/>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Dirección</label>
                <input type="text" name="direccion" value={form.direccion} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Localidad</label>
                <input type="text" name="localidad" value={form.localidad} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Provincia</label>
                <input type="text" name="provincia" value={form.provincia} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Código Postal</label>
                <input type="text" name="codigo_postal" value={form.codigo_postal} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500"/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Teléfono</label>
                <input type="tel" name="telefono" value={form.telefono} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500"/>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input type="email" name="email" value={form.email} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500"/>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Contacto Principal</label>
                <input type="text" name="contacto_principal" value={form.contacto_principal} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500"/>
              </div>
            </div>
          </fieldset>

          {/* Botón para mostrar/ocultar sección de precios especiales */}
          {!mostrarPreciosEspeciales && (
            <button
              type="button"
              className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-medium shadow-sm"
              onClick={() => setMostrarPreciosEspeciales(true)}
            >
              + Precio Especial
            </button>
          )}

          {/* SECCIÓN DE PRECIOS ESPECIALES */}
          {mostrarPreciosEspeciales && (
            <fieldset className="border p-4 rounded-md mt-4">
              <legend className="text-xl font-semibold text-gray-700 px-2 mb-2">Precios Especiales</legend>
              <div className="hidden md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,0.5fr)_minmax(0,0.5fr)] items-center gap-x-2 font-semibold text-sm text-gray-600 px-1 mb-1">
                <span>Producto</span>
                <span className="text-right">Precio Especial (ARS)</span>
                <span className="text-center">Activo</span>
                <span />
              </div>
              <div className="space-y-4">
                {form.precios_especiales_form.length > 0 ? (
                  form.precios_especiales_form.map((item, index) => (
                    <div key={item.id_precio_especial || item.temp_key || index}
                      className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,0.5fr)_minmax(0,0.5fr)] items-center gap-x-2 gap-y-2 p-2 border rounded-md hover:bg-gray-50">
                      <div className="w-full">
                        <label className="md:hidden text-xs font-medium text-gray-500">Producto</label>
                        <select
                          name="producto_id"
                          value={item.producto_id}
                          onChange={(e) => handlePrecioEspecialChange(index, e)}
                          className="w-full p-2 border border-gray-300 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                          required
                          disabled={cargandoProductosContext || !!errorProductosContext || !productosDisponiblesContext || productosDisponiblesContext.length === 0 || !!item.id_precio_especial}
                        >
                          <option value="" disabled> -- Seleccionar Producto -- </option>
                          {cargandoProductosContext && <option disabled>Cargando productos...</option>}
                          {errorProductosContext && <option disabled>Error al cargar productos.</option>}
                          {item.id_precio_especial && item.api_producto_nombre && item.api_producto_id_original_api &&
                            !productosDisponiblesContext?.find(p => String(p.id) === String(item.api_producto_id_original_api)) && (
                              <option value={String(item.api_producto_id_original_api)} disabled>
                                {item.api_producto_nombre} (Actual)
                              </option>
                          )}
                          {!cargandoProductosContext && !errorProductosContext && productosDisponiblesContext && productosDisponiblesContext.length > 0 && (
                            productosDisponiblesContext.map((producto: Producto) => (
                              <option value={String(producto.id)} key={producto.id}>
                                {producto.nombre} {producto.codigo ? `(${producto.codigo})` : ''}
                              </option>
                            ))
                          )}
                          {!cargandoProductosContext && !errorProductosContext && (!productosDisponiblesContext || productosDisponiblesContext.length === 0) && (
                            <option disabled>No hay productos disponibles</option>
                          )}
                        </select>
                      </div>
                      <div className="w-full">
                        <label className="md:hidden text-xs font-medium text-gray-500">Precio Especial (ARS)</label>
                        <input
                          className="w-full p-2 border border-gray-300 rounded shadow-sm text-right focus:ring-indigo-500 focus:border-indigo-500"
                          type="number"
                          name="valor"
                          placeholder="0.00"
                          value={item.valor === 0 && item.producto_id === '' ? '' : item.valor}
                          onChange={(e) => handlePrecioEspecialChange(index, e)}
                          min="0"
                          step="0.01"
                        />
                      </div>
                      <div className="w-full flex md:justify-center items-center">
                        <input
                          id={`activo-${index}`}
                          type="checkbox"
                          name="activo"
                          checked={item.activo}
                          onChange={(e) => handlePrecioEspecialChange(index, e)}
                          className="h-5 w-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 mr-2"
                        />
                        <label htmlFor={`activo-${index}`} className="text-sm text-gray-700">Activo</label>
                      </div>
                      <div className="flex justify-end md:justify-center items-center">
                        <button
                          type="button"
                          onClick={() => eliminarPrecioEspecial(index)}
                          className="text-red-500 hover:text-red-700 font-bold text-xl p-1 rounded-full hover:bg-red-100"
                          title="Eliminar este precio especial"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 px-3 py-2">No hay precios especiales definidos para este cliente. Puede agregar uno nuevo.</p>
                )}
              </div>
              <button
                type="button"
                onClick={agregarPrecioEspecial}
                className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-medium shadow-sm disabled:opacity-60"
                disabled={cargandoProductosContext || !!errorProductosContext || !productosDisponiblesContext || productosDisponiblesContext.length === 0}
              >
                + Agregar Nuevo Precio Especial
              </button>
              {/* Botón para ocultar sección */}
              <button
                type="button"
                className="ml-4 mt-4 bg-gray-300 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-400 text-sm font-medium shadow-sm"
                onClick={() => setMostrarPreciosEspeciales(false)}
              >
                Ocultar Precios Especiales
              </button>
            </fieldset>
          )}

          <label className="block mt-4">
            <span className="text-sm font-medium text-gray-700">Observaciones</span>
            <textarea name="observaciones" value={form.observaciones} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded shadow-sm focus:ring-indigo-500 focus:border-indigo-500" rows={3} />
          </label>

          <div className="flex justify-end mt-8">
            <button
              type="submit"
              className="bg-indigo-700 text-white font-bold py-3 px-8 rounded-lg hover:bg-indigo-800 transition duration-150 ease-in-out disabled:opacity-50 text-lg"
              disabled={isLoading || isSubmitting}
            >
              {isSubmitting ? 'Actualizando...' : (isLoading ? 'Cargando...' : 'Guardar Cambios')}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}