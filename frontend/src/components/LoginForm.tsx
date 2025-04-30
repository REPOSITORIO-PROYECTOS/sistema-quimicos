// src/components/LoginForm.tsx
"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';

type UserRole = "admin" | "empleado";

const LoginForm: React.FC = () => {
    const { login } = useAuth();
    const router = useRouter();

    const [loginUsuario, setLoginUsuario] = useState<string>('');
    const [loginContrasena, setLoginContrasena] = useState<string>('');
    const [loginRole, setLoginRole] = useState<UserRole>('empleado');
    const [loginIsLoading, setLoginIsLoading] = useState<boolean>(false);

    const handleLoginSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLoginIsLoading(true);
        console.log("LoginForm: Iniciando submit...");

        try {
            const loginSuccess = await login(loginUsuario, loginContrasena, loginRole);
            console.log("LoginForm: login() retornó:", loginSuccess);

            if (!loginSuccess) {
                alert('El usuario, la contraseña o el rol no son correctos. Por favor, verifica los datos.');
                console.log("LoginForm: ¡Fallo detectado! Mostrando alert.");
            } else {
                console.log("LoginForm: Login exitoso. AuthProvider debería manejar la redirección.");
            }
            //eslint-disable-next-line
        } catch (err: any) {
            console.error("LoginForm: Error durante el login (excepción):", err);
            const errorMessage = err.message || 'Ocurrió un error inesperado al intentar iniciar sesión.';
            alert(`Error: ${errorMessage}`);
        } finally {
            console.log("LoginForm: Finalizando submit, setLoading a false.");
            setLoginIsLoading(false);
        }
    };

    const labelClasses = "block text-sm font-medium text-muted-foreground mb-1.5";
    const inputClasses = "h-10 px-3 py-2 text-sm w-full bg-input text-foreground border border-input rounded-md shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";
    const selectClasses = `${inputClasses} pl-3 pr-6`;
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

                    <div>
                        <label htmlFor="loginRole" className={labelClasses}>Rol</label>
                        <select
                            id="loginRole"
                            value={loginRole}
                            onChange={(e) => setLoginRole(e.target.value as UserRole)}
                            disabled={loginIsLoading}
                            required
                            className={selectClasses}
                        >
                            <option value="empleado">Empleado</option>
                            <option value="admin">Administrador</option>
                        </select>
                    </div>

                    <div>
                        <button type="submit" disabled={loginIsLoading} className={primaryButtonClasses}>
                            {loginIsLoading ? 'Ingresando...' : 'Ingresar'}
                        </button>
                    </div>
                </form>

                {/* Redirección usando router.push */}
                <div className="mt-6 text-center">
                    <p className="text-sm text-muted-foreground">
                        ¿No tienes una cuenta?{' '}
                        <button
                            type="button"
                            onClick={() => router.push('/register')}
                            className="font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-sm"
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
