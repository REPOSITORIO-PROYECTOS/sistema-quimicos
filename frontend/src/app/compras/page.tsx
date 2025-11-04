'use client';

import { useRouter } from 'next/navigation';
import { FaRegFileAlt, FaClipboardList, FaCheckCircle, FaHistory, FaMoneyCheckAlt } from 'react-icons/fa';

export default function AccionesPedidos() {
  const router = useRouter();

  // Obtener usuario desde sessionStorage
  let user = null;
  if (typeof window !== 'undefined') {
    const userItem = sessionStorage.getItem('user');
    user = userItem ? JSON.parse(userItem) : null;
  }

  const irARegistrarPedido = () => router.push('/registrar-pedido-compra');
  const irAVerPendientesAprobacion = () => router.push('/ver-lista-pedidos?estado=Solicitado'); // Solo muestra pendientes de aprobar
  const irAVerRecepcionesPendientes = () => router.push('/recepciones-pendientes');
  const irAVerDeudasProveedores = () => router.push('/deuda-proveedores');
  const irAVerHistorialCompras = () => router.push('/historial-compras');

  // Renderizado condicional según rol
  const esAlmacen = user && user.role && user.role.toUpperCase() === 'ALMACEN';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#2c239d] px-4">
      <h1 className="text-white text-4xl md:text-5xl font-bold mb-10">Acciones Posibles Compras</h1>

      <div className="flex flex-col gap-5 w-full max-w-md">
        <button
          onClick={irARegistrarPedido}
          className="flex items-center justify-center gap-3 px-6 py-4 bg-white text-[#2c239d] rounded-lg shadow hover:scale-105 transition font-bold border-2 border-[#2c239d]"
        >
          <FaRegFileAlt className="text-xl" />
          Solicitar Compra
        </button>

        {!esAlmacen && (
          <button
            onClick={irAVerPendientesAprobacion}
            className="flex items-center justify-center gap-3 px-6 py-4 bg-white text-[#2c239d] rounded-lg shadow hover:scale-105 transition font-bold border-2 border-[#2c239d]"
          >
            <FaClipboardList className="text-xl" />
            Pendientes de Aprobación
          </button>
        )}

        <button
          onClick={irAVerRecepcionesPendientes}
          className="flex items-center justify-center gap-3 px-6 py-4 bg-white text-[#2c239d] rounded-lg shadow hover:scale-105 transition font-bold border-2 border-[#2c239d]"
        >
          <FaCheckCircle className="text-xl" />
          Recepciones Pendientes
        </button>

        {!esAlmacen && (
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
