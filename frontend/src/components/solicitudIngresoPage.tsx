'use client';

import { useProductsContext } from "@/context/ProductsContext";
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// --- Interface (sin cambios) ---
interface ISolicitudes {
  fecha: string,
  proveedor: string,
  producto: string,
  codigo: string,
  moneda: string,
  cantidad: string,
  tipo: string,
  importeTotal: string,
  estado_recepcion: string,
  cantidad_recepcionada: string,
  items_recibidos: [
    {
     "id_linea": number,
     "cantidad_recibida": number,
     "costo_unitario_ars": number,
     "notas_item": string,
     },
  ]
  ajusteTC: string,
  importeCC: string,
  cantidadAcumulada: string,
  ajusteXTC: string,
  diferenciaCambio: string,
  importeAbonado: string,
  formaPago: string,
  chequePerteneceA: string,
  nro_remito_proveedor : string, // Ya estaba en la interfaz, ¡perfecto!
}

//eslint-disable-next-line
export default function SolicitudIngresoPage({ id }: any) {
  // --- Estados ---
  const [fecha, setFecha] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [producto, setProducto] = useState('0');
  const [codigo, setCodigo] = useState('');
  const [moneda] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [tipo, setTipo] = useState('Litro');
  const [importeTotal, setImporteTotal] = useState('');
  const [estado_recepcion, setEstadoRecepcion] = useState('Completa');
  const [cantidad_recepcionada, setCantidadRecepcionada] = useState('');
  
  // 1. AÑADIR ESTADO PARA NRO_REMITO_PROVEEDOR
  const [nro_remito_proveedor, setNroRemitoProveedor] = useState('');

  const [ajusteTC] = useState(''); // Estos parecen no usarse o ser solo para la interfaz local
  const [importeCC, setImporteCC] = useState('');
  const [cantidadAcumulada] = useState('');
  const [ajusteXTC] = useState('');
  const [diferenciaCambio] = useState('');
  const [importeAbonado, setImporteAbonado] = useState('');
  const [formaPago, setFormaPago] = useState('');
  const [chequePerteneceA, setChequePerteneceA] = useState('');
  const [solicitudes, setSolicitudes] = useState<ISolicitudes[]>([]);
  const { productos } = useProductsContext();
  const [errorMensaje, setErrorMensaje] = useState('');
  const [estadoOC, setEstadoOC] = useState('');
  let problema = false; // Considera usar un estado para 'problema' si afecta el renderizado
  const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null; // Mover a useEffect si solo se necesita al montar
  const router = useRouter();

  useEffect(() => {
    if (id && token) { // Asegurar que token exista antes de llamar
      cargarFormulario();
    } else if (id && !token) {
        setErrorMensaje("No autenticado. No se pueden cargar los datos de la orden.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]); // Añadir token como dependencia

  async function cargarFormulario() {
    // ... (sin cambios en cargarFormulario, cargarCamposProducto, calcular_precio, formatearFecha)
    try {
      setErrorMensaje('');
      const response = await fetch(`https://quimex.sistemataup.online/ordenes_compra/obtener/${id}`,{headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }});
      if (!response.ok) throw new Error(`Error al traer la orden: ${response.statusText}`);
      const data = await response.json();
      if (!data || !data.items || data.items.length === 0) {
        console.error("Respuesta de API incompleta", data);
        setErrorMensaje("No se encontraron items en la orden de compra.");
        return;
      }
      console.log("Datos OC cargados:", data);
      const item = data.items[0];
      setFecha(formatearFecha(data.fecha_creacion));
      setCantidadRecepcionada(item.cantidad_recibida?.toString() ?? '');
      const cant = item.cantidad_solicitada;
      setCantidad(item.cantidad_solicitada?.toString() ?? '');
      setProveedor(data.proveedor_nombre || 'N/A');
      setEstadoOC(data.estado || '');
      console.log("Estado OC seteado a:", data.estado);
      if (item.producto_id && !isNaN(parseFloat(item.cantidad_solicitada))) {
          await cargarCamposProducto(item.producto_id, parseFloat(cant));
      } else {
          setProducto(item.producto_id?.toString() ?? '0');
          setCodigo(item.producto_id?.toString() ?? '');
      }
    }
    //eslint-disable-next-line
    catch (err: any) {
      console.error("Error detallado al cargar formulario:", err);
      setErrorMensaje(`Error cargando datos: ${err.message}`);
      setEstadoOC('');
    }
  }
  async function cargarCamposProducto(id_producto:number,cantidad_f : number){
    try{
      const response = await fetch(`https://quimex.sistemataup.online/productos/obtener/${id_producto}`,{headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }});
      if (!response.ok) throw new Error(`Error al traer producto ${id_producto}: ${response.statusText}`);
      const data = await response.json();
      console.log("Datos producto:", data);
      setCodigo(id_producto.toString());
      setProducto(data.id?.toString() ?? '0');
      const unidad = data.unidad_venta;
      if (unidad == 'LT') setTipo('Litro');
      else if (unidad == 'KG') setTipo('Kilo');
      else setTipo('Unidad');
      await calcular_precio(id_producto,cantidad_f);
    }
    //eslint-disable-next-line
     catch (err: any) {
      console.error("Error cargando campos producto:", err);
      setErrorMensaje(`Error cargando detalles del producto: ${err.message}`);
    }
  }
  async function calcular_precio(id_producto:number,cantidad_f:number){
    if (isNaN(cantidad_f) || cantidad_f <= 0) {
        console.warn("Cantidad inválida para calcular precio:", cantidad_f);
        setImporteTotal('0');
        return;
    }
    try{
      const response = await fetch(`https://quimex.sistemataup.online/productos/calcular_precio/${id_producto}`,{
        method: "POST", headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},
        body: JSON.stringify({ producto_id: id_producto, quantity: cantidad_f }),
      });
      if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`Error al calcular precio: ${response.statusText} - ${errorData.mensaje || 'Sin detalles'}`);
      }
      const precioData = await response.json();
      console.log("Respuesta cálculo precio:", precioData);
      setImporteTotal(precioData.precio_total_calculado_ars?.toString() ?? '0');
      //eslint-disable-next-line
    } catch (err: any) {
      console.error("Error calculando precio:", err);
      setErrorMensaje(`Error calculando el importe: ${err.message}`);
      setImporteTotal('');
    }
  }
  const formatearFecha = (fechaOriginal: string | Date | undefined): string => {
    if (!fechaOriginal) return '';
     try {
        const fecha = new Date(fechaOriginal);
        if (isNaN(fecha.getTime())) return '';
        const year = fecha.getFullYear();
        const month = String(fecha.getMonth() + 1).padStart(2, '0');
        const day = String(fecha.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    } catch (error) {
        console.error("Error formateando fecha:", error);
        return '';
    }
  };

  // --- enviarSolicitudAPI ---
  const enviarSolicitudAPI = async (solicitud: ISolicitudes) => {
    try {
      problema = false;
      setErrorMensaje('');

      // 4. INCLUIR NRO_REMITO_PROVEEDOR EN EL PAYLOAD
      const payload = {
        items_recibidos: solicitud.items_recibidos.map(item => ({
            id_linea: item.id_linea,
            cantidad_recibida: item.cantidad_recibida,
            costo_unitario_ars: item.costo_unitario_ars,
            notas_item: item.notas_item,
        })),
        estado_recepcion: solicitud.estado_recepcion, // Usar el estado de la solicitud
        nro_remito_proveedor: solicitud.nro_remito_proveedor, // <--- AÑADIDO AQUÍ
      };

      console.log("Enviando payload a API:", JSON.stringify(payload, null, 2));
      
      //eslint-disable-next-line
      const userItem:any = localStorage.getItem("user"); // Deberías considerar usar sessionStorage si el token está allí
      const user = userItem ? JSON.parse(userItem) : null;

      if (!user || !token) {
          setErrorMensaje("Error de autenticación. Por favor, inicie sesión de nuevo.");
          problema = true;
          return;
      }

      const response = await fetch(`https://quimex.sistemataup.online/ordenes_compra/recibir/${id}`, {
        method: 'PUT',
        headers: { 
            'Content-Type': 'application/json', 
            'X-User-Role' : user.role || 'USER', // Asegúrate que user.role exista
            'X-User-Name' : user.usuario || user.name, // Asegúrate que user.usuario o user.name exista
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      console.log("Respuesta API:", { status: response.status, ok: response.ok, body: data });

      if (!response.ok) {
        problema = true;
        setErrorMensaje(data?.mensaje || data?.detail || data?.error || `Error ${response.status}: ${response.statusText}`);
        console.error("Error API:", data || response.statusText);
        return;
      }
      console.log('Solicitud (Recepción) enviada correctamente', data);
    }
    //eslint-disable-next-line
    catch (error: any) {
      console.error('Error al enviar la solicitud (recepción):', error);
      problema = true;
      setErrorMensaje(`Error de red o al procesar la solicitud: ${error.message}`);
    }
  };

  // --- handleAgregar ---
  const handleAgregar = async () => {
    setErrorMensaje('');

    if (estadoOC !== 'Aprobado') {
        setErrorMensaje('Solo se pueden registrar ingresos de solicitudes aprobadas.');
        console.warn(`Intento de registrar ingreso fallido. Estado OC: ${estadoOC}`);
        return;
    }
    
    // Validaciones adicionales
    if (!cantidad_recepcionada || isNaN(parseFloat(cantidad_recepcionada)) || parseFloat(cantidad_recepcionada) <= 0) { // <=0 para no permitir cero
        setErrorMensaje("La cantidad recepcionada debe ser un número mayor a cero.");
        return;
    }
    if (!nro_remito_proveedor.trim()) { // Validar que el remito no esté vacío
        setErrorMensaje("El número de remito del proveedor es obligatorio.");
        return;
    }

    const idLineaCorrecto = parseInt(producto); // REVISAR ESTO. Debería ser el ID de la línea de la OC.
    if (isNaN(idLineaCorrecto) || idLineaCorrecto === 0) { // producto se inicializa a '0'
       setErrorMensaje("No se pudo determinar la línea del producto para la recepción. Verifique que un producto esté cargado.");
       return;
    }

    // 3. INCLUIR NRO_REMITO_PROVEEDOR EN NUEVASOLICITUD
    const nuevaSolicitud: ISolicitudes = {
      fecha, proveedor, producto, codigo, moneda, cantidad, tipo, importeTotal,
      estado_recepcion,
      cantidad_recepcionada,
      items_recibidos: [
        {
         "id_linea": idLineaCorrecto,
         "cantidad_recibida": parseFloat(cantidad_recepcionada),
         "costo_unitario_ars": 0, // Este valor debe ser dinámico o venir de algún lado
         "notas_item": "",      // Este valor debe ser dinámico o venir de algún lado
         },
      ],
      ajusteTC, importeCC, cantidadAcumulada, ajusteXTC, diferenciaCambio,
      importeAbonado, formaPago, chequePerteneceA,
      nro_remito_proveedor: nro_remito_proveedor.trim(), // Guardar el valor del estado
    };

    setSolicitudes((prev) => [...prev, nuevaSolicitud]);
    await enviarSolicitudAPI(nuevaSolicitud);

    if(!problema) {
      console.log("Recepción procesada, limpiando campos y/o redirigiendo...");
      alert("Ingreso registrado correctamente.");
      setCantidadRecepcionada('');
      setImporteCC(''); setImporteAbonado(''); setFormaPago(''); setChequePerteneceA('');
      setEstadoRecepcion('Completa');
      setNroRemitoProveedor(''); // Limpiar el campo de remito
      router.push('/compras'); // O a donde quieras redirigir
    } else {
       setSolicitudes(prev => prev.slice(0, -1));
       console.log("Hubo un problema al enviar a la API. El mensaje de error se muestra.");
    }
  };

  const baseInputClass = "w-full px-3 py-2 rounded bg-white text-black border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const disabledInputClass = "disabled:bg-gray-200 disabled:text-gray-600 disabled:cursor-not-allowed disabled:border-gray-300";
  const labelClass = "block text-sm font-medium mb-1 text-white";

  return (
    <div className="min-h-screen flex flex-col items-center bg-[#20119d] px-4 py-10">
      <h1 className="text-white text-3xl font-bold mb-8 text-center">Solicitud de Ingreso (OC: {id})</h1>
      {estadoOC && (
        <p className="text-white text-lg mb-4">Estado Orden de Compra: <span className={`font-semibold ${estadoOC === 'Aprobado' ? 'text-green-300' : 'text-yellow-300'}`}>{estadoOC}</span></p>
      )}
      {errorMensaje && (
         <div className="w-full max-w-4xl mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">{errorMensaje}</span>
         </div>
      )}
      <div className="bg-white/10 backdrop-blur-sm p-6 md:p-8 rounded-lg shadow-xl w-full max-w-4xl text-white">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">

          {/* --- Fila 1 --- */}
          <div>
            <label htmlFor="fecha" className={labelClass}>Fecha OC</label>
            <input id="fecha" required type="date" value={fecha} readOnly className={`${baseInputClass} ${disabledInputClass}`} />
          </div>
          <div>
            <label htmlFor="proveedor" className={labelClass}>Proveedor</label>
            <input id="proveedor" value={proveedor} className={`${baseInputClass} ${disabledInputClass}`} disabled />
          </div>
          <div>
            <label htmlFor="producto" className={labelClass}>Producto</label>
            <select id="producto" name="producto" required value={producto} className={`${baseInputClass} ${disabledInputClass}`} disabled >
                <option value="0" disabled>Seleccionar producto</option>
                {//eslint-disable-next-line 
                productos.map((prod: any, index: number) => ( <option value={prod.id} key={index}> {prod.nombre} </option> ))}
            </select>
          </div>

          {/* --- Fila 2 --- */}
          <div>
            <label htmlFor="codigo" className={labelClass}>Código</label>
            <input id="codigo" value={codigo} className={`${baseInputClass} ${disabledInputClass}`} disabled />
          </div>
          <div>
            <label htmlFor="moneda" className={labelClass}>Moneda OC</label>
            <input id="moneda" required value={moneda} readOnly className={`${baseInputClass} ${disabledInputClass}`} />
          </div>
          <div>
            <label htmlFor="cantidad" className={labelClass}>Cant. Solicitada</label>
            <input id="cantidad" required type="number" value={cantidad} className={`${baseInputClass} ${disabledInputClass}`} disabled />
          </div>

          {/* --- Fila 3 --- */}
          <div>
            <label htmlFor="tipo" className={labelClass}>Tipo</label>
            <select id="tipo" value={tipo} className={`${baseInputClass} ${disabledInputClass}`} disabled >
              <option value="Litro">Litro</option> <option value="Kilo">Kilo</option> <option value="Unidad">Unidad</option>
            </select>
          </div>
          <div>
            <label htmlFor="importeTotal" className={labelClass}>Importe Total OC</label>
            <input id="importeTotal" type="number" value={importeTotal} className={`${baseInputClass} ${disabledInputClass}`} disabled />
          </div>
           <div>
            <label htmlFor="estado_recepcion" className={labelClass}>Estado Recepción</label>
            <select id="estado_recepcion" value={estado_recepcion} onChange={(e) => setEstadoRecepcion(e.target.value)} className={`${baseInputClass}`} >
              <option value="Completa">Completa</option> <option value="Parcial">Parcial</option> <option value="Extra">Extra</option> <option value="Con Daños">Con Daños</option>
            </select>
          </div>

          {/* --- Fila 4 (Campos de recepción) --- */}
          <div>
            <label htmlFor="cantidad_recepcionada" className={labelClass}>Cantidad Recepcionada *</label>
            <input id="cantidad_recepcionada" required type="number" value={cantidad_recepcionada} onChange={(e) => setCantidadRecepcionada(e.target.value)} className={`${baseInputClass}`} />
          </div>
          {/* 2. AÑADIR INPUT PARA NRO_REMITO_PROVEEDOR */}
          <div>
            <label htmlFor="nro_remito_proveedor" className={labelClass}>N° Remito Proveedor *</label>
            <input 
              id="nro_remito_proveedor" 
              type="text" 
              value={nro_remito_proveedor} 
              onChange={(e) => setNroRemitoProveedor(e.target.value)} 
              className={`${baseInputClass}`}
              placeholder="Ej: R-0001-0012345"
              required // Hacerlo obligatorio
            />
          </div>
           <div>
            <label htmlFor="importeCC" className={labelClass}>Importe a CC</label>
            <input id="importeCC" value={importeCC} onChange={(e) => setImporteCC(e.target.value)} className={`${baseInputClass}`} />
          </div>
          
          {/* --- Fila 5 (Campos financieros) --- */}
          <div>
            <label htmlFor="importeAbonado" className={labelClass}>Importe Abonado</label>
            <input id="importeAbonado" value={importeAbonado} onChange={(e) => setImporteAbonado(e.target.value)} className={`${baseInputClass}`} />
          </div>
          <div>
            <label htmlFor="formaPago" className={labelClass}>Forma de Pago</label>
            <input id="formaPago" value={formaPago} onChange={(e) => setFormaPago(e.target.value)} className={`${baseInputClass}`} />
          </div>
          <div>
            <label htmlFor="chequePerteneceA" className={labelClass}>Cheque Perteneciente a</label>
            <input id="chequePerteneceA" value={chequePerteneceA} onChange={(e) => setChequePerteneceA(e.target.value)} className={`${baseInputClass}`} />
          </div>
        </div>

        {/* Botones */}
        <div className="flex gap-4 justify-center mt-8">
          <button
            onClick={handleAgregar}
            disabled={estadoOC !== 'Aprobado' || !cantidad_recepcionada || !nro_remito_proveedor.trim()} // Añadir validación de remito al disabled
            className="bg-green-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-600 transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
          >
             Registrar ingreso
          </button>
           <button
             onClick={() => router.back()}
             type="button"
             className="bg-gray-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-600 transition duration-150 ease-in-out"
           >
             Volver
           </button>
        </div>
      </div>

      {/* Tabla de Solicitudes */}
      {solicitudes.length > 0 && (
        <div className="mt-10 w-full max-w-5xl bg-white p-6 rounded-lg shadow-lg text-black">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Items Agregados en esta Sesión:</h2>
          <div className="max-h-80 overflow-y-auto text-sm space-y-3">
            {solicitudes.map((s, idx) => (
              <div key={idx} className="border-b border-gray-200 pb-3 last:border-b-0">
                 <p><strong>Producto (Intento {idx+1}):</strong> {s.producto} | <strong>Cantidad Recibida:</strong> {s.cantidad_recepcionada} | <strong>Remito:</strong> {s.nro_remito_proveedor}</p>
                 <p><strong>Estado Recepción Seleccionado:</strong> {s.estado_recepcion}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}