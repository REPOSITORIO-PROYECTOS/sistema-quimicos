'use client';

import { useRouter } from 'next/navigation';
import { FaRegFileAlt, FaFileInvoice, FaBoxOpen, FaUserPlus } from 'react-icons/fa';

export default function AccionesPedidos() {
  const router = useRouter();

  const irARegistrarPedido = () => router.push('/registrar-pedido-compra');
  const irAVerListaPedidos = () => router.push('/ver-lista-pedidos');
  const irRegistrarIngreso = () => router.push('/registrar-ingreso-compra');


  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#2c239d] px-4">
      <h1 className="text-white text-4xl md:text-5xl font-bold mb-10">Acciones Posibles Pedidos.</h1>

      <div className="flex flex-col gap-5 w-full max-w-md">
        <button
          onClick={irARegistrarPedido}
          className="flex items-center justify-center gap-3 px-6 py-4 bg-white text-[#2c239d] rounded-lg shadow hover:scale-105 transition"
        >
          <FaRegFileAlt className="text-xl" />
          Soliciar Compra
        </button>

        <button
          onClick={irRegistrarIngreso}
          className="flex items-center justify-center gap-3 px-6 py-4 bg-white text-[#2c239d] rounded-lg shadow hover:scale-105 transition"
        >
          <FaBoxOpen className="text-xl" />
          Registrar Ingreso
        </button>

        <button
          onClick={irAVerListaPedidos}
          className="flex items-center justify-center gap-3 px-6 py-4 bg-white text-[#2c239d] rounded-lg shadow hover:scale-105 transition"
        >
          <FaFileInvoice className="text-xl" />
          Lista de Pedidos
        </button>

        <button
          className="flex items-center justify-center gap-3 px-6 py-4 bg-white text-[#2c239d] rounded-lg shadow hover:scale-105 transition"
        >
          <FaUserPlus className="text-xl" />
          Lista de pedidos Auto.
        </button>
      </div>
    </div>
  );
}
