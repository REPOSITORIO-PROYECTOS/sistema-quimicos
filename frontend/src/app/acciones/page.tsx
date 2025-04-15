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

  return (
    <div className="min-h-screen flex items-start justify-center pt-20 bg-indigo-900">
      <div className="text-center">
        <h2 className="text-white text-5xl font-semibold mb-12 mt-0">
          Acciones Posibles Pedidos.
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
            🧾 Ver Boleta
          </button>
          <button
            className="bg-white text-indigo-800 font-medium py-3 px-6 rounded-lg shadow hover:bg-indigo-100 transition-all flex items-center justify-center gap-2"
          >
            📦 Pedidos
          </button>
          <button
            className="bg-white text-indigo-800 font-medium py-3 px-6 rounded-lg shadow hover:bg-indigo-100 transition-all flex items-center justify-center gap-2"
          >
            👤 Registrar Cliente
          </button>
        </div>
      </div>
    </div>
  );
}