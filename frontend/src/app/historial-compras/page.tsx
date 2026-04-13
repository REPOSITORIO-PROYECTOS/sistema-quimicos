"use client";

import BotonVolver from '@/components/BotonVolver';
import SolicitudIngresoPage from '@/components/solicitudIngresoPage'; // Se usa para ver los detalles
import { useState, useEffect, useCallback } from 'react';
import { PUBLIC_API_BASE_URL } from '@/lib/publicApiBase';

type ItemOrden = {
  producto_id: number;
  producto_nombre?: string;
  cantidad_solicitada?: number | string;
  cantidad_recibida?: number | string;
};

type OrdenCompra = {
  id: number;
  fecha_creacion: string;
  estado: string;
  importe_total_estimado?: number | string;
  importe_abonado?: number | string;
  items?: ItemOrden[];
  estado_recepcion?: string;
  moneda?: 'USD' | 'ARS';
  proveedor_nombre?: string;
};

type MovimientoPago = {
  id: number;
  orden_id: number | null;
  tipo: 'DEBITO' | 'CREDITO';
  monto: number;
  fecha?: string | null;
  descripcion?: string | null;
};

type Pagination = {
  total_items: number;
  total_pages: number;
  current_page: number;
  per_page: number;
  has_next: boolean;
  has_prev: boolean;
};

