'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FaRegFileAlt, FaClipboardList, FaCheckCircle, FaHistory, FaMoneyCheckAlt, FaBolt } from 'react-icons/fa';

// Interfaz para el usuario
interface User {
  id: number;
  usuario?: string;
  user_id?: number;
  name?: string;
  user_name?: string;
  email?: string;
  role: string;
  rol?: string;
}

export default function AccionesPedidos() {
  const router = useRouter();
  const [esAdmin, setEsAdmin] = useState(false);
  const [esAlmacen, setEsAlmacen] = useState(false);
  const [esCompras, setEsCompras] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [tcComprasHoy, setTcComprasHoy] = useState<string>('');
  const [loadingTc, setLoadingTc] = useState(false);
  const [savingTc, setSavingTc] = useState(false);
  const [errorTc, setErrorTc] = useState<string | null>(null);
  const [okTc, setOkTc] = useState<string | null>(null);

  const cargarTcCompras = async () => {
    setLoadingTc(true);
    setErrorTc(null);
    setOkTc(null);
    try {
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://quimex.sistemataup.online/api';

      const res = await fetch(`${API_BASE_URL}/tipos_cambio/obtener/DolarCompras`, { headers });
      let data: { valor?: number; data?: { valor?: number } } = {};

      if (!res.ok) {
        const fallback = await fetch(`${API_BASE_URL}/tipos_cambio/obtener/Oficial`, { headers });
        if (!fallback.ok) {
          throw new Error('No se pudo obtener cotizacion de compras');
        }
        data = await fallback.json();
      } else {
        data = await res.json();
      }

      const valor = Number((data && (data.valor ?? data.data?.valor)) ?? NaN);
      if (!Number.isFinite(valor) || valor <= 0) {
        throw new Error('Cotizacion invalida');
      }
      setTcComprasHoy(valor.toFixed(2));
    } catch (e) {
      console.error('Error cargando cotizacion de compras:', e);
      setErrorTc('No se pudo cargar la cotizacion de compras.');
    } finally {
      setLoadingTc(false);
    }
  };

  const guardarTcCompras = async () => {
    setSavingTc(true);
    setErrorTc(null);
    setOkTc(null);
    try {
      const valor = Number.parseFloat(String(tcComprasHoy).replace(',', '.'));
      if (!Number.isFinite(valor) || valor <= 0) {
        throw new Error('Ingrese una cotizacion valida mayor a 0.');
      }

      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      if (!token) {
        throw new Error('Sesion no valida. Inicie sesion nuevamente.');
      }

      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://quimex.sistemataup.online/api';
      const res = await fetch(`${API_BASE_URL}/tipos_cambio/actualizar/DolarCompras`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ valor }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = String(data?.error || data?.mensaje || `Error ${res.status}`);
        throw new Error(msg);
      }

      setTcComprasHoy(valor.toFixed(2));
      setOkTc('Cotizacion de compras actualizada.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo guardar la cotizacion.';
      setErrorTc(msg);
    } finally {
      setSavingTc(false);
    }
  };

  // Función para obtener y sincronizar el rol del usuario
  const sincronizarUsuario = () => {
    try {
      let userData: User | null = null;

      // Intentar leer de localStorage primero (más fiable)
      const localUserData = localStorage.getItem('user');
      const rolLocal = localStorage.getItem('rol');

      if (localUserData) {
        userData = JSON.parse(localUserData);
      }

      // Si no hay usuario pero hay rol, crear el objeto usuario
      if (!userData && rolLocal) {
        userData = { id: 0, role: rolLocal };
      }

      // Si aún no hay usuario, intentar sessionStorage
      if (!userData) {
        const sessionUserData = sessionStorage.getItem('user');
        if (sessionUserData) {
          userData = JSON.parse(sessionUserData);
        }
      }

      if (userData && (userData.role || userData.rol)) {
        const rol = (userData.role || userData.rol || '').toUpperCase().trim();
        setUser(userData);
        const isAdmin = rol === 'ADMIN';
        const isAlmacen = rol === 'ALMACEN';
        const isCompras = rol === 'COMPRAS';

        setEsAdmin(isAdmin);
        setEsAlmacen(isAlmacen);
        setEsCompras(isCompras);

        console.log(`✅ Rol detectado: ${rol} | Admin: ${isAdmin}`, userData);
      } else {
        console.warn('⚠️ No se encontró rol de usuario', userData);
      }
    } catch (error) {
      console.error('❌ Error al obtener usuario:', error);
    } finally {
      setLoading(false);
    }
  };

  // Sincronizar usuario al cargar el componente
  useEffect(() => {
    sincronizarUsuario();

    // Escuchar cambios en el storage
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'user' || e.key === 'rol') {
        sincronizarUsuario();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  useEffect(() => {
    if (esAdmin) {
      cargarTcCompras();
    }
  }, [esAdmin]);

  const irARegistrarPedido = () => router.push('/registrar-pedido-compra');
  const irAVerPendientesAprobacion = () => router.push('/ver-lista-pedidos?estado=Solicitado');
  const irAVerRecepcionesPendientes = () => router.push('/recepciones-pendientes');
  const irAVerDeudasProveedores = () => router.push('/deuda-proveedores');
  const irAVerHistorialCompras = () => router.push('/historial-compras');
  const irAPedidoRapido = () => router.push('/pedido-rapido');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#2c239d]">
        <p className="text-white text-xl">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#2c239d] px-4">
      <h1 className="text-white text-4xl md:text-5xl font-bold mb-10">
        {esAdmin ? 'Gestión de Compras (Admin)' : 'Acciones Posibles Compras'}
      </h1>

      {/* Debug - Mostrar rol (opcional, eliminar en producción) */}
      <p className="text-white text-sm mb-6 opacity-75">👤 Rol: {user?.role || 'No asignado'}</p>

      {esAdmin && (
        <div className="w-full max-w-md mb-6 rounded-lg border border-white/30 bg-white/10 p-4">
          <p className="text-white text-sm font-semibold mb-2">Cotizacion del dia (Compras)</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={tcComprasHoy}
              onChange={(e) => setTcComprasHoy(e.target.value.replace(',', '.'))}
              placeholder={loadingTc ? 'Cargando...' : 'Ej: 1420.50'}
              className="flex-1 rounded-md border border-white/40 bg-white px-3 py-2 text-[#2c239d] font-semibold"
            />
            <button
              type="button"
              onClick={cargarTcCompras}
              disabled={loadingTc || savingTc}
              className="rounded-md bg-white px-3 py-2 text-[#2c239d] font-bold hover:bg-gray-100 disabled:opacity-60"
            >
              {loadingTc ? 'Actualizando...' : 'Refrescar'}
            </button>
            <button
              type="button"
              onClick={guardarTcCompras}
              disabled={savingTc || loadingTc}
              className="rounded-md bg-emerald-500 px-3 py-2 text-white font-bold hover:bg-emerald-600 disabled:opacity-60"
            >
              {savingTc ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
          {errorTc && <p className="mt-2 text-xs text-red-200">{errorTc}</p>}
          {okTc && <p className="mt-2 text-xs text-green-200">{okTc}</p>}
        </div>
      )}

      <div className="flex flex-col gap-5 w-full max-w-md">
        {/* OPCIÓN PRINCIPAL PARA ADMIN: PEDIDO RÁPIDO */}
        {esAdmin && (
          <>
            <button
              onClick={irAPedidoRapido}
              className="flex items-center justify-center gap-3 px-6 py-4 bg-yellow-400 text-[#2c239d] rounded-lg shadow-lg hover:scale-105 transition font-bold border-2 border-yellow-500 text-lg"
            >
              <FaBolt className="text-2xl" />
              Pedido Rápido (Admin)
            </button>

            {/* SEPARADOR VISUAL */}
            <div className="flex items-center gap-3 my-2">
              <div className="flex-1 border-t border-white"></div>
              <span className="text-white text-sm">Opciones de Gestión</span>
              <div className="flex-1 border-t border-white"></div>
            </div>

            <button
              onClick={irAVerPendientesAprobacion}
              className="flex items-center justify-center gap-3 px-6 py-4 bg-white text-[#2c239d] rounded-lg shadow hover:scale-105 transition font-bold border-2 border-[#2c239d]"
            >
              <FaClipboardList className="text-xl" />
              Pendientes de Aprobación
            </button>
          </>
        )}

        {/* OPCIÓN PARA NO ADMIN: SOLICITAR COMPRA */}
        {!esAdmin && (
          <button
            onClick={irARegistrarPedido}
            className="flex items-center justify-center gap-3 px-6 py-4 bg-white text-[#2c239d] rounded-lg shadow hover:scale-105 transition font-bold border-2 border-[#2c239d]"
          >
            <FaRegFileAlt className="text-xl" />
            Solicitar Compra
          </button>
        )}

        {/* RECEPCIONES PENDIENTES - VISIBLE PARA TODOS */}
        <button
          onClick={irAVerRecepcionesPendientes}
          className="flex items-center justify-center gap-3 px-6 py-4 bg-white text-[#2c239d] rounded-lg shadow hover:scale-105 transition font-bold border-2 border-[#2c239d]"
        >
          <FaCheckCircle className="text-xl" />
          Recepciones Pendientes
        </button>

        {/* OPCIONES FINANCIERAS - NO PARA ALMACEN Y NO PARA COMPRAS */}
        {!esAlmacen && !esCompras && (
          <>
            <button
              onClick={irAVerDeudasProveedores}
              className="flex items-center justify-center gap-3 px-6 py-4 bg-white text-[#2c239d] rounded-lg shadow hover:scale-105 transition font-bold border-2 border-[#2c239d]"
            >
              <FaMoneyCheckAlt className="text-xl" />
              Resumen Deuda Proveedores
            </button>
            <button
              onClick={irAVerHistorialCompras}
              className="flex items-center justify-center gap-3 px-6 py-4 bg-white text-[#2c239d] rounded-lg shadow hover:scale-105 transition font-bold border-2 border-[#2c239d]"
            >
              <FaHistory className="text-xl" />
              Historial Compras
            </button>
          </>
        )}
      </div>
    </div>
  );
}
