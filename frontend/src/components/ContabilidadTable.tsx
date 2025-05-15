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

// Lista inicial de compras (Desde /ordenes_compra/obtener_todas)
interface CompraInfo {
    id: number | string; // Confirmado: Viene como "Id" en la lista
    proveedor_nombre?: string; // ¡VERIFICA si este campo existe en la respuesta de la LISTA!
    fecha_actualizacion?: string; // ¡VERIFICA si este campo existe en la respuesta de la LISTA!
}

// Detalle de UNA orden de compra (Basado en la estructura que proporcionaste)
interface CompraDetalleConItems {
    id: number | string; // El ID de la orden de compra individual
    estado?: string;
    fecha_actualizacion?: string; // También existe en el detalle
    fecha_creacion?: string;
    items: CompraItem[]; // El array de items/productos
    // otros campos del detalle si los necesitas...
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

// Item dentro del detalle de una orden de compra (Basado en tu estructura)
interface CompraItem {
    id_linea: number; // ID de la línea/item
    producto_id: number | string; // ID del producto
    cantidad_solicitada: number; // <-- CAMBIO: Usa el nombre correcto de la API
    producto_codigo?: number | string; // Código del producto (opcional)
    producto_nombre?: string; // Nombre del producto (opcional)
    cantidad_recibida?: number; // Cantidad recibida (opcional)
    //eslint-disable-next-line
    notas_item_recepcion?: any; // Notas (opcional)
}

// Respuesta del endpoint de cálculo de precio
interface PrecioCalculadoResponse {
    precio_total_calculado_ars: number;
}

// Fila unificada de la tabla
interface RegistroContable {
    key: string;
    id_display: string;
    descripcion: string;
    debe: number | null;
    haber: number | null;
    fecha_actualizacion?: Date;
}

// --- Función Auxiliar ParseDate ---
const parseDate = (dateString: string | undefined): Date | undefined => {
    if (!dateString) return undefined;
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? undefined : date;
};

// --- Componente Principal ---
export default function ContabilidadTable() {
    // --- Estados ---
    const [registros, setRegistros] = useState<RegistroContable[]>([]);
    const [totalDebe, setTotalDebe] = useState<number>(0);
    const [totalHaber, setTotalHaber] = useState<number>(0);
    const [balance, setBalance] = useState<number>(0);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [loadingStage, setLoadingStage] = useState<string>("Cargando listas...");
    const token = localStorage.getItem("token")
    // --- Función para Cargar Datos ---
    const fetchRegistrosContables = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setRegistros([]);
        setTotalDebe(0);
        setTotalHaber(0);
        setBalance(0);
        setLoadingStage("Cargando listas iniciales...");

        const ventasApiUrl = 'https://quimex.sistemataup.online/ventas/obtener_todas';
        const comprasListApiUrl = 'https://quimex.sistemataup.online/ordenes_compra/obtener_todas';
        const compraDetailApiUrlBase = 'https://quimex.sistemataup.online/ordenes_compra/obtener/';
        const calcularPrecioApiUrlBase = 'https://quimex.sistemataup.online/productos/calcular_precio/';

        try {
            // 1. Fetch inicial de listas
            console.log("Fetching listas iniciales...");
            const [ventasResult, comprasListResult] = await Promise.allSettled([
                fetch(ventasApiUrl,{headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`}}),
                fetch(comprasListApiUrl,{headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`}})
            ]);

            let ventasData: Venta[] = [];
            let comprasInfoData: CompraInfo[] = [];
            const fetchErrors: string[] = [];

            // Procesar Ventas...
            if (ventasResult.status === 'fulfilled' && ventasResult.value.ok) {
                const datos = await ventasResult.value.json();
                if (datos && Array.isArray(datos.ventas)) ventasData = datos.ventas as Venta[];
                else console.warn("Respuesta de ventas inesperada:", datos);
            } else if (ventasResult.status === 'fulfilled') fetchErrors.push(`Ventas(L): HTTP ${ventasResult.value.status}`);
            else fetchErrors.push(`Ventas(L): ${ventasResult.reason?.message || 'Red'}`);

            // Procesar Lista de Compras...
            if (comprasListResult.status === 'fulfilled' && comprasListResult.value.ok) {
                const datos2 = await comprasListResult.value.json();
                if (datos2 && Array.isArray(datos2.ordenes)) comprasInfoData = datos2.ordenes as CompraInfo[];
                else console.warn("Respuesta de lista de compras inesperada:", datos2);
            } else if (comprasListResult.status === 'fulfilled') fetchErrors.push(`Compras(L): HTTP ${comprasListResult.value.status}`);
            else fetchErrors.push(`Compras(L): ${comprasListResult.reason?.message || 'Red'}`);

            if (fetchErrors.length > 0) console.error("Errores listas:", fetchErrors);

            // --- PROCESAMIENTO DE COMPRAS ---
            let registrosCompras: RegistroContable[] = [];
            let newTotalHaber = 0;

            if (comprasInfoData.length > 0) {
                // 2. Fetch Detalles de todas las Compras
                setLoadingStage(`Cargando detalles de ${comprasInfoData.length} compras...`);
                const compraDetailPromises = comprasInfoData.map(info => {
                    if (info.id == null) return Promise.reject("ID Compra Nulo");
                    return fetch(`${compraDetailApiUrlBase}${info.id}`);
                });
                const compraDetailResults = await Promise.allSettled(compraDetailPromises);

                // 3. Procesar cada detalle y Calcular Precios
                console.log("Procesando detalles y calculando precios...");
                let calculoPromisesPending = 0;

                const ordenTotalPromises = compraDetailResults.map(async (detailResult, index): Promise<{ compraInfo: CompraInfo, totalCalculado: number, fecha?: Date }> => {
                    const compraInfo = comprasInfoData[index];
                    // Intentar obtener fecha de la lista inicial, si no, se usará la del detalle si existe
                    let fechaCompra = parseDate(compraInfo.fecha_actualizacion);

                    if (detailResult.status === 'rejected' || !detailResult.value.ok || !compraInfo || compraInfo.id == null) {
                        const errorMsg = detailResult.status === 'rejected' ? detailResult.reason?.message || 'Fetch fallido' : `HTTP ${detailResult.value?.status || '?'}`;
                        console.error(`Error detalle compra ID ${compraInfo?.id}: ${errorMsg}`);
                        fetchErrors.push(`Compra ID ${compraInfo?.id}: Error detalle (${errorMsg})`);
                        return { compraInfo, totalCalculado: 0, fecha: fechaCompra };
                    }

                    try {
                        // Usar la interfaz CORRECTA para el detalle
                        const detalleCompra: CompraDetalleConItems = await detailResult.value.json();

                        // Si no obtuvimos fecha de la lista, intentar obtenerla del detalle
                        if (!fechaCompra) {
                            fechaCompra = parseDate(detalleCompra.fecha_actualizacion);
                        }

                        // Verificar items
                        if (!detalleCompra || !Array.isArray(detalleCompra.items) || detalleCompra.items.length === 0) {
                            console.warn(`Compra ID ${compraInfo.id} sin items válidos.`);
                            fetchErrors.push(`Compra ID ${compraInfo.id}: Sin items.`);
                            return { compraInfo, totalCalculado: 0, fecha: fechaCompra };
                        }

                        // 3a. Crear promesas para calcular precio de CADA item
                        const itemPricePromises = detalleCompra.items.map(item => {
                            // *** CAMBIO: Usar item.cantidad_solicitada ***
                            if (item.producto_id == null || typeof item.cantidad_solicitada !== 'number') {
                                console.warn(`Item inválido en Compra ID ${compraInfo.id}:`, item);
                                fetchErrors.push(`Compra ID ${compraInfo.id}: Item ID ${item.id_linea} inválido.`);
                                return Promise.resolve(0); // Precio 0 para item inválido
                            }

                            calculoPromisesPending++;
                            setLoadingStage(`Calculando ${calculoPromisesPending} precios...`);

                            // *** CAMBIO: Usar item.cantidad_solicitada en el body ***
                            // ¡¡VERIFICA SI LA API ESPERA 'quantity' o 'cantidad' EN EL BODY!!
                            const body = JSON.stringify({
                                producto_id: item.producto_id,
                                quantity: item.cantidad_solicitada //VER SI LO TENGO QUE CAMBIAR POR CANTIDAD RECIBIDA
                            });

                            return fetch(`${calcularPrecioApiUrlBase}${item.producto_id}`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: body,
                            })
                            .then(async response => {
                                calculoPromisesPending--;
                                if (!response.ok) {
                                     const errorData = await response.json().catch(() => ({}));
                                     throw new Error(`Calc. Item ${item.producto_id}: HTTP ${response.status} - ${errorData.mensaje || response.statusText}`);
                                }
                                const precioData: PrecioCalculadoResponse = await response.json();
                                if (typeof precioData.precio_total_calculado_ars === 'number' && !isNaN(precioData.precio_total_calculado_ars)) {
                                    return precioData.precio_total_calculado_ars;
                                } else {
                                    console.warn(`Precio calculado inválido para Item ${item.producto_id} en Compra ${compraInfo.id}`);
                                    fetchErrors.push(`Compra ID ${compraInfo.id}, Item ${item.producto_id}: Precio calc. inválido.`);
                                    return 0;
                                }
                            })
                            .catch(err => {
                                calculoPromisesPending--;
                                console.error(`Error calculando precio Item ${item.producto_id} en Compra ${compraInfo.id}:`, err);
                                // Usar err.message que ya incluye el detalle del error HTTP o de red
                                fetchErrors.push(`Compra ID ${compraInfo.id}, Item ${item.producto_id}: ${err.message}`);
                                return 0; // Precio 0 si el cálculo falla
                            });
                        });

                        // 3b. Esperar TODOS los cálculos de precio para ESTA orden y sumarlos
                        const itemPrices = await Promise.all(itemPricePromises);
                        const totalOrden = itemPrices.reduce((sum, price) => sum + price, 0);
                        console.log(`Compra ID ${compraInfo.id} - Total Calculado: ${totalOrden.toFixed(2)}`);
                        return { compraInfo, totalCalculado: totalOrden, fecha: fechaCompra };

                    } catch (jsonError) {
                        console.error(`Error parseando JSON detalle compra ID ${compraInfo.id}:`, jsonError);
                        fetchErrors.push(`Compra ID ${compraInfo.id}: Error parseo detalle.`);
                        return { compraInfo, totalCalculado: 0, fecha: fechaCompra };
                    }
                });

                // 4. Esperar a que se completen TODOS los cálculos de TOTALES de TODAS las órdenes
                setLoadingStage("Finalizando cálculos...");
                const ordenesConTotal = await Promise.all(ordenTotalPromises);

                // 5. Crear los Registros Contables para las compras
                registrosCompras = ordenesConTotal.map(orden => {
                    const { compraInfo, totalCalculado, fecha } = orden;
                    newTotalHaber += totalCalculado;

                    const idDisplay = compraInfo?.id?.toString() ?? 'ERROR_ID';
                    // ¡VERIFICA si 'proveedor_nombre' viene en la LISTA inicial!
                    const proveedorInfo = compraInfo?.proveedor_nombre ? ` (${compraInfo.proveedor_nombre})` : '';
                    const descripcion = `Compra OC-${idDisplay}${proveedorInfo}`; // Cambiado a OC- para Orden Compra

                    return {
                        key: `compra-${idDisplay}-${Math.random()}`,
                        id_display: idDisplay,
                        descripcion: descripcion,
                        debe: null,
                        haber: totalCalculado,
                        fecha_actualizacion: fecha, // Usar la fecha que obtuvimos (lista o detalle)
                    };
                });

            } else {
                console.log("No hay compras en la lista inicial.");
            }

