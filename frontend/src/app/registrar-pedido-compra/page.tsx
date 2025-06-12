'use client';
import { useProductsContext } from '@/context/ProductsContext';
import { useProveedoresContext, Proveedor } from '@/context/ProveedoresContext'; // 1. IMPORTAR
import { useRouter } from 'next/navigation';
import React, { useState } from 'react';

// Definimos el tipo para un solo pedido para usar en el estado
interface IPedido {
  fecha: string;
  producto: string; // ID del producto
  proveedor_id: string; // ID del proveedor
  cantidad: string;
  precioSinIva: string;
  cuenta: string;
  iibb: string;
  importeTotal: string;
  importeAbonado: string;
  chequePerteneciente: string;
}


export default function RegistrarIngreso() {

  // --- Estados ---
  const [fecha, setFecha] = useState('');
  const [producto, setProducto] = useState('');
  const [proveedor_id, setProveedorId] = useState(''); // Cambiado el nombre del setter para claridad
  const [cantidad, setCantidad] = useState('');
  const [precioSinIva, setPrecioSinIva] = useState('');
  const [cuenta, setCuenta] = useState('');
  const [iibb, setIibb] = useState('');
  const [importeTotal, setImporteTotal] = useState('');
  const [importeAbonado, setImporteAbonado] = useState('');
  const [chequePerteneciente, setChequePerteneciente] = useState('');
  const irAccionesPuerta = () => router.push('/compras');
  const { productos, loading: productsLoading, error: productsError } = useProductsContext(); // Renombrar loading/error para evitar colisiones
  const { 
    proveedores, 
    loading: proveedoresLoading, 
    error: proveedoresError 
  } = useProveedoresContext(); // 2. OBTENER PROVEEDORES DEL CONTEXTO
  const router = useRouter();
  const [pedidos, setPedidos] = useState<IPedido[]>([]);
  const [errorApi, setErrorApi] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null; // Mover dentro del componente si no se usa en el scope global

  const handleAgregar = async () => {
    if (!fecha || !producto || !proveedor_id || !cantidad) {
        setErrorApi("Por favor, completa los campos obligatorios: Fecha, Producto, Proveedor, Cantidad.");
        return;
    }

    setIsLoading(true);
    setErrorApi(null);
    console.log("Agregando pedido...");

    const nuevoPedido: IPedido = {
      fecha, producto, proveedor_id, cantidad, precioSinIva,
      cuenta, iibb, importeTotal, importeAbonado, chequePerteneciente,
    };
    
    //eslint-disable-next-line
    const userItem:any = sessionStorage.getItem("user");
    const user = userItem ? JSON.parse(userItem) : null; // Parsear el JSON del usuario

    if (!user || !user.id) {
        setErrorApi("No se pudo obtener la información del usuario. Por favor, inicie sesión de nuevo.");
        setIsLoading(false);
        return;
    }

    const ventaPayload = {
      usuario_interno_id: user.id, 
      items: [ { codigo_interno: parseInt(producto), cantidad: parseInt(cantidad),precio_unitario_estimado: parseFloat(precioSinIva) } ], // Asegurar que cantidad sea número
      fecha_pedido: fecha,
      proveedor_id: parseInt(proveedor_id), 
      iibb: iibb,
    };
    console.log("Payload:", ventaPayload);

    try {
      const response = await fetch('https://quimex.sistemataup.online/ordenes_compra/crear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role' : user.role, // Usar el rol del usuario o un default
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

      setFecha(''); setProducto(''); setProveedorId(''); setCantidad('');
      setPrecioSinIva(''); setCuenta(''); setIibb('');
      setImporteTotal(''); setImporteAbonado(''); ; setChequePerteneciente('');
      irAccionesPuerta();
      //eslint-disable-next-line
    } catch (error: any) {
      console.error('Error al registrar compra:', error);
      setErrorApi(error.message || "Ocurrió un error al registrar el pedido.");
    } finally {
        setIsLoading(false);
    }
  };



  const baseInputClass = "w-full px-3 py-2 rounded bg-white text-black border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent placeholder-gray-500 transition duration-150 ease-in-out";
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

        {/* Campo Fecha */}
        <div className="mb-4">
          <label htmlFor="fecha" className={labelClass}>Fecha *</label>
          <input
            id="fecha" value={fecha} onChange={(e) => setFecha(e.target.value)}
            type="date" required className={baseInputClass}
          />
        </div>

        {/* Campo Producto */}
        <div className="mb-4">
          <label htmlFor="producto" className={labelClass}>Producto *</label>
            <select
                id="producto" name="producto" required value={producto}
                onChange={(e) => setProducto(e.target.value)}
                className={baseInputClass}
                disabled={productsLoading} // Deshabilitar mientras cargan productos
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

        {/* 3. Campo Proveedor MODIFICADO */}
        <div className="mb-4">
          <label htmlFor="proveedor" className={labelClass}>Proveedor *</label>
          <select
            id="proveedor"
            name="proveedor_id" // El name es importante si usaras FormData, pero con estado no tanto
            value={proveedor_id}
            onChange={(e) => setProveedorId(e.target.value)}
            required
            className={baseInputClass}
            disabled={proveedoresLoading} // Deshabilitar mientras cargan proveedores
          >
            <option value="" disabled>
              {proveedoresLoading ? "Cargando proveedores..." : "Seleccionar proveedor"}
            </option>
            {/* Opcional: Mostrar error de carga de proveedores aquí si lo deseas */}
            {proveedoresError && <option value="" disabled>Error al cargar proveedores</option>}
            {!proveedoresLoading && !proveedoresError && proveedores
              .filter(prov => prov.activo) // Opcional: Filtrar solo proveedores activos
              .map((prov: Proveedor) => (
              <option value={prov.id.toString()} key={prov.id}> {/* Asegurar que el value sea string si el estado lo es */}
                {prov.nombre} {prov.cuit ? `(${prov.cuit})` : ''}
              </option>
            ))}
          </select>
          {/* Opcional: Mostrar mensaje de error si la carga de proveedores falló */}
          {proveedoresError && <p className="text-xs text-red-400 mt-1">{proveedoresError}</p>}
        </div>

        {/* Campo Cantidad */}
        <div className="mb-4">
          <label htmlFor="cantidad" className={labelClass}>Cantidad *</label>
          <input
            id="cantidad" value={cantidad} onChange={(e) => setCantidad(e.target.value)}
            type="number" required min="0" placeholder="Ej: 10" className={baseInputClass}
          />
        </div>
        {/* Campo Precio Sin IVA */}
        <div className="mb-4">
          <label htmlFor="precioSinIva" className={labelClass}>Precio Unitario (Sin IVA)</label>
          <input
            id="precioSinIva" value={precioSinIva} onChange={(e) => setPrecioSinIva(e.target.value)}
            type="number" step="0.01" min="0" placeholder="Ej: 150.75" className={baseInputClass}
          />
        </div>

        {/* Campo Cuenta */}
        <div className="mb-4">
          <label htmlFor="cuenta" className={labelClass}>Cuenta</label>
          <input
            id="cuenta" value={cuenta} onChange={(e) => setCuenta(e.target.value)}
            type="text" placeholder="Ej: 411001" className={baseInputClass}
          />
        </div>

        {/* Campo IIBB */}
        <div className="mb-4">
          <label htmlFor="iibb" className={labelClass}>IIBB (%)</label>
          <input
            id="iibb" value={iibb} onChange={(e) => setIibb(e.target.value)}
            type="number" step="0.01" min="0" placeholder="Ej: 3.5" className={baseInputClass}
          />
        </div>

    

        {/* Botones */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-6">
          <button
            onClick={handleAgregar}
            disabled={isLoading || proveedoresLoading || productsLoading} // Deshabilitar si alguna data esencial está cargando
            className="bg-indigo-500 text-white font-semibold px-6 py-2 rounded-md hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-opacity-75 transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Agregando...' : 'Agregar Pedido'}
          </button>

        </div>
      </div>

      {/* Lista de Pedidos Agregados */}
      {pedidos.length > 0 && (
        <div className="mt-10 w-full max-w-lg bg-white p-4 md:p-6 rounded-lg shadow-md text-black">
          <h2 className="text-lg font-semibold mb-3 text-gray-800">Pedidos Agregados:</h2>
          <ul className="divide-y divide-gray-200 max-h-64 overflow-y-auto text-sm">
            {pedidos.map((pedido, idx) => {
              const productoInfo = productos.find(p => p.id.toString() === pedido.producto);
              const nombreProducto = productoInfo ? productoInfo.nombre : `ID Producto: ${pedido.producto}`;
              
              // Buscar nombre del proveedor para mostrarlo
              const proveedorInfo = proveedores.find(p => p.id.toString() === pedido.proveedor_id);
              const nombreProveedor = proveedorInfo ? proveedorInfo.nombre : `ID Proveedor: ${pedido.proveedor_id}`;

              return (
                <li key={idx} className="py-2">
                   <strong>{nombreProducto}</strong> - Cant: {pedido.cantidad} <br />
                   Prov: {nombreProveedor} ({pedido.fecha})
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}