"use client";

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
    ArrowUpIcon,
    CalendarIcon,
    CheckCircle2,
    Package,
    Truck,
} from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import Link from "next/link";

// Tipos de datos
type OrderStatus = "entregado" | "en_camino" | "pendiente" | "cancelado";

type Order = {
    id: string;
    cliente: string;
    fecha: string;
    direccion: string;
    productos: number;
    total: number;
    estado: OrderStatus;
};

// Datos de ejemplo
const ordersData: Order[] = [
    {
        id: "ORD-001",
        cliente: "Carlos Rodríguez",
        fecha: "2023-05-15",
        direccion: "Av. Principal 123, Ciudad de México",
        productos: 5,
        total: 1250.75,
        estado: "entregado",
    },
    {
        id: "ORD-002",
        cliente: "María González",
        fecha: "2023-05-16",
        direccion: "Calle Secundaria 456, Guadalajara",
        productos: 3,
        total: 850.5,
        estado: "en_camino",
    },
    {
        id: "ORD-003",
        cliente: "Juan Pérez",
        fecha: "2023-05-16",
        direccion: "Blvd. Central 789, Monterrey",
        productos: 7,
        total: 1750.25,
        estado: "pendiente",
    },
    {
        id: "ORD-004",
        cliente: "Ana Martínez",
        fecha: "2023-05-17",
        direccion: "Calle Norte 234, Puebla",
        productos: 2,
        total: 450.0,
        estado: "entregado",
    },
    {
        id: "ORD-005",
        cliente: "Roberto Sánchez",
        fecha: "2023-05-17",
        direccion: "Av. Sur 567, Tijuana",
        productos: 4,
        total: 975.3,
        estado: "cancelado",
    },
    {
        id: "ORD-006",
        cliente: "Laura Díaz",
        fecha: "2023-05-18",
        direccion: "Calle Oriente 890, Mérida",
        productos: 6,
        total: 1450.8,
        estado: "en_camino",
    },
    {
        id: "ORD-007",
        cliente: "Miguel Torres",
        fecha: "2023-05-18",
        direccion: "Av. Poniente 123, Cancún",
        productos: 3,
        total: 750.25,
        estado: "pendiente",
    },
    {
        id: "ORD-008",
        cliente: "Sofía Ramírez",
        fecha: "2023-05-19",
        direccion: "Blvd. Norte 456, Acapulco",
        productos: 8,
        total: 1850.0,
        estado: "entregado",
    },
];

// Componente para mostrar el estado de la orden con un color específico
function OrderStatusBadge({ status }: { status: OrderStatus }) {
    const statusConfig = {
        entregado: { label: "Entregado", className: "bg-green-600 text-white" },
        en_camino: { label: "En camino", className: "bg-blue-600 text-white" },
        pendiente: {
            label: "Pendiente",
            className: "bg-yellow-600 text-white",
        },
        cancelado: { label: "Cancelado", className: "bg-red-600 text-white" },
    };

    const config = statusConfig[status];

    return <Badge className={config.className}>{config.label}</Badge>;
}

