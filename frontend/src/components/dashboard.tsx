"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useEffect, useState, useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { DollarSign, TrendingUp, ShoppingCart } from 'lucide-react';

// Interfaz que coincide con la respuesta final del endpoint del backend
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

// Helper para formatear moneda
const formatCurrency = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);

const PIE_COLORS = {
    ingresos: ['#0088FE', '#00C49F'],
    pagos: ['#FFBB28', '#FF8042'],
};

export default function DashboardPage() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchDashboardData = async () => {
            setIsLoading(true);
            setError(null);
            const token = localStorage.getItem("token");
            if (!token) {
                setError("No autenticado. Por favor, inicie sesión.");
                setIsLoading(false);
                return;
            }
            try {
                const response = await fetch("https://quimex.sistemataup.online/dashboard/kpis", {
                    headers: { "Authorization": `Bearer ${token}` }
                });
                if (!response.ok) {
                    const errorData = await response.json();
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
        };
        fetchDashboardData();
    }, []);

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

    if (isLoading) return <div className="p-8 text-center">Cargando dashboard...</div>;
    if (error) return <div className="p-8 text-center text-red-500">Error: {error}</div>;
    if (!data) return <div className="p-8 text-center">No se encontraron datos para mostrar.</div>;
    
    return (
        <div className="flex-1 space-y-6 p-4 md:p-8">
            <h2 className="text-3xl font-bold tracking-tight">Dashboard General</h2>
            
            {/* --- Primera Fila --- */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Ingreso Puerta (Hoy)</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{formatCurrency(data.primera_fila.ingreso_puerta_hoy)}</p></CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Ingreso Pedidos (Hoy)</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{formatCurrency(data.primera_fila.ingreso_pedido_hoy)}</p></CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Ingreso Pedidos (Mañana)</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{formatCurrency(data.primera_fila.ingreso_pedido_manana)}</p></CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Kgs a Entregar (Mañana)</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{data.primera_fila.kgs_manana.toFixed(2)} Kg</p></CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Deuda a Proveedores</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-orange-600">{formatCurrency(data.primera_fila.deuda_proveedores)}</p></CardContent></Card>
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Compras por Recibir</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{formatCurrency(data.primera_fila.compras_por_recibir)}</p></CardContent></Card>
            </div>

            {/* --- Segunda Fila --- */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card><CardHeader className="pb-2 flex flex-row items-center justify-between"><CardTitle className="text-sm font-medium">Ventas del Mes</CardTitle><DollarSign className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><p className="text-2xl font-bold">{formatCurrency(data.segunda_fila.ventas_mes)}</p></CardContent></Card>
                <Card><CardHeader className="pb-2 flex flex-row items-center justify-between"><CardTitle className="text-sm font-medium">Costo Mercadería Vendida</CardTitle><ShoppingCart className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><p className="text-2xl font-bold">{formatCurrency(data.segunda_fila.costos_variables_mes)}</p></CardContent></Card>
                <Card><CardHeader className="pb-2 flex flex-row items-center justify-between"><CardTitle className="text-sm font-medium">Ganancia Bruta del Mes</CardTitle><TrendingUp className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><p className={`text-2xl font-bold ${data.segunda_fila.ganancia_bruta_mes < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(data.segunda_fila.ganancia_bruta_mes)}</p><p className="text-xs text-muted-foreground">Ventas - Costo de Mercadería</p></CardContent></Card>
            </div>

            {/* --- Tercera Fila --- */}
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
        </div>
    );
}