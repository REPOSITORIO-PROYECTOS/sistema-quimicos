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

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

  // --- FUNCIÓN DE CARGA SIMPLIFICADA ---
  const fetchBoletas = async (pageToFetch: number) => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Usuario no autenticado.");

      const response = await fetch(`https://quimex.sistemataup.online/ventas/con_entrega?page=${pageToFetch}&per_page=20`, {
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Error al traer boletas: ${response.statusText}`);
      }

      const data = await response.json();
      const filtrados = data.ventas.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (item: any) => item.direccion_entrega && item.direccion_entrega.trim() !== ""
      );

      // Si la página que pedimos está vacía (post-filtro) y no es la primera,
      // podría ser que el usuario llegó aquí desde una URL o después de borrar todo.
      // Mostramos el estado vacío para que la lógica de búsqueda se active si el usuario hace clic.
      if (filtrados.length === 0 && pageToFetch > 1 && !data.pagination.has_next) {
         setBoletas([]);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const boletasConFechaFormateada = filtrados.map((item: any) => ({
          ...item,
          fecha_pedido: new Date(item.fecha_pedido).toLocaleDateString("es-AR", {
            day: "2-digit", month: "2-digit", year: "numeric",
          }),
        }));
         setBoletas(boletasConFechaFormateada);
      }
      
      setPagination(data.pagination);
      setPage(pageToFetch);

    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setError((err as any).message || 'Error desconocido al cargar boletas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBoletas(page);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Cargar solo en el montaje inicial

  // --- NUEVAS FUNCIONES DE BÚSQUEDA PARA LOS BOTONES ---
  const buscarSiguientePaginaConContenido = async () => {
    if (!pagination || loading) return;

    setLoading(true);
    setError(null);
    let paginaDeBusqueda = pagination.current_page;

    while (true) {
      paginaDeBusqueda++;
      try {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("Usuario no autenticado.");
        const response = await fetch(`https://quimex.sistemataup.online/ventas/con_entrega?page=${paginaDeBusqueda}&per_page=20`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (!response.ok) throw new Error("Error en la búsqueda");
        
        const data = await response.json();
        const filtrados = data.ventas.filter(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (item: any) => item.direccion_entrega && item.direccion_entrega.trim() !== ""
        );

        if (filtrados.length > 0) {
            // ¡Encontrada! Actualizamos el estado y salimos del bucle.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setBoletas(filtrados.map((item: any) => ({
                ...item,
                fecha_pedido: new Date(item.fecha_pedido).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }),
            })));
            setPagination(data.pagination);
            setPage(paginaDeBusqueda);
            break;
        }

        if (!data.pagination.has_next) {
            // Llegamos al final sin encontrar nada. Salimos del bucle.
            alert("No hay más pedidos con entrega a domicilio.");
            break;
        }
      } catch (err) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setError((err as any).message);
          break;
      }
    }
    setLoading(false);
  };

  const buscarAnteriorPaginaConContenido = async () => {
    if (!pagination || loading) return;
    
    setLoading(true);
    setError(null);
    let paginaDeBusqueda = page;

    while (paginaDeBusqueda > 1) {
        paginaDeBusqueda--;
        // Misma lógica que la búsqueda siguiente, pero hacia atrás
         try {
            const token = localStorage.getItem("token");
            if (!token) throw new Error("Usuario no autenticado.");
            const response = await fetch(`https://quimex.sistemataup.online/ventascon_entrega?page=${paginaDeBusqueda}&per_page=20`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (!response.ok) throw new Error("Error en la búsqueda");
            
            const data = await response.json();
            const filtrados = data.ventas.filter(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (item: any) => item.direccion_entrega && item.direccion_entrega.trim() !== ""
            );

            if (filtrados.length > 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                setBoletas(filtrados.map((item: any) => ({
                    ...item,
                    fecha_pedido: new Date(item.fecha_pedido).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }),
                })));
                setPagination(data.pagination);
                setPage(paginaDeBusqueda);
                setLoading(false);
                return; // Salir de la función
            }
        } catch (err) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setError((err as any).message);
            break;
        }
    }
    // Si el bucle termina, es que no encontró nada, recargamos la página 1
    if(page !== 1) await fetchBoletas(1);
    setLoading(false);
  };

  const handleEliminarPedido = async (ventaId: number) => {
    if (deletingId) return;
    if (!window.confirm(`¿Está seguro de que desea eliminar el pedido Nº ${ventaId.toString().padStart(4, '0')}?`)) return;

    setDeletingId(ventaId);
    try {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("Usuario no autenticado.");
        const response = await fetch(`https://quimex.sistemataup.online/ventas/eliminar/${ventaId}`, {
            method: 'DELETE',
            headers: { "Authorization": `Bearer ${token}` },
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Error al eliminar el pedido.`);
        }
        setDeleteSuccess(`Pedido Nº ${ventaId} eliminado.`);
        
        // Si al borrar el último item la página queda vacía, recargamos la página actual.
        // Si esa página ahora está vacía y no es la primera, la lógica de búsqueda se activará.
        if (boletas.length === 1) {
            await fetchBoletas(page);
        } else {
            setBoletas(boletas.filter(b => b.venta_id !== ventaId));
        }
    } catch (err) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setDeleteError((err as any).message);
    } finally {
        setDeletingId(null);
        setTimeout(() => { setDeleteSuccess(null); setDeleteError(null); }, 4000);
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
                      <span className="text-center">Nº Boleta</span>
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
                            disabled={!!deletingId || loading}
                          >
                            ⚙️
                          </button>
                          <button
                            title="Eliminar Pedido"
                            className={`text-red-500 hover:text-red-700 text-xl transition-colors ${deletingId === boleta.venta_id ? 'opacity-50 cursor-wait' : ''}`}
                            onClick={() => handleEliminarPedido(boleta.venta_id)}
                            disabled={!!deletingId || loading}
                          >
                            🗑️
                          </button>
                        </div>
                      </li>
                    )) : (
                        <li className="text-center py-8 text-gray-500 col-span-6">
                            No se encontraron pedidos con entrega a domicilio.
                        </li>
                    )}
                  </ul>
                </div>

                {pagination && pagination.total_pages > 1 && (
                  <div className="flex flex-col sm:flex-row justify-center items-center mt-8 gap-3">
                    <button
                      onClick={buscarAnteriorPaginaConContenido}
                      disabled={page <= 1 || loading}
                      className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                    >
                      Anterior
                    </button>
                    <span className="text-indigo-700 font-medium text-sm">
                      Página {page} de {pagination.total_pages}
                    </span>
                    <button
                      onClick={buscarSiguientePaginaConContenido}
                      disabled={!pagination.has_next || loading}
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