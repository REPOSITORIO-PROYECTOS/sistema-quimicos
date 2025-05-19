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
    const [isLoading, setIsLoading] = useState(true); // Inicia como true, para efecto de carga inicial
    const router = useRouter();
    
    // Efecto para cargar desde sessionStorage al inicio
    useEffect(() => {
        console.log("AuthProvider useEffect: Verificando sessionStorage...");
       
        try {
            const storedUser = sessionStorage.getItem("user");
            const storedToken = sessionStorage.getItem("authToken");

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
                    //foundUser = true;
                    console.log("AuthProvider useEffect: Usuario cargado desde sessionStorage", parsedUser);
                } else {
                    console.warn(
                        "AuthProvider useEffect: Datos de usuario en sessionStorage no válidos o rol desconocido:",
                        parsedUser?.role
                    );
                    sessionStorage.removeItem("user");
                    sessionStorage.removeItem("authToken");
                }
            } else {
                 console.log("AuthProvider useEffect: No hay usuario o token en sessionStorage.");
            }
        } catch (error) {
            console.error("AuthProvider useEffect: Error al parsear usuario de sessionStorage", error);
            sessionStorage.removeItem("user");
            sessionStorage.removeItem("authToken");
        } finally {
            setIsLoading(false); // CRÍTICO: Asegurar que isLoading se ponga en false
            console.log("AuthProvider useEffect: Carga inicial completada. isLoading: false");
        }
    }, []); // Se ejecuta solo una vez al montar el provider

    const login = async (
        usuario: string,
        password: string,
        roleFromLoginForm?: UserRole
    ): Promise<boolean> => {
        setIsLoading(true); // Iniciar carga para la operación de login
        console.log("AuthProvider login: Intentando...", { usuario, roleFromLoginForm });

        try {
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nombre_usuario: usuario, contrasena: password }),
            });

            const data = await response.json();
            
            if (!response.ok) {
                
                console.error("AuthProvider login: Fallido -", data.message || `Error ${response.status}`);
                sessionStorage.removeItem("user");
                sessionStorage.removeItem("authToken");
                setUser(null);
                setIsLoading(false); // Finalizar carga en caso de error
                return false;
            }
            
            const { token, user_info: backendUser } = data;
            
            localStorage.setItem("user",backendUser)
            localStorage.setItem("token",token)
            
            if (!token || !backendUser || !backendUser.rol || !ROLES_DISPONIBLES_VALUES.includes(backendUser.rol as UserRole)) {
                console.error("AuthProvider login: Respuesta incompleta o rol inválido del backend.", backendUser);
                sessionStorage.removeItem("user");
                sessionStorage.removeItem("authToken");
                setUser(null);
                setIsLoading(false); // Finalizar carga
                return false;
            }

            const loggedInUser: User = {
                id: backendUser.id,
                usuario: backendUser.nombre_usuario,
                name: `${backendUser.nombre} ${backendUser.apellido}`.trim(),
                email: backendUser.email,
                role: backendUser.rol as UserRole,
            };

            sessionStorage.setItem("user", JSON.stringify(loggedInUser));
            sessionStorage.setItem("authToken", token);
            setUser(loggedInUser);
            console.log(`AuthProvider login: Éxito como ${loggedInUser.role}. Redirigiendo...`);

            // La redirección se maneja ahora. setIsLoading(false) se hará después o el componente se desmontará.
            // No necesitamos un setIsLoading(false) explícito aquí si la redirección ocurre.
            // El estado de carga se resolverá con la nueva carga de página o
            // si la redirección falla (aunque router.push no suele fallar así).
            router.push("/"); // O a la ruta de dashboard principal
            // setIsLoading(false); // Opcional: podrías ponerlo aquí, pero la redirección puede desmontar.
                                // Si la redirección es a una ruta protegida que vuelve a verificar el auth,
                                // el isLoading del AuthProvider se reseteará de todas formas.
            setIsLoading(false);
            return true;

        } catch (error) {
            console.error("AuthProvider login: Error en la petición", error);
            sessionStorage.removeItem("user");
            sessionStorage.removeItem("authToken");
            setUser(null);
            setIsLoading(false); // Finalizar carga en caso de excepción
            return false;
        }
        // No es necesario un 'finally' aquí para setIsLoading si todos los caminos lo manejan.
        // Si se llega aquí, router.push() ya se llamó, o un return false con setIsLoading(false) ocurrió.
    };

    const logout = () => {
        console.log("AuthProvider logout: Cerrando sesión...");
        setIsLoading(true); // Indicar que estamos procesando algo (opcional pero puede ser bueno para UI)
        try {
            sessionStorage.removeItem("user");
            sessionStorage.removeItem("authToken");
        } catch (error) {
            console.error("AuthProvider logout: Error limpiando sessionStorage", error);
        }
        setUser(null);
        router.push("/login");
        setIsLoading(false); // Terminar carga después de redirigir
    };

    const getToken = (): string | null => {
        if (typeof window !== "undefined") {
            return sessionStorage.getItem("authToken");
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