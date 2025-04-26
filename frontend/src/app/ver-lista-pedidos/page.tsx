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
        <div className="flex flex-col items-center justify-center min-h-screen bg-indigo-900 py-10 px-4">
      <div className="bg-white p-6 md:p-8 rounded-lg shadow-md w-full max-w-3xl"> {/* Ajustado max-w */}
        <h2 className="text-2xl md:text-3xl font-semibold mb-6 text-center text-indigo-800">
          Lista de Pedidos
        </h2>

        {loading && <p className="text-center text-gray-600 my-4 text-sm">Cargando boletas...</p>}
        {error && <p className="text-center text-red-600 my-4 text-sm">{error}</p>}

        {!loading && !error && (
          <>
            <ul className="space-y-2 divide-y divide-gray-200">
              {/* Encabezado: grid-cols-10, col-span ajustado, gap reducido */}
              <li className="grid grid-cols-10 gap-2 items-center bg-gray-100 p-3 rounded-t-md font-semibold text-sm text-gray-700"> {/* gap-2 */}
                {/* Col Spans: 2 + 3 + 3 + 2 = 10 */}
                <span className="col-span-2">Nº Boleta</span>
                <span className="col-span-3">Fecha</span> {/* Cambiado texto */}
                <span className="col-span-3">Estado</span>
                <span className="col-span-2 text-center">Acción</span>
              </li>

              {/* Filas de datos: grid-cols-10, col-span ajustado, gap reducido */}
              {boletas.map((boleta) => {
                // --- FORMATEO DE FECHA ---
                let fechaFormateada = 'N/A'; // Valor por defecto
                try {
                  fechaFormateada = new Date(boleta.fecha_creacion).toLocaleDateString("es-AR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  });
                } catch (e) {
                  console.error("Error formateando fecha:", boleta.fecha_creacion, e);
                }
                // --- FIN FORMATEO ---

                return (
                  <li key={boleta.id} className="grid grid-cols-10 gap-2 items-center bg-white hover:bg-gray-50 p-3 text-sm"> {/* gap-2 */}
                    {/* Col Spans: 2 + 3 + 3 + 2 = 10 */}
                    <span className="col-span-2">{`Nº ${boleta.id.toString().padStart(4, '0')}`}</span>
                    {/* Mostrar fecha formateada */}
                    <span className="col-span-3">{fechaFormateada}</span>
                    <span className="col-span-3">{boleta.estado}</span>
                    <div className="col-span-2 flex items-center justify-center gap-2"> {/* Acción ahora tiene col-span-2 */}
                      <button
                        title="Ver/Procesar Pedido"
                        className="text-indigo-600 hover:text-indigo-800 text-lg p-1 rounded focus:outline-none"
                        onClick={() => setIdBoleta(boleta.id)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </button>
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300"
                        onChange={(e) =>
                          console.log(`Boleta ${boleta.id} ${e.target.checked ? 'seleccionada' : 'deseleccionada'}`)
                        }
                      />
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Navegación de páginas (sin cambios) */}
            {pagination && pagination.total_pages > 1 && (
              <div className="flex justify-center mt-6 gap-4">
                <button
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                  disabled={!pagination.has_prev || loading}
                  className={`px-4 py-2 rounded bg-indigo-700 text-white hover:bg-indigo-800 disabled:opacity-50 text-sm`}
                >
                  Anterior
                </button>
                <span className="text-indigo-700 font-medium text-sm self-center">
                  Página {pagination.current_page} de {pagination.total_pages}
                </span>
                <button
                  onClick={() => setPage((prev) => prev + 1)}
                  disabled={!pagination.has_next || loading}
                  className={`px-4 py-2 rounded bg-indigo-700 text-white hover:bg-indigo-800 disabled:opacity-50 text-sm`}
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