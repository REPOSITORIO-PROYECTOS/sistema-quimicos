"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import BotonVolver from '@/components/BotonVolver';
// import { useRouter } from 'next/navigation';

// --- TIPOS COMPLETOS Y ESTRICTOS ---
type DetalleProducto = {
  producto_id: number;
  producto_nombre: string;
  cantidad: number;
  precio_total_item_ars: number;
};

type BoletaOriginal = {
  venta_id: number;
  estado: string;
  monto_final_con_recargos: number;
  fecha_pedido: string;
  cliente_nombre: string;
  cliente_zona?: string;
  direccion_entrega: string;
  detalles: DetalleProducto[];
  fecha_emision?: string;
  nombre_vendedor?: string;
  cuit_cliente?: string;
  forma_pago: string;
  monto_pagado_cliente?: number;
  vuelto_calculado?: number;
  observaciones?: string;
};

type BoletaParaLista = {
  venta_id: number;
  estado: string;
  monto_final_con_recargos: number;
  fecha_pedido_formateada: string;
  cliente_nombre: string;
  direccion_entrega: string;
  cliente_zona?: string; // Localidad
};

type Pagination = {
  total_items: number;
  total_pages: number;
  current_page: number;
  per_page: number;
  has_next: boolean;
  has_prev: boolean;
};

type VentaData = {
  venta_id: number;
  fecha_emision: string;
  cliente: {
    nombre: string;
    direccion: string;
    localidad?: string;
  };
  nombre_vendedor: string;
  items: DetalleProducto[];
  total_final: number;
  observaciones?: string;
  forma_pago: string;
  monto_pagado_cliente?: number;
  vuelto_calculado?: number;
};

