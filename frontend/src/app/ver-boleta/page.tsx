"use client";

import BotonVolver from '@/components/BotonVolver';
import FormularioActualizarPedido from '@/components/formularioActualizacionPedido';
import { useState, useEffect } from 'react';

type Boleta = {
  venta_id: number;
  monto_final_con_recargos: number;
  fecha_pedido: string;
  cliente_nombre: string;
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

export default function ListaBoletas() {
  const [boletas, setBoletas] = useState<Boleta[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [idBoleta, setIdBoleta] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // ... (Estados de eliminación sin cambios) ...
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

  // --- FUNCIÓN MODIFICADA ---
  const fetchBoletas = async (currentPage: number) => {
    // No reseteamos el loading aquí para que el estado de carga persista entre llamadas recursivas
    try {
      setError(null);
      // Limpiamos mensajes de éxito/error de eliminación al iniciar una nueva búsqueda
      if (currentPage === page) {
         setDeleteError(null);
         setDeleteSuccess(null);
      }

      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("Usuario no autenticado. Por favor, inicie sesión.");
      }
      
      const response = await fetch(`https://quimex.sistemataup.online/ventas/obtener_todas?page=${currentPage}&per_page=20`, {
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Error ${response.status}: ${response.statusText}` }));
        throw new Error(errorData.message || `Error al traer boletas: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Mantenemos el filtrado en el cliente
      const filtrados = data.ventas.filter(
        (item: { direccion_entrega: string | null }) =>
          item.direccion_entrega && item.direccion_entrega.trim() !== ""
      );

      // --- LÓGICA CLAVE AÑADIDA ---
      // Si la página actual filtrada está vacía Y hay más páginas por revisar...
      if (filtrados.length === 0 && data.pagination.has_next) {
        // ...entonces llamamos a esta misma función para buscar en la siguiente página.
        console.log(`Página ${currentPage} vacía, buscando en la página ${currentPage + 1}...`);
        await fetchBoletas(currentPage + 1);
      } else {
        // ...de lo contrario (si encontramos boletas o si es la última página)...
        // formateamos las fechas de las boletas encontradas.
        // eslint-disable-next-line
        const boletasConFechaFormateada = filtrados.map((item: any) => {
          const fechaFormateada = item.fecha_pedido
            ? new Date(item.fecha_pedido).toLocaleDateString("es-AR", {
                day: "2-digit", month: "2-digit", year: "numeric",
              })
            : "";
          return { ...item, fecha_pedido: fechaFormateada };
        });

        // Actualizamos el estado con los resultados encontrados
        setBoletas(boletasConFechaFormateada);
        // Actualizamos la paginación, asegurándonos de que la página actual
        // sea la que realmente estamos mostrando.
        setPagination({
          ...data.pagination,
          current_page: currentPage // ¡Importante!
        });
        // Y sincronizamos el estado 'page' por si el usuario navega desde ahí
        setPage(currentPage);
        
        // Finalmente, detenemos el indicador de carga
        setLoading(false);
      }
      // eslint-disable-next-line
    } catch (err: any) {
      setError(err.message || 'Error desconocido al cargar boletas.');
      console.error("FetchBoletas Error:", err);
      setLoading(false); // Detenemos la carga también si hay un error
    }
  };

  useEffect(() => {
    setLoading(true); // Iniciar la carga aquí
    fetchBoletas(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]); // Solo se ejecuta cuando el usuario cambia de página manualmente

  // ... (El resto de tu componente, como handleEliminarPedido y el JSX, se mantiene igual) ...
  const handleEliminarPedido = async (ventaId: number) => {
    if (deletingId) return;

    const confirmacion = window.confirm(`¿Está seguro de que desea eliminar el pedido Nº ${ventaId.toString().padStart(4, '0')}? Esta acción no se puede deshacer.`);
    if (!confirmacion) {
      return;
    }

    setDeletingId(ventaId);
    setDeleteError(null);
    setDeleteSuccess(null);

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("Usuario no autenticado.");
      }

      const response = await fetch(`https://quimex.sistemataup.online/ventas/eliminar/${ventaId}`, {
        method: 'DELETE',
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Error ${response.status} al eliminar.` }));
        throw new Error(errorData.error || `Error al eliminar el pedido: ${response.statusText}`);
      }

      const result = await response.json();
      setDeleteSuccess(result.message || `Pedido Nº ${ventaId} eliminado con éxito.`);
      
      const boletasActualizadas = boletas.filter(b => b.venta_id !== ventaId);
      setBoletas(boletasActualizadas);
      
      if (boletasActualizadas.length === 0 && pagination && pagination.has_next) {
        // Si la página queda vacía, intenta recargar desde la página siguiente
        fetchBoletas(page + 1);
      } else if (boletasActualizadas.length === 0 && page > 1) {
         // Si era la última página, vuelve a la anterior
        setPage(page - 1);
      }
      // eslint-disable-next-line
    } catch (err: any) {
      console.error("Error al eliminar pedido:", err);
      setDeleteError(err.message || "Ocurrió un error al intentar eliminar el pedido.");
    } finally {
      setDeletingId(null);
      setTimeout(() => {
        setDeleteSuccess(null);
        setDeleteError(null);
      }, 5000);
    }
  };


  return (
    <>
      {idBoleta === undefined ? (
        <div className="flex flex-col items-center justify-center min-h-screen bg-indigo-900 py-10">
          <div className="bg-white p-6 md:p-8 rounded-lg shadow-xl w-full max-w-5xl lg:max-w-6xl">
            <BotonVolver className="ml-0" />
            <h2 className="text-3xl font-semibold mb-8 text-center text-indigo-800">
              Lista de Pedidos (Entrega a Domicilio)
            </h2>

            {loading && <p className="text-center text-gray-600 py-4">Cargando pedidos...</p>}
            {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert"><p>{error}</p></div>}
            {deleteError && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert"><p>Error al eliminar: {deleteError}</p></div>}
            {deleteSuccess && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4" role="alert"><p>{deleteSuccess}</p></div>}

            {!loading && !error && (
              <>
                <div className="overflow-x-auto">
                  <ul className="space-y-3 min-w-[900px]">
                    <li className="grid grid-cols-6 gap-x-4 items-center bg-indigo-100 p-3 rounded-md font-semibold text-indigo-700 text-xs uppercase tracking-wider">
                      <span className="text-center" >Nº Boleta</span>
                      <span className="text-center">Monto</span>
                      <span className="text-center">Fecha Pedido</span>
                      <span className="text-center">Dirección</span>
                      <span className="text-center">Cliente</span>
                      <span className="text-center">Acción</span>
                    </li>

                    {boletas.length > 0 ? boletas.map((boleta) => (
                      <li key={boleta.venta_id} className="grid grid-cols-6 gap-x-4 items-center bg-gray-50 hover:bg-gray-100 p-3 rounded-md text-sm transition-colors">
                        <span className="text-center">{`Nº ${boleta.venta_id.toString().padStart(4, '0')}`}</span>
                        <span className="text-center font-medium">${boleta.monto_final_con_recargos.toFixed(2)}</span>
                        <span className="text-center">{boleta.fecha_pedido}</span>
                        <span className="text-center truncate" title={boleta.direccion_entrega}>{boleta.direccion_entrega}</span>
                        <span className="text-center truncate" title={boleta.cliente_nombre}>{boleta.cliente_nombre}</span>
                        <div className="flex items-center justify-center gap-3">
                          <button
                            title="Editar Pedido"
                            className="text-indigo-600 hover:text-indigo-800 text-xl transition-colors"
                            onClick={() => setIdBoleta(boleta.venta_id)}
                            disabled={!!deletingId}
                          >
                            ⚙️
                          </button>
                          <button
                            title="Eliminar Pedido"
                            className={`text-red-500 hover:text-red-700 text-xl transition-colors ${deletingId === boleta.venta_id ? 'opacity-50 cursor-wait' : ''}`}
                            onClick={() => handleEliminarPedido(boleta.venta_id)}
                            disabled={!!deletingId}
                          >
                            🗑️
                          </button>
                        </div>
                      </li>
                    )) : (
                        <li className="text-center py-8 text-gray-500 col-span-6">
                            No hay pedidos para mostrar con los filtros actuales.
                        </li>
                    )}
                  </ul>
                </div>

                {pagination && pagination.total_pages > 1 && (
                  <div className="flex flex-col sm:flex-row justify-center items-center mt-8 gap-3">
                    <button
                      onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                      disabled={page <= 1 || loading} // Deshabilitado si es la primera página o si está cargando
                      className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                    >
                      Anterior
                    </button>
                    <span className="text-indigo-700 font-medium text-sm">
                      Página {pagination.current_page} de {pagination.total_pages}
                    </span>
                    <button
                      onClick={() => setPage((prev) => prev + 1)}
                      disabled={page >= pagination.total_pages || loading} // Deshabilitado si es la última o si está cargando
                      className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                    >
                      Siguiente
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : <FormularioActualizarPedido id={idBoleta} />}
    </>
  );
}