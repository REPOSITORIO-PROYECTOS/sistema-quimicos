"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardPedidos from "@/components/DashboardPedidos";
import { useAuth } from "@/components/providers/auth-provider";

export default function DashboardPedidosPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { user, isHydrated } = useAuth();

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    if (!user) {
      router.replace("/login");
      return;
    }

    const role = String(user.role || "").toUpperCase();
    if (role !== "VENTAS_PEDIDOS" && role !== "ADMIN") {
      setError("No tienes permiso para acceder a este dashboard");
      setTimeout(() => router.replace("/"), 2000);
      return;
    }
  }, [isHydrated, user, router]);

  if (!isHydrated || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg font-semibold">Cargando dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50">
        <div className="p-6 bg-white rounded-lg shadow-lg border border-red-200">
          <p className="text-red-800 font-semibold mb-2">Error de Acceso</p>
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return <DashboardPedidos />;
}