export default function OrdenesRecibidasPage() {
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [idOrdenSeleccionada, setIdOrdenSeleccionada] = useState<number | null>(null);
  const [estadoFiltro, setEstadoFiltro] = useState<string>('Todos');
  const [estadosDisponibles, setEstadosDisponibles] = useState<string[]>(['Todos']);
  const [filtroDesde, setFiltroDesde] = useState<string>('');
  const [filtroHasta, setFiltroHasta] = useState<string>('');
  const [filtroProveedorDeuda, setFiltroProveedorDeuda] = useState<boolean>(false);
  const [filtroProductoPendiente, setFiltroProductoPendiente] = useState<boolean>(false);
  const [tipoCambio, setTipoCambio] = useState<number>(0);
  const [movimientosPago, setMovimientosPago] = useState<MovimientoPago[]>([]);

  const formatearFechaPago = (valor?: string | null) => {
    if (!valor) return 'Sin fecha';
    const fechaValor = new Date(valor);
    if (Number.isNaN(fechaValor.getTime())) return 'Sin fecha';
    return fechaValor.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const fetchOrdenesRecibidas = useCallback(async (currentPage: number) => {
    try {
      const token = localStorage.getItem("authToken");
      if (!token) throw new Error("Usuario no autenticado.");

      const response = await fetch(`${PUBLIC_API_BASE_URL}/ordenes_compra/obtener_todas?page=${currentPage}&per_page=20`, {
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ message: `Error ${response.status}` }));
        throw new Error(errData.message || "Error al traer órdenes.");
      }

      const data = await response.json();

      const baseOrdenes: OrdenCompra[] = (data.ordenes || []);
      const uniqEstados = Array.from(new Set(baseOrdenes.map(o => String(o.estado))))
        .filter(e => !!e && e.trim().length > 0);
      setEstadosDisponibles(['Todos', ...uniqEstados]);
      const porEstado = estadoFiltro === 'Todos' ? baseOrdenes : baseOrdenes.filter(o => String(o.estado) === estadoFiltro);
      const porFecha = porEstado.filter(o => {
        const d = new Date(o.fecha_creacion);
        const okDesde = filtroDesde ? d >= new Date(filtroDesde) : true;
        const okHasta = filtroHasta ? d <= new Date(filtroHasta) : true;
        return okDesde && okHasta;
      });

      // Filtro: Proveedor con deuda
      const porDeuda = filtroProveedorDeuda
        ? porFecha.filter(o => {
          const total = Number(o.importe_total_estimado || 0);
          const abonado = Number(o.importe_abonado || 0);
          return abonado < total;
        })
        : porFecha;

      // Filtro: Producto pendiente de entrega
      const porProductoPendiente = filtroProductoPendiente
        ? porDeuda.filter(o => {
          const estadoRecep = String(o.estado_recepcion || '').toUpperCase();
          return estadoRecep !== 'COMPLETA';
        })
        : porDeuda;

      // Si no encontramos órdenes recibidas en esta página y hay más páginas, buscamos en la siguiente
      if (porProductoPendiente.length === 0 && data.pagination.has_next) {
        await fetchOrdenesRecibidas(currentPage + 1);
      } else {
        // Si encontramos órdenes o es la última página, actualizamos el estado
        setOrdenes(porProductoPendiente);
        // Actualizamos la paginación para reflejar la página actual que estamos mostrando
        setPagination(data.pagination ? { ...data.pagination, current_page: currentPage } : null);
        setPage(currentPage); // Sincronizamos el estado de la página principal
        setLoading(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido.';
      setError(msg);
      console.error("FetchOrdenesRecibidas Error:", err);
      setLoading(false);
    }
  }, [estadoFiltro, filtroDesde, filtroHasta, filtroProveedorDeuda, filtroProductoPendiente]);

  const fetchMovimientosPago = useCallback(async () => {
    try {
      const token = localStorage.getItem("authToken");
      if (!token) throw new Error("Usuario no autenticado.");
      const userRaw = localStorage.getItem('user') || sessionStorage.getItem('user');
      const user = userRaw ? JSON.parse(userRaw) : null;
      const response = await fetch(`${PUBLIC_API_BASE_URL}/finanzas/movimientos`, {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          'X-User-Role': user?.role || '',
          'X-User-Name': user?.usuario || user?.name || ''
        }
      });
      if (!response.ok) throw new Error(`Error ${response.status}`);
      const data = await response.json().catch(() => ({}));
      setMovimientosPago((data.movimientos || []).filter((mov: MovimientoPago) => mov.tipo === 'CREDITO'));
    } catch (err) {
      console.error('FetchMovimientosPago Error:', err);
    }
  }, []);

  useEffect(() => {
    setLoading(true); // Iniciar la carga
    setError(null);
    fetchOrdenesRecibidas(page);
  }, [page, fetchOrdenesRecibidas]);

  useEffect(() => {
    fetchMovimientosPago();
  }, [fetchMovimientosPago]);

  useEffect(() => {
    const fetchTC = async () => {
      try {
        const candidatos = ['DolarCompras', 'Oficial', 'USD', 'Empresa'];
        for (const nombre of candidatos) {
          const resp = await fetch(`${PUBLIC_API_BASE_URL}/tipos_cambio/obtener/${nombre}`);
          if (!resp.ok) continue;
          const data = await resp.json().catch(() => ({}));
          const val = Number((data as { valor?: number })?.valor ?? 0);
          if (val > 0) {
            setTipoCambio(val);
            break;
          }
        }
      } catch { /* ignorar */ }
    };
    fetchTC();
  }, []);

  if (idOrdenSeleccionada) {
    return <SolicitudIngresoPage id={idOrdenSeleccionada} />;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-indigo-900 py-10 px-4">
      <div className="bg-white p-6 md:p-8 rounded-lg shadow-xl w-full max-w-4xl lg:max-w-6xl">
        <BotonVolver />
        <h2 className="text-2xl md:text-3xl font-semibold mb-8 text-center text-indigo-800">
          Historial de Compras
        </h2>

        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="flex gap-3">
            <div>
              <label className="text-sm text-gray-700">Desde</label>
              <input type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} className="ml-2 px-3 py-2 border rounded" />
            </div>
            <div>
              <label className="text-sm text-gray-700">Hasta</label>
              <input type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} className="ml-2 px-3 py-2 border rounded" />
            </div>
            <div>
              <label className="text-sm text-gray-700">Estado</label>
              <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)} className="ml-2 px-3 py-2 border rounded">
                {estadosDisponibles.map(est => (
                  <option key={est} value={est}>{est}</option>
                ))}
              </select>
            </div>
          </div>
          {/* Nuevos filtros específicos */}
          <div className="flex gap-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="filtroDeuda"
                checked={filtroProveedorDeuda}
                onChange={(e) => setFiltroProveedorDeuda(e.target.checked)}
                className="w-4 h-4 accent-indigo-600"
              />
              <label htmlFor="filtroDeuda" className="text-sm text-gray-700 cursor-pointer">
                Solo con deuda
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="filtroPendiente"
                checked={filtroProductoPendiente}
                onChange={(e) => setFiltroProductoPendiente(e.target.checked)}
                className="w-4 h-4 accent-indigo-600"
              />
              <label htmlFor="filtroPendiente" className="text-sm text-gray-700 cursor-pointer">
                Con productos pendientes
              </label>
            </div>
          </div>
          {/* Botón de exportación Excel para admins */}
          {typeof window !== 'undefined' && (() => {
            const user = sessionStorage.getItem('user') ? JSON.parse(sessionStorage.getItem('user') || '{}') : null;
            return user?.role === 'ADMIN' ? (
              <button
                onClick={() => {
                  // Exportación simplificada a CSV (Excel compatible)
                  const headers = ['Nº Orden', 'Fecha', 'Proveedor', 'Cant. Solicitada', 'Cant. Recibida', 'Precio Unitario', 'Importe Total', 'Importe Abonado', 'Estado Pago', 'Estado Recepción'];
                  const csv = [headers.join(','), ...ordenes.map(o => {
                    const total = Number(o.importe_total_estimado || 0);
                    const abonado = Number(o.importe_abonado || 0);
                    const estatusPago = total === 0 ? 'N/A' : abonado >= total ? 'Pagado' : abonado > 0 ? 'Pago parcial' : 'Con deuda';
                    return [
                      o.id,
                      new Date(o.fecha_creacion).toLocaleDateString('es-AR'),
                      '',
                      (o.items?.reduce((a, i) => a + Number(i.cantidad_solicitada || 0), 0) || 0).toString(),
                      (o.items?.reduce((a, i) => a + Number(i.cantidad_recibida || 0), 0) || 0).toString(),
                      '',
                      total,
                      abonado,
                      estatusPago,
                      o.estado_recepcion || 'Sin recepción'
                    ].map(cell => typeof cell === 'string' ? `"${cell}"` : cell).join(',');
                  })].join('\n');
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                  const link = document.createElement('a');
                  link.href = URL.createObjectURL(blob);
                  link.download = `historial-compras-${new Date().toLocaleDateString('es-AR')}.csv`;
                  link.click();
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm font-semibold"
              >
                Descargar Excel
              </button>
            ) : null;
          })()}
        </div>

        {loading && <p className="text-center text-gray-600 my-4 text-sm">Buscando órdenes recibidas...</p>}
        {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert"><p>{error}</p></div>}

        {!loading && !error && (
          <>
            <div className="overflow-x-auto">
              <ul className="space-y-2 divide-y divide-gray-200 min-w-[900px]">
                <li className="grid grid-cols-[0.8fr_1.2fr_1fr_1.2fr_1.2fr_0.8fr_1.2fr_1.2fr_1.2fr_1.2fr] gap-x-3 items-center bg-gray-100 p-3 rounded-t-md font-semibold text-xs text-gray-700 uppercase tracking-wider">
                  <span>Nº Orden</span>
                  <span>Fecha</span>
                  <span>Proveedor</span>
                  <span>Cant. Solicitada</span>
                  <span>Cant. Recibida</span>
                  <span>Moneda</span>
                  <span>Importe Total</span>
                  <span>Importe Abonado</span>
                  <span>Estado Pago</span>
                  <span>Estado Recepción</span>
                </li>

                {ordenes.length > 0 ? ordenes.map((orden) => {
                  let fechaFormateada = 'N/A';
                  try {
                    fechaFormateada = new Date(orden.fecha_creacion).toLocaleDateString("es-AR", {
                      day: "2-digit", month: "2-digit", year: "numeric",
                    });
                  } catch (e) { console.error("Error formateando fecha:", orden.fecha_creacion, e); }

                  const cantidadSolicitada = orden.items?.reduce((acc: number, it: ItemOrden) => acc + (Number(it.cantidad_solicitada || 0)), 0) || 0;
                  const cantidadRecibida = orden.items?.reduce((acc: number, it: ItemOrden) => acc + (Number(it.cantidad_recibida || 0)), 0) || 0;
                  const total = Number(orden.importe_total_estimado || 0);
                  const abonado = Number(orden.importe_abonado || 0);
                  const moneda = orden.moneda || 'ARS';
                  const estatusPago = total === 0 ? 'N/A' : abonado >= total ? 'Pagado' : abonado > 0 ? 'Pago parcial' : 'Con deuda';
                  const pagosOrden = movimientosPago
                    .filter((mov) => mov.orden_id === orden.id)
                    .sort((a, b) => {
                      const fechaA = a.fecha ? new Date(a.fecha).getTime() : 0;
                      const fechaB = b.fecha ? new Date(b.fecha).getTime() : 0;
                      return fechaB - fechaA;
                    });

                  return (
                    <li
                      key={orden.id}
                      className="grid grid-cols-[0.8fr_1.2fr_1fr_1.2fr_1.2fr_0.8fr_1.2fr_1.2fr_1.2fr_1.2fr] gap-x-3 items-center bg-white hover:bg-gray-50 p-3 text-sm cursor-pointer"
                      onClick={() => setIdOrdenSeleccionada(orden.id)}
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') setIdOrdenSeleccionada(orden.id); }}
                      aria-label={`Ver detalles de la orden ${orden.id.toString().padStart(4, '0')}`}
                    >
                      <span className="font-semibold">{`Nº ${orden.id.toString().padStart(4, '0')}`}</span>
                      <span>{fechaFormateada}</span>
                      <span className="text-gray-700 text-xs">{orden.proveedor_nombre || '-'}</span>
                      <span className="text-center font-semibold text-gray-900">{cantidadSolicitada}</span>
                      <span className="text-center font-semibold text-gray-900">{cantidadRecibida}</span>
                      <span className={`text-center font-semibold px-2 py-1 rounded text-white ${moneda === 'USD' ? 'bg-yellow-500' : 'bg-green-600'
                        }`}>{moneda}</span>
                      <span className="text-right text-gray-700">
                        {moneda === 'USD' ? `USD $${total.toFixed(2)}` : `$${total.toFixed(2)}`}
                        {moneda === 'USD' && tipoCambio > 0 && (
                          <span className="block text-xs text-gray-400">≈ ${(total * tipoCambio).toLocaleString('es-AR', { maximumFractionDigits: 0 })} ARS</span>
                        )}
                      </span>
                      <span className="text-right text-gray-700">
                        {moneda === 'USD' ? `USD $${abonado.toFixed(2)}` : `$${abonado.toFixed(2)}`}
                        {moneda === 'USD' && tipoCambio > 0 && (
                          <span className="block text-xs text-gray-400">≈ ${(abonado * tipoCambio).toLocaleString('es-AR', { maximumFractionDigits: 0 })} ARS</span>
                        )}
                        {pagosOrden.length > 0 && (
                          <span className="mt-1 block text-left text-[11px] leading-4 text-gray-500">
                            {pagosOrden.slice(0, 3).map((pago) => (
                              <span key={pago.id} className="block">
                                {formatearFechaPago(pago.fecha)} · ${Number(pago.monto || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                {pago.descripcion ? ` · ${pago.descripcion}` : ''}
                              </span>
                            ))}
                            {pagosOrden.length > 3 && <span className="block text-gray-400">+{pagosOrden.length - 3} pago(s) más</span>}
                          </span>
                        )}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold text-center ${estatusPago === 'Pagado' ? 'bg-green-100 text-green-800' :
                        estatusPago === 'Pago parcial' ? 'bg-yellow-100 text-yellow-800' :
                          estatusPago === 'Con deuda' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                        }`}>
                        {estatusPago}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold text-center ${(() => {
                        const s = String(orden.estado_recepcion || '').toUpperCase();
                        if (s === 'COMPLETA' || s === 'RECIBIDO') return 'bg-green-100 text-green-800';
                        if (s === 'PARCIAL' || s === 'RECIBIDA_PARCIAL') return 'bg-orange-100 text-orange-800';
                        if (s === 'EN_ESPERA_RECEPCION' || s === 'PENDIENTE') return 'bg-blue-100 text-blue-800';
                        return 'bg-gray-100 text-gray-500';
                      })()
                        }`}>
                        {(() => {
                          const s = String(orden.estado_recepcion || '').toUpperCase();
                          if (s === 'COMPLETA' || s === 'RECIBIDO') return 'Completa';
                          if (s === 'PARCIAL' || s === 'RECIBIDA_PARCIAL') return 'Parcial';
                          if (s === 'EN_ESPERA_RECEPCION' || s === 'PENDIENTE') return 'Pendiente';
                          return 'Sin recepción';
                        })()}
                      </span>
                    </li>
                  );
                }) : (
                  <li className="text-center py-8 text-gray-500 col-span-8">
                    No hay órdenes para mostrar.
                  </li>
                )}
              </ul>
            </div>

            {pagination && pagination.total_pages > 1 && (
              <div className="flex justify-center mt-6 gap-4">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1 || loading} className="px-4 py-2 rounded bg-indigo-600 text-white font-semibold shadow hover:bg-indigo-700 disabled:opacity-50">Anterior</button>
                <span className="text-indigo-700 font-medium text-sm self-center">Página {pagination.current_page} de {pagination.total_pages}</span>
                <button onClick={() => setPage(p => p + 1)} disabled={!pagination.has_next || loading} className="px-4 py-2 rounded bg-indigo-600 text-white font-semibold shadow hover:bg-indigo-700 disabled:opacity-50">Siguiente</button>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
}
