// src/app/page.tsx
"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Dashboard from "@/components/dashboard"; // Este será el contenido para ADMIN

// Definición de roles (debe ser consistente con tu Navbar y otros lugares)
type UserRole = "ADMIN" | "ALMACEN" | "VENTAS_LOCAL" | "VENTAS_PEDIDOS" | "CONTABLE" | "GUEST";

// Mapeo de roles a sus páginas por defecto (como lo definimos antes)
const defaultPathsByRole: Partial<Record<UserRole, string>> = {
    ALMACEN: "/compras",
    VENTAS_LOCAL: "/acciones-puerta",
    CONTABLE: "/movimientos",
    // VENTAS_PEDIDOS y ADMIN se quedan en "/" para ver el dashboard
    VENTAS_PEDIDOS: "/", // Ahora puede ver dashboard con 3 variables: Ingreso Puerta, Pedidos Pendientes, Kgs a Entregar
};

export default function Home() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [userRole, setUserRole] = useState<UserRole | null>(null);

    useEffect(() => {
        // Solo ejecutar en el cliente donde sessionStorage está disponible
        if (typeof window !== "undefined") {
            const userItem = sessionStorage.getItem("user");
            if (userItem) {
                try {
                    const user = JSON.parse(userItem);
                    const role = (user?.role as UserRole) || "GUEST"; // Asegúrate que 'role' es el nombre correcto
                    setUserRole(role);

                    if (role !== "ADMIN" && role !== "GUEST" && role !== "VENTAS_PEDIDOS") {
                        const targetPath = defaultPathsByRole[role];
                        if (targetPath) {
                            router.replace(targetPath);
                            // No necesitamos setIsLoading(false) aquí porque la redirección ocurrirá
                        } else {
                            console.warn(`No default path for role: ${role}. Staying on Home or consider redirecting.`);
                            // Si no hay ruta definida y no es ADMIN, podrías decidir redirigir a login
                            // o a una página de error, o dejar que se muestre el dashboard (lo cual no es ideal)
                            // Por ahora, si no hay ruta, y no es ADMIN, se quedará en Home,
                            // lo que significa que el Dashboard se mostrará.
                            // Podrías querer que este caso también redirija, por ejemplo, a /login
                            // router.replace('/login');
                            setIsLoading(false); // Permitir renderizar si no hay redirección
                        }
                    } else if (role === "GUEST") {
                        // Si un GUEST llega aquí (AppShell debería haberlo prevenido teóricamente)
                        router.replace('/login'); // Redirigir a login
                    } else {
                        // Es ADMIN, VENTAS_PEDIDOS o no hay redirección necesaria
                        setIsLoading(false);
                    }
                } catch (error) {
                    console.error("Failed to parse user from sessionStorage:", error);
                    setUserRole("GUEST"); // Tratar como GUEST si hay error
                    router.replace('/login'); // Redirigir a login en caso de error
                }
            } else {
                // No hay usuario en sessionStorage, AppShell debería haber manejado esto.
                // Como medida de seguridad, redirigir a login.
                setUserRole("GUEST");
                router.replace('/login');
            }
        }
    }, [router]);

    // Mostrar un estado de carga mientras se determina el rol y se redirige
    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-screen bg-background">
                {/* Puedes poner un spinner aquí */}
                <p>Cargando...</p>
            </div>
        );
    }

    // Si el rol es ADMIN o VENTAS_PEDIDOS, se muestra el Dashboard.
    // Para VENTAS_PEDIDOS se mostrará una versión simplificada con solo 3 variables.
    if (userRole === "ADMIN" || userRole === "VENTAS_PEDIDOS") {
        return (
            <div className="bg-background p-4 md:p-6">
                <Dashboard />
            </div>
        );
    }

    // Si no es ADMIN y no se ha redirigido (ej. GUEST esperando redirección a login),
    // puedes mostrar un mensaje o nada, ya que la redirección debería ocurrir.
    // El estado de carga ya cubre esto.
    // Si llegamos aquí y no somos ADMIN, algo en la lógica anterior necesita ajuste.
    // Por seguridad, podrías retornar null o un mensaje genérico.
    return (
        <div className="flex justify-center items-center h-screen bg-background">
            <p>Redirigiendo...</p> {/* Mensaje mientras la redirección se completa */}
        </div>
    );
}