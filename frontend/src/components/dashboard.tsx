"use client";

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, ShoppingCart, TrendingUp } from "lucide-react"; // Info para la card de contexto
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

// --- INICIO: Definición de Tipos (sin cambios) ---
type VentaTipo = "puerta" | "pedido";
interface VentaDetalle { id: string; productoNombre: string; cantidad: number; precioVentaUnitario: number; costoUnitario: number; }
interface Venta { id: string; fecha: string; tipo: VentaTipo; items: VentaDetalle[]; totalVenta: number; totalCosto: number; /* COGS */ }
interface VentaApi { venta_id: number | string; fecha_registro: string; direccion_entrega?: string | null; monto_final_con_recargos?: number; }
interface PaginatedVentasResponse { ventas: VentaApi[]; pagination: { total_pages: number; }; }
interface DetalleVentaIndividualApi { detalle_id?: number | string; producto_nombre?: string; cantidad?: number; precio_unitario_venta_ars?: number; costo_unitario_momento_ars?: number; }
interface VentaIndividualApi { venta_id: number | string; monto_final_con_recargos: number; detalles: DetalleVentaIndividualApi[]; }
interface ItemOrdenCompraApi { id_linea: number; producto_id: number; producto_codigo: string; producto_nombre: string; cantidad_solicitada: number | null; cantidad_recibida: number | null; notas_item_recepcion: string | null; precio_unitario_estimado: number | null; importe_linea_estimado: number | null; }
interface OrdenCompraApi { id: number; nro_solicitud_interno: string | null; fecha_creacion: string | null; estado: string; proveedor_id: number; proveedor_nombre: string | null; items: ItemOrdenCompraApi[]; importe_total_estimado: number | null; }
interface PaginatedOrdenesCompraResponse { ordenes: OrdenCompraApi[]; pagination: { total_pages: number; }; }

const ESTADOS_API_A_EN_ESPERA: string[] = [ "PENDIENTE_APROBACION", "APROBADO","CON DEUDA", "EN_ESPERA_RECEPCION", "RECIBIDA_PARCIAL"];
const ESTADOS_API_A_PAGADO: string[] = [ "PAGADA_PARCIAL", "PAGADA_TOTAL", "RECIBIDO"];
// --- FIN: Definición de Tipos ---


// --- INICIO: Funciones de Fetching y Procesamiento ---

