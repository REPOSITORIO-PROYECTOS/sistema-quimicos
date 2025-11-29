import Link from 'next/link';
import ContabilidadTable from '@/components/ContabilidadTable';
import { Button } from '@/components/ui/button';

export default function ContabilidadPage() {
  return (
    <div className="min-h-screen bg-indigo-900">
      <nav className="sticky top-0 z-10 bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap gap-2">
          <Button variant="default" className="bg-indigo-600 hover:bg-indigo-700" asChild>
            <Link href="/movimientos">Movimientos</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/libro-mayor">Libro Mayor</Link>
          </Button>
        </div>
      </nav>
      <div className="max-w-7xl mx-auto p-4">
        <ContabilidadTable />
      </div>
    </div>
  );
}
