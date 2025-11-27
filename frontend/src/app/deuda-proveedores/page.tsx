"use client";

import BotonVolver from '@/components/BotonVolver';
import SolicitudIngresoPage from '@/components/solicitudIngresoPage';
import { useState, useEffect } from 'react';

type OrdenCompra = {
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

export default function OrdenesConDeudaPage() {
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [idOrdenSeleccionada, setIdOrdenSeleccionada] = useState<number | null>(null);

  const fetchOrdenesConDeuda = async (currentPage: number) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Usuario no autenticado.");
      
      const response = await fetch(`https://quimex.sistemataup.online/ordenes_compra/obtener_todas?page=${currentPage}&per_page=20&estado=Con%20Deuda`, {
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
      });
      if (!response.ok) {
        const errData = await response.json().catch(()=>({message:`Error ${response.status}`}));
        throw new Error(errData.message || "Error al traer órdenes.");
      }
      
      const data = await response.json();
      
      const ordenesConDeuda = data.ordenes || [];

      if (ordenesConDeuda.length === 0 && data.pagination?.has_next) {
        await fetchOrdenesConDeuda(currentPage + 1);
      } else {
        // Si encontramos órdenes o es la última página, actualizamos el estado
        setOrdenes(ordenesConDeuda);
        // Actualizamos la paginación para reflejar la página actual que estamos mostrando
        setPagination(data.pagination ? { ...data.pagination, current_page: currentPage } : null);
        setPage(currentPage); // Sincronizamos el estado de la página principal
        setLoading(false);
      }
      // eslint-disable-next-line
    } catch (err: any) {
      setError(err.message || 'Error desconocido.');
      console.error("FetchOrdenesConDeuda Error:", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true); // Iniciar la carga
    setError(null);
    fetchOrdenesConDeuda(page);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]); // Se ejecuta solo cuando el usuario cambia de página manualmente

  if (idOrdenSeleccionada) {
    return <SolicitudIngresoPage id={idOrdenSeleccionada} />;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-indigo-900 py-10 px-4">
      <div className="bg-white p-6 md:p-8 rounded-lg shadow-xl w-full max-w-4xl lg:max-w-5xl">
        <BotonVolver />
        <h2 className="text-2xl md:text-3xl font-semibold mb-8 text-center text-indigo-800">
          Órdenes de Compra con Deuda
        </h2>

        {loading && <p className="text-center text-gray-600 my-4 text-sm">Buscando órdenes con deuda...</p>}
        {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert"><p>{error}</p></div>}

        {!loading && !error && (
          <>
            <div className="overflow-x-auto">
              <ul className="space-y-2 divide-y divide-gray-200 min-w-[600px]">
                <li className="grid grid-cols-[1fr_2fr_2fr_1fr] gap-x-3 items-center bg-gray-100 p-3 rounded-t-md font-semibold text-sm text-gray-700 uppercase tracking-wider">
                  <span>Nº Orden</span>
                  <span>Fecha Creación</span>
                  <span>Estado</span>
                  <span className="text-center">Acción</span>
                </li>

                {ordenes.length > 0 ? ordenes.map((orden) => {
                  let fechaFormateada = 'N/A';
                  try {
                    fechaFormateada = new Date(orden.fecha_creacion).toLocaleDateString("es-AR", {
                      day: "2-digit", month: "2-digit", year: "numeric",
                    });
                  } catch (e) { console.error("Error formateando fecha:", orden.fecha_creacion, e); }

                  return (
                    <li key={orden.id} className="grid grid-cols-[1fr_2fr_2fr_1fr] gap-x-3 items-center bg-white hover:bg-gray-50 p-3 text-sm">
                      <span>{`Nº ${orden.id.toString().padStart(4, '0')}`}</span>
                      <span>{fechaFormateada}</span>
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-orange-100 text-orange-800`}>
                        {orden.estado}
                      </span>
                      <div className="flex items-center justify-center">
                        <button
                          title="Saldar Deuda / Procesar Orden"
                          className="text-blue-600 hover:text-blue-800 p-1 rounded focus:outline-none"
                          onClick={() => setIdOrdenSeleccionada(orden.id)}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                      </div>
                    </li>
                  );
                }) : (
                  <li className="text-center py-8 text-gray-500 col-span-4">
                    No hay órdenes con deuda para mostrar.
                  </li>
                )}
              </ul>
            </div>
                
            {pagination && pagination.total_pages > 1 && (
              <div className="flex justify-center mt-6 gap-4">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1 || loading} className="btn-pag">Anterior</button>
                <span className="text-indigo-700 font-medium text-sm self-center">Página {pagination.current_page} de {pagination.total_pages}</span>
                <button onClick={() => setPage(p => p + 1)} disabled={!pagination.has_next || loading} className="btn-pag">Siguiente</button>
              </div>
            )}
          </>
        )}
      </div>
      <style jsx>{`
        .btn-pag { @apply px-4 py-2 rounded bg-indigo-700 text-white hover:bg-indigo-800 disabled:opacity-50 text-sm transition-colors; }
      `}</style>
    </div>
  );
}