            // --- FIN PROCESAMIENTO COMPRAS ---

            // 6. Procesar Ventas (sin cambios)
            let newTotalDebe = 0;
            const registrosVentas = ventasData.map((venta): RegistroContable => {
                 const ventaTotal = typeof venta.monto_final_con_recargos === 'number' && !isNaN(venta.monto_final_con_recargos) ? venta.monto_final_con_recargos : 0;
                 newTotalDebe += ventaTotal;
                 const idDisplay = venta.venta_id?.toString() ?? 'N/A';
                 const clienteInfo = venta.nombre_razon_social ? ` (${venta.nombre_razon_social})` : '';
                 const descripcion = `Venta F-${idDisplay}${clienteInfo}`;
                 const fechaParaRegistroVenta = parseDate(venta.fecha_registro);
                 return { key: `venta-${idDisplay}-${Math.random()}`, id_display: idDisplay, descripcion: descripcion, debe: ventaTotal, haber: null, fecha_actualizacion: fechaParaRegistroVenta };
             });

            // 7. Combinar, Ordenar y Actualizar Estado Final
            const registrosCombinados: RegistroContable[] = [...registrosVentas, ...registrosCompras];

            registrosCombinados.sort((a, b) => {
                const timeA = a.fecha_actualizacion instanceof Date && !isNaN(a.fecha_actualizacion.getTime()) ? a.fecha_actualizacion.getTime() : -Infinity;
                const timeB = b.fecha_actualizacion instanceof Date && !isNaN(b.fecha_actualizacion.getTime()) ? b.fecha_actualizacion.getTime() : -Infinity;
                return timeB - timeA;
            });

