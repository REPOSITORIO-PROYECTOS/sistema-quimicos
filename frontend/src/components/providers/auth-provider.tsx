// src/providers/auth-provider.tsx
"use client";

import type React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type UserRole = "admin" | "empleado";

type User = {
    usuario: string;
    name: string;
    role: UserRole;
} | null;

type AuthContextType = {
    user: User;
    login: (
        usuario: string,
        password: string,
        role: UserRole
    ) => Promise<boolean>;
    logout: () => void;
    isLoading: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    //const pathname = usePathname();

    // Efecto para cargar desde sessionStorage al inicio
    useEffect(() => {
        const storedUser = sessionStorage.getItem("user");
        if (storedUser) {
            try {
                const parsedUser = JSON.parse(storedUser);
                // Validación básica del objeto parseado
                if (parsedUser && typeof parsedUser.usuario === 'string' && typeof parsedUser.name === 'string' && (parsedUser.role === 'admin' || parsedUser.role === 'empleado')) {
                     setUser(parsedUser as User);
                } else {
                    console.warn("AuthProvider: Datos de usuario en sessionStorage no válidos.");
                    sessionStorage.removeItem("user");
                }
            } catch (error) {
                console.error("AuthProvider: Error al parsear usuario de sessionStorage", error);
                sessionStorage.removeItem("user");
            }
        }
        setIsLoading(false);
    }, []);

    // useEffect de protección de rutas (mantenlo comentado mientras depuras el login/link)
    // useEffect(() => {
    //     if (!isLoading) {
    //          // Lógica para redirigir si no está logueado fuera de login/register
    //          if (!user && pathname !== "/login" && pathname !== "/register") {
    //              router.push("/login");
    //          }
    //          // Lógica para redirigir si está logueado y en login/register (OJO: esto se maneja ahora en login())
    //          // else if (user && (pathname === "/login" || pathname === "/register")) {
    //          //    router.push('/'); // O a su dashboard
    //          // }
    //          // Lógica de protección por roles (si es necesaria)
    //     }
    // }, [user, isLoading, pathname, router]);

    const login = async (
        usuario: string,
        password: string,
        role: UserRole
    ): Promise<boolean> => {
        setIsLoading(true);
        console.log("AuthProvider: Intentando login con", { usuario, role });

        // Simulación de autenticación (Reemplazar con API real)
        return new Promise((resolve) => {
            setTimeout(() => {
                let success = false;
                let userData: User = null;

                // Lógica de credenciales simuladas (¡Ajusta esto!)
                if (role === "admin" && usuario === "admin_user" && password === "admin123") {
                    userData = { usuario, role: "admin", name: "Administrador" };
                    success = true;
                } else if (role === "empleado" && usuario === "empleado_user" && password === "empleado123") {
                    userData = { usuario, role: "empleado", name: "Empleado Demo" };
                    success = true;
                } else {
                    success = false;
                }

                if (success && userData) {
                    console.log(`AuthProvider: Login como ${userData.role} exitoso.`);
                    try {
                        sessionStorage.setItem("user", JSON.stringify(userData));
                        setUser(userData); // Actualiza estado

                        // --- ✨ CORRECCIÓN DE REDIRECCIÓN ✨ ---
                        // Redirige SIEMPRE a la raíz ('/') después del login exitoso.
                        // Cambia '/' por la ruta de dashboard principal si es diferente.
                        // Si necesitas rutas DIFERENTES por rol, asegúrate que esas rutas existan.
                        const redirectPath = '/';
                        console.log(`AuthProvider: Redirigiendo a ${redirectPath} después del login...`);
                        router.push(redirectPath); // ¡¡NAVEGACIÓN EXPLÍCITA!!
                        // --- ✨ FIN CORRECCIÓN ✨ ---

                        // Nota: setIsLoading podría ir después de router.push,
                        // ya que la navegación puede desmontar el componente actual.
                        // Dejarlo aquí está bien por ahora.
                        setIsLoading(false);
                        resolve(true); // Éxito

                    } catch (error) {
                         console.error("AuthProvider: Error guardando usuario o redirigiendo", error);
                         try { sessionStorage.removeItem("user"); } catch(e){console.log(e);}
                         setUser(null);
                         setIsLoading(false);
                         resolve(false); // Falla
                    }
                } else {
                     // Login fallido
                     console.log("AuthProvider: Login fallido - Credenciales o rol incorrectos.");
                     try { sessionStorage.removeItem("user"); } catch (error) {console.log(error);}
                     setUser(null);
                     setIsLoading(false);
                     resolve(false); // Falla
                }
            }, 500); // Reducido el timeout para pruebas más rápidas
        });
    };

    const logout = () => {
        console.log("AuthProvider: Cerrando sesión...");
        try {
            sessionStorage.removeItem("user");
        } catch (error) {
            console.error("AuthProvider: Error limpiando sessionStorage al hacer logout", error);
        }
        setUser(null);
        router.push("/login"); // Redirige a login al cerrar sesión
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