"use client";

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
  const [loading, setLoading] = useState(true); // Para la carga inicial de la lista
  const [idBoleta, setIdBoleta] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null); // Error general de carga
  const [page, setPage] = useState(1);

  // Estados para la operación de eliminación
  const [deletingId, setDeletingId] = useState<number | null>(null); // ID de la boleta que se está eliminando
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

  // Función para recargar las boletas (puede ser útil después de eliminar)
  const fetchBoletas = async (currentPage = page) => {
    try {
      setLoading(true);
      setError(null);
      setDeleteError(null); // Limpiar errores de eliminación anteriores
      setDeleteSuccess(null); // Limpiar mensajes de éxito de eliminación anteriores

      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("Usuario no autenticado. Por favor, inicie sesión.");
      }
      // Asegúrate de que tu API soporta paginación si envías `page`
      // Si no, quita `?page=${currentPage}` o ajusta según tu API
      const response = await fetch(`https://quimex.sistemataup.online/ventas/obtener_todas?page=${currentPage}&per_page=20`, { // Asumiendo 20 por página
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Error ${response.status}: ${response.statusText}` }));
        throw new Error(errorData.message || `Error al traer boletas: ${response.statusText}`);
      }
      const data = await response.json();
      
      // Tu lógica de filtrado y mapeo (considera si esto debe hacerse en el backend)
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
          : "";
        // ¡Importante! La paginación debe venir del backend ya calculada correctamente
        // Modificarla en el frontend después de filtrar puede llevar a inconsistencias
        // si el backend no conoce tus filtros.
        // Si tu API devuelve `data.pagination` correctamente, úsalo directamente.
        // La siguiente lógica de paginación basada en filtrados puede ser incorrecta
        // si el backend ya paginó los datos sin filtrar.
        // data.pagination.total_items = filtrados.length;
        // const cantPaginas = Math.ceil(filtrados.length / 20); // Asumiendo 20 per_page
        // data.pagination.total_pages = cantPaginas; 
        return { ...item, fecha_pedido: fechaFormateada };
      });

      setBoletas(filtrados);
      // Usar la paginación que devuelve la API si es correcta para la vista actual.
      // Si filtras mucho en el cliente, esta paginación puede no reflejar la vista filtrada.
      setPagination(data.pagination || null); 
      //eslint-disable-next-line
    } catch (err: any) {
      setError(err.message || 'Error desconocido al cargar boletas.');
      console.error("FetchBoletas Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBoletas(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]); // Se ejecuta cuando cambia la página

  const handleEliminarPedido = async (ventaId: number) => {
    if (deletingId) return; // Evitar múltiples clics

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
      
      // Actualizar la lista de boletas en el cliente para reflejar la eliminación
      // Opcional: podrías llamar a fetchBoletas() para recargar desde el servidor,
      // pero eliminar del estado local es más rápido para la UI.
      setBoletas(prevBoletas => prevBoletas.filter(b => b.venta_id !== ventaId));
      
      // Si la página actual queda vacía después de eliminar y no es la primera página,
      // considera ir a la página anterior o recargar la página actual.
      if (boletas.filter(b => b.venta_id !== ventaId).length === 0 && page > 1 && pagination && pagination.total_pages > 1) {
        setPage(prevPage => Math.max(1, prevPage -1)); // Ir a la página anterior
      } else if (boletas.filter(b => b.venta_id !== ventaId).length === 0 && page === 1 && pagination && pagination.total_pages > 1) {
        fetchBoletas(1); // Recargar primera página si era la única
      }

      //eslint-disable-next-line
    } catch (err: any) {
      console.error("Error al eliminar pedido:", err);
      setDeleteError(err.message || "Ocurrió un error al intentar eliminar el pedido.");
    } finally {
      setDeletingId(null);
      // Limpiar mensajes después de un tiempo
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
            <h2 className="text-3xl font-semibold mb-8 text-center text-indigo-800">
              Lista de Pedidos (Entrega a Domicilio)
            </h2>

            {/* ... (loading, error, deleteError, deleteSuccess messages) ... */}
            {loading && <p className="text-center text-gray-600 py-4">Cargando pedidos...</p>}
            {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert"><p>{error}</p></div>}
            {deleteError && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert"><p>Error al eliminar: {deleteError}</p></div>}
            {deleteSuccess && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4" role="alert"><p>{deleteSuccess}</p></div>}

            {!loading && !error && (
              <>
                <div className="overflow-x-auto">
                  <ul className="space-y-3 min-w-[900px]"> {/* Puedes ajustar min-w si es necesario con grid-cols-6 */}
                    {/* Encabezado (6 columnas equitativas + Acción) */}
                    {/* Para 6 columnas de datos + 1 de acción, serían 7 columnas en total */}
                    <li className="grid grid-cols-6 gap-x-4 items-center bg-indigo-100 p-3 rounded-md font-semibold text-indigo-700 text-xs uppercase tracking-wider">
                      <span className="text-center" >Nº Boleta</span>
                      <span className="text-center">Monto</span>
                      <span className="text-center">Fecha Pedido</span>
                      <span className="text-center">Dirección</span>
                      <span className="text-center">Cliente</span>
                      <span className="text-center">Acción</span> {/* Esta es la 6ta columna de encabezado visible */}
                      {/* La séptima columna del grid es implícita para el div de botones de acción */}
                    </li>

                    {/* Fila de cada boleta (6 columnas de datos equitativas + Acción) */}
                    {boletas.length > 0 ? boletas.map((boleta) => (
                      // Usaremos grid-cols-7 para que la columna de botones también tenga su espacio.
                      // Las primeras 5 columnas de datos se distribuirán.
                      // La columna de Dirección y Cliente pueden tomar más espacio si se usa 1fr,
                      // pero si queremos todas equitativas, será grid-cols-6 para los datos,
                      // y la columna de acción necesita su propio espacio.
                      // Para que las 5 columnas de datos sean equitativas y la de acción tenga su propio espacio,
                      // es mejor definir los anchos explícitamente o usar un número de columnas que lo permita.
                      // Si quieres que LAS PRIMERAS 5 COLUMNAS DE DATOS sean equitativas y la de ACCIÓN sea separada:
                      // Podrías usar grid-cols-[repeat(5,minmax(0,1fr))_auto] o similar.
                      // Pero si el objetivo es que "Nº Boleta", "Monto", "Fecha", "Dirección", "Cliente" Y "Acción"
                      // (considerando "Acción" como una columna de contenido) sean todas de ancho similar,
                      // entonces necesitas 6 columnas en total para el contenido visible.

                      // Ajustado a 6 columnas para el contenido visible, donde los botones están en la 6ta.
                      <li key={boleta.venta_id} className="grid grid-cols-6 gap-x-4 items-center bg-gray-50 hover:bg-gray-100 p-3 rounded-md text-sm transition-colors">
                        <span className="text-center">{`Nº ${boleta.venta_id.toString().padStart(4, '0')}`}</span>
                        <span className="text-center font-medium">${boleta.monto_final_con_recargos.toFixed(2)}</span>
                        <span className="text-center">{boleta.fecha_pedido}</span>
                        <span className="text-center truncate" title={boleta.direccion_entrega}>{boleta.direccion_entrega}</span>
                        <span className="text-center truncate" title={boleta.cliente_nombre}>{boleta.cliente_nombre}</span>
                        {/* Columna de Acción */}
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
                        <li className="text-center py-8 text-gray-500 col-span-6"> {/* Ajustado col-span */}
                            No hay pedidos para mostrar con los filtros actuales.
                        </li>
                    )}
                  </ul>
                </div>

                {/* ... (Paginación sin cambios) ... */}
                 {pagination && pagination.total_pages > 1 && (
                  <div className="flex flex-col sm:flex-row justify-center items-center mt-8 gap-3">
                    <button
                      onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                      disabled={page <= 1 || !pagination.has_prev || loading}
                      className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                    >
                      Anterior
                    </button>
                    <span className="text-indigo-700 font-medium text-sm">
                      Página {pagination.current_page} de {pagination.total_pages}
                    </span>
                    <button
                      onClick={() => setPage((prev) => prev + 1)}
                      disabled={page >= pagination.total_pages || !pagination.has_next || loading}
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
