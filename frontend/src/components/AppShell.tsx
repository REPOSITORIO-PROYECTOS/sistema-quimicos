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
  const pathname = usePathname(); // <-- OBTENER RUTA ACTUAL

  // ✨ NUEVO: Comprobar si la ruta actual es pública
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

  // 1. Estado de Carga Inicial
  if (isLoading) {
    // ... (código del spinner) ...
     return <div className="flex items-center justify-center min-h-screen">Cargando...</div>;
  }

  // 2. Si es Ruta Pública O el usuario está autenticado -> Mostrar contenido
  if (isPublicRoute || user) {
     // Si es una ruta pública, mostramos directamente los children (la página pública)
     // Si es una ruta privada PERO el usuario está autenticado, mostramos el layout completo + children
    if (isPublicRoute) {
        // Para rutas públicas, quizás no quieras mostrar Header/Navbar
        // O quizás sí, depende de tu diseño. Aquí mostramos solo children:
        return <>{children}</>;
        // Alternativa: Mostrar layout simple para públicas:
        // return (
        //   <div>
        //      <MinimalHeader /> {/* Un header simple si quieres */}
        //      {children}
        //   </div>
        // );
    } else {
        // Usuario autenticado en ruta privada: Mostrar layout completo
        return (
            <div className="flex flex-col min-h-screen">
            <Header />
            <Navbar />
            <div className="flex-grow">
                {children}
            </div>
            {/* Footer opcional */}
            </div>
        );
    }
  }

  // 3. Si NO es Ruta Pública Y el usuario NO está autenticado -> Mostrar Login
  // Esta condición solo se alcanza si !isPublicRoute && !user
  return <LoginForm />;

};

export default AppShell;