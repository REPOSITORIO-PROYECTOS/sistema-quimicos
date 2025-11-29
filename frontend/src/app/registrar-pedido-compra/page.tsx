'use client';
import BotonVolver from '@/components/BotonVolver';
import { useProductsContext } from '@/context/ProductsContext';
import { useRouter } from 'next/navigation';
import React, { useState, useEffect } from 'react';

// Se simplifica la interface local, ya que el componente no maneja estos estados
interface IPedido {
  fecha: string;
  producto: string; // ID del producto
  cantidad: string;
  importeTotal: string;
  importeAbonado: string;
  chequePerteneciente: string;
  fecha_limite: string;
  estado?: string;
  estado_recepcion?: string;
}

export default function RegistrarIngreso() {

  // --- Estados Reducidos ---
  const [fecha, setFecha] = useState('');
  const [fechaLimite, setFechaLimite] = useState('');
  const [producto, setProducto] = useState('');
  const [cantidad, setCantidad] = useState('');
  // Estados para cálculo de deuda/importe
  const [precioEstimado, setPrecioEstimado] = useState('');
  const [importeTotal, setImporteTotal] = useState('');
  const [importeAbonado, setImporteAbonado] = useState('');
  const [chequePerteneciente, setChequePerteneciente] = useState('');
  const [unidadMedida, setUnidadMedida] = useState('');
  const irAccionesPuerta = () => router.push('/compras');
  const { productos, loading: productsLoading, error: productsError } = useProductsContext();
  // Se eliminó el contexto de proveedores
  const router = useRouter();
  const [observaciones_solicitud, setObservacionesSolicitud] = useState('');
  const [esAlmacen, setEsAlmacen] = useState(false);
  
  const [pedidos, setPedidos] = useState<IPedido[]>([]);
  const [errorApi, setErrorApi] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
  const LAST_PAYLOAD_KEY = 'ultimoPedidoCompraPayload';

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

  useEffect(() => {
    try {
      const userText = typeof window !== 'undefined' ? sessionStorage.getItem('user') : null;
      const user = userText ? JSON.parse(userText) : null;
      setEsAlmacen(Boolean(user && user.role && String(user.role).toUpperCase() === 'ALMACEN'));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (!producto) return;
      const prod = productos.find(p => String(p.id) === String(producto));
      const uv = (prod?.unidad_venta || prod?.unidad_medida || '').toUpperCase();
      if (uv === 'LT' || uv === 'LITROS') setUnidadMedida('Litros');
      else if (uv === 'KG' || uv === 'KILOS') setUnidadMedida('Kilos');
      else setUnidadMedida('Unidades');
    } catch {}
  }, [producto, productos]);

  // Actualizar importe total estimado cuando cambia cantidad o precio
  useEffect(() => {
    const c = Number(String(cantidad).replace(',', '.'));
    const p = Number(String(precioEstimado).replace(',', '.'));
    if (!isNaN(c) && !isNaN(p) && c > 0 && p >= 0) {
      setImporteTotal((c * p).toFixed(2));
    } else {
      setImporteTotal('');
    }
  }, [cantidad, precioEstimado]);

  const handleAgregar = async () => {
    // Validaciones de campos obligatorios
    if (!fecha || !producto || !cantidad || (!esAlmacen && !precioEstimado)) {
        setErrorApi(esAlmacen ? "Completa: Fecha, Producto y Cantidad." : "Completa: Fecha, Producto, Cantidad y Precio Estimado.");
        return;
    }

    setIsLoading(true);
    setErrorApi(null);
    console.log("Agregando pedido...");

    // Validaciones numéricas
    const cantidadNum = Number(String(cantidad).replace(',', '.'));
    const precioNum = Number(String(precioEstimado).replace(',', '.'));
    const importeAbonadoNum = Number(String(importeAbonado).replace(',', '.'));
    if (isNaN(cantidadNum) || cantidadNum <= 0) {
      setIsLoading(false);
      setErrorApi("La cantidad debe ser un número positivo.");
      return;
    }
    if (!esAlmacen && (isNaN(precioNum) || precioNum < 0)) {
      setIsLoading(false);
      setErrorApi("El precio estimado no puede ser negativo.");
      return;
    }
    if (!isNaN(importeAbonadoNum) && importeAbonadoNum < 0) {
      setIsLoading(false);
      setErrorApi("El importe abonado no puede ser negativo.");
      return;
    }
    if (!isNaN(importeAbonadoNum) && importeTotal && importeAbonadoNum > Number(importeTotal)) {
      setIsLoading(false);
      setErrorApi("El importe abonado no puede superar el total estimado.");
      return;
    }

    // Objeto local para la lista de la UI, ya no contiene los campos eliminados
    const nuevoPedido: IPedido = {
      fecha, producto, cantidad, importeTotal, importeAbonado, chequePerteneciente,
      fecha_limite: fechaLimite,
    };
    // eslint-disable-next-line
    const userItem:any = sessionStorage.getItem("user");
    const user = userItem ? JSON.parse(userItem) : null;

    if (!user || !user.id) {
        setErrorApi("No se pudo obtener la información del usuario. Por favor, inicie sesión de nuevo.");
        setIsLoading(false);
        return;
    }

    // --- Payload para la API (Clave) ---
    // Se mantienen los campos que la API espera, pero con valores por defecto/fijos.
    interface VentaPayload {
      usuario_interno_id: number | string;
      forma_pago: string;
      observaciones_solicitud: string;
      items: { codigo_interno: number; cantidad: number; precio_unitario_estimado: number; unidad_medida: string }[];
      proveedor_id: number;
      fecha_limite: string;
      importe_abonado?: number;
    }
    const ventaPayload: VentaPayload = {
      usuario_interno_id: user.id,
      forma_pago: "",
      observaciones_solicitud: observaciones_solicitud,
      items: [ {
          codigo_interno: Number(producto),
          cantidad: cantidadNum,
          precio_unitario_estimado: esAlmacen ? 0 : precioNum,
          unidad_medida: unidadMedida || 'Unidades'
      } ],
      proveedor_id: 1, // Se envía un ID de proveedor fijo (Ej: 1 para "Varios" o "Interno"). ¡Ajustar si es necesario!
      fecha_limite: fechaLimite,
    };
    if (!isNaN(importeAbonadoNum)) ventaPayload.importe_abonado = importeAbonadoNum;
    console.log("Payload enviado a la API:", ventaPayload);
    // Guardar último intento para recuperación
    try { sessionStorage.setItem(LAST_PAYLOAD_KEY, JSON.stringify({ payload: ventaPayload, ts: Date.now() })); } catch {}

    try {
      const response = await fetch('https://quimex.sistemataup.online/ordenes_compra/crear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role' : user.role,
          'X-User-Id' : user.id,
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(ventaPayload),
      });

      console.log("Respuesta recibida:", response.status, response.ok);

      if (!response.ok) {
        let errorMsg = `Error ${response.status}: ${response.statusText}`;
        try {
            const errorData = await response.json();
            console.error('Error en la respuesta:', errorData);
            errorMsg = errorData?.mensaje || errorData?.detail || errorData?.error || errorMsg;
            if (String(errorMsg).includes("Proveedor") && String(errorMsg).includes("no encontrado")) {
              errorMsg = `${errorMsg}. Verifica el ID de proveedor predeterminado (actual: 1).`;
            }
            if (String(errorMsg).toLowerCase().includes("precio") || String(errorMsg).toLowerCase().includes("cantidad")) {
              errorMsg += " Revisa la cantidad y el precio estimado.";
            }
        } catch (jsonError) {
            console.error("No se pudo parsear JSON del error:", jsonError);
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      console.log('Compra registrada con éxito:', data);
      alert('Pedido agregado con éxito!');

      const estadoServidor = String(data?.orden?.estado ?? '');
      const estadoRecepServidor = String(data?.orden?.estado_recepcion ?? '');
      setPedidos((prev) => [...prev, { ...nuevoPedido, estado: estadoServidor, estado_recepcion: estadoRecepServidor }]);

      // Se limpia el estado de los campos restantes
      setProducto('');
      setCantidad('');
      setPrecioEstimado('');
      setImporteTotal('');
      setImporteAbonado('');
      setChequePerteneciente('');
      setFechaLimite('');
      try { sessionStorage.removeItem(LAST_PAYLOAD_KEY); } catch {}
      irAccionesPuerta();
      // eslint-disable-next-line
    } catch (error: any) {
      console.error('Error al registrar compra:', error);
      setErrorApi(error.message || "Ocurrió un error al registrar el pedido.");
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
                            const userText = sessionStorage.getItem("user");
                            const user = userText ? (JSON.parse(userText) as { role?: string; id?: number | string }) : null;
                            const response = await fetch('https://quimex.sistemataup.online/ordenes_compra/crear', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                'X-User-Role': user?.role ?? '',
                                'X-User-Id': String(user?.id ?? ''),
                                "Authorization": `Bearer ${token}`,
                              },
                              body: JSON.stringify(parsed.payload),
                            });
                            const data = await response.json().catch(()=>({}));
                            if (!response.ok) {
                              throw new Error(data?.mensaje || data?.detail || data?.error || `Error ${response.status}`);
                            }
                            alert('Pedido agregado con éxito!');
                            setErrorApi(null);
                            try { sessionStorage.removeItem(LAST_PAYLOAD_KEY); } catch {}
                            irAccionesPuerta();
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
                      setProducto('');
                      setCantidad('');
                      setPrecioEstimado('');
                      setImporteTotal('');
                      setImporteAbonado('');
                      setChequePerteneciente('');
                      setFechaLimite('');
                      setErrorApi(null);
                    }}
                    className="bg-gray-300 text-gray-800 px-3 py-1 rounded hover:bg-gray-400"
                  >Restablecer formulario</button>
                </div>
            </div>
        )}

        <div className="mb-4">
          <label htmlFor="fecha" className={labelClass}>Fecha *</label>
          <input
            id="fecha"
            value={fecha}
            type="date"
            required
            className={`${baseInputClass} ${disabledInputClass}`}
            disabled
          />
        </div>

        <div className="mb-4">
          <label htmlFor="fechaLimite" className={labelClass}>Fecha Límite de Recepción</label>
          <input
            id="fechaLimite"
            value={fechaLimite}
            onChange={(e) => setFechaLimite(e.target.value)}
            type="date"
            className={baseInputClass}
            min={fecha}
          />
        </div>

        <div className="mb-4">
          <label htmlFor="producto" className={labelClass}>Producto *</label>
            <select
                id="producto"
                name="producto"
                required
                value={producto}
                onChange={(e) => setProducto(e.target.value)}
                className={baseInputClass}
                disabled={productsLoading}
              >
                <option value="" disabled>
                    {productsLoading ? "Cargando productos..." : "Seleccionar producto"}
                </option>
                {productsError && <option value="" disabled>Error al cargar productos</option>}
                {!productsLoading && !productsError && productos.map((prod) => (
                  <option value={prod.id} key={prod.id}>
                    {prod.nombre} ({prod.codigo})
                  </option>
                ))}
          </select>
          {productsError && <p className="text-xs text-red-400 mt-1">{productsError}</p>}
        </div>

        {/* CAMPO PROVEEDOR ELIMINADO */}

        <div className="mb-4">
          <label htmlFor="cantidad" className={labelClass}>Cantidad *</label>
          <input
            id="cantidad"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            type="number"
            required
            min="0"
            step="0.01"
            placeholder="Ej: 10"
            className={baseInputClass}
          />
        </div>
        <div className="mb-4">
          <label htmlFor="unidadMedida" className={labelClass}>Unidad de Medida *</label>
          <select
            id="unidadMedida"
            value={unidadMedida}
            onChange={(e) => setUnidadMedida(e.target.value)}
            className={baseInputClass}
          >
            <option value="">Seleccionar</option>
            <option value="Litros">Litros</option>
            <option value="Kilos">Kilos</option>
            <option value="Unidades">Unidades</option>
          </select>
        </div>
        {!esAlmacen && (
          <div className="mb-4">
            <label htmlFor="precioEstimado" className={labelClass}>Precio Unitario Estimado *</label>
            <input
              id="precioEstimado"
              value={precioEstimado}
              onChange={(e) => setPrecioEstimado(e.target.value)}
              type="number"
              required
              min="0"
              step="0.01"
              placeholder="Ej: 150.50"
              className={baseInputClass}
            />
          </div>
        )}
        {!esAlmacen && (
          <div className="mb-4">
            <label htmlFor="importeTotal" className={labelClass}>Importe Total (estimado)</label>
            <input
              id="importeTotal"
              value={importeTotal}
              readOnly
              type="text"
              className={`${baseInputClass} ${disabledInputClass}`}
            />
          </div>
        )}
        {!esAlmacen && (
          <div className="mb-4">
            <label htmlFor="importeAbonado" className={labelClass}>Importe Abonado (opcional)</label>
            <input
              id="importeAbonado"
              value={importeAbonado}
              onChange={(e) => setImporteAbonado(e.target.value)}
              type="number"
              min="0"
              step="0.01"
              placeholder="Ej: 0.00"
              className={baseInputClass}
            />
          </div>
        )}
        

        {!esAlmacen && (
          <div className="mb-4">
            <label htmlFor="clasificacion" className={labelClass}>Clasificacion *</label>
            <input
              id="clasificacion"
              value={observaciones_solicitud}
              onChange={(e) => setObservacionesSolicitud(e.target.value)}
              type="text"
              required
              className={baseInputClass}
            />
          </div>
        )}


        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-6">
           <BotonVolver />
          <button
            onClick={handleAgregar}
            disabled={isLoading || productsLoading}
            className="bg-indigo-500 text-white font-semibold px-6 py-2 rounded-md hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-opacity-75 transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Agregando...' : 'Agregar Pedido'}
          </button>

        </div>
      </div>

      {pedidos.length > 0 && (
        <div className="mt-10 w-full max-w-lg bg-white p-4 md:p-6 rounded-lg shadow-md text-black">
          <h2 className="text-lg font-semibold mb-3 text-gray-800">Pedidos Agregados:</h2>
          <ul className="divide-y divide-gray-200 max-h-64 overflow-y-auto text-sm">
            {pedidos.map((pedido, idx) => {
              const productoInfo = productos.find(p => p.id.toString() === pedido.producto);
              const nombreProducto = productoInfo ? productoInfo.nombre : `ID Producto: ${pedido.producto}`;

              // Se elimina la búsqueda del proveedor
              return (
                <li key={idx} className="py-2">
                   <strong>{nombreProducto}</strong> - Cant: {pedido.cantidad} ({pedido.fecha})
                   {pedido.estado && (
                     <span className="ml-2 text-xs px-2 py-1 rounded bg-blue-100 text-blue-800">Estado: {pedido.estado}</span>
                   )}
                   {pedido.estado_recepcion && (
                     <span className="ml-2 text-xs px-2 py-1 rounded bg-orange-100 text-orange-800">Recepción: {pedido.estado_recepcion}</span>
                   )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
