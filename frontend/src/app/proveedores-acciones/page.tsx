import Link from 'next/link';
import type { Metadata } from 'next';

// Opcional: Metadata para la página (título en la pestaña del navegador, SEO)
export const metadata: Metadata = {
  title: 'Proveedores - Gestión',
  description: 'Gestión de proveedores: registrar y ver proveedores.',
};

export default function ProveedoresPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4 sm:p-6">
      <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md text-center">
        <h1 className="text-3xl sm:text-4xl font-bold mb-10 text-indigo-700">
          Proveedores
        </h1>

        <div className="flex flex-col space-y-5">
          {/* Botón para Registrar Proveedor */}
          <Link
            href="/registrar-proveedor" // Ruta a la que navegará
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg shadow-md hover:shadow-lg transition duration-300 ease-in-out transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
          >
            Registrar Proveedor
          </Link>

          {/* Botón para Ver Proveedores */}
          <Link
            href="/proveedores/lista" // Ruta a la que navegará
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg shadow-md hover:shadow-lg transition duration-300 ease-in-out transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
          >
            Ver Proveedores
          </Link>
        </div>
      </div>

      {/* Pie de página o información adicional opcional */}
      <footer className="mt-12 text-center">
        <p className="text-sm text-gray-500">
        </p>
      </footer>
    </div>
  );
}