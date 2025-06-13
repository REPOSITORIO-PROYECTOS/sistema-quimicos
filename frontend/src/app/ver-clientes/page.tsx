"use client";

import FormularioActualizacionCliente from '@/components/formularioActualizacionCliente';
import { useState, useEffect } from 'react';
import { FaTrash, FaPencilAlt, FaDownload } from 'react-icons/fa'; 
import * as XLSX from 'xlsx';

// Define la estructura de datos para un Cliente
type Cliente = {
  id: number;
  nombre_razon_social: string; 
  telefono: string;
  email: string;
};

// Tipo actualizado para coincidir exactamente con la respuesta de la API de precios
type PrecioEspecial = {
  producto_nombre: string;
  precio_unitario_fijo_ars: number;
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
  const [id_cliente, setIdClienteEditar] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    const fetchClientes = async () => {
      try {
        setLoading(true);
        setError(null);
        const token = localStorage.getItem("token")
        
        const apiUrl = `https://quimex.sistemataup.online/clientes/obtener_todos`; 
        
        const response = await fetch(apiUrl,{headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`}});
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

  const handleDownloadExcel = async () => {
    setIsDownloading(true);
    setError(null);
    const token = localStorage.getItem("token");

    if (!token) {
      setError("No estás autenticado para realizar esta acción.");
      setIsDownloading(false);
      return;
    }

    try {
      const promesasClientesConPrecios = clientes.map(async (cliente) => {
        try {
          const resPrecios = await fetch(`https://quimex.sistemataup.online/precios_especiales/obtener-por-cliente/${cliente.id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });

          if (!resPrecios.ok) {
            return { ...cliente, preciosEspeciales: [] };
          }
          
          const dataPrecios = await resPrecios.json();
          // La API devuelve un array directamente
          return { ...cliente, preciosEspeciales: dataPrecios || [] };
          // eslint-disable-next-line
        } catch (any) {
            return { ...cliente, preciosEspeciales: [] };
        }
      });

      const clientesConPrecios = await Promise.all(promesasClientesConPrecios);

      const datosParaExcel = clientesConPrecios.map(cliente => {
        // Se usa la clave correcta 'precio_unitario_fijo_ars'
        const listaDeProductosStr = cliente.preciosEspeciales
          .map((p: PrecioEspecial) => `${p.producto_nombre}: $${p.precio_unitario_fijo_ars.toFixed(2)}`)
          .join(', \n'); // Usar salto de línea para mejor visualización en Excel

        return {
          'ID': cliente.id,
          'Nombre / Razón Social': cliente.nombre_razon_social,
          'Teléfono': cliente.telefono,
          'Email': cliente.email,
          'Lista de Productos (Precios Especiales)': listaDeProductosStr || 'Sin precios especiales',
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(datosParaExcel);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Clientes");

      // Ajustar anchos de columnas para mejor visualización
      worksheet['!cols'] = [
        { wch: 5 },  // ID
        { wch: 40 }, // Nombre
        { wch: 20 }, // Teléfono
        { wch: 30 }, // Email
        { wch: 50 }, // Lista de Productos
      ];
      
      XLSX.writeFile(workbook, "Lista_Clientes_Con_Precios.xlsx");

    } catch (err) {
      console.error("Error al generar el archivo Excel:", err);
      setError("Ocurrió un error al generar el archivo. Inténtalo de nuevo.");
    } finally {
      setIsDownloading(false);
    }
  };
 
  const handleDelete = async (id: number) => {
    if (window.confirm(`¿Estás seguro de que deseas eliminar el cliente con ID ${id}?`)) {
      try {
        const token = localStorage.getItem("token");
        const response = await fetch(`https://quimex.sistemataup.online/clientes/desactivar/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error(`Error al eliminar cliente: ${response.statusText}`);
        setClientes(prevClientes => prevClientes.filter(cliente => cliente.id !== id));
        alert('Cliente eliminado correctamente.');
        // eslint-disable-next-line
      } catch (err: any) {
        setError(`Error al eliminar cliente: ${err.message}`);
        alert(`Error al eliminar cliente: ${err.message}`);
      }
    }
  };

  const handleEdit = (id: number) => {
    setIdClienteEditar(id);
  };

  return (
    <>
      {id_cliente === undefined ? (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
          <div className="bg-white p-6 md:p-8 rounded-lg shadow-lg w-full max-w-6xl">
            <h2 className="text-2xl md:text-3xl font-semibold mb-6 text-center text-indigo-700">
              Lista de Clientes
            </h2>

            <div className="mb-4 flex justify-end">
              <button
                onClick={handleDownloadExcel}
                disabled={loading || isDownloading || clientes.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-wait"
              >
                <FaDownload />
                {isDownloading ? 'Descargando...' : 'Descargar Clientes'}
              </button>
            </div>

            {loading && <p className="text-center text-gray-600 py-4">Cargando clientes...</p>}
            {error && <p className="text-center text-red-600 py-4 bg-red-100 rounded border border-red-400">{error}</p>}

            {!loading && !error && clientes.length === 0 && (
                <p className="text-center text-gray-500 py-4">No se encontraron clientes.</p>
            )}

            {!loading && !error && clientes.length > 0 && (
              <>
                <div className="overflow-x-auto">
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
                            {cliente.telefono || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                            {cliente.email || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                            <div className="flex items-center justify-center gap-3">
                              <button
                                onClick={() => handleEdit(cliente.id)}
                                className="text-indigo-600 hover:text-indigo-900 transition duration-150 ease-in-out"
                                title="Editar Cliente"
                              >
                                <FaPencilAlt size={18} />
                              </button>
                              <button
                                onClick={() => handleDelete(cliente.id)}
                                className="text-red-600 hover:text-red-900 transition duration-150 ease-in-out"
                                title="Eliminar Cliente"
                              >
                                <FaTrash size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {pagination && (
              <div className="flex justify-center mt-6 gap-4">
                <button
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                  disabled={!pagination.has_prev || loading}
                  className="px-4 py-2 rounded bg-indigo-700 text-white hover:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                <span className="text-indigo-700 font-medium self-center">
                  Página {pagination.current_page} de {pagination.total_pages}
                </span>
                <button
                  onClick={() => setPage((prev) => prev + 1)}
                  disabled={!pagination.has_next || loading}
                  className="px-4 py-2 rounded bg-indigo-700 text-white hover:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed"
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