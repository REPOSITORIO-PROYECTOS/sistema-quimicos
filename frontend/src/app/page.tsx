// src/app/page.tsx
"use client";

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Dashboard from "@/components/dashboard";
import { useAuth } from '@/components/providers/auth-provider';

// Mapeo de roles a sus páginas por defecto
const defaultPathsByRole: Record<string, string> = {
    ALMACEN: "/compras",
    VENTAS_LOCAL: "/acciones-puerta",
    CONTABLE: "/movimientos",
    VENTAS_PEDIDOS: "/dashboard-pedidos",
    ADMIN: "", // ADMIN se queda en home (Dashboard)
};

export default function Home() {
    const router = useRouter();
    const { user, isHydrated } = useAuth();

    useEffect(() => {
        // Solo procesar después de que el contexto se haya hidratado
        if (!isHydrated) return;

        if (!user) {
            // Si no hay usuario, AppShell debería mostrar LoginForm
            return;
        }

        // Si el usuario no es ADMIN, redirigir a su página por defecto
        if (user.role !== "ADMIN") {
            const targetPath = defaultPathsByRole[user.role];
            if (targetPath) {
                router.replace(targetPath);
            }
        }
        // Si es ADMIN, permanecer en home (mostrar Dashboard)
    }, [user, isHydrated, router]);

    // ADMIN users ver el Dashboard
    if (user?.role === "ADMIN") {
        return <Dashboard />;
    }

    // Otros roles serán redirigidos por el useEffect
    // Mientras tanto, mostrar un mensaje de carga
    return (
        <div className="flex items-center justify-center min-h-screen bg-background">
            <div className="flex flex-col items-center gap-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                <p className="text-muted-foreground">Redirigiendo...</p>
            </div>
        </div>
    );
}