"use client";

import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState, useMemo, useCallback } from "react";
import { DollarSign, TrendingUp, ShoppingCart, Download, AlertTriangle } from 'lucide-react';

const DashboardCharts = dynamic(() => import("@/components/DashboardCharts"), {
    ssr: false,
    loading: () => <div className="h-[300px] w-full animate-pulse rounded-md bg-slate-100" />,
});

const DASHBOARD_CACHE_KEY_PREFIX = "dashboard-kpis:";
const DASHBOARD_CACHE_TTL_MS = 2 * 60 * 1000;

interface DashboardData {
    primera_fila: {
        ingreso_puerta_hoy: number;
        ingreso_pedido_hoy: number;
        pedidos_pendientes_manana: number;
        kgs_manana: number;
        deuda_proveedores: number;
        compras_por_recibir: number;
        // Desglose de ventas de puerta y pedidos por forma de pago
        puerta_efectivo?: number;
        puerta_transferencia?: number;
        puerta_factura?: number;
        pedido_efectivo?: number;
        pedido_transferencia?: number;
        pedido_factura?: number;
        // Unidades por forma de pago
        puerta_efectivo_unidades?: number;
        puerta_transferencia_unidades?: number;
        puerta_factura_unidades?: number;
        pedido_efectivo_unidades?: number;
        pedido_transferencia_unidades?: number;
        pedido_factura_unidades?: number;
    };
    segunda_fila: {
        ventas_mes: number;
        costos_variables_mes: number;
        ganancia_bruta_mes: number;
    };
    tercera_fila: {
        relacion_ingresos: { puerta: number; pedidos: number; };
        relacion_pagos: { efectivo: number; otros: number; };
    };
}

const formatCurrency = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);

const getISODate = (date: Date): string => {
    const offset = date.getTimezoneOffset();
    const adjustedDate = new Date(date.getTime() - (offset * 60 * 1000));
    return adjustedDate.toISOString().split('T')[0];
};

// Intenta obtener el rol del token JWT (varias posibles claves de claim)
const getUserRoleFromToken = (token: string | null): string | null => {
    if (!token) return null;
    try {
        const parts = token.split('.');
        if (parts.length < 2) return null;
        // Decodificar payload base64url
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(escape(window.atob(base64)));
        const payload = JSON.parse(jsonPayload);
        return payload.role || payload.rol || payload.tipo_usuario || payload.user_type || (Array.isArray(payload.roles) ? payload.roles[0] : null) || null;
    } catch {
        return null;
    }
};

