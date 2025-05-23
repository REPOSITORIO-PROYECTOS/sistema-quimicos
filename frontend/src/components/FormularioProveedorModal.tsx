// components/FormularioProveedorModal.tsx
"use client";

import { useState, FormEvent, useEffect } from 'react';
import FormularioProveedorFields, { ProveedorFieldsData } from './FormularioProveedorFields'; // Asegúrate que la ruta sea correcta

// Interfaz para los datos del proveedor completos que maneja el modal (incluye ID)
// Hereda de ProveedorFieldsData y añade 'id'.
interface ProveedorModalData extends ProveedorFieldsData {
  id?: number;
  // activo?: boolean; // Si el modal también necesitara manejar el estado 'activo' directamente
}

// Estado inicial para los datos del formulario del modal.
// Como este modal es principalmente para edición, el 'id' será llenado desde 'proveedorToEdit'.
const initialModalFormData: ProveedorModalData = {
  id: undefined, // Se espera que venga de proveedorToEdit para la edición
  nombre: '',
  cuit: '',
  direccion: '',
  telefono: '',
  email: '',
  contacto: '',
  condiciones_pago: '',
};

interface FormularioProveedorModalProps {
  proveedorToEdit?: ProveedorModalData | null; // Proveedor para editar. Es opcional por si en el futuro se reutiliza para crear.
  onClose: () => void; // Función para cerrar el modal
  onSaveSuccess: (message: string) => void; // Función a llamar tras guardar exitosamente, puede pasar un mensaje.
  apiBaseUrl: string; // URL base de la API
}

export default function FormularioProveedorModal({
  proveedorToEdit,
  onClose,
  onSaveSuccess,
  apiBaseUrl,
}: FormularioProveedorModalProps) {
  const [formData, setFormData] = useState<ProveedorModalData>(initialModalFormData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null); // Mensaje de éxito local del modal
  const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;

  useEffect(() => {
    // Limpiar mensajes de error/éxito al abrir el modal o cambiar el proveedor a editar
    setError(null);
    setSuccessMessage(null);

    if (proveedorToEdit && proveedorToEdit.id) {
      // Si se proporciona un proveedor para editar, llenar el formulario con sus datos
      setFormData({
        id: proveedorToEdit.id,
        nombre: proveedorToEdit.nombre || '',
        cuit: proveedorToEdit.cuit || '',
        direccion: proveedorToEdit.direccion || '',
        telefono: proveedorToEdit.telefono || '',
        email: proveedorToEdit.email || '',
        contacto: proveedorToEdit.contacto || '',
        condiciones_pago: proveedorToEdit.condiciones_pago || '',
      });
    } else {
      // Si no hay proveedor para editar (o si se usara para crear), resetear a datos iniciales.
      // Para el flujo actual de edición, esto no debería ocurrir a menos que 'proveedorToEdit' sea null o no tenga ID.
      setFormData(initialModalFormData);
    }
  }, [proveedorToEdit]); // El efecto se ejecuta cuando 'proveedorToEdit' cambia

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    if (!formData.nombre.trim()) {
      setError("El nombre del proveedor es obligatorio.");
      setIsLoading(false);
      return;
    }

    if (!token) {
        setError("No se encontró token de autenticación. Por favor, inicie sesión.");
        setIsLoading(false);
        return;
    }

    // Este modal está enfocado en la edición. Se necesita un ID.
    if (!formData.id) { //formData.id viene de proveedorToEdit.id
        setError("Error crítico: No se ha proporcionado un ID de proveedor para la edición.");
        setIsLoading(false);
        return;
    }

    const url = `${apiBaseUrl}/proveedores/editar/${formData.id}`;
    const method = 'PUT';

    try {
      const response = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(formData), // Enviar todos los datos del formulario (incluyendo id, aunque el backend lo toma del URL)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Error al actualizar el proveedor.` }));
        throw new Error(errorData.message || `Error ${response.status}: ${response.statusText}`);
      }

      // const result = await response.json(); // El backend devuelve el proveedor actualizado
      const successMsg = `¡Proveedor "${formData.nombre}" actualizado exitosamente!`;
      setSuccessMessage(successMsg); // Mostrar mensaje de éxito en el modal
      
      // Pequeño delay para que el usuario vea el mensaje de éxito antes de cerrar y refrescar
      setTimeout(() => {
        onSaveSuccess(successMsg); // Llama a la función para refrescar la lista y/o mostrar mensaje global
      }, 1500); // Cierra y/o refresca después de 1.5 segundos
      //eslint-disable-next-line
    } catch (err: any) {
      console.error(`Error al actualizar proveedor con ID ${formData.id}:`, err);
      setError(err.message || 'Ocurrió un error inesperado al actualizar.');
    } finally {
      // Solo establecer isLoading a false si hubo un error,
      // ya que si hay éxito, el modal se cerrará y el estado de carga del modal deja de ser relevante.
      // O si no se llegó al mensaje de éxito (por ej, validación fallida antes del fetch)
      if (error || !successMessage) { 
        setIsLoading(false);
      }
    }
  };

  return (
    // Overlay del modal
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 h-full w-full z-50 flex justify-center items-start overflow-y-auto p-4 pt-10 sm:pt-16">
      {/* Contenido del Modal (el formulario en sí) */}
      <form
        onSubmit={handleSubmit}
        className="bg-white shadow-xl rounded-lg w-full max-w-2xl relative 
                   max-h-[calc(100vh-5rem)] sm:max-h-[calc(100vh-8rem)] overflow-y-auto"
      >
        {/* Encabezado del Modal con Título y Botón de Cerrar (sticky) */}
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-200 z-10">
            <h2 className="text-xl font-semibold text-gray-800">
              {/* El título indica que se está editando. Podría mostrar el nombre del proveedor si se desea. */}
              Editar Proveedor
            </h2>
            <button
                type="button"
                onClick={onClose} // Llama a la función para cerrar el modal
                disabled={isLoading} // Deshabilitar si está cargando
                className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 text-2xl font-bold disabled:text-gray-200"
                aria-label="Cerrar modal"
            >
                ×
            </button>
        </div>

        {/* Cuerpo del Formulario con scroll (contiene los campos y mensajes) */}
        <div className="p-6 space-y-6">
            {/* Mensaje de Error */}
            {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
                <strong className="font-bold">Error: </strong>
                <span className="block sm:inline">{error}</span>
            </div>
            )}
            {/* Mensaje de Éxito (local del modal) */}
            {successMessage && !error && ( // Mostrar solo si no hay error pendiente
            <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative" role="alert">
                <strong className="font-bold">Éxito: </strong>
                <span className="block sm:inline">{successMessage}</span>
            </div>
            )}

            {/* Componente reutilizable para los campos del formulario */}
            <FormularioProveedorFields formData={formData} handleChange={handleChange} />
        </div>

        {/* Pie del Modal con Botones de Acción (sticky) */}
        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row sm:justify-end sm:space-x-3 space-y-2 sm:space-y-0">
            <button
                type="button"
                onClick={onClose} // Llama a la función para cerrar el modal
                disabled={isLoading} // Deshabilitar si está cargando
                className="w-full sm:w-auto flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
            >
                Cancelar
            </button>
            <button
                type="submit" // Envía el formulario
                disabled={isLoading || !!successMessage} // Deshabilitar si está cargando o si ya hay mensaje de éxito (esperando cierre)
                className="w-full sm:w-auto flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300 disabled:cursor-not-allowed"
            >
                {/* El texto del botón indica la acción de guardar cambios */}
                {isLoading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
        </div>
      </form>
    </div>
  );
}