"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardPedidosPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard-pedidos");
  }, [router]);

  return null;
}
