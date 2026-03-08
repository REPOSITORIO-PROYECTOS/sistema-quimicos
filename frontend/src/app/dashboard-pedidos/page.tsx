"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardPedidos from "@/components/DashboardPedidos";

export default function DashboardPedidosPage() {
  const router = useRouter();

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
      const payload = JSON.parse(atob(base64));
      const rol = String(payload.rol || payload.role || "").toUpperCase();

      if (rol !== "VENTAS_PEDIDOS") {
        router.push("/");
      }
    } catch {
      router.push("/login");
    }
  }, [router]);

  return <DashboardPedidos />;
}
