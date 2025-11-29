import Link from 'next/link';
import ContabilidadTable from '@/components/ContabilidadTable';

export default function ContabilidadPage() {
  return (
    <div className="min-h-screen bg-indigo-900">
      <nav className="sticky top-0 z-10 bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap gap-2">
          <Link href="/libro-mayor" className="px-4 py-2 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-700">Libro Mayor</Link>
          <Link href="/finanzas" className="px-4 py-2 rounded bg-purple-600 text-white font-semibold hover:bg-purple-700">Finanzas</Link>
          <Link href="/deuda-proveedores" className="px-4 py-2 rounded bg-red-600 text-white font-semibold hover:bg-red-700">Deuda Proveedores</Link>
          <Link href="/historial-compras" className="px-4 py-2 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700">Historial Compras</Link>
          <Link href="/recepciones-pendientes" className="px-4 py-2 rounded bg-green-600 text-white font-semibold hover:bg-green-700">Recepciones</Link>
          <Link href="/lista-proveedores" className="px-4 py-2 rounded bg-gray-800 text-white font-semibold hover:bg-gray-900">Proveedores</Link>
        </div>
      </nav>
      <div className="max-w-7xl mx-auto p-4">
        <ContabilidadTable />
      </div>
    </div>
  );
}