export default function TotalPedidos() {
  // const router = useRouter();
  const [boletas, setBoletas] = useState<BoletaParaLista[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  // Eliminado idBoleta y setIdBoleta porque ya no se usa edición
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selectedBoletas, setSelectedBoletas] = useState<Set<number>>(new Set());
  const [estadoSeleccionado, setEstadoSeleccionado] = useState('Listo para Entregar');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  // Estados para filtro manual
  const [searchCliente, setSearchCliente] = useState("");
  const [filterEstado, setFilterEstado] = useState("");

    // Estado para actualización de precios pendientes
    const [isUpdatingPrices, setIsUpdatingPrices] = useState(false);
    const [updatePricesMsg, setUpdatePricesMsg] = useState<string | null>(null);

  const [fechaSeleccionada, setFechaSeleccionada] = useState<string>(() => {
    // 1. Intentamos leer la fecha guardada desde el localStorage
    if (typeof window !== 'undefined') {
      const fechaGuardada = localStorage.getItem('ultimaFechaPedidos');
      if (fechaGuardada) {
        return fechaGuardada;
      }
    }
    // 2. Si no hay nada guardado, usamos la fecha de hoy como valor por defecto
    const hoy = new Date();
    return hoy.toISOString().split('T')[0];
  });

  const fetchBoletasPorFecha = useCallback(async () => {
    if (!fechaSeleccionada) return;
    setLoading(true);
    setError(null);
    const token = localStorage.getItem("token");
    if (!token) { setError("No autenticado."); setLoading(false); return; }
    try {
      const params = new URLSearchParams({
        page: String(page),
        per_page: '20',
        fecha_desde: fechaSeleccionada,
        fecha_hasta: fechaSeleccionada
      });
      const apiUrl = `https://quimex.sistemataup.online/ventas/con_entrega?${params.toString()}`;
      const response = await fetch(apiUrl, { headers: { "Authorization": `Bearer ${token}` } });
      if (!response.ok) throw new Error(`Error al traer boletas: ${response.statusText}`);
      const data = await response.json();
      const boletasProcesadas = (data.ventas || []).map((item: BoletaOriginal): BoletaParaLista => ({
        venta_id: item.venta_id,
        estado: item.estado || 'Pendiente',
        monto_final_con_recargos: item.monto_final_con_recargos,
        fecha_pedido_formateada: new Date(item.fecha_pedido).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }),
        cliente_nombre: item.cliente_nombre,
        direccion_entrega: item.direccion_entrega,
        cliente_zona: item.cliente_zona || '',
      }));
      setBoletas(boletasProcesadas);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [fechaSeleccionada, page]);

  useEffect(() => {
    fetchBoletasPorFecha();
  }, [fetchBoletasPorFecha]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nuevaFecha = e.target.value;
    if (typeof window !== 'undefined') {
      localStorage.setItem('ultimaFechaPedidos', nuevaFecha);
    }
    
    setFechaSeleccionada(nuevaFecha);
    setPage(1); // Reseteamos la paginación a la primera página
  };

  const handleCheckboxChange = (ventaId: number) => {
    setSelectedBoletas(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(ventaId)) newSelected.delete(ventaId);
      else newSelected.add(ventaId);
      return newSelected;
    });
  };

  const handleSelectAllOnPage = () => {
    const allSelectableIds = new Set(boletas.filter(b => b.estado !== 'Entregado' && b.estado !== 'Cancelado').map(b => b.venta_id));
    const allSelectableOnPageSelected = Array.from(allSelectableIds).every(id => selectedBoletas.has(id));
    setSelectedBoletas(prev => {
      const newSelected = new Set(prev);
      if (allSelectableOnPageSelected) {
        allSelectableIds.forEach(id => newSelected.delete(id));
      } else {
        allSelectableIds.forEach(id => newSelected.add(id));
      }
      return newSelected;
    });
  };

    // Función para actualizar precios pendientes
    const handleActualizarPreciosPendientes = async () => {
        setIsUpdatingPrices(true);
        setUpdatePricesMsg(null);
        setError(null);
        const token = localStorage.getItem("token");
        try {
          const response = await fetch('https://quimex.sistemataup.online/ventas/actualizar_precios_pendientes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({})
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Error al actualizar precios.');

          // Esperamos que el backend devuelva un array de cambios: [{venta_id, monto_anterior, monto_nuevo}]
          if (Array.isArray(result.cambios) && result.cambios.length > 0) {
            const cambiosMsg = result.cambios.map((c: {venta_id: number, monto_anterior: number, monto_nuevo: number}) =>
              `Boleta #${c.venta_id}: $${c.monto_anterior} → $${c.monto_nuevo}`
            ).join('\n');
            setUpdatePricesMsg(`¡Precios actualizados! Cambios:\n${cambiosMsg}`);
          } else {
            setUpdatePricesMsg('¡Precios de boletas pendientes actualizados correctamente! (Sin detalles de cambios)');
          }
          await fetchBoletasPorFecha();
        } catch (err) {
          setUpdatePricesMsg(null);
          setError(err instanceof Error ? err.message : 'Error desconocido al actualizar precios.');
        } finally {
          setIsUpdatingPrices(false);
        }
    };

  const handleCambiarEstado = async () => {
    if (selectedBoletas.size === 0) return;
    setIsUpdatingStatus(true);
    setError(null);
    const token = localStorage.getItem("token");
    try {
        const response = await fetch('https://quimex.sistemataup.online/ventas/actualizar-estado-lote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                venta_ids: Array.from(selectedBoletas),
                nuevo_estado: estadoSeleccionado
            })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Error al actualizar estados.');
        await fetchBoletasPorFecha();
        setSelectedBoletas(new Set());
    } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido.');
    } finally {
        setIsUpdatingStatus(false);
    }
  };

