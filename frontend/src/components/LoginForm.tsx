// src/components/LoginForm.tsx
"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider'; // Asegúrate que la ruta a auth-provider sea correcta

// Reutilizamos la definición de ROLES_DISPONIBLES, idealmente esto estaría en un archivo compartido
const ROLES_DISPONIBLES = [
    { value: "ADMIN", label: "Administrador" },
    { value: "ALMACEN", label: "Almacén" },
    { value: "VENTAS_LOCAL", label: "Ventas Local" },
    { value: "VENTAS_PEDIDOS", label: "Ventas Pedidos" },
    { value: "CONTABLE", label: "Contable" },
] as const;

type UserRole = typeof ROLES_DISPONIBLES[number]['value'];

const LoginForm: React.FC = () => {
    const { login } = useAuth();
    const router = useRouter();

    const [loginUsuario, setLoginUsuario] = useState<string>('');
    const [loginContrasena, setLoginContrasena] = useState<string>('');
    // Establecer un rol inicial, por ejemplo, el más común o el primero
    const [loginRole] = useState<UserRole>(ROLES_DISPONIBLES[1].value); // 'ALMACEN' por defecto, ajústalo si es necesario
    const [loginIsLoading, setLoginIsLoading] = useState<boolean>(false);
    const [loginError, setLoginError] = useState<string | null>(null); // Para mostrar errores en el UI

    const handleLoginSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLoginIsLoading(true);
        setLoginError(null); // Limpiar errores previos
        console.log("LoginForm: Iniciando submit...", { loginUsuario, loginRole });

        try {
            // La función `login` de AuthProvider espera 'usuario', 'password', y opcionalmente 'role'.
            // El backend determinará el rol real del usuario. El 'role' aquí
            // es más una formalidad si tu AuthProvider lo requiere en su firma.
            const loginSuccess = await login(loginUsuario, loginContrasena, loginRole);
            console.log("LoginForm: login() retornó:", loginSuccess);

            if (!loginSuccess) {
                // El AuthProvider ya debería manejar la lógica de mostrar errores si se comunica con el backend.
                // Si AuthProvider no devuelve un mensaje específico, puedes poner uno genérico aquí.
                setLoginError('Usuario, contraseña o rol incorrectos. Por favor, verifica los datos.');
                alert('Usuario, contraseña o rol incorrectos. Por favor, verifica los datos.');
                console.log("LoginForm: ¡Fallo detectado por loginSuccess false!");
            } else {
                console.log("LoginForm: Login exitoso. AuthProvider debería haber manejado la redirección.");
                // No es necesario redirigir desde aquí si AuthProvider ya lo hace.
            }
            setLoginIsLoading(false);
        } //eslint-disable-next-line
         catch (err: any) {
            console.error("LoginForm: Error durante el login (excepción):", err);
            const errorMessage = err.message || 'Ocurrió un error inesperado al intentar iniciar sesión.';
            setLoginError(`Error: ${errorMessage}`);
        } finally {
            console.log("LoginForm: Finalizando submit, setLoading a false.");
            setLoginIsLoading(false);
        }
    };

    const labelClasses = "block text-sm font-medium text-muted-foreground mb-1.5";
    const inputClasses = "h-10 px-3 py-2 text-sm w-full bg-input text-foreground border border-input rounded-md shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";
  
    const buttonClasses = "w-full inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2";
    const primaryButtonClasses = `${buttonClasses} bg-primary text-primary-foreground hover:bg-primary/90`;

    return (
        <div className="flex items-center justify-center min-h-screen bg-background px-4 py-8">
            <div className="w-full max-w-md p-6 md:p-8 bg-card rounded-xl shadow-lg border border-border">
                <h2 className="text-2xl md:text-3xl font-semibold text-center text-card-foreground mb-6 md:mb-8">
                    Iniciar Sesión
                </h2>

                <form onSubmit={handleLoginSubmit} className="space-y-5">
                    <div>
                        <label htmlFor="loginUsuario" className={labelClasses}>Usuario</label>
                        <input
                            type="text"
                            id="loginUsuario"
                            value={loginUsuario}
                            onChange={(e) => setLoginUsuario(e.target.value)}
                            required
                            disabled={loginIsLoading}
                            className={inputClasses}
                            placeholder="Nombre de usuario"
                            autoComplete="username"
                        />
                    </div>

                    <div>
                        <label htmlFor="loginContrasena" className={labelClasses}>Contraseña</label>
                        <input
                            type="password"
                            id="loginContrasena"
                            value={loginContrasena}
                            onChange={(e) => setLoginContrasena(e.target.value)}
                            required
                            disabled={loginIsLoading}
                            className={inputClasses}
                            placeholder="********"
                            autoComplete="current-password"
                        />
                    </div>

                    {/*<div>
                        <label htmlFor="loginRole" className={labelClasses}>Rol (Referencial)</label>
                        <select
                            id="loginRole"
                            value={loginRole}
                            onChange={(e) => setLoginRole(e.target.value as UserRole)}
                            disabled={loginIsLoading}
                            required // Si tu AuthProvider lo necesita
                            className={selectClasses}
                        >
                            {ROLES_DISPONIBLES.map(r => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                        </select>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Nota: El sistema verificará tu rol real al iniciar sesión.
                        </p>
                    </div>*/}

                    {/* Mostrar mensajes de error */}
                    {loginError && (
                        <p className="text-sm font-medium text-destructive text-center bg-destructive/10 p-2 rounded-md border border-destructive/30">
                            {loginError}
                        </p>
                    )}

                    <div>
                        <button type="submit" disabled={loginIsLoading} className={primaryButtonClasses}>
                            {loginIsLoading ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Ingresando...
                                </>
                            ) : 'Ingresar'}
                        </button>
                    </div>
                </form>

                <div className="mt-6 text-center">
                    <p className="text-sm text-muted-foreground">
                        ¿No tienes una cuenta?{' '}
                        <button
                            type="button"
                            onClick={() => router.push('/register')} // Cambiado a button con onClick para consistencia
                            className="font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-sm"
                            disabled={loginIsLoading} // Deshabilitar durante la carga
                        >
                            Regístrate aquí
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default LoginForm;