export default function Dashboard() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Simular carga de datos
    useEffect(() => {
        const timer = setTimeout(() => {
            setOrders(ordersData);
            setIsLoading(false);
        }, 1000);

        return () => clearTimeout(timer);
    }, []);

    // Calcular estadísticas
    const stats = {
        totalOrders: orders.length,
        delivered: orders.filter((order) => order.estado === "entregado")
            .length,
        inTransit: orders.filter((order) => order.estado === "en_camino")
            .length,
        pending: orders.filter((order) => order.estado === "pendiente").length,
        totalRevenue: orders.reduce((sum, order) => sum + order.total, 0),
    };

    // Formatear fecha
    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return new Intl.DateTimeFormat("es-MX", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        }).format(date);
    };

    return (
        <div className="flex-1 space-y-4 p-4 md:p-8">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-9">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        Descargar
                    </Button>
                    <Link href="/inventario">
                        <Button className="bg-indigo-800 hover:bg-indigo-700 h-9">
                            <Package className="mr-2 h-4 w-4" />
                            Inventario
                        </Button>
                    </Link>
                </div>
            </div>

            <Tabs defaultValue="overview" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="overview">Resumen</TabsTrigger>
                    <TabsTrigger value="analytics">Analítica</TabsTrigger>
                    <TabsTrigger value="reports">Reportes</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                    {/* Tarjetas de estadísticas */}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">
                                    Total de Órdenes
                                </CardTitle>
                                <Package className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {stats.totalOrders}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    +20.1% respecto al mes pasado
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">
                                    Ingresos Totales
                                </CardTitle>
                                <ArrowUpIcon className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    $
                                    {stats.totalRevenue.toLocaleString(
                                        "es-MX",
                                        {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 2,
                                        }
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    +15% respecto al mes pasado
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">
                                    Órdenes Entregadas
                                </CardTitle>
                                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {stats.delivered}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {(
                                        (stats.delivered / stats.totalOrders) *
                                        100
                                    ).toFixed(1)}
                                    % del total
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">
                                    En Tránsito
                                </CardTitle>
                                <Truck className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {stats.inTransit}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {(
                                        (stats.inTransit / stats.totalOrders) *
                                        100
                                    ).toFixed(1)}
                                    % del total
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Tabla de últimas órdenes */}
                    <div className="grid gap-4 md:grid-cols-1">
                        <Card className="col-span-1">
                            <CardHeader>
                                <CardTitle>
                                    Últimas Órdenes de Entrega
                                </CardTitle>
                                <CardDescription>
                                    Mostrando las {orders.length} órdenes más
                                    recientes
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="rounded-md border-2 border-indigo-800 overflow-hidden">
                                    <Table>
                                        <TableHeader className="bg-indigo-800">
                                            <TableRow className="hover:bg-transparent border-b-0">
                                                <TableHead className="text-white font-medium">
                                                    ID
                                                </TableHead>
                                                <TableHead className="text-white font-medium">
                                                    Cliente
                                                </TableHead>
                                                <TableHead className="text-white font-medium">
                                                    Fecha
                                                </TableHead>
                                                <TableHead className="text-white font-medium">
                                                    Productos
                                                </TableHead>
                                                <TableHead className="text-white font-medium">
                                                    Total
                                                </TableHead>
                                                <TableHead className="text-white font-medium">
                                                    Estado
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {isLoading ? (
                                                <TableRow>
                                                    <TableCell
                                                        colSpan={6}
                                                        className="h-24 text-center"
                                                    >
                                                        Cargando órdenes...
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                orders.map((order, index) => (
                                                    <TableRow
                                                        key={order.id}
                                                        className={cn(
                                                            "border-b border-indigo-100",
                                                            index % 2 === 0
                                                                ? "bg-white"
                                                                : "bg-indigo-50"
                                                        )}
                                                    >
                                                        <TableCell className="font-medium">
                                                            {order.id}
                                                        </TableCell>
                                                        <TableCell>
                                                            {order.cliente}
                                                        </TableCell>
                                                        <TableCell>
                                                            {formatDate(
                                                                order.fecha
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            {order.productos}
                                                        </TableCell>
                                                        <TableCell>
                                                            $
                                                            {order.total.toLocaleString(
                                                                "es-MX",
                                                                {
                                                                    minimumFractionDigits: 2,
                                                                    maximumFractionDigits: 2,
                                                                }
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            <OrderStatusBadge
                                                                status={
                                                                    order.estado
                                                                }
                                                            />
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="analytics" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Analítica</CardTitle>
                            <CardDescription>
                                Visualización de datos y métricas de rendimiento
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="h-[400px] flex items-center justify-center">
                            <p className="text-muted-foreground">
                                Contenido de analítica en desarrollo
                            </p>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="reports" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Reportes</CardTitle>
                            <CardDescription>
                                Generación y visualización de reportes
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="h-[400px] flex items-center justify-center">
                            <p className="text-muted-foreground">
                                Contenido de reportes en desarrollo
                            </p>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
