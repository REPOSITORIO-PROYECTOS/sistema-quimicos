// src/app/page.tsx
"use client"; // Mantenlo si Dashboard o sus hijos usan hooks

import React from 'react';
import Dashboard from "@/components/dashboard";
// Ya no necesitamos importar nada de autenticación aquí

export default function Home() {
    // AppShell ya se aseguró de que estemos autenticados para llegar aquí
    return (
        // Quitamos el <main> porque AppShell podría ya tener uno o el Dashboard lo provee
        // Ajusta esto según la estructura que prefieras
         <div className="bg-background p-4 md:p-6"> {/* O usa <main> si lo prefieres aquí */}
            <Dashboard />
        </div>
    );
}