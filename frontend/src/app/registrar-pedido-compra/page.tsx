'use client';
import BotonVolver from '@/components/BotonVolver';
import { useProductsContext } from '@/context/ProductsContext';
import { useRouter } from 'next/navigation';
import React, { useState, useEffect } from 'react';

// Se simplifica la interface local, ya que el componente no maneja estos estados
interface IPedido {
  fecha: string;
  producto: string; // ID del producto
  cantidad: string;
  importeTotal: string;
  importeAbonado: string;
  chequePerteneciente: string;
  fecha_limite: string;
}

export default function RegistrarIngreso() {

  // --- Estados Reducidos ---
  const [fecha, setFecha] = useState('');
  const [fechaLimite, setFechaLimite] = useState('');
  const [producto, setProducto] = useState('');
  const [cantidad, setCantidad] = useState('');
  // Se eliminaron los estados de proveedor, precioSinIva, cuenta, iibb
  const [importeTotal, setImporteTotal] = useState('');
  const [importeAbonado, setImporteAbonado] = useState('');
  const [chequePerteneciente, setChequePerteneciente] = useState('');
  const irAccionesPuerta = () => router.push('/compras');
  const { productos, loading: productsLoading, error: productsError } = useProductsContext();
  // Se eliminó el contexto de proveedores
  const router = useRouter();
  const [observaciones_solicitud, setObservacionesSolicitud] = useState('');
  
  const [pedidos, setPedidos] = useState<IPedido[]>([]);
  const [errorApi, setErrorApi] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;

  useEffect(() => {
    const obtenerFechaActual = () => {
      const hoy = new Date();
      const anio = hoy.getFullYear();
      const mes = String(hoy.getMonth() + 1).padStart(2, '0');
      const dia = String(hoy.getDate()).padStart(2, '0');
      return `${anio}-${mes}-${dia}`;
    };
    setFecha(obtenerFechaActual());
  }, []);

  const handleAgregar = async () => {
    // Se elimina proveedor_id de la validación
    if (!fecha || !producto || !cantidad) {
        setErrorApi("Por favor, completa los campos obligatorios: Fecha, Producto, Cantidad.");
        return;
    }

    setIsLoading(true);
    setErrorApi(null);
    console.log("Agregando pedido...");

    // Objeto local para la lista de la UI, ya no contiene los campos eliminados
    const nuevoPedido: IPedido = {
      fecha, producto, cantidad, importeTotal, importeAbonado, chequePerteneciente,
      fecha_limite: fechaLimite,
    };
    // eslint-disable-next-line
    const userItem:any = sessionStorage.getItem("user");
    const user = userItem ? JSON.parse(userItem) : null;

    if (!user || !user.id) {
        setErrorApi("No se pudo obtener la información del usuario. Por favor, inicie sesión de nuevo.");
        setIsLoading(false);
        return;
    }

    // --- Payload para la API (Clave) ---
    // Se mantienen los campos que la API espera, pero con valores por defecto/fijos.
    const ventaPayload = {
      usuario_interno_id: user.id,
      forma_pago: "",
      observaciones_solicitud: observaciones_solicitud,
      items: [ {
          codigo_interno: parseInt(producto),
          cantidad: parseInt(cantidad),
          precio_unitario_estimado: 0 // Se envía 0 como valor por defecto
      } ],
      fecha_pedido: fecha,
      proveedor_id: 1, // Se envía un ID de proveedor fijo (Ej: 1 para "Varios" o "Interno"). ¡Ajustar si es necesario!
      iibb: '', // Se envía un string vacío
      fecha_limite: fechaLimite,
    };
    console.log("Payload enviado a la API:", ventaPayload);

    try {
      const response = await fetch('https://quimex.sistemataup.online/ordenes_compra/crear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role' : user.role,
          'X-User-Id' : user.id,
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(ventaPayload),
      });

      console.log("Respuesta recibida:", response.status, response.ok);

      if (!response.ok) {
        let errorMsg = `Error ${response.status}: ${response.statusText}`;
        try {
            const errorData = await response.json();
            console.error('Error en la respuesta:', errorData);
            errorMsg = errorData?.mensaje || errorData?.detail || errorData?.error || errorMsg;
        } catch (jsonError) {
            console.error("No se pudo parsear JSON del error:", jsonError);
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      console.log('Compra registrada con éxito:', data);
      alert('Pedido agregado con éxito!');

      setPedidos((prev) => [...prev, nuevoPedido]);

      // Se limpia el estado de los campos restantes
      setProducto('');
      setCantidad('');
      setImporteTotal('');
      setImporteAbonado('');
      setChequePerteneciente('');
      setFechaLimite('');
      irAccionesPuerta();
      // eslint-disable-next-line
    } catch (error: any) {
      console.error('Error al registrar compra:', error);
      setErrorApi(error.message || "Ocurrió un error al registrar el pedido.");
    } finally {
        setIsLoading(false);
    }
  };

  const baseInputClass = "w-full px-3 py-2 rounded bg-white text-black border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent placeholder-gray-500 transition duration-150 ease-in-out";
  const disabledInputClass = "disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed";
  const labelClass = "block text-sm font-medium mb-1 text-gray-200";

  return (
    <div className="min-h-screen flex flex-col items-center bg-gradient-to-br from-[#20119d] to-[#1c0f8a] px-4 py-10">
      <h1 className="text-white text-3xl font-bold mb-6 text-center drop-shadow-md">
        Solicitar Compra
      </h1>

      <div className="bg-white/10 backdrop-blur-sm p-6 md:p-8 rounded-lg shadow-xl w-full max-w-lg text-white relative">
        {isLoading && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-50 rounded-lg">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white"></div>
                <p className="text-white ml-3">Procesando...</p>
            </div>
        )}

        {errorApi && (
            <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
                <strong className="font-bold">Error: </strong>
                <span className="block sm:inline">{errorApi}</span>
            </div>
        )}

        <div className="mb-4">
          <label htmlFor="fecha" className={labelClass}>Fecha *</label>
          <input
            id="fecha"
            value={fecha}
            type="date"
            required
            className={`${baseInputClass} ${disabledInputClass}`}
            disabled
          />
        </div>

        <div className="mb-4">
          <label htmlFor="fechaLimite" className={labelClass}>Fecha Límite de Recepción</label>
          <input
            id="fechaLimite"
            value={fechaLimite}
            onChange={(e) => setFechaLimite(e.target.value)}
            type="date"
            className={baseInputClass}
            min={fecha}
          />
        </div>

        <div className="mb-4">
          <label htmlFor="producto" className={labelClass}>Producto *</label>
            <select
                id="producto"
                name="producto"
                required
                value={producto}
                onChange={(e) => setProducto(e.target.value)}
                className={baseInputClass}
                disabled={productsLoading}
              >
                <option value="" disabled>
                    {productsLoading ? "Cargando productos..." : "Seleccionar producto"}
                </option>
                {productsError && <option value="" disabled>Error al cargar productos</option>}
                {!productsLoading && !productsError && productos.map((prod) => (
                  <option value={prod.id} key={prod.id}>
                    {prod.nombre} ({prod.codigo})
                  </option>
                ))}
          </select>
          {productsError && <p className="text-xs text-red-400 mt-1">{productsError}</p>}
        </div>

        {/* CAMPO PROVEEDOR ELIMINADO */}

        <div className="mb-4">
          <label htmlFor="cantidad" className={labelClass}>Cantidad *</label>
          <input
            id="cantidad"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            type="number"
            required
            min="0"
            placeholder="Ej: 10"
            className={baseInputClass}
          />
        </div>
        

        <div className="mb-4">
          <label htmlFor="clasificacion" className={labelClass}>Clasificacion *</label>
          <input
            id="clasificacion"
            value={observaciones_solicitud}
            onChange={(e) => setObservacionesSolicitud(e.target.value)}
            type="text"
            required
            className={baseInputClass}
          />
        </div>


        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-6">
           <BotonVolver />
          <button
            onClick={handleAgregar}
            disabled={isLoading || productsLoading}
            className="bg-indigo-500 text-white font-semibold px-6 py-2 rounded-md hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-opacity-75 transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Agregando...' : 'Agregar Pedido'}
          </button>

        </div>
      </div>

      {pedidos.length > 0 && (
        <div className="mt-10 w-full max-w-lg bg-white p-4 md:p-6 rounded-lg shadow-md text-black">
          <h2 className="text-lg font-semibold mb-3 text-gray-800">Pedidos Agregados:</h2>
          <ul className="divide-y divide-gray-200 max-h-64 overflow-y-auto text-sm">
            {pedidos.map((pedido, idx) => {
              const productoInfo = productos.find(p => p.id.toString() === pedido.producto);
              const nombreProducto = productoInfo ? productoInfo.nombre : `ID Producto: ${pedido.producto}`;

              // Se elimina la búsqueda del proveedor
              return (
                <li key={idx} className="py-2">
                   <strong>{nombreProducto}</strong> - Cant: {pedido.cantidad} ({pedido.fecha})
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}