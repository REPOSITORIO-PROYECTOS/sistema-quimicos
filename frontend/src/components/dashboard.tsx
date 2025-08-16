"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useEffect, useState, useMemo, useCallback } from "react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { DollarSign, TrendingUp, ShoppingCart, Download, AlertTriangle } from 'lucide-react';

interface DashboardData {
    primera_fila: {
        ingreso_puerta_hoy: number;
        ingreso_pedido_hoy: number;
        ingreso_pedido_manana: number;
        kgs_manana: number;
        deuda_proveedores: number;
        compras_por_recibir: number;
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
const PIE_COLORS = { ingresos: ['#0088FE', '#00C49F'], pagos: ['#FFBB28', '#FF8042'] };

const getISODate = (date: Date): string => {
    const offset = date.getTimezoneOffset();
    const adjustedDate = new Date(date.getTime() - (offset*60*1000));
    return adjustedDate.toISOString().split('T')[0];
};

export default function DashboardPage() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<string>(getISODate(new Date()));
    const [isDownloading, setIsDownloading] = useState(false);
    const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;

    const fetchDashboardData = useCallback(async (fecha: string) => {
        setIsLoading(true);
        setError(null);
        if (!token) {
            setError("No autenticado. Por favor, inicie sesión.");
            setIsLoading(false);
            return;
        }
        try {
            const url = `https://quimex.sistemataup.online/reportes/dashboard-kpis?fecha=${fecha}`;
            const response = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({error: "Error de servidor"}));
                throw new Error(errorData.error || "Error al cargar los datos del dashboard.");
            }
            const kpiData: DashboardData = await response.json();
            setData(kpiData);
        } catch (err) {
            if (err instanceof Error) setError(err.message);
            else setError("Ocurrió un error desconocido.");
        } finally {
            setIsLoading(false);
        }
    }, [token]);

    useEffect(() => {
        fetchDashboardData(selectedDate);
    }, [selectedDate, fetchDashboardData]);
    
    const handleDownloadResumen = async () => {
        if (!token) { alert("No autenticado."); return; }
        setIsDownloading(true);
        try {
            const fecha = new Date(selectedDate + 'T00:00:00');
            const primerDiaMes = getISODate(new Date(fecha.getFullYear(), fecha.getMonth(), 1));
            const ultimoDiaMes = getISODate(new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0));
            const url = `https://quimex.sistemataup.online/reportes/movimientos-excel?fecha_desde=${primerDiaMes}&fecha_hasta=${ultimoDiaMes}`;
            
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
    
    const relacionIngresosData = useMemo(() => {
        if (!data) return [];
        return [
            { name: 'Ingresos Puerta', value: data.tercera_fila.relacion_ingresos.puerta },
            { name: 'Ingresos Pedidos', value: data.tercera_fila.relacion_ingresos.pedidos },
        ].filter(item => item.value > 0);
    }, [data]);

    const relacionPagosData = useMemo(() => {
        if (!data) return [];
        return [
            { name: 'Efectivo', value: data.tercera_fila.relacion_pagos.efectivo },
            { name: 'Transferencia/Factura', value: data.tercera_fila.relacion_pagos.otros },
        ].filter(item => item.value > 0);
    }, [data]);

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
                </div>
            </div>

            {error && (
                <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5"/>
                    <p><span className="font-bold">Error:</span> {error}</p>
                </div>
            )}
            
            {!data && !isLoading && (
                 <div className="p-8 text-center text-gray-500">No se encontraron datos para mostrar.</div>
            )}

            {data && (
            <>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                    <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Ingreso Puerta {tituloDia}</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{formatCurrency(data.primera_fila.ingreso_puerta_hoy)}</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Ingreso Pedidos {tituloDia}</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{formatCurrency(data.primera_fila.ingreso_pedido_hoy)}</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Pedidos a Cobrar (Mañana)</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{formatCurrency(data.primera_fila.ingreso_pedido_manana)}</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Kgs a Entregar (Mañana)</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{data.primera_fila.kgs_manana.toFixed(2)} Kg</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Deuda a Proveedores</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-orange-600">{formatCurrency(data.primera_fila.deuda_proveedores)}</p></CardContent></Card>
                    <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Compras por Recibir</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{formatCurrency(data.primera_fila.compras_por_recibir)}</p></CardContent></Card>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    <Card><CardHeader className="pb-2 flex flex-row items-center justify-between"><CardTitle className="text-sm font-medium">Ventas del Mes</CardTitle><DollarSign className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><p className="text-2xl font-bold">{formatCurrency(data.segunda_fila.ventas_mes)}</p></CardContent></Card>
                    <Card><CardHeader className="pb-2 flex flex-row items-center justify-between"><CardTitle className="text-sm font-medium">Costo Mercadería Vendida</CardTitle><ShoppingCart className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><p className="text-2xl font-bold">{formatCurrency(data.segunda_fila.costos_variables_mes)}</p></CardContent></Card>
                    <Card><CardHeader className="pb-2 flex flex-row items-center justify-between"><CardTitle className="text-sm font-medium">Ganancia Bruta del Mes</CardTitle><TrendingUp className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><p className={`text-2xl font-bold ${data.segunda_fila.ganancia_bruta_mes < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(data.segunda_fila.ganancia_bruta_mes)}</p><p className="text-xs text-muted-foreground">Ventas - Costo de Mercadería</p></CardContent></Card>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <Card>
                        <CardHeader><CardTitle>Relación Ingresos (Puerta / Pedidos)</CardTitle><CardDescription>Del mes actual</CardDescription></CardHeader>
                        <CardContent className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={relacionIngresosData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                                        {relacionIngresosData.map((entry, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS.ingresos[index % PIE_COLORS.ingresos.length]} />)}
                                    </Pie>
                                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader><CardTitle>Relación Ingresos (Efectivo / Otros)</CardTitle><CardDescription>Del mes actual</CardDescription></CardHeader>
                        <CardContent className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={relacionPagosData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                                        {relacionPagosData.map((entry, index) => <Cell key={`cell-${index}`} fill={PIE_COLORS.pagos[index % PIE_COLORS.pagos.length]} />)}
                                    </Pie>
                                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </div>
            </>
            )}
        </div>
    );
}