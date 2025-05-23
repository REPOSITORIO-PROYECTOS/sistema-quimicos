// src/components/ContabilidadTable.tsx
"use client";

import React, { useState, useEffect, useCallback } from 'react';

// --- Interfaces de Datos ---
interface Venta {
    venta_id: number | string;
    monto_final_con_recargos: number;
    fecha_registro?: string;
    nombre_razon_social?: string; // Asumiendo que este es el nombre del cliente
}

interface CompraInfo { // De la lista inicial /ordenes_compra/obtener_todas
    id: number | string;
    proveedor_nombre?: string;
    fecha_actualizacion?: string;
    // ... otros campos que pueda tener la lista de resumen de compras
}

interface CompraDetalleConItems { // Del detalle individual /ordenes_compra/obtener/:id
    id: number | string;
    estado?: string; // ESTE ES EL CAMPO CLAVE PARA FILTRAR
    fecha_actualizacion?: string;
    fecha_creacion?: string;
    items: CompraItem[];
    // Campos que pediste ignorar con eslint-disable-next-line pero deben estar en el tipo si existen
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
    // ... otros campos del detalle de la compra
}

interface CompraItem { // Item dentro de CompraDetalleConItems
    id_linea: number;
    producto_id: number | string;
    cantidad_solicitada: number; // Usaremos esta para el body de calcular_precio
    producto_codigo?: number | string;
    producto_nombre?: string;
    cantidad_recibida?: number;
    //eslint-disable-next-line
    notas_item_recepcion?: any;
    // ... otros campos del item de compra
}

interface PrecioCalculadoResponse {
    precio_total_calculado_ars: number;
}

interface RegistroContable {
    key: string;
    id_display: string;
    descripcion: string;
    debe: number | null;
    haber: number | null;
    fecha_actualizacion?: Date;
}
// --- FIN Interfaces de Datos ---


// --- Función Auxiliar ParseDate ---
const parseDate = (dateString: string | undefined): Date | undefined => {
    if (!dateString) return undefined;
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? undefined : date;
};
// --- FIN Función Auxiliar ParseDate ---


