// src/contexts/AuthContext.tsx
"use client"; // Necesario porque usa useState y useEffect

import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';

// Define los roles posibles de forma explícita
type UserRole = "admin" | "empleado"; // << CAMBIO: estudiante -> empleado

// --- Tipo para el valor del contexto ---
interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  // << CAMBIO: Firma de login actualizada para incluir rol y devolver boolean
  login: (usuario: string, contrasena: string, role: UserRole) => Promise<boolean>;
  logout: () => void;
  // userRole: UserRole | null; // Podrías añadir el rol del usuario autenticado
}

// --- Crear el Contexto ---
const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true,
  // << CAMBIO: Valor por defecto de login actualizado
  login: async () => { console.error('AuthProvider no encontrado'); return false; },
  logout: () => { console.error('AuthProvider no encontrado'); },
  // userRole: null,
});

// --- Hook Personalizado para usar el Contexto ---
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth debe ser usado dentro de un AuthProvider');
  }
  return context;
};

// --- Componente Proveedor del Contexto ---
interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  //const [user, setUser] = useState<any>()
  // const [userRole, setUserRole] = usetate<UserRole | null>(null); // Opcional: guardar rol

  // --- Efecto para verificar estado inicial ---
  useEffect(() => {
    const checkAuthStatus = () => {
      try {
        // Aquí podrías guardar/leer más info como el rol si es necesario
        const storedAuth = localStorage.getItem('isLoggedInFlag');
        // const storedRole = localStorage.getItem('userRole') as UserRole | null; // Ejemplo
        if (storedAuth === 'true') {
          console.log("AuthProvider: Usuario encontrado en localStorage.");
          setIsAuthenticated(true);
          // setUserRole(storedRole); // Ejemplo
        } else {
          console.log("AuthProvider: No hay usuario en localStorage.");
          setIsAuthenticated(false);
          // setUserRole(null);
        }
      } catch (error) {
        console.error("AuthProvider: Error accediendo a localStorage", error);
        setIsAuthenticated(false);
        // setUserRole(null);
      } finally {
        setIsLoading(false);
      }
    };
    checkAuthStatus();
  }, []);

  // --- Función Login (Actualizada para usar rol y devolver boolean) ---
  // << CAMBIO: Firma actualizada
  const login = async (usuario: string, contrasena: string, role: UserRole): Promise<boolean> => {
    console.log("AuthContext: Intentando login con", { usuario, role }); // No loguear contraseña real

    // --- REEMPLAZA ESTO CON TU LÓGICA DE API REAL ---
    return new Promise((resolve) => {
      // Simulación de llamada a API
      setTimeout(() => {
        // !! Aquí harías tu fetch a tu endpoint de login !!
        // fetch('/api/login', { method: 'POST', body: JSON.stringify({ usuario, contrasena, role }) }) ... etc

        let success = false;
        // << CAMBIO: Lógica de simulación ahora considera el rol
        if (role === 'admin' && usuario === 'admin' && contrasena === '123') {
          console.log("AuthContext: Login simulado exitoso como admin.");
          success = true;
        } else if (role === 'empleado' && usuario === 'empleado' && contrasena === 'pass') { // Ejemplo para empleado
           console.log("AuthContext: Login simulado exitoso como empleado.");
           success = true;
        } else {
          console.log("AuthContext: Login simulado fallido - Usuario, contraseña o rol incorrectos.");
          success = false;
        }

        setIsAuthenticated(success);
        // setUserRole(success ? role : null); // Opcional: guardar rol

        // Guarda o borra el estado en localStorage
        try {
            if (success) {
                localStorage.setItem('isLoggedInFlag', 'true');
                // localStorage.setItem('userRole', role); // Ejemplo
            } else {
                localStorage.removeItem('isLoggedInFlag');
                // localStorage.removeItem('userRole'); // Ejemplo
            }
        } catch(error) {
            console.error("Error actualizando localStorage", error);
        }

        resolve(success); // << CAMBIO: Resuelve con true o false

      }, 1000); // Simula retraso de red
    });
    // --- FIN DE LA SIMULACIÓN ---
  };

  // --- Función Logout ---
  const logout = () => {
    console.log("AuthContext: Cerrando sesión.");
    setIsAuthenticated(false);
    // setUserRole(null); // Opcional: limpiar rol
    try {
        localStorage.removeItem('isLoggedInFlag');
        // localStorage.removeItem('userRole'); // Ejemplo
    } catch(error) {
         console.error("Error borrando de localStorage al hacer logout", error);
    }
  };

  // --- Valor a proveer por el contexto ---
  const value = {
    isAuthenticated,
    isLoading,
    login,
    logout,
    // userRole, // Opcional: exponer el rol
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};