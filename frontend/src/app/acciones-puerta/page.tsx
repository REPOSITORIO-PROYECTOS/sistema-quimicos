"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AccionesPuertaPage() {
  const router = useRouter();

  const handleRegistrarPedido = () => {
    router.push('/registrar-pedido-puerta');
  };

  const handleVerBoleta = () => {
    router.push('/ver-boletas-puerta');
  };

  const [esAdmin, setEsAdmin] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const base64Url = token.split('.')[1] || '';
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(base64));
      const rol = String(payload.rol || payload.role || '').toUpperCase();
      setEsAdmin(rol === 'ADMIN');
    } catch {
      setEsAdmin(false);
    }
  }, []);

  const handleDescargarClientesNuevos = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        alert('No autenticado. Inicie sesión.');
        return;
      }
      const resp = await fetch('https://quimex.sistemataup.online/ventas/clientes_nuevos_puerta_csv', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j?.error || j?.message || `Error HTTP ${resp.status}`);
      }
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const hoy = new Date().toISOString().slice(0,10);
      a.download = `clientes_nuevos_puerta_${hoy}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido al descargar CSV';
      alert(msg);
    }
  };

  return (
    <div className="min-h-screen flex items-start justify-center pt-20 bg-indigo-900">
      <div className="text-center">
        
        <h2 className="text-white text-5xl font-semibold mb-12 mt-0">
          Acciones Ventas en Puerta
        </h2> 

        <div className="flex flex-col gap-y-6">
          <button
            className="bg-white text-indigo-800 font-medium py-3 px-6 rounded-lg shadow hover:bg-indigo-100 transition-all flex items-center justify-center gap-2"
            onClick={handleRegistrarPedido}
          >
            📋 Registrar Pedido
          </button>
          <button
            className="bg-white text-indigo-800 font-medium py-3 px-6 rounded-lg shadow hover:bg-indigo-100 transition-all flex items-center justify-center gap-2"
            onClick={handleVerBoleta}
          >
            🧾 Ver Boletas
          </button>
          {esAdmin && (
            <button
              className="bg-white text-indigo-800 font-medium py-3 px-6 rounded-lg shadow hover:bg-indigo-100 transition-all flex items-center justify-center gap-2"
              onClick={handleDescargarClientesNuevos}
            >
              ⬇️ Descargar clientes nuevos (CSV)
            </button>
          )}

        </div>
      </div>
      
    </div>
    
  );
}