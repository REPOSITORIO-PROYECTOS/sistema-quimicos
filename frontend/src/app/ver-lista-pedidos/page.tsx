"use client";

import BotonVolver from '@/components/BotonVolver';
import SolicitudIngresoPage from '@/components/solicitudIngresoPage';
import { useState, useEffect } from 'react';
import { useProductsContext } from '@/context/ProductsContext';

type OrdenCompra = {
  id: number;
  fecha_creacion: string;
  estado: string;
  motivo_rechazo?: string;
  importe_total_estimado?: number | string;
  moneda?: string;
  condicion_iva?: string;
};

type Pagination = {
  total_items: number;
  total_pages: number;
  current_page: number;
  per_page: number;
  has_next: boolean;
  has_prev: boolean;
};

export default function ListaOrdenesCompra() {
  // Obtener usuario
  const userItem = typeof window !== 'undefined' ? sessionStorage.getItem("user") : null;
  const user = userItem ? JSON.parse(userItem) : null;
  const esAlmacen = user && user.role && user.role.toUpperCase() === 'ALMACEN';
  const esAdmin = user && user.role && user.role.toUpperCase() === 'ADMIN';

  // Estado para el filtro: por defecto 'Aprobado' (Recepciones Pendientes)
  // Solo el admin puede ver 'Solicitado'.
  const [filtroEstado, setFiltroEstado] = useState<'Aprobado' | 'Solicitado' | 'todos'>(esAlmacen || !esAdmin ? 'Aprobado' : 'Aprobado');
  // Sincronizar filtro con query param al montar
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const estadoParam = params.get('estado');
      if (estadoParam === 'Aprobado') {
        setFiltroEstado('Aprobado');
      } else if (estadoParam === 'Solicitado' && esAdmin) {
        setFiltroEstado('Solicitado');
      } else if (!estadoParam) {
        setFiltroEstado(esAlmacen || !esAdmin ? 'Aprobado' : 'Aprobado');
      }
    }
  }, [esAlmacen, esAdmin]);

  // Si el filtro es 'Aprobado' o 'Solicitado', filtrar solo las órdenes correspondientes
  function filtrarPorEstado(ordenes: OrdenCompra[], estado: string) {
    return ordenes.filter((o: OrdenCompra) => o.estado === estado);
  }
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  // Resumen de primer ítem por orden (para mostrar producto y cantidad solicitada)
  const [resumenItems, setResumenItems] = useState<Record<number, { productoId: number; codigo: string; cantidad: number }>>({});
  const { productos: productosDelContexto } = useProductsContext();

  // Cuando cambia el filtro, volver siempre a la página 1
  useEffect(() => {
    setPage(1);
  }, [filtroEstado]);

  // Si el filtro viene de la URL (?estado=Aprobado), forzar página 1 al montar y solo si filtroEstado es 'Aprobado'
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const estadoParam = params.get('estado');
      if (estadoParam === 'Aprobado' && filtroEstado === 'Aprobado') {
        setPage(1);
      }
    }
  }, [filtroEstado]);
  const [idOrdenSeleccionada, setIdOrdenSeleccionada] = useState<number | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [aprobacionOpen, setAprobacionOpen] = useState<boolean>(false);
  const [aprobacionOrdenId, setAprobacionOrdenId] = useState<number | null>(null);
  const [aprobacionPagoCompleto, setAprobacionPagoCompleto] = useState<boolean>(true);
  const [aprobacionImporteAbonado, setAprobacionImporteAbonado] = useState<string>("");
  const [aprobacionFormaPago, setAprobacionFormaPago] = useState<string>("Efectivo");
  const [aprobacionError, setAprobacionError] = useState<string | null>(null);

  const fetchOrdenes = async (currentPage = page, filtro = filtroEstado) => {
    setLoading(true); 
    setError(null); 
    setActionError(null); 
    setActionSuccess(null);
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Usuario no autenticado.");
      
      let url = `https://quimex.sistemataup.online/ordenes_compra/obtener_todas?page=${currentPage}&per_page=20`;
      if (filtro !== 'todos') {
        url += `&estado=${filtro}`;
      }

      const response = await fetch(url, {
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
      });
      if (!response.ok) {
        const errData = await response.json().catch(()=>({message:`Error ${response.status}`}));
        throw new Error(errData.message || "Error al traer órdenes.");
      }
      const data = await response.json();
      setOrdenes(data.ordenes || []);
      setPagination(data.pagination || null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido.';
      setError(msg);
      console.error("FetchOrdenes Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrdenes(page, filtroEstado);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filtroEstado]);

  // Cargar resumen del primer ítem (producto y cantidad) por orden mostrada
  useEffect(() => {
    const cargarResumen = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) return;
        const lista = (['Aprobado','Solicitado'].includes(filtroEstado) ? filtrarPorEstado(ordenes, filtroEstado) : ordenes);
        const idsAConsultar = lista.map(o => o.id).filter(id => !(id in resumenItems));
        if (idsAConsultar.length === 0) return;
        const resultados = await Promise.all(idsAConsultar.map(async (ordenId) => {
          try {
            const resp = await fetch(`https://quimex.sistemataup.online/ordenes_compra/obtener/${ordenId}`, {
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
            });
            if (!resp.ok) return { id: ordenId, codigo: '', cantidad: 0 };
            const data = await resp.json();
            const item = Array.isArray(data.items) && data.items.length ? data.items[0] : null;
            const codigo = item?.producto_codigo || '';
            const cantidad = Number(item?.cantidad_solicitada ?? item?.cantidad ?? 0);
            const productoId = Number(item?.producto_id || 0);
            return { id: ordenId, codigo, cantidad, productoId };
          } catch (e) {
            console.error('Error obteniendo resumen de ítem para orden', ordenId, e);
            return { id: ordenId, codigo: '', cantidad: 0, productoId: 0 };
          }
        }));
        setResumenItems(prev => {
          const next = { ...prev };
          resultados.forEach(r => { next[r.id] = { productoId: r.productoId ?? 0, codigo: r.codigo, cantidad: r.cantidad }; });
          return next;
        });
      } catch (e) {
        console.error('Error cargando resumen de ítems:', e);
      }
    };
    cargarResumen();
  }, [ordenes, filtroEstado, resumenItems]);

  const handleFiltroChange = (nuevoFiltro: 'Aprobado' | 'Solicitado' | 'todos') => {
    setFiltroEstado(nuevoFiltro);
    setPage(1);
  };

  const handleAprobarOrden = async (ordenId: number) => {
    if (processingId) return;

    if (!aprobacionOpen) {
      const o = ordenes.find(x => x.id === ordenId);
      const total = Number(o?.importe_total_estimado ?? 0) || 0;
      setAprobacionOrdenId(ordenId);
      setAprobacionPagoCompleto(true);
      setAprobacionImporteAbonado(total.toFixed(2));
      setAprobacionFormaPago('Efectivo');
      setAprobacionError(null);
      setAprobacionOpen(true);
      return;
    }

    setProcessingId(ordenId); setActionError(null); setActionSuccess(null);
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Usuario no autenticado.");
      
      const ordenRef = ordenes.find(o => o.id === ordenId);
      const totalRef = Number(ordenRef?.importe_total_estimado ?? 0) || 0;
      const abonadoRef = aprobacionPagoCompleto ? totalRef : (parseFloat(aprobacionImporteAbonado || '0') || 0);
      const payload = { importe_abonado: abonadoRef, forma_pago: aprobacionFormaPago };
      const response = await fetch(`https://quimex.sistemataup.online/ordenes_compra/aprobar/${ordenId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role' : user.role,
          'X-User-Name' : user.name,
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      let result: unknown = {};
      try { result = await response.json(); }
      catch { result = await response.text(); }
      if (!response.ok) {
        const msg = typeof result === 'string'
          ? result
          : (result && typeof result === 'object' && 'error' in result ? (result as { error?: string }).error || `Error ${response.status}` : `Error ${response.status} al aprobar la orden.`);
        throw new Error(msg);
      }
      
      const message = (result && typeof result === 'object' && 'message' in result) ? (result as { message?: string }).message : undefined;
      const ordenEstado = (result && typeof result === 'object' && 'orden' in result && typeof (result as { orden?: { estado?: string } }).orden?.estado === 'string')
        ? (result as { orden?: { estado?: string } }).orden!.estado
        : undefined;
      setActionSuccess(message || `Orden Nº ${ordenId} aprobada con éxito.`);
      setOrdenes(prevOrdenes => prevOrdenes.map(o => 
        o.id === ordenId ? { ...o, estado: ordenEstado || 'Aprobado' } : o
      ).filter(o => filtroEstado === 'todos' || o.estado === filtroEstado));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ocurrió un error al aprobar la orden.';
      setActionError(msg);
    } finally {
      setProcessingId(null);
      setAprobacionOpen(false);
      setAprobacionOrdenId(null);
      setTimeout(() => { setActionSuccess(null); setActionError(null); }, 5000);
    }
  };

  const handleRechazarOrden = async (ordenId: number) => {
    if (processingId) return;

    const motivoRechazo = window.prompt(`Por favor, ingrese el motivo para RECHAZAR la orden de compra Nº ${ordenId.toString().padStart(4, '0')}:`);
    if (motivoRechazo === null) return;
    if (!motivoRechazo.trim()) {
      alert("El motivo de rechazo no puede estar vacío.");
      return;
    }

    setProcessingId(ordenId); setActionError(null); setActionSuccess(null);
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Usuario no autenticado.");

      const response = await fetch(`https://quimex.sistemataup.online/ordenes_compra/rechazar/${ordenId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role' : user.role,
          'X-User-Name' : user.name,
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ motivo_rechazo: motivoRechazo }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || `Error ${response.status} al rechazar la orden.`);
      }

      setActionSuccess(result.message || `Orden Nº ${ordenId} rechazada con éxito.`);
      setOrdenes(prevOrdenes => prevOrdenes.map(o => 
        o.id === ordenId ? { ...o, estado: result.orden?.estado || 'Rechazado', motivo_rechazo: motivoRechazo } : o
      ).filter(o => filtroEstado === 'todos' || o.estado === filtroEstado));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ocurrió un error al rechazar la orden.';
      setActionError(msg);
      console.error("Error rechazando orden:", err);
    } finally {
      setProcessingId(null);
      setTimeout(() => { setActionSuccess(null); setActionError(null); }, 5000);
    }
  };


  if (idOrdenSeleccionada) {
    return <SolicitudIngresoPage id={idOrdenSeleccionada} />;
  }


  // Solo permitir filtro 'Aprobado' para ALMACEN

  // Si viene con filtro 'Solicitado' por query, solo mostrar ese filtro

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-indigo-900 py-10 px-4">
      <div className="bg-white p-6 md:p-8 rounded-lg shadow-xl w-full max-w-4xl lg:max-w-5xl">
        <BotonVolver />
        <h2 className="text-2xl md:text-3xl font-semibold mb-6 text-center text-indigo-800">
          Lista de Órdenes de Compra
        </h2>

        <div className="flex flex-col md:flex-row justify-center items-center gap-2 mb-6 border-b pb-4">
          {/* Solo el admin puede ver y filtrar por pendientes de aprobación */}
          {esAdmin ? (
            filtroEstado === 'Aprobado' ? (
              <>
                <button
                  disabled
                  className={`px-4 py-2 text-base font-bold rounded transition-all duration-200 shadow-md border-2 border-green-400 bg-green-100 text-green-900 ring-2 ring-green-500`}
                >
                  Recepciones Pendientes
                </button>
                <button
                  onClick={() => handleFiltroChange('Solicitado')}
                  disabled={loading}
                  className={`px-4 py-2 text-base font-bold rounded transition-all duration-200 shadow-md border-2 border-yellow-400 bg-yellow-100 text-yellow-900 hover:bg-yellow-200${(filtroEstado as string) === 'Solicitado' ? ' ring-2 ring-yellow-500' : ''}`}
                >
                  Solicitudes Pendientes de Aprobación
                </button>
                <button
                  onClick={() => handleFiltroChange('todos')}
                  disabled={loading}
                  className={`px-4 py-2 text-base font-bold rounded transition-all duration-200 shadow-md border-2 border-indigo-400 bg-indigo-100 text-indigo-900 hover:bg-indigo-200${(filtroEstado as string) === 'todos' ? ' ring-2 ring-indigo-500' : ''}`}
                >
                  Ver Todas
                </button>
              </>
            ) : filtroEstado === 'Solicitado' ? (
              <>
                <button
                  onClick={() => handleFiltroChange('Aprobado')}
                  disabled={loading}
                  className={`px-4 py-2 text-base font-bold rounded transition-all duration-200 shadow-md border-2 border-green-400 bg-green-100 text-green-900 hover:bg-green-200${(filtroEstado as string) === 'Aprobado' ? ' ring-2 ring-green-500' : ''}`}
                >
                  Recepciones Pendientes
                </button>
                <button
                  disabled
                  className={`px-4 py-2 text-base font-bold rounded transition-all duration-200 shadow-md border-2 border-yellow-400 bg-yellow-100 text-yellow-900 ring-2 ring-yellow-500`}
                >
                  Solicitudes Pendientes de Aprobación
                </button>
                <button
                  onClick={() => handleFiltroChange('todos')}
                  disabled={loading}
                  className={`px-4 py-2 text-base font-bold rounded transition-all duration-200 shadow-md border-2 border-indigo-400 bg-indigo-100 text-indigo-900 hover:bg-indigo-200${(filtroEstado as string) === 'todos' ? ' ring-2 ring-indigo-500' : ''}`}
                >
                  Ver Todas
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => handleFiltroChange('Aprobado')}
                  disabled={loading}
                  className={`px-4 py-2 text-base font-bold rounded transition-all duration-200 shadow-md border-2 border-green-400 bg-green-100 text-green-900 hover:bg-green-200${(filtroEstado as string) === 'Aprobado' ? ' ring-2 ring-green-500' : ''}`}
                >
                  Recepciones Pendientes
                </button>
                <button
                  onClick={() => handleFiltroChange('Solicitado')}
                  disabled={loading}
                  className={`px-4 py-2 text-base font-bold rounded transition-all duration-200 shadow-md border-2 border-yellow-400 bg-yellow-100 text-yellow-900 hover:bg-yellow-200${(filtroEstado as string) === 'Solicitado' ? ' ring-2 ring-yellow-500' : ''}`}
                >
                  Solicitudes Pendientes de Aprobación
                </button>
                <button
                  onClick={() => handleFiltroChange('todos')}
                  disabled={loading}
                  className={`px-4 py-2 text-base font-bold rounded transition-all duration-200 shadow-md border-2 border-indigo-400 bg-indigo-100 text-indigo-900 hover:bg-indigo-200${filtroEstado === 'todos' ? ' ring-2 ring-indigo-500' : ''}`}
                >
                  Ver Todas
                </button>
              </>
            )
          ) : (
            // No admin: solo puede ver recepciones pendientes y todas
            <>
              <button
                disabled
                className={`px-4 py-2 text-base font-bold rounded transition-all duration-200 shadow-md border-2 border-green-400 bg-green-100 text-green-900 ring-2 ring-green-500`}
              >
                Recepciones Pendientes
              </button>
              <button
                onClick={() => handleFiltroChange('todos')}
                disabled={loading}
                className={`px-4 py-2 text-base font-bold rounded transition-all duration-200 shadow-md border-2 border-indigo-400 bg-indigo-100 text-indigo-900 hover:bg-indigo-200${filtroEstado === 'todos' ? ' ring-2 ring-indigo-500' : ''}`}
              >
                Ver Todas
              </button>
            </>
          )}
        </div>

        {loading && <p className="text-center text-gray-600 my-4 text-sm">Cargando órdenes...</p>}
        {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert"><p>{error}</p></div>}
        {actionError && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert"><p>Error: {actionError}</p></div>}
        {actionSuccess && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4" role="alert"><p>{actionSuccess}</p></div>}

        {!loading && !error && (
          <>
            <div className="overflow-x-auto">
              <ul className="space-y-2 divide-y divide-gray-200 min-w-[900px]">
                <li className="grid grid-cols-[1fr_1.5fr_1fr_2fr_1fr_1fr] gap-x-3 items-center bg-gray-100 p-3 rounded-t-md font-semibold text-sm text-gray-700 uppercase tracking-wider">
                  <span>Nº Orden</span>
                  <span>Fecha Creación</span>
                  <span>Estado</span>
                  <span>Producto (Principal)</span>
                  <span>Cant. Solicitada</span>
                  <span className="text-center">Acciones</span>
                </li>

                {(['Aprobado','Solicitado'].includes(filtroEstado) ? filtrarPorEstado(ordenes, filtroEstado) : ordenes).length > 0 ?
                  (['Aprobado','Solicitado'].includes(filtroEstado) ? filtrarPorEstado(ordenes, filtroEstado) : ordenes).map((orden) => {
                  let fechaFormateada = 'N/A';
                  try {
                    fechaFormateada = new Date(orden.fecha_creacion).toLocaleDateString("es-AR", {
                      day: "2-digit", month: "2-digit", year: "numeric",
                    });
                  } catch (e) { console.error("Error formateando fecha:", orden.fecha_creacion, e); }

                  const isProcessingCurrent = processingId === orden.id;
                  const puedeActuar = orden.estado === 'Solicitado' && !processingId;

                  return (
                    <li key={orden.id} className="grid grid-cols-[1fr_1.5fr_1fr_2fr_1fr_1fr] gap-x-3 items-center bg-white hover:bg-gray-50 p-3 text-sm">
                      <span>{`Nº ${orden.id.toString().padStart(4, '0')}`}</span>
                      <span>{fechaFormateada}</span>
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${orden.estado === 'Aprobado' ? 'bg-green-100 text-green-800' : 
                          orden.estado === 'Rechazado' ? 'bg-red-100 text-red-800' : 
                          orden.estado === 'Solicitado' ? 'bg-yellow-100 text-yellow-800' : 
                          orden.estado === 'Con Deuda' ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-800'}`}>
                        {orden.estado}
                      </span>
                      <span>{
                        (() => {
                          const resumen = resumenItems[orden.id];
                          const pid = resumen?.productoId;
                          const nombre = productosDelContexto.find(p => String(p.id) === String(pid))?.nombre;
                          return nombre || resumen?.codigo || '—';
                        })()
                      }</span>
                      <span>{Number(resumenItems[orden.id]?.cantidad || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</span>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          title="Ver/Procesar Orden"
                          className="text-blue-600 hover:text-blue-800 p-1 rounded focus:outline-none disabled:opacity-50"
                          onClick={() => setIdOrdenSeleccionada(orden.id)}
                          disabled={!!processingId}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                        {user && user.role && user.role.toUpperCase() === 'ADMIN' && orden.estado === 'Solicitado' && (
                          <>
                        <button
                          title="Aprobar Orden"
                          onClick={() => handleAprobarOrden(orden.id)}
                          disabled={!puedeActuar || isProcessingCurrent}
                          className={`p-1 rounded text-green-500 hover:text-green-700 disabled:text-gray-400 disabled:cursor-not-allowed ${isProcessingCurrent ? 'animate-pulse' : ''}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                            <button
                              title="Rechazar Orden"
                              onClick={() => handleRechazarOrden(orden.id)}
                              disabled={!puedeActuar || isProcessingCurrent}
                              className={`p-1 rounded text-red-500 hover:text-red-700 disabled:text-gray-400 disabled:cursor-not-allowed ${isProcessingCurrent ? 'animate-pulse' : ''}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                }) : (
                  <li className="text-center py-8 text-gray-500 col-span-4">
                    No hay órdenes de compra para el filtro seleccionado.
                  </li>
                )}
              </ul>
            </div>
                
            {pagination && pagination.total_pages > 1 && (
              <div className="flex justify-center mt-6 gap-4">
                <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={!pagination.has_prev||loading} className="btn-pag">Anterior</button>
                <span className="text-indigo-700 font-medium text-sm self-center">Página {pagination.current_page} de {pagination.total_pages}</span>
                <button onClick={() => setPage(p => p+1)} disabled={!pagination.has_next||loading} className="btn-pag">Siguiente</button>
              </div>
            )}
          </>
        )}
      </div>
      <style jsx>{`
        .btn-pag { @apply px-4 py-2 rounded bg-indigo-700 text-white hover:bg-indigo-800 disabled:opacity-50 text-sm transition-colors; }
      `}</style>
      {aprobacionOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Aprobar Orden</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={aprobacionPagoCompleto} onChange={() => {
                  const next = !aprobacionPagoCompleto;
                  setAprobacionPagoCompleto(next);
                  if (next) {
                    const o = ordenes.find(x => x.id === aprobacionOrdenId);
                    const t = Number(o?.importe_total_estimado ?? 0) || 0;
                    setAprobacionImporteAbonado(t.toFixed(2));
                    setAprobacionError(null);
                  }
                }} className="w-4 h-4" />
                <span className="text-sm">Pago completo</span>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Importe abonado</label>
                <input type="number" step="0.01" min={0} value={aprobacionImporteAbonado} onChange={(e)=> setAprobacionImporteAbonado(e.target.value)} disabled={aprobacionPagoCompleto} className="w-full px-3 py-2 rounded border" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Forma de Pago</label>
                <select value={aprobacionFormaPago} onChange={(e)=> setAprobacionFormaPago(e.target.value)} className="w-full px-3 py-2 rounded border">
                  <option value="Efectivo">Efectivo</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Cuenta Corriente">Cuenta Corriente</option>
                </select>
              </div>
              {aprobacionError && <div className="text-sm text-red-600">{aprobacionError}</div>}
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300" onClick={() => { setAprobacionOpen(false); setAprobacionOrdenId(null); }}>Cancelar</button>
              <button type="button" className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700" onClick={() => handleAprobarOrden(aprobacionOrdenId!)}>Aprobar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
