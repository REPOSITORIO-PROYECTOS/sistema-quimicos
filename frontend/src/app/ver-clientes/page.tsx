"use client";

import BotonVolver from '@/components/BotonVolver';
import { useRouter } from 'next/navigation';
import FormularioActualizacionCliente from '@/components/formularioActualizacionCliente';
import { useState, useEffect } from 'react';
import { FaTrash, FaPencilAlt, FaDownload, FaArrowUp, FaArrowDown, FaUpload, FaSearch } from 'react-icons/fa'; 
import * as XLSX from 'xlsx';


type Cliente = {
  id: number;
  nombre_razon_social: string;
  telefono: string;
  email: string;
};

type PrecioEspecial = {
  producto_nombre: string;
  precio_unitario_fijo_ars: number;
};

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
  const router = useRouter();
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [id_cliente, setIdClienteEditar] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [isDownloading, setIsDownloading] = useState(false);

    // --- ESTADO PARA EL BUSCADOR (NUEVO) ---
  const [searchTerm, setSearchTerm] = useState(''); // Lo que el usuario escribe

  const [porcentaje, setPorcentaje] = useState('');
  const [isUpdatingPrices, setIsUpdatingPrices] = useState(false);
  const [priceUpdateError, setPriceUpdateError] = useState<string | null>(null);
  const [priceUpdateSuccess, setPriceUpdateSuccess] = useState<string | null>(null);

