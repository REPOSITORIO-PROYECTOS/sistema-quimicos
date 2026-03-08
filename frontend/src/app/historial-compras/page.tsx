"use client";

import BotonVolver from '@/components/BotonVolver';
import SolicitudIngresoPage from '@/components/solicitudIngresoPage'; // Se usa para ver los detalles
import { useState, useEffect, useCallback } from 'react';

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

  const fetchOrdenesRecibidas = useCallback(async (currentPage: number) => {
    try {
      const token = localStorage.getItem("authToken");
      if (!token) throw new Error("Usuario no autenticado.");
      
      const response = await fetch(`https://quimex.sistemataup.online/api/ordenes_compra/obtener_todas?page=${currentPage}&per_page=20`, {
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
      });
      if (!response.ok) {
        const errData = await response.json().catch(()=>({message:`Error ${response.status}`}));
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

  useEffect(() => {
    setLoading(true); // Iniciar la carga
    setError(null);
    fetchOrdenesRecibidas(page);
  }, [page, fetchOrdenesRecibidas]);

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
              <input type="date" value={filtroDesde} onChange={(e)=> setFiltroDesde(e.target.value)} className="ml-2 px-3 py-2 border rounded"/>
            </div>
            <div>
              <label className="text-sm text-gray-700">Hasta</label>
              <input type="date" value={filtroHasta} onChange={(e)=> setFiltroHasta(e.target.value)} className="ml-2 px-3 py-2 border rounded"/>
            </div>
            <div>
              <label className="text-sm text-gray-700">Estado</label>
              <select value={estadoFiltro} onChange={(e)=> setEstadoFiltro(e.target.value)} className="ml-2 px-3 py-2 border rounded">
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
                      o.estado_recepcion || 'N/A'
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
                <li className="grid grid-cols-[0.8fr_1.2fr_1fr_1.2fr_1.2fr_1.2fr_1.2fr_1.2fr] gap-x-3 items-center bg-gray-100 p-3 rounded-t-md font-semibold text-xs text-gray-700 uppercase tracking-wider">
                  <span>Nº Orden</span>
                  <span>Fecha</span>
                  <span>Proveedor</span>
                  <span>Cant. Solicitada</span>
                  <span>Cant. Recibida</span>
                  <span>Importe Total</span>
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
                  const estatusPago = total === 0 ? 'N/A' : abonado >= total ? 'Pagado' : abonado > 0 ? 'Pago parcial' : 'Con deuda';

                  return (
                    <li
                      key={orden.id}
                      className="grid grid-cols-[0.8fr_1.2fr_1fr_1.2fr_1.2fr_1.2fr_1.2fr_1.2fr] gap-x-3 items-center bg-white hover:bg-gray-50 p-3 text-sm cursor-pointer"
                      onClick={() => setIdOrdenSeleccionada(orden.id)}
                      tabIndex={0}
                      onKeyDown={(e)=> { if (e.key === 'Enter') setIdOrdenSeleccionada(orden.id); }}
                      aria-label={`Ver detalles de la orden ${orden.id.toString().padStart(4,'0')}`}
                    >
                      <span className="font-semibold">{`Nº ${orden.id.toString().padStart(4, '0')}`}</span>
                      <span>{fechaFormateada}</span>
                      <span className="text-gray-700 text-xs">-</span>
                      <span className="text-center font-semibold text-gray-900">{cantidadSolicitada}</span>
                      <span className="text-center font-semibold text-gray-900">{cantidadRecibida}</span>
                      <span className="text-right text-gray-700">$ {total.toFixed(2)}</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold text-center ${
                        estatusPago === 'Pagado' ? 'bg-green-100 text-green-800' :
                        estatusPago === 'Pago parcial' ? 'bg-yellow-100 text-yellow-800' :
                        estatusPago === 'Con deuda' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {estatusPago}
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold text-center ${
                        String(orden.estado_recepcion || '').toUpperCase() === 'COMPLETA' ? 'bg-green-100 text-green-800' :
                        String(orden.estado_recepcion || '').toUpperCase() === 'PARCIAL' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {orden.estado_recepcion || 'N/A'}
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
