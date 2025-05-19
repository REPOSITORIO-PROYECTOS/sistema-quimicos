'use client';

import { useEffect, useState, ChangeEvent, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useProductsContext, Producto } from "@/context/ProductsContext";  // <-- AJUSTA ESTA RUTA

// Interfaz para un item de precio especial en el estado del formulario
interface ProductoPrecioEspecialItem {
  id_precio_especial?: number;   // ID de la entrada PrecioEspecialCliente (si ya existe)
  producto_id: string | number;   // ID del producto
  valor: number;                  // Precio especial asignado
  activo?: boolean;               // Estado activo
  temp_key?: string;             // Key temporal para React si es un ítem nuevo
  // Podrías añadir producto_nombre y producto_codigo aquí si quieres guardar lo que venía de la API
  // para mostrarlo si el producto ya no está en el contexto general.
  api_producto_nombre?: string;
  api_producto_codigo?: string;
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
  observaciones: string;
  precios_especiales_form: ProductoPrecioEspecialItem[];
}

// Tipo para los datos de precios especiales que vienen de la API GET /precios_especiales?cliente_id=X
interface PrecioEspecialAPI {
  id: number; // Este es id_precio_especial
  cliente_id: number;
  producto_id: number;
  producto: { // Asumo que el producto viene anidado así desde tu API
    id: number;
    nombre: string;
    codigo?: string;
  };
  precio_unitario_fijo_ars: string; // Viene como string
  activo: boolean;
}

const initialFormState: FormState = {
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
  precios_especiales_form: [],
};

