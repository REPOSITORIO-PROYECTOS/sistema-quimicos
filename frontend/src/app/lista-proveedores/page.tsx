"use client";

import { useState, useEffect, useCallback } from 'react';
import FormularioProveedorModal from '@/components/FormularioProveedorModal';
import BotonVolver from '@/components/BotonVolver';

const API_BASE_URL = 'https://quimex.sistemataup.online/api';

interface Proveedor {
  id: number;
  nombre: string;
  cuit: string | null;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  contacto: string | null;
  condiciones_pago: string | null;
  activo: boolean;
}

type ResumenProveedorFinanzas = {
  proveedor_id: number;
  deuda: number;
};

interface ProveedorFormData {
  id?: number;
  nombre: string;
  cuit: string;
  direccion: string;
  telefono: string;
  email: string;
  contacto: string;
  condiciones_pago: string;
  activo?: boolean;
}

export default function ListaProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [deudaPorProveedor, setDeudaPorProveedor] = useState<Record<number, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setModalErrorMessage] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [proveedorAEditar, setProveedorAEditar] = useState<ProveedorFormData | null>(null);
  const [accionLoading, setAccionLoading] = useState<number | null>(null);
  const [globalSuccessMessage, setGlobalSuccessMessage] = useState<string | null>(null);

  const token = typeof window !== 'undefined'
    ? (localStorage.getItem('authToken') || sessionStorage.getItem('authToken'))
    : null;

  const fetchProveedores = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    if (!token) {
      setError('No autenticado. Por favor, inicie sesion.');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/proveedores/obtener-todos`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData?.error ||
          errorData?.message ||
          errorData?.mensaje ||
          `Error ${response.status}`
        );
      }
      const data: Proveedor[] = await response.json();
      setProveedores(data);

      try {
        const finResp = await fetch(`${API_BASE_URL}/finanzas/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (finResp.ok) {
          const finData = await finResp.json();
          const resumen: ResumenProveedorFinanzas[] = Array.isArray(finData?.resumen_proveedores)
            ? finData.resumen_proveedores
            : [];
          const mapa: Record<number, number> = {};
          resumen.forEach((r) => {
            mapa[Number(r.proveedor_id)] = Number(r.deuda || 0);
          });
          setDeudaPorProveedor(mapa);
        } else {
          setDeudaPorProveedor({});
        }
      } catch {
        setDeudaPorProveedor({});
      }
      //eslint-disable-next-line
    } catch (err: any) {
      setError(err.message);
      setProveedores([]);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchProveedores();
  }, [fetchProveedores]);

  const handleOpenEditModal = async (proveedorId: number) => {
    if (!token) {
      setError('No autenticado. No se pueden cargar datos para editar.');
      return;
    }

    setModalErrorMessage(null);
    setGlobalSuccessMessage(null);

    try {
      const response = await fetch(`${API_BASE_URL}/proveedores/obtener/${proveedorId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData?.error ||
          errorData?.message ||
          errorData?.mensaje ||
          `Error ${response.status}`
        );
      }
      const proveedorData: Proveedor = await response.json();

      const formData: ProveedorFormData = {
        id: proveedorData.id,
        nombre: proveedorData.nombre || '',
        cuit: proveedorData.cuit || '',
        direccion: proveedorData.direccion || '',
        telefono: proveedorData.telefono || '',
        email: proveedorData.email || '',
        contacto: proveedorData.contacto || '',
        condiciones_pago: proveedorData.condiciones_pago || '',
        activo: proveedorData.activo,
      };

      setProveedorAEditar(formData);
      setIsModalOpen(true);
      //eslint-disable-next-line
    } catch (err: any) {
      setError(`Error al cargar datos del proveedor para editar: ${err.message}`);
      setProveedorAEditar(null);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setProveedorAEditar(null);
    setModalErrorMessage(null);
  };

  const handleSaveSuccess = (message: string) => {
    handleCloseModal();
    setGlobalSuccessMessage(message);
    fetchProveedores();
    setTimeout(() => setGlobalSuccessMessage(null), 3000);
  };

  const cambiarEstadoProveedor = async (proveedorId: number, nuevoEstado: 'activar' | 'desactivar') => {
    setAccionLoading(proveedorId);
    setError(null);
    setGlobalSuccessMessage(null);

    if (!token) {
      setError('No autenticado.');
      setAccionLoading(null);
      return;
    }

    const endpoint = nuevoEstado === 'activar'
      ? `${API_BASE_URL}/proveedores/activar/${proveedorId}/activar`
      : `${API_BASE_URL}/proveedores/desactivar/${proveedorId}/desactivar`;

    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData?.error ||
          errorData?.message ||
          errorData?.mensaje ||
          `Error ${response.status}`
        );
      }
      const result = await response.json();
      setGlobalSuccessMessage(result.mensaje || `Proveedor ${nuevoEstado === 'activar' ? 'activado' : 'desactivado'} correctamente.`);
      fetchProveedores();
      setTimeout(() => setGlobalSuccessMessage(null), 3000);
      //eslint-disable-next-line
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAccionLoading(null);
    }
  };

  const totalProveedores = proveedores.length;
  const activos = proveedores.filter((p) => p.activo).length;

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 rounded-2xl bg-gradient-to-r from-blue-700 to-cyan-600 px-6 py-7 text-white shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-100">Proveedores</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Lista de Proveedores</h1>
          <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-xl bg-white/15 px-3 py-2">
              <span className="text-blue-100">Total</span>
              <p className="text-xl font-bold text-white">{totalProveedores}</p>
            </div>
            <div className="rounded-xl bg-white/15 px-3 py-2">
              <span className="text-blue-100">Activos</span>
              <p className="text-xl font-bold text-white">{activos}</p>
            </div>
            <div className="rounded-xl bg-white/15 px-3 py-2">
              <span className="text-blue-100">Inactivos</span>
              <p className="text-xl font-bold text-white">{Math.max(0, totalProveedores - activos)}</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            <span className="font-semibold">Error: </span>
            <span>{error}</span>
          </div>
        )}

        {globalSuccessMessage && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="alert">
            <span className="font-semibold">Exito: </span>
            <span>{globalSuccessMessage}</span>
          </div>
        )}

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">Nombre</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">CUIT</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">Telefono</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">Deuda</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">Activo</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {isLoading && proveedores.length > 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-6 text-center text-sm text-slate-600">Actualizando lista...</td>
                </tr>
              )}

              {!isLoading && proveedores.length === 0 && !error && (
                <tr>
                  <td colSpan={6} className="px-6 py-6 text-center text-sm text-slate-600">No se encontraron proveedores.</td>
                </tr>
              )}

              {proveedores.map((proveedor) => (
                <tr key={proveedor.id} className={`transition hover:bg-slate-50 ${accionLoading === proveedor.id ? 'cursor-not-allowed opacity-60' : ''}`}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-semibold text-slate-900">{proveedor.nombre}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">{proveedor.cuit || 'N/A'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">{proveedor.telefono || 'N/A'}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {(() => {
                      const deuda = Number(deudaPorProveedor[proveedor.id] || 0);
                      const clase = deuda > 0 ? 'text-red-700' : 'text-emerald-700';
                      return (
                        <span className={`text-sm font-semibold tabular-nums ${clase}`}>
                          ${deuda.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${proveedor.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {proveedor.activo ? 'Si' : 'No'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleOpenEditModal(proveedor.id)}
                        disabled={accionLoading === proveedor.id}
                        className="rounded-lg bg-blue-50 px-3 py-1.5 text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                        title="Editar proveedor"
                      >
                        Editar
                      </button>
                      {proveedor.activo ? (
                        <button
                          onClick={() => cambiarEstadoProveedor(proveedor.id, 'desactivar')}
                          disabled={accionLoading === proveedor.id}
                          className="rounded-lg bg-rose-50 px-3 py-1.5 text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                          title="Desactivar proveedor"
                        >
                          Desactivar
                        </button>
                      ) : (
                        <button
                          onClick={() => cambiarEstadoProveedor(proveedor.id, 'activar')}
                          disabled={accionLoading === proveedor.id}
                          className="rounded-lg bg-emerald-50 px-3 py-1.5 text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                          title="Activar proveedor"
                        >
                          Activar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isLoading && !proveedores.length && !error && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm text-slate-600">
            Cargando proveedores...
          </div>
        )}

        <div className="mt-6">
          <BotonVolver />
        </div>

        {isModalOpen && proveedorAEditar && (
          <FormularioProveedorModal
            proveedorToEdit={proveedorAEditar}
            onClose={handleCloseModal}
            onSaveSuccess={handleSaveSuccess}
            apiBaseUrl={API_BASE_URL}
          />
        )}
      </div>
    </div>
  );
}
