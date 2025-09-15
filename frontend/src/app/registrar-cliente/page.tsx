'use client';

import { useState, ChangeEvent, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
// Importa tu hook y el tipo Producto desde la ubicación correcta

import { useProductsContext, Producto } from "@/context/ProductsContext"; // <-- Asegúrate que incluya , Producto
import BotonVolver from '@/components/BotonVolver';

// Usar variable de entorno pública de Next (con fallback para desarrollo)
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://quimex.sistemataup.online';


// Interfaz para un item de producto en el estado del formulario
interface ProductoItem {
  producto_id: string | number; // Coincide con Producto['id'] que es number, pero se maneja como string desde el select
  valor: number;
  moneda?: 'ARS' | 'USD';
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
    const router = useRouter();
  const [mostrarPreciosEspeciales, setMostrarPreciosEspeciales] = useState(false);
  // Tipo de cambio Oficial para mostrar conversión USD -> ARS
  const [tipoCambioOficial, setTipoCambioOficial] = useState<number | null>(null);
  const [tcLoading, setTcLoading] = useState(false);
  const [tcError, setTcError] = useState<string | null>(null);
    const {
      productos: productosDisponibles,
      loading: cargandoProductos,
      error: errorProductos,
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
      productos: [],
      observaciones: '',
    });
  const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
    // Traer tipo de cambio Oficial cuando el usuario habilita precios especiales
    useEffect(() => {
      const fetchTC = async () => {
        if (!mostrarPreciosEspeciales) return;
        setTcLoading(true);
        setTcError(null);
        try {
          // CORREGIDO: endpoint correcto es /tipos_cambio/obtener/<nombre>
          const url = `${API_BASE_URL}/tipos_cambio/obtener/Oficial`;
          const resTC = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
          if (!resTC.ok) throw new Error('No se pudo obtener tipo de cambio Oficial');
          const dataTC = await resTC.json();
          const valor = Number((dataTC && (dataTC.valor ?? dataTC.data?.valor)) ?? NaN);
          if (!isFinite(valor) || valor <= 0) throw new Error('Tipo de cambio inválido');
          setTipoCambioOficial(valor);
        } catch (err) {
          setTipoCambioOficial(null);
          setTcError(err instanceof Error ? err.message : 'Error al obtener tipo de cambio');
        } finally {
          setTcLoading(false);
        }
      };
      fetchTC();
    }, [mostrarPreciosEspeciales, token]);
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
        list[index].producto_id = value;
      } else if (name === 'valor') {
        list[index].valor = Number(value) || 0;
      } else if (name === 'moneda') {
        list[index].moneda = (value as 'ARS' | 'USD') || 'ARS';
      }
      setForm(prev => ({ ...prev, productos: list }));
    };
    const agregarProducto = () => {
      setForm(prev => ({
        ...prev,
        productos: [
          ...prev.productos.filter(p => p.producto_id !== ''),
          { producto_id: '', valor: 0, moneda: 'ARS' }
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
      const datosCliente: Record<string, unknown> = {
        nombre_razon_social: form.nombre_razon_social,
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
      if (form.cuit && form.cuit !== 0) {
        datosCliente.cuit = form.cuit;
      }
      try {
        const clienteHeaders: Record<string,string> = { 'Content-Type': 'application/json' };
        if (token) clienteHeaders['Authorization'] = `Bearer ${token}`;

        const resCliente = await fetch(`${API_BASE_URL}/clientes/crear`, {
          method: 'POST',
          headers: clienteHeaders,
          body: JSON.stringify(datosCliente),
        });
        if (!resCliente.ok) {
          const errorData = await resCliente.json().catch(() => ({ message: 'Error en la respuesta del servidor al crear cliente.' }));
          throw new Error(errorData.message || `Error ${resCliente.status}: ${resCliente.statusText}`);
        }
        const clienteCreado = await resCliente.json();
        if (clienteCreado.id && mostrarPreciosEspeciales && form.productos.length > 0) {
          try {
            const productosValidos = form.productos.filter(p => p.producto_id !== '' && p.valor >= 0 && Number(p.producto_id) > 0);
            for (const item of productosValidos) {
              const payloadPrecioEspecial: Record<string, unknown> = {
                cliente_id: clienteCreado.id,
                producto_id: Number(item.producto_id),
                precio_unitario_fijo_ars: item.valor, // El backend hará la conversión si es necesario
                activo: true,
                moneda_original: item.moneda || 'ARS',
                precio_original: item.valor,
              };
              const precioHeaders: Record<string,string> = { 'Content-Type': 'application/json' };
              if (token) precioHeaders['Authorization'] = `Bearer ${token}`;

              const res = await fetch(`${API_BASE_URL}/precios_especiales/crear`, {
                method: 'POST',
                headers: precioHeaders,
                body: JSON.stringify(payloadPrecioEspecial),
              });
              if (!res.ok) {
                const err = await res.json();
                throw new Error(`Error en producto ${item.producto_id}: ${JSON.stringify(err)}`);
              }
            }
          } catch (errorPrecios) {
            alert(`Cliente registrado, pero hubo errores al guardar algunos precios especiales. Revise la consola. Error: ${errorPrecios}`);
          }
        }
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
        setTimeout(() => {
          router.push('/opciones-cliente');
        }, 100);
      } catch (error) {
        alert(`Error al guardar el cliente: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
  return (
    <main className="min-h-screen bg-[#312b81] text-white p-8">
      <div className="max-w-xl mx-auto bg-white text-black p-6 rounded-lg shadow-md">
        <BotonVolver className="ml-0" />
        <h1 className="text-2xl font-bold mb-8 text-center">Registrar Cliente</h1>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
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
          {/* --- SECCIÓN DE PRODUCTOS (opcional) --- */}
          <div className="mt-4">
            <button
              type="button"
              className="bg-yellow-500 text-black px-4 py-2 rounded hover:bg-yellow-600 text-sm font-semibold shadow-sm"
              onClick={() => {
                setMostrarPreciosEspeciales(true);
                if (form.productos.length === 0) {
                  setForm(prev => ({ ...prev, productos: [{ producto_id: '', valor: 0, moneda: 'ARS' }] }));
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
              {/* Aviso de TC y USD */}
              <p className="text-xs text-gray-600 mb-2">
                Si elegís moneda USD, el precio se convierte a ARS usando el Tipo de Cambio Oficial actual.
                {tcLoading && ' (cargando TC...)'}
                {tcError && <span className="text-red-600"> — {tcError}</span>}
                {(!tcLoading && !tcError && tipoCambioOficial) && ` — TC Oficial: ${tipoCambioOficial}`}
              </p>
              <div className="mb-2 hidden md:grid md:grid-cols-[minmax(0,1fr)_120px_32px] items-center gap-2 font-semibold text-sm text-gray-600 px-3">
                <span>Producto</span>
                <span className="text-right">Valor Asignado</span>
                <span />
              </div>
              <div className="space-y-3">
                {form.productos.map((item, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_120px_32px] items-center gap-2 border-b pb-2 last:border-b-0 md:border-none md:pb-0">
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
                    <div className="w-full">
                      <label className="md:hidden text-xs font-medium text-gray-500">Valor</label>
                      <div className="flex items-center gap-2">
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
                        {item.moneda === 'USD' && (
                          <span className="text-xs text-gray-500 whitespace-nowrap">
                            {tcLoading ? '(calculando ARS...)' : tcError ? '(tc error)' : tipoCambioOficial ? `ARS ${ (Number(item.valor || 0) * tipoCambioOficial).toFixed(2) }` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="w-full md:w-28">
                      <label className="md:hidden text-xs font-medium text-gray-500">Moneda</label>
                      <select
                        name="moneda"
                        value={item.moneda || 'ARS'}
                        onChange={(e) => handleProductoItemChange(index, e)}
                        className="shadow-sm border rounded w-full py-2 px-2 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="ARS">ARS</option>
                        <option value="USD">USD</option>
                      </select>
                    </div>
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