useEffect(() => {
    // 1. Inicia un temporizador cada vez que el usuario teclea algo.
    const timerId = setTimeout(() => {
      // 2. Si el usuario no ha tecleado nada más en 500ms, esta función se ejecuta.
      const fetchClientes = async () => {
        try {
          setLoading(true);
          setError(null);
          const token = localStorage.getItem("token");
          const params = new URLSearchParams();
          // Usar el término recortado para evitar búsquedas con solo espacios.
          const trimmedTerm = searchTerm.trim();
          // Si hay término de búsqueda queremos forzar una búsqueda en la BASE DE DATOS.
          // Para eso pedimos una página 1 y un per_page grande (devuelve todos los matches)
          if (trimmedTerm) {
            params.append('page', String(1));
            params.append('per_page', '5000');
            params.append('search_term', trimmedTerm);
          } else {
            params.append('page', String(page));
            params.append('per_page', '20');
          }

          // Construir URL hacia el endpoint paginado (el backend debe usar search_term
          // para filtrar en la BASE DE DATOS). Si prefieres usar un endpoint dedicado
          // '/clientes/buscar_todos' se puede cambiar aquí.
          const apiUrl = `https://quimex.sistemataup.online/clientes/obtener_todos?${params.toString()}`;

          const response = await fetch(apiUrl, { headers: {"Content-Type":"application/json", "Authorization":`Bearer ${token}`} });
          if (!response.ok) {
            throw new Error(`Error al traer clientes: ${response.statusText}`);
          }
          const data = await response.json();

          // Asegurarnos que si no hay matches en la BD devolvemos lista vacía
          const clientesObtenidos = Array.isArray(data.clientes) ? data.clientes : [];
          setClientes(clientesObtenidos);

          // Si hay término de búsqueda, mostramos los resultados tal cual (todos los matches)
          // y ocultamos la paginación para evitar navegación incoherente.
          if (trimmedTerm) {
            setPagination(null);
          } else {
            setPagination(data.pagination || null);
          }
        } catch (error: unknown) {
          if (error instanceof Error) {
            setError(error.message);
          }
        } finally {
          setLoading(false);
        }
      };

      fetchClientes();

    }, 500); // 500ms de retraso
    return () => {
      clearTimeout(timerId);
    };

  }, [searchTerm, page]);

 const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setPage(1); // Vuelve a la página 1 cada vez que se inicia una nueva búsqueda
  };


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
          return { ...cliente, preciosEspeciales: dataPrecios || [] };
        } catch (error ) {
            console.log(error);
            return { ...cliente, preciosEspeciales: [] };
        }
      });

      const clientesConPrecios = await Promise.all(promesasClientesConPrecios);

      const datosParaExcel = clientesConPrecios.map(cliente => {
        const listaDeProductosStr = cliente.preciosEspeciales
          .map((p: PrecioEspecial) => `${p.producto_nombre}: $${p.precio_unitario_fijo_ars.toFixed(2)}`)
          .join(', \n');

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

      worksheet['!cols'] = [
        { wch: 5 },
        { wch: 40 },
        { wch: 20 },
        { wch: 30 },
        { wch: 50 },
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

  const handleUpdatePrices = async (type: 'increase' | 'decrease') => {
    const percentageValue = parseFloat(porcentaje);
    if (isNaN(percentageValue) || percentageValue <= 0) {
      setPriceUpdateError('Por favor, ingresa un número de porcentaje válido y positivo.');
      setPriceUpdateSuccess(null);
      return;
    }

    const actionText = type === 'increase' ? 'aumentar' : 'bajar';
    if (!window.confirm(`¿Estás seguro de que deseas ${actionText} TODOS los precios especiales en un ${percentageValue}%? Esta acción es irreversible.`)) {
      return;
    }

    setIsUpdatingPrices(true);
    setPriceUpdateError(null);
    setPriceUpdateSuccess(null);
    const token = localStorage.getItem("token");
    
    let direccion;
    if (type === 'decrease') {
       direccion = "bajada";
    }
    else 
       direccion = "subida";

    try {
      const response = await fetch('https://quimex.sistemataup.online/precios_especiales/actualizar-global', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ porcentaje: percentageValue, direccion:direccion })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.detail || `Error ${response.status}`);
      }
      
      setPriceUpdateSuccess(result.message || '¡Precios actualizados correctamente!');
      setPorcentaje('');
      alert('¡Precios actualizados correctamente!');
      // eslint-disable-next-line
    } catch (err: any) {
      setPriceUpdateError(err.message || 'Ocurrió un error al actualizar los precios.');
    } finally {
      setIsUpdatingPrices(false);
    }
  };

  return (
    <>
      {id_cliente === undefined ? (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
          <div className="bg-white p-6 md:p-8 rounded-lg shadow-lg w-full max-w-6xl">
            <h2 className="text-2xl md:text-3xl font-semibold mb-6 text-center text-indigo-700">
              Lista de Clientes
            </h2>
            <BotonVolver className="ml-0 mb-4" />
            
            <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
              <h3 className="text-lg font-medium text-gray-800 mb-3">Actualización Global de Precios Especiales</h3>
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="flex-grow w-full sm:w-auto">
                    <label htmlFor="porcentaje" className="block text-sm font-medium text-gray-700 mb-1">
                      Porcentaje (%)
                    </label>
                    <input
                      type="number"
                      id="porcentaje"
                      value={porcentaje}
                      onChange={(e) => setPorcentaje(e.target.value)}
                      placeholder="Ej: 5"
                      disabled={isUpdatingPrices}
                      className="px-3 py-2 border border-gray-300 rounded-md shadow-sm w-full focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    />
                </div>
                <button
                  onClick={() => handleUpdatePrices('increase')}
                  disabled={!porcentaje || isUpdatingPrices}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-wait"
                >
                  <FaArrowUp />
                  Aumentar Precios
                </button>
                <button
                  onClick={() => handleUpdatePrices('decrease')}
                  disabled={!porcentaje || isUpdatingPrices}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-wait"
                >
                  <FaArrowDown />
                  Bajar Precios
                </button>
              </div>
              {isUpdatingPrices && <p className="text-center text-blue-600 mt-3 animate-pulse">Actualizando precios...</p>}
              {priceUpdateError && <p className="text-center text-red-600 mt-3 font-medium">{priceUpdateError}</p>}
              {priceUpdateSuccess && <p className="text-center text-green-600 mt-3 font-medium">{priceUpdateSuccess}</p>}
            </div>
            <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              {/* Buscador */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                  <FaSearch className="text-gray-400" />
                </span>
                <input
                  type="text"
                  placeholder="Buscar por nombre, teléfono, email..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              {/* Botones */}
              <div className="flex justify-end gap-4">
                <button
                  onClick={() => router.push('/carga-masiva')}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  <FaUpload /> Carga Masiva
                </button>
                <button
                  onClick={handleDownloadExcel}
                  disabled={loading || isDownloading || clientes.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-wait"
                >
                  <FaDownload /> Descargar
                </button>
              </div>
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