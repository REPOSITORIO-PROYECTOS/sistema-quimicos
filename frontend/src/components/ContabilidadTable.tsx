// src/components/ContabilidadTable.tsx
"use client";

import React, { useState, useEffect, useCallback } from 'react';

// --- Interfaces de Datos ---
interface Venta {
    venta_id: number | string;
    monto_final_con_recargos: number;
    fecha_registro?: string;
    nombre_razon_social?: string; 
}

interface CompraInfo { 
    id: number | string;
    proveedor_nombre?: string;
    fecha_actualizacion?: string;
}

interface CompraDetalleConItems { 
    id: number | string;
    estado?: string; 
    fecha_actualizacion?: string;
    fecha_creacion?: string;
    items: CompraItem[]; // Aunque el total venga aparte, los items pueden ser útiles para la descripción
    // El total de la OC
    importe_abonado?: number;      
    //eslint-disable-next-line 
    aprobado_por?: any;
    //eslint-disable-next-line
    estado_recepcion?: any; 
    //eslint-disable-next-line
    fecha_aprobacion?: any;
    //eslint-disable-next-line
    fecha_recepcion?: any;
    //eslint-disable-next-line
    fecha_rechazo?: any;
}

interface CompraItem { 
    // importe_linea_estimado ya no es necesario aquí si el total viene en la OC
    id_linea: number;
    importe_linea_estimado?: number; 
    producto_id: number | string;
    cantidad_solicitada: number; 
    producto_codigo?: number | string;
    producto_nombre?: string;
    cantidad_recibida?: number;
    //eslint-disable-next-line
    notas_item_recepcion?: any;
}

interface RegistroContable {
    key: string;
    id_display: string;
    descripcion: string;
    debe: number | null;
    haber: number | null;
    fecha_actualizacion?: Date;
}

interface OrdenProcesada {
    compraInfo: CompraInfo;
    totalCalculado: number; // Para estado "Recibido", será el total de la OC
    montoDeuda?: number;     // Para estado "En Deuda"
    montoAbonado?: number;   // Para estado "En Deuda"
    fecha?: Date; 
    estado?: string; 
}
// --- FIN Interfaces de Datos ---


const parseDate = (dateString: string | undefined): Date | undefined => {
    if (!dateString) return undefined;
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? undefined : date;
};