// fetchOrdenesDeCompra: Intenta usar filtros de fecha en API, pero si no, se filtra en cliente.
// Asumimos que la API *podría* no soportar filtros de fecha, así que traemos todo y filtramos en cliente si es necesario.
async function fetchTodasLasOrdenesDeCompraHistoricas(): Promise<OrdenCompraApi[]> {
    const currentToken = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!currentToken) { console.error("Token no encontrado para API Compras"); throw new Error("Token no disponible");}
    let todasLasOrdenes: OrdenCompraApi[] = [];
    let currentPage = 1;
    let totalPages = 1;
    const baseUrl = `https://quimex.sistemataup.online/ordenes_compra/obtener_todas`;

    do {
        const params = new URLSearchParams({
            page: currentPage.toString(),
            per_page: '100', // Traer de a 100 para eficiencia
        });
        
        const url = `${baseUrl}?${params.toString()}`;
        // console.log("Fetching todas las compras URL:", url);

        const response = await fetch(url, {
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${currentToken}` } });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: "Error desconocido" }));
            console.error("Error API Compras (históricas):", errorData, response.status, response.statusText);
            throw new Error(`Error fetching todas las compras (página ${currentPage}): ${errorData.error || response.statusText}`);
        }
        const data: PaginatedOrdenesCompraResponse = await response.json();
        if (!data.ordenes) {
             console.warn("Respuesta de API Compras (históricas) no contiene 'ordenes':", data);
             data.ordenes = [];
        }
        todasLasOrdenes = todasLasOrdenes.concat(data.ordenes);
        totalPages = data.pagination.total_pages;
        currentPage++;
    } while (currentPage <= totalPages && totalPages > 0);
    return todasLasOrdenes;
}


const obtenerDatosComprasDashboard = async (mes: number, anio: number): Promise<{
    statusCountsHistoricos: { name: string; cantidad: number }[];
    totalGastadoEnComprasDelMes: number;
}> => {
    try {
        const todasLasOrdenesHistoricas = await fetchTodasLasOrdenesDeCompraHistoricas();
        
        let enEsperaCount = 0;
        let pagadosCount = 0;
        let totalGastadoMesCalculadoCliente = 0;

        const primerDiaDelMes = new Date(anio, mes, 1);
        const ultimoDiaDelMes = new Date(anio, mes + 1, 0);
        const fechaDesdeStr = primerDiaDelMes.toISOString().split('T')[0];
        const fechaHastaStr = ultimoDiaDelMes.toISOString().split('T')[0];

        // console.log(`Filtrando compras para el mes: ${mes+1}/${anio} (Desde: ${fechaDesdeStr}, Hasta: ${fechaHastaStr})`);

        todasLasOrdenesHistoricas.forEach(orden => {
            // Para statusCounts (históricos)
            const estadoUpper = orden.estado?.toUpperCase() || "";
            if (ESTADOS_API_A_EN_ESPERA.map(s => s.toUpperCase()).includes(estadoUpper)) enEsperaCount++;
            else if (ESTADOS_API_A_PAGADO.map(s => s.toUpperCase()).includes(estadoUpper)) pagadosCount++;

            // Para totalGastadoEnComprasDelMes (filtrado en cliente)
            // Asegúrate que `orden.fecha_creacion` exista y sea un string de fecha comparable
            if (orden.fecha_creacion) {
                const fechaOrden = orden.fecha_creacion.split('T')[0]; // Asume formato YYYY-MM-DD o YYYY-MM-DDTHH:mm:ss
                if (fechaOrden >= fechaDesdeStr && fechaOrden <= fechaHastaStr) {
                    totalGastadoMesCalculadoCliente += orden.importe_total_estimado || 0;
                }
            }
        });
        
        return {
            statusCountsHistoricos: [
                { name: "En Espera", cantidad: enEsperaCount },
                { name: "Pagados", cantidad: pagadosCount }
            ],
            totalGastadoEnComprasDelMes: parseFloat(totalGastadoMesCalculadoCliente.toFixed(2))
        };

    } catch (error) {
        console.error("Error procesando datos de compras para dashboard:", error);
        return {
            statusCountsHistoricos: [ { name: "En Espera", cantidad: 0 }, { name: "Pagados", cantidad: 0 }],
            totalGastadoEnComprasDelMes: 0
        };
    }
};

// --- Funciones de Ventas (sin cambios) ---
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
    if (typeof data.monto_final_con_recargos !== 'number') {
        console.warn(`Respuesta de API Detalle Venta (ID: ${ventaId}) no contiene 'monto_final_con_recargos' válido. Asumiendo 0.`, data);
        data.monto_final_con_recargos = 0;
    }
    return data;
}

const obtenerDatosVentasParaDashboard = async (mes: number, anio: number): Promise<Venta[]> => {
    try {
        const ventasResumenApi = await fetchListaVentasResumenDelMes(mes, anio);
        
        const ventasConDetallesPromises = ventasResumenApi.map(async (vResumen) => {
            try {
                const ventaConDetallesFull = await fetchDetallesDeVentaIndividual(vResumen.venta_id);
                
                const esDireccionNula = vResumen.direccion_entrega === null || vResumen.direccion_entrega === undefined || vResumen.direccion_entrega.trim() === "";
                const tipoVenta: VentaTipo = esDireccionNula ? "puerta" : "pedido";
                
                let totalCostoVenta = 0; // COGS para esta venta
                const itemsTransformados: VentaDetalle[] = (ventaConDetallesFull.detalles || []).map((dApi, index) => {
                    const cantidad = typeof dApi.cantidad === 'number' ? dApi.cantidad: 0;
                    const costoUnitario = typeof dApi.costo_unitario_momento_ars === 'number' ? dApi.costo_unitario_momento_ars : 0;
                    const precioUnitarioVenta = typeof dApi.precio_unitario_venta_ars === 'number' ? dApi.precio_unitario_venta_ars : 0;
                    
                    totalCostoVenta += cantidad * costoUnitario;

                    return {
                        id: String(dApi.detalle_id || `item-${vResumen.venta_id}-${index}`), 
                        productoNombre: dApi.producto_nombre || "N/A",
                        cantidad: cantidad,
                        precioVentaUnitario: precioUnitarioVenta,
                        costoUnitario: costoUnitario,
                    };
                });

                return {
                    id: String(vResumen.venta_id),
                    fecha: vResumen.fecha_registro.split('T')[0],
                    tipo: tipoVenta,
                    items: itemsTransformados,
                    totalVenta: typeof ventaConDetallesFull.monto_final_con_recargos === 'number' ? ventaConDetallesFull.monto_final_con_recargos : 0,
                    totalCosto: parseFloat(totalCostoVenta.toFixed(2)), // COGS
                };

            } catch (errorDetalle) {
                console.error(`No se pudieron obtener detalles para venta ID ${vResumen.venta_id}:`, errorDetalle);
                const esDireccionNulaFallback = vResumen.direccion_entrega === null || vResumen.direccion_entrega === undefined || vResumen.direccion_entrega.trim() === "";
                const tipoVentaFallback: VentaTipo = esDireccionNulaFallback ? "puerta" : "pedido"; 

                return {
                    id: String(vResumen.venta_id),
                    fecha: vResumen.fecha_registro.split('T')[0],
                    tipo: tipoVentaFallback,
                    items: [], 
                    totalVenta: typeof vResumen.monto_final_con_recargos === 'number' ? vResumen.monto_final_con_recargos : 0,
                    totalCosto: 0,
                };
            }
        });

        const ventasTransformadas: Venta[] = await Promise.all(ventasConDetallesPromises);
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
    const [statusCountsComprasHistoricos, setStatusCountsComprasHistoricos] = useState<{ name: string; cantidad: number }[]>([]);
    const [totalGastadoComprasDelMes, setTotalGastadoComprasDelMes] = useState<number>(0);
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

                const [ventasData, datosCompras] = await Promise.all([
                    obtenerDatosVentasParaDashboard(currentMonth, currentYear),
                    obtenerDatosComprasDashboard(currentMonth, currentYear) 
                ]);

                setVentas(ventasData);
                setStatusCountsComprasHistoricos(datosCompras.statusCountsHistoricos);
                setTotalGastadoComprasDelMes(datosCompras.totalGastadoEnComprasDelMes);
              // eslint-disable-next-line
            } catch (err: any) {
                console.error("Error general al cargar datos para el dashboard:", err);
                setError("Ocurrió un error al cargar los datos.");
                setVentas([]);
                setStatusCountsComprasHistoricos([{ name: "En Espera", cantidad: 0 },{ name: "Pagados", cantidad: 0 }]);
                setTotalGastadoComprasDelMes(0);
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

    const metricasMes = useMemo(() => {
        let totalVentasMes = 0;
        let totalCostoMercaderiaVendidaMes_COGS = 0; // COGS, para el margen bruto opcional
        let ventasPuerta = 0;
        let ventasPedidos = 0;

        ventas.forEach(venta => {
            totalVentasMes += venta.totalVenta;
            totalCostoMercaderiaVendidaMes_COGS += venta.totalCosto; // Suma el COGS de cada venta
            if (venta.tipo === "puerta") ventasPuerta += venta.totalVenta;
            else ventasPedidos += venta.totalVenta;
        });
        
        // Ganancia según tu definición
        const gananciaNetaDefinidaUsuario = totalVentasMes - totalGastadoComprasDelMes;
        // Margen Bruto (opcional, para contexto)
        const margenGananciaBruta = totalVentasMes - totalCostoMercaderiaVendidaMes_COGS;


        return { 
            totalVentasMes: parseFloat(totalVentasMes.toFixed(2)), 
            totalGastadoComprasDelMes: parseFloat(totalGastadoComprasDelMes.toFixed(2)),
            gananciaNetaDefinidaUsuario: parseFloat(gananciaNetaDefinidaUsuario.toFixed(2)),
            margenGananciaBruta: parseFloat(margenGananciaBruta.toFixed(2)), // Para la card de contexto
            totalCostoMercaderiaVendidaMes_COGS: parseFloat(totalCostoMercaderiaVendidaMes_COGS.toFixed(2)), // Para la card de contexto
            ventasPuerta: parseFloat(ventasPuerta.toFixed(2)),
            ventasPedidos: parseFloat(ventasPedidos.toFixed(2)),
        };
    }, [ventas, totalGastadoComprasDelMes]);


    const tipoVentasPieData = useMemo(() => [
        { name: "Ventas Puerta", value: metricasMes.ventasPuerta },
        { name: "Ventas Pedidos", value: metricasMes.ventasPedidos },
    ].filter(d => d.value > 0), [metricasMes]);
    
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
                                <div className="text-2xl font-bold">{formatCurrency(metricasMes.totalVentasMes)}</div>
                                <p className="text-xs text-muted-foreground">Suma de monto final con recargos.</p>
                            </CardContent>
                        </Card>
                        
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Gasto Total Compras (Mes)</CardTitle>
                                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{formatCurrency(metricasMes.totalGastadoComprasDelMes)}</div>
                                <p className="text-xs text-muted-foreground">Suma importe total estimado de O.C. del mes.</p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Ganancia (Ventas Mes - Compras Mes)</CardTitle>
                                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className={`text-2xl font-bold ${metricasMes.gananciaNetaDefinidaUsuario < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    {formatCurrency(metricasMes.gananciaNetaDefinidaUsuario)}
                                </div>
                                <p className="text-xs text-muted-foreground">Ventas del Mes - Gasto en Compras del Mes.</p>
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
                                <CardTitle>Estado de Órdenes de Compra (Conteo Histórico)</CardTitle>
                                <CardDescription>Cantidad total histórica de O.C. por estado.</CardDescription>
                            </CardHeader>
                            <CardContent className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={statusCountsComprasHistoricos} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
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