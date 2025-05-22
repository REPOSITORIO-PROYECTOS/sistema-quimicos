import Link from 'next/link';
import FormularioRegistroProveedor from '@/components/FormularioRegistroProveedor'; // Ajusta la ruta si es necesario
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Registrar Nuevo Proveedor',
  description: 'Formulario para registrar un nuevo proveedor en el sistema.',
};

export default function RegistrarProveedorPage() {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-3xl space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Registrar Nuevo Proveedor
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Complete los siguientes campos para añadir un proveedor.
          </p>
        </div>

        <FormularioRegistroProveedor />

        <div className="text-center mt-6">
          <Link href="/proveedores" className="font-medium text-indigo-600 hover:text-indigo-500">
            Volver a la gestión de proveedores
          </Link>
        </div>
      </div>
    </div>
  );
}