            if (fetchErrors.length > 0) {
                // Mejorar presentación de errores múltiples
                const errorSummary = `Se encontraron ${fetchErrors.length} problemas. Primeros errores: ${fetchErrors.slice(0, 3).join('; ')}... (ver consola para detalles)`;
                setError(errorSummary);
                 console.error("Todos los errores encontrados:", fetchErrors); // Log completo en consola
            }

            setRegistros(registrosCombinados);
            setTotalDebe(newTotalDebe);
            setTotalHaber(newTotalHaber);
            setBalance(newTotalDebe - newTotalHaber);
            
        //eslint-disable-next-line
        } catch (err: any) {
            console.error("Error general no capturado:", err);
            setError(err.message || 'Ocurrió un error inesperado general.');
            setRegistros([]); setTotalDebe(0); setTotalHaber(0); setBalance(0);
        } finally {
            setIsLoading(false);
            setLoadingStage("Listo.");
        }
    }, []); // useCallback sin dependencias externas al componente

    // --- useEffect ---
    useEffect(() => {
        fetchRegistrosContables();
    }, [fetchRegistrosContables]); // Dependencia correcta

    // --- Renderizado (SIN CAMBIOS EN JSX) ---
     return (
        <div className="p-4 md:p-6 bg-gray-50 min-h-screen">
            <div className="max-w-5xl mx-auto bg-white shadow rounded-lg p-4 md:p-6">
                <h1 className="text-xl md:text-2xl font-semibold text-gray-800 mb-6">Libro Mayor / Registros Contables</h1>
                 {isLoading && ( <div className="text-center py-10"> <p className="text-gray-600">{loadingStage}</p> </div> )}
                 {error && !isLoading && (
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-sm">
                        <p className="text-red-700 font-medium">Se encontraron problemas:</p>
                        {/* Mostrar resumen corto, consola tiene el detalle */}
                        <p className="text-red-600 mt-1 whitespace-pre-wrap">{error}</p>
                         <button onClick={fetchRegistrosContables} className="mt-3 px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700">Reintentar</button>
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
                                        !isLoading && registros.length === 0 && !error?.startsWith("Error general") && (
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