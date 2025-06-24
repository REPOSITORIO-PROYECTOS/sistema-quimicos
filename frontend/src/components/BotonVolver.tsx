// src/components/BotonVolver.tsx
"use client"; // Importante: Este componente usa hooks, por lo que es un Client Component

import { useRouter } from 'next/navigation'; // O 'next/router' si usas Pages Router
import React from 'react';

// Opcional: puedes pasarle props para personalizarlo más, como el texto o estilos
interface BotonVolverProps {
  className?: string;
  texto?: string;
}

const BotonVolver: React.FC<BotonVolverProps> = ({
  className = '',
  texto = 'Volver',
}) => {
  const router = useRouter();

  const handleGoBack = () => {
    router.back(); // Esta es la magia. Navega a la página anterior en el historial.
  };

  return (
    <button
      type="button" // Importante para que no envíe el formulario por defecto
      onClick={handleGoBack}
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