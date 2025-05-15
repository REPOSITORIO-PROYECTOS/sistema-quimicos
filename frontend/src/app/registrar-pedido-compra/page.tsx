'use client';
import { useProductsContext } from '@/context/ProductsContext';
import React, { useState } from 'react';

// Definimos el tipo para un solo pedido para usar en el estado
interface IPedido {
  fecha: string;
  producto: string; // Debería ser el ID del producto (string o number)
  proveedor_id: string;
  cantidad: string;
  moneda: string;
  precioSinIva: string;
  cuenta: string;
  iibb: string;
  importeTotal: string; // Este campo no se está usando/calculando en el form
  importeAbonado: string; // Este campo no se está usando/calculando en el form
  formaPago: string;
  chequePerteneciente: string; // Este campo no se está usando/calculando en el form
}


export default function RegistrarIngreso() {

  // --- Estados (sin cambios) ---
  const [fecha, setFecha] = useState('');
  const [producto, setProducto] = useState(''); // Guardará el ID del producto
  const [proveedor_id, setProveedor] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [moneda, setTipoCambio] = useState('');
  const [precioSinIva, setPrecioSinIva] = useState('');
  const [cuenta, setCuenta] = useState('');
  const [iibb, setIibb] = useState('');
  const [importeTotal, setImporteTotal] = useState(''); // No hay input para este
  const [importeAbonado, setImporteAbonado] = useState(''); // No hay input para este
  const [formaPago, setFormaPago] = useState('');
  const [chequePerteneciente, setChequePerteneciente] = useState(''); // No hay input para este
  const { productos } = useProductsContext();
  const [pedidos, setPedidos] = useState<IPedido[]>([]); // Usamos la interfaz definida
  const [errorApi, setErrorApi] = useState<string | null>(null); // Estado para errores de API
  const [isLoading, setIsLoading] = useState(false); // Estado para feedback de carga

  // --- Lógica handleAgregar (sin cambios funcionales, con feedback) ---
  const handleAgregar = async () => {
    // Validaciones básicas (puedes añadir más)
    if (!fecha || !producto || !proveedor_id || !cantidad || !moneda) {
        setErrorApi("Por favor, completa los campos obligatorios: Fecha, Producto, Proveedor, Cantidad, Moneda.");
        return;
    }

    setIsLoading(true);
    setErrorApi(null); // Limpiar error anterior
    console.log("Agregando pedido...");

    const nuevoPedido: IPedido = {
      fecha, producto, proveedor_id, cantidad, moneda, precioSinIva,
      cuenta, iibb, importeTotal, importeAbonado, formaPago, chequePerteneciente,
    };
    //eslint-disable-next-line
    const user:any = localStorage.getItem("user")
    const ventaPayload = {
      usuario_interno_id: user.id, // Asumiendo ID fijo
      items: [ { id: parseInt(producto), cantidad: cantidad } ], // Convertir id a number si la API lo espera
      cliente_id: 1, // Asumiendo ID fijo
      // producto, // 'producto' ya está dentro de 'items', usualmente no se repite aquí
      fecha_pedido: fecha,
      // direccion_entrega: '', // Campos no presentes en el form
      // cuit_cliente: '',
      // observaciones: '',
      proveedor_id: parseInt(proveedor_id), // Convertir a number
      moneda
    };
    console.log("Payload:", ventaPayload);

    try {
      //eslint-disable-next-line
      const user:any = localStorage.getItem("user")
      
      const response = await fetch('https://quimex.sistemataup.online/ordenes_compra/crear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role' : 'ADMIN',
          'X-User-Name' : user.nombre_usuario
        },
        body: JSON.stringify(ventaPayload),
      });

      console.log("Respuesta recibida:", response.status, response.ok);

      if (!response.ok) {
        let errorMsg = `Error ${response.status}: ${response.statusText}`;
        try {
            const errorData = await response.json();
            console.error('Error en la respuesta:', errorData);
            errorMsg = errorData?.mensaje || errorData?.detail || errorMsg; // Intenta obtener mensaje específico
        } catch (jsonError) {
            console.error("No se pudo parsear JSON del error:", jsonError);
        }
        throw new Error(errorMsg); // Lanzar error para el catch
      }

      const data = await response.json();
      console.log('Compra registrada con éxito:', data);
      alert('Pedido agregado con éxito!'); // Feedback al usuario

      setPedidos((prev) => [...prev, nuevoPedido]); // Añadir a la lista local

      // Limpiar campos del formulario
      setFecha(''); setProducto(''); setProveedor(''); setCantidad('');
      setTipoCambio(''); setPrecioSinIva(''); setCuenta(''); setIibb('');
      setImporteTotal(''); setImporteAbonado(''); setFormaPago(''); setChequePerteneciente('');

    }//eslint-disable-next-line
      catch (error: any) {
      console.error('Error al registrar compra:', error);
      setErrorApi(error.message || "Ocurrió un error al registrar el pedido."); // Mostrar error al usuario
    } finally {
        setIsLoading(false); // Terminar estado de carga
    }
  };

  // --- handleComprar (sin cambios) ---
  const handleComprar = () => {
    // Aquí iría la lógica para procesar/finalizar todos los pedidos agregados
    if (pedidos.length === 0) {
        alert("No hay pedidos agregados para comprar.");
        return;
    }
    alert(`Procesando ${pedidos.length} pedido(s)... (Lógica de 'Comprar' pendiente)`);
    // Probablemente limpiar la lista después de "comprar"
    // setPedidos([]);
    console.log('Comprar');
  };

  // --- Clases CSS comunes ---
  const baseInputClass = "w-full px-3 py-2 rounded bg-white text-black border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent placeholder-gray-500 transition duration-150 ease-in-out";
  const labelClass = "block text-sm font-medium mb-1 text-gray-200"; // Texto un poco más suave

  return (
    // Contenedor principal
    <div className="min-h-screen flex flex-col items-center bg-gradient-to-br from-[#20119d] to-[#1c0f8a] px-4 py-10"> {/* Fondo gradiente sutil */}
      <h1 className="text-white text-3xl font-bold mb-6 text-center drop-shadow-md"> {/* Sombra al texto */}
        Solicitar Compra
      </h1>

      {/* Contenedor del formulario */}
      <div className="bg-white/10 backdrop-blur-sm p-6 md:p-8 rounded-lg shadow-xl w-full max-w-lg text-white relative"> {/* max-w-lg, padding, fondo, sombra */}

        {/* Indicador de carga */}
        {isLoading && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-50 rounded-lg">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white"></div>
                <p className="text-white ml-3">Procesando...</p>
            </div>
        )}

         {/* Mensaje de Error API */}
        {errorApi && (
            <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
                <strong className="font-bold">Error: </strong>
                <span className="block sm:inline">{errorApi}</span>
            </div>
        )}

        {/* Campo Fecha */}
        <div className="mb-4"> {/* Espaciado entre campos */}
          <label htmlFor="fecha" className={labelClass}>Fecha *</label>
          <input
            id="fecha"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            type="date"
            required
            className={baseInputClass}
          />
        </div>

        {/* Campo Producto */}
        <div className="mb-4">
          <label htmlFor="producto" className={labelClass}>Producto *</label>
            <select
                id="producto"
                name="producto"
                required
                value={producto}
                onChange={(e) => setProducto(e.target.value)}
                className={baseInputClass}
              >
                <option value="" disabled>Seleccionar producto</option> {/* Cambiado value a "" */}
                {//eslint-disable-next-line
                productos.map((prod: any) => ( // Mejor nombre de variable
                  <option value={prod.id} key={prod.id}> {/* Usar prod.id como key */}
                    {prod.nombre}
                  </option>
                ))}
          </select>
        </div>

        {/* Campo Proveedor */}
        <div className="mb-4">
          <label htmlFor="proveedor" className={labelClass}>Proveedor (ID) *</label>
          <input
            id="proveedor"
            value={proveedor_id}
            onChange={(e) => setProveedor(e.target.value)}
            type="number" // Asumiendo que es un ID numérico
            required
            placeholder="Ingrese el ID del proveedor"
            className={baseInputClass}
          />
        </div>

        {/* Campo Cantidad */}
        <div className="mb-4">
          <label htmlFor="cantidad" className={labelClass}>Cantidad *</label>
          <input
            id="cantidad"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            type="number"
            required
            min="0" // No permitir negativos
            placeholder="Ej: 10"
            className={baseInputClass}
          />
        </div>

        {/* Campo Moneda */}
        <div className="mb-4">
          <label htmlFor="moneda" className={labelClass}>Moneda *</label>
          <input
            id="moneda"
            value={moneda}
            onChange={(e) => setTipoCambio(e.target.value)}
            type="text"
            required
            placeholder="Ej: ARS, USD"
            className={baseInputClass}
          />
        </div>

        {/* Campo Precio Sin IVA */}
        <div className="mb-4">
          <label htmlFor="precioSinIva" className={labelClass}>Precio Unitario (Sin IVA)</label>
          <input
            id="precioSinIva"
            value={precioSinIva}
            onChange={(e) => setPrecioSinIva(e.target.value)}
            type="number"
            step="0.01"
            min="0"
            placeholder="Ej: 150.75"
            className={baseInputClass}
          />
        </div>

        {/* Campo Cuenta (¿Contable?) */}
        <div className="mb-4">
          <label htmlFor="cuenta" className={labelClass}>Cuenta</label>
          <input
            id="cuenta"
            value={cuenta}
            onChange={(e) => setCuenta(e.target.value)}
            type="text"
            placeholder="Ej: 411001"
            className={baseInputClass}
          />
        </div>

        {/* Campo IIBB (¿Percepción/Retención?) */}
        <div className="mb-4">
          <label htmlFor="iibb" className={labelClass}>IIBB (%)</label>
          <input
            id="iibb"
            value={iibb}
            onChange={(e) => setIibb(e.target.value)}
            type="number" // O text si incluye %
            step="0.01"
            min="0"
            placeholder="Ej: 3.5"
            className={baseInputClass}
          />
        </div>

        {/* Campo Forma de Pago */}
        <div className="mb-4">
          <label htmlFor="formaPago" className={labelClass}>Forma de Pago</label>
          <input
            id="formaPago"
            value={formaPago}
            onChange={(e) => setFormaPago(e.target.value)}
            type="text"
            placeholder="Ej: Transferencia, Cheque"
            className={baseInputClass}
          />
        </div>

        {/* Botones */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-6"> {/* Botones lado a lado en pantallas sm+ */}
          <button
            onClick={handleAgregar}
            disabled={isLoading} // Deshabilitar mientras carga
            className="bg-indigo-500 text-white font-semibold px-6 py-2 rounded-md hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-opacity-75 transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Agregando...' : 'Agregar Pedido'}
          </button>
          <button
            onClick={handleComprar}
            disabled={isLoading || pedidos.length === 0} // Deshabilitar si carga o no hay pedidos
            className="bg-green-500 text-white font-semibold px-6 py-2 rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-opacity-75 transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Comprar
          </button>
        </div>
      </div>

      {/* Lista de Pedidos Agregados */}
      {pedidos.length > 0 && (
        <div className="mt-10 w-full max-w-lg bg-white p-4 md:p-6 rounded-lg shadow-md text-black"> {/* max-w-lg, padding */}
          <h2 className="text-lg font-semibold mb-3 text-gray-800">Pedidos Agregados:</h2>
          <ul className="divide-y divide-gray-200 max-h-64 overflow-y-auto text-sm"> {/* Divide y */}
            {pedidos.map((pedido, idx) => {
              // Buscar nombre del producto para mostrarlo
              const productoInfo = productos.find(p => p.id.toString() === pedido.producto);
              const nombreProducto = productoInfo ? productoInfo.nombre : `ID: ${pedido.producto}`;
              return (
                <li key={idx} className="py-2"> {/* Padding vertical */}
                   <strong>{nombreProducto}</strong> - Cant: {pedido.cantidad} - Prov: {pedido.proveedor_id} ({pedido.fecha})
                   {/* Puedes añadir más detalles si quieres */}
                   {/* <br/> Moneda: {pedido.moneda} - Precio U.: {pedido.precioSinIva} */}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}