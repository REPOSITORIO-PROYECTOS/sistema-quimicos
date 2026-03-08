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
