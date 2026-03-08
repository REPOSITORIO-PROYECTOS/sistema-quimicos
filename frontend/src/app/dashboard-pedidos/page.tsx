"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardPedidos from "@/components/DashboardPedidos";

export default function DashboardPedidosPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("authToken");
    if (!token) {
      router.push("/login");
      return;
    }

    try {
      const parts = token.split(".");
      if (parts.length < 2) {
        router.push("/login");
        return;
      }

      const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const payloadStr = atob(base64);
      const payload = JSON.parse(payloadStr);
      const rol = String(payload.rol || payload.role || "").toUpperCase();

      console.log("Dashboard rol detected:", rol);

      if (rol !== "VENTAS_PEDIDOS" && rol !== "ADMIN") {
        setError("No tienes permiso para acceder a este dashboard");
        setTimeout(() => router.push("/"), 2000);
        return;
      }
    } catch (err) {
      console.error("Error al decodificar token:", err);
      setError("Error al verificar tus permisos");
      setTimeout(() => router.push("/login"), 2000);
      return;
    }
  }, [router]);

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
