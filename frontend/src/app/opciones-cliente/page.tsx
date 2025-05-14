"use client";

import { useRouter } from 'next/navigation';

export default function OpcionesCliente() {

    const router = useRouter();
    
    const handleRegistro = () => {
        router.push('/registrar-cliente');
      };

    const handleVerClientes = () => {
      router.push('/ver-clientes');
    };



    return (
      <main className="min-h-screen flex flex-col items-center bg-[#312b81] text-white pt-24">
        <h1 className="text-4xl font-bold mb-10">Acciones Posibles Clientes</h1>
        
        <div className="space-y-4 w-full max-w-md">
          <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white text-[#312b81] font-bold rounded-lg shadow hover:bg-gray-100 transition"
            onClick={handleRegistro}
          >
            <span>🧾</span>
            Registrar Cliente
          </button>
          <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white text-[#312b81] font-bold rounded-lg shadow hover:bg-gray-100 transition"
            onClick={handleVerClientes}
          >
            <span>📋</span>
            Ver Clientes
          </button>
        </div>
      </main>
    );
  }
  