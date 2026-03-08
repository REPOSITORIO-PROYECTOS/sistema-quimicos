// src/providers/auth-provider.tsx
"use client";

import type React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation"; // No necesitamos usePathname aquí si no hay protección de rutas activa

// (Mantén tus definiciones de ROLES_DISPONIBLES_VALUES y UserRole aquí o importadas)
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
    getToken: () => string | null;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://quimex.sistemataup.online";

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    // Efecto para cargar desde localStorage al inicio (solo en cliente)
    useEffect(() => {
        // Cargar estado desde localStorage después de que React se monte en el cliente

        try {
            const storedUser = localStorage.getItem("user");
            const storedToken = localStorage.getItem("authToken");

            if (storedUser && storedToken) {
                const parsedUser = JSON.parse(storedUser);
                if (
                    parsedUser &&
                    typeof parsedUser.usuario === "string" &&
                    typeof parsedUser.name === "string" &&
                    parsedUser.role &&
                    ROLES_DISPONIBLES_VALUES.includes(parsedUser.role as UserRole)
                ) {
                    setUser(parsedUser as User);
                } else {
                    console.warn(
                        "AuthProvider useEffect: Datos de usuario en localStorage no válidos o rol desconocido:",
                        parsedUser?.role
                    );
                    localStorage.removeItem("user");
                    localStorage.removeItem("authToken");
                }
            }
        } catch (error) {
            console.error("AuthProvider useEffect: Error al parsear usuario de localStorage", error);
            localStorage.removeItem("user");
            localStorage.removeItem("authToken");
        } finally {
            setIsLoading(false);
        }
    }, []); // Se ejecuta solo una vez al montar el provider

    const login = async (
        usuario: string,
        password: string,
    ): Promise<boolean> => {
        setIsLoading(true); // Iniciar carga para la operación de login

        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nombre_usuario: usuario, contrasena: password }),
            });

            const data = await response.json();

            if (!response.ok) {

                localStorage.removeItem("user");
                localStorage.removeItem("authToken");
                setUser(null);
                setIsLoading(false); // Finalizar carga en caso de error
                return false;
            }

            const { token, user_info: backendUser } = data as { token?: string; user_info?: BackendUser };

            // Persistir token
            if (token) {
                try {
                    localStorage.setItem("authToken", token);
                } catch { }
            }

            // Intentar armar el usuario con rol del backend; si falta rol, buscarlo con un fallback
            let resolvedRole: UserRole | null = null;
            if (backendUser && backendUser.rol && ROLES_DISPONIBLES_VALUES.includes(backendUser.rol as UserRole)) {
                resolvedRole = backendUser.rol as UserRole;
            } else if (token && backendUser) {
                // Fallback: consultar /auth/usuarios y resolver el rol por id o nombre_usuario
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
                        if (found && typeof found.rol === 'string' && ROLES_DISPONIBLES_VALUES.includes(found.rol as UserRole)) {
                            resolvedRole = found.rol as UserRole;
                        }
                    }
                } catch (e) {
                    console.warn("AuthProvider login: Fallback de rol falló", e);
                }
            }

            if (!token || !backendUser || !resolvedRole) {
                console.error("AuthProvider login: Respuesta incompleta, no se pudo determinar el rol.", backendUser);
                localStorage.removeItem("user");
                localStorage.removeItem("authToken");
                setUser(null);
                setIsLoading(false); // Finalizar carga
                return false;
            }

            const loggedInUser: NonNullable<User> = {
                id: backendUser.id,
                usuario: backendUser.nombre_usuario ?? usuario,
                name: `${backendUser.nombre ?? ""} ${backendUser.apellido ?? ""}`.trim(),
                email: backendUser.email,
                role: resolvedRole,
            };

            localStorage.setItem("user", JSON.stringify(loggedInUser));
            if (token) {
                localStorage.setItem("authToken", token);
            }
            localStorage.setItem("user_name", loggedInUser.name);
            localStorage.setItem("usuario_id", (loggedInUser.id ?? "").toString());
            localStorage.setItem("rol", loggedInUser.role);
            localStorage.setItem("isAdmin", String(loggedInUser.role === "ADMIN"));
            setUser(loggedInUser);

            // La redirección se maneja en LoginForm
            setIsLoading(false);
            return true;

        } catch (error) {
            console.error("AuthProvider login: Error en la petición", error);
            localStorage.removeItem("user");
            localStorage.removeItem("authToken");
            setUser(null);
            setIsLoading(false); // Finalizar carga en caso de excepción
            return false;
        }
        // No es necesario un 'finally' aquí para setIsLoading si todos los caminos lo manejan.
        // Si se llega aquí, router.push() ya se llamó, o un return false con setIsLoading(false) ocurrió.
    };

    const logout = () => {
        setIsLoading(true); // Indicar que estamos procesando algo (opcional pero puede ser bueno para UI)
        try {
            localStorage.removeItem("user");
            localStorage.removeItem("authToken");
            localStorage.removeItem("user_name");
            localStorage.removeItem("usuario_id");
            localStorage.removeItem("rol");
            localStorage.removeItem("isAdmin");
        } catch (error) {
            console.error("AuthProvider logout: Error limpiando localStorage", error);
        }
        setUser(null);
        router.push("/login");
        setIsLoading(false); // Terminar carga después de redirigir
    };

    const getToken = (): string | null => {
        if (typeof window !== "undefined") {
            return localStorage.getItem("authToken");
        }
        return null;
    };

    // Si aún está cargando la información inicial del usuario, podrías mostrar un spinner global
    // o simplemente no renderizar {children} hasta que isLoading sea false.
    // Esto depende de tu UX deseada. Por ahora, renderiza children siempre.
    // if (isLoading) {
    //     return <p>Cargando aplicación...</p>; // O un componente Spinner global
    // }

    return (
        <AuthContext.Provider value={{ user, login, logout, isLoading, getToken }}>
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