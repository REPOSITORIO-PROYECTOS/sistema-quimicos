/**
 * AuthGuard - Espera a que AuthProvider esté hidratado antes de renderizar children
 * 
 * Esto previene que los contextos de datos intenten hacer fetch antes de tener autenticación
 */

"use client";

import { useAuth } from "@/components/providers/auth-provider";
import React, { ReactNode } from "react";

interface AuthGuardProps {
    children: ReactNode;
}

export const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
    const { isHydrated } = useAuth();

    // No renderizar children hasta que AuthProvider esté hidratado
    if (!isHydrated) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background">
                <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                    <p className="text-muted-foreground">Inicializando aplicación...</p>
                </div>
            </div>
        );
    }

    return <>{children}</>;
};
