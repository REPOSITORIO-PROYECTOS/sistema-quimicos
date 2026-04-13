"use client";

import { PUBLIC_API_BASE_URL } from '@/lib/publicApiBase';
import BotonVolver from '@/components/BotonVolver';
import SolicitudIngresoPage from '@/components/solicitudIngresoPage';
import { ProductsProvider } from '@/context/ProductsContext';
import { ProveedoresProvider } from '@/context/ProveedoresContext';
import { useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';

type OrdenResumen = { id: number; fecha_creacion: string; estado: string; proveedor_id: number; importe_total_estimado?: number; importe_abonado?: number; estado_recepcion?: string; ajuste_tc?: boolean };
type ItemDetalle = { id_linea: number; producto_id: number; producto_nombre?: string; cantidad_solicitada: number; cantidad_recibida?: number; precio_unitario_estimado: number; importe_linea_estimado: number };
type ItemAPI = { id_linea: number | string; producto_id: number | string; producto_nombre?: string; cantidad_solicitada?: number | string; cantidad_recibida?: number | string; precio_unitario_estimado?: number | string; importe_linea_estimado?: number | string };
type Movimiento = { id: number; proveedor_id: number; orden_id: number | null; tipo: 'DEBITO' | 'CREDITO'; monto: number; fecha: string; descripcion?: string | null; usuario?: string | null };

const API = PUBLIC_API_BASE_URL;
const formatMoney = (value: number) => `$${Number(value || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MONEDA_CONTABLE = 'ARS';
const formatMoneyWithCurrency = (value: number, currency: 'ARS' | 'USD') => `${currency} ${formatMoney(value)}`;
const DEFAULT_TC = 1;

const extraerTcSnapshot = (texto?: string | null): number | null => {
  const raw = String(texto || '');
  const marker = '__TC_SNAPSHOT__:';
  const line = raw.split('\n').find((part) => part.startsWith(marker));
  if (!line) return null;
  try {
    const payload = JSON.parse(line.slice(marker.length).trim());
    const valor = Number(payload?.tc_usado);
    return Number.isFinite(valor) && valor > 0 ? valor : null;
  } catch {
    return null;
  }
};
const formatPaymentDate = (value?: string | null) => {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export default function DeudaProveedoresPage() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
  const userItem = typeof window !== 'undefined' ? localStorage.getItem('user') || sessionStorage.getItem('user') : null;
  const user = userItem ? JSON.parse(userItem) : null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ordenes, setOrdenes] = useState<OrdenResumen[]>([]);
  const [itemsPorOrden, setItemsPorOrden] = useState<Record<number, ItemDetalle[]>>({});
  const [proveedorPorOrden, setProveedorPorOrden] = useState<Record<number, string>>({});
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [tcPorOrden, setTcPorOrden] = useState<Record<number, number>>({});
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');
  const [filtroProveedor, setFiltroProveedor] = useState('');
  const [filtroProducto, setFiltroProducto] = useState('');
  const [ordenarPor, setOrdenarPor] = useState<'pendiente' | 'orden'>('pendiente');
  const [seleccionOcId, setSeleccionOcId] = useState<number | null>(null);
  const [refrescando, setRefrescando] = useState(false);
  const [proveedoresDisponibles, setProveedoresDisponibles] = useState<{ id: number, nombre: string }[]>([]);
  const [productosDisponibles, setProductosDisponibles] = useState<{ id: number, nombre: string }[]>([]);
  /** Misma fuente que Historial de Compras: cotización compras actual (no el TC snapshot por OC). */
  const [tipoCambioCompras, setTipoCambioCompras] = useState(0);

  const fetchTipoCambioCompras = async () => {
    try {
      const candidatos = ['DolarCompras', 'Oficial', 'USD', 'Empresa'];
      for (const nombre of candidatos) {
        const resp = await fetch(`${API}/tipos_cambio/obtener/${nombre}`);
        if (!resp.ok) continue;
        const data = await resp.json().catch(() => ({}));
        const val = Number((data as { valor?: number })?.valor ?? 0);
        if (val > 0) {
          setTipoCambioCompras(val);
          return;
        }
      }
    } catch {
      /* ignorar */
    }
  };

  const fetchDeudaOrdenes = async () => {
    if (!token) throw new Error('No autenticado');
    const headers = { 'Authorization': `Bearer ${token}`, 'X-User-Role': user?.role || '', 'X-User-Name': user?.usuario || user?.name || '', 'Content-Type': 'application/json' };
    const lista: OrdenResumen[] = [];
    let currentPage = 1;
    let hasNext = true;

    while (hasNext) {
      const res = await fetch(`${API}/ordenes_compra/obtener_todas?page=${currentPage}&per_page=100`, { headers });
      const data = await res.json();
      const pagina: OrdenResumen[] = (data.ordenes || []).map((o: OrdenResumen) => ({
        id: o.id,
        fecha_creacion: o.fecha_creacion,
        estado: o.estado,
        proveedor_id: o.proveedor_id,
        importe_total_estimado: o.importe_total_estimado ?? 0,
        importe_abonado: o.importe_abonado ?? 0,
        estado_recepcion: o.estado_recepcion,
        ajuste_tc: o.ajuste_tc ?? false
      }));
      lista.push(...pagina);
      hasNext = Boolean(data?.pagination?.has_next);
      currentPage += 1;
    }

    setOrdenes(lista);
    const detalles: Record<number, ItemDetalle[]> = {};
    const proveedoresMap = new Map<number, string>();
    const productosMap = new Map<number, string>();
    const tcMap: Record<number, number> = {};

    for (const oc of lista) {
      const rd = await fetch(`${API}/ordenes_compra/obtener/${oc.id}`, { headers: { 'Authorization': `Bearer ${token}`, 'X-User-Role': user?.role || '', 'X-User-Name': user?.usuario || user?.name || '', 'Content-Type': 'application/json' } });
      const dd = await rd.json();
      detalles[oc.id] = (dd.items || []).map((raw: ItemAPI) => ({
        id_linea: typeof raw.id_linea === 'number' ? raw.id_linea : Number(raw.id_linea),
        producto_id: typeof raw.producto_id === 'number' ? raw.producto_id : Number(raw.producto_id),
        producto_nombre: raw.producto_nombre,
        cantidad_solicitada: typeof raw.cantidad_solicitada === 'number' ? raw.cantidad_solicitada : Number(raw.cantidad_solicitada || 0),
        cantidad_recibida: typeof raw.cantidad_recibida === 'number' ? raw.cantidad_recibida : Number(raw.cantidad_recibida || 0),
        precio_unitario_estimado: typeof raw.precio_unitario_estimado === 'number' ? raw.precio_unitario_estimado : Number(raw.precio_unitario_estimado || 0),
        importe_linea_estimado: typeof raw.importe_linea_estimado === 'number' ? raw.importe_linea_estimado : Number(raw.importe_linea_estimado || 0)
      }));
      const provNombre = (dd.proveedor_nombre as string) || (dd.proveedor && typeof dd.proveedor.nombre === 'string' ? dd.proveedor.nombre : '') || '';
      proveedorPorOrden[oc.id] = provNombre;
      // TC vigente de la OC: priorizar columnas del API (se actualizan al cambiar DolarCompras), luego snapshot en texto.
      const tcTrans = Number((dd as { tc_transaccion?: number }).tc_transaccion);
      const tcSnapCol = Number((dd as { tc_snapshot?: number }).tc_snapshot);
      let tcOrden = 0;
      if (Number.isFinite(tcTrans) && tcTrans > 0) tcOrden = tcTrans;
      else if (Number.isFinite(tcSnapCol) && tcSnapCol > 0) tcOrden = tcSnapCol;
      else {
        const tcNotas = extraerTcSnapshot(dd?.notas_recepcion);
        const tcObs = extraerTcSnapshot(dd?.observaciones_solicitud);
        if (tcNotas) tcOrden = tcNotas;
        else if (tcObs) tcOrden = tcObs;
      }
      if (tcOrden > 0) tcMap[oc.id] = tcOrden;

      // Llenar proveedores disponibles
      if (provNombre) {
        proveedoresMap.set(oc.proveedor_id, provNombre);
      }

      // Llenar productos disponibles si hay items pendientes de recepción
      if (dd.estado_recepcion !== 'COMPLETA') {
        detalles[oc.id].forEach(item => {
          if (item.producto_nombre) {
            productosMap.set(item.producto_id, item.producto_nombre);
          }
        });
      }
    }
    setItemsPorOrden(detalles);
    setProveedorPorOrden({ ...proveedorPorOrden });
    setTcPorOrden(tcMap);
    setProveedoresDisponibles(Array.from(proveedoresMap.entries()).map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre)));
    setProductosDisponibles(Array.from(productosMap.entries()).map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre)));
  };

  const fetchMovs = async () => {
    if (!token) return;
    const res = await fetch(`${API}/finanzas/movimientos`, { headers: { 'Authorization': `Bearer ${token}`, 'X-User-Role': user?.role || '', 'X-User-Name': user?.usuario || user?.name || '', 'Content-Type': 'application/json' } });
    const data = await res.json();
    setMovimientos(data.movimientos || []);
  };

  // Simplificado: esta página solo lista boletas con total, abonado, pendiente y último pago

  const recargarTodo = async () => {
    if (!token) return;
    setRefrescando(true);
    setError(null);
    try {
      await Promise.all([fetchDeudaOrdenes(), fetchMovs(), fetchTipoCambioCompras()]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error cargando datos');
    } finally {
      setRefrescando(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setError(null);
        await Promise.all([fetchDeudaOrdenes(), fetchMovs(), fetchTipoCambioCompras()]);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Error cargando datos';
        setError(msg);
      } finally { setLoading(false); }
    })();
    const interval = setInterval(() => {
      void fetchDeudaOrdenes();
      void fetchMovs();
      void fetchTipoCambioCompras();
    }, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroDesde, filtroHasta]);

  const filasOrdenes = useMemo(() => {
    const rows: {
      ocId: number;
      total: number;
      abonado: number;
      pendiente: number;
      recepcionado: number;
      saldoOperativo: number;
      anticipoArs: number;
      cantidadRecibidaTotal: number;
      cantidadSolicitadaTotal: number;
      ultimoPago?: string;
      fecha: string;
      proveedor: string;
      items: ItemDetalle[];
      pagos: Movimiento[];
      esUSD?: boolean;
      pendienteOCMoneda: number;
      pendienteArs: number;
    }[] = [];
    for (const oc of ordenes) {
      const items = itemsPorOrden[oc.id] || [];
      const totalCabecera = Number(oc.importe_total_estimado || 0);
      const baseSolicitud = items.reduce(
        (acc, it) => acc + Number(it.cantidad_solicitada || 0) * Number(it.precio_unitario_estimado || 0),
        0
      );
      const totalOC =
        totalCabecera ||
        items.reduce((acc, it) => acc + (it.importe_linea_estimado || (it.cantidad_solicitada * it.precio_unitario_estimado)), 0);
      const recepcionadoOC = items.reduce((acc, it) => acc + ((Number(it.cantidad_recibida || 0) * Number(it.precio_unitario_estimado || 0)) || 0), 0);
      const totalRef = Math.max(totalOC, baseSolicitud, recepcionadoOC);
      const abonadoOC = Number(oc.importe_abonado || 0);
      const cantidadRecibidaTotal = items.reduce((acc, it) => acc + Number(it.cantidad_recibida || 0), 0);
      const cantidadSolicitadaTotal = items.reduce((acc, it) => acc + Number(it.cantidad_solicitada || 0), 0);
      const saldoOperativo = recepcionadoOC - abonadoOC;
      const esUSD = oc.ajuste_tc === true;
      // ARS alineado con Historial: cotización compras actual; fallback TC de la OC si aún no cargó el API.
      const tcParaArs = esUSD
        ? (tipoCambioCompras > 0 ? tipoCambioCompras : (tcPorOrden[oc.id] || DEFAULT_TC))
        : 1;
      const recepNorm = String(oc.estado_recepcion || '').toUpperCase();
      const recepcionCompleta =
        recepNorm === 'COMPLETA' ||
        recepNorm === 'RECIBIDO' ||
        (cantidadSolicitadaTotal > 0 && cantidadRecibidaTotal >= cantidadSolicitadaTotal);
      // Con recepción parcial solo se adeuda lo ya recepcionado; el saldo del pedido pendiente de entrega no entra acá.
      const basePendienteOC = recepcionCompleta ? totalRef : recepcionadoOC;
      const pendienteOCMoneda = Math.max(0, basePendienteOC - abonadoOC);
      const pendienteArs = esUSD ? (pendienteOCMoneda * tcParaArs) : pendienteOCMoneda;
      const anticipoArs = saldoOperativo < 0 ? (esUSD ? (Math.abs(saldoOperativo) * tcParaArs) : Math.abs(saldoOperativo)) : 0;
      const movsOCAll = movimientos.filter(m => m.orden_id === oc.id);
      const movsOC = movsOCAll
        .filter(m => m.tipo === 'CREDITO')
        .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
      const ultimoPago = movsOC.length > 0 ? new Date(Math.max(...movsOC.map(m => new Date(m.fecha).getTime()))).toLocaleDateString('es-AR') : undefined;
      const d = new Date(oc.fecha_creacion);
      const okDesde = filtroDesde ? d >= new Date(filtroDesde) : true;
      const okHasta = filtroHasta ? d <= new Date(filtroHasta) : true;
      const proveedor = proveedorPorOrden[oc.id] || String(oc.proveedor_id);
      const okProveedor = filtroProveedor ? proveedor === filtroProveedor : true;
      const okProducto = filtroProducto ? items.some(item => item.producto_nombre === filtroProducto) : true;
      if (!(okDesde && okHasta && okProveedor && okProducto)) continue;
      // Mostrar solo deuda real vigente (no historial contable arrastrado).
      if (pendienteArs <= 0 || pendienteOCMoneda <= 0) continue;
      rows.push({
        ocId: oc.id,
        total: totalRef,
        abonado: abonadoOC,
        pendiente: pendienteArs,
        pendienteOCMoneda,
        pendienteArs,
        recepcionado: recepcionadoOC,
        saldoOperativo,
        anticipoArs,
        cantidadRecibidaTotal,
        cantidadSolicitadaTotal,
        ultimoPago,
        fecha: d.toLocaleDateString('es-AR'),
        proveedor,
        items,
        pagos: movsOC,
        esUSD,
      });
    }
    if (ordenarPor === 'pendiente') rows.sort((a, b) => b.pendiente - a.pendiente);
    if (ordenarPor === 'orden') rows.sort((a, b) => a.ocId - b.ocId);
    return rows;
  }, [ordenes, itemsPorOrden, movimientos, ordenarPor, filtroDesde, filtroHasta, filtroProveedor, filtroProducto, proveedorPorOrden, tcPorOrden, tipoCambioCompras]);

  const totalPendienteFiltrado = useMemo(
    () => filasOrdenes.reduce((acc, row) => acc + row.pendiente, 0),
    [filasOrdenes]
  );

  const totalAnticiposSinRecepcion = useMemo(
    () => filasOrdenes
      .filter((row) => row.cantidadRecibidaTotal <= 0 && row.abonado > 0)
      .reduce((acc, row) => acc + row.anticipoArs, 0),
    [filasOrdenes]
  );

  const exportCSV = () => {
    const headers = [
      'OC',
      'Fecha',
      'Proveedor',
      'Total',
      'Abonado',
      'Pendiente',
      'Pagos Registrados',
      'Producto',
      'Cant. Solicitada',
      'Cant. Recibida',
      'Precio Unitario',
      'Estado Recepción'
    ];

    const lines: string[] = [];
    filasOrdenes.forEach(r => {
      if (r.items && r.items.length > 0) {
        // Una línea por cada producto
        r.items.forEach(item => {
          const cantRecibida = Number(item.cantidad_recibida || 0);
          const cantSolicitada = Number(item.cantidad_solicitada || 0);
          const estadoItem = cantRecibida >= cantSolicitada ? 'Completo' : 'Pendiente';

          lines.push([
            r.ocId,
            r.fecha,
            r.proveedor || '-',
            r.total.toFixed(2),
            r.abonado.toFixed(2),
            r.pendiente.toFixed(2),
            r.pagos.length > 0
              ? r.pagos.map(pago => `${formatPaymentDate(pago.fecha)} | ${pago.monto.toFixed(2)} | ${pago.descripcion || 'Sin detalle'}`).join(' / ')
              : '-',
            item.producto_nombre || `ID ${item.producto_id}`,
            item.cantidad_solicitada || 0,
            cantRecibida,
            item.precio_unitario_estimado?.toFixed(2) || '-',
            estadoItem
          ].map(cell => typeof cell === 'string' && cell.includes(',') ? `"${cell}"` : cell).join(','));
        });
      } else {
        // Si no hay items, una línea con datos generales
        lines.push([
          r.ocId,
          r.fecha,
          r.proveedor || '-',
          r.total.toFixed(2),
          r.abonado.toFixed(2),
          r.pendiente.toFixed(2),
          r.pagos.length > 0
            ? r.pagos.map(pago => `${formatPaymentDate(pago.fecha)} | ${pago.monto.toFixed(2)} | ${pago.descripcion || 'Sin detalle'}`).join(' / ')
            : '-',
          'Sin items',
          '0',
          '0',
          '-',
          'N/A'
        ].join(','));
      }
    });

    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deuda_proveedores_detallado_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const exportPDF = () => {
    const doc = new jsPDF(); let y = 10; doc.setFontSize(14); doc.text('Deuda de Proveedores (Boletas)', 10, y); y += 8; doc.setFontSize(9);
    filasOrdenes.slice(0, 40).forEach(r => { doc.text(`OC ${String(r.ocId).padStart(4, '0')} | Tot ${r.total.toFixed(2)} | Ab ${r.abonado.toFixed(2)} | Pen ${r.pendiente.toFixed(2)} | Ult ${r.ultimoPago || ''} | ${r.fecha}`, 10, y); y += 6; });
    doc.save('deuda_proveedores_boletas.pdf');
  };

  if (seleccionOcId) {
    return (
      <ProductsProvider>
        <ProveedoresProvider>
          <SolicitudIngresoPage id={seleccionOcId} />
        </ProveedoresProvider>
      </ProductsProvider>
    );
  }

  return (
    <div className="min-h-screen bg-indigo-900 py-8 px-4">
      <div className="max-w-6xl mx-auto bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-indigo-800">Deuda de Proveedores</h1>
          <BotonVolver />
        </div>
        {loading && <p className="text-gray-600">Cargando datos...</p>}
        {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{error}</div>}

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 items-end mb-4">
          <div>
            <label className="text-sm text-gray-700">Proveedor</label>
            <select value={filtroProveedor} onChange={e => setFiltroProveedor(e.target.value)} className="ml-2 px-2 py-1 border rounded">
              <option value="">-- Todos --</option>
              {proveedoresDisponibles.map((p, idx) => <option key={`proveedor-${idx}-${p.nombre}`} value={p.nombre}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-700">Producto</label>
            <select value={filtroProducto} onChange={e => setFiltroProducto(e.target.value)} className="ml-2 px-2 py-1 border rounded">
              <option value="">-- Todos --</option>
              {productosDisponibles.map((p, idx) => <option key={`producto-${idx}-${p.nombre}`} value={p.nombre}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-700">Desde</label>
            <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)} className="ml-2 px-2 py-1 border rounded" />
          </div>
          <div>
            <label className="text-sm text-gray-700">Hasta</label>
            <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)} className="ml-2 px-2 py-1 border rounded" />
          </div>
          <div>
            <label className="text-sm text-gray-700">Ordenar por</label>
            <select value={ordenarPor} onChange={(e) => setOrdenarPor(e.target.value as 'pendiente' | 'orden')} className="ml-2 px-2 py-1 border rounded">
              <option value="pendiente">Pendiente</option>
              <option value="orden">Orden</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => void recargarTodo()}
            disabled={refrescando || !token}
            className="px-3 py-2 bg-emerald-600 text-white rounded disabled:opacity-50"
          >
            {refrescando ? 'Actualizando…' : 'Actualizar'}
          </button>
          <button onClick={exportCSV} className="px-3 py-2 bg-indigo-600 text-white rounded">Exportar CSV</button>
          <button onClick={exportPDF} className="px-3 py-2 bg-gray-200 rounded">Exportar PDF</button>
        </div>

        {/* Listado de boletas en deuda (simple) */}
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 flex flex-wrap justify-between gap-3">
          <div className="text-sm text-red-900">
            Total adeudado contable (filtro actual, {MONEDA_CONTABLE}): <span className="font-bold text-base tabular-nums">{formatMoney(totalPendienteFiltrado)}</span>
            {tipoCambioCompras > 0 && (
              <span className="block text-xs font-normal text-red-800 mt-1">
                Equivalente USD→ARS con cotización compras vigente: {tipoCambioCompras.toLocaleString('es-AR', { maximumFractionDigits: 4 })}
              </span>
            )}
          </div>
          <div className="text-sm text-amber-900">
            Anticipos sin recepción ({MONEDA_CONTABLE}): <span className="font-bold">{formatMoney(totalAnticiposSinRecepcion)}</span>
          </div>
        </div>

        <div className="overflow-x-auto mb-6">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-3 py-2 text-left">Orden y Fecha</th>
                <th className="px-3 py-2 text-left">Proveedor</th>
                <th className="px-3 py-2 text-left">Detalle de Compra</th>
                <th className="px-3 py-2 text-right">Totales (Moneda OC)</th>
                <th className="px-3 py-2 text-right">Monto Abonado (Moneda OC)</th>
                <th className="px-3 py-2 text-right">Deuda Pendiente ({MONEDA_CONTABLE})</th>
              </tr>
            </thead>
            <tbody>
              {filasOrdenes.map((r) => (
                <tr
                  key={r.ocId}
                  className="border-b hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSeleccionOcId(r.ocId)}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') setSeleccionOcId(r.ocId); }}
                  aria-label={`Ver detalle de OC ${String(r.ocId).padStart(4, '0')}`}
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="font-semibold text-gray-900">OC {String(r.ocId).padStart(4, '0')}</div>
                    <div className="text-xs text-gray-500">{r.fecha}</div>
                  </td>
                  <td className="px-3 py-2">{r.proveedor || '-'}</td>
                  <td className="px-3 py-2">
                    {r.items.length > 0 ? (
                      <div className="space-y-2">
                        <div className="text-xs text-gray-600">
                          Recibida / Pedida: <span className="font-medium">{r.cantidadRecibidaTotal.toLocaleString('es-AR', { maximumFractionDigits: 2 })} / {r.cantidadSolicitadaTotal.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</span>
                        </div>
                        <ul className="space-y-1">
                          {r.items.slice(0, 3).map(it => (
                            <li key={`${r.ocId}-${it.id_linea}`} className="leading-4">
                              <span>{it.producto_nombre || `ID ${it.producto_id}`}</span>{' '}
                              <span className="text-xs text-gray-500">(Recibido: {Number(it.cantidad_recibida || 0)} / Sol: {it.cantidad_solicitada})</span>
                            </li>
                          ))}
                          {r.items.length > 3 && <li className="text-xs text-gray-500">+{r.items.length - 3} más</li>}
                        </ul>
                      </div>
                    ) : (<span className="text-gray-400">Sin ítems</span>)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    <div>{formatMoneyWithCurrency(r.total, r.esUSD ? 'USD' : 'ARS')}</div>
                    <div className="text-xs text-gray-500">Recepcionado (est.): {formatMoneyWithCurrency(r.recepcionado, r.esUSD ? 'USD' : 'ARS')}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{formatMoneyWithCurrency(r.abonado, r.esUSD ? 'USD' : 'ARS')}</td>
                  <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${r.pendiente > 0 ? 'text-red-700' : 'text-green-700'}`}>
                    <div>{formatMoney(r.pendiente)}</div>
                    <div className="text-xs text-gray-600">Pend. OC: {formatMoneyWithCurrency(r.pendienteOCMoneda, r.esUSD ? 'USD' : 'ARS')}</div>
                    {r.saldoOperativo < 0 && <div className="text-xs text-amber-700">Anticipo: {formatMoney(r.anticipoArs)} (ARS)</div>}
                    {r.esUSD && <div className="text-xs text-gray-500">(Convertido a ARS)</div>}
                  </td>
                </tr>
              ))}
              {filasOrdenes.length === 0 && (
                <tr><td className="px-3 py-2" colSpan={6}>Sin órdenes en deuda/saldo para el período seleccionado.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Página simplificada sin dashboards: solo listado de boletas con deuda */}
      </div>
    </div>
  );
}
