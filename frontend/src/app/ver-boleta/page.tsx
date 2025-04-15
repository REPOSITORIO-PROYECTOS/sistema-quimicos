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

  useEffect(() => {
    const boletasEjemplo: Boleta[] = [
      { id: 1, monto: 100, fecha: '2023-10-26 10:00', usuario: 'Usuario A' },
      { id: 2, monto: 200, fecha: '2023-10-26 11:00', usuario: 'Usuario B' },
      { id: 3, monto: 150, fecha: '2023-10-26 12:00', usuario: 'Usuario C' },
      { id: 4, monto: 120, fecha: '2023-10-26 13:00', usuario: 'Usuario D' },
      { id: 5, monto: 180, fecha: '2023-10-26 14:00', usuario: 'Usuario E' },
    ];
    setBoletas(boletasEjemplo);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-indigo-900">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-2xl">
      <h2 className="text-3xl font-semibold mb-6 text-center text-indigo-800">
      Lista de Boletas
      </h2>
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
      </div>
    </div>
  );
}
