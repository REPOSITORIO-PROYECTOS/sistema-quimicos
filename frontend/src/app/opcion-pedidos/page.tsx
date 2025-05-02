"use client"; // Directiva al inicio del archivo

// Imports al inicio
import FormularioActualizarPedido from '@/components/formularioActualizacionPedido';
import { useState, useEffect } from 'react';

// Tipos definidos fuera del componente
type Boleta = {
  venta_id: number;
  monto_final_con_recargos: number;
  fecha_pedido: string;
  nombre_razon_social: string;
  direccion_entrega: string;
};

type Pagination = {
  total_items: number;
  total_pages: number;
  current_page: number;
  per_page: number;
  has_next: boolean;
  has_prev: boolean;
};

// --- ✨ CORRECCIÓN AQUÍ: export default ANTES de function ---
export default function TotalPedidos() {
  // --- Estados (correctamente DENTRO de la función) ---
  const [boletas, setBoletas] = useState<Boleta[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [idBoleta, setIdBoleta] = useState<number|undefined>();
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // --- useEffect (correctamente DENTRO de la función) ---
  useEffect(() => {
    const fetchBoletas = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`https://quimex.sistemataup.online/ventas/obtener_todas`);
        if (!response.ok) {
          throw new Error(`Error al traer boletas: ${response.statusText}`);
        }
        const data = await response.json();
        console.log("Datos recibidos:", data);

        let filtrados = data.ventas.filter(
          (item: { direccion_entrega: string | null }) =>
            item.direccion_entrega && item.direccion_entrega.trim() !== ""
        );

        //eslint-disable-next-line
        filtrados = filtrados.map((item: { fecha_pedido?: string; [key: string]: any }) => {
          const fechaFormateada = item.fecha_pedido
            ? new Date(item.fecha_pedido).toLocaleDateString("es-AR", {
                day: "2-digit", month: "2-digit", year: "numeric",
              })
            : "N/A";

          if (data.pagination) {
              data.pagination.total_items = filtrados.length;
              const perPage = data.pagination.per_page || 20;
              const cantPaginas = Math.ceil(filtrados.length / perPage);
              data.pagination.total_pages = cantPaginas;
              data.pagination.current_page = Math.min(page, cantPaginas || 1);
              data.pagination.has_next = data.pagination.current_page < cantPaginas;
              data.pagination.has_prev = data.pagination.current_page > 1;
          }

          return { ...item, fecha_pedido: fechaFormateada };
        });

        const itemsPerPage = pagination?.per_page || 20;
        const startIndex = (page - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const itemsToShow = filtrados.slice(startIndex, endIndex);

        setBoletas(itemsToShow);
        setPagination(data.pagination);
      } //eslint-disable-next-line  
        catch (err: any) {
        setError(err.message || 'Error desconocido');
        setBoletas([]);
        setPagination(null);
      } finally {
        setLoading(false);
      }
    };

    fetchBoletas();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // --- Renderizado (correctamente DENTRO de la función) ---
  return (
    <>
      {idBoleta === undefined ? (
        <div className="flex flex-col items-center justify-center min-h-screen bg-indigo-900 py-10 px-4">
           {/* 1. Ancho máximo reducido */}
          <div className="bg-white p-6 md:p-8 rounded-lg shadow-md w-full max-w-5xl"> {/* Cambiado a max-w-5xl */}
            <h2 className="text-2xl md:text-3xl font-semibold mb-6 text-center text-indigo-800">
              Lista de Pedidos
            </h2>

            {loading && <p className="text-center text-gray-600 my-4">Cargando pedidos...</p>}
            {error && <p className="text-center text-red-600 my-4">Error: {error}</p>}

            {!loading && !error && (
              <>
                <div className="overflow-x-auto">
                  {/* Mantenemos space-y-3 como en tu código */}
                  <ul className="min-w-full space-y-3">
                    {/* Encabezado: 2. Cambiado a grid-cols-11 */}
                    <li className="grid grid-cols-11 gap-3 items-center bg-indigo-100 p-3 rounded-md font-semibold text-indigo-800 text-xs md:text-sm uppercase sticky top-0 z-10"> {/* grid-cols-11 */}
                      {/* Los col-span ahora suman 11 */}
                      <span className="col-span-3">Nombre / Razón Social</span>
                      <span className="col-span-2 ">Monto</span> {/* Quitado text-right si no lo quieres */}
                      <span className="col-span-3">Dirección</span>
                      <span className="col-span-2">Fecha Pedido</span>
                      <span className="col-span-1 text-center">Acción</span>
                    </li>

                    {/* Fila de cada boleta: 2. Cambiado a grid-cols-11 */}
                    {boletas.length > 0 ? (
                        boletas.map((boleta) => (
                            <li key={boleta.venta_id} className="grid grid-cols-11 gap-3 items-center bg-gray-50 hover:bg-gray-100 p-3 rounded-md transition duration-150 ease-in-out"> {/* grid-cols-11 */}
                            {/* Los col-span ahora suman 11 */}
                            <span className="col-span-3 text-sm truncate" title={boleta.nombre_razon_social}>{boleta.nombre_razon_social}</span>
                            <span className="col-span-2 text-sm ">${boleta.monto_final_con_recargos.toFixed(2)}</span> {/* Quitado text-right */}
                            <span className="col-span-3 text-sm truncate" title={boleta.direccion_entrega}>{boleta.direccion_entrega}</span>
                            <span className="col-span-2 text-sm">{boleta.fecha_pedido}</span>
                            <div className="col-span-1 flex items-center justify-center gap-2">
                                <button
                                title="Actualizar Pedido"
                                className="text-indigo-600 hover:text-indigo-900 text-lg transition duration-150 ease-in-out"
                                onClick={() => setIdBoleta(boleta.venta_id)}
                                >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                </svg>
                                </button>
                            </div>
                            </li>
                        ))
                    ) : (
                        // Mensaje "No encontrado" ajustado a col-span-11
                        <li className="text-center text-gray-500 py-4 col-span-11">No se encontraron pedidos para mostrar.</li>
                    )}
                  </ul>
                </div>

                {/* Paginación (sin cambios respecto a tu código) */}
                {pagination && pagination.total_pages > 1 && (
                  <div className="flex flex-col sm:flex-row justify-center items-center mt-6 gap-3">
                    <button
                      onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                      disabled={!pagination.has_prev || loading}
                      className="px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out"
                    >
                      Anterior
                    </button>
                    <span className="text-sm text-indigo-700 font-medium">
                      Página {pagination.current_page} de {pagination.total_pages}
                    </span>
                    <button
                      onClick={() => setPage((prev) => prev + 1)}
                      disabled={!pagination.has_next || loading}
                      className="px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out"
                    >
                      Siguiente
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <FormularioActualizarPedido id={idBoleta} />
      )}
    </>
  );
}
