"use client";

import BotonVolver from '@/components/BotonVolver';
import SolicitudIngresoPage from '@/components/solicitudIngresoPage';
import { useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';

type OrdenResumen = { id:number; fecha_creacion:string; estado:string; proveedor_id:number; importe_total_estimado?:number; importe_abonado?:number; estado_recepcion?:string };
type ItemDetalle = { id_linea:number; producto_id:number; producto_nombre?:string; cantidad_solicitada:number; cantidad_recibida?:number; precio_unitario_estimado:number; importe_linea_estimado:number };
type ItemAPI = { id_linea:number|string; producto_id:number|string; producto_nombre?:string; cantidad_solicitada?: number|string; cantidad_recibida?: number|string; precio_unitario_estimado?: number|string; importe_linea_estimado?: number|string };
type Movimiento = { id:number; proveedor_id:number; orden_id:number|null; tipo:'DEBITO'|'CREDITO'; monto:number; fecha:string };

const API = 'https://quimex.sistemataup.online/api';

export default function DeudaProveedoresPage() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string|null>(null);
  const [ordenes, setOrdenes] = useState<OrdenResumen[]>([]);
  const [itemsPorOrden, setItemsPorOrden] = useState<Record<number, ItemDetalle[]>>({});
  const [proveedorPorOrden, setProveedorPorOrden] = useState<Record<number, string>>({});
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');
  const [filtroProveedor, setFiltroProveedor] = useState('');
  const [filtroProducto, setFiltroProducto] = useState('');
  const [ordenarPor, setOrdenarPor] = useState<'pendiente'|'orden'>('pendiente');
  const [seleccionOcId, setSeleccionOcId] = useState<number|null>(null);
  const [proveedoresDisponibles, setProveedoresDisponibles] = useState<{id: number, nombre: string}[]>([]);
  const [productosDisponibles, setProductosDisponibles] = useState<{id: number, nombre: string}[]>([]);

  const fetchDeudaOrdenes = async () => {
    if (!token) throw new Error('No autenticado');
    const res = await fetch(`${API}/ordenes_compra/obtener_todas?estado=Con%20Deuda&page=1&per_page=50`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    const lista: OrdenResumen[] = (data.ordenes || []).map((o: OrdenResumen) => ({ id:o.id, fecha_creacion:o.fecha_creacion, estado:o.estado, proveedor_id:o.proveedor_id, importe_total_estimado:o.importe_total_estimado ?? 0, importe_abonado:o.importe_abonado ?? 0 }));
    setOrdenes(lista);
    const detalles: Record<number, ItemDetalle[]> = {};
    const proveedoresSet = new Set<{id: number, nombre: string}>();
    const productosSet = new Set<{id: number, nombre: string}>();
    
    for (const oc of lista) {
      const rd = await fetch(`${API}/ordenes_compra/obtener/${oc.id}`, { headers: { Authorization: `Bearer ${token}` } });
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
      
      // Llenar proveedores disponibles
      if (provNombre) {
        proveedoresSet.add({ id: oc.proveedor_id, nombre: provNombre });
      }
      
      // Llenar productos disponibles si hay items pendientes de recepción
      if (dd.estado_recepcion !== 'COMPLETA') {
        detalles[oc.id].forEach(item => {
          if (item.producto_nombre) {
            productosSet.add({ id: item.producto_id, nombre: item.producto_nombre });
          }
        });
      }
    }
    setItemsPorOrden(detalles);
    setProveedorPorOrden({...proveedorPorOrden});
    setProveedoresDisponibles(Array.from(proveedoresSet).sort((a, b) => a.nombre.localeCompare(b.nombre)));
    setProductosDisponibles(Array.from(productosSet).sort((a, b) => a.nombre.localeCompare(b.nombre)));
  };

  const fetchMovs = async () => {
    if (!token) return;
    const params = new URLSearchParams();
    if (filtroDesde) params.set('fecha_desde', filtroDesde);
    if (filtroHasta) params.set('fecha_hasta', filtroHasta);
    const res = await fetch(`${API}/finanzas/movimientos?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setMovimientos(data.movimientos || []);
  };

  // Simplificado: esta página solo lista boletas con total, abonado, pendiente y último pago

  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setError(null);
        await Promise.all([fetchDeudaOrdenes(), fetchMovs()]);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Error cargando datos';
        setError(msg);
      } finally { setLoading(false); }
    })();
    const interval = setInterval(()=> { fetchDeudaOrdenes(); fetchMovs(); }, 30000);
    return ()=> clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroDesde, filtroHasta]);

  const filasOrdenes = useMemo(() => {
    const rows: { ocId:number; total:number; abonado:number; pendiente:number; ultimoPago?:string; fecha:string; proveedor:string; items: ItemDetalle[] }[] = [];
    for (const oc of ordenes) {
      const items = itemsPorOrden[oc.id] || [];
      const totalOC = Number(oc.importe_total_estimado||0) || items.reduce((acc,it)=> acc + (it.importe_linea_estimado|| (it.cantidad_solicitada*it.precio_unitario_estimado)), 0);
      const abonadoOC = Number(oc.importe_abonado||0);
      const pendienteOC = Math.max(0, totalOC - abonadoOC);
      const movsOC = movimientos.filter(m=> m.tipo==='CREDITO' && m.orden_id===oc.id);
      const ultimoPago = movsOC.length>0 ? new Date(Math.max(...movsOC.map(m=> new Date(m.fecha).getTime()))).toLocaleDateString('es-AR') : undefined;
      const d = new Date(oc.fecha_creacion);
      const okDesde = filtroDesde ? d >= new Date(filtroDesde) : true;
      const okHasta = filtroHasta ? d <= new Date(filtroHasta) : true;
      const proveedor = proveedorPorOrden[oc.id] || String(oc.proveedor_id);
      const okProveedor = filtroProveedor ? proveedor === filtroProveedor : true;
      const okProducto = filtroProducto ? items.some(item => item.producto_nombre === filtroProducto) : true;
      if (!(okDesde && okHasta && okProveedor && okProducto)) continue;
      rows.push({ ocId: oc.id, total: totalOC, abonado: abonadoOC, pendiente: pendienteOC, ultimoPago, fecha: d.toLocaleDateString('es-AR'), proveedor, items });
    }
    if (ordenarPor==='pendiente') rows.sort((a,b)=> b.pendiente - a.pendiente);
    if (ordenarPor==='orden') rows.sort((a,b)=> a.ocId - b.ocId);
    return rows;
  }, [ordenes, itemsPorOrden, movimientos, ordenarPor, filtroDesde, filtroHasta, filtroProveedor, filtroProducto, proveedorPorOrden]);

  const exportCSV = () => {
    const headers = [
      'OC',
      'Fecha',
      'Proveedor',
      'Total',
      'Abonado',
      'Pendiente',
      'Último Pago',
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
            r.ultimoPago || '-',
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
          r.ultimoPago || '-',
          'Sin items',
          '0',
          '0',
          '-',
          'N/A'
        ].join(','));
      }
    });
    
    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob); 
    const a=document.createElement('a'); 
    a.href=url; 
    a.download=`deuda_proveedores_detallado_${new Date().toISOString().slice(0,10)}.csv`; 
    a.click(); 
    URL.revokeObjectURL(url);
  };
  const exportPDF = () => {
    const doc = new jsPDF(); let y=10; doc.setFontSize(14); doc.text('Deuda de Proveedores (Boletas)', 10, y); y+=8; doc.setFontSize(9);
    filasOrdenes.slice(0, 40).forEach(r=> { doc.text(`OC ${String(r.ocId).padStart(4,'0')} | Tot ${r.total.toFixed(2)} | Ab ${r.abonado.toFixed(2)} | Pen ${r.pendiente.toFixed(2)} | Ult ${r.ultimoPago||''} | ${r.fecha}`, 10, y); y+=6; });
    doc.save('deuda_proveedores_boletas.pdf');
  };

  if (seleccionOcId) {
    return <SolicitudIngresoPage id={seleccionOcId} />;
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
            <select value={filtroProveedor} onChange={e=> setFiltroProveedor(e.target.value)} className="ml-2 px-2 py-1 border rounded">
              <option value="">-- Todos --</option>
              {proveedoresDisponibles.map((p, idx)=> <option key={`proveedor-${idx}-${p.nombre}`} value={p.nombre}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-700">Producto</label>
            <select value={filtroProducto} onChange={e=> setFiltroProducto(e.target.value)} className="ml-2 px-2 py-1 border rounded">
              <option value="">-- Todos --</option>
              {productosDisponibles.map((p, idx)=> <option key={`producto-${idx}-${p.nombre}`} value={p.nombre}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-700">Desde</label>
            <input type="date" value={filtroDesde} onChange={e=> setFiltroDesde(e.target.value)} className="ml-2 px-2 py-1 border rounded"/>
          </div>
          <div>
            <label className="text-sm text-gray-700">Hasta</label>
            <input type="date" value={filtroHasta} onChange={e=> setFiltroHasta(e.target.value)} className="ml-2 px-2 py-1 border rounded"/>
          </div>
          <div>
            <label className="text-sm text-gray-700">Ordenar por</label>
            <select value={ordenarPor} onChange={(e)=> setOrdenarPor(e.target.value as 'pendiente'|'orden')} className="ml-2 px-2 py-1 border rounded">
              <option value="pendiente">Pendiente</option>
              <option value="orden">Orden</option>
            </select>
          </div>
          <button onClick={exportCSV} className="px-3 py-2 bg-indigo-600 text-white rounded">Exportar CSV</button>
          <button onClick={exportPDF} className="px-3 py-2 bg-gray-200 rounded">Exportar PDF</button>
        </div>

        {/* Listado de boletas en deuda (simple) */}
        <div className="overflow-x-auto mb-6">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-3 py-2 text-left">Nº Orden</th>
                <th className="px-3 py-2 text-left">Proveedor</th>
                <th className="px-3 py-2 text-right">Monto Total</th>
                <th className="px-3 py-2 text-right">Monto Abonado</th>
                <th className="px-3 py-2 text-right">Monto Pendiente</th>
                <th className="px-3 py-2 text-left">Último Pago</th>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Ítems Solicitados</th>
              </tr>
            </thead>
            <tbody>
              {filasOrdenes.map((r)=> (
                <tr
                  key={r.ocId}
                  className="border-b hover:bg-gray-50 cursor-pointer"
                  onClick={()=> setSeleccionOcId(r.ocId)}
                  tabIndex={0}
                  onKeyDown={(e)=> { if (e.key === 'Enter') setSeleccionOcId(r.ocId); }}
                  aria-label={`Ver detalle de OC ${String(r.ocId).padStart(4,'0')}`}
                >
                  <td className="px-3 py-2">OC {String(r.ocId).padStart(4,'0')}</td>
                  <td className="px-3 py-2">{r.proveedor || '-'}</td>
                  <td className="px-3 py-2 text-right">${r.total.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">${r.abonado.toFixed(2)}</td>
                  <td className={`px-3 py-2 text-right ${r.pendiente>0 ? 'text-red-700' : 'text-green-700'}`}>${r.pendiente.toFixed(2)}</td>
                  <td className="px-3 py-2">{r.ultimoPago || '-'}</td>
                  <td className="px-3 py-2">{r.fecha}</td>
                  <td className="px-3 py-2">
                    {r.items.length>0 ? (
                      <ul className="list-disc ml-4">
                        {r.items.slice(0,3).map(it=> (
                          <li key={`${r.ocId}-${it.id_linea}`}>{it.producto_nombre || `ID ${it.producto_id}`} ({it.cantidad_solicitada})</li>
                        ))}
                        {r.items.length>3 && <li className="text-xs text-gray-500">+{r.items.length-3} más</li>}
                      </ul>
                    ) : (<span className="text-gray-400">Sin ítems</span>)}
                  </td>
                </tr>
              ))}
              {filasOrdenes.length===0 && (
                <tr><td className="px-3 py-2" colSpan={7}>Sin órdenes en deuda para el período seleccionado.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Página simplificada sin dashboards: solo listado de boletas con deuda */}
      </div>
    </div>
  );
}
