"use client";

import { useState, FormEvent, useEffect } from 'react';
import FormularioProveedorFields, { ProveedorFieldsData } from './FormularioProveedorFields';

interface ProveedorModalData extends ProveedorFieldsData {
  id?: number;
}

const initialModalFormData: ProveedorModalData = {
  id: undefined,
  nombre: '',
  cuit: '',
  direccion: '',
  telefono: '',
  email: '',
  contacto: '',
  condiciones_pago: '',
};

interface FormularioProveedorModalProps {
  proveedorToEdit?: ProveedorModalData | null;
  onClose: () => void;
  onSaveSuccess: (message: string) => void;
  apiBaseUrl: string;
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
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const token = typeof window !== 'undefined'
    ? (localStorage.getItem('authToken') || sessionStorage.getItem('authToken'))
    : null;

  useEffect(() => {
    setError(null);
    setSuccessMessage(null);

    if (proveedorToEdit && proveedorToEdit.id) {
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
      setFormData(initialModalFormData);
    }
  }, [proveedorToEdit]);

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
      setError('El nombre del proveedor es obligatorio.');
      setIsLoading(false);
      return;
    }

    if (!token) {
      setError('No se encontro token de autenticacion. Por favor, inicie sesion.');
      setIsLoading(false);
      return;
    }

    if (!formData.id) {
      setError('Error critico: No se ha proporcionado un ID de proveedor para la edicion.');
      setIsLoading(false);
      return;
    }

    const url = `${apiBaseUrl}/proveedores/editar/${formData.id}`;

    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData?.error ||
          errorData?.message ||
          errorData?.mensaje ||
          `Error ${response.status}: ${response.statusText}`
        );
      }

      const successMsg = `¡Proveedor "${formData.nombre}" actualizado exitosamente!`;
      setSuccessMessage(successMsg);
      setTimeout(() => {
        onSaveSuccess(successMsg);
      }, 900);
      //eslint-disable-next-line
    } catch (err: any) {
      setError(err.message || 'Ocurrio un error inesperado al actualizar.');
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 pt-10 sm:pt-14">
      <form
        onSubmit={handleSubmit}
        className="relative max-h-[calc(100vh-4.5rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur">
          <h2 className="text-xl font-bold text-slate-800">Editar Proveedor</h2>
          <p className="mt-1 text-sm text-slate-500">Actualiza los datos del proveedor seleccionado.</p>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="absolute right-4 top-2 text-3xl font-light text-slate-400 transition hover:text-slate-700 disabled:text-slate-300"
            aria-label="Cerrar modal"
          >
            ×
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              <span className="font-semibold">Error: </span>
              <span>{error}</span>
            </div>
          )}

          {successMessage && !error && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="alert">
              <span className="font-semibold">Exito: </span>
              <span>{successMessage}</span>
            </div>
          )}

          <FormularioProveedorFields formData={formData} handleChange={handleChange} />
        </div>

        <div className="sticky bottom-0 flex flex-col gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isLoading || !!successMessage}
            className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 sm:w-auto"
          >
            {isLoading ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      </form>
    </div>
  );
}
