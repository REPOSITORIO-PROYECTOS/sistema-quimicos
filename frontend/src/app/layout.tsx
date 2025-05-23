// src/app/layout.tsx
"use client"; // Sigue siendo necesario por los Providers

import { Geist, Geist_Mono } from "next/font/google";
import "@/styles/globals.css";
// Quitamos import de Navbar y Header de aquí
import { AuthProvider } from "@/components/providers/auth-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ProductsProvider } from "@/context/ProductsContext";
import { ClientesProvider } from '@/context/ClientesContext';
import AppShell from "@/components/AppShell"; // <-- 1. IMPORTAMOS AppShell
import { ProveedoresProvider } from "@/context/ProveedoresContext";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});
const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="es" suppressHydrationWarning>
             <head>
                 <title>Quimex</title>
             </head>
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased`}
            >
                <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem
                    disableTransitionOnChange
                >
                    <AuthProvider>
                        <ClientesProvider>
                            <ProductsProvider>
                                <ProveedoresProvider>
                                <AppShell>
                                    {children}
                                </AppShell>
                                </ProveedoresProvider>
                            </ProductsProvider>
                        </ClientesProvider>
                    </AuthProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}