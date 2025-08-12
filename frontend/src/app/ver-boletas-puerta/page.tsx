"use client";

import BotonVolver from '@/components/BotonVolver';
import FormularioActualizarPedidoPuerta from '@/components/formularioActualizarPedidoPuerta';
import React, { useState, useEffect, useMemo, useCallback } from 'react';

// --- CAMBIO: Tipos más estrictos para los datos ---
// Tipo para los datos tal como vienen de la API
type BoletaFromAPI = {
  venta_id: number;
  monto_final_con_recargos: number | null | undefined; 
  fecha_pedido: string; // La API la envía como string ISO (ej: "2023-10-27T14:30:00")
  cliente_nombre: string;
  direccion_entrega: string | null;
};

// Tipo para los datos como los manejamos en el estado del componente
type Boleta = BoletaFromAPI;

// --- Componente Principal ---
export default function ListaBoletasPuerta() {
  const [todasLasBoletas, setTodasLasBoletas] = useState<Boleta[]>([]); // Almacena TODAS las boletas de puerta
  const [idBoleta, setIdBoleta] = useState<number | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Estados para la paginación (ahora manejada en el frontend)
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  // Estados para la operación de eliminación
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

  // --- Lógica de Paginación y Filtrado en el Frontend ---
  const boletasFiltradas = useMemo(() => 
    todasLasBoletas.filter(boleta => !boleta.direccion_entrega || boleta.direccion_entrega.trim() === ""),
  [todasLasBoletas]);

  const totalPages = Math.ceil(boletasFiltradas.length / ITEMS_PER_PAGE);

  const boletasPaginadas = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return boletasFiltradas.slice(startIndex, endIndex);
  }, [boletasFiltradas, currentPage, ITEMS_PER_PAGE]);

  // --- Función para Cargar los Datos ---
  const fetchBoletas = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDeleteError(null);
    setDeleteSuccess(null);

    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Usuario no autenticado. Por favor, inicie sesión.");

      // CAMBIO CRÍTICO: Se trae el listado completo para paginar y filtrar en el cliente.
      // A futuro, esto debería ser un endpoint específico: /ventas?tipo=puerta
      const response = await fetch(`https://quimex.sistemataup.online/ventas/obtener_todas`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Error ${response.status}` }));
        throw new Error(errorData.message || `Error al traer las boletas.`);
      }

      const data: { ventas: BoletaFromAPI[] } = await response.json();
      
      // Guardamos todas las boletas sin filtrar para tener la fuente de la verdad
      setTodasLasBoletas(data.ventas || []);

    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error desconocido al cargar boletas.');
      }
      console.error("FetchBoletasPuerta Error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBoletas();
  }, [fetchBoletas]);
  
  const handleEliminarPedido = async (ventaId: number) => {
    if (deletingId) return;
    if (!window.confirm(`¿Está seguro de eliminar el pedido Nº ${String(ventaId).padStart(4, '0')}? Esta acción no se puede deshacer.`)) return;

    setDeletingId(ventaId);
    setDeleteError(null);
    setDeleteSuccess(null);

    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Usuario no autenticado.");

      const response = await fetch(`https://quimex.sistemataup.online/ventas/eliminar/${ventaId}`, {
        method: 'DELETE',
        headers: { "Authorization": `Bearer ${token}` },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Error ${response.status}` }));
        throw new Error(errorData.error || `Error al eliminar el pedido.`);
      }

      const result = await response.json();
      setDeleteSuccess(result.message || `Pedido Nº ${ventaId} eliminado con éxito.`);
      
      // Actualizamos el estado local para reflejar la eliminación inmediatamente
      setTodasLasBoletas(prevBoletas => prevBoletas.filter(b => b.venta_id !== ventaId));
      
      // Si la página actual queda vacía, retrocedemos una página
      if (boletasPaginadas.length === 1 && currentPage > 1) {
        setCurrentPage(prevPage => prevPage - 1);
      }
      
    } catch (err) {
      console.error("Error al eliminar pedido (puerta):", err);
      if (err instanceof Error) {
        setDeleteError(err.message);
      } else {
        setDeleteError("Ocurrió un error al intentar eliminar el pedido.");
      }
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
                    {/* CAMBIO: Se añade la columna de Fecha */}
                    <li className="grid grid-cols-5 gap-x-4 items-center bg-indigo-100 p-3 rounded-md font-semibold text-indigo-700 text-xs uppercase tracking-wider">
                      <span className="text-center">Nº Boleta</span>
                      <span className="text-center">Fecha</span>
                      <span className="text-center">Cliente</span>
                      <span className="text-center">Monto</span> 
                      <span className="text-center">Acciones</span>
                    </li>
     
                    {boletasPaginadas.length > 0 ? boletasPaginadas.map((boleta) => (
                      <li key={boleta.venta_id} className="grid grid-cols-5 gap-x-4 items-center bg-gray-50 hover:bg-gray-100 p-3 rounded-md text-sm transition-colors">
                        <span className="text-center font-mono">{`Nº ${String(boleta.venta_id).padStart(4, '0')}`}</span>
                        {/* CAMBIO: El formato de fecha se aplica aquí, en el renderizado */}
                        <span className="text-center font-mono">
                          {new Date(boleta.fecha_pedido).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                        </span>
                        <span className="text-center truncate" title={boleta.cliente_nombre}>{"Cliente Puerta"}</span>
                        <span className="text-center font-medium font-mono">
                          {/* Comprobamos si el monto es un número antes de intentar formatearlo */}
                          {typeof boleta.monto_final_con_recargos === 'number'
                            ? `$${boleta.monto_final_con_recargos.toFixed(2)}`
                            : '$0.00' /* O puedes poner 'N/A', '-', etc. */
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
                
                {totalPages > 1 && (
                  <div className="flex flex-col sm:flex-row justify-center items-center mt-8 gap-3">
                    <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage <= 1 || loading}
                      className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60">
                      Anterior
                    </button>
                    <span className="text-indigo-700 font-medium text-sm">
                      Página {currentPage} de {totalPages}
                    </span>
                    <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage >= totalPages || loading}
                      className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60">
                      Siguiente
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : <FormularioActualizarPedidoPuerta id={idBoleta} onVolver={() => { setIdBoleta(undefined); fetchBoletas(); }} />}
    </>
  );
}