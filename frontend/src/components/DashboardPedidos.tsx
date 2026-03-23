"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { DollarSign, Package, Truck, AlertTriangle } from 'lucide-react';

interface DashboardPedidosData {
  hoy: {
    cantidad_pedidos: number;
    cantidad_pedidos_por_forma_pago: Record<string, number>;
    cantidad_kilos: number;
    ingreso_puerta_hoy: number;
    ingreso_puerta_por_forma_pago: Record<string, number>;
    ingreso_pedidos_hoy: number;
    ingreso_pedidos_por_forma_pago: Record<string, number>;
  };
  pendiente_entrega: {
    cantidad_pedidos: number;
    cantidad_kilos: number;
  };
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);

const formatNumber = (value: number) =>
  new Intl.NumberFormat("es-AR").format(Math.round(value));

export default function DashboardPedidos() {
  const [data, setData] = useState<DashboardPedidosData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const token = localStorage.getItem("authToken");
        if (!token) {
          setError("No autenticado. Por favor inicia sesión.");
          setIsLoading(false);
          return;
        }

        // Usar endpoint de ventas-pedidos para VENTAS_PEDIDOS
        const response = await fetch(
          "https://quimex.sistemataup.online/api/dashboard/ventas-pedidos",
          {
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.ok) {
          if (response.status === 401 && typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("auth:expired", { detail: { message: "Sesion expirada" } }));
          }
          const errData = await response.json().catch(() => ({}));
          console.error("Dashboard error response:", response.status, errData);
          throw new Error(errData.error || errData.message || `Error ${response.status}`);
        }

        const result = await response.json();
        console.log("Dashboard data received:", result);
        setData(result);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Error al cargar datos";
        console.error("Dashboard fetch error:", errorMsg);
        setError(errorMsg);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg font-semibold">Cargando dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-center gap-2 text-red-800">
          <AlertTriangle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="p-6">No hay datos disponibles</div>;
  }

  return (
    <div className="p-6 space-y-4 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard Pedidos</h1>
        <p className="text-gray-600 text-sm mt-1">Vista simplificada de ventas y entregas</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-linear-to-br from-orange-50 to-orange-100 border-orange-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-orange-900 flex items-center gap-2">
              <Package className="w-4 h-4" />
              KGs A ENTREGAR
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-900">
              {formatNumber(data?.pendiente_entrega?.cantidad_kilos ?? 0)}
            </div>
            <p className="text-xs text-orange-700 mt-1">pendientes</p>
          </CardContent>
        </Card>

        <Card className="bg-linear-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-blue-900 flex items-center gap-2">
              <Truck className="w-4 h-4" />
              PEDIDOS PENDIENTES
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-900">
              {data?.pendiente_entrega?.cantidad_pedidos ?? 0}
            </div>
            <p className="text-xs text-blue-700 mt-1">de entrega</p>
          </CardContent>
        </Card>

        <Card className="bg-linear-to-br from-green-50 to-green-100 border-green-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-green-900 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              INGRESO PUERTA (HOY)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <p className="text-4xl font-bold text-green-900">
                {formatCurrency(data?.hoy?.ingreso_puerta_hoy ?? 0)}
              </p>
            </div>

            <div className="space-y-1.5 text-sm">
              {Object.entries(data?.hoy?.ingreso_puerta_por_forma_pago ?? {}).length > 0 ? (
                <>
                  {Object.entries(data?.hoy?.ingreso_puerta_por_forma_pago ?? {}).map(([formaPago, monto]) => (
                    <div key={formaPago} className="flex justify-between text-green-900">
                      <span className="font-medium">{formaPago}:</span>
                      <span className="font-bold">{formatCurrency(monto)}</span>
                    </div>
                  ))}
                  <div className="text-xs text-green-600 mt-3 pt-2 border-t border-green-200">
                    Ver montos detallados
                  </div>
                </>
              ) : (
                <p className="text-green-600 italic">Sin ventas en puerta hoy</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
