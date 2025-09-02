// src/components/LoginForm.tsx
"use client";

import React, { useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider'; // Asegúrate que la ruta a auth-provider sea correcta
import Image from 'next/image';

const LoginForm: React.FC = () => {
    const { login } = useAuth();

    const [loginUsuario, setLoginUsuario] = useState<string>('');
    const [loginContrasena, setLoginContrasena] = useState<string>('');
    const [loginIsLoading, setLoginIsLoading] = useState<boolean>(false);
    const [loginError, setLoginError] = useState<string | null>(null); // Para mostrar errores en el UI

    const handleLoginSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLoginIsLoading(true);
        setLoginError(null); // Limpiar errores previos

        try {
            const loginSuccess = await login(loginUsuario, loginContrasena);

            if (!loginSuccess) {
                setLoginError('Usuario o contraseña incorrectos. Por favor, verifica los datos.');
                alert('Usuario o contraseña incorrectos. Por favor, verifica los datos.');
            } else {
                // No es necesario redirigir desde aquí si AuthProvider ya lo hace.
            }
            setLoginIsLoading(false);
        } //eslint-disable-next-line
         catch (err: any) {
            console.error("LoginForm: Error durante el login (excepción):", err);
            const errorMessage = err.message || 'Ocurrió un error inesperado al intentar iniciar sesión.';
            setLoginError(`Error: ${errorMessage}`);
        } finally {
            setLoginIsLoading(false);
        }
    };

    const labelClasses = "block text-sm font-medium text-muted-foreground mb-1.5";
    const inputClasses = "h-10 px-3 py-2 text-sm w-full bg-input text-foreground border border-input rounded-md shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";

    return (
        <div className="relative min-h-screen flex items-center justify-center bg-gray-100">
            <Image
                src="/login-bg.jpg"
                alt="Fondo Login Quimex"
                layout="fill"
                objectFit="cover"
                className="z-0 opacity-80"
                priority
            />
            <div className="absolute inset-0 flex items-center justify-center z-10">
                <form
                    onSubmit={handleLoginSubmit}
                    className="bg-white bg-opacity-95 rounded-xl shadow-2xl p-8 w-full max-w-md flex flex-col gap-6 border-4 border-[#1a237e]"
                >
                    <div className="flex flex-col items-center mb-2">
                        <span className="text-4xl font-bold tracking-wide mb-1" style={{ color: '#1a237e', fontFamily: 'inherit', display: 'inline-block' }}>
                          Qu
                          <span style={{ position: 'relative', display: 'inline-block' }}>
                            <span style={{ color: '#1a237e' }}>i</span>
                            <span style={{ position: 'absolute', left: '50%', top: '0.12em', transform: 'translateX(-50%)', color: '#d32f2f', fontSize: '1em', fontWeight: 'bold', lineHeight: 0 }}>•</span>
                          </span>
                          mex
                        </span>
                        <span className="text-lg font-semibold text-[#1a237e] mb-2">SISTEMA DE GESTIÓN</span>
                        <span className="text-base text-[#1a237e] font-medium">Ingresá tus datos para acceder</span>
                    </div>

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

                    {/* Mostrar mensajes de error */}
                    {loginError && (
                        <p className="text-sm font-medium text-destructive text-center bg-destructive/10 p-2 rounded-md border border-destructive/30">
                            {loginError}
                        </p>
                    )}

                    <div>
                        <button
                            type="submit"
                            disabled={loginIsLoading}
                            className="w-full mt-2 py-2 rounded-lg bg-[#d32f2f] text-white font-bold text-lg shadow-md hover:bg-[#b71c1c] transition-colors duration-200"
                        >
                            {loginIsLoading ? 'Ingresando...' : 'INGRESAR'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default LoginForm;