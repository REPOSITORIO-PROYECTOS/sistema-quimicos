"use client";

import SolicitudIngresoPage from '@/components/solicitudIngresoPage'; // Asumo que es para ver/procesar
import { useState, useEffect } from 'react';

type Boleta = { // Cambiaré el nombre a OrdenCompra para claridad
  id: number;
  fecha_creacion: string;
  estado: string;
  // Podrías añadir más campos si los necesitas o los devuelve la API
  // aprobado_por?: string;
  // fecha_aprobacion?: string;
  // rechazado_por?: string;
  // fecha_rechazo?: string;
  // motivo_rechazo?: string;
};

type Pagination = {
  total_items: number;
  total_pages: number;
  current_page: number;
  per_page: number;
  has_next: boolean;
  has_prev: boolean;
};

export default function ListaOrdenesCompra() { // Renombrado el componente
  const [ordenes, setOrdenes] = useState<Boleta[]>([]); // Cambiado nombre de estado
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [idOrdenSeleccionada, setIdOrdenSeleccionada] = useState<number | null>(null); // Para ver/procesar

  // Estados para acciones de aprobar/rechazar
  const [processingId, setProcessingId] = useState<number | null>(null); // ID de la orden en proceso
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchOrdenes = async (currentPage = page) => {
    setLoading(true); setError(null); setActionError(null); setActionSuccess(null);
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Usuario no autenticado.");
      
      const response = await fetch(`https://quimex.sistemataup.online/ordenes_compra/obtener_todas?page=${currentPage}&per_page=20`, {
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
      });
      if (!response.ok) {
        const errData = await response.json().catch(()=>({message:`Error ${response.status}`}));
        throw new Error(errData.message || "Error al traer órdenes.");
      }
      const data = await response.json();
      setOrdenes(data.ordenes || []);
      setPagination(data.pagination || null);
      //eslint-disable-next-line
    } catch (err: any) {
      setError(err.message || 'Error desconocido.');
      console.error("FetchOrdenes Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrdenes(page);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleAprobarOrden = async (ordenId: number) => {
    if (processingId) return; // Evitar múltiples acciones simultáneas

    const confirmacion = window.confirm(`¿Está seguro de que desea APROBAR la orden de compra Nº ${ordenId.toString().padStart(4, '0')}?`);
    if (!confirmacion) return;

    setProcessingId(ordenId); setActionError(null); setActionSuccess(null);
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Usuario no autenticado.");

      const response = await fetch(`https://quimex.sistemataup.online/ordenes_compra/aprobar/${ordenId}`, {
        method: 'PUT',
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        // El endpoint de aprobar no necesita body según tu API
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || `Error ${response.status} al aprobar la orden.`);
      }
      
      setActionSuccess(result.message || `Orden Nº ${ordenId} aprobada con éxito.`);
      // Actualizar el estado de la orden en la UI
      setOrdenes(prevOrdenes => prevOrdenes.map(o => 
        o.id === ordenId ? { ...o, estado: result.orden?.estado || 'Aprobado' /* , ...result.orden (si quieres más campos) */ } : o
      ));
      //eslint-disable-next-line
    } catch (err: any) {
      setActionError(err.message || "Ocurrió un error al aprobar la orden.");
      console.error("Error aprobando orden:", err);
    } finally {
      setProcessingId(null);
      setTimeout(() => { setActionSuccess(null); setActionError(null); }, 5000);
    }
  };

  const handleRechazarOrden = async (ordenId: number) => {
    if (processingId) return;

    const motivoRechazo = window.prompt(`Por favor, ingrese el motivo para RECHAZAR la orden de compra Nº ${ordenId.toString().padStart(4, '0')}:`);
    if (motivoRechazo === null) return; // Usuario canceló el prompt
    if (!motivoRechazo.trim()) {
      alert("El motivo de rechazo no puede estar vacío.");
      return;
    }

    setProcessingId(ordenId); setActionError(null); setActionSuccess(null);
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Usuario no autenticado.");

      const response = await fetch(`https://quimex.sistemataup.online/ordenes_compra/rechazar/${ordenId}`, {
        method: 'PUT',
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ motivo_rechazo: motivoRechazo }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || `Error ${response.status} al rechazar la orden.`);
      }

      setActionSuccess(result.message || `Orden Nº ${ordenId} rechazada con éxito.`);
      setOrdenes(prevOrdenes => prevOrdenes.map(o => 
        o.id === ordenId ? { ...o, estado: result.orden?.estado || 'Rechazado', motivo_rechazo: motivoRechazo /* , ...result.orden */ } : o
      ));
      //eslint-disable-next-line
    } catch (err: any) {
      setActionError(err.message || "Ocurrió un error al rechazar la orden.");
      console.error("Error rechazando orden:", err);
    } finally {
      setProcessingId(null);
      setTimeout(() => { setActionSuccess(null); setActionError(null); }, 5000);
    }
  };


  if (idOrdenSeleccionada) {
    // Asegúrate de que SolicitudIngresoPage reciba 'id' y no 'id_boleta' si cambiaste el nombre
    return <SolicitudIngresoPage id={idOrdenSeleccionada} />;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-indigo-900 py-10 px-4">
      <div className="bg-white p-6 md:p-8 rounded-lg shadow-xl w-full max-w-4xl lg:max-w-5xl">
        <h2 className="text-2xl md:text-3xl font-semibold mb-8 text-center text-indigo-800">
          Lista de Órdenes de Compra
        </h2>

        {loading && <p className="text-center text-gray-600 my-4 text-sm">Cargando órdenes...</p>}
        {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert"><p>{error}</p></div>}
        {actionError && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert"><p>Error: {actionError}</p></div>}
        {actionSuccess && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4" role="alert"><p>{actionSuccess}</p></div>}

        {!loading && !error && (
          <>
            <div className="overflow-x-auto">
              <ul className="space-y-2 divide-y divide-gray-200 min-w-[600px]">
                <li className="grid grid-cols-[1fr_2fr_2fr_2fr] gap-x-3 items-center bg-gray-100 p-3 rounded-t-md font-semibold text-sm text-gray-700 uppercase tracking-wider">
                  <span>Nº Orden</span>
                  <span>Fecha Creación</span>
                  <span>Estado</span>
                  <span className="text-center">Acciones</span>
                </li>

                {ordenes.length > 0 ? ordenes.map((orden) => {
                  let fechaFormateada = 'N/A';
                  try {
                    fechaFormateada = new Date(orden.fecha_creacion).toLocaleDateString("es-AR", {
                      day: "2-digit", month: "2-digit", year: "numeric",
                      // hour: "2-digit", minute: "2-digit" // Si quieres hora también
                    });
                  } catch (e) { console.error("Error formateando fecha:", orden.fecha_creacion, e); }

                  const isProcessingCurrent = processingId === orden.id;
                  const puedeActuar = orden.estado === 'Solicitado' && !processingId; // Solo actuar si está Solicitado y nada se está procesando

                  return (
                    <li key={orden.id} className="grid grid-cols-[1fr_2fr_2fr_2fr] gap-x-3 items-center bg-white hover:bg-gray-50 p-3 text-sm">
                      <span>{`Nº ${orden.id.toString().padStart(4, '0')}`}</span>
                      <span>{fechaFormateada}</span>
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${orden.estado === 'Aprobado' ? 'bg-green-100 text-green-800' : 
                          orden.estado === 'Rechazado' ? 'bg-red-100 text-red-800' : 
                          orden.estado === 'Solicitado' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>
                        {orden.estado}
                      </span>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          title="Ver/Procesar Orden"
                          className="text-blue-600 hover:text-blue-800 p-1 rounded focus:outline-none disabled:opacity-50"
                          onClick={() => setIdOrdenSeleccionada(orden.id)}
                          disabled={!!processingId}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                        {orden.estado === 'Solicitado' && ( // Solo mostrar si el estado es 'Solicitado'
                          <>
                            <button
                              title="Aprobar Orden"
                              onClick={() => handleAprobarOrden(orden.id)}
                              disabled={!puedeActuar || isProcessingCurrent}
                              className={`p-1 rounded text-green-500 hover:text-green-700 disabled:text-gray-400 disabled:cursor-not-allowed ${isProcessingCurrent ? 'animate-pulse' : ''}`}
                            >
                               <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                            <button
                              title="Rechazar Orden"
                              onClick={() => handleRechazarOrden(orden.id)}
                              disabled={!puedeActuar || isProcessingCurrent}
                              className={`p-1 rounded text-red-500 hover:text-red-700 disabled:text-gray-400 disabled:cursor-not-allowed ${isProcessingCurrent ? 'animate-pulse' : ''}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                }) : (
                  <li className="text-center py-8 text-gray-500 col-span-4"> {/* Ajustar col-span */}
                    No hay órdenes de compra para mostrar.
                  </li>
                )}
              </ul>
            </div>

            {pagination && pagination.total_pages > 1 && (
              <div className="flex justify-center mt-6 gap-4">
                <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={!pagination.has_prev||loading} className="btn-pag">Anterior</button>
                <span className="text-indigo-700 font-medium text-sm self-center">Página {pagination.current_page} de {pagination.total_pages}</span>
                <button onClick={() => setPage(p => p+1)} disabled={!pagination.has_next||loading} className="btn-pag">Siguiente</button>
              </div>
            )}
          </>
        )}
      </div>
      {/* Estilos para botones de paginación (puedes moverlos a tu CSS global) */}
      <style jsx>{`
        .btn-pag { @apply px-4 py-2 rounded bg-indigo-700 text-white hover:bg-indigo-800 disabled:opacity-50 text-sm transition-colors; }
      `}</style>
    </div>
  );
}