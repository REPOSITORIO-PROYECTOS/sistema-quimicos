// src/components/BotonVolver.tsx
"use client"; 

import { useRouter } from 'next/navigation';
import React from 'react';

// CAMBIO: Añadimos la prop opcional 'onClick' a la interfaz
interface BotonVolverProps {
  className?: string;
  texto?: string;
  onClick?: () => void; // Puede recibir una función que no devuelve nada
}

const BotonVolver: React.FC<BotonVolverProps> = ({
  className = '',
  texto = 'Volver',
  onClick, // La recibimos aquí
}) => {
  const router = useRouter();


  const handleGoBack = onClick ? onClick : () => router.back();

  return (
    <button
      type="button"
      onClick={handleGoBack} // Usamos nuestra nueva función handleGoBack
      className={`flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${className}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10 19l-7-7m0 0l7-7m-7 7h18"
        />
      </svg>
      {texto}
    </button>
  );
};

export default BotonVolver;