export default function FormularioActualizacionCliente({ id_cliente }: { id_cliente: number | undefined }) {
  const [form, setForm] = useState<FormState>(initialFormState);
  const [preciosEspecialesOriginales, setPreciosEspecialesOriginales] = useState<ProductoPrecioEspecialItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    productos: productosDisponiblesContext,
    loading: cargandoProductosContext,
    error: errorProductosContext,
  } = useProductsContext();
  const router = useRouter();

  useEffect(() => {
    if (id_cliente) {
      cargarDatosCompletosCliente(id_cliente);
    } else {
      setErrorCarga("ID de cliente no válido.");
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id_cliente]);

  async function cargarDatosCompletosCliente(clienteId: number) {
    setIsLoading(true);
    setErrorCarga(null);
    setForm(initialFormState); // Resetear antes de cargar
    setPreciosEspecialesOriginales([]);

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
      if (!resCliente.ok) throw new Error(`Error al cargar datos del cliente: ${resCliente.statusText}`);
      const datosCliente = await resCliente.json();
      console.log("Datos del cliente recibidos:", datosCliente);

      // 2. Cargar precios especiales para este cliente
      const resPrecios = await fetch(`https://quimex.sistemataup.online/precios_especiales?cliente_id=${clienteId}&per_page=1000`, { // Asumimos muchos precios, ajustar per_page
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      let preciosDelClienteApi: PrecioEspecialAPI[] = [];
      if (resPrecios.ok) {
        const datosPrecios = await resPrecios.json();
        console.log("Precios especiales recibidos:", datosPrecios);
        preciosDelClienteApi = datosPrecios.precios_especiales || [];
      } else if (resPrecios.status !== 404) { // 404 significa que no tiene precios, no es un error fatal
        throw new Error(`Error al cargar precios especiales: ${resPrecios.statusText}`);
      }


      const preciosFormateados: ProductoPrecioEspecialItem[] = preciosDelClienteApi.map(p => ({
        id_precio_especial: p.id,
        producto_id: String(p.producto.id), // Viene de p.producto.id
        valor: parseFloat(p.precio_unitario_fijo_ars) || 0,
        activo: p.activo,
        api_producto_nombre: p.producto.nombre,
        api_producto_codigo: p.producto.codigo,
      }));

      setForm({
        nombre_razon_social: datosCliente.nombre_razon_social || '',
        cuit: datosCliente.cuit || 0,
        direccion: datosCliente.direccion || '',
        localidad: datosCliente.localidad || '',
        provincia: datosCliente.provincia || '',
        codigo_postal: datosCliente.codigo_postal || 0,
        telefono: datosCliente.telefono || '',
        email: datosCliente.email || '',
        contacto_principal: datosCliente.contacto_principal || 0,
        observaciones: datosCliente.observaciones || '',
        precios_especiales_form: preciosFormateados.length > 0 
                                ? preciosFormateados 
                                : [{ temp_key: Date.now().toString(), producto_id: '', valor: 0, activo: true }],
      });
      setPreciosEspecialesOriginales(preciosFormateados);

    } catch (error) {
      console.error("Error en cargarDatosCompletosCliente:", error);
      setErrorCarga(error instanceof Error ? error.message : "Error desconocido al cargar datos.");
    } finally {
      setIsLoading(false);
    }
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value,
    }));
  };

  const handlePrecioEspecialChange = (
    index: number,
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLInputElement> // Incluye checkbox
  ) => {
    const { name, value, type } = e.target;
    const list = [...form.precios_especiales_form];
    const currentItem = list[index];

    if (name === 'producto_id') {
      currentItem.producto_id = value;
      // Si se cambia el producto de un ítem que tenía id_precio_especial, ese ID ya no es válido para ese producto.
      // Se tratará como "crear uno nuevo para este producto" y "eliminar el viejo".
      // Opcional: podrías resetear id_precio_especial aquí si la lógica de submit lo requiere.
      // delete currentItem.id_precio_especial;
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
        { temp_key: Date.now().toString(), producto_id: '', valor: 0, activo: true } // Nuevo ítem
      ]
    }));
  };

  const eliminarPrecioEspecial = (index: number) => {
    const list = [...form.precios_especiales_form];
    list.splice(index, 1);
    setForm(prev => ({ ...prev, precios_especiales_form: list }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!id_cliente) {
      alert("Error: No se puede actualizar sin un ID de cliente.");
      return;
    }
    setIsSubmitting(true);

    const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
    if (!token) {
        alert("Error: No se encontró token de autenticación.");
        setIsSubmitting(false);
        return;
    }

    const datosClienteActualizar = {
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
    };

    try {
      console.log("Actualizando datos del cliente:", datosClienteActualizar);
      const resCliente = await fetch(`https://quimex.sistemataup.online/clientes/actualizar/${id_cliente}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(datosClienteActualizar),
      });

      if (!resCliente.ok) {
        const errorData = await resCliente.json().catch(() => ({ message: "Error al actualizar el cliente." }));
        throw new Error(errorData.message || `Error ${resCliente.status}`);
      }
      console.log('Datos del cliente actualizados con éxito.');

      // Sincronizar precios especiales
      const preciosFormActualValidos = form.precios_especiales_form.filter(
        p => p.producto_id && Number(p.producto_id) > 0 && p.valor >= 0
      );
      //eslint-disable-next-line
      const promesasPrecios: Promise<any>[] = [];

      // 1. Identificar precios a ELIMINAR
      
      preciosEspecialesOriginales.forEach(original => {
        const encontradoEnForm = preciosFormActualValidos.find(p => p.id_precio_especial === original.id_precio_especial);
        if (!encontradoEnForm && original.id_precio_especial) {
          console.log(`Preparando para eliminar precio especial ID: ${original.id_precio_especial}`);
          promesasPrecios.push(
            fetch(`https://quimex.sistemataup.online/precios_especiales/${original.id_precio_especial}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` },
            }).then(res => {
              if (!res.ok && res.status !== 404) {
                 return res.json().then(err => Promise.reject({ action: 'delete', id: original.id_precio_especial, error: err, status: res.status }));
              }
              return { action: 'delete', id: original.id_precio_especial, success: true };
            })
          );
        }
      });

      // 2. Identificar precios a CREAR o ACTUALIZAR
      for (const actual of preciosFormActualValidos) {
        const original = preciosEspecialesOriginales.find(o => o.id_precio_especial === actual.id_precio_especial);

        if (!actual.id_precio_especial || !original) { // Es NUEVO (no tiene id_precio_especial O no estaba en los originales)
          console.log(`Preparando para crear nuevo precio especial para producto ID: ${actual.producto_id}`);
          const payloadCrear = {
            cliente_id: id_cliente,
            producto_id: Number(actual.producto_id),
            precio_unitario_fijo_ars: String(actual.valor),
            activo: actual.activo === undefined ? true : actual.activo,
          };
          promesasPrecios.push(
            fetch(`https://quimex.sistemataup.online/precios_especiales`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify(payloadCrear),
            }).then(res => {
              if (!res.ok) return res.json().then(err => Promise.reject({ action: 'create', producto_id: actual.producto_id, error: err, status: res.status }));
              return res.json().then(data => ({ action: 'create', data }));
            })
          );
        } else if (original) { // Existe, verificar si hay cambios para ACTUALIZAR
          const necesitaActualizacion =
            String(original.producto_id) !== String(actual.producto_id) || // Cambio de producto implica borrar viejo y crear nuevo (manejado arriba y abajo)
            original.valor !== actual.valor ||
            (original.activo === undefined ? true : original.activo) !== (actual.activo === undefined ? true : actual.activo);

          if (necesitaActualizacion && actual.id_precio_especial) {
            console.log(`Preparando para actualizar precio especial ID: ${actual.id_precio_especial}`);
            const payloadActualizar = {
              precio_unitario_fijo_ars: String(actual.valor),
              activo: actual.activo === undefined ? true : actual.activo,
            };
            // No se puede cambiar producto_id ni cliente_id en un PUT a un precio_especial_id existente.
            // Si se cambió producto_id, la lógica anterior de "eliminar original no encontrado" y "crear nuevo" debería manejarlo.
            if (String(original.producto_id) === String(actual.producto_id)) { // Solo actualizar si el producto NO cambió
                promesasPrecios.push(
                fetch(`https://quimex.sistemataup.online/precios_especiales/${actual.id_precio_especial}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify(payloadActualizar),
                }).then(res => {
                    if (!res.ok) return res.json().then(err => Promise.reject({ action: 'update', id: actual.id_precio_especial, error: err, status: res.status }));
                    return res.json().then(data => ({ action: 'update', data }));
                })
                );
            }
          }
        }
      }

      if (promesasPrecios.length > 0) {
        const resultados = await Promise.allSettled(promesasPrecios);
        console.log("Resultados de sincronización de precios especiales:", resultados);
        const erroresPrecios = resultados.filter(r => r.status === 'rejected');
        if (erroresPrecios.length > 0) {
            console.error("Errores durante la sincronización de precios:", erroresPrecios);
            alert(`Cliente actualizado, pero hubo ${erroresPrecios.length} error(es) al sincronizar precios especiales. Revise la consola.`);
        }
      }

      alert('Cliente y precios especiales procesados con éxito!');
      // Es buena idea recargar los datos para reflejar los cambios o IDs creados si el usuario se queda en la página.
      // O simplemente redirigir.
      // cargarDatosCompletosCliente(id_cliente); 
      router.push('/opciones-cliente'); // Ajusta la ruta de redirección

    } catch (error) {
      console.error('Error en handleSubmit (actualización):', error);
      alert(`Error al actualizar: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className="text-center p-10">Cargando datos del cliente...</div>;
  }
  if (errorCarga) {
    return <div className="text-center p-10 text-red-500">Error: {errorCarga}</div>;
  }

  return (
    <main className="min-h-screen bg-[#312b81] text-white p-8">
      <div className="max-w-2xl mx-auto bg-white text-black p-6 rounded-lg shadow-md"> {/* Aumentado max-w a 2xl */}
        <h1 className="text-2xl font-bold mb-6">Actualizar Cliente (ID: {id_cliente})</h1>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
          {/* Campos del Cliente */}
          <label className="block">
            <span className="font-medium">Nombre o Razón Social</span>
            <input type="text" name="nombre_razon_social" value={form.nombre_razon_social} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded" required />
          </label>
          <label className="block">
            <span className="font-medium">CUIT</span>
            <input type="number" name="cuit" value={form.cuit === 0 ? '' : form.cuit} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded" />
          </label>
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

          {/* SECCIÓN DE PRECIOS ESPECIALES */}
          <fieldset className="border p-4 rounded-md mt-4">
             <legend className="text-lg font-medium text-gray-700 px-2">Precios Especiales</legend>
              <div className="mb-2 hidden md:grid md:grid-cols-[minmax(0,1fr)_100px_80px_32px] items-center gap-2 font-semibold text-sm text-gray-600 px-3">
                <span>Producto</span>
                <span className="text-right">Precio</span>
                <span className="text-center">Activo</span>
                <span /> {/* Para el botón de eliminar */}
              </div>

              <div className="space-y-3">
                {form.precios_especiales_form.length > 0 ? (
                    form.precios_especiales_form.map((item, index) => (
                    <div key={item.id_precio_especial || item.temp_key || index}
                         className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_100px_80px_32px] items-center gap-x-2 gap-y-1 border-b pb-2 last:border-b-0 md:border-none md:pb-0">
                        {/* Selector de Producto */}
                        <div className="w-full">
                            <label className="md:hidden text-xs font-medium text-gray-500">Producto</label>
                            <select
                                name="producto_id"
                                value={item.producto_id}
                                onChange={(e) => handlePrecioEspecialChange(index, e)}
                                className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                required
                                disabled={cargandoProductosContext || !!errorProductosContext || !productosDisponiblesContext || productosDisponiblesContext.length === 0 || !!item.id_precio_especial} // No cambiar producto de un precio existente
                            >
                                <option value="" disabled> -- Seleccionar -- </option>
                                {cargandoProductosContext && <option disabled>Cargando productos...</option>}
                                {errorProductosContext && <option disabled>Error al cargar productos.</option>}
                                
                                {/* Mostrar el producto actual si tiene ID y no está en la lista (ej. desactivado) */}
                                
                                {//eslint-disable-next-line
                                item.producto_id && item.api_producto_nombre && !productosDisponiblesContext?.find((p: { id: any; }) => String(p.id) === String(item.producto_id)) && (
                                    <option value={item.producto_id} disabled>
                                        {item.api_producto_nombre} {item.api_producto_codigo ? `(${item.api_producto_codigo})` : ''} (Actual)
                                    </option>
                                )}

                                {!cargandoProductosContext && !errorProductosContext && productosDisponiblesContext && productosDisponiblesContext.length > 0 && (
                                    productosDisponiblesContext.map((producto: Producto) => (
                                        <option value={producto.id} key={producto.id}>
                                            {producto.nombre} {producto.codigo ? `(${producto.codigo})` : ''}
                                        </option>
                                    ))
                                )}
                                 {!cargandoProductosContext && !errorProductosContext && (!productosDisponiblesContext || productosDisponiblesContext.length === 0) && (
                                    <option disabled>No hay productos disponibles</option>
                                )}
                            </select>
                        </div>

                        {/* Input para el Precio */}
                         <div className="w-full">
                            <label className="md:hidden text-xs font-medium text-gray-500">Precio</label>
                            <input
                                className="shadow-sm border rounded w-full py-2 px-2 text-gray-700 text-right focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                type="number"
                                name="valor"
                                placeholder="0.00"
                                value={item.valor === 0 && String(item.producto_id) === '' ? '' : item.valor}
                                onChange={(e) => handlePrecioEspecialChange(index, e)}
                                min="0"
                                step="0.01"
                                required
                            />
                        </div>

                        {/* Checkbox para Activo */}
                        <div className="w-full flex justify-center items-center"> {/* items-center para alinear el checkbox */}
                            <label htmlFor={`activo-${index}`} className="md:hidden text-xs font-medium text-gray-500 mr-2">Activo</label>
                            <input
                                id={`activo-${index}`}
                                type="checkbox"
                                name="activo"
                                checked={item.activo === undefined ? true : item.activo}
                                onChange={(e) => handlePrecioEspecialChange(index, e)}
                                className="h-5 w-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                            />
                        </div>

                        {/* Botón Eliminar Fila */}
                        <div className="flex justify-end md:justify-center items-center">
                            <button
                                type="button"
                                onClick={() => eliminarPrecioEspecial(index)}
                                className="text-red-500 hover:text-red-700 font-bold text-xl leading-none p-1 rounded-full hover:bg-red-100"
                                title="Eliminar precio"
                            >
                                ×
                            </button>
                        </div>
                    </div>
                    ))
                ) : (
                    <p className="text-sm text-gray-500 px-3">No hay precios especiales definidos. Puede agregar uno.</p>
                )}
              </div>

              <button
                type="button"
                onClick={agregarPrecioEspecial}
                className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 text-sm disabled:opacity-50"
                disabled={cargandoProductosContext || !!errorProductosContext || !productosDisponiblesContext || productosDisponiblesContext.length === 0}
              >
                + Agregar Precio Especial
              </button>
          </fieldset>

          {/* Observaciones y Botón Submit */}
          <label className="block mt-4">
            <span className="font-medium">Observaciones</span>
            <textarea name="observaciones" value={form.observaciones} onChange={handleChange} className="w-full p-2 mt-1 border border-gray-300 rounded" rows={3} />
          </label>
          <button
            type="submit"
            className="bg-[#312b81] text-white font-bold py-2 px-4 rounded hover:bg-[#27226a] mt-4 disabled:opacity-50"
            disabled={isLoading || isSubmitting}
          >
            {isSubmitting ? 'Actualizando...' : (isLoading ? 'Cargando...' : 'Actualizar Cliente')}
          </button>
        </form>
      </div>
    </main>
  );
}