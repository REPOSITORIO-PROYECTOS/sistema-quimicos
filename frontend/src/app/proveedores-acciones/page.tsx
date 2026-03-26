import Link from 'next/link';
import type { Metadata } from 'next';

// Opcional: Metadata para la página (título en la pestaña del navegador, SEO)
export const metadata: Metadata = {
  title: 'Proveedores - Gestión',
  description: 'Gestión de proveedores: registrar y ver proveedores.',
};

export default function ProveedoresPage() {
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 rounded-2xl bg-gradient-to-r from-blue-700 to-cyan-600 px-6 py-7 text-white shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-100">Gestión</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Proveedores</h1>
          <p className="mt-2 text-sm text-blue-100 sm:text-base">
            Registra nuevos proveedores o visualiza la lista completa.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            href="/registrar-proveedor"
            className="group rounded-2xl border-2 border-blue-200 bg-white p-6 transition hover:border-blue-400 hover:shadow-md"
          >
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <div className="rounded-xl bg-blue-50 p-3">
                <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Registrar Proveedor</h2>
                <p className="mt-1 text-sm text-slate-600">Crea un nuevo proveedor en el sistema.</p>
              </div>
            </div>
          </Link>

          <Link
            href="/lista-proveedores"
            className="group rounded-2xl border-2 border-blue-200 bg-white p-6 transition hover:border-blue-400 hover:shadow-md"
          >
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <div className="rounded-xl bg-blue-50 p-3">
                <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Ver Proveedores</h2>
                <p className="mt-1 text-sm text-slate-600">Visualiza y gestiona los proveedores.</p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}