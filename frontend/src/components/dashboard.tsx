"use client";

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, ShoppingCart, TrendingUp } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import {
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    BarChart, 
    Bar,      
} from "recharts";

// --- INICIO: Definición de Tipos ---

// Tipos INTERNOS del Dashboard para Ventas (después de transformación)
type VentaTipo = "puerta" | "pedido";
interface VentaDetalle {
    id: string;
    productoNombre: string;
    cantidad: number;
    precioVentaUnitario: number;
    costoUnitario: number;
}
interface Venta { // Este es el tipo que usan los useMemo y gráficos para ventas
    id: string;
    fecha: string; // YYYY-MM-DD
    tipo: VentaTipo;
    items: VentaDetalle[];
    totalVenta: number;
    totalCosto: number;
}

// Tipos para la respuesta de la API de VENTAS (lista /ventas/obtener_todas)
interface VentaApi { // Este es el tipo para la lista inicial de ventas
    // !!! VERIFICA Y AJUSTA ESTOS NOMBRES DE CAMPO SEGÚN TU API !!!
    venta_id: number | string; 
    fecha_registro: string;   
    direccion_entrega?: string | null; 
    monto_final_con_recargos?: number; 
    // No esperamos 'detalles' aquí, ya que se obtendrán individualmente
    // ... otros campos que devuelve la lista de ventas resumen ...
}

interface PaginatedVentasResponse { // Para la lista de ventas
    ventas: VentaApi[];
    pagination: { total_pages: number; /* ...otros campos de paginación... */ };
}

// Tipos para la respuesta de la API de VENTA INDIVIDUAL (/ventas/obtener/:id)
interface DetalleVentaIndividualApi {
    // !!! VERIFICA Y AJUSTA ESTOS NOMBRES DE CAMPO SEGÚN TU API !!!
    id_detalle_venta?: number | string; 
    producto_nombre?: string;
    cantidad?: number; // o 'cantidad'
    precio_unitario_base_ars?: number; // o 'precio_unitario'
    costo_unitario_momento_ars?: number; // ESENCIAL PARA EL COSTO
    // ... otros campos del detalle individual
}

interface VentaIndividualApi { // Para la respuesta de /ventas/obtener/:id
    // !!! VERIFICA Y AJUSTA ESTOS NOMBRES DE CAMPO SEGÚN TU API !!!
    venta_id: number | string;
    // ... otros campos que devuelve este endpoint ...
    detalles: DetalleVentaIndividualApi[]; // Array de detalles con el costo
}


// Tipos para la respuesta de la API de COMPRAS (como antes)
interface ItemOrdenCompraApi { id_linea: number; producto_id: number; producto_codigo: string; producto_nombre: string; cantidad_solicitada: number | null; cantidad_recibida: number | null; notas_item_recepcion: string | null; precio_unitario_estimado: number | null; importe_linea_estimado: number | null; }
interface OrdenCompraApi { id: number; nro_solicitud_interno: string | null; fecha_creacion: string | null; estado: string; proveedor_id: number; proveedor_nombre: string | null; items: ItemOrdenCompraApi[]; importe_total_estimado: number | null; /* ...otros campos...*/ }
interface PaginatedOrdenesCompraResponse { ordenes: OrdenCompraApi[]; pagination: { total_pages: number; /* ...otros campos de paginación...*/ }; }

const ESTADOS_API_A_EN_ESPERA: string[] = [ "PENDIENTE_APROBACION", "APROBADO", "EN_ESPERA_RECEPCION", "RECIBIDA_PARCIAL"];
const ESTADOS_API_A_PAGADO: string[] = [ "PAGADA_PARCIAL", "PAGADA_TOTAL", "RECIBIDO"];
// --- FIN: Definición de Tipos ---


