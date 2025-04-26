// src/components/RegisterForm.tsx
"use client";

import React, { useState } from 'react'; // Añadimos useEffect si queremos observar estados
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type UserRole = "admin" | "empleado";

const RegisterForm: React.FC = () => {
    const router = useRouter();

    // Estados... (sin cambios)
    const [usuario, setUsuario] = useState<string>('');
    const [nombre, setNombre] = useState<string>('');
    const [contrasena, setContrasena] = useState<string>('');
    const [confirmContrasena, setConfirmContrasena] = useState<string>('');
    const [role, setRole] = useState<UserRole>('empleado');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [success, setSuccess] = useState<string | null>(null);

    // Opcional: useEffect para ver si el estado de success cambia
    // useEffect(() => {
    //    console.log("RegisterForm EFFECT: success cambió a:", success);
    // }, [success]);

    const handleRegisterSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setSuccess(null);
        console.log("RegisterForm: Iniciando submit de registro..."); // Log R1

        // Validaciones... (sin cambios)
        if (contrasena !== confirmContrasena) {
            setError("Las contraseñas no coinciden.");
            console.log("RegisterForm: Error - contraseñas no coinciden."); // Log R2a
            return;
        }
        if (!usuario || !nombre || !contrasena) {
            setError("Por favor, completa todos los campos obligatorios.");
            console.log("RegisterForm: Error - campos incompletos."); // Log R2b
            return;
        }

        setIsLoading(true);

        // --- SIMULACIÓN DE LLAMADA A API DE REGISTRO ---
        console.log("RegisterForm: Simulando llamada API...", { usuario, nombre, role }); // Log R3
        await new Promise(resolve => setTimeout(resolve, 1000)); // Simular espera

        // Define el éxito de la simulación (¡asegúrate que sea true!)
        const simulatedSuccess = true;
        console.log("RegisterForm: Simulación completada. Éxito simulado:", simulatedSuccess); // Log R4

        if (simulatedSuccess) {
             console.log("RegisterForm: Bloque de éxito alcanzado."); // Log R5
             setSuccess("¡Registro exitoso! Serás redirigido a la página de inicio de sesión.");
             // Limpiar campos es opcional aquí si vas a redirigir
             // setUsuario(''); setNombre(''); setContrasena(''); setConfirmContrasena(''); setRole('empleado');
             setError(null); // Asegúrate de limpiar errores previos

             console.log("RegisterForm: Programando redirección a /login en 2 segundos..."); // Log R6
             setTimeout(() => {
                 console.log("RegisterForm: setTimeout callback ejecutado. Intentando redirigir..."); // Log R7
                 try {
                      router.push('/login');
                      console.log("RegisterForm: router.push('/login') llamado sin error inmediato."); // Log R8
                 } catch (redirectError) {
                      console.error("RegisterForm: ¡Error durante router.push!", redirectError); // Log R9 (si push lanza error)
                      setError("Hubo un problema al redirigir. Por favor, ve a la página de login manualmente.");
                      // Aquí sí deberíamos poner setIsLoading(false) si la redirección falla
                      setIsLoading(false);
                 }
             }, 2000); // Espera 2 segundos
             // No establecemos setIsLoading(false) aquí porque la redirección desmontará el componente
        } else {
             // Bloque de error de simulación
             console.error("RegisterForm: Bloque de fallo alcanzado."); // Log R10
             setError("No se pudo completar el registro (simulación). Intenta de nuevo.");
             setSuccess(null);
             setIsLoading(false); // ¡Importante detener la carga en caso de error!
        }
        // --- FIN SIMULACIÓN ---
    };

    // Clases comunes... (sin cambios)
    const labelClasses = "block text-sm font-medium text-muted-foreground mb-1.5";
    const inputClasses = "h-10 px-3 py-2 text-sm w-full bg-input text-foreground border border-input rounded-md shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";
    const selectClasses = `${inputClasses} pl-3 pr-6`;
    const buttonClasses = "w-full inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2";
    const primaryButtonClasses = `${buttonClasses} bg-primary text-primary-foreground hover:bg-primary/90`;

    // Log de render
    // console.log("RegisterForm: Renderizando...");

    return (
        // JSX... (sin cambios estructurales)
        <div className="flex items-center justify-center min-h-screen bg-background px-4 py-8">
            <div className="w-full max-w-md p-6 md:p-8 bg-card rounded-xl shadow-lg border border-border">
                <h2 className="text-2xl md:text-3xl font-semibold text-center text-card-foreground mb-6 md:mb-8">
                    Crear Cuenta
                </h2>
                <form onSubmit={handleRegisterSubmit} className="space-y-5">
                    {/* ... Campos del formulario ... */}
                     {/* Campo Usuario */}
                     <div>
                         <label htmlFor="regUsuario" className={labelClasses}>Usuario</label>
                         <input type="text" id="regUsuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} required disabled={isLoading} className={inputClasses} placeholder="Elige un nombre de usuario" autoComplete="username" />
                     </div>
                     {/* Campo Nombre Completo */}
                     <div>
                         <label htmlFor="regNombre" className={labelClasses}>Nombre Completo</label>
                         <input type="text" id="regNombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required disabled={isLoading} className={inputClasses} placeholder="Tu nombre y apellido" autoComplete="name" />
                     </div>
                     {/* Campo Contraseña */}
                     <div>
                         <label htmlFor="regContrasena" className={labelClasses}>Contraseña</label>
                         <input type="password" id="regContrasena" value={contrasena} onChange={(e) => setContrasena(e.target.value)} required disabled={isLoading} className={inputClasses} placeholder="Crea una contraseña segura" autoComplete="new-password"/>
                     </div>
                     {/* Campo Confirmar Contraseña */}
                     <div>
                         <label htmlFor="regConfirmContrasena" className={labelClasses}>Confirmar Contraseña</label>
                         <input type="password" id="regConfirmContrasena" value={confirmContrasena} onChange={(e) => setConfirmContrasena(e.target.value)} required disabled={isLoading} className={inputClasses} placeholder="Repite la contraseña" autoComplete="new-password"/>
                     </div>
                     {/* Selector de Rol */}
                     <div>
                         <label htmlFor="regRole" className={labelClasses}>Registrarse como:</label>
                         <select id="regRole" value={role} onChange={(e) => setRole(e.target.value as UserRole)} disabled={isLoading} required className={selectClasses}>
                             <option value="empleado">Empleado</option>
                             {/* <option value="admin">Administrador</option> */}
                         </select>
                         <p className="mt-1 text-xs text-muted-foreground">Nota: La asignación de roles puede requerir aprobación.</p>
                     </div>


                    {/* Mensaje de Error */}
                    {error && ( <p className="text-sm font-medium text-destructive text-center bg-destructive/10 p-2 rounded-md border border-destructive/30">{error}</p> )}
                    {/* Mensaje de Éxito */}
                    {success && ( <p className="text-sm font-medium text-green-600 dark:text-green-500 text-center bg-green-500/10 p-2 rounded-md border border-green-500/30">{success}</p> )}

                    {/* Botón Registrarse */}
                    <div>
                        <button type="submit" disabled={isLoading || !!success} className={primaryButtonClasses}>
                           {isLoading ? ( <> {/* Icono SVG */} Registrando... </> ) : ( 'Registrarse' )}
                        </button>
                    </div>
                </form>

                 {/* Enlace para volver a Login */}
                 <div className="mt-6 text-center">
                      <p className="text-sm text-muted-foreground"> ¿Ya tienes una cuenta?{' '} <Link href="/login" className="font-medium text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-sm"> Inicia sesión aquí </Link> </p>
                 </div>
            </div>
        </div>
    );
};

export default RegisterForm;