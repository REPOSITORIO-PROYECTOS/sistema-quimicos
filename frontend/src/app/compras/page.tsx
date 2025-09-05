'use client';

import { useRouter } from 'next/navigation';
import { FaRegFileAlt, FaFileInvoice } from 'react-icons/fa';

export default function AccionesPedidos() {
  const router = useRouter();

  const irARegistrarPedido = () => router.push('/registrar-pedido-compra');
  const irAVerListaPedidos = () => router.push('/ver-lista-pedidos');


  const irAVerDeudasProveedores = () => router.push('/deuda-proveedores');


  const irAVerHistorialCompras = () => router.push('/historial-compras');


  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#2c239d] px-4">
      <h1 className="text-white text-4xl md:text-5xl font-bold mb-10">Acciones Posibles Compras</h1>

      <div className="flex flex-col gap-5 w-full max-w-md">
        <button
          onClick={irARegistrarPedido}
          className="flex items-center justify-center gap-3 px-6 py-4 bg-white text-[#2c239d] rounded-lg shadow hover:scale-105 transition"
        >
          <FaRegFileAlt className="text-xl" />
          Soliciar Compra
        </button>

        <button
          onClick={irAVerListaPedidos}
          className="flex items-center justify-center gap-3 px-6 py-4 bg-white text-[#2c239d] rounded-lg shadow hover:scale-105 transition"
        >
          <FaFileInvoice className="text-xl" />
         Recepciones Pendientes
        </button>
        <button
          onClick={irAVerDeudasProveedores}
          className="flex items-center justify-center gap-3 px-6 py-4 bg-white text-[#2c239d] rounded-lg shadow hover:scale-105 transition"
        >
          <FaFileInvoice className="text-xl" />
          Deudas Proveedores
        </button>
         <button
          onClick={irAVerHistorialCompras}
          className="flex items-center justify-center gap-3 px-6 py-4 bg-white text-[#2c239d] rounded-lg shadow hover:scale-105 transition"
        >
          <FaFileInvoice className="text-xl" />
          Historial Compras
        </button>
        
      </div>
      
    </div>
    
  );
}
