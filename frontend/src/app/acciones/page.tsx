"use client";

import { useRouter } from 'next/navigation';

export default function AccionesPage() {
  const router = useRouter();

  const handleRegistrarPedido = () => {
    router.push('/registrar-pedido');
  };

  const handleVerBoleta = () => {
    router.push('/ver-boleta');
  };

  const handleClientes = () => {
    router.push('/opciones-cliente');
  };

  const handleVerPedidos = () => {
    router.push('/opcion-pedidos');
  };

  return (
    <div className="min-h-screen flex items-start justify-center pt-20 bg-indigo-900">
      <div className="text-center">
        <h2 className="text-white text-5xl font-semibold mb-12 mt-0">
          Acciones Pedidos
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
            📦 Pedidos
          </button>
          <button
            className="bg-white text-indigo-800 font-medium py-3 px-6 rounded-lg shadow hover:bg-indigo-100 transition-all flex items-center justify-center gap-2"
            onClick={handleVerPedidos}
         >
            🧾 Ver Boletas
          </button>
          <button
            className="bg-white text-indigo-800 font-medium py-3 px-6 rounded-lg shadow hover:bg-indigo-100 transition-all flex items-center justify-center gap-2"
            onClick={handleClientes}
          >
            👤 Clientes
          </button>
        </div>
      </div>
    </div>
  );
}