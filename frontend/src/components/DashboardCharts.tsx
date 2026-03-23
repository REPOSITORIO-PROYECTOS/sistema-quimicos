"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

type ChartDatum = {
    name: string;
    value: number;
};

type DashboardChartsProps = {
    relacionIngresosData: ChartDatum[];
    relacionPagosData: ChartDatum[];
    showFinanzas: boolean;
    formatCurrency: (value: number) => string;
};

const PIE_COLORS = {
    ingresos: ["#0088FE", "#00C49F"],
    pagos: ["#FFBB28", "#FF8042"],
};

export default function DashboardCharts({
    relacionIngresosData,
    relacionPagosData,
    showFinanzas,
    formatCurrency,
}: DashboardChartsProps) {
    return (
        <div className="grid gap-4 md:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle>Relacion Ingresos (Puerta / Pedidos)</CardTitle>
                    <CardDescription>Del mes actual</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={relacionIngresosData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius={80}
                                label={({ name }) => name}
                            >
                                {relacionIngresosData.map((entry, index) => (
                                    <Cell
                                        key={`cell-ing-${index}`}
                                        fill={PIE_COLORS.ingresos[index % PIE_COLORS.ingresos.length]}
                                    />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => (showFinanzas ? formatCurrency(value) : "***")} />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>Relacion Ingresos (Efectivo / Otros)</CardTitle>
                    <CardDescription>Del mes actual</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={relacionPagosData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius={80}
                                label={({ name }) => name}
                            >
                                {relacionPagosData.map((entry, index) => (
                                    <Cell
                                        key={`cell-pagos-${index}`}
                                        fill={PIE_COLORS.pagos[index % PIE_COLORS.pagos.length]}
                                    />
                                ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => (showFinanzas ? formatCurrency(value) : "***")} />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
}
