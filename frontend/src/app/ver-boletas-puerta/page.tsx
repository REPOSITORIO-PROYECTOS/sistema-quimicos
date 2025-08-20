"use client";

import BotonVolver from '@/components/BotonVolver';
import FormularioActualizarPedidoPuerta from '@/components/formularioActualizarPedidoPuerta';
import React, { useState, useEffect, useCallback } from 'react';

// --- TIPOS ---
type BoletaFromAPI = {
  venta_id: number;
  monto_final_con_recargos: number | null | undefined; 
  fecha_pedido: string;
  cliente_nombre: string;
  direccion_entrega: string | null;
  forma_pago: string | null;
  requiere_factura: boolean;
};
type Boleta = BoletaFromAPI;

type PaginationInfo = {
    total_items: number;
    total_pages: number;
    current_page: number;
    per_page: number;
    has_next: boolean;
    has_prev: boolean;
};

// --- COMPONENTE ---
export default function ListaBoletasPuerta() {
  const [boletas, setBoletas] = useState<Boleta[]>([]);
  const [idBoleta, setIdBoleta] = useState<number | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [paginationInfo, setPaginationInfo] = useState<PaginationInfo | null>(null);

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

  const fetchBoletas = useCallback(async (pageToFetch: number) => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Usuario no autenticado.");
      
      const response = await fetch(`https://quimex.sistemataup.online/ventas/sin_entrega?page=${pageToFetch}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Error al traer las boletas.`);
      }

      const data: { ventas: BoletaFromAPI[], pagination: PaginationInfo } = await response.json();
      
      // --- INICIO DE LA CORRECCIÓN EN EL FRONTEND ---
      // Antes de guardar las boletas en el estado, ajustamos la zona horaria de la fecha.
      const boletasCorregidas = (data.ventas || []).map(boleta => {
        // Creamos un objeto Date a partir de la fecha que viene de la API (que es UTC)
        const fechaUTC = new Date(boleta.fecha_pedido);

        // Le restamos 3 horas para ajustarla a la zona horaria de Argentina (UTC-3)
        fechaUTC.setHours(fechaUTC.getHours() - 3);

        // Devolvemos el objeto boleta con la fecha ya corregida en formato ISO
        return {
          ...boleta,
          fecha_pedido: fechaUTC.toISOString()
        };
      });
      // --- FIN DE LA CORRECCIÓN ---

      // Guardamos en el estado la lista de boletas con las fechas ya ajustadas
      setBoletas(boletasCorregidas);
      setPaginationInfo(data.pagination || null);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBoletas(currentPage);
  }, [currentPage, fetchBoletas]);
  

  const handleEliminarPedido = async (ventaId: number) => {
    if (deletingId) return;
    if (!window.confirm(`¿Está seguro de eliminar el pedido Nº ${String(ventaId).padStart(4, '0')}?`)) return;

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
        throw new Error(errorData.error || `Error al eliminar.`);
      }
      const result = await response.json();
      setDeleteSuccess(result.message || `Pedido Nº ${ventaId} eliminado.`);
      
      if (boletas.length === 1 && currentPage > 1) {
          setCurrentPage(prev => Math.max(prev - 1, 1));
      } else {
          fetchBoletas(currentPage);
      }
      
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Error al eliminar.");
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
            <h2 className="text-3xl font-semibold mb-4 text-center text-indigo-800">
              Lista de Pedidos (Retiro en Puerta)
            </h2>

            {loading && <p className="text-center text-gray-600 py-4">Cargando pedidos...</p>}
            {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert"><p>{error}</p></div>}
            {deleteError && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert"><p>Error al eliminar: {deleteError}</p></div>}
            {deleteSuccess && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4" role="alert"><p>{deleteSuccess}</p></div>}

            {!loading && !error && (
              <>
                <div className="overflow-x-auto">
                  <ul className="space-y-3 min-w-[700px]"> 
                    <li className="grid grid-cols-5 gap-x-4 items-center bg-indigo-100 p-3 rounded-md font-semibold text-indigo-700 text-xs uppercase tracking-wider">
                      <span className="text-center">Nº Boleta</span>
                      <span className="text-center">Cliente</span>
                      <span className="text-center">Condición Venta</span>
                      <span className="text-center">Monto</span> 
                      <span className="text-center">Acciones</span>
                    </li>
     
                    {boletas.length > 0 ? boletas.map((boleta) => (
                      <li key={boleta.venta_id} className="grid grid-cols-5 gap-x-4 items-center bg-gray-50 hover:bg-gray-100 p-3 rounded-md text-sm transition-colors">
                        <span className="text-center font-mono">{`Nº ${String(boleta.venta_id).padStart(4, '0')}`}</span>
                        <span className="text-center truncate" title={boleta.cliente_nombre}>{"Cliente Puerta"}</span>

                        {/* --- CORRECCIÓN: Se reemplaza <td> por <span> --- */}
                        <span className="text-center">
                          <div className="flex justify-center items-center flex-wrap gap-2">
                            {boleta.forma_pago?.toLowerCase() === 'transferencia' ? (
                              <span className="px-2 py-1 text-xs font-semibold text-blue-800 bg-blue-100 rounded-full">
                                Transferencia
                              </span>
                            ) : (
                              <span className="px-2 py-1 text-xs font-semibold text-green-800 bg-green-100 rounded-full">
                                Efectivo
                              </span>
                            )}
                            {boleta.requiere_factura && (
                              <span className="px-2 py-1 text-xs font-semibold text-yellow-800 bg-yellow-100 rounded-full">
                                Factura
                              </span>
                            )}
                          </div>
                        </span>

                        <span className="text-center font-medium font-mono">
                          {typeof boleta.monto_final_con_recargos === 'number'
                            ? `$${boleta.monto_final_con_recargos.toFixed(2)}`
                            : '$0.00'
                          }
                        </span>
                        <div className="flex items-center justify-center gap-3">
                          <button
                            title="Editar Pedido"
                            className="text-indigo-600 hover:text-indigo-800 text-xl transition-colors disabled:opacity-50"
                            onClick={() => setIdBoleta(boleta.venta_id)}
                            disabled={!!deletingId}
                          >⚙️</button>
                          <button
                            title="Eliminar Pedido"
                            className={`text-red-500 hover:text-red-700 text-xl transition-colors ${deletingId === boleta.venta_id ? 'opacity-50 cursor-wait' : ''}`}
                            onClick={() => handleEliminarPedido(boleta.venta_id)}
                            disabled={!!deletingId}
                          >🗑️</button>
                        </div>
                      </li>
                    )) : (
                         <li className="text-center py-8 text-gray-500 col-span-5">
                            No hay pedidos para retiro en puerta.
                        </li>
                    )}
                  </ul>
                </div>
                
                {paginationInfo && paginationInfo.total_pages > 1 && (
                  <div className="flex flex-col sm:flex-row justify-center items-center mt-8 gap-3">
                    <button onClick={() => setCurrentPage(p => p - 1)} disabled={!paginationInfo.has_prev || loading}
                      className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60">
                      Anterior
                    </button>
                    <span className="text-indigo-700 font-medium text-sm">
                      Página {paginationInfo.current_page} de {paginationInfo.total_pages}
                    </span>
                    <button onClick={() => setCurrentPage(p => p + 1)} disabled={!paginationInfo.has_next || loading}
                      className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60">
                      Siguiente
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : <FormularioActualizarPedidoPuerta id={idBoleta} onVolver={() => { setIdBoleta(undefined); fetchBoletas(currentPage); }} />}
    </>
  );
}