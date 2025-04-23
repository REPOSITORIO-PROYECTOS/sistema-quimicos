"use client";

import { useState, useEffect } from 'react';
import SolicitudIngresoPage from '@/components/solicitudIngresoPage';

type Boleta = {
  id: number;
  fecha_creacion: string;
  estado: string;
};

type Pagination = {
  total_items: number;
  total_pages: number;
  current_page: number;
  per_page: number;
  has_next: boolean;
  has_prev: boolean;
};

export default function ListaBoletas() {
  const [boletas, setBoletas] = useState<Boleta[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1); // para manejar la paginación
  const [id_boleta, setIdBoleta] = useState<number>(0);

  useEffect(() => {
    const fetchBoletas = async () => {
      try {
        setLoading(true);
        const response = await fetch(`https://sistemataup.online/ordenes_compra/obtener_todas`);
        if (!response.ok) {
          throw new Error(`Error al traer boletas: ${response.statusText}`);
        }

        const data = await response.json();
        console.log(data);
        setBoletas(data.ordenes); // Accede al array de boletas
        setPagination(data.pagination); // Usa el objeto de paginación
        //eslint-disable-next-line
      } catch (err: any) {
        setError(err.message || 'Error desconocido');
      } finally {
        setLoading(false);
      }
    };

    fetchBoletas();
  }, [page]);

  return (
    <>
    {
      id_boleta === 0 ?
        <div className="flex flex-col items-center justify-center min-h-screen bg-indigo-900">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-2xl">
        <h2 className="text-3xl font-semibold mb-6 text-center text-indigo-800">
          Lista de Pedidos
        </h2>

        {loading && <p className="text-center text-gray-600">Cargando boletas...</p>}
        {error && <p className="text-center text-red-600">{error}</p>}

        {!loading && !error && (
          <>
            <ul className="space-y-4">
              <li className="grid grid-cols-5 gap-4 items-center bg-gray-100 p-4 rounded-md">
                <span className="font-semibold">Nº Boleta</span>
                <span className="font-semibold">Fecha y Hora</span>
                <span className="font-semibold">Estado</span>
                <span className="font-semibold text-center">Acción</span>
              </li>

              {boletas.map((boleta) => (
                <li key={boleta.id} className="grid grid-cols-5 gap-4 items-center bg-gray-100 p-4 rounded-md">
                  <span>{`Nº ${boleta.id.toString().padStart(4, '0')}`}</span>
                  <span>{boleta.fecha_creacion}</span>
                  <span>{boleta.estado}</span>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      className="text-indigo-700 hover:text-indigo-900 text-xl"
                      onClick={() => setIdBoleta(boleta.id)} // Pasa el objeto boleta completo
                    >
                      ⚙️
                    </button>
                    <input
                      type="checkbox"
                      className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"
                      onChange={(e) =>
                        console.log(`Boleta ${boleta.id} ${e.target.checked ? 'seleccionada' : 'deseleccionada'}`)
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>

            {/* Navegación de páginas */}
            {pagination && (
              <div className="flex justify-center mt-6 gap-4">
                <button
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                  disabled={!pagination.has_prev}
                  className={`px-4 py-2 rounded bg-indigo-700 text-white hover:bg-indigo-800 disabled:opacity-50`}
                >
                  Anterior
                </button>
                <span className="text-indigo-700 font-medium">
                  Página {pagination.current_page} de {pagination.total_pages}
                </span>
                <button
                  onClick={() => setPage((prev) => prev + 1)}
                  disabled={!pagination.has_next}
                  className={`px-4 py-2 rounded bg-indigo-700 text-white hover:bg-indigo-800 disabled:opacity-50`}
                >
                  Siguiente
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
      :<SolicitudIngresoPage id={id_boleta} /> 
    }
    </>
  );
}