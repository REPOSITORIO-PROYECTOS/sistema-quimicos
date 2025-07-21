// src/components/RegisterForm.tsx
"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Idealmente, importar desde un archivo compartido:
// import { ROLES_DISPONIBLES, UserRole } from '@/config/roles';
const ROLES_DISPONIBLES = [
    { value: "ADMIN", label: "Administrador" },
    { value: "ALMACEN", label: "Almacén" },
    { value: "VENTAS_LOCAL", label: "Ventas Local" },
    { value: "VENTAS_PEDIDOS", label: "Ventas Pedidos" },
    { value: "CONTABLE", label: "Contable" },
] as const;
type UserRole = typeof ROLES_DISPONIBLES[number]['value'];

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://quimex.sistemataup.online";

const RegisterForm: React.FC = () => {
    const router = useRouter();

    const [usuario, setUsuario] = useState<string>('');
    const [nombre, setNombre] = useState<string>(''); // Nuevo estado para Nombre
    const [apellido, setApellido] = useState<string>(''); // Nuevo estado para Apellido
    const [email, setEmail] = useState<string>('');
    const [contrasena, setContrasena] = useState<string>('');
    const [confirmContrasena, setConfirmContrasena] = useState<string>('');
    const [role, setRole] = useState<UserRole>(ROLES_DISPONIBLES[1].value); // 'ALMACEN' por defecto
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [success, setSuccess] = useState<string | null>(null);

    const handleRegisterSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setSuccess(null);

        if (contrasena !== confirmContrasena) {
            setError("Las contraseñas no coinciden.");
            return;
        }
        // Ahora validamos 'nombre' y 'apellido' en lugar de 'nombreCompleto'
        if (!usuario || !nombre || !apellido || !email || !contrasena || !role) {
            setError("Por favor, completa todos los campos obligatorios.");
            return;
        }
        if (!/\S+@\S+\.\S+/.test(email)) {
            setError("Por favor, introduce un correo electrónico válido.");
            return;
        }
        if (contrasena.length < 8) {
            setError("La contraseña debe tener al menos 8 caracteres.");
            return;
        }

        setIsLoading(true);

        // Los datos ya están separados, no se necesita 'nameParts'
        const registrationData = {
            nombre_usuario: usuario.trim(),
            nombre: nombre.trim(), // Enviar nombre directamente
            apellido: apellido.trim(), // Enviar apellido directamente
            email: email.trim().toLowerCase(),
            contrasena: contrasena, // La contraseña no se trimea usualmente
            rol: role,
        };


        try {
            const response = await fetch(`${API_BASE_URL}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(registrationData),
            });

            const responseData = await response.json();

            if (!response.ok) {
                setError(responseData.message || `Error ${response.status}: No se pudo completar el registro.`);
                setIsLoading(false);
                return;
            }

            setSuccess(responseData.message || "¡Registro exitoso! Serás redirigido a la página de inicio de sesión.");
            
            // Opcional: Limpiar campos después del éxito si no se redirige inmediatamente
            // setUsuario(''); setNombre(''); setApellido(''); setEmail(''); /* ...etc */

            setTimeout(() => {
                router.push('/login');
            }, 2000);
            // No setIsLoading(false) aquí si la redirección desmontará el componente

        } //eslint-disable-next-line
         catch (apiError: any) {
            console.error("RegisterForm: Error en la llamada API", apiError);
            setError(apiError.message || "Error de red o al conectar con el servidor. Intenta de nuevo.");
            setIsLoading(false);
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
                    Crear Cuenta
                </h2>
                <form onSubmit={handleRegisterSubmit} className="space-y-5">
                    <div>
                        <label htmlFor="regUsuario" className={labelClasses}>Usuario</label>
                        <input type="text" id="regUsuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} required disabled={isLoading} className={inputClasses} placeholder="Elige un nombre de usuario" autoComplete="username" />
                    </div>

                    {/* Campo Nombre */}
                    <div>
                        <label htmlFor="regNombre" className={labelClasses}>Nombre(s)</label>
                        <input type="text" id="regNombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required disabled={isLoading} className={inputClasses} placeholder="Tu(s) nombre(s)" autoComplete="given-name" />
                    </div>

                    {/* Campo Apellido */}
                    <div>
                        <label htmlFor="regApellido" className={labelClasses}>Apellido(s)</label>
                        <input type="text" id="regApellido" value={apellido} onChange={(e) => setApellido(e.target.value)} required disabled={isLoading} className={inputClasses} placeholder="Tu(s) apellido(s)" autoComplete="family-name" />
                    </div>

                    <div>
                        <label htmlFor="regEmail" className={labelClasses}>Correo Electrónico</label>
                        <input type="email" id="regEmail" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={isLoading} className={inputClasses} placeholder="tu@correo.com" autoComplete="email" />
                    </div>
                    <div>
                        <label htmlFor="regContrasena" className={labelClasses}>Contraseña</label>
                        <input type="password" id="regContrasena" value={contrasena} onChange={(e) => setContrasena(e.target.value)} required disabled={isLoading} className={inputClasses} placeholder="Mínimo 8 caracteres" autoComplete="new-password" />
                    </div>
                    <div>
                        <label htmlFor="regConfirmContrasena" className={labelClasses}>Confirmar Contraseña</label>
                        <input type="password" id="regConfirmContrasena" value={confirmContrasena} onChange={(e) => setConfirmContrasena(e.target.value)} required disabled={isLoading} className={inputClasses} placeholder="Repite la contraseña" autoComplete="new-password" />
                    </div>
                    <div>
                        <label htmlFor="regRole" className={labelClasses}>Registrarse como:</label>
                        <select 
                            id="regRole" 
                            value={role} 
                            onChange={(e) => setRole(e.target.value as UserRole)} 
                            disabled={isLoading} 
                            required 
                            className={selectClasses}
                        >
                            {ROLES_DISPONIBLES.map(r => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                        </select>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {role === 'ADMIN' 
                                ? 'Advertencia: Se registrará con privilegios de administrador.' 
                                : `Se registrará como ${ROLES_DISPONIBLES.find(r => r.value === role)?.label || role}.`
                            }
                        </p>
                    </div>

                    {error && ( <p className="text-sm font-medium text-destructive text-center bg-destructive/10 p-2 rounded-md border border-destructive/30">{error}</p> )}
                    {success && ( <p className="text-sm font-medium text-green-600 dark:text-green-500 text-center bg-green-500/10 p-2 rounded-md border border-green-500/30">{success}</p> )}

                    <div>
                        <button type="submit" disabled={isLoading || !!success} className={primaryButtonClasses}>
                           {isLoading ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Registrando...
                                </>
                            ) : ( 'Registrarse' )}
                        </button>
                    </div>
                </form>

                 <div className="mt-6 text-center">
                      <p className="text-sm text-muted-foreground">
                          ¿Ya tienes una cuenta?{' '}
                          <Link href="/login" className="font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-sm">
                              Inicia sesión aquí
                          </Link>
                      </p>
                 </div>
            </div>
        </div>
    );
};

export default RegisterForm;