// --- Componente Principal ---
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
            // Ya se maneja en el useEffect de montaje, pero una guarda adicional no hace daño.
            // O se podría eliminar esta guarda si el useEffect principal ya lo controla.
            console.warn("Intento de fetch sin token.");
            setIsLoading(false);
            if (!error) setError("Token de autenticación no disponible para realizar la solicitud.");
            return;
        }

        setIsLoading(true);
        setError(null);
        setRegistros([]);
        setTotalDebe(0);
        setTotalHaber(0);
        setBalance(0);
        setLoadingStage("Cargando listas iniciales (ventas y compras)...");

        const ventasApiUrl = 'https://quimex.sistemataup.online/ventas/obtener_todas';
        const comprasListApiUrl = 'https://quimex.sistemataup.online/ordenes_compra/obtener_todas';
        const compraDetailApiUrlBase = 'https://quimex.sistemataup.online/ordenes_compra/obtener/';
        const calcularPrecioApiUrlBase = 'https://quimex.sistemataup.online/productos/calcular_precio/';

        try {
            const commonHeaders = { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };
            // console.log("Fetching listas iniciales...");
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

            let registrosCompras: RegistroContable[] = [];
            let newTotalHaber = 0;

            if (comprasInfoData.length > 0) {
                setLoadingStage(`Cargando detalles de ${comprasInfoData.length} órdenes de compra...`);
                const compraDetailPromises = comprasInfoData.map(info => {
                    if (info.id == null) return Promise.reject(new Error(`ID de Compra nulo encontrado en la lista.`));
                    return fetch(`${compraDetailApiUrlBase}${info.id}`, { headers: commonHeaders });
                });
                const compraDetailResults = await Promise.allSettled(compraDetailPromises);

                // console.log("Procesando detalles de compras y calculando precios...");
                let calculoPromisesPending = 0; // Para el mensaje de carga de precios

                const ordenTotalPromises = compraDetailResults.map(async (detailResult, index): Promise<{ compraInfo: CompraInfo, totalCalculado: number, fecha?: Date, estado?: string } | null> => {
                    const compraInfo = comprasInfoData[index]; // Siempre existirá por el mapeo
                    let fechaCompra = parseDate(compraInfo.fecha_actualizacion);

                    if (detailResult.status === 'rejected' || !detailResult.value.ok) {
                        const errorMsg = detailResult.status === 'rejected' 
                            ? (detailResult.reason instanceof Error ? detailResult.reason.message : String(detailResult.reason)) 
                            : `HTTP ${detailResult.value?.status || '?'}`;
                        console.error(`Error al obtener detalle de compra ID ${compraInfo?.id}: ${errorMsg}`);
                        fetchErrors.push(`Compra ID ${compraInfo?.id}: Falló obtención de detalle (${errorMsg})`);
                        return null; 
                    }

                    try {
                        const detalleCompra: CompraDetalleConItems = await detailResult.value.json();
                        if (!fechaCompra) fechaCompra = parseDate(detalleCompra.fecha_actualizacion);

                        // --- FILTRADO POR ESTADO "Recibido" ---
                        // !!! AJUSTA "Recibido" AL STRING EXACTO QUE USA TU API !!!
                        const estadoRequerido = "Recibido"; 
                        if (detalleCompra.estado !== estadoRequerido) {
                            // console.log(`Compra ID ${compraInfo.id} omitida. Estado: '${detalleCompra.estado}' (se esperaba '${estadoRequerido}')`);
                            return null; 
                        }
                        // --- FIN FILTRADO ---

                        if (!Array.isArray(detalleCompra.items) || detalleCompra.items.length === 0) {
                            // console.warn(`Compra ID ${compraInfo.id} (Estado: ${detalleCompra.estado}) no tiene items válidos.`);
                            fetchErrors.push(`Compra ID ${compraInfo.id} (Estado: ${detalleCompra.estado}): Sin items.`);
                            return { compraInfo, totalCalculado: 0, fecha: fechaCompra, estado: detalleCompra.estado };
                        }
                        
                        const itemPricePromises = detalleCompra.items.map(item => {
                            if (item.producto_id == null || typeof item.cantidad_solicitada !== 'number') {
                                // console.warn(`Item inválido en Compra ID ${compraInfo.id}:`, item);
                                fetchErrors.push(`Compra ID ${compraInfo.id}: Item ID ${item.id_linea || 'desconocido'} inválido.`);
                                return Promise.resolve(0);
                            }
                            calculoPromisesPending++;
                            if (calculoPromisesPending > 0) setLoadingStage(`Calculando precios (${calculoPromisesPending} restantes)...`);
                            
                            const body = JSON.stringify({
                                producto_id: item.producto_id,
                                quantity: item.cantidad_solicitada 
                            });
                            return fetch(`${calcularPrecioApiUrlBase}${item.producto_id}`, {
                                method: "POST",
                                headers: commonHeaders,
                                body: body,
                            })
                            .then(async response => {
                                calculoPromisesPending--;
                                if (calculoPromisesPending === 0) setLoadingStage("Finalizando cálculos...");
                                if (!response.ok) {
                                     const errorData = await response.json().catch(() => ({}));
                                     throw new Error(`Precio Item ${item.producto_id}: HTTP ${response.status} - ${errorData.mensaje || response.statusText}`);
                                }
                                const precioData: PrecioCalculadoResponse = await response.json();
                                if (typeof precioData.precio_total_calculado_ars === 'number' && !isNaN(precioData.precio_total_calculado_ars)) {
                                    return precioData.precio_total_calculado_ars;
                                } else {
                                    // console.warn(`Precio calculado inválido para Item ${item.producto_id} en Compra ${compraInfo.id}`);
                                    fetchErrors.push(`Compra ID ${compraInfo.id}, Item ${item.producto_id}: Precio calculado no es número.`);
                                    return 0;
                                }
                            })
                            .catch(err => {
                                calculoPromisesPending--;
                                if (calculoPromisesPending === 0) setLoadingStage("Finalizando cálculos...");
                                console.error(`Error calculando precio Item ${item.producto_id} en Compra ${compraInfo.id}:`, err);
                                fetchErrors.push(`Compra ID ${compraInfo.id}, Item ${item.producto_id}: ${err.message}`);
                                return 0;
                            });
                        });

                        const itemPrices = await Promise.all(itemPricePromises);
                        const totalOrden = itemPrices.reduce((sum, price) => sum + price, 0);
                        // console.log(`Compra ID ${compraInfo.id} (Estado: ${detalleCompra.estado}) - Total Calculado: ${totalOrden.toFixed(2)}`);
                        return { compraInfo, totalCalculado: totalOrden, fecha: fechaCompra, estado: detalleCompra.estado };

                    } catch (jsonError) {
                        console.error(`Error parseando JSON detalle compra ID ${compraInfo.id}:`, jsonError);
                        fetchErrors.push(`Compra ID ${compraInfo.id}: Error parseo JSON de detalle.`);
                        return null; 
                    }
                });

                setLoadingStage("Esperando todos los cálculos de totales de órdenes...");
                const ordenesConTotalResultados = await Promise.all(ordenTotalPromises);
                
                const ordenesConTotalValidas = ordenesConTotalResultados.filter(
                    (resultado): resultado is { compraInfo: CompraInfo, totalCalculado: number, fecha?: Date, estado?: string } => resultado !== null
                );

                registrosCompras = ordenesConTotalValidas.map(orden => {
                    const { compraInfo, totalCalculado, fecha } = orden;
                    newTotalHaber += totalCalculado;
                    const idDisplay = compraInfo?.id?.toString() ?? 'ERROR_ID';
                    const proveedorInfo = compraInfo?.proveedor_nombre ? ` (${compraInfo.proveedor_nombre})` : '';
                    const descripcion = `Compra OC-${idDisplay}${proveedorInfo}`;
                    return {
                        key: `compra-${idDisplay}-${Date.now()}-${Math.random()}`, // Key más única
                        id_display: idDisplay,
                        descripcion: descripcion,
                        debe: null,
                        haber: totalCalculado,
                        fecha_actualizacion: fecha,
                    };
                });

            } else {
                // console.log("No hay compras en la lista inicial para procesar.");
            }

            let newTotalDebe = 0;
            const registrosVentas = ventasData.map((venta): RegistroContable => {
                 const ventaTotal = typeof venta.monto_final_con_recargos === 'number' && !isNaN(venta.monto_final_con_recargos) ? venta.monto_final_con_recargos : 0;
                 newTotalDebe += ventaTotal;
                 const idDisplay = venta.venta_id?.toString() ?? 'N/A';
                 const clienteInfo = venta.nombre_razon_social ? ` (${venta.nombre_razon_social})` : '';
                 const descripcion = `Venta F-${idDisplay}${clienteInfo}`;
                 const fechaParaRegistroVenta = parseDate(venta.fecha_registro);
                 return { key: `venta-${idDisplay}-${Date.now()}-${Math.random()}`, id_display: idDisplay, descripcion: descripcion, debe: ventaTotal, haber: null, fecha_actualizacion: fechaParaRegistroVenta };
             });

            const registrosCombinados: RegistroContable[] = [...registrosVentas, ...registrosCompras];
            registrosCombinados.sort((a, b) => { 
                const timeA = a.fecha_actualizacion instanceof Date && !isNaN(a.fecha_actualizacion.getTime()) ? a.fecha_actualizacion.getTime() : -Infinity;
                const timeB = b.fecha_actualizacion instanceof Date && !isNaN(b.fecha_actualizacion.getTime()) ? b.fecha_actualizacion.getTime() : -Infinity;
                return timeB - timeA; // Descendente (más reciente primero)
            });

            if (fetchErrors.length > 0) {
                const errorSummary = `Se encontraron ${fetchErrors.length} problemas durante la carga. Primeros errores: ${fetchErrors.slice(0, 3).join('; ')}... (Ver consola para detalles completos)`;
                setError(errorSummary);
                console.error("Todos los errores de fetch/procesamiento encontrados:", fetchErrors);
            }

            setRegistros(registrosCombinados);
            setTotalDebe(newTotalDebe);
            setTotalHaber(newTotalHaber);
            setBalance(newTotalDebe - newTotalHaber);
            //eslint-disable-next-line
        } catch (err: any) {
            console.error("Error general no capturado en fetchRegistrosContables:", err);
            setError(err.message || 'Ocurrió un error inesperado durante la carga de datos.');
            setRegistros([]); setTotalDebe(0); setTotalHaber(0); setBalance(0);
        } finally {
            setIsLoading(false);
            setLoadingStage("Proceso completado.");
        }
    }, [token]); // Dependencia del token para re-ejecutar si cambia

    useEffect(() => {
        if (token) {
            fetchRegistrosContables();
        }
        // No es necesario un 'else' aquí si el useEffect de inicialización del token ya maneja el caso sin token.
    }, [fetchRegistrosContables, token]); // Ejecutar cuando fetchRegistrosContables (por cambio de token) o token cambie.

    return (
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
                            disabled={isLoading}
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