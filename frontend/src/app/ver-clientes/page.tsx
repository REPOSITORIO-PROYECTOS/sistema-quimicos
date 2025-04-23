"use client";

import FormularioActualizacionCliente from '@/components/formularioActualizacionCliente';
import { useState, useEffect } from 'react';
import { FaTrash, FaPencilAlt } from 'react-icons/fa'; // Importando iconos (opcional, pero recomendado)

// Define la estructura de datos para un Cliente
type Cliente = {
  id: number;
  nombre_razon_social: string; // Asegúrate que el nombre coincida con tu API
  telefono: string;
  email: string;
};

// La estructura de paginación parece genérica, así que la mantenemos
type Pagination = {
  total_items: number;
  total_pages: number;
  current_page: number;
  per_page: number;
  has_next: boolean;
  has_prev: boolean;
};

export default function ListaClientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [id_cliente, setIdClienteEditar] = useState<number | undefined>(); // Renombrado para claridad
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const fetchClientes = async () => {
      try {
        setLoading(true);
        setError(null); // Limpia errores anteriores al reintentar

        const apiUrl = `https://sistemataup.online/clientes/obtener_todos`; 

        const response = await fetch(apiUrl);
        if (!response.ok) {
          throw new Error(`Error al traer clientes: ${response.statusText} (${response.status})`);
        }
        const data = await response.json();
        setClientes(data.clientes);
        setPagination(data.pagination);

      //eslint-disable-next-line
      } catch (err: any) {
        console.error("Error en fetchClientes:", err);
        setError(err.message || 'Error desconocido al cargar los clientes.');
      } finally {
        setLoading(false);
      }
    };

    fetchClientes();
  }, [page]); 


 
  const handleDelete = async (id: number) => {
    // Pregunta confirmación al usuario
    if (window.confirm(`¿Estás seguro de que deseas eliminar el cliente con ID ${id}?`)) {
      console.log('Eliminar cliente con ID:', id);
      try {
        // !!! IMPORTANTE: Reemplaza '/api/clientes/${id}' con la URL real de tu API para borrar !!!
        const response = await fetch(`https://sistemataup.online/clientes/desactivar/${id}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          throw new Error(`Error al eliminar cliente: ${response.statusText}`);
        }

        // Si la eliminación fue exitosa en el backend, actualiza el estado local
        setClientes(prevClientes => prevClientes.filter(cliente => cliente.id !== id));
        // Opcional: Mostrar un mensaje de éxito
        alert('Cliente eliminado correctamente.');

      } // eslint-disable-next-line
        catch (err: any) {
        console.error("Error al eliminar cliente:", err);
        setError(`Error al eliminar cliente: ${err.message}`);
        // Opcional: Mostrar un mensaje de error al usuario
        alert(`Error al eliminar cliente: ${err.message}`);
      }
    }
  };

  // Función para manejar la edición
  const handleEdit = (id: number) => {
    console.log('Editar cliente con ID:', id);
    setIdClienteEditar(id);
  };

  return (
    <>
      {/* Si no hay un cliente seleccionado para editar, muestra la lista */}
      {id_cliente === undefined ? (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4"> {/* Cambié el fondo para mejor contraste */}
          <div className="bg-white p-6 md:p-8 rounded-lg shadow-lg w-full max-w-6xl"> {/* Aumenté max-w */}
            <h2 className="text-2xl md:text-3xl font-semibold mb-6 text-center text-indigo-700">
              Lista de Clientes
            </h2>

            {loading && <p className="text-center text-gray-600 py-4">Cargando clientes...</p>}
            {error && <p className="text-center text-red-600 py-4 bg-red-100 rounded border border-red-400">{error}</p>}

            {!loading && !error && clientes.length === 0 && (
                <p className="text-center text-gray-500 py-4">No se encontraron clientes.</p>
            )}

            {!loading && !error && clientes.length > 0 && (
              <>
                <div className="overflow-x-auto"> {/* Para mejor manejo en pantallas pequeñas */}
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-indigo-100">
                      <tr>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-indigo-800 uppercase tracking-wider">
                          ID
                        </th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-indigo-800 uppercase tracking-wider">
                          Nombre / Razón Social
                        </th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-indigo-800 uppercase tracking-wider">
                          Teléfono
                        </th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-indigo-800 uppercase tracking-wider">
                          Email
                        </th>
                        <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-indigo-800 uppercase tracking-wider">
                          Acciones
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {clientes.map((cliente) => (
                        <tr key={cliente.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                            {cliente.id}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-medium">
                            {cliente.nombre_razon_social}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                            {cliente.telefono || '-'} {/* Muestra '-' si no hay teléfono */}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                            {cliente.email || '-'} {/* Muestra '-' si no hay email */}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                            <div className="flex items-center justify-center gap-3">
                              {/* Botón Editar (Tuerca) */}
                              <button
                                onClick={() => handleEdit(cliente.id)}
                                className="text-indigo-600 hover:text-indigo-900 transition duration-150 ease-in-out"
                                title="Editar Cliente" // Tooltip para accesibilidad
                              >
                                <FaPencilAlt size={18} /> {/* Icono de lápiz */}
                              </button>
                              {/* Botón Eliminar (Tacho de basura) */}
                              <button
                                onClick={() => handleDelete(cliente.id)}
                                className="text-red-600 hover:text-red-900 transition duration-150 ease-in-out"
                                title="Eliminar Cliente" // Tooltip para accesibilidad
                              >
                                <FaTrash size={16} /> {/* Icono de basura */}
                                {/* O puedes usar el emoji directamente: 🗑️ */}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Paginación */}
                {pagination && (
              <div className="flex justify-center mt-6 gap-4">
                <button
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                  disabled={!pagination.has_prev || loading} // Añadí 'loading' aquí también por seguridad
                  className="px-4 py-2 rounded bg-indigo-700 text-white hover:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed" // Añadí cursor-not-allowed
                >
                  Anterior
                </button>
                <span className="text-indigo-700 font-medium self-center"> {/* Añadí self-center para alinear verticalmente */}
                  Página {pagination.current_page} de {pagination.total_pages}
                </span>
                <button
                  onClick={() => setPage((prev) => prev + 1)}
                  disabled={!pagination.has_next || loading} // Añadí 'loading' aquí también por seguridad
                  className="px-4 py-2 rounded bg-indigo-700 text-white hover:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed" // Añadí cursor-not-allowed
                >
                  Siguiente
                </button>
              </div>
              )}
              </>
            )}
          </div>
        </div>
      ) : (
        <FormularioActualizacionCliente
            id_cliente={id_cliente}
        />
      )}
    </>
  );
}