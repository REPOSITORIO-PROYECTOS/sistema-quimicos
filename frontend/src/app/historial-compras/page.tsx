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

  const fetchOrdenesRecibidas = useCallback(async (currentPage: number) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Usuario no autenticado.");
      
      const response = await fetch(`https://quimex.sistemataup.online/ordenes_compra/obtener_todas?page=${currentPage}&per_page=20`, {
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

      // Si no encontramos órdenes recibidas en esta página y hay más páginas, buscamos en la siguiente
      if (porFecha.length === 0 && data.pagination.has_next) {
        await fetchOrdenesRecibidas(currentPage + 1);
      } else {
        // Si encontramos órdenes o es la última página, actualizamos el estado
        setOrdenes(porFecha);
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
  }, [estadoFiltro, filtroDesde, filtroHasta]);

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
      <div className="bg-white p-6 md:p-8 rounded-lg shadow-xl w-full max-w-4xl lg:max-w-5xl">
        <BotonVolver />
      <h2 className="text-2xl md:text-3xl font-semibold mb-8 text-center text-indigo-800">
        Órdenes de Compra Recibidas
      </h2>

        <div className="mb-4 flex flex-wrap items-end justify-end gap-3">
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

        {loading && <p className="text-center text-gray-600 my-4 text-sm">Buscando órdenes recibidas...</p>}
        {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert"><p>{error}</p></div>}

        {!loading && !error && (
          <>
            <div className="overflow-x-auto">
              <ul className="space-y-2 divide-y divide-gray-200 min-w-[600px]">
                <li className="grid grid-cols-[1fr_1.2fr_1fr_1fr_1fr_2fr] gap-x-3 items-center bg-gray-100 p-3 rounded-t-md font-semibold text-sm text-gray-700 uppercase tracking-wider">
                  <span>Nº Orden</span>
                  <span>Fecha</span>
                  <span>Cant. Solicitada</span>
                  <span>Cant. Recibida</span>
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

                  return (
                    <li
                      key={orden.id}
                      className="grid grid-cols-[1fr_1.5fr_1fr_2fr] gap-x-3 items-center bg-white hover:bg-gray-50 p-3 text-sm cursor-pointer"
                      onClick={() => setIdOrdenSeleccionada(orden.id)}
                      tabIndex={0}
                      onKeyDown={(e)=> { if (e.key === 'Enter') setIdOrdenSeleccionada(orden.id); }}
                      aria-label={`Ver detalles de la orden ${orden.id.toString().padStart(4,'0')}`}
                    >
                      <span>{`Nº ${orden.id.toString().padStart(4, '0')}`}</span>
                      <span>{fechaFormateada}</span>
                      {/* Cantidad solicitada y recibida */}
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${badgeClass(String(orden.estado))}`}>
                        {orden.estado}
                      </span>
                      <span>
                        {Array.isArray(orden.items) && orden.items.length > 0 ? (
                          <>
                            {/* Mostrar suma de cantidades solicitadas y recibidas si están disponibles */}
                            <span className="inline-block mr-2 text-gray-700">{orden.items.reduce((acc: number, it: ItemOrden) => acc + (Number(it.cantidad_solicitada || 0)), 0)}</span>
                          </>
                        ) : (
                          <span className="text-gray-400 italic">0</span>
                        )}
                      </span>
                      <span>
                        {Array.isArray(orden.items) && orden.items.length > 0 ? (
                          <>
                            <span className="inline-block mr-2 text-gray-700">{orden.items.reduce((acc: number, it: ItemOrden) => acc + (Number(it.cantidad_recibida || 0)), 0)}</span>
                          </>
                        ) : (
                          <span className="text-gray-400 italic">0</span>
                        )}
                      </span>
                      <span>
                        {/* Estado de pago inferido a partir de importes si vienen */}
                        {(() => {
                          const total = Number(orden.importe_total_estimado || 0);
                          const abonado = Number(orden.importe_abonado || 0);
                          if (total === 0) return 'N/A';
                          if (abonado >= total) return 'Pagado';
                          if (abonado > 0 && abonado < total) return 'Pago parcial';
                          return 'Con deuda';
                        })()}
                      </span>
                      <span>
                        {orden.estado_recepcion || 'N/A'}
                      </span>
                    </li>
                  );
                }) : (
                  <li className="text-center py-8 text-gray-500 col-span-4">
                    No hay órdenes recibidas para mostrar.
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
  const badgeClass = (estado: string) => {
    const e = estado.toLowerCase();
    if (e.includes('recib') || e === 'recibido') return 'bg-blue-100 text-blue-800';
    if (e.includes('aprob') || e === 'aprobado') return 'bg-green-100 text-green-800';
    if (e.includes('deuda') || e === 'con deuda') return 'bg-orange-100 text-orange-800';
    if (e.includes('rechaz') || e === 'rechazado') return 'bg-red-100 text-red-800';
    if (e.includes('pend') || e === 'pendiente' || e === 'solicitado') return 'bg-gray-100 text-gray-800';
    return 'bg-gray-100 text-gray-800';
  };
