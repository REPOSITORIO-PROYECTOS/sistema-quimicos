// src/components/AppShell.tsx
"use client";

import React, { ReactNode } from 'react';
// Asegúrate que la ruta a tu AuthContext/hook useAuth sea correcta
import { useAuth } from '@/components/providers/auth-provider'; // Usa la ruta correcta a tu provider
import LoginForm from '@/components/LoginForm';
import { Header } from "@/components/header";
import { Navbar } from "@/components/navbar";

interface AppShellProps {
  children: ReactNode;
}

const AppShell: React.FC<AppShellProps> = ({ children }) => {
  // ✨ CAMBIO: Obtener 'user' en lugar de 'isAuthenticated'
  const { user, isLoading } = useAuth();

  // 1. Estado de Carga Inicial (sin cambios)
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          {/* Spinner */}
           <svg className="animate-spin h-8 w-8 text-primary mx-auto mb-4" /* ... */ ></svg>
          <p className="text-lg text-muted-foreground">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  // ✨ CAMBIO: Comprobar si 'user' NO existe
  // 2. No Autenticado: Mostrar Login
  if (!user) { // <-- La comprobación ahora es sobre 'user'
    return <LoginForm />;
  }

  // ✨ CAMBIO: Si 'user' existe, estamos autenticados
  // 3. Autenticado: Mostrar la estructura principal de la app
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
};

export default AppShell;