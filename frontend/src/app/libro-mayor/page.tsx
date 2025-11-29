"use client";
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import jsPDF from 'jspdf';

type ResumenProveedor = { proveedor_id:number; proveedor_nombre:string; deuda:number; estado:string };
type Movimiento = { id:number; proveedor_id:number; orden_id:number|null; tipo:'DEBITO'|'CREDITO'; monto:number; fecha:string };
type OrdenResumen = { id:number; fecha_creacion:string; estado:string; proveedor_id:number; proveedor_nombre?:string; importe_total_estimado?:number; importe_abonado?:number };
type ItemDetalle = { id_linea:number; producto_id:number; producto_nombre?:string; cantidad_solicitada:number; precio_unitario_estimado:number; importe_linea_estimado:number };
type ItemAPI = { id_linea:number|string; producto_id:number|string; producto_nombre?:string; cantidad_solicitada?: number|string; precio_unitario_estimado?: number|string; importe_linea_estimado?: number|string };

const API = 'https://quimex.sistemataup.online';

export default function LibroMayorPage(){
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [dashboard, setDashboard] = useState<{deuda_total:number; pagos_total:number; resumen_proveedores:ResumenProveedor[]}>({deuda_total:0,pagos_total:0,resumen_proveedores:[]});
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [ordenes, setOrdenes] = useState<OrdenResumen[]>([]);
  const [itemsPorOrden, setItemsPorOrden] = useState<Record<number, ItemDetalle[]>>({});

  const [estadoFiltro, setEstadoFiltro] = useState<string>('Todos');
  const [estadosDisponibles, setEstadosDisponibles] = useState<string[]>(['Todos']);
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');

  const fetchDashboard = async () => {
    if (!token) return;
    const res = await fetch(`${API}/finanzas/dashboard`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setDashboard({ deuda_total: data.deuda_total || 0, pagos_total: data.pagos_total || 0, resumen_proveedores: data.resumen_proveedores || [] });
  };
  const fetchMovs = async () => {
    if (!token) return;
    const res = await fetch(`${API}/finanzas/movimientos`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setMovimientos(data.movimientos || []);
  };
  const fetchOrdenes = async () => {
    if (!token) return;
    const res = await fetch(`${API}/ordenes_compra/obtener_todas?page=1&per_page=50`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    const lista: OrdenResumen[] = (data.ordenes || []).map((o: OrdenResumen)=> ({ id:o.id, fecha_creacion:o.fecha_creacion, estado:o.estado, proveedor_id:o.proveedor_id, proveedor_nombre:o.proveedor_nombre, importe_total_estimado:o.importe_total_estimado ?? 0, importe_abonado:o.importe_abonado ?? 0 }));
    setOrdenes(lista);
    const det: Record<number, ItemDetalle[]> = {};
    for (const oc of lista) {
      const rd = await fetch(`${API}/ordenes_compra/obtener/${oc.id}`, { headers: { Authorization: `Bearer ${token}` } });
      const dd = await rd.json();
      det[oc.id] = (dd.items || []).map((raw: ItemAPI)=> ({ id_linea: typeof raw.id_linea === 'number' ? raw.id_linea : Number(raw.id_linea), producto_id: typeof raw.producto_id === 'number' ? raw.producto_id : Number(raw.producto_id), producto_nombre: raw.producto_nombre, cantidad_solicitada: typeof raw.cantidad_solicitada === 'number' ? raw.cantidad_solicitada : Number(raw.cantidad_solicitada||0), precio_unitario_estimado: typeof raw.precio_unitario_estimado === 'number' ? raw.precio_unitario_estimado : Number(raw.precio_unitario_estimado||0), importe_linea_estimado: typeof raw.importe_linea_estimado === 'number' ? raw.importe_linea_estimado : Number(raw.importe_linea_estimado||0) }));
    }
    setItemsPorOrden(det);
  };

  useEffect(()=>{
    (async ()=>{
      try { setLoading(true); setError(null); await Promise.all([fetchDashboard(), fetchMovs(), fetchOrdenes()]); }
      catch(e: unknown){ const msg = e instanceof Error ? e.message : 'Error cargando datos'; setError(msg); }
      finally{ setLoading(false); }
    })();
    const interval = setInterval(()=> { fetchDashboard(); fetchMovs(); fetchOrdenes(); }, 30000);
    return ()=> clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(()=>{
    const uniqEstados = Array.from(new Set(ordenes.map(o=> String(o.estado)))).filter(e=> !!e && e.trim().length>0);
    setEstadosDisponibles(['Todos', ...uniqEstados]);
  }, [ordenes]);

  const tablaOrdenes = useMemo(()=>{
    const rows = [] as { ocId:number; proveedor:string; fecha:string; estado:string; total:number; abonado:number; pendiente:number }[];
    for (const oc of ordenes) {
      const d = new Date(oc.fecha_creacion);
      const okDesde = filtroDesde ? d >= new Date(filtroDesde) : true;
      const okHasta = filtroHasta ? d <= new Date(filtroHasta) : true;
      if (!(okDesde && okHasta)) continue;
      if (estadoFiltro !== 'Todos' && String(oc.estado) !== estadoFiltro) continue;
      const items = itemsPorOrden[oc.id] || [];
      const total = Number(oc.importe_total_estimado||0) || items.reduce((acc,it)=> acc + (it.importe_linea_estimado|| (it.cantidad_solicitada*it.precio_unitario_estimado)), 0);
      const abonado = Number(oc.importe_abonado||0);
      const pendiente = Math.max(0, total - abonado);
      rows.push({ ocId: oc.id, proveedor: oc.proveedor_nombre||String(oc.proveedor_id), fecha: d.toLocaleDateString('es-AR'), estado: oc.estado, total, abonado, pendiente });
    }
    rows.sort((a,b)=> new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
    return rows;
  }, [ordenes, itemsPorOrden, estadoFiltro, filtroDesde, filtroHasta]);

  const deudaPorProveedor = useMemo(()=>{
    const map = new Map<string, number>();
    for (const r of tablaOrdenes) { map.set(r.proveedor, (map.get(r.proveedor)||0) + r.pendiente); }
    return Array.from(map.entries()).map(([proveedor, deuda])=> ({ proveedor, deuda })).sort((a,b)=> b.deuda - a.deuda).slice(0,10);
  }, [tablaOrdenes]);
  const deudaPorProducto = useMemo(()=>{
    const map = new Map<string, number>();
    for (const oc of ordenes) {
      const items = itemsPorOrden[oc.id] || [];
      const total = Number(oc.importe_total_estimado||0) || items.reduce((acc,it)=> acc + (it.importe_linea_estimado|| (it.cantidad_solicitada*it.precio_unitario_estimado)), 0);
      const abonado = Number(oc.importe_abonado||0);
      for (const it of items) {
        const itemTotal = it.importe_linea_estimado || (it.cantidad_solicitada*it.precio_unitario_estimado);
        const propAbono = total>0 ? (abonado * (itemTotal/total)) : 0;
        const pendienteItem = Math.max(0, itemTotal - propAbono);
        const key = it.producto_nombre || `ID ${it.producto_id}`;
        map.set(key, (map.get(key)||0) + pendienteItem);
      }
    }
    return Array.from(map.entries()).map(([producto, deuda])=> ({ producto, deuda })).sort((a,b)=> b.deuda - a.deuda).slice(0,10);
  }, [ordenes, itemsPorOrden]);

  const ultimoPagoGlobal = useMemo(()=>{
    const creditos = movimientos.filter(m=> m.tipo==='CREDITO');
    if (creditos.length===0) return '-';
    const maxTs = Math.max(...creditos.map(m=> new Date(m.fecha).getTime()));
    return new Date(maxTs).toLocaleString('es-AR');
  }, [movimientos]);

  const exportCSV = () => {
    const header = ['OC','Proveedor','Fecha','Estado','Total','Abonado','Pendiente'];
    const lines = tablaOrdenes.map(r=> [r.ocId, r.proveedor, r.fecha, r.estado, r.total.toFixed(2), r.abonado.toFixed(2), r.pendiente.toFixed(2)].join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='libro_mayor.csv'; a.click(); URL.revokeObjectURL(url);
  };
  const exportPDF = () => {
    const doc = new jsPDF(); let y=10; doc.setFontSize(14); doc.text('Libro Mayor - Órdenes', 10, y); y+=8; doc.setFontSize(9);
    tablaOrdenes.slice(0,40).forEach(r=> { doc.text(`OC ${String(r.ocId).padStart(4,'0')} | ${r.proveedor} | ${r.fecha} | ${r.estado} | Tot ${r.total.toFixed(2)} | Ab ${r.abonado.toFixed(2)} | Pen ${r.pendiente.toFixed(2)}`, 10, y); y+=6; });
    doc.save('libro_mayor.pdf');
  };

  const vencimientos = useMemo(()=>{
    return tablaOrdenes.filter(r=> {
      const d = new Date(r.fecha);
      const dias = (Date.now() - d.getTime())/(1000*60*60*24);
      return dias >= 25;
    }).map(r=> ({ ocId: r.ocId, dias: Math.floor((Date.now()- new Date(r.fecha).getTime())/(1000*60*60*24)) }));
  }, [tablaOrdenes]);

  return (
    <div className="min-h-screen bg-indigo-900 py-6 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-white">Libro Mayor</h1>
          <div className="flex gap-2">
            <button onClick={exportCSV} className="px-3 py-2 bg-indigo-600 text-white rounded">Exportar CSV</button>
            <button onClick={exportPDF} className="px-3 py-2 bg-gray-200 rounded">Exportar PDF</button>
          </div>
        </div>
        {loading && <p className="text-gray-200 mb-4">Cargando datos...</p>}
        {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 rounded bg-red-100">
            <div className="text-sm text-gray-600">Deuda Total</div>
            <div className="text-2xl font-bold text-red-700">${dashboard.deuda_total.toFixed(2)}</div>
          </div>
          <div className="p-4 rounded bg-green-100">
            <div className="text-sm text-gray-600">Pagos Totales</div>
            <div className="text-2xl font-bold text-green-700">${dashboard.pagos_total.toFixed(2)}</div>
          </div>
          <div className="p-4 rounded bg-indigo-100">
            <div className="text-sm text-gray-600">Último Pago</div>
            <div className="text-base font-semibold text-indigo-800">{ultimoPagoGlobal}</div>
          </div>
          <div className="p-4 rounded bg-orange-100">
            <div className="text-sm text-gray-600">Pendiente Prioritario</div>
            <div className="text-base font-semibold text-orange-800">${tablaOrdenes.reduce((acc,r)=> acc + r.pendiente, 0).toFixed(2)}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded p-4 shadow">
            <h2 className="text-lg font-semibold mb-3 text-indigo-800">Deuda por Proveedor</h2>
            <ul className="text-sm">
              {deudaPorProveedor.map(d=> (
                <li key={d.proveedor} className="flex justify-between py-1"><span>{d.proveedor}</span><span>${d.deuda.toFixed(2)}</span></li>
              ))}
              {deudaPorProveedor.length===0 && <li className="text-gray-500">Sin deudas</li>}
            </ul>
          </div>
          <div className="bg-white rounded p-4 shadow">
            <h2 className="text-lg font-semibold mb-3 text-indigo-800">Deuda por Producto</h2>
            <ul className="text-sm">
              {deudaPorProducto.map(d=> (
                <li key={d.producto} className="flex justify-between py-1"><span>{d.producto}</span><span>${d.deuda.toFixed(2)}</span></li>
              ))}
              {deudaPorProducto.length===0 && <li className="text-gray-500">Sin deudas</li>}
            </ul>
          </div>
        </div>

        <div className="bg-white rounded p-4 shadow mb-6">
          <div className="flex flex-wrap gap-3 items-end mb-3">
            <div>
              <label className="text-sm text-gray-700">Desde</label>
              <input type="date" value={filtroDesde} onChange={e=> setFiltroDesde(e.target.value)} className="ml-2 px-2 py-1 border rounded"/>
            </div>
            <div>
              <label className="text-sm text-gray-700">Hasta</label>
              <input type="date" value={filtroHasta} onChange={e=> setFiltroHasta(e.target.value)} className="ml-2 px-2 py-1 border rounded"/>
            </div>
            <div>
              <label className="text-sm text-gray-700">Estado</label>
              <select value={estadoFiltro} onChange={e=> setEstadoFiltro(e.target.value)} className="ml-2 px-2 py-1 border rounded">
                {estadosDisponibles.map(est=> (<option key={est} value={est}>{est}</option>))}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-3 py-2 text-left">OC</th>
                  <th className="px-3 py-2 text-left">Proveedor</th>
                  <th className="px-3 py-2 text-left">Fecha</th>
                  <th className="px-3 py-2 text-left">Estado</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Abonado</th>
                  <th className="px-3 py-2 text-right">Pendiente</th>
                </tr>
              </thead>
              <tbody>
                {tablaOrdenes.map(r=> (
                  <tr key={r.ocId} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2"><Link href={`/deuda-proveedores`} className="text-indigo-700">{String(r.ocId).padStart(4,'0')}</Link></td>
                    <td className="px-3 py-2">{r.proveedor}</td>
                    <td className="px-3 py-2">{r.fecha}</td>
                    <td className="px-3 py-2">{r.estado}</td>
                    <td className="px-3 py-2 text-right">${r.total.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">${r.abonado.toFixed(2)}</td>
                    <td className={`px-3 py-2 text-right ${r.pendiente>0?'text-red-700':'text-green-700'}`}>${r.pendiente.toFixed(2)}</td>
                  </tr>
                ))}
                {tablaOrdenes.length===0 && (
                  <tr><td className="px-3 py-2" colSpan={7}>Sin órdenes para el período/estado seleccionado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded p-4 shadow">
          <h2 className="text-lg font-semibold mb-3 text-indigo-800">Alertas de Vencimientos</h2>
          <ul className="text-sm">
            {vencimientos.map(v=> (
              <li key={v.ocId} className={v.dias>=35?'text-red-700':'text-orange-700'}>OC {String(v.ocId).padStart(4,'0')} vencida hace {v.dias} días</li>
            ))}
            {vencimientos.length===0 && <li className="text-gray-500">Sin alertas</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
