"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import BotonVolver from '@/components/BotonVolver';
// import { useRouter } from 'next/navigation';

// --- TIPOS COMPLETOS Y ESTRICTOS ---
type DetalleProducto = {
  subtotal_proporcional_con_recargos?: number; // hacerlo opcional para reutilizar en impresión
  producto_id: number;
  producto_nombre: string;
  cantidad: number;
  precio_total_item_ars: number;
  observacion_item?: string;
  descuento_item_porcentaje?: number;
  subtotal_bruto_item_ars?: number; // si backend lo expone; si no se infiere
};

type BoletaOriginal = {
  venta_id: number;
  estado: string;
  monto_final_con_recargos: number;
  monto_final_con_descuento?: number; // Puede venir si hay descuento global
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
  descuento_total_global_porcentaje?: number;
  tipo_redondeo_general?: string; // decena | centena
  recargos?: {
    transferencia?: number;
    factura_iva?: number;
  };
};

type BoletaParaLista = {
  venta_id: number;
  estado: string;
  monto_final_con_recargos: number;
  monto_final_con_descuento?: number;
  tipo_redondeo_general?: string;
  fecha_pedido_formateada: string;
  cliente_nombre: string;
  direccion_entrega: string;
  cliente_zona?: string; // Localidad
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
  // const [pagination, setPagination] = useState<Pagination | null>(null);
  // const [page, setPage] = useState(1);
  const [boletas, setBoletas] = useState<BoletaParaLista[]>([]);
  const [loading, setLoading] = useState(true);
  // Eliminado idBoleta y setIdBoleta porque ya no se usa edición
  const [error, setError] = useState<string | null>(null);
  const [selectedBoletas, setSelectedBoletas] = useState<Set<number>>(new Set());
  const [estadoSeleccionado, setEstadoSeleccionado] = useState('Listo para Entregar');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  // Estados para filtro manual
  const [searchCliente, setSearchCliente] = useState("");
  const [filterEstado, setFilterEstado] = useState("");
  const [fechaSeleccionada, setFechaSeleccionada] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const fechaGuardada = localStorage.getItem('ultimaFechaPedidos');
      if (fechaGuardada) {
        return fechaGuardada;
      }
    }
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
        per_page: '1000',
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
        monto_final_con_descuento: item.monto_final_con_descuento,
        tipo_redondeo_general: item.tipo_redondeo_general,
        fecha_pedido_formateada: new Date(item.fecha_pedido).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }),
        cliente_nombre: item.cliente_nombre,
        direccion_entrega: item.direccion_entrega,
        cliente_zona: item.cliente_zona || '',
      }));
      setBoletas(boletasProcesadas);
      // setPagination(data.pagination); // Ya no se usa paginación
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [fechaSeleccionada]);

  useEffect(() => {
    fetchBoletasPorFecha();
  }, [fetchBoletasPorFecha]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nuevaFecha = e.target.value;
    if (typeof window !== 'undefined') {
      localStorage.setItem('ultimaFechaPedidos', nuevaFecha);
    }
    setFechaSeleccionada(nuevaFecha);
    // Ya no hay paginación
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
      
      const boletasDetalladas: BoletaOriginal[] = await response.json();

      const boletasAImprimir: VentaData[] = boletasDetalladas.map((data: BoletaOriginal) => {
        const detalles = data.detalles || [];
        const itemsNormalizados = detalles.map((item) => {
          // Si viene subtotal bruto explícito lo usamos, de lo contrario lo inferimos si hay descuento
          let subtotalBruto = item.subtotal_bruto_item_ars;
          if (subtotalBruto === undefined && item.descuento_item_porcentaje && item.descuento_item_porcentaje > 0 && item.descuento_item_porcentaje < 100) {
            subtotalBruto = item.precio_total_item_ars / (1 - item.descuento_item_porcentaje / 100);
          }
          return {
            producto_id: item.producto_id,
            producto_nombre: item.producto_nombre,
            cantidad: item.cantidad,
            precio_total_item_ars: item.precio_total_item_ars || 0,
            descuento_item_porcentaje: item.descuento_item_porcentaje,
            subtotal_bruto_item_ars: subtotalBruto,
            observacion_item: item.observacion_item,
          };
        });
        const totalPreferido = (typeof data.monto_final_con_descuento === 'number') ? data.monto_final_con_descuento : data.monto_final_con_recargos;
        return {
          venta_id: data.venta_id,
          fecha_emision: data.fecha_pedido || data.fecha_emision || '',
          cliente: { nombre: data.cliente_nombre, direccion: data.direccion_entrega, localidad: data.cliente_zona },
          nombre_vendedor: data.nombre_vendedor || '',
            items: itemsNormalizados,
            total_final: totalPreferido,
            observaciones: data.observaciones,
            forma_pago: data.forma_pago,
            monto_pagado_cliente: data.monto_pagado_cliente,
            vuelto_calculado: data.vuelto_calculado,
            descuento_total_global_porcentaje: data.descuento_total_global_porcentaje,
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
                    <button onClick={() => handlePrint('orden_de_trabajo')} disabled={loading || isUpdatingStatus || selectedBoletas.size === 0} className="bg-gray-700 hover:bg-gray-800 text-white font-bold py-2 px-4 rounded disabled:opacity-50">Imprimir OT
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
                      return (
                        <li key={boleta.venta_id} className={`grid grid-cols-13 gap-3 items-center p-2 rounded-md bg-gray-50`}>
                          <div className="col-span-1 flex justify-center"><input type="checkbox" checked={selectedBoletas.has(boleta.venta_id)} onChange={() => handleCheckboxChange(boleta.venta_id)} /></div>
                          <span className="col-span-3 truncate font-medium">{boleta.cliente_nombre}</span>
                          <span className="col-span-2">
                            {(() => {
                              const total = (boleta.monto_final_con_descuento ?? boleta.monto_final_con_recargos) || 0;
                              // Formato moneda simple sin Intl.NumberFormat pesado en SSR (cliente únicamente)
                              const formatted = total.toLocaleString('es-AR');
                              return <>
                                $ {formatted}{boleta.monto_final_con_descuento !== undefined && boleta.monto_final_con_descuento !== boleta.monto_final_con_recargos ? <span className="text-xs text-green-600 ml-1">(desc)</span> : null}
                                {boleta.tipo_redondeo_general ? <span className="text-[10px] text-gray-500 ml-1">[{boleta.tipo_redondeo_general === 'decena' ? 'x10' : 'x100'}]</span> : null}
                              </>;
                            })()}
                          </span>
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
            {/* Eliminar el bloque de paginación al final */}
          </div>
        </div>
      </>
  );
}