// --- INICIO: Funciones de Fetching y Procesamiento ---
async function fetchTodasLasOrdenesDeCompra(): Promise<OrdenCompraApi[]> {
    const currentToken = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!currentToken) { console.error("Token no encontrado para API Compras"); throw new Error("Token no disponible");}
    let todasLasOrdenes: OrdenCompraApi[] = [];
    let currentPage = 1;
    let totalPages = 1;
    do {
        const response = await fetch(`https://quimex.sistemataup.online/ordenes_compra/obtener_todas?page=${currentPage}&per_page=100`, {
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${currentToken}` } });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: "Error desconocido" }));
            console.error("Error API Compras:", errorData);
            throw new Error(`Error fetching compras (página ${currentPage}): ${errorData.error || response.statusText}`);
        }
        const data: PaginatedOrdenesCompraResponse = await response.json();
        todasLasOrdenes = todasLasOrdenes.concat(data.ordenes);
        totalPages = data.pagination.total_pages;
        currentPage++;
    } while (currentPage <= totalPages && totalPages > 0);
    return todasLasOrdenes;
}

const obtenerDatosComprasParaDashboard = async (): Promise<{ name: string; cantidad: number }[]> => {
    try {
        const ordenesCompraApi = await fetchTodasLasOrdenesDeCompra();
        let enEsperaCount = 0;
        let pagadosCount = 0;
        ordenesCompraApi.forEach(orden => {
            const estadoUpper = orden.estado?.toUpperCase() || "";
            if (ESTADOS_API_A_EN_ESPERA.map(s => s.toUpperCase()).includes(estadoUpper)) enEsperaCount++;
            else if (ESTADOS_API_A_PAGADO.map(s => s.toUpperCase()).includes(estadoUpper)) pagadosCount++;
        });
        return [ { name: "En Espera", cantidad: enEsperaCount }, { name: "Pagados", cantidad: pagadosCount }];
    } catch (error) {
        console.error("Error procesando datos de compras para dashboard:", error);
        return [ { name: "En Espera", cantidad: 0 }, { name: "Pagados", cantidad: 0 }];
    }
};

// VENTAS: Paso 1 - Obtener lista de resúmenes de ventas
async function fetchListaVentasResumenDelMes(mes: number, anio: number): Promise<VentaApi[]> {
    const currentToken = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!currentToken) { console.error("Token no encontrado para API Ventas (Lista)"); throw new Error("Token no disponible");}
    let todasLasVentasResumen: VentaApi[] = [];
    let currentPage = 1;
    let totalPages = 1;
    const primerDiaDelMes = new Date(anio, mes, 1);
    const ultimoDiaDelMes = new Date(anio, mes + 1, 0);
    const fechaDesdeStr = primerDiaDelMes.toISOString().split('T')[0];
    const fechaHastaStr = ultimoDiaDelMes.toISOString().split('T')[0];
    const baseUrl = `https://quimex.sistemataup.online/ventas/obtener_todas`;
    do {
        const params = new URLSearchParams({
            page: currentPage.toString(),
            per_page: '100',
            fecha_desde: fechaDesdeStr,
            fecha_hasta: fechaHastaStr,
        });
        const url = `${baseUrl}?${params.toString()}`;
        const response = await fetch(url, {
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${currentToken}` }
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({error: "Error desconocido"}));
            console.error("Error API Ventas (Lista):", response.status, response.statusText, errorData);
            throw new Error(`Error fetching lista de ventas (página ${currentPage}): ${errorData.error || response.statusText}`);
        }
        const data: PaginatedVentasResponse = await response.json();
        if (!data.ventas) {
             console.warn("Respuesta de API Ventas (Lista) no contiene 'ventas':", data);
             data.ventas = [];
        }
        todasLasVentasResumen = todasLasVentasResumen.concat(data.ventas);
        totalPages = data.pagination.total_pages;
        currentPage++;
    } while (currentPage <= totalPages && totalPages > 0);
    return todasLasVentasResumen;
}

// VENTAS: Paso 2 - Obtener detalles de una venta individual
async function fetchDetallesDeVentaIndividual(ventaId: number | string): Promise<VentaIndividualApi> {
    const currentToken = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!currentToken) { console.error("Token no encontrado para API Detalle Venta"); throw new Error("Token no disponible");}
    const url = `https://quimex.sistemataup.online/ventas/obtener/${ventaId}`;
    const response = await fetch(url, {
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${currentToken}` }
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({error: "Error desconocido"}));
        console.error(`Error API Detalle Venta (ID: ${ventaId}):`, response.status, response.statusText, errorData);
        throw new Error(`Error fetching detalle para venta ${ventaId}: ${errorData.error || response.statusText}`);
    }
    const data: VentaIndividualApi = await response.json();
    if (!data.detalles) {
        console.warn(`Respuesta de API Detalle Venta (ID: ${ventaId}) no contiene 'detalles'. Asumiendo detalles vacíos.`, data);
        data.detalles = [];
    }
    return data;
}

// VENTAS: Paso 3 - Combinar y transformar datos para el dashboard
const obtenerDatosVentasParaDashboard = async (mes: number, anio: number): Promise<Venta[]> => {
    try {
        const ventasResumenApi = await fetchListaVentasResumenDelMes(mes, anio); // Asumo que esta función está definida en otra parte
        // console.log(`Fetched ${ventasResumenApi.length} sales summaries for month ${mes+1}/${anio}.`);

        const ventasConDetallesPromises = ventasResumenApi.map(async (vResumen) => {
            try {
                // console.log(`Fetching details for sale ID: ${vResumen.venta_id}`);
                const ventaConDetallesFull = await fetchDetallesDeVentaIndividual(vResumen.venta_id); // Asumo que esta función está definida
                // console.log(`Details for sale ID ${vResumen.venta_id}:`, ventaConDetallesFull.detalles);
                
                const esDireccionNula = vResumen.direccion_entrega === null || vResumen.direccion_entrega === undefined || vResumen.direccion_entrega.trim() === "";
                const tipoVenta: VentaTipo = esDireccionNula ? "puerta" : "pedido";
                
                let totalCostoVenta = 0;
                const itemsTransformados: VentaDetalle[] = (ventaConDetallesFull.detalles || []).map((dApi, index) => {
                    // !!! VERIFICA ESTOS NOMBRES DE CAMPO CON TU API !!!

                    const cantidad = typeof dApi.cantidad === 'number' ? dApi.cantidad: 0; // O dApi.cantidad
                    const costoUnitario = typeof dApi.costo_unitario_momento_ars === 'number' ? dApi.costo_unitario_momento_ars : 0;
                    const precioUnitario = typeof dApi.precio_unitario_base_ars === 'number' ? dApi.precio_unitario_base_ars : 0; // O dApi.precio_unitario
                    
                    totalCostoVenta += cantidad * costoUnitario;

                    return {
                        id: String(dApi.id_detalle_venta || `item-${vResumen.venta_id}-${index}`), 
                        productoNombre: dApi.producto_nombre || "N/A",
                        cantidad: cantidad,
                        precioVentaUnitario: precioUnitario,
                        costoUnitario: costoUnitario,
                    };
                });
                // if (totalCostoVenta === 0 && (ventaConDetallesFull.detalles || []).length > 0) {
                //     console.warn(`Total cost is 0 for sale ID ${vResumen.venta_id} despite having details. Check 'costo_unitario_momento_ars'. Details:`, ventaConDetallesFull.detalles);
                // }

                // Este objeto es del tipo Venta
                return { // TypeScript infiere correctamente el tipo aquí si tipoVenta es VentaTipo
                    id: String(vResumen.venta_id),
                    fecha: vResumen.fecha_registro.split('T')[0],
                    tipo: tipoVenta, // tipoVenta ya es VentaTipo
                    items: itemsTransformados,
                    totalVenta: typeof vResumen.monto_final_con_recargos === 'number' ? vResumen.monto_final_con_recargos : 0,
                    totalCosto: parseFloat(totalCostoVenta.toFixed(2)),
                };

            } catch (errorDetalle) {
                console.error(`No se pudieron obtener detalles para venta ID ${vResumen.venta_id}:`, errorDetalle);
                // Asegurar que el objeto de fallback también sea del tipo Venta
                const esDireccionNulaFallback = vResumen.direccion_entrega === null || vResumen.direccion_entrega === undefined || vResumen.direccion_entrega.trim() === "";
                // Aplicar la corrección aquí:
                const tipoVentaFallback: VentaTipo = esDireccionNulaFallback ? "puerta" : "pedido"; 

                return { // Este objeto AHORA es del tipo Venta
                    id: String(vResumen.venta_id),
                    fecha: vResumen.fecha_registro.split('T')[0],
                    tipo: tipoVentaFallback, // Usar la variable explícitamente tipada
                    items: [], 
                    totalVenta: typeof vResumen.monto_final_con_recargos === 'number' ? vResumen.monto_final_con_recargos : 0,
                    totalCosto: 0,
                };
            }
        });

        // Ahora TypeScript sabe que cada elemento de la promesa es de tipo Venta
        const ventasTransformadas: Venta[] = await Promise.all(ventasConDetallesPromises);
        
        // console.log("Dashboard Ventas (transformadas finales):", ventasTransformadas.length, "ventas.");
        // console.log("Dashboard Ventas - Primeras 2 transformadas finales:", JSON.stringify(ventasTransformadas.slice(0,2), null, 2));
        return ventasTransformadas.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

    } catch (error) {
        console.error("Error general procesando datos de ventas para dashboard:", error);
        return [];
    }
};
// --- FIN: Funciones de Fetching y Procesamiento ---

const PIE_COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042"];
const BAR_CHART_VENTAS_COLORS = ["#8884d8", "#82ca9d"];

export default function Dashboard() {
    const [ventas, setVentas] = useState<Venta[]>([]);
    const [estadoComprasData, setEstadoComprasData] = useState<{ name: string; cantidad: number }[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentMonthName, setCurrentMonthName] = useState("");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const today = new Date();
                const currentMonth = today.getMonth();
                const currentYear = today.getFullYear();
                setCurrentMonthName(today.toLocaleString('es-ES', { month: 'long' }));

                const [ventasData, comprasParaGraficoData] = await Promise.all([
                    obtenerDatosVentasParaDashboard(currentMonth, currentYear),
                    obtenerDatosComprasParaDashboard()
                ]);

                setVentas(ventasData);
                setEstadoComprasData(comprasParaGraficoData);
              //eslint-disable-next-line
            } catch (err: any) {
                console.error("Error general al cargar datos para el dashboard:", err);
                setError("Ocurrió un error al cargar los datos.");
                setVentas([]);
                setEstadoComprasData([{ name: "En Espera", cantidad: 0 },{ name: "Pagados", cantidad: 0 }]);
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, []);

    const ventasDiariasData = useMemo(() => {
        if (!ventas.length) return [];
        const groupedByDay: { [key: string]: { puerta: number; pedido: number } } = {};
        ventas.forEach(venta => {
            const day = venta.fecha.split('-')[2];
            if (!groupedByDay[day]) groupedByDay[day] = { puerta: 0, pedido: 0 };
            if (venta.tipo === "puerta") groupedByDay[day].puerta += venta.totalVenta;
            else groupedByDay[day].pedido += venta.totalVenta;
        });
        return Object.entries(groupedByDay)
            .map(([dia, totales]) => ({
                name: dia,
                "Ventas Puerta": parseFloat(totales.puerta.toFixed(2)),
                "Ventas Pedidos": parseFloat(totales.pedido.toFixed(2)),
            }))
            .sort((a, b) => parseInt(a.name) - parseInt(b.name));
    }, [ventas]);

    const metricasVentasMes = useMemo(() => {
        if (!ventas.length) return { totalVentas: 0, totalCostos: 0, margenGanancia: 0, ventasPuerta: 0, ventasPedidos: 0 };
        let totalVentas = 0, totalCostos = 0, ventasPuerta = 0, ventasPedidos = 0;
        ventas.forEach(venta => {
            totalVentas += venta.totalVenta;
            totalCostos += venta.totalCosto; // Este ahora debería tener valor si los detalles se cargan bien
            if (venta.tipo === "puerta") ventasPuerta += venta.totalVenta;
            else ventasPedidos += venta.totalVenta;
        });
        const margenGanancia = totalVentas - totalCostos;
       // console.log("Metricas calculadas:", { totalVentas, totalCostos, margenGanancia, ventasPuerta, ventasPedidos });
        return { 
            totalVentas: parseFloat(totalVentas.toFixed(2)), 
            totalCostos: parseFloat(totalCostos.toFixed(2)), 
            margenGanancia: parseFloat(margenGanancia.toFixed(2)),
            ventasPuerta: parseFloat(ventasPuerta.toFixed(2)),
            ventasPedidos: parseFloat(ventasPedidos.toFixed(2)),
        };
    }, [ventas]);

    const tipoVentasPieData = useMemo(() => [
        { name: "Ventas Puerta", value: metricasVentasMes.ventasPuerta },
        { name: "Ventas Pedidos", value: metricasVentasMes.ventasPedidos },
    ].filter(d => d.value > 0), [metricasVentasMes]);
    
    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);
    }

    if (isLoading) {
        return <div className="flex-1 space-y-4 p-4 md:p-8 text-center">Cargando dashboard...</div>;
    }
    if (error) {
        return <div className="flex-1 space-y-4 p-4 md:p-8 text-center text-red-500">Error: {error}</div>;
    }

    return (
        <div className="flex-1 space-y-4 p-4 md:p-8">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-bold tracking-tight">Dashboard de Administración</h2>
            </div>

            <Tabs defaultValue="overview" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="overview">Resumen del Mes ({currentMonthName})</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Ventas Totales del Mes</CardTitle>
                                <DollarSign className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{formatCurrency(metricasVentasMes.totalVentas)}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Costo Mercadería Vendida</CardTitle>
                                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{formatCurrency(metricasVentasMes.totalCostos)}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Margen de Ganancia Bruta</CardTitle>
                                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{formatCurrency(metricasVentasMes.margenGanancia)}</div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>Ventas Diarias del Mes (Puerta vs. Pedidos)</CardTitle>
                            <CardDescription>Monto total de ventas por día, diferenciado por tipo.</CardDescription>
                        </CardHeader>
                        <CardContent className="h-[350px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={ventasDiariasData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" /> 
                                    <YAxis tickFormatter={(value) => formatCurrency(value)} />
                                    <Tooltip formatter={(value: number, name: string) => [formatCurrency(value), name]} />
                                    <Legend />
                                    <Bar dataKey="Ventas Puerta" fill={BAR_CHART_VENTAS_COLORS[0]} />
                                    <Bar dataKey="Ventas Pedidos" fill={BAR_CHART_VENTAS_COLORS[1]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <div className="grid gap-4 md:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle>Distribución de Ventas del Mes</CardTitle>
                                <CardDescription>Proporción de ingresos por tipo de venta.</CardDescription>
                            </CardHeader>
                            <CardContent className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={tipoVentasPieData}
                                            cx="50%"
                                            cy="50%"
                                            labelLine={false}
                                            label={({ name, percent, value }) => value > 0 ? `${name}: ${(percent * 100).toFixed(0)}%` : ''}
                                            outerRadius={80}
                                            fill="#8884d8"
                                            dataKey="value"
                                        >
                                            {tipoVentasPieData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(value: number, name: string) => [formatCurrency(value), name]}/>
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Estado de Órdenes de Compra</CardTitle>
                                <CardDescription>Cantidad de pedidos de compra por estado.</CardDescription>
                            </CardHeader>
                            <CardContent className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={estadoComprasData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="name" />
                                        <YAxis allowDecimals={false} />
                                        <Tooltip />
                                        <Legend />
                                        <Bar dataKey="cantidad" fill="#82ca9d" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}