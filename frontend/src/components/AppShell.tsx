// src/components/AppShell.tsx
"use client";

import React, { ReactNode } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import LoginForm from '@/components/LoginForm';
import { Header } from "@/components/header";
import { Navbar } from "@/components/navbar";
import { usePathname } from 'next/navigation';

interface AppShellProps {
  children: ReactNode;
}

// Rutas que no requieren autenticación
const PUBLIC_ROUTES = ['/login', '/register'];

const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const { user, isLoading, isHydrated } = useAuth();
  const pathname = usePathname();

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname || "");

  /**
   * Fase de hidratación: esperar a que React cargue desde localStorage
   * Mostrar un spinner mientras tanto
   */
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

  /**
   * Fase de carga de login: pero ya estamos hidratados
   */
  if (isLoading && !user && !isPublicRoute) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  /**
   * Lógica de renderizado después de hidratación
   */

  // Ruta pública (login, register) - mostrar el children sin navbar/header
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // Usuario autenticado - mostrar navbar, header y contenido
  if (user) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <Navbar />
        <div className="flex-grow">
          {children}
        </div>
      </div>
    );
  }

  // No autenticado en ruta privada - mostrar login
  return <LoginForm />;
};

export default AppShell;