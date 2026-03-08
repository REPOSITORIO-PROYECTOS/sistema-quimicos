"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { DollarSign, Package, Truck, AlertTriangle } from 'lucide-react';

interface DashboardPedidosData {
  kgs_pendientes: number;
  pedidos_pendientes: number;
  ingreso_puerta_hoy: number;
  ingreso_pedido_hoy: number;
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
        
        const token = localStorage.getItem("token");
        if (!token) {
          setError("No autenticado. Por favor inicia sesión.");
          setIsLoading(false);
          return;
        }

        const response = await fetch(
          "https://quimex.sistemataup.online/api/dashboard/kpis",
          {
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Error ${response.status}`);
        }

        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar datos");
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="bg-linear-to-br from-orange-50 to-orange-100 border-orange-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-orange-900 flex items-center gap-2">
              <Package className="w-4 h-4" />
              KGs A ENTREGAR
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-900">
              {formatNumber(data.kgs_pendientes)}
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
              {data.pedidos_pendientes}
            </div>
            <p className="text-xs text-blue-700 mt-1">de entrega</p>
          </CardContent>
        </Card>

        <Card className="bg-linear-to-br from-green-50 to-green-100 border-green-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-green-900 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              PUERTA HOY
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-900">
              {formatCurrency(data.ingreso_puerta_hoy)}
            </div>
            <p className="text-xs text-green-700 mt-1">vendido</p>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