const handlePrint = async (tipo: 'comprobante' | 'orden_de_trabajo') => {
    if (selectedBoletas.size === 0) { 
      alert(`Por favor, seleccione al menos un pedido para imprimir.`); 
      return; 
    }
    setLoading(true);
    setError(null);
    const token = localStorage.getItem("token");

    try {
      // 1. Llamada al endpoint de lote (esto está perfecto)
      const response = await fetch('https://quimex.sistemataup.online/ventas/obtener-detalles-lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ venta_ids: Array.from(selectedBoletas) })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `No se pudieron cargar los detalles.`);
      }
      
      const boletasDetalladas = await response.json();

      // --- AQUÍ ESTÁ LA CORRECCIÓN ---
      // 2. Mapeamos la respuesta de la API al formato exacto que espera VentaData
    // Redondear a múltiplos de 100
    const redondear = (valor: number | undefined) =>
      typeof valor === 'number' ? Math.round(valor / 100) * 100 : undefined;
    const boletasAImprimir: VentaData[] = boletasDetalladas.map((data: BoletaOriginal) => {
      return {
        venta_id: data.venta_id,
        fecha_emision: data.fecha_pedido || data.fecha_emision || '',
        cliente: { 
          nombre: data.cliente_nombre, 
          direccion: data.direccion_entrega, 
          localidad: data.cliente_zona 
        },
        nombre_vendedor: data.nombre_vendedor || '',
        items: (data.detalles || []).map((detalle: DetalleProducto) => ({
          producto_id: detalle.producto_id,
          producto_nombre: detalle.producto_nombre,
          cantidad: detalle.cantidad,
          precio_total_item_ars: redondear(detalle.precio_total_item_ars),
        })),
        total_final: redondear(data.monto_final_con_recargos),
        observaciones: data.observaciones,
        forma_pago: data.forma_pago,
        monto_pagado_cliente: redondear(data.monto_pagado_cliente),
        vuelto_calculado: redondear(data.vuelto_calculado)
      };
    });
      
      // 3. El resto de la lógica se queda igual
      if (boletasAImprimir.length > 0) {
  const printWindow = window.open('/imprimir', '_blank');
  const printJobData = { tipo, boletas: boletasAImprimir };
  console.log('Intentando enviar datos a la ventana de impresión:', printJobData);
  const sendPrintData = () => {
    if (printWindow) {
      console.log('Enviando printJobData por postMessage');
      printWindow.postMessage({ type: 'PRINT_JOB_DATA', payload: printJobData }, window.location.origin);
    }
  };
  let attempts = 0;
  const interval = setInterval(() => {
    if (printWindow && !printWindow.closed) {
      console.log('Intento', attempts + 1, 'de enviar printJobData');
      printWindow.postMessage({ type: 'PRINT_JOB_DATA', payload: printJobData }, window.location.origin);
      attempts++;
      if (attempts > 10) clearInterval(interval);
    } else {
      clearInterval(interval);
    }
  }, 300);
  setTimeout(sendPrintData, 700);
      } else {
        setError("No se encontraron datos válidos para las boletas seleccionadas.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido al preparar la impresión.");
    } finally {
      setLoading(false);
    }
  };
  
  const getColorForStatus = (status: string) => {
    switch(status.toLowerCase().replace(/ /g, '')) {
        case 'pendiente': return 'bg-yellow-100 text-yellow-800';
        case 'listoparaentregar': return 'bg-blue-100 text-blue-800';
        case 'entregado': return 'bg-green-100 text-green-800';
        case 'cancelado': return 'bg-red-100 text-red-800';
        default: return 'bg-gray-100 text-gray-800';
    }
  };

  const isAllOnPageSelected = useMemo(() => {
    const selectableIds = boletas.filter(b => b.estado !== 'Entregado' && b.estado !== 'Cancelado').map(b => b.venta_id);
    return selectableIds.length > 0 && selectableIds.every(id => selectedBoletas.has(id));
  }, [boletas, selectedBoletas]);

  return (
    <>
  {/* Render único, sin edición de boleta */}
        <div className="flex flex-col items-center justify-center min-h-screen bg-indigo-900 py-10 px-4">
          <div className="bg-white p-6 md:p-8 rounded-lg shadow-md w-full max-w-7xl">
            <BotonVolver className="ml-0" />
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
              <h2 className="text-2xl md:text-3xl font-semibold text-indigo-800">Gestión de Pedidos</h2>
              <div className="flex items-center gap-2">
                <label className="font-medium text-gray-700">Fecha de Entrega:</label>
                <input type="date" value={fechaSeleccionada} onChange={handleDateChange} className="border border-gray-300 rounded-md p-2"/>
              </div>
            </div>

            <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                    <label className="font-medium text-sm">Cambiar estado de ({selectedBoletas.size}) a:</label>
                    <select value={estadoSeleccionado} onChange={(e) => setEstadoSeleccionado(e.target.value)}
                        className="border border-gray-300 rounded-md p-2 text-sm" disabled={selectedBoletas.size === 0 || loading || isUpdatingStatus}>
                        <option>Listo para Entregar</option><option>Entregado</option><option>Pendiente</option><option>Cancelado</option>
                    </select>
                    <button onClick={handleCambiarEstado} disabled={selectedBoletas.size === 0 || loading || isUpdatingStatus}
                        className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50">
                        {isUpdatingStatus ? 'Aplicando...' : 'Aplicar'}
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => handlePrint('comprobante')} disabled={loading || isUpdatingStatus || selectedBoletas.size === 0} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50">Imprimir Boletas</button>
                    <button onClick={() => handlePrint('orden_de_trabajo')} disabled={loading || isUpdatingStatus || selectedBoletas.size === 0} className="bg-gray-700 hover:bg-gray-800 text-white font-bold py-2 px-4 rounded disabled:opacity-50">Imprimir OT</button>
                      <button onClick={handleActualizarPreciosPendientes} disabled={loading || isUpdatingStatus || isUpdatingPrices} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50">
                        {isUpdatingPrices ? 'Actualizando...' : 'Actualizar Precios Pendientes'}
                      </button>
                </div>
            </div>

            {/* Filtros de búsqueda automáticos */}
            <div className="flex flex-col md:flex-row gap-2 mb-4 items-center">
              <input
                type="text"
                className="border p-2 rounded w-full md:w-64"
                placeholder="Buscar cliente..."
                value={searchCliente}
                onChange={e => setSearchCliente(e.target.value)}
              />
              <select
                className="border p-2 rounded w-full md:w-48"
                value={filterEstado}
                onChange={e => setFilterEstado(e.target.value)}
              >
                <option value="">Todos los estados</option>
                <option value="Pendiente">Pendiente</option>
                <option value="Listo para Entregar">Listo para Entregar</option>
                <option value="Entregado">Entregado</option>
                <option value="Cancelado">Cancelado</option>
              </select>
            </div>

            {error && <pre className="text-red-600 bg-red-100 p-3 rounded-md">{error}</pre>}
              {updatePricesMsg && <pre className="text-green-700 bg-green-100 p-3 rounded-md">{updatePricesMsg}</pre>}
            {loading && !isUpdatingStatus && <p className="text-center text-gray-600 my-4">Cargando pedidos...</p>}

            {!loading && !error && (
              <div className="overflow-x-auto">
                <ul className="min-w-full space-y-2">
                  <li className="grid grid-cols-13 gap-3 items-center bg-indigo-100 p-2 rounded-md font-semibold text-indigo-800 text-xs uppercase">
                    <div className="col-span-1 flex justify-center"><input type="checkbox" onChange={handleSelectAllOnPage} checked={isAllOnPageSelected} /></div>
                    <span className="col-span-3">Cliente</span>
                    <span className="col-span-2">Monto</span>
                    <span className="col-span-3">Dirección</span>
                    <span className="col-span-2">Localidad</span>
                    <span className="col-span-2">Estado</span>
                  </li>
                  {boletas
                    .filter(b => {
                      // Búsqueda por similitud automática
                      const input = searchCliente.trim().toLowerCase();
                      const nombre = b.cliente_nombre.toLowerCase();
                      if (!input) return filterEstado ? b.estado === filterEstado : true;
                      // Coincidencia directa o fuzzy simple
                      const incluye = nombre.includes(input);
                      // Fuzzy: permite hasta 1 letra de diferencia si input >= 3
                      function fuzzy(str: string, pattern: string) {
                        if (pattern.length < 3) return str.includes(pattern);
                        let mismatches = 0, i = 0, j = 0;
                        while (i < str.length && j < pattern.length) {
                          if (str[i] === pattern[j]) { j++; } else { mismatches++; }
                          i++;
                        }
                        return (j === pattern.length && mismatches <= 1) || str.includes(pattern);
                      }
                      const fuzzyMatch = fuzzy(nombre, input);
                      return (incluye || fuzzyMatch) && (filterEstado ? b.estado === filterEstado : true);
                    })
                    .length > 0 ? boletas
                    .filter(b => {
                      const input = searchCliente.trim().toLowerCase();
                      const nombre = b.cliente_nombre.toLowerCase();
                      if (!input) return filterEstado ? b.estado === filterEstado : true;
                      const incluye = nombre.includes(input);
                      function fuzzy(str: string, pattern: string) {
                        if (pattern.length < 3) return str.includes(pattern);
                        let mismatches = 0, i = 0, j = 0;
                        while (i < str.length && j < pattern.length) {
                          if (str[i] === pattern[j]) { j++; } else { mismatches++; }
                          i++;
                        }
                        return (j === pattern.length && mismatches <= 1) || str.includes(pattern);
                      }
                      const fuzzyMatch = fuzzy(nombre, input);
                      return (incluye || fuzzyMatch) && (filterEstado ? b.estado === filterEstado : true);
                    })
                    .map((boleta) => {
                      const isFinalState = boleta.estado === 'Entregado' || boleta.estado === 'Cancelado';
                      return (
                        <li key={boleta.venta_id} className={`grid grid-cols-13 gap-3 items-center p-2 rounded-md ${isFinalState ? 'bg-gray-200 opacity-70' : 'bg-gray-50'}`}>
                          <div className="col-span-1 flex justify-center"><input type="checkbox" checked={selectedBoletas.has(boleta.venta_id)} onChange={() => handleCheckboxChange(boleta.venta_id)} disabled={isFinalState} className={isFinalState ? 'cursor-not-allowed' : ''}/></div>
                          <span className="col-span-3 truncate font-medium">{boleta.cliente_nombre}</span>
                          <span className="col-span-2">$ {Math.round(boleta.monto_final_con_recargos / 100) * 100}</span>
                          <span className="col-span-3 truncate">{boleta.direccion_entrega}</span>
                          <span className="col-span-2 truncate">{boleta.cliente_zona || '-'}</span>
                          <span className="col-span-2"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${getColorForStatus(boleta.estado)}`}>{boleta.estado}</span></span>
                        </li>
                      );
                  }) : (
                    <li className="text-center text-gray-500 py-8">No se encontraron pedidos para esta fecha.</li>
                  )}
                </ul>
              </div>
            )}
            {pagination && pagination.total_pages > 1 && (
              <div className="flex justify-center items-center mt-6 gap-3">
                <button onClick={() => setPage(p => Math.max(p - 1, 1))} disabled={!pagination.has_prev || loading} className="px-4 py-2 rounded bg-indigo-600 text-white disabled:opacity-50">Anterior</button>
                <span>Página {pagination.current_page} de {pagination.total_pages}</span>
                <button onClick={() => setPage(p => p + 1)} disabled={!pagination.has_next || loading} className="px-4 py-2 rounded bg-indigo-600 text-white disabled:opacity-50">Siguiente</button>
              </div>
            )}
          </div>
        </div>
      </>
  );
}
