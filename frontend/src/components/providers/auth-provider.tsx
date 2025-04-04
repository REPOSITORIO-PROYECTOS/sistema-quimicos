"use client";

import type React from "react";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

type User = {
    email: string;
    name: string;
    role: "admin" | "estudiante";
} | null;

type AuthContextType = {
    user: User;
    login: (
        email: string,
        password: string,
        role: "admin" | "estudiante"
    ) => Promise<boolean>;
    logout: () => void;
    isLoading: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        // Verificar si hay un usuario en sessionStorage
        const storedUser = sessionStorage.getItem("user");
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        // // Proteger rutas
        // if (!isLoading) {
        //     // Si no hay usuario y no estamos en login, redirigir a login
        //     if (!user && pathname !== "/login") {
        //         router.push("/login");
        //     }
        //     // Si hay usuario admin y está intentando acceder a rutas de estudiante
        //     if (
        //         user?.role === "admin" &&
        //         pathname.startsWith("/aula-virtual")
        //     ) {
        //         router.push("/admin");
        //     }
        //     // Si hay usuario estudiante y está intentando acceder a rutas de admin
        //     if (user?.role === "estudiante" && pathname.startsWith("/admin")) {
        //         router.push("/");
        //     }
        // }
    }, [user, isLoading, pathname, router]);

    const login = async (
        email: string,
        password: string,
        role: "admin" | "estudiante"
    ): Promise<boolean> => {
        setIsLoading(true);

        // Simulación de autenticación
        return new Promise((resolve) => {
            setTimeout(() => {
                if (
                    role === "admin" &&
                    email === "admin@example.com" &&
                    password === "admin123"
                ) {
                    const userData: User = {
                        email,
                        role: "admin",
                        name: "Administrador",
                    };
                    sessionStorage.setItem("user", JSON.stringify(userData));
                    setUser(userData);
                    setIsLoading(false);
                    resolve(true);
                } else if (
                    role === "estudiante" &&
                    email === "estudiante@example.com" &&
                    password === "estudiante123"
                ) {
                    const userData: User = {
                        email,
                        role: "estudiante",
                        name: "Estudiante Demo",
                    };
                    sessionStorage.setItem("user", JSON.stringify(userData));
                    setUser(userData);
                    setIsLoading(false);
                    resolve(true);
                } else {
                    setIsLoading(false);
                    resolve(false);
                }
            }, 1000);
        });
    };

    const logout = () => {
        sessionStorage.removeItem("user");
        setUser(null);
        router.push("/login");
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};
