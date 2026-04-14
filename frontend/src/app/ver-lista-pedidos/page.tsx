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
  fecha_aprobacion?: string;
  estado_recepcion?: string;
};

type DetalleItem = { id_linea?: number | string; cantidad_solicitada?: number | string; precio_unitario_estimado?: number | string };

type Pagination = {
  total_items: number;
  total_pages: number;
  current_page: number;
  per_page: number;
  has_next: boolean;
  has_prev: boolean;
};

const normalizarEstado = (estado?: string | null) => String(estado || '').trim().toUpperCase();

export default function ListaOrdenesCompra() {
  // Obtener usuario
  const userItem = typeof window !== 'undefined' ? localStorage.getItem('user') || sessionStorage.getItem('user') : null;
  const user = userItem ? JSON.parse(userItem) : null;
  const esAlmacen = user && user.role && user.role.toUpperCase() === 'ALMACEN';
  const esAdmin = user && user.role && user.role.toUpperCase() === 'ADMIN';

  // Estado para el filtro: por defecto 'Aprobado' (Recepciones Pendientes)
  // Solo el admin puede ver 'Solicitado'.
  const [filtroEstado, setFiltroEstado] = useState<'Aprobado' | 'Solicitado' | 'todos'>(esAdmin ? 'Solicitado' : 'Aprobado');
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
    const estadoFiltro = normalizarEstado(estado);
    if (estado === 'Aprobado') {
      return ordenes.filter((o: OrdenCompra) => normalizarEstado(o.estado) === 'APROBADO' || !!o.fecha_aprobacion);
    }
    return ordenes.filter((o: OrdenCompra) => normalizarEstado(o.estado) === estadoFiltro);
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
  const [filtroId, setFiltroId] = useState<string>("");
  const [filtroMes, setFiltroMes] = useState<string>(new Date().toISOString().slice(0, 7)); // YYYY-MM

  const abrirDetalleOrden = (ordenId: number) => {
    setIdOrdenSeleccionada(ordenId);
  };

  const fetchOrdenes = async (currentPage = page, filtro = filtroEstado) => {
    setLoading(true);
    setError(null);
    setActionError(null);
    setActionSuccess(null);
    try {
      const token = localStorage.getItem("authToken");
      if (!token) throw new Error("Usuario no autenticado.");

      let url = `https://quimex.sistemataup.online/api/ordenes_compra/obtener_todas?page=${currentPage}&per_page=20`;
      if (filtro !== 'todos') {
        // El backend espera los estados en MAYÚSCULAS
        url += `&estado=${filtro.toUpperCase()}`;
      }

      const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'X-User-Role': user?.role || '', 'X-User-Name': user?.name || user?.usuario || '' }
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ message: `Error ${response.status}` }));
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
        const token = localStorage.getItem("authToken");
        if (!token) return;
        const lista = (['Aprobado', 'Solicitado'].includes(filtroEstado) ? filtrarPorEstado(ordenes, filtroEstado) : ordenes);
        const idsAConsultar = lista.map(o => o.id).filter(id => !(id in resumenItems));
        if (idsAConsultar.length === 0) return;
        const resultados = await Promise.all(idsAConsultar.map(async (ordenId) => {
          try {
            const resp = await fetch(`https://quimex.sistemataup.online/api/ordenes_compra/obtener/${ordenId}`, {
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'X-User-Role': user?.role || '', 'X-User-Name': user?.name || user?.usuario || '' }
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
  }, [ordenes, filtroEstado, resumenItems, user?.name, user?.role, user?.usuario]);

  // Eliminado control de botones de filtro para vista de pendientes

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
      const token = localStorage.getItem("authToken");
      if (!token) throw new Error("Usuario no autenticado.");

      const ordenRef = ordenes.find(o => o.id === ordenId);
      const totalRef = Number(ordenRef?.importe_total_estimado ?? 0) || 0;
      let abonadoRef = aprobacionPagoCompleto ? totalRef : (parseFloat(aprobacionImporteAbonado || '0') || 0);
      const detalleResp = await fetch(`https://quimex.sistemataup.online/api/ordenes_compra/obtener/${ordenId}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-User-Role': user?.role || 'ADMIN',
          'X-User-Name': user?.name || user?.usuario || '',
        }
      });
      const detalleData = await detalleResp.json().catch(() => ({}));
      const proveedor_id = Number((detalleData?.proveedor_id) ?? (detalleData?.proveedor?.id) ?? 0);
      const itemsFull = Array.isArray(detalleData?.items) ? detalleData.items : [];
      const parseNum = (v: unknown): number | null => {
        if (v === undefined || v === null) return null;
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        const s = String(v).trim().replace(',', '.');
        if (s === '') return null;
        const n = Number(s);
        return Number.isFinite(n) ? n : null;
      };
      const itemsPayload: { id_linea: number; cantidad_solicitada?: number; precio_unitario_estimado?: number }[] = [];
      for (const it of itemsFull as DetalleItem[]) {
        const id_linea = typeof it.id_linea === 'number' ? it.id_linea : Number(it.id_linea ?? 0);
        if (!id_linea) continue;
        const line: { id_linea: number; cantidad_solicitada?: number; precio_unitario_estimado?: number } = { id_linea };
        const cs = parseNum(it.cantidad_solicitada);
        const pu = parseNum(it.precio_unitario_estimado);
        if (cs !== null && cs > 0) line.cantidad_solicitada = cs;
        if (pu !== null && pu > 0) line.precio_unitario_estimado = pu;
        if (Object.keys(line).length > 1) itemsPayload.push(line);
      }
      const importe_total_estimado = Number(detalleData?.importe_total_estimado ?? totalRef ?? 0);
      if (isFinite(importe_total_estimado)) {
        const t = Math.max(0, Number(importe_total_estimado.toFixed(2)));
        let a = Math.max(0, Number(abonadoRef.toFixed(2)));
        if (aprobacionPagoCompleto) {
          a = t;
        }
        if (a > t) a = t;
        abonadoRef = a;
      }
      const payload: Record<string, unknown> = {
        proveedor_id,
        cuenta: '',
        iibb: '',
        iva: '',
        tc: '',
        ajuste_tc: false,
        observaciones_solicitud: 'Aprobada desde Lista',
        tipo_caja: '',
        forma_pago: aprobacionFormaPago,
        importe_total_estimado,
        importe_abonado: abonadoRef,
        cheque_perteneciente_a: undefined,
      };
      if (itemsPayload.length > 0) {
        payload.items = itemsPayload;
      }
      const response = await fetch(`https://quimex.sistemataup.online/api/ordenes_compra/aprobar/${ordenId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': user.role,
          'X-User-Name': user.name,
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
      const nowIso = new Date().toISOString();
      setOrdenes(prevOrdenes => prevOrdenes.map(o =>
        o.id === ordenId ? { ...o, estado: ordenEstado || 'Aprobado', fecha_creacion: nowIso } : o
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
      const token = localStorage.getItem("authToken");
      if (!token) throw new Error("Usuario no autenticado.");

      const response = await fetch(`https://quimex.sistemataup.online/api/ordenes_compra/rechazar/${ordenId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': user.role,
          'X-User-Name': user.name,
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ motivo_rechazo: motivoRechazo }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || `Error ${response.status} al rechazar la orden.`);
      }

      setActionSuccess(result.message || `Orden Nº ${ordenId} rechazada con éxito.`);
      const nowIso = new Date().toISOString();
      setOrdenes(prevOrdenes => prevOrdenes.map(o =>
        o.id === ordenId ? { ...o, estado: result.orden?.estado || 'Rechazado', motivo_rechazo: motivoRechazo, fecha_creacion: nowIso } : o
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

  const ordenesFiltradas = (() => {
    const base = (['Aprobado', 'Solicitado'].includes(filtroEstado) ? filtrarPorEstado(ordenes, filtroEstado) : ordenes);
    const porId = filtroId ? base.filter(o => String(o.id).includes(filtroId.trim())) : base;
    const porMes = filtroMes ? porId.filter(o => {
      const d = new Date(String(o.fecha_creacion));
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}` === filtroMes;
    }) : porId;
    return porMes;
  })();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-indigo-900 py-10 px-4">
      <div className="bg-white p-6 md:p-8 rounded-lg shadow-xl w-full max-w-4xl lg:max-w-5xl">
        <BotonVolver />
        <h2 className="text-2xl md:text-3xl font-semibold mb-6 text-center text-indigo-800">
          {filtroEstado === 'Solicitado' ? 'Pendientes de Aprobación' : 'Lista de Órdenes de Compra'}
        </h2>

        <div className="flex flex-col md:flex-row justify-center items-end gap-3 mb-6 border-b pb-4">
          {esAdmin && (
            <>
              <div>
                <label className="text-sm text-gray-700">ID</label>
                <input type="text" value={filtroId} onChange={(e) => setFiltroId(e.target.value)} className="ml-2 px-2 py-1 border rounded" placeholder="Ej: 118" />
              </div>
              <div>
                <label className="text-sm text-gray-700">Mes</label>
                <input type="text" placeholder="YYYY-MM" value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} className="ml-2 px-2 py-1 border rounded" aria-label="Seleccionar mes (YYYY-MM)" />
              </div>
            </>
          )}
        </div>

        {loading && <p className="text-center text-gray-600 my-4 text-sm">Cargando órdenes...</p>}
        {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert"><p>{error}</p></div>}
        {actionError && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert"><p>Error: {actionError}</p></div>}
        {actionSuccess && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4" role="alert"><p>{actionSuccess}</p></div>}

        {!loading && !error && (
          <>
            <div className="w-full">
              <ul className="space-y-2 divide-y divide-gray-200 w-full">
                <li className="hidden md:grid grid-cols-[92px_112px_170px_minmax(0,1.4fr)_98px_126px_72px_220px] gap-x-2 items-center bg-gray-100 p-3 rounded-t-md font-semibold text-xs text-gray-700 uppercase tracking-wider">
                  <span>Nº Orden</span>
                  <span>Fecha</span>
                  <span>Estado</span>
                  <span>Producto</span>
                  <span>Cantidad</span>
                  <span>Importe</span>
                  <span>Moneda</span>
                  <span className="text-center">Acciones</span>
                </li>

                {ordenesFiltradas.length > 0 ? ordenesFiltradas.map((orden) => {
                  const estadoUpper = normalizarEstado(orden.estado);
                  const estadoRecepcionUpper = normalizarEstado(orden.estado_recepcion);
                  const etiquetaEstado = estadoUpper === 'SOLICITADO'
                    ? 'Pendiente de aprobación'
                    : estadoUpper === 'CON DEUDA'
                      ? 'Con Deuda'
                      : estadoUpper === 'RECIBIDA_PARCIAL'
                        ? 'Recibida Parcial'
                        : estadoUpper.charAt(0) + estadoUpper.slice(1).toLowerCase();
                  const claseEstado =
                    estadoUpper === 'APROBADO' ? 'bg-green-100 text-green-800' :
                      estadoUpper === 'RECHAZADO' ? 'bg-red-100 text-red-800' :
                        estadoUpper === 'SOLICITADO' ? 'bg-yellow-100 text-yellow-800' :
                          estadoUpper === 'CON DEUDA' ? 'bg-orange-100 text-orange-800' :
                            estadoUpper === 'RECIBIDA_PARCIAL' ? 'bg-blue-100 text-blue-800' :
                              'bg-gray-100 text-gray-800';

                  const resumen = resumenItems[orden.id];
                  const pid = resumen?.productoId;
                  const nombreProducto = productosDelContexto.find(p => String(p.id) === String(pid))?.nombre || resumen?.codigo || '—';
                  const puedeAprobarRechazar = user && user.role && user.role.toUpperCase() === 'ADMIN' && estadoUpper === 'SOLICITADO';

                  return (
                    <li
                      key={orden.id}
                      className="bg-white hover:bg-gray-50 text-sm rounded border border-gray-100"
                    >
                      <div
                        className="md:hidden p-3 cursor-pointer"
                        onClick={() => abrirDetalleOrden(orden.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-indigo-600">Nº {orden.id.toString().padStart(4, '0')}</span>
                          <span className="text-xs text-gray-500">{new Date(orden.fecha_creacion).toLocaleDateString("es-AR")}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${claseEstado}`}>
                            {etiquetaEstado}
                          </span>
                          {!!orden.fecha_aprobacion && (
                            <span className="px-2 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full bg-green-100 text-green-800">
                              ✓ Aprobado
                            </span>
                          )}
                          {(estadoRecepcionUpper === 'EN_ESPERA_RECEPCION' || estadoRecepcionUpper === 'PARCIAL') && (
                            <span className="px-2 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full bg-blue-100 text-blue-800">
                              Pendiente recepción
                            </span>
                          )}
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-700">
                          <div><span className="font-medium">Producto:</span> {nombreProducto}</div>
                          <div><span className="font-medium">Cantidad:</span> {Number(resumenItems[orden.id]?.cantidad || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</div>
                          <div><span className="font-medium">Importe:</span> {Number(orden.importe_total_estimado || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          <div><span className="font-medium">Moneda:</span> {orden.moneda || 'ARS'}</div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="px-3 py-1.5 rounded bg-indigo-600 text-white text-xs hover:bg-indigo-700"
                            onClick={() => abrirDetalleOrden(orden.id)}
                          >
                            Ver detalle
                          </button>
                          {puedeAprobarRechazar && (
                            <>
                              <button
                                type="button"
                                className="px-3 py-1.5 rounded bg-green-600 text-white text-xs hover:bg-green-700"
                                onClick={() => handleAprobarOrden(orden.id)}
                                disabled={!!processingId}
                              >
                                Aprobar
                              </button>
                              <button
                                type="button"
                                className="px-3 py-1.5 rounded bg-red-600 text-white text-xs hover:bg-red-700"
                                onClick={() => handleRechazarOrden(orden.id)}
                                disabled={!!processingId}
                              >
                                Rechazar
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <div
                        className="hidden md:grid grid-cols-[92px_112px_170px_minmax(0,1.4fr)_98px_126px_72px_220px] gap-x-2 items-center p-3 cursor-pointer"
                        onClick={() => abrirDetalleOrden(orden.id)}
                      >
                        <span className="font-semibold text-indigo-600">Nº {orden.id.toString().padStart(4, '0')}</span>
                        <span>{new Date(orden.fecha_creacion).toLocaleDateString("es-AR")}</span>
                        <div className="flex flex-col gap-1">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full w-fit ${claseEstado}`}>
                            {etiquetaEstado}
                          </span>
                          {!!orden.fecha_aprobacion && (
                            <span className="px-2 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full bg-green-100 text-green-800 w-fit">
                              ✓ Aprobado
                            </span>
                          )}
                          {(estadoRecepcionUpper === 'EN_ESPERA_RECEPCION' || estadoRecepcionUpper === 'PARCIAL') && (
                            <span className="px-2 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full bg-blue-100 text-blue-800 w-fit">
                              Pendiente recepción
                            </span>
                          )}
                        </div>
                        <span className="truncate" title={nombreProducto}>{nombreProducto}</span>
                        <span>{Number(resumenItems[orden.id]?.cantidad || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</span>
                        <span>{Number(orden.importe_total_estimado || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <span className="font-semibold">{orden.moneda || 'ARS'}</span>
                        <div className="flex items-center justify-start gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="px-2 py-1 rounded bg-indigo-600 text-white text-xs hover:bg-indigo-700"
                            onClick={() => abrirDetalleOrden(orden.id)}
                          >
                            Ver
                          </button>
                          {puedeAprobarRechazar && (
                            <>
                              <button
                                type="button"
                                className="px-2 py-1 rounded bg-green-600 text-white text-xs hover:bg-green-700"
                                onClick={() => handleAprobarOrden(orden.id)}
                                disabled={!!processingId}
                              >
                                Aprobar
                              </button>
                              <button
                                type="button"
                                className="px-2 py-1 rounded bg-red-600 text-white text-xs hover:bg-red-700"
                                onClick={() => handleRechazarOrden(orden.id)}
                                disabled={!!processingId}
                              >
                                Rechazar
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                }) : (
                  <li className="text-center py-8 text-gray-500 col-span-full">
                    No hay órdenes de compra para el filtro seleccionado.
                  </li>
                )}
              </ul>
            </div>

            {pagination && pagination.total_pages > 1 && (
              <div className="flex justify-center mt-6 gap-4">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={!pagination.has_prev || loading} className="btn-pag">Anterior</button>
                <span className="text-indigo-700 font-medium text-sm self-center">Página {pagination.current_page} de {pagination.total_pages}</span>
                <button onClick={() => setPage(p => p + 1)} disabled={!pagination.has_next || loading} className="btn-pag">Siguiente</button>
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
                <input type="number" step="0.01" min={0} value={aprobacionImporteAbonado} onChange={(e) => setAprobacionImporteAbonado(e.target.value)} disabled={aprobacionPagoCompleto} className="w-full px-3 py-2 rounded border" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Forma de Pago</label>
                <select value={aprobacionFormaPago} onChange={(e) => setAprobacionFormaPago(e.target.value)} className="w-full px-3 py-2 rounded border">
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
