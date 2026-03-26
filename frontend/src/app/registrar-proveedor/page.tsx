"use client";

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import FormularioProveedorFields, { ProveedorFieldsData } from '@/components/FormularioProveedorFields';

const API_BASE_URL = 'https://quimex.sistemataup.online/api';

const initialPageFormData: ProveedorFieldsData = {
  nombre: '',
  cuit: '',
  direccion: '',
  telefono: '',
  email: '',
  contacto: '',
  condiciones_pago: '',
};

export default function RegistrarProveedorPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<ProveedorFieldsData>(initialPageFormData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const token = typeof window !== 'undefined'
    ? (localStorage.getItem("authToken") || sessionStorage.getItem("authToken"))
    : null;

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
      setError("No se encontro token de autenticacion. Por favor, inicie sesion.");
      setIsLoading(false);
      return;
    }

    const payloadNormalizado = {
      ...formData,
      nombre: formData.nombre.trim(),
      cuit: formData.cuit.trim(),
      direccion: formData.direccion.trim(),
      telefono: formData.telefono.trim(),
      email: formData.email.trim(),
      contacto: formData.contacto.trim(),
      condiciones_pago: formData.condiciones_pago.trim(),
    };

    try {
      const response = await fetch(`${API_BASE_URL}/proveedores/crear`, {
        method: 'POST',
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(payloadNormalizado),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData?.error ||
          errorData?.message ||
          errorData?.mensaje ||
          errorData?.detalle ||
          `Error ${response.status}: ${response.statusText}`;
        throw new Error(errorMessage);
      }

      setSuccessMessage('¡Proveedor registrado exitosamente!');
      setFormData(initialPageFormData);
      setTimeout(() => router.push('/lista-proveedores'), 900);

      //eslint-disable-next-line
    } catch (err: any) {
      setError(err.message || 'Ocurrio un error inesperado.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 rounded-2xl bg-gradient-to-r from-blue-700 to-cyan-600 px-6 py-7 text-white shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-100">Proveedores</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Registrar Nuevo Proveedor</h1>
          <p className="mt-2 text-sm text-blue-100 sm:text-base">
            Carga los datos comerciales y de contacto para habilitar compras y seguimiento de deuda.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          {error && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              <span className="font-semibold">Error: </span>
              <span>{error}</span>
            </div>
          )}
          {successMessage && (
            <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="alert">
              <span className="font-semibold">Exito: </span>
              <span>{successMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <FormularioProveedorFields formData={formData} handleChange={handleChange} />

            <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
              <Link
                href="/proveedores-acciones"
                className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:w-auto"
              >
                Volver
              </Link>
              <button
                type="submit"
                disabled={isLoading || !!successMessage}
                className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 sm:w-auto"
              >
                {isLoading ? 'Registrando...' : 'Registrar Proveedor'}
              </button>
            </div>
          </form>

          {!isLoading && !successMessage && (
            <div className="mt-6 text-center">
              <Link href="/lista-proveedores" className="text-sm font-semibold text-blue-700 hover:text-blue-800">
                Ir a la lista de proveedores
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
