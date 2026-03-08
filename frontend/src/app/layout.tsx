// src/app/layout.tsx
"use client"; // Sigue siendo necesario por los Providers

import { Geist, Geist_Mono } from "next/font/google";
import "@/styles/globals.css";
import { AuthProvider } from "@/components/providers/auth-provider";
import { AuthGuard } from "@/components/providers/auth-guard";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ProductsProvider } from "@/context/ProductsContext";
import { ProductsActivosProvider } from "@/context/ProductsContextActivos";
import { ClientesProvider } from '@/context/ClientesContext';
import AppShell from "@/components/AppShell";
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
                    defaultTheme="light"
                    enableSystem={false}
                    disableTransitionOnChange
                >
                    <AuthProvider>
                        {/* AuthGuard espera a que AuthProvider esté hidratado 
                            antes de renderizar los contextos de datos */}
                        <AuthGuard>
                            <ClientesProvider>
                                <ProductsProvider>
                                    <ProductsActivosProvider>
                                        <ProveedoresProvider>
                                            <AppShell>
                                                {children}
                                            </AppShell>
                                        </ProveedoresProvider>
                                    </ProductsActivosProvider>
                                </ProductsProvider>
                            </ClientesProvider>
                        </AuthGuard>
                    </AuthProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}
