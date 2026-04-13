// src/providers/auth-provider.tsx
"use client";

import type React from "react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PUBLIC_API_BASE_URL } from "@/lib/publicApiBase";

/**
 * AuthProvider - Gestor centralizado de autenticación para Quimex
 * 
 * Features:
 * - Manejo correcto de SSR/hidratación
 * - Validación de tokens al cargar desde localStorage
 * - Sincronización entre ventanas/tabs
 * - Tipos robustos para roles de usuario
 */

export const ROLES_DISPONIBLES_VALUES = [
    "ADMIN", "ALMACEN", "VENTAS_LOCAL", "VENTAS_PEDIDOS", "CONTABLE"
] as const;
export type UserRole = typeof ROLES_DISPONIBLES_VALUES[number];

type User = {
    id?: number;
    usuario: string;
    name: string;
    email?: string;
    role: UserRole;
} | null;

type BackendUser = {
    id?: number;
    nombre_usuario?: string;
    rol?: string;
    nombre?: string;
    apellido?: string;
    email?: string;
};

type AuthContextType = {
    user: User;
    login: (
        usuario: string,
        password: string,
        roleFromLoginForm?: UserRole
    ) => Promise<boolean>;
    logout: () => void;
    isLoading: boolean;
    isHydrated: boolean; // Nueva bandera para saber si ya cargó desde localStorage
    getToken: () => string | null;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL = PUBLIC_API_BASE_URL;

// Función auxiliar para validar que el objeto user tenga la estructura correcta
function isValidUser(obj: unknown): obj is Exclude<User, null> {
    if (!obj || typeof obj !== "object") return false;
    const u = obj as Record<string, unknown>;
    return (
        typeof u.usuario === "string" &&
        typeof u.name === "string" &&
        typeof u.role === "string" &&
        ROLES_DISPONIBLES_VALUES.includes(u.role as UserRole)
    );
}

function clearAuthStorage() {
    localStorage.removeItem("user");
    localStorage.removeItem("authToken");
    localStorage.removeItem("user_name");
    localStorage.removeItem("usuario_id");
    localStorage.removeItem("rol");
    localStorage.removeItem("isAdmin");
}

function getJwtPayload(token: string): Record<string, unknown> | null {
    try {
        const parts = token.split(".");
        if (parts.length < 2) return null;
        const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const json = atob(base64);
        return JSON.parse(json) as Record<string, unknown>;
    } catch {
        return null;
    }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isHydrated, setIsHydrated] = useState(false);
    const router = useRouter();

    const forceLogoutToLogin = useCallback(() => {
        try {
            clearAuthStorage();
        } catch (error) {
            console.error("AuthProvider: Error limpiando storage en expiracion de sesion", error);
        }
        setUser(null);
        setIsLoading(false);
        router.replace("/login");
    }, [router]);

    /**
     * Efecto para cargar desde localStorage al montar (solo en cliente)
     * Maneja correctamente la hidratación SSR
     */
    useEffect(() => {
        // Este efecto NO se ejecuta en el servidor, solo en cliente
        const initializeAuth = () => {
            try {
                const storedUser = localStorage.getItem("user");
                const storedToken = localStorage.getItem("authToken");

                if (storedUser && storedToken) {
                    try {
                        const parsedUser = JSON.parse(storedUser);

                        // Validar que el usuario tenga la estructura correcta
                        if (isValidUser(parsedUser)) {
                            const payload = getJwtPayload(storedToken);
                            const exp = typeof payload?.exp === "number" ? payload.exp : null;
                            if (exp && Date.now() >= exp * 1000) {
                                clearAuthStorage();
                                setUser(null);
                                return;
                            }

                            // Confiar en los datos guardados locales
                            // Si el token es inválido, lo descubriremos cuando hagamos requests a la API
                            setUser(parsedUser as User);
                            console.info("AuthProvider: Usuario cargado desde localStorage");
                        } else {
                            console.warn(
                                "AuthProvider: Datos de usuario en localStorage inválidos:",
                                parsedUser
                            );
                            localStorage.removeItem("user");
                            localStorage.removeItem("authToken");
                        }
                    } catch (parseError) {
                        console.error("AuthProvider: Error al parsear usuario de localStorage", parseError);
                        localStorage.removeItem("user");
                        localStorage.removeItem("authToken");
                    }
                } else {
                    console.info("AuthProvider: No hay sesión guardada en localStorage");
                }
            } catch (error) {
                console.error("AuthProvider: Error general en inicialización", error);
            } finally {
                // IMPORTANTE: Marcar como hidratado SIEMPRE, incluso si hubo errores
                setIsHydrated(true);
                setIsLoading(false);
            }
        };

        // Ejecutar sincronamente para no bloquear renderizado
        initializeAuth();
    }, []); // Se ejecuta solo una vez al montar el provider

    /**
     * Escuchar cambios de almacenamiento (para sincronización entre tabs)
     */
    useEffect(() => {
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === "user" || e.key === "authToken") {
                // Si otro tab hace logout, sincronizar aquí también
                if (!e.newValue) {
                    setUser(null);
                } else if (e.key === "user" && e.newValue) {
                    try {
                        const newUser = JSON.parse(e.newValue);
                        if (isValidUser(newUser)) {
                            setUser(newUser as User);
                        }
                    } catch (err) {
                        console.error("Error al sincronizar usuario desde otro tab", err);
                    }
                }
            }
        };

        window.addEventListener("storage", handleStorageChange);
        return () => window.removeEventListener("storage", handleStorageChange);
    }, []);

    useEffect(() => {
        const onAuthExpired = () => {
            forceLogoutToLogin();
        };

        window.addEventListener("auth:expired", onAuthExpired);
        return () => window.removeEventListener("auth:expired", onAuthExpired);
    }, [forceLogoutToLogin]);

    useEffect(() => {
        if (!isHydrated) return;

        const validateTokenExpiry = () => {
            const token = localStorage.getItem("authToken");
            if (!token) return;

            const payload = getJwtPayload(token);
            const exp = typeof payload?.exp === "number" ? payload.exp : null;
            if (exp && Date.now() >= exp * 1000) {
                forceLogoutToLogin();
            }
        };

        validateTokenExpiry();
        const intervalId = window.setInterval(validateTokenExpiry, 30000);
        return () => window.clearInterval(intervalId);
    }, [isHydrated, forceLogoutToLogin]);

    /**
     * Función de login
     * Autentica contra el API de Quimex
     */
    const login = async (
        usuario: string,
        password: string,
    ): Promise<boolean> => {
        setIsLoading(true);

        try {
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nombre_usuario: usuario, contrasena: password }),
            });

            const data = await response.json();

            if (!response.ok) {
                console.error("AuthProvider login: Error de autenticación", data);
                localStorage.removeItem("user");
                localStorage.removeItem("authToken");
                setUser(null);
                setIsLoading(false);
                return false;
            }

            const { token, user_info: backendUser } = data as { token?: string; user_info?: BackendUser };

            // Persistir token
            if (token) {
                try {
                    localStorage.setItem("authToken", token);
                } catch (e) {
                    console.error("Error guardando token", e);
                }
            }

            // Resolver el rol del usuario
            let resolvedRole: UserRole | null = null;
            if (backendUser?.rol && ROLES_DISPONIBLES_VALUES.includes(backendUser.rol as UserRole)) {
                resolvedRole = backendUser.rol as UserRole;
            } else if (token && backendUser) {
                // Fallback: consultar /auth/usuarios para resolver el rol
                try {
                    const resUsers = await fetch(`${API_BASE_URL}/auth/usuarios`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (resUsers.ok) {
                        const usersData = await resUsers.json();
                        const list: BackendUser[] = (usersData.usuarios as BackendUser[]) || (usersData as BackendUser[]) || [];
                        const found: BackendUser | undefined = Array.isArray(list)
                            ? list.find((u: BackendUser) => (
                                (backendUser?.id && u.id === backendUser.id) ||
                                (backendUser?.nombre_usuario && u.nombre_usuario === backendUser.nombre_usuario)
                            ))
                            : undefined;
                        if (found?.rol && ROLES_DISPONIBLES_VALUES.includes(found.rol as UserRole)) {
                            resolvedRole = found.rol as UserRole;
                        }
                    }
                } catch (e) {
                    console.warn("AuthProvider login: Fallback de rol falló", e);
                }
            }

            // Validar que tenemos toda la información necesaria
            if (!token || !backendUser || !resolvedRole) {
                console.error("AuthProvider login: Respuesta incompleta del servidor", {
                    hasToken: !!token,
                    hasBackendUser: !!backendUser,
                    hasRole: !!resolvedRole,
                });
                localStorage.removeItem("user");
                localStorage.removeItem("authToken");
                setUser(null);
                setIsLoading(false);
                return false;
            }

            // Crear objeto usuario con toda la información
            const loggedInUser: NonNullable<User> = {
                id: backendUser.id,
                usuario: backendUser.nombre_usuario ?? usuario,
                name: `${backendUser.nombre ?? ""} ${backendUser.apellido ?? ""}`.trim() || usuario,
                email: backendUser.email,
                role: resolvedRole,
            };

            // Guardar en localStorage (de forma segura)
            try {
                localStorage.setItem("user", JSON.stringify(loggedInUser));
                localStorage.setItem("user_name", loggedInUser.name);
                localStorage.setItem("usuario_id", (loggedInUser.id ?? "").toString());
                localStorage.setItem("rol", loggedInUser.role);
                localStorage.setItem("isAdmin", String(loggedInUser.role === "ADMIN"));
            } catch (e) {
                console.error("Error guardando datos de usuario en localStorage", e);
            }

            setUser(loggedInUser);
            setIsLoading(false);
            return true;

        } catch (error) {
            console.error("AuthProvider login: Error en la petición", error);
            localStorage.removeItem("user");
            localStorage.removeItem("authToken");
            setUser(null);
            setIsLoading(false);
            return false;
        }
    };

    /**
     * Función de logout
     */
    const logout = () => {
        try {
            clearAuthStorage();
        } catch (error) {
            console.error("AuthProvider logout: Error limpiando localStorage", error);
        }
        setUser(null);
        router.replace("/login");
    };

    /**
     * Obtener token actual
     */
    const getToken = (): string | null => {
        if (typeof window !== "undefined") {
            return localStorage.getItem("authToken");
        }
        return null;
    };

    // No renderizar nada hasta que el cliente se haya hidratado
    // Esto previene el error de "Text content does not match server-rendered HTML"
    if (!isHydrated) {
        return <div className="flex items-center justify-center min-h-screen">Inicializando autenticación...</div>;
    }

    return (
        <AuthContext.Provider
            value={{
                user,
                login,
                logout,
                isLoading,
                isHydrated,
                getToken,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

/**
 * Hook para usar autenticación en componentes
 */
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth debe ser usado dentro de un AuthProvider");
    }
    return context;
};