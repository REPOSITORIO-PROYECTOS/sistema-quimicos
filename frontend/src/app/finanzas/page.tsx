"use client";
import { useEffect, useState } from 'react';

type ResumenProveedor = { proveedor_id: number; proveedor_nombre: string; deuda: number; estado: 'VERDE'|'ROJO' };
type Movimiento = { id:number; proveedor_id:number; orden_id:number|null; tipo:'DEBITO'|'CREDITO'; monto:number; fecha:string; descripcion?:string; usuario?:string };

const API_BASE = 'https://quimex.sistemataup.online';

export default function FinanzasDashboard() {
  const [estadoGeneral, setEstadoGeneral] = useState<string>('');
  const [deudaTotal, setDeudaTotal] = useState<number>(0);
  const [pagosTotal, setPagosTotal] = useState<number>(0);
  const [pendientes, setPendientes] = useState<ResumenProveedor[]>([]);
  const [resumen, setResumen] = useState<ResumenProveedor[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [tipoFiltro, setTipoFiltro] = useState<string>('');
  const [desde, setDesde] = useState<string>('');
  const [hasta, setHasta] = useState<string>('');
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const fetchDashboard = async () => {
    if (!token) return;
    const res = await fetch(`${API_BASE}/finanzas/dashboard`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setEstadoGeneral(data.estado_general);
    setDeudaTotal(data.deuda_total || 0);
    setPagosTotal(data.pagos_total || 0);
    setPendientes(data.pendientes_destacados || []);
    setResumen(data.resumen_proveedores || []);
  };
  const fetchMovimientos = async () => {
    if (!token) return;
    const params = new URLSearchParams();
    if (tipoFiltro) params.set('tipo', tipoFiltro);
    if (desde) params.set('fecha_desde', desde);
    if (hasta) params.set('fecha_hasta', hasta);
    const res = await fetch(`${API_BASE}/finanzas/movimientos?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setMovimientos(data.movimientos || []);
  };

  useEffect(() => { fetchDashboard(); }, [token]);
  useEffect(() => { fetchMovimientos(); }, [token, tipoFiltro, desde, hasta]);

  return (
    <div className="min-h-screen bg-indigo-900 px-4 py-8">
      <div className="max-w-6xl mx-auto bg-white p-6 rounded-lg shadow">
        <h1 className="text-2xl font-bold text-indigo-700 mb-4">Dashboard Financiero</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 rounded bg-green-100">
            <div className="text-sm text-gray-600">Pagos Totales</div>
            <div className="text-2xl font-bold text-green-700">${pagosTotal.toFixed(2)}</div>
          </div>
          <div className="p-4 rounded bg-red-100">
            <div className="text-sm text-gray-600">Deuda Total</div>
            <div className="text-2xl font-bold text-red-700">${deudaTotal.toFixed(2)}</div>
          </div>
          <div className={`p-4 rounded ${estadoGeneral === 'OK' ? 'bg-green-200' : 'bg-orange-200'}`}>
            <div className="text-sm text-gray-600">Estado General</div>
            <div className="text-2xl font-bold text-indigo-800">{estadoGeneral === 'OK' ? 'Sin Deudas' : 'Deudas Pendientes'}</div>
          </div>
        </div>

        <h2 className="text-xl font-semibold text-indigo-700 mb-2">Pendientes de Pago (Top)</h2>
        <div className="overflow-x-auto mb-6">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-3 py-2 text-left">Proveedor</th>
                <th className="px-3 py-2 text-left">Deuda</th>
                <th className="px-3 py-2 text-left">Estado</th>
              </tr>
            </thead>
            <tbody>
              {pendientes.map(p => (
                <tr key={p.proveedor_id} className="border-b">
                  <td className="px-3 py-2">{p.proveedor_nombre}</td>
                  <td className="px-3 py-2">${p.deuda.toFixed(2)}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${p.estado === 'ROJO' ? 'bg-red-200 text-red-700' : 'bg-green-200 text-green-700'}`}>{p.estado}</span>
                  </td>
                </tr>
              ))}
              {pendientes.length === 0 && (
                <tr><td className="px-3 py-2" colSpan={3}>Sin pendientes</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <h2 className="text-xl font-semibold text-indigo-700 mb-2">Movimientos</h2>
        <div className="flex gap-3 mb-3">
          <select value={tipoFiltro} onChange={e=> setTipoFiltro(e.target.value)} className="px-3 py-2 border rounded">
            <option value="">Todos</option>
            <option value="DEBITO">DEBITO</option>
            <option value="CREDITO">CREDITO</option>
          </select>
          <input type="date" value={desde} onChange={e=> setDesde(e.target.value)} className="px-3 py-2 border rounded"/>
          <input type="date" value={hasta} onChange={e=> setHasta(e.target.value)} className="px-3 py-2 border rounded"/>
          <button onClick={()=> fetchMovimientos()} className="px-3 py-2 bg-indigo-600 text-white rounded">Filtrar</button>
          <button onClick={()=> {
            const blob = new Blob([JSON.stringify(movimientos, null, 2)], {type: 'application/json'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'movimientos.json'; a.click(); URL.revokeObjectURL(url);
          }} className="px-3 py-2 bg-gray-200 rounded">Exportar</button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Proveedor</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Monto</th>
                <th className="px-3 py-2 text-left">Descripción</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map(m => {
                const prov = resumen.find(r=> r.proveedor_id === m.proveedor_id);
                return (
                  <tr key={m.id} className="border-b">
                    <td className="px-3 py-2">{new Date(m.fecha).toLocaleString('es-AR')}</td>
                    <td className="px-3 py-2">{prov?.proveedor_nombre || m.proveedor_id}</td>
                    <td className="px-3 py-2">{m.tipo}</td>
                    <td className="px-3 py-2">${m.monto.toFixed(2)}</td>
                    <td className="px-3 py-2">{m.descripcion || ''}</td>
                  </tr>
                );
              })}
              {movimientos.length === 0 && (
                <tr><td className="px-3 py-2" colSpan={5}>Sin movimientos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

