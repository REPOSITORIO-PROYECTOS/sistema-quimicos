'use client';

import { useState, ChangeEvent, FormEvent, useEffect } from 'react';
import { useCallback } from 'react';
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
  usar_precio_base?: boolean;
  margen_sobre_base?: number | null;
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
  // Previews por índice de producto: { precio_base_ars, precio_con_margen_ars, loading, error }
  const [previews, setPreviews] = useState<Record<number, { precio_base_ars?: number | null; precio_con_margen_ars?: number | null; loading?: boolean; error?: string }>>({});
  // Calculadora modal state
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcIndex, setCalcIndex] = useState<number | null>(null);
  const [calcPrecioObjetivo, setCalcPrecioObjetivo] = useState<number | string>('');
  const [calcMoneda, setCalcMoneda] = useState<'ARS'|'USD'>('ARS');
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
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
          const tcHeaders: Record<string,string> = token ? { Authorization: `Bearer ${token}` } : {};
          const resTC = await fetch(url, { headers: tcHeaders, credentials: 'include' });
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
      const target = e.target as HTMLInputElement;
      const { name, value, type, checked } = target;
      const list = [...form.productos];
      if (name === 'producto_id') {
        list[index].producto_id = value;
      } else if (name === 'valor') {
        list[index].valor = Number(value) || 0;
      } else if (name === 'moneda') {
        list[index].moneda = (value as 'ARS' | 'USD') || 'ARS';
      } else if (name === 'usar_precio_base') {
        // support select value 'margen'|'fijo' or checkbox
        if (type === 'checkbox') {
          list[index].usar_precio_base = !!checked;
        } else {
          list[index].usar_precio_base = (value === 'margen');
        }
        if (list[index].usar_precio_base) list[index].valor = 0;
      } else if (name === 'margen_sobre_base') {
        // porcentaje como número (ej. 10 = 10%)
        list[index].margen_sobre_base = value === '' ? null : Number(value);
      }
      setForm(prev => ({ ...prev, productos: list }));

      // Si cambiaron margen o el toggle de usar_precio_base, intentar obtener preview
      setTimeout(() => {
        const itemNow = list[index];
        if (itemNow && itemNow.usar_precio_base && Number(itemNow.producto_id) > 0 && itemNow.margen_sobre_base != null) {
          fetchPreview(Number(itemNow.producto_id), Number(itemNow.margen_sobre_base), index);
        } else {
          // limpiar preview si no aplica
          setPreviews(prev => { const copy = { ...prev }; delete copy[index]; return copy; });
        }
      }, 0);
      }

  const fetchPreview = useCallback(async (productoId: number, margenPorcentaje: number, index: number) => {
    setPreviews(prev => ({ ...prev, [index]: { loading: true } }));
    try {
      const tokenLocal = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const url = `${API_BASE_URL}/precios_especiales/calcular-precio-preview/${productoId}?margen=${margenPorcentaje / 100}`;
      const headers: Record<string,string> = {};
      if (tokenLocal) headers['Authorization'] = `Bearer ${tokenLocal}`;
      const res = await fetch(url, { headers, credentials: 'include' });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        setPreviews(prev => ({ ...prev, [index]: { error: `Error servidor: ${res.status} ${txt}` } }));
        return;
      }
      const data = await res.json();
      const precio_base = data?.calculos?.precio_base_ars ?? null;
      const precio_con_margen = data?.calculos?.precio_con_margen_ars ?? null;
      setPreviews(prev => ({ ...prev, [index]: { precio_base_ars: precio_base, precio_con_margen_ars: precio_con_margen, loading: false } }));
    } catch (err) {
      setPreviews(prev => ({ ...prev, [index]: { error: String(err), loading: false } }));
    }
  }, []);
    const agregarProducto = () => {
      setForm(prev => ({
        ...prev,
        productos: [
          ...prev.productos.filter(p => p.producto_id !== ''),
          { producto_id: '', valor: 0, moneda: 'ARS', usar_precio_base: false, margen_sobre_base: null }
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
        // Preparar headers para la creación del cliente
        const clienteHeaders: Record<string,string> = { 'Content-Type': 'application/json' };
        if (token) clienteHeaders['Authorization'] = `Bearer ${token}`;

        const resCliente = await fetch(`${API_BASE_URL}/clientes/crear`, {
          method: 'POST',
          headers: clienteHeaders,
          credentials: 'include',
          body: JSON.stringify(datosCliente),
        });
        if (!resCliente.ok) {
          const errorData = await resCliente.json().catch(() => ({ message: 'Error en la respuesta del servidor al crear cliente.' }));
          throw new Error(errorData.message || `Error ${resCliente.status}: ${resCliente.statusText}`);
        }
        const clienteCreado = await resCliente.json();

        // Si el cliente se creó y hay precios especiales, crear cada precio (con soporte para margen)
        if (clienteCreado.id && mostrarPreciosEspeciales && form.productos.length > 0) {
          try {
            const productosValidos = form.productos.filter(p => p.producto_id !== '' && Number(p.producto_id) > 0);
            for (const item of productosValidos) {
              const payloadPrecioEspecial: Record<string, unknown> = {
                cliente_id: clienteCreado.id,
                producto_id: Number(item.producto_id),
                activo: true,
              };

              // Si el usuario eligió usar precio sobre la base (margen), enviar flags en el payload
              if (item.usar_precio_base) {
                payloadPrecioEspecial['usar_precio_base'] = true;
                if (item.margen_sobre_base != null) {
                  // margen_sobre_base viene como porcentaje (10 -> 10%). Convertir a fracción (0.10)
                  payloadPrecioEspecial['margen_sobre_base'] = Number(item.margen_sobre_base) / 100;
                }
                // precio_unitario_fijo_ars se guarda como 0 cuando usar_precio_base = true
                payloadPrecioEspecial['precio_unitario_fijo_ars'] = 0;
              } else {
                payloadPrecioEspecial['precio_unitario_fijo_ars'] = item.valor;
                payloadPrecioEspecial['moneda_original'] = item.moneda || 'ARS';
                payloadPrecioEspecial['precio_original'] = item.valor;
              }

              const precioHeaders: Record<string,string> = { 'Content-Type': 'application/json' };
              if (token) precioHeaders['Authorization'] = `Bearer ${token}`;

              const res = await fetch(`${API_BASE_URL}/precios_especiales/crear`, {
                method: 'POST',
                headers: precioHeaders,
                credentials: 'include',
                body: JSON.stringify(payloadPrecioEspecial),
              });
              if (!res.ok) {
                const err = await res.json().catch(() => ({ message: 'Error en la creación del precio especial' }));
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
    <main className="min-h-screen bg-[#312b81] text-white p-4 sm:p-8">
      <div className="max-w-4xl mx-auto bg-white text-black p-6 rounded-lg shadow-md">
        <BotonVolver className="ml-0" />
        <h1 className="text-2xl font-bold mb-8 text-center">Registrar Cliente</h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block md:col-span-2">
              <span className="font-medium">Nombre o Razón Social <span className="text-red-600">(obligatorio)</span></span>
              <input type="text" name="nombre_razon_social" value={form.nombre_razon_social} onChange={handleChange} className="w-full p-3 mt-1 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500" required />
            </label>
            <label className="block">
              <span className="font-medium">CUIT <span className="text-gray-500">(opcional)</span></span>
              <input type="number" name="cuit" value={form.cuit === 0 ? '' : form.cuit} onChange={handleChange} className="w-full p-3 mt-1 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500" />
            </label>
            <label className="block">
              <span className="font-medium">Teléfono <span className="text-gray-500">(opcional)</span></span>
              <input type="tel" name="telefono" value={form.telefono} onChange={handleChange} className="w-full p-3 mt-1 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"/>
            </label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block md:col-span-2">
              <span className="font-medium">Dirección <span className="text-gray-500">(opcional)</span></span>
              <input type="text" name="direccion" value={form.direccion} onChange={handleChange} className="w-full p-3 mt-1 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"/>
            </label>
            <label className="block">
              <span className="font-medium">Localidad <span className="text-red-600">(obligatorio)</span></span>
              <input type="text" name="localidad" value={form.localidad} onChange={handleChange} className="w-full p-3 mt-1 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500" required />
            </label>
            <label className="block">
              <span className="font-medium">Provincia <span className="text-gray-500">(opcional)</span></span>
              <input type="text" name="provincia" value={form.provincia} onChange={handleChange} className="w-full p-3 mt-1 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"/>
            </label>
            <label className="block">
              <span className="font-medium">Código Postal <span className="text-gray-500">(opcional)</span></span>
              <input type="number" name="codigo_postal" value={form.codigo_postal === 0 ? '' : form.codigo_postal} onChange={handleChange} className="w-full p-3 mt-1 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"/>
            </label>
            <label className="block">
              <span className="font-medium">Email <span className="text-gray-500">(opcional)</span></span>
              <input type="email" name="email" value={form.email} onChange={handleChange} className="w-full p-3 mt-1 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"/>
            </label>
            <label className="block md:col-span-2">
              <span className="font-medium">Contacto Principal <span className="text-gray-500">(opcional)</span></span>
              <input type="number" name="contacto_principal" value={form.contacto_principal === 0 ? '' : form.contacto_principal} onChange={handleChange} className="w-full p-3 mt-1 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"/>
            </label>
          </div>
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
              <div className="mb-2 hidden md:grid md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_60px] items-center gap-3 font-semibold text-sm text-gray-600 px-3">
                <span>Producto</span>
                <span>Modo de Precio</span>
                <span className="text-center"></span>
              </div>
              <div className="space-y-4">
                {form.productos.map((item, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50/50 space-y-4 shadow-sm">
                    {/* Fila 1: Selector de producto y botón de eliminar */}
                    <div className="flex justify-between items-start">
                      <div className="flex-grow pr-4">
                        <label className="text-sm font-medium text-gray-700">Producto</label>
                        <select
                          name="producto_id"
                          value={item.producto_id}
                          onChange={(e) => handleProductoItemChange(index, e)}
                          className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 mt-1"
                        >
                          <option value="" disabled> -- Seleccionar -- </option>
                          {cargandoProductos && <option disabled>Cargando productos...</option>}
                          {errorProductos && <option disabled>Error al cargar productos</option>}
                          {!cargandoProductos && productosDisponibles && productosDisponibles.length === 0 && (
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
                      {form.productos.length > 1 && (
                        <button
                          type="button"
                          onClick={() => eliminarProducto(index)}
                          className="bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold transition-colors mt-6"
                          title="Eliminar producto"
                        >
                          &times;
                        </button>
                      )}
                    </div>

                    {/* Fila 2: Selector de modo de precio */}
                    <div>
                      <label className="text-sm font-medium text-gray-700">Modo de Precio</label>
                      <select
                        name="usar_precio_base"
                        value={item.usar_precio_base ? 'margen' : 'fijo'}
                        onChange={(e) => handleProductoItemChange(index, e)}
                        className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 mt-1"
                      >
                        <option value="fijo">Precio Fijo Manual</option>
                        <option value="margen">Precio Dinámico (sobre Base + Margen)</option>
                      </select>
                    </div>

                    {/* Fila 3: Inputs condicionales */}
                    {item.usar_precio_base ? (
                      // MODO PRECIO DINÁMICO (MARGEN)
                      <div className="border-t pt-4 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                          {/* Columna Izquierda: Input Margen y Calculadora */}
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Margen de Ganancia (%)</label>
                            <div className="flex items-center gap-2">
                              <input
                                className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                type="number"
                                name="margen_sobre_base"
                                placeholder="Ej: 15"
                                value={item.margen_sobre_base ?? ''}
                                onChange={(e) => handleProductoItemChange(index, e)}
                                min={-100}
                                max={1000}
                                step="0.01"
                              />
                              <button type="button" className="px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded text-sm whitespace-nowrap" onClick={() => { setCalcIndex(index); setCalcOpen(true); setCalcPrecioObjetivo(''); setCalcMoneda('ARS'); setCalcError(null); }}>
                                Calculadora
                              </button>
                            </div>
                            <p className="text-xs text-gray-500">Introduce el porcentaje de margen deseado sobre el precio base.</p>
                          </div>
                          {/* Columna Derecha: Preview de Precios */}
                          <div className="bg-indigo-50 p-3 rounded-lg">
                            <h4 className="text-sm font-semibold text-gray-800 mb-2">Previsualización de Precio</h4>
                            {previews[index]?.loading ? (
                              <p className="text-xs text-gray-600">Calculando...</p>
                            ) : previews[index]?.error ? (
                              <p className="text-xs text-red-600 font-semibold">{previews[index].error}</p>
                            ) : (
                              <div className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Precio Base:</span>
                                  <span className="font-medium text-gray-800">
                                    {typeof previews[index]?.precio_base_ars === 'number' ? `ARS ${previews[index].precio_base_ars.toFixed(2)}` : 'N/A'}
                                  </span>
                                </div>
                                <div className="flex justify-between border-t border-gray-300 pt-1">
                                  <span className="font-semibold text-indigo-700">Precio Final (con margen):</span>
                                  <span className="font-bold text-indigo-700">
                                    {typeof previews[index]?.precio_con_margen_ars === 'number' ? `ARS ${previews[index].precio_con_margen_ars.toFixed(2)}` : 'N/A'}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      // MODO PRECIO FIJO
                      <div className="border-t pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium text-gray-700">Precio Fijo</label>
                          <input
                            className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 text-right focus:outline-none focus:ring-2 focus:ring-indigo-500 mt-1"
                            type="number"
                            name="valor"
                            placeholder="Ingrese valor"
                            value={item.valor === 0 ? '' : item.valor}
                            onChange={(e) => handleProductoItemChange(index, e)}
                            min="0"
                            step="0.01"
                          />
                          {item.moneda === 'USD' && tipoCambioOficial && (
                            <div className="text-xs text-gray-500 text-right mt-1">
                              ≈ ARS {(Number(item.valor || 0) * tipoCambioOficial).toFixed(2)}
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-700">Moneda</label>
                          <select
                            name="moneda"
                            value={item.moneda || 'ARS'}
                            onChange={(e) => handleProductoItemChange(index, e)}
                            className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 mt-1"
                          >
                            <option value="ARS">ARS</option>
                            <option value="USD">USD</option>
                          </select>
                        </div>
                      </div>
                    )}
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
          <div>
            <label className="block">
              <span className="font-medium">Observaciones</span>
              <textarea name="observaciones" value={form.observaciones} onChange={handleChange} className="w-full p-3 mt-1 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500" rows={4} />
            </label>
          </div>
          <div className="flex justify-center">
            <button type="submit" className="bg-[#312b81] text-white font-bold py-3 px-8 rounded-lg hover:bg-[#27226a] transition-colors text-lg">
              Guardar Cliente
            </button>
          </div>
        </form>
      </div>
      {/* Calculadora Modal */}
      {calcOpen && calcIndex !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center">
          <div className="bg-white text-black rounded p-6 w-96 shadow-lg">
            <h3 className="font-semibold mb-2">Calculadora de Margen (Producto)</h3>
            <div className="mb-2">
              <label className="text-sm">Precio objetivo ({calcMoneda})</label>
              <input type="text" value={String(calcPrecioObjetivo)} onChange={e => setCalcPrecioObjetivo(e.target.value)} className="w-full p-2 border rounded mt-1" />
            </div>
            <div className="mb-2">
              <label className="text-sm">Moneda</label>
              <select value={calcMoneda} onChange={e => setCalcMoneda(e.target.value as 'ARS'|'USD')} className="w-full p-2 border rounded mt-1">
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            </div>
            {calcError && <div className="text-xs text-red-600 mb-2">{calcError}</div>}
            <div className="flex gap-2 justify-end">
              <button className="px-3 py-1 border rounded" onClick={() => setCalcOpen(false)}>Cancelar</button>
              <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={async () => {
                // Ejecutar petición al endpoint calculadora y aplicar resultado al producto
                setCalcLoading(true);
                setCalcError(null);
                try {
                  const objetivo = parseFloat(String(calcPrecioObjetivo).replace(',', '.'));
                  if (isNaN(objetivo) || objetivo <= 0) { setCalcError('Precio objetivo inválido'); setCalcLoading(false); return; }
                  const index = calcIndex as number;
                  const prod = form.productos[index];
                  if (!prod || !prod.producto_id) { setCalcError('Seleccione un producto válido antes de usar la calculadora'); setCalcLoading(false); return; }
                  const tokenLocal = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
                  const payload = {
                    producto_id: Number(prod.producto_id),
                    precio_objetivo: objetivo,
                    moneda_objetivo: calcMoneda
                  };
                  const headers: Record<string,string> = { 'Content-Type': 'application/json' };
                  if (tokenLocal) headers['Authorization'] = `Bearer ${tokenLocal}`;
                  const res = await fetch(`${API_BASE_URL}/precios_especiales/calculadora/calcular-margen`, { method: 'POST', headers, credentials: 'include', body: JSON.stringify(payload) });
                  if (!res.ok) { const txt = await res.text().catch(() => ''); setCalcError(`Error servidor: ${res.status} ${txt}`); setCalcLoading(false); return; }
                  const data = await res.json();
                  const margenPorcentaje = Number(data?.margen_necesario_porcentaje);
                  if (!isFinite(margenPorcentaje)) { setCalcError('Respuesta inválida de la calculadora'); setCalcLoading(false); return; }
                  // Aplicar margen al producto en el formulario
                  setForm(prev => {
                    const copy = { ...prev };
                    const list = [...copy.productos];
                    list[index].usar_precio_base = true;
                    list[index].margen_sobre_base = margenPorcentaje;
                    list[index].valor = 0;
                    copy.productos = list;
                    return copy;
                  });
                  // Traer preview para mostrar
                  fetchPreview(Number(prod.producto_id), margenPorcentaje, index);
                  setCalcOpen(false);
                } catch (err) {
                  setCalcError(String(err));
                } finally { setCalcLoading(false); }
              }}>{calcLoading ? 'Calculando...' : 'Aplicar margen'}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