export default function ContabilidadTable() {
    const [registros, setRegistros] = useState<RegistroContable[]>([]);
    const [totalDebe, setTotalDebe] = useState<number>(0);
    const [totalHaber, setTotalHaber] = useState<number>(0);
    const [balance, setBalance] = useState<number>(0);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [loadingStage, setLoadingStage] = useState<string>("Inicializando...");
    const [token, setToken] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window !== "undefined") {
            const storedToken = localStorage.getItem("token");
            setToken(storedToken);
            if (!storedToken) {
                setError("Token de autenticación no encontrado. Por favor, inicie sesión.");
                setIsLoading(false);
                setLoadingStage("Error de autenticación.");
            }
        }
    }, []);

    const fetchRegistrosContables = useCallback(async () => {
        if (!token) {
            console.warn("Intento de fetch sin token.");
            setIsLoading(false);
            if (!error) setError("Token de autenticación no disponible para realizar la solicitud.");
            return;
        }

        setIsLoading(true);
        setError(null);
        setRegistros([]);
        setTotalDebe(0); // Se recalculará
        setTotalHaber(0); // Se recalculará
        setBalance(0);
        setLoadingStage("Cargando listas iniciales (ventas y compras)...");

        const ventasApiUrl = 'https://quimex.sistemataup.online/ventas/obtener_todas';
        const comprasListApiUrl = 'https://quimex.sistemataup.online/ordenes_compra/obtener_todas';
        const compraDetailApiUrlBase = 'https://quimex.sistemataup.online/ordenes_compra/obtener/';

        try {
            const commonHeaders = { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };
            const [ventasResult, comprasListResult] = await Promise.allSettled([
                fetch(ventasApiUrl, { headers: commonHeaders }),
                fetch(comprasListApiUrl, { headers: commonHeaders })
            ]);

            let ventasData: Venta[] = [];
            let comprasInfoData: CompraInfo[] = [];
            const fetchErrors: string[] = [];

            if (ventasResult.status === 'fulfilled' && ventasResult.value.ok) {
                const datos = await ventasResult.value.json();
                if (datos && Array.isArray(datos.ventas)) ventasData = datos.ventas as Venta[];
                else console.warn("Respuesta de ventas inesperada o sin array 'ventas':", datos);
            } else if (ventasResult.status === 'fulfilled') fetchErrors.push(`Ventas(L): HTTP ${ventasResult.value.status}`);
            else fetchErrors.push(`Ventas(L): ${ventasResult.reason instanceof Error ? ventasResult.reason.message : String(ventasResult.reason) || 'Error de red'}`);

            if (comprasListResult.status === 'fulfilled' && comprasListResult.value.ok) {
                const datos2 = await comprasListResult.value.json();
                if (datos2 && Array.isArray(datos2.ordenes)) comprasInfoData = datos2.ordenes as CompraInfo[];
                else console.warn("Respuesta de lista de compras inesperada o sin array 'ordenes':", datos2);
            } else if (comprasListResult.status === 'fulfilled') fetchErrors.push(`Compras(L): HTTP ${comprasListResult.value.status}`);
            else fetchErrors.push(`Compras(L): ${comprasListResult.reason instanceof Error ? comprasListResult.reason.message : String(comprasListResult.reason) || 'Error de red'}`);

            if (fetchErrors.length > 0) console.warn("Errores al cargar listas iniciales:", fetchErrors);

            const registrosTemporales: RegistroContable[] = []; // Usaremos este para construir y luego setear el estado

            if (comprasInfoData.length > 0) {
                setLoadingStage(`Cargando detalles de ${comprasInfoData.length} órdenes de compra...`);
                const compraDetailPromises = comprasInfoData.map(info => {
                    if (info.id == null) return Promise.resolve<OrdenProcesada | { error: true, id: string | number, proveedor?: string } | null>(null);
                    return fetch(`${compraDetailApiUrlBase}${info.id}`, { headers: commonHeaders })
                        .then(response => {
                            if (!response.ok) {
                                return response.json().catch(() => null).then(errorBody => {
                                    const errorMsg = errorBody?.message || `HTTP ${response.status}`;
                                    console.error(`Error al obtener detalle de compra ID ${info.id}: ${errorMsg}`);
                                    fetchErrors.push(`Compra ID ${info.id}: Falló obtención de detalle (${errorMsg})`);
                                    return { error: true, id: info.id, proveedor: info.proveedor_nombre };
                                });
                            }
                            return response.json();
                        })
                        .then((detalleCompra: CompraDetalleConItems | { error: true, id: string | number, proveedor?: string } | null): OrdenProcesada | { error: true, id: string | number, proveedor?: string } | null => {
                            if (!detalleCompra) return null;
                                                        if (
                                                            typeof detalleCompra === 'object' &&
                                                            detalleCompra !== null &&
                                                            'error' in detalleCompra &&
                                                            (detalleCompra as Record<string, unknown>).error
                                                        ) {
                                                            return detalleCompra;
                                                        }
                            const compraOriginalInfo = comprasInfoData.find(ci => ci.id === (detalleCompra as CompraDetalleConItems).id);
                            if (!compraOriginalInfo) return { error: true, id: (detalleCompra as CompraDetalleConItems).id };
                            let fechaCompra = parseDate(compraOriginalInfo.fecha_actualizacion);
                            if (!fechaCompra) fechaCompra = parseDate((detalleCompra as CompraDetalleConItems).fecha_actualizacion);
                            const estadoRecibido = "Recibido"; 
                            const estadoEnDeuda = "Con Deuda";
                            if ((detalleCompra as CompraDetalleConItems).estado !== estadoRecibido && (detalleCompra as CompraDetalleConItems).estado !== estadoEnDeuda) {
                                return null; 
                            }
                            const importeTotalOCHeader = (detalleCompra as any).importe_total_estimado;
                            const importeTotalOC = typeof importeTotalOCHeader === 'number' ? importeTotalOCHeader : 0;
                            if ((detalleCompra as CompraDetalleConItems).estado === estadoEnDeuda) {
                                const montoAbonado = typeof (detalleCompra as CompraDetalleConItems).importe_abonado === 'number' 
                                    ? (detalleCompra as CompraDetalleConItems).importe_abonado!
                                    : 0;
                                const deuda = (importeTotalOC ?? 0) - (montoAbonado ?? 0);
                                return { 
                                    compraInfo: compraOriginalInfo, 
                                    totalCalculado: importeTotalOC ?? 0, 
                                    montoDeuda: deuda > 0 ? deuda : 0, 
                                    montoAbonado: montoAbonado ?? 0,
                                    fecha: fechaCompra, 
                                    estado: (detalleCompra as CompraDetalleConItems).estado 
                                };
                            } else { // Es "Recibido"
                                return { 
                                    compraInfo: compraOriginalInfo, 
                                    totalCalculado: importeTotalOC ?? 0, 
                                    fecha: fechaCompra, 
                                    estado: (detalleCompra as CompraDetalleConItems).estado 
                                };
                            }
                        })
                        .catch(err => {
                            console.error(`Error procesando detalle compra ID ${info.id}:`, err);
                            fetchErrors.push(`Compra ID ${info.id}: Error en procesamiento de detalle.`);
                            return { error: true, id: info.id, proveedor: info.proveedor_nombre };
                        });
                });
                setLoadingStage("Procesando totales de órdenes de compra...");
                const ordenesProcesadasResultados = await Promise.all(compraDetailPromises);
                // Mostrar también las compras con error de detalle
                ordenesProcesadasResultados.forEach(orden => {
                    if (!orden) return;
                                        if (
                                            typeof orden === 'object' &&
                                            orden !== null &&
                                            'error' in orden &&
                                            (orden as Record<string, unknown>).error
                                        ) {
                                                const idDisplay = (orden as Record<string, unknown>).id?.toString() ?? 'ERROR_ID';
                                                const proveedorInfo = (orden as Record<string, unknown>).proveedor ? ` (${(orden as Record<string, unknown>).proveedor})` : '';
                                                registrosTemporales.push({
                                                        key: `compra-${idDisplay}-ERROR-${Date.now()}-${Math.random()}`,
                                                        id_display: idDisplay,
                                                        descripcion: `Compra OC-${idDisplay}${proveedorInfo} - ERROR EN DETALLE DE COMPRA`,
                            debe: null,
                            haber: null,
                            fecha_actualizacion: undefined,
                        });
                        return;
                    }
                    const { compraInfo, totalCalculado, fecha, estado, montoDeuda, montoAbonado } = orden as OrdenProcesada;
                    const idDisplay = compraInfo?.id?.toString() ?? 'ERROR_ID';
                    const proveedorInfo = compraInfo?.proveedor_nombre ? ` (${compraInfo.proveedor_nombre})` : '';
                    let descripcion = `Compra OC-${idDisplay}${proveedorInfo}`;
                    let debe: number | null = null;
                    let haber: number | null = null;
                    if (estado === "Con Deuda") {
                        descripcion += ` (Con Deuda)`;
                        debe = montoDeuda !== undefined && montoDeuda > 0 ? montoDeuda : null;
                        haber = montoAbonado !== undefined && montoAbonado > 0 ? montoAbonado : null;
                    } else if (estado === "Recibido") {
                        haber = totalCalculado;
                    }
                    registrosTemporales.push({
                        key: `compra-${idDisplay}-${estado}-${Date.now()}-${Math.random()}`,
                        id_display: idDisplay,
                        descripcion: descripcion,
                        debe: debe,
                        haber: haber,
                        fecha_actualizacion: fecha,
                    });
                });
            }

            ventasData.forEach((venta) => {
                 const ventaTotal = typeof venta.monto_final_con_recargos === 'number' && !isNaN(venta.monto_final_con_recargos) ? venta.monto_final_con_recargos : 0;
                 const idDisplay = venta.venta_id?.toString() ?? 'N/A';
                 const clienteInfo = venta.nombre_razon_social ? ` (${venta.nombre_razon_social})` : '';
                 const descripcion = `Venta F-${idDisplay}${clienteInfo}`;
                 const fechaParaRegistroVenta = parseDate(venta.fecha_registro);
                 registrosTemporales.push({ key: `venta-${idDisplay}-${Date.now()}-${Math.random()}`, id_display: idDisplay, descripcion: descripcion, debe: ventaTotal, haber: null, fecha_actualizacion: fechaParaRegistroVenta });
             });

            registrosTemporales.sort((a, b) => { 
                const timeA = a.fecha_actualizacion instanceof Date && !isNaN(a.fecha_actualizacion.getTime()) ? a.fecha_actualizacion.getTime() : -Infinity;
                const timeB = b.fecha_actualizacion instanceof Date && !isNaN(b.fecha_actualizacion.getTime()) ? b.fecha_actualizacion.getTime() : -Infinity;
                return timeB - timeA;
            });

            // Calcular totales finales DEBE y HABER a partir de registrosTemporales
            let finalTotalDebe = 0;
            let finalTotalHaber = 0;
            registrosTemporales.forEach(reg => {
                if (reg.debe !== null) finalTotalDebe += reg.debe;
                if (reg.haber !== null) finalTotalHaber += reg.haber;
            });

            if (fetchErrors.length > 0) {
                const errorSummary = `Se encontraron ${fetchErrors.length} problemas durante la carga. Primeros errores: ${fetchErrors.slice(0, 3).join('; ')}... (Ver consola para detalles completos)`;
                setError(errorSummary);
                console.error("Todos los errores de fetch/procesamiento encontrados:", fetchErrors);
            }

            setRegistros(registrosTemporales);
            setTotalDebe(finalTotalDebe);
            setTotalHaber(finalTotalHaber);
            setBalance(finalTotalDebe - finalTotalHaber);
            //eslint-disable-next-line
        } catch (err: any) {
            console.error("Error general no capturado en fetchRegistrosContables:", err);
            setError(err.message || 'Ocurrió un error inesperado durante la carga de datos.');
            setRegistros([]); setTotalDebe(0); setTotalHaber(0); setBalance(0);
        } finally {
            setIsLoading(false);
            setLoadingStage("Proceso completado.");
        }
    }, [token, error]);

    useEffect(() => {
        if (token) {
            fetchRegistrosContables();
        }
    }, [fetchRegistrosContables, token]);

    return (
        // ... (JSX sin cambios)
        <div className="p-4 md:p-6 bg-gray-50 min-h-screen">
            <div className="max-w-5xl mx-auto bg-white shadow rounded-lg p-4 md:p-6">
                <h1 className="text-xl md:text-2xl font-semibold text-gray-800 mb-6">Libro Mayor / Registros Contables</h1>
                 {isLoading && ( <div className="text-center py-10"> <p className="text-gray-600">{loadingStage}</p> </div> )}
                 {error && !isLoading && (
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-sm">
                        <p className="text-red-700 font-medium">Se encontraron problemas:</p>
                        <p className="text-red-600 mt-1 whitespace-pre-wrap">{error}</p>
                         <button 
                            onClick={fetchRegistrosContables} 
                            className="mt-3 px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                            disabled={isLoading || !token}
                         >
                            Reintentar
                        </button>
                    </div>
                )}
                 {!isLoading && (
                    <div className="overflow-x-auto border border-gray-200 rounded-md">
                         <table className="min-w-full bg-white divide-y divide-gray-200">
                             <thead className="bg-gray-100">
                                <tr>
                                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/6">ID Factura/OC</th>
                                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-2/6">Descripción</th>
                                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/6">Fecha</th>
                                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-1/6">Debe</th>
                                    <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-1/6">Haber</th>
                                </tr>
                            </thead>
                             <tbody className="bg-white divide-y divide-gray-200">
                                    {registros.length > 0 ? (
                                        registros.map((registro) => (
                                            <tr key={registro.key} className="hover:bg-gray-50">
                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{registro.id_display}</td>
                                                <td className="px-4 py-3 text-sm text-gray-800">{registro.descripcion}</td>
                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                                                    {registro.fecha_actualizacion instanceof Date && !isNaN(registro.fecha_actualizacion.getTime())
                                                        ? registro.fecha_actualizacion.toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '-'}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                                                    {registro.debe !== null ? `$${registro.debe.toFixed(2)}` : '-'}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                                                    {registro.haber !== null ? `$${registro.haber.toFixed(2)}` : '-'}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        !isLoading && registros.length === 0 && !error?.includes("Token") && (
                                            <tr> <td colSpan={5} className="text-center text-gray-500 py-6 px-4">No hay registros para mostrar.</td> </tr>
                                        )
                                    )}
                            </tbody>
                             <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                                 <tr>
                                     <td colSpan={3} className="px-4 py-3 text-right text-sm font-semibold text-gray-700">TOTALES:</td>
                                     <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">${totalDebe.toFixed(2)}</td>
                                     <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">${totalHaber.toFixed(2)}</td>
                                 </tr>
                                 <tr>
                                     <td colSpan={4} className="px-4 py-3 text-right text-sm font-semibold text-gray-700"> {balance >= 0 ? 'GANANCIA (Debe - Haber):' : 'PÉRDIDA (Debe - Haber):'} </td>
                                     <td className={`px-4 py-3 text-right text-sm font-bold ${balance >= 0 ? 'text-green-700' : 'text-red-700'}`}> ${balance.toFixed(2)} </td>
                                 </tr>
                             </tfoot>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