export default function DashboardPage() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<string>(getISODate(new Date()));
    const [isDownloading, setIsDownloading] = useState(false);
    const [showPuertaMontos, setShowPuertaMontos] = useState(false);
    const [showPedidoMontos, setShowPedidoMontos] = useState(false);
    const [showFinanzas, setShowFinanzas] = useState(false); // Cambiado: ahora oculto por defecto
    // Unidades por forma de pago
    const puertaUnidades = {
        efectivo: data ? (data.primera_fila.puerta_efectivo_unidades ?? 0) : 0,
        transferencia: data ? (data.primera_fila.puerta_transferencia_unidades ?? 0) : 0,
        factura: data ? (data.primera_fila.puerta_factura_unidades ?? 0) : 0,
    };
    const pedidoUnidades = {
        efectivo: data ? (data.primera_fila.pedido_efectivo_unidades ?? 0) : 0,
        transferencia: data ? (data.primera_fila.pedido_transferencia_unidades ?? 0) : 0,
        factura: data ? (data.primera_fila.pedido_factura_unidades ?? 0) : 0,
    };
    const token = typeof window !== 'undefined' ? localStorage.getItem("authToken") : null;

    const [userRole, setUserRole] = useState<string | null>(null);

    const readCachedDashboard = useCallback((fecha: string): DashboardData | null => {
        if (typeof window === "undefined") return null;
        try {
            const raw = sessionStorage.getItem(`${DASHBOARD_CACHE_KEY_PREFIX}${fecha}`);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as { timestamp?: number; data?: DashboardData };
            if (!parsed?.timestamp || !parsed?.data) return null;
            if (Date.now() - parsed.timestamp > DASHBOARD_CACHE_TTL_MS) {
                sessionStorage.removeItem(`${DASHBOARD_CACHE_KEY_PREFIX}${fecha}`);
                return null;
            }
            return parsed.data;
        } catch {
            return null;
        }
    }, []);

    const writeCachedDashboard = useCallback((fecha: string, payload: DashboardData) => {
        if (typeof window === "undefined") return;
        try {
            sessionStorage.setItem(
                `${DASHBOARD_CACHE_KEY_PREFIX}${fecha}`,
                JSON.stringify({ timestamp: Date.now(), data: payload })
            );
        } catch {
            // Ignorar errores de cuota de almacenamiento.
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const role = getUserRoleFromToken(localStorage.getItem('authToken'));
        // Normalizar a minúsculas para comparaciones consistentes ('VENTAS_PEDIDOS' -> 'ventas_pedidos')
        setUserRole(role ? String(role).toLowerCase() : null);
    }, [token]);

    const fetchDashboardData = useCallback(async (fecha: string) => {
        setIsLoading(true);
        setError(null);

        const cached = readCachedDashboard(fecha);
        if (cached) {
            setData(cached);
            setIsLoading(false);
        }

        if (!token) {
            setError("No autenticado. Por favor, inicie sesión.");
            setIsLoading(false);
            return;
        }
        try {
            // Usar endpoint completo para todos
            const base = `https://quimex.sistemataup.online/api/reportes`;
            const url = `${base}/dashboard-kpis?fecha=${fecha}`;
            const response = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
            if (!response.ok) {
                if (response.status === 401 && typeof window !== "undefined") {
                    window.dispatchEvent(new CustomEvent("auth:expired", { detail: { message: "Sesion expirada" } }));
                }
                const errorData = await response.json().catch(() => ({ error: "Error de servidor" }));
                // Si el backend responde 403 y el usuario es VENTAS_PEDIDOS, ofrecer un fallback mínimo
                if (response.status === 403 && userRole === 'ventas_pedidos') {
                    // Construir un objeto mínimo seguro para que la UI muestre las 3 métricas esenciales
                    const minimal: DashboardData = {
                        primera_fila: {
                            ingreso_puerta_hoy: 0,
                            ingreso_pedido_hoy: 0,
                            pedidos_pendientes_manana: 0,
                            kgs_manana: 0,
                            deuda_proveedores: 0,
                            compras_por_recibir: 0,
                        },
                        segunda_fila: {
                            ventas_mes: 0,
                            costos_variables_mes: 0,
                            ganancia_bruta_mes: 0,
                        },
                        tercera_fila: {
                            relacion_ingresos: { puerta: 0, pedidos: 0 },
                            relacion_pagos: { efectivo: 0, otros: 0 },
                        },
                    };
                    setData(minimal);
                    writeCachedDashboard(fecha, minimal);
                    setError(errorData.message || errorData.error || "No autorizado para KPIs avanzados. Mostrando métricas esenciales si están disponibles.");
                    setIsLoading(false);
                    return;
                }

                throw new Error(errorData.error || "Error al cargar los datos del dashboard.");
            }

            const kpiData: DashboardData = await response.json();
            setData(kpiData);
            writeCachedDashboard(fecha, kpiData);
        } catch (err) {
            if (err instanceof Error) setError(err.message);
            else setError("Ocurrió un error desconocido.");
        } finally {
            setIsLoading(false);
        }
    }, [token, userRole, readCachedDashboard, writeCachedDashboard]);

    useEffect(() => {
        fetchDashboardData(selectedDate);
    }, [selectedDate, fetchDashboardData]);

    const handleDownloadResumen = async () => {
        if (!token) { alert("No autenticado."); return; }
        // Seguridad adicional: usuarios de pedidos no pueden descargar el resumen
        if (userRole === 'ventas_pedidos') { alert('No tiene permiso para descargar el resumen del mes.'); return; }
        setIsDownloading(true);
        try {
            // Construir fechas base en zona horaria de Argentina
            const [anio, mes] = selectedDate.split('-');
            // Primer día del mes en Argentina
            const primerDiaMesStr = `${anio}-${mes}-01T00:00:00-03:00`;
            const primerDiaMesDate = new Date(primerDiaMesStr);
            // Último día del mes en Argentina
            const ultimoDia = new Date(Number(anio), Number(mes), 0).getDate();
            const ultimoDiaMesStr = `${anio}-${mes}-${String(ultimoDia).padStart(2, '0')}T00:00:00-03:00`;
            const ultimoDiaMesDate = new Date(ultimoDiaMesStr);
            // Formatear a YYYY-MM-DD
            const toISODate = (date: Date) => date.toISOString().slice(0, 10);
            const primerDiaMes = toISODate(primerDiaMesDate);
            const ultimoDiaMes = toISODate(ultimoDiaMesDate);
            const url = `https://quimex.sistemataup.online/api/reportes/movimientos-excel?fecha_desde=${primerDiaMes}&fecha_hasta=${ultimoDiaMes}`;

            const response = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
            if (!response.ok) throw new Error((await response.json()).error || `Error ${response.status}`);

            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `Reporte_Maestro_${primerDiaMes}_a_${ultimoDiaMes}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(downloadUrl);
        } catch (err) {
            if (err instanceof Error) alert(`Error al descargar el resumen: ${err.message}`);
        } finally {
            setIsDownloading(false);
        }
    };

    const relacionIngresosDataRaw = useMemo(() => {
        if (!data) return [] as { name: string; value: number }[];
        return [
            { name: 'Ingresos Puerta', value: data.tercera_fila.relacion_ingresos.puerta },
            { name: 'Ingresos Pedidos', value: data.tercera_fila.relacion_ingresos.pedidos },
        ].filter(item => item.value > 0);
    }, [data]);

    const relacionIngresosData = useMemo(() => {
        if (!showFinanzas) {
            // Enmascara valores reales para no revelar proporciones
            return relacionIngresosDataRaw.map(d => ({ ...d, value: 1 }));
        }
        return relacionIngresosDataRaw;
    }, [relacionIngresosDataRaw, showFinanzas]);

    const relacionPagosDataRaw = useMemo(() => {
        if (!data) return [] as { name: string; value: number }[];
        return [
            { name: 'Efectivo', value: data.tercera_fila.relacion_pagos.efectivo },
            { name: 'Transferencia/Factura', value: data.tercera_fila.relacion_pagos.otros },
        ].filter(item => item.value > 0);
    }, [data]);

    const relacionPagosData = useMemo(() => {
        if (!showFinanzas) {
            return relacionPagosDataRaw.map(d => ({ ...d, value: 1 }));
        }
        return relacionPagosDataRaw;
    }, [relacionPagosDataRaw, showFinanzas]);

    const hoy = getISODate(new Date());
    const ayer = getISODate(new Date(Date.now() - 86400000));
    let tituloDia = `(${new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-AR')})`;
    if (selectedDate === hoy) tituloDia = '(Hoy)';
    if (selectedDate === ayer) tituloDia = '(Ayer)';

    if (isLoading && !data) return <div className="p-8 text-center text-lg font-medium">Cargando dashboard...</div>;

    return (
        <div className={`flex-1 space-y-6 p-4 md:p-8 transition-opacity duration-300 ${isLoading ? 'opacity-50' : 'opacity-100'}`}>
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-b pb-4">
                <h2 className="text-3xl font-bold tracking-tight">Dashboard General</h2>
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                    {/* Para usuarios 'ventas_pedidos' mostramos solo las métricas esenciales */}
                    {userRole && userRole !== 'ventas_pedidos' && (
                        <>
                            <button
                                type="button"
                                onClick={() => setShowFinanzas(v => !v)}
                                className="w-full sm:w-auto bg-indigo-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-indigo-700 text-sm"
                            >
                                {showFinanzas ? 'Ocultar Ventas/Costos/Ganancia' : 'Mostrar Ventas/Costos/Ganancia'}
                            </button>
                            <div className="flex items-center gap-2">
                                <label htmlFor="dashboard-date" className="font-medium text-sm">Ver KPIs del día:</label>
                                <input
                                    id="dashboard-date"
                                    type="date"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    disabled={isLoading}
                                />
                            </div>
                            <button
                                onClick={handleDownloadResumen}
                                disabled={isDownloading || isLoading}
                                className="w-full sm:w-auto bg-green-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-green-700 disabled:bg-gray-400 flex items-center justify-center gap-2 transition-colors"
                            >
                                <Download className="h-4 w-4" />
                                {isDownloading ? 'Generando...' : 'Resumen del Mes'}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {error && (
                <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5" />
                    <p><span className="font-bold">Error:</span> {error}</p>
                </div>
            )}

            {!data && !isLoading && (
                <div className="p-8 text-center text-gray-500">No se encontraron datos para mostrar.</div>
            )}

            {data && (
                <>
                    {userRole === 'ventas_pedidos' ? (
                        <div className="grid gap-4 md:grid-cols-3">
                            <Card>
                                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Ingreso Puerta {tituloDia}</CardTitle></CardHeader>
                                <CardContent>
                                    <p className="text-2xl font-bold">{formatCurrency(data.primera_fila.ingreso_puerta_hoy)}</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Ingreso Pedidos {tituloDia}</CardTitle></CardHeader>
                                <CardContent>
                                    <p className="text-2xl font-bold">{formatCurrency(data.primera_fila.ingreso_pedido_hoy)}</p>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Kgs a Entregar (Mañana)</CardTitle></CardHeader>
                                <CardContent>
                                    <p className="text-2xl font-bold">{data.primera_fila.kgs_manana.toFixed(2)} Kg</p>
                                </CardContent>
                            </Card>
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                            <Card>
                                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Ingreso Puerta {tituloDia}</CardTitle></CardHeader>
                                <CardContent>
                                    <p className="text-2xl font-bold">{formatCurrency(data.primera_fila.ingreso_puerta_hoy)}</p>
                                    <div className="mt-2 text-xs text-gray-600">
                                        <div>Efectivo: <b>{formatCurrency(data.primera_fila.puerta_efectivo ?? 0)}</b></div>
                                        <div>Transferencia: <b>{formatCurrency(data.primera_fila.puerta_transferencia ?? 0)}</b></div>
                                        <div>Factura: <b>{formatCurrency(data.primera_fila.puerta_factura ?? 0)}</b></div>
                                    </div>
                                    <button
                                        className="mt-2 px-3 py-1 bg-blue-100 text-blue-800 rounded text-xs hover:bg-blue-200"
                                        onClick={() => setShowPuertaMontos((v) => !v)}
                                    >
                                        {showPuertaMontos ? 'Ocultar montos' : 'Ver montos detallados'}
                                    </button>
                                    {showPuertaMontos && (
                                        <div className="mt-2 p-2 bg-blue-50 rounded text-sm space-y-1">
                                            <div>
                                                <b>Efectivo:</b> <span style={{ color: '#16a34a', fontWeight: 'bold' }}>{formatCurrency(data.primera_fila.puerta_efectivo ?? 0)}</span>
                                                <span className="ml-2 text-xs text-gray-700">({puertaUnidades.efectivo} ventas)</span>
                                            </div>
                                            <div>
                                                <b>Transferencia:</b> <span style={{ color: '#2563eb', fontWeight: 'bold' }}>{formatCurrency(data.primera_fila.puerta_transferencia ?? 0)}</span>
                                                <span className="ml-2 text-xs text-gray-700">({puertaUnidades.transferencia} ventas)</span>
                                            </div>
                                            <div>
                                                <b>Factura:</b> <span style={{ color: '#f59e42', fontWeight: 'bold' }}>{formatCurrency(data.primera_fila.puerta_factura ?? 0)}</span>
                                                <span className="ml-2 text-xs text-gray-700">({puertaUnidades.factura} ventas)</span>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Ingreso Pedidos {tituloDia}</CardTitle></CardHeader>
                                <CardContent>
                                    <p className="text-2xl font-bold">{formatCurrency(data.primera_fila.ingreso_pedido_hoy)}</p>
                                    <div className="mt-2 text-xs text-gray-600">
                                        <div>Efectivo: <b>{formatCurrency(data.primera_fila.pedido_efectivo ?? 0)}</b></div>
                                        <div>Transferencia: <b>{formatCurrency(data.primera_fila.pedido_transferencia ?? 0)}</b></div>
                                        <div>Factura: <b>{formatCurrency(data.primera_fila.pedido_factura ?? 0)}</b></div>
                                    </div>
                                    <button
                                        className="mt-2 px-3 py-1 bg-blue-100 text-blue-800 rounded text-xs hover:bg-blue-200"
                                        onClick={() => setShowPedidoMontos((v) => !v)}
                                    >
                                        {showPedidoMontos ? 'Ocultar montos' : 'Ver montos detallados'}
                                    </button>
                                    {showPedidoMontos && (
                                        <div className="mt-2 p-2 bg-blue-50 rounded text-sm space-y-1">
                                            <div>
                                                <b>Efectivo:</b> <span style={{ color: '#16a34a', fontWeight: 'bold' }}>{formatCurrency(data.primera_fila.pedido_efectivo ?? 0)}</span>
                                                <span className="ml-2 text-xs text-gray-700">({pedidoUnidades.efectivo} ventas)</span>
                                            </div>
                                            <div>
                                                <b>Transferencia:</b> <span style={{ color: '#2563eb', fontWeight: 'bold' }}>{formatCurrency(data.primera_fila.pedido_transferencia ?? 0)}</span>
                                                <span className="ml-2 text-xs text-gray-700">({pedidoUnidades.transferencia} ventas)</span>
                                            </div>
                                            <div>
                                                <b>Factura:</b> <span style={{ color: '#f59e42', fontWeight: 'bold' }}>{formatCurrency(data.primera_fila.pedido_factura ?? 0)}</span>
                                                <span className="ml-2 text-xs text-gray-700">({pedidoUnidades.factura} ventas)</span>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-medium">Pedidos Pendientes para Entregar Mañana</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-2xl font-bold">{data.primera_fila.pedidos_pendientes_manana}</p>
                                </CardContent>
                            </Card>
                            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Kgs a Entregar (Mañana)</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{data.primera_fila.kgs_manana.toFixed(2)} Kg</p></CardContent></Card>
                            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Deuda a Proveedores</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-orange-600">{formatCurrency(data.primera_fila.deuda_proveedores)}</p></CardContent></Card>
                            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Compras por Recibir</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{formatCurrency(data.primera_fila.compras_por_recibir)}</p></CardContent></Card>
                        </div>
                    )}

                    <div className="grid gap-4 md:grid-cols-3">
                        <Card>
                            <CardHeader className="pb-2 flex flex-row items-center justify-between">
                                <CardTitle className="text-sm font-medium">Ventas del Mes</CardTitle>
                                <DollarSign className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <p className="text-2xl font-bold">{showFinanzas ? formatCurrency(data.segunda_fila.ventas_mes) : '***'}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2 flex flex-row items-center justify-between">
                                <CardTitle className="text-sm font-medium">Costo Mercadería Vendida</CardTitle>
                                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <p className="text-2xl font-bold">{showFinanzas ? formatCurrency(data.segunda_fila.costos_variables_mes) : '***'}</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2 flex flex-row items-center justify-between">
                                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <p className={`text-2xl font-bold ${data.segunda_fila.ganancia_bruta_mes < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    {showFinanzas ? formatCurrency(data.segunda_fila.ganancia_bruta_mes) : '***'}
                                </p>
                                {showFinanzas && <p className="text-xs text-muted-foreground">Ventas - Costo de Mercadería</p>}
                            </CardContent>
                        </Card>
                    </div>

                    <DashboardCharts
                        relacionIngresosData={relacionIngresosData}
                        relacionPagosData={relacionPagosData}
                        showFinanzas={showFinanzas}
                        formatCurrency={formatCurrency}
                    />
                </>
            )}
        </div>
    );
}