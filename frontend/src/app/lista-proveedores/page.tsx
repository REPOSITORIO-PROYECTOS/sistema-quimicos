// app/dashboard/proveedores/page.tsx (o la ruta que corresponda)
"use client";

import { useState, useEffect, useCallback } from 'react';
import FormularioProveedorModal from '@/components/FormularioProveedorModal'; // Asegúrate que la ruta sea correcta
const API_BASE_URL = 'https://quimex.sistemataup.online'; // Tu URL base de la API

// Interfaz para los datos del proveedor como vienen de la API de listar y de detalle
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

// Interfaz para los datos que necesita el formulario modal
interface ProveedorFormData {
    id?: number;
    nombre: string;
    cuit: string;
    direccion: string;
    telefono: string;
    email: string;
    contacto: string;
    condiciones_pago: string;
    activo?: boolean; // El modal podría o no manejar esto directamente
}


export default function ListaProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setModalErrorMessage] = useState<string | null>(null); // Mensaje de error específico para el modal si es necesario
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [proveedorAEditar, setProveedorAEditar] = useState<ProveedorFormData | null>(null);
  const [accionLoading, setAccionLoading] = useState<number | null>(null); // ID del proveedor en acción
  const [globalSuccessMessage, setGlobalSuccessMessage] = useState<string | null>(null); // Para mensajes de éxito globales (ej. al cambiar estado)


  const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;

  const fetchProveedores = useCallback(async () => {
    setIsLoading(true);
    setError(null); // Limpiar error general
    // setGlobalSuccessMessage(null); // Limpiar mensaje de éxito global al recargar
    if (!token) {
        setError("No autenticado. Por favor, inicie sesión.");
        setIsLoading(false);
        return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/proveedores/obtener-todos`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({message: "Error al cargar proveedores."}));
        throw new Error(errorData.message || `Error ${response.status}`);
      }
      const data: Proveedor[] = await response.json();
      setProveedores(data);

    } //eslint-disable-next-line
      catch (err: any) {
      setError(err.message);
      setProveedores([]); // Limpiar proveedores en caso de error
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchProveedores();
  }, [fetchProveedores]);

  const handleOpenEditModal = async (proveedorId: number) => {
    if (!token) {
        setError("No autenticado. No se pueden cargar datos para editar.");
        return;
    }
    setModalErrorMessage(null); // Limpiar errores previos del modal
    setGlobalSuccessMessage(null); // Limpiar mensajes globales al abrir modal
    try {
        const response = await fetch(`${API_BASE_URL}/proveedores/obtener/${proveedorId}`, {
            headers: { "Authorization": `Bearer ${token}` },
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({message: "Error al obtener datos del proveedor para editar."}));
            throw new Error(errorData.message || `Error ${response.status}`);
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
        // Mostrar error específico si falla la carga para el modal, o un error general en la página
        setError(`Error al cargar datos del proveedor para editar: ${err.message}`);
        // setModalErrorMessage(`Error al cargar datos del proveedor: ${err.message}`); // Opción para error dentro del modal
        setProveedorAEditar(null);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setProveedorAEditar(null);
    setModalErrorMessage(null); // Limpiar cualquier error del modal al cerrarlo
  };

  const handleSaveSuccess = (message: string) => {
    handleCloseModal();
    setGlobalSuccessMessage(message); // Mostrar mensaje de éxito en la página de lista
    fetchProveedores(); // Refrescar la lista
    setTimeout(() => setGlobalSuccessMessage(null), 3000); // Ocultar mensaje después de 3 segundos
  };

  const cambiarEstadoProveedor = async (proveedorId: number, nuevoEstado: 'activar' | 'desactivar') => {
    setAccionLoading(proveedorId);
    setError(null);
    setGlobalSuccessMessage(null);
    if (!token) {
        setError("No autenticado.");
        setAccionLoading(null);
        return;
    }
    const endpoint = nuevoEstado === 'activar' 
        ? `${API_BASE_URL}/proveedores/activar/${proveedorId}/activar` 
        : `${API_BASE_URL}/proveedores/desactivar/${proveedorId}/desactivar`;
    
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({message: `Error al ${nuevoEstado} proveedor.`}));
        throw new Error(errorData.message || `Error ${response.status}`);
      }
      const result = await response.json();
      setGlobalSuccessMessage(result.mensaje || `Proveedor ${nuevoEstado === 'activar' ? 'activado' : 'desactivado'} correctamente.`);
      fetchProveedores(); // Refetch para asegurar consistencia
      setTimeout(() => setGlobalSuccessMessage(null), 3000);
      //eslint-disable-next-line
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAccionLoading(null);
    }
  };

  if (isLoading && !proveedores.length) {
    return <div className="p-4 text-center text-gray-700">Cargando proveedores...</div>;
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl sm:text-3xl font-bold mb-6 text-gray-800">Lista de Proveedores</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      )}
      {globalSuccessMessage && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mb-4" role="alert">
            <strong className="font-bold">Éxito: </strong>
            <span className="block sm:inline">{globalSuccessMessage}</span>
          </div>
      )}
      
      <div className="overflow-x-auto bg-white shadow-md rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-s font-bold text-gray-800 uppercase tracking-wider">Nombre</th>
              <th scope="col" className="px-6 py-3 text-left text-s font-bold text-gray-800 uppercase tracking-wider">CUIT</th>
              <th scope="col" className="px-6 py-3 text-left text-s font-bold text-gray-800 uppercase tracking-wider">Teléfono</th>
              <th scope="col" className="px-6 py-3 text-left text-s font-bold text-gray-800 uppercase tracking-wider">Activo</th>
              <th scope="col" className="px-6 py-3 text-left text-s font-boldtext-gray-800 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {isLoading && proveedores.length > 0 && ( // Muestra "Actualizando" si ya hay datos pero se está recargando
                <tr>
                    <td colSpan={5} className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-center">Actualizando lista...</td>
                </tr>
            )}
            {!isLoading && proveedores.length === 0 && !error && (
              <tr>
                <td colSpan={5} className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 text-center">
                  No se encontraron proveedores.
                </td>
              </tr>
            )}
            {proveedores.map((proveedor) => (
              <tr key={proveedor.id} className={`hover:bg-gray-50 ${accionLoading === proveedor.id ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{proveedor.nombre}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {/* Cambiado text-gray-500 a text-gray-900 */}
                  <div className="text-sm text-gray-900">{proveedor.cuit || 'N/A'}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {/* Cambiado text-gray-500 a text-gray-900 */}
                  <div className="text-sm text-gray-900">{proveedor.telefono || 'N/A'}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    proveedor.activo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {proveedor.activo ? 'Sí' : 'No'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                  <button
                    onClick={() => handleOpenEditModal(proveedor.id)}
                    disabled={accionLoading === proveedor.id}
                    className="text-indigo-600 hover:text-indigo-900 disabled:text-gray-400 disabled:cursor-not-allowed"
                    title="Editar proveedor"
                  >
                    Editar
                  </button>
                  {proveedor.activo ? (
                    <button
                      onClick={() => cambiarEstadoProveedor(proveedor.id, 'desactivar')}
                      disabled={accionLoading === proveedor.id}
                      className="text-red-600 hover:text-red-900 disabled:text-gray-400 disabled:cursor-not-allowed"
                      title="Desactivar proveedor"
                    >
                      {accionLoading === proveedor.id && !proveedor.activo ? 'Cambiando...' : 'Desactivar'}
                    </button>
                  ) : (
                    <button
                      onClick={() => cambiarEstadoProveedor(proveedor.id, 'activar')}
                      disabled={accionLoading === proveedor.id}
                      className="text-green-600 hover:text-green-900 disabled:text-gray-400 disabled:cursor-not-allowed"
                      title="Activar proveedor"
                    >
                      {accionLoading === proveedor.id && proveedor.activo ? 'Cambiando...' : 'Activar'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && proveedorAEditar && ( // Asegurarse que proveedorAEditar no sea null
        <FormularioProveedorModal
          proveedorToEdit={proveedorAEditar}
          onClose={handleCloseModal}
          onSaveSuccess={handleSaveSuccess}
          apiBaseUrl={API_BASE_URL}
        />
      )}
    </div>
  );
}