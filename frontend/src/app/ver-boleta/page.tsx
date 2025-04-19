"use client";

import { useState, useEffect } from 'react';

type Boleta = {
  id: number;
  monto: number;
  fecha: string;
  usuario: string;
};

export default function ListaBoletasPage() {
  const [boletas, setBoletas] = useState<Boleta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBoletas = async () => {
      try {
        const response = await fetch('http://localhost:8000/boletas'); // Cambiá por tu endpoint real
        if (!response.ok) {
          throw new Error(`Error al obtener boletas: ${response.statusText}`);
        }
        const data: Boleta[] = await response.json();
        setBoletas(data);
      } catch (err: any) {
        setError(err.message || 'Error desconocido');
      } finally {
        setLoading(false);
      }
    };

    fetchBoletas();
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-indigo-900">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-2xl">
        <h2 className="text-3xl font-semibold mb-6 text-center text-indigo-800">
          Lista de Boletas
        </h2>

        {loading && <p className="text-center text-gray-600">Cargando boletas...</p>}
        {error && <p className="text-center text-red-600">{error}</p>}

        {!loading && !error && (
          <ul className="space-y-4">
            <li className="grid grid-cols-5 gap-4 items-center bg-gray-100 p-4 rounded-md">
              <span className="font-semibold">Nº Boleta</span>
              <span className="font-semibold">Monto</span>
              <span className="font-semibold">Fecha y Hora</span>
              <span className="font-semibold">Usuario</span>
              <span className="font-semibold text-center">Acción</span>
            </li>

            {boletas.map((boleta) => (
              <li key={boleta.id} className="grid grid-cols-5 gap-4 items-center bg-gray-100 p-4 rounded-md">
                <span>{`Nº ${boleta.id.toString().padStart(4, '0')}`}</span>
                <span>${boleta.monto}</span>
                <span>{boleta.fecha}</span>
                <span>{boleta.usuario}</span>
                <button
                  className="text-indigo-700 hover:text-indigo-900 text-xl"
                  onClick={() => alert(`Acción para boleta ${boleta.id}`)}
                >
                  ⚙️
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
