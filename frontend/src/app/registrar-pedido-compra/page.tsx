'use client';
import BotonVolver from '@/components/BotonVolver';
import { useProductsContext } from '@/context/ProductsContext';
import { useProveedoresContext } from '@/context/ProveedoresContext';
import { useRouter } from 'next/navigation';
import React, { useState, useEffect, useMemo } from 'react';

// Interface para cada producto en el carrito
interface IProductoCarrito {
  producto_id: string;
  producto_nombre: string;
  cantidad: string;
  unidad_medida: string;
  ordenId?: number; // Se llena después de crear la orden
}

export default function RegistrarIngreso() {
  const router = useRouter();
  const { productos, loading: productsLoading, error: productsError, refetch: refetchProductos } = useProductsContext();
  const {
    proveedores,
    loading: proveedoresLoading,
    error: proveedoresError,
    fetchProveedores,
  } = useProveedoresContext();

  // --- Estados Simplificados ---
  const [fecha, setFecha] = useState('');
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [productoSeleccionado, setProductoSeleccionado] = useState('');
  const [cantidadActual, setCantidadActual] = useState('');
  const [unidadMedidaActual, setUnidadMedidaActual] = useState('');

  // Carrito de productos (múltiples productos, múltiples órdenes)
  const [carrito, setCarrito] = useState<IProductoCarrito[]>([]);

  const [errorApi, setErrorApi] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [ordenesCreadas, setOrdenesCreadas] = useState<number[]>([]);

  const token = typeof window !== 'undefined'
    ? (localStorage.getItem("authToken") || sessionStorage.getItem("authToken"))
    : null;
  const LAST_PAYLOAD_KEY = 'oc_last_payload_retry';

  const getStoredUser = () => {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem('user') || sessionStorage.getItem('user');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as {
        id?: number | string;
        role?: string;
        rol?: string;
        usuario?: string;
        name?: string;
      };
    } catch {
      return null;
    }
  };

  const userActual = getStoredUser();
  const rolActual = String(userActual?.role || userActual?.rol || (typeof window !== 'undefined' ? localStorage.getItem('rol') : '') || '').toUpperCase();
  const esAdmin = rolActual === 'ADMIN';

  // Obtener fecha actual al cargar
  useEffect(() => {
    const obtenerFechaActual = () => {
      const hoy = new Date();
      const anio = hoy.getFullYear();
      const mes = String(hoy.getMonth() + 1).padStart(2, '0');
      const dia = String(hoy.getDate()).padStart(2, '0');
      return `${anio}-${mes}-${dia}`;
    };
    setFecha(obtenerFechaActual());
  }, []);

  // Auto-detectar unidad de medida cuando se selecciona un producto
  useEffect(() => {
    if (!productoSeleccionado) {
      setUnidadMedidaActual('');
      return;
    }
    try {
      const prod = productos.find(p => String(p.id) === String(productoSeleccionado));
      if (!prod) return;
      const uv = (prod?.unidad_venta || prod?.unidad_medida || '').toUpperCase();
      if (uv === 'LT' || uv === 'LITROS') setUnidadMedidaActual('Litros');
      else if (uv === 'KG' || uv === 'KILOS') setUnidadMedidaActual('Kilos');
      else setUnidadMedidaActual('Unidades');
    } catch { }
  }, [productoSeleccionado, productos]);

  // Obtener proveedor predeterminado
  const proveedorPredeterminado = useMemo(() => {
    if (!proveedores.length) return null;
    const candidatos = ['VARIOS', 'INTERNO', 'GENERAL', 'MOSTRADOR'];
    const proveedorPreferido = proveedores.find((proveedor) => {
      const nombre = String(proveedor.nombre || '').toUpperCase();
      return candidatos.some((candidato) => nombre.includes(candidato));
    });
    return proveedorPreferido || proveedores.find((proveedor) => proveedor.activo) || proveedores[0];
  }, [proveedores]);

  const proveedorBaseInterno = useMemo(() => {
    if (!proveedores.length) return null;
    const candidatos = ['VARIOS', 'INTERNO', 'GENERAL', 'MOSTRADOR'];
    return proveedores.find((proveedor) => {
      const nombre = String(proveedor.nombre || '').toUpperCase();
      return candidatos.some((candidato) => nombre.includes(candidato));
    }) || null;
  }, [proveedores]);

  const proveedorParaSolicitud = esAdmin ? proveedorPredeterminado : proveedorBaseInterno;

  const productosFiltrados = useMemo(() => {
    const termino = busquedaProducto
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    if (!termino) return productos;

    return productos.filter((producto) => {
      const nombre = String(producto.nombre || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      const codigo = String(producto.codigo || '').toLowerCase();
      return nombre.includes(termino) || codigo.includes(termino);
    });
  }, [productos, busquedaProducto]);

  // Bloqueos de catálogo
  const bloqueosCatalogo = useMemo(() => {
    const bloqueos: string[] = [];
    if (productsLoading) bloqueos.push('Los productos todavía se están cargando.');
    else if (productsError) bloqueos.push(`No se pudo cargar el catálogo de productos: ${productsError}`);
    else if (!productos.length) bloqueos.push('No hay productos cargados para solicitar la compra.');

    if (proveedoresLoading) bloqueos.push('Los proveedores todavía se están cargando.');
    else if (proveedoresError) bloqueos.push(`No se pudo cargar el catálogo de proveedores: ${proveedoresError}`);
    else if (!proveedores.length) bloqueos.push('No hay proveedores cargados.');
    else if (esAdmin && !proveedorPredeterminado) bloqueos.push('No se encontró un proveedor base para registrar la compra.');
    else if (!esAdmin && !proveedorBaseInterno) bloqueos.push('No se encontró proveedor base interno (VARIOS/INTERNO/GENERAL/MOSTRADOR). Debe configurarlo un ADMIN.');

    return bloqueos;
  }, [
    productsLoading,
    productsError,
    productos.length,
    proveedoresLoading,
    proveedoresError,
    proveedores.length,
    proveedorPredeterminado,
    proveedorBaseInterno,
    esAdmin,
  ]);

  // Validar formulario actual
  const validarProductoActual = () => {
    if (!productoSeleccionado) return 'Selecciona un producto';
    if (!cantidadActual || Number(cantidadActual) <= 0) return 'La cantidad debe ser mayor a 0';
    if (!unidadMedidaActual) return 'Selecciona una unidad de medida';
    return null;
  };

  // Agregar producto al carrito
  const handleAgregarAlCarrito = () => {
    const error = validarProductoActual();
    if (error) {
      setErrorApi(error);
      return;
    }

    const nuevoProducto: IProductoCarrito = {
      producto_id: productoSeleccionado,
      producto_nombre: productos.find(p => String(p.id) === productoSeleccionado)?.nombre || 'Producto desconocido',
      cantidad: cantidadActual,
      unidad_medida: unidadMedidaActual,
    };

    setCarrito([...carrito, nuevoProducto]);
    setErrorApi(null);
    // Limpiar formulario
    setBusquedaProducto('');
    setProductoSeleccionado('');
    setCantidadActual('');
    setUnidadMedidaActual('');
  };

  // Quitar producto del carrito
  const handleQuitarDelCarrito = (index: number) => {
    setCarrito(carrito.filter((_, i) => i !== index));
  };

  // Crear órdenes: una por cada producto en el carrito
  const handleCrearOrdenes = async () => {
    if (carrito.length === 0) {
      setErrorApi('Agrega al menos un producto al carrito');
      return;
    }

    if (bloqueosCatalogo.length > 0) {
      setErrorApi(bloqueosCatalogo.join(' '));
      return;
    }

    if (!proveedorParaSolicitud) {
      setErrorApi('No se pudo resolver el proveedor base.');
      return;
    }

    setIsLoading(true);
    setErrorApi(null);
    setOrdenesCreadas([]);

    try {
      const user = getStoredUser();

      if (!user || !user.id) {
        throw new Error('No se pudo obtener la información del usuario.');
      }

      const role = user.role || user.rol || localStorage.getItem('rol') || '';
      const userName = user.usuario || user.name || localStorage.getItem('user_name') || '';

      const ordenesExitosas: number[] = [];
      const erroresOrdenes: string[] = [];

      // Crear una orden por cada producto en el carrito
      for (const item of carrito) {
        try {
          const payload = {
            usuario_interno_id: user.id,
            proveedor_id: Number(proveedorParaSolicitud.id),
            tc_transaccion: 1,
            ajuste_tc: false,
            items: [{
              codigo_interno: Number(item.producto_id),
              cantidad: Number(item.cantidad),
              precio_unitario_estimado: 0,
              unidad_medida: item.unidad_medida,
            }],
            importe_abonado: 0,
            fecha_limite: fecha,
            // Forma de pago se omite (campo simplificado)
          };

          const response = await fetch('https://quimex.sistemataup.online/api/ordenes_compra/crear', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-User-Role': role,
              'X-User-Name': userName,
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData?.error || errorData?.mensaje || errorData?.detail || `Error ${response.status}`);
          }

          const data = await response.json();
          if (data?.orden?.id) {
            ordenesExitosas.push(data.orden.id);
          }
        } catch (err: unknown) {
          const mensaje = err instanceof Error ? err.message : 'Error desconocido';
          erroresOrdenes.push(`${item.producto_nombre}: ${mensaje}`);
        }
      }

      if (ordenesExitosas.length > 0) {
        setOrdenesCreadas(ordenesExitosas);
        alert(`✅ Se crearon ${ordenesExitosas.length} orden(es) correctamente.`);
        setCarrito([]);
        // Redirigir después de 2 segundos
        setTimeout(() => router.push('/compras'), 2000);
      }

      if (erroresOrdenes.length > 0) {
        setErrorApi(`Errores: ${erroresOrdenes.join(', ')}`);
      }
    } catch (error: unknown) {
      console.error('Error al crear órdenes:', error);
      const mensaje = error instanceof Error ? error.message : 'Error al crear las órdenes.';
      setErrorApi(mensaje);
    } finally {
      setIsLoading(false);
    }
  };

  const baseInputClass = "w-full px-3 py-2 rounded bg-white text-black border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent placeholder-gray-500 transition duration-150 ease-in-out";
  const disabledInputClass = "disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed";
  const labelClass = "block text-sm font-medium mb-1 text-gray-200";

  return (
    <div className="min-h-screen flex flex-col items-center bg-gradient-to-br from-[#20119d] to-[#1c0f8a] px-4 py-10">
      <h1 className="text-white text-3xl font-bold mb-6 text-center drop-shadow-md">
        Solicitar Compra
      </h1>

      <div className="bg-white/10 backdrop-blur-sm p-6 md:p-8 rounded-lg shadow-xl w-full max-w-lg text-white relative">
        {isLoading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-50 rounded-lg">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white"></div>
            <p className="text-white ml-3">Procesando...</p>
          </div>
        )}

        {errorApi && (
          <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">{errorApi}</span>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const last = sessionStorage.getItem(LAST_PAYLOAD_KEY);
                  if (!last) {
                    setErrorApi("No hay intento previo para reintentar.");
                    return;
                  }
                  try {
                    const parsed = JSON.parse(last);
                    (async () => {
                      setIsLoading(true);
                      try {
                        const user = getStoredUser();
                        const role = user?.role || user?.rol || localStorage.getItem('rol') || '';
                        const userName = user?.usuario || user?.name || localStorage.getItem('user_name') || '';
                        const response = await fetch('https://quimex.sistemataup.online/api/ordenes_compra/crear', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'X-User-Role': role,
                            'X-User-Name': userName,
                            "Authorization": `Bearer ${token}`,
                          },
                          body: JSON.stringify(parsed.payload),
                        });
                        const data = await response.json().catch(() => ({}));
                        if (!response.ok) {
                          throw new Error(data?.mensaje || data?.detail || data?.error || `Error ${response.status}`);
                        }
                        alert('Pedido agregado con éxito!');
                        setErrorApi(null);
                        try { sessionStorage.removeItem(LAST_PAYLOAD_KEY); } catch { }
                        router.push('/compras');
                      } catch (e: unknown) {
                        setErrorApi(e instanceof Error ? e.message : 'Error al reintentar.');
                      } finally {
                        setIsLoading(false);
                      }
                    })();
                  } catch {
                    setErrorApi("No se pudo recuperar el intento previo.");
                  }
                }}
                className="bg-indigo-500 text-white px-3 py-1 rounded hover:bg-indigo-600"
              >Reintentar</button>
              <button
                type="button"
                onClick={() => {
                  setProductoSeleccionado('');
                  setCantidadActual('');
                  setUnidadMedidaActual('');
                  setCarrito([]);
                  setErrorApi(null);
                }}
                className="bg-gray-300 text-gray-800 px-3 py-1 rounded hover:bg-gray-400"
              >Restablecer formulario</button>
            </div>
          </div>
        )}

        {bloqueosCatalogo.length > 0 && (
          <div className="mb-4 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
            <p className="font-semibold">Datos faltantes para registrar la compra</p>
            <ul className="mt-2 list-disc pl-5 text-sm">
              {bloqueosCatalogo.map((bloqueo) => (
                <li key={bloqueo}>{bloqueo}</li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  refetchProductos();
                  fetchProveedores();
                }}
                className="rounded bg-amber-500 px-3 py-1 text-sm font-medium text-white hover:bg-amber-600"
              >Recargar datos</button>
            </div>
          </div>
        )}

        {bloqueosCatalogo.length === 0 && esAdmin && proveedorParaSolicitud && (
          <div className="mb-4 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900 text-sm">
            Se registrará con el proveedor: <strong>{proveedorParaSolicitud.nombre}</strong>
          </div>
        )}

        {bloqueosCatalogo.length === 0 && !esAdmin && (
          <div className="mb-4 rounded border border-blue-200 bg-blue-50 px-4 py-3 text-blue-900 text-sm">
            El proveedor final será asignado por un usuario ADMIN al momento de la aprobación.
          </div>
        )}

        <div className="mb-4">
          <label htmlFor="fecha" className={labelClass}>Fecha</label>
          <input
            id="fecha"
            value={fecha}
            type="date"
            disabled
            className={`${baseInputClass} ${disabledInputClass}`}
          />
        </div>

        {/* FORMULARIO SIMPLIFICADO: Solo Producto + Cantidad */}
        <div className="mb-4">
          <label htmlFor="producto" className={labelClass}>Producto *</label>
          <input
            id="buscarProducto"
            value={busquedaProducto}
            onChange={(e) => setBusquedaProducto(e.target.value)}
            type="text"
            placeholder="Buscar por nombre o código"
            className={`${baseInputClass} mb-2`}
            disabled={productsLoading}
          />
          <select
            id="producto"
            value={productoSeleccionado}
            onChange={(e) => setProductoSeleccionado(e.target.value)}
            className={baseInputClass}
            disabled={productsLoading}
          >
            <option value="" disabled>
              {productsLoading
                ? 'Cargando productos...'
                : productosFiltrados.length
                  ? 'Seleccionar producto'
                  : 'Sin resultados para la búsqueda'}
            </option>
            {!productsLoading && !productsError && productosFiltrados.map((prod) => (
              <option value={prod.id} key={prod.id}>
                {prod.nombre} ({prod.codigo})
              </option>
            ))}
          </select>
          {productsError && <p className="text-xs text-red-400 mt-1">{productsError}</p>}
        </div>

        <div className="mb-4">
          <label htmlFor="cantidad" className={labelClass}>Cantidad *</label>
          <input
            id="cantidad"
            value={cantidadActual}
            onChange={(e) => setCantidadActual(e.target.value)}
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Ej: 10"
            className={baseInputClass}
          />
        </div>

        <div className="mb-4">
          <label htmlFor="unidadMedida" className={labelClass}>
            Unidad de Medida {unidadMedidaActual && `(Detectada: ${unidadMedidaActual})`}
          </label>
          <select
            id="unidadMedida"
            value={unidadMedidaActual}
            onChange={(e) => setUnidadMedidaActual(e.target.value)}
            className={baseInputClass}
          >
            <option value="">Seleccionar</option>
            <option value="Litros">Litros</option>
            <option value="Kilos">Kilos</option>
            <option value="Unidades">Unidades</option>
          </select>
        </div>


        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-6">
          <BotonVolver />
          <button
            onClick={handleAgregarAlCarrito}
            disabled={isLoading || productsLoading || proveedoresLoading || bloqueosCatalogo.length > 0}
            className="bg-blue-500 text-white font-semibold px-6 py-2 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-opacity-75 transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Agregar al Carrito
          </button>
          <button
            onClick={handleCrearOrdenes}
            disabled={isLoading || carrito.length === 0 || bloqueosCatalogo.length > 0}
            className="bg-indigo-500 text-white font-semibold px-6 py-2 rounded-md hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-opacity-75 transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Creando...' : `✓ Crear ${carrito.length > 0 ? carrito.length : ''} Orden(es)`}
          </button>
        </div>
      </div>

      {/* CARRITO DE PRODUCTOS */}
      {carrito.length > 0 && (
        <div className="mt-6 w-full max-w-lg bg-white p-4 md:p-6 rounded-lg shadow-md text-black">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">
            🛒 Carrito ({carrito.length})
          </h2>
          <ul className="divide-y divide-gray-200 max-h-64 overflow-y-auto text-sm">
            {carrito.map((item, idx) => (
              <li key={idx} className="py-3 flex justify-between items-start">
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{item.producto_nombre}</p>
                  <p className="text-xs text-gray-600 mt-1">
                    {item.cantidad} {item.unidad_medida}
                  </p>
                </div>
                <button
                  onClick={() => handleQuitarDelCarrito(idx)}
                  className="ml-3 text-red-600 hover:text-red-800 font-semibold text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 transition"
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 pt-3 border-t border-gray-300 text-sm">
            <strong className="text-gray-900">Total de productos en carrito: {carrito.length}</strong>
          </div>
        </div>
      )}

      {ordenesCreadas.length > 0 && (
        <div className="mt-6 w-full max-w-lg bg-green-50 border border-green-300 p-4 md:p-6 rounded-lg shadow-md text-green-900">
          <h2 className="text-lg font-semibold mb-3">✅ Órdenes Creadas</h2>
          <p className="mb-3">Se crearon exitosamente:</p>
          <ul className="space-y-2">
            {ordenesCreadas.map((id) => (
              <li key={id} className="text-sm bg-white/50 p-2 rounded">
                Orden ID: <strong>#{id}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
