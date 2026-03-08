// src/components/AppShell.tsx
"use client";

import React, { ReactNode } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import LoginForm from '@/components/LoginForm';
import { Header } from "@/components/header";
import { Navbar } from "@/components/navbar";
import { usePathname } from 'next/navigation'; // <-- IMPORTAR usePathname

interface AppShellProps {
  children: ReactNode;
}

// ✨ NUEVO: Definir rutas que no requieren autenticación
const PUBLIC_ROUTES = ['/login', '/register']; // Añade otras si es necesario

const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname || "");

  // 1. Mientras cargue el contexto, mostrar spinner
  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Cargando...</div>;
  }

  // 2. Si es ruta pública O usuario autenticado -> mostrar contenido
  if (isPublicRoute || user) {
    if (isPublicRoute) {
      return <>{children}</>;
    } else {
      // Usuario autenticado en ruta privada
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
  }

  // 3. No autenticado en ruta privada
  return <LoginForm />;
};

export default AppShell;