"use client";

import { useRouter } from 'next/navigation';

export default function AccionesPuertaPage() {
  const router = useRouter();

  const handleRegistrarPedido = () => {
    router.push('/registrar-pedido-puerta');
  };

  const handleVerBoleta = () => {
    router.push('/ver-boletas-puerta');
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

        </div>
      </div>
      
    </div>
    
  );
}