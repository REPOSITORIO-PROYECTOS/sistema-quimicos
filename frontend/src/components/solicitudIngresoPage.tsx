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
  estado_recepcion: string, // Estado de la recepción que el usuario selecciona
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
  nro_remito_proveedor : string,
}

//eslint-disable-next-line
export default function SolicitudIngresoPage({ id }: any) {
  // --- Estados ---
  const [fecha, setFecha] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [producto, setProducto] = useState('0');
  const [codigo, setCodigo] = useState('');
  const [moneda,setMoneda] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [tipo, setTipo] = useState('Litro');
  const [importeTotal, setImporteTotal] = useState('');
  const [estado_recepcion, setEstadoRecepcion] = useState('Completa'); // Estado de la recepción seleccionable
  const [cantidad_recepcionada, setCantidadRecepcionada] = useState('');
  const [ajusteTC] = useState('');
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
  const [estadoOC, setEstadoOC] = useState(''); // <-- NUEVO ESTADO para el estado de la OC
  let problema = false;
  const token = localStorage.getItem("token")
  const router = useRouter();

  useEffect(() => {
    if (id) {
      cargarFormulario();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function cargarFormulario() {
    try {
      setErrorMensaje(''); // Limpiar errores previos
      const response = await fetch(`https://quimex.sistemataup.online/ordenes_compra/obtener/${id}`,{headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }});
      if (!response.ok) throw new Error(`Error al traer la orden: ${response.statusText}`);
      const data = await response.json();
      if (!data || !data.items || data.items.length === 0) {
        console.error("Respuesta de API incompleta", data);
        setErrorMensaje("No se encontraron items en la orden de compra.");
        return;
      }

      console.log("Datos OC cargados:", data); // Log para depuración

      const item = data.items[0];
      // setEstadoRecepcion(data.estado_recepcion || 'Completa'); // Esto parece ser el estado de la *recepción* no de la OC
      setFecha(formatearFecha(data.fecha_creacion));
      setCantidadRecepcionada(item.cantidad_recibida?.toString() ?? '');
      const cant = item.cantidad_solicitada;
      setCantidad(item.cantidad_solicitada?.toString() ?? '');
      setProveedor(data.proveedor_nombre || 'N/A');

      // --- Guardar el estado de la Orden de Compra ---
      // AJUSTA 'data.estado' al nombre real del campo en tu API si es diferente
      setEstadoOC(data.estado || '');
      console.log("Estado OC seteado a:", data.estado); // Log para verificar

      if (item.producto_id && !isNaN(parseFloat(item.cantidad_solicitada))) {
          await cargarCamposProducto(item.producto_id, parseFloat(cant));
      } else {
          setProducto(item.producto_id?.toString() ?? '0');
          setCodigo(item.producto_id?.toString() ?? '');
      }
      // setMoneda(data.moneda_oc || '');
    } //eslint-disable-next-line
    catch (err: any) {
      console.error("Error detallado al cargar formulario:", err);
      setErrorMensaje(`Error cargando datos: ${err.message}`);
      setEstadoOC(''); // Limpiar estado si hay error
    }
  }

  // --- cargarCamposProducto, calcular_precio, formatearFecha (sin cambios) ---
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
    } //eslint-disable-next-line
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
      // Asegúrate que la API espera 'quantity', si espera 'cantidad' debes cambiarlo abajo
      const response = await fetch(`https://quimex.sistemataup.online/productos/calcular_precio/${id_producto}`,{
        method: "POST", headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},
        body: JSON.stringify({ producto_id: id_producto, quantity: cantidad_f }), // OJO: quantity o cantidad?
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


  // --- enviarSolicitudAPI (sin cambios lógicos) ---
  const enviarSolicitudAPI = async (solicitud: ISolicitudes) => { // Vuelvo a ISolicitudes porque nro_remito está de nuevo
     // const idLineaReal = 8; // <-- DEBES OBTENER ESTE VALOR DINÁMICAMENTE DE LA OC CARGADA

    try {
      problema = false;
      setErrorMensaje(''); // Limpiar mensaje antes de enviar

      // Construir payload basado en lo que espera la API de recepción
      // Es probable que solo necesite items_recibidos y quizás nro_remito_proveedor
      const payload = {
        items_recibidos: solicitud.items_recibidos.map(item => ({
            id_linea: item.id_linea, // Asegúrate que sea el ID de línea correcto
            cantidad_recibida: item.cantidad_recibida,
            costo_unitario_ars: item.costo_unitario_ars, // ¿Este costo es correcto aquí?
            notas_item: item.notas_item,
        })),
        // nro_remito_proveedor: solicitud.nro_remito_proveedor, // Si la API lo necesita
        // Otros campos que la API /recibir pudiera necesitar
      };

      console.log("Enviando payload a API:", JSON.stringify(payload, null, 2));
      //eslint-disable-next-line
      const user:any = localStorage.getItem("user")
      const response = await fetch(`https://quimex.sistemataup.online/ordenes_compra/${id}/recibir`, { // Ajustada URL, quitando duplicado /recibir
        method: 'PUT', // O POST según tu API
        headers: { 'Content-Type': 'application/json', 'X-User-Role' : 'ADMIN', 'X-User-Name' : user.nombre_usuario, "Authorization": `Bearer ${token}`},
        body: JSON.stringify(payload), // Enviar el payload preparado
      });

      const data = await response.json().catch(() => ({})); // Intenta parsear JSON siempre

      console.log("Respuesta API:", { status: response.status, ok: response.ok, body: data });

      if (!response.ok) {
        problema = true;
        // Intenta mostrar el mensaje de error específico de la API si existe
        setErrorMensaje(data?.mensaje || data?.detail || `Error ${response.status}: ${response.statusText}`);
        console.error("Error API:", data || response.statusText);
        return; // Salir si hay error
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

  // --- handleAgregar con la nueva validación ---
  const handleAgregar = async () => {
    setErrorMensaje(''); // Limpiar errores al inicio

    // --- NUEVA VALIDACIÓN: Comprobar estado de la OC ---
    // Asegúrate que 'Aprobada' sea el valor exacto (mayúsculas/minúsculas)
    if (estadoOC !== 'Aprobada') {
        setErrorMensaje('Solo se pueden registrar ingresos de solicitudes aprobadas.');
        console.warn(`Intento de registrar ingreso fallido. Estado OC: ${estadoOC}`);
        return; // Detener la ejecución si no está aprobada
    }
    // --- FIN NUEVA VALIDACIÓN ---


     // Validaciones existentes
     if (!cantidad_recepcionada || isNaN(parseFloat(cantidad_recepcionada)) || parseFloat(cantidad_recepcionada) < 0) {
         setErrorMensaje("La cantidad recepcionada es inválida.");
         return;
     }

     // --- IMPORTANTE: Obtener id_linea real ---
     // Necesitas obtener el id_linea del item de la OC que corresponde a este producto.
     // Esto debería venir de `cargarFormulario` y guardarse en algún sitio o
     // buscarse en los datos originales de la OC al momento de crear la solicitud.
     // Usar `parseInt(producto)` como id_linea es probablemente incorrecto.
     // Lo dejo como estaba en tu código, pero DEBES REVISARLO.
     const idLineaCorrecto = parseInt(producto); // <-- REVISAR ESTO URGENTEMENTE
     if (isNaN(idLineaCorrecto)) {
        setErrorMensaje("No se pudo determinar la línea del producto para la recepción.");
        return;
     }

    const nuevaSolicitud: ISolicitudes = {
      fecha, proveedor, producto, codigo, moneda, cantidad, tipo, importeTotal,
      estado_recepcion, // Este es el estado de la recepción que el usuario elige
      cantidad_recepcionada,
      items_recibidos: [
        {
         "id_linea": idLineaCorrecto, // <-- Usar el ID de línea correcto
         "cantidad_recibida": parseFloat(cantidad_recepcionada),
         "costo_unitario_ars": 12.34, // <---- ¿De dónde sale este costo? ¿Es fijo?
         "notas_item": "Caja abierta", // <---- ¿Hay un campo de notas en el form?
         },
      ],
      ajusteTC, importeCC, cantidadAcumulada, ajusteXTC, diferenciaCambio,
      importeAbonado, formaPago, chequePerteneceA,
      nro_remito_proveedor: "#", // ¿Este campo es necesario para la API de recepción?
    };

    // Añadir a la lista local (esto quizás no sea necesario si solo se procesa una recepción a la vez)
    setSolicitudes((prev) => [...prev, nuevaSolicitud]);

    // Enviar a la API
    await enviarSolicitudAPI(nuevaSolicitud);

    // Procesar resultado
    if(!problema) {
      console.log("Recepción procesada, limpiando campos y/o redirigiendo...");
      alert("Ingreso registrado correctamente."); // Añadir feedback al usuario
      setCantidadRecepcionada('');
      setImporteCC(''); setImporteAbonado(''); setFormaPago(''); setChequePerteneceA('');
      setEstadoRecepcion('Completa'); // Resetear estado de recepción seleccionable
      router.push('/compras');
    } else {
       // Si hubo problema, quitar de la lista local la solicitud que no se pudo enviar
       setSolicitudes(prev => prev.slice(0, -1));
       console.log("Hubo un problema al enviar a la API. El mensaje de error se muestra.");
       // No limpiar campos para que el usuario vea qué falló o corrija
    }
  };

  // handleComprar sin cambios
  // const handleComprar = () => {
  //   alert('Acción "Comprar" ejecutada (revisar propósito). Solicitudes locales reiniciadas.');
  //   setSolicitudes([]);
  // };

  // Clases CSS sin cambios
  const baseInputClass = "w-full px-3 py-2 rounded bg-white text-black border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const disabledInputClass = "disabled:bg-gray-200 disabled:text-gray-600 disabled:cursor-not-allowed disabled:border-gray-300";
  const labelClass = "block text-sm font-medium mb-1 text-white";

  return (
    <div className="min-h-screen flex flex-col items-center bg-[#20119d] px-4 py-10">
      <h1 className="text-white text-3xl font-bold mb-8 text-center">Solicitud de Ingreso (OC: {id})</h1>
      {/* Mostrar estado actual de la OC si se cargó */}
      {estadoOC && (
        <p className="text-white text-lg mb-4">Estado Orden de Compra: <span className={`font-semibold ${estadoOC === 'Aprobada' ? 'text-green-300' : 'text-yellow-300'}`}>{estadoOC}</span></p>
      )}
      {errorMensaje && (
         <div className="w-full max-w-4xl mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">{errorMensaje}</span>
         </div>
      )}
      <div className="bg-white/10 backdrop-blur-sm p-6 md:p-8 rounded-lg shadow-xl w-full max-w-4xl text-white">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">

          {/* --- Filas de campos (sin cambios) --- */}
          {/* --- Fila 1 --- */}
          <div>
            <label htmlFor="fecha" className={labelClass}>Fecha OC</label> {/* Cambiado texto */}
            <input id="fecha" required type="date" value={fecha} readOnly className={`${baseInputClass} ${disabledInputClass}`} /> {/* Hacerla readonly */}
          </div>
          <div>
            <label htmlFor="proveedor" className={labelClass}>Proveedor</label>
            <input id="proveedor" value={proveedor} className={`${baseInputClass} ${disabledInputClass}`} disabled />
          </div>
          <div>
            <label htmlFor="producto" className={labelClass}>Producto</label> {/* Quitado * */}
            <select id="producto" name="producto" required value={producto} className={`${baseInputClass} ${disabledInputClass}`} disabled >
                <option value={0} disabled>Seleccionar producto</option>
                {//eslint-disable-next-line
                productos.map((producto: any, index: number) => ( <option value={producto.id} key={index}> {producto.nombre} </option> ))}
            </select>
          </div>

          {/* --- Fila 2 --- */}
          <div>
            <label htmlFor="codigo" className={labelClass}>Código</label>
            <input id="codigo" value={codigo} className={`${baseInputClass} ${disabledInputClass}`} disabled />
          </div>
          <div>
            <label htmlFor="moneda" className={labelClass}>Moneda OC</label> {/* Cambiado texto, quitado * */}
            <input id="moneda" required value={moneda} onChange={(e) => setMoneda(e.target.value)}  className={`${baseInputClass} ${disabledInputClass}`} /> {/* Hacerla readonly? */}
          </div>
          <div>
            <label htmlFor="cantidad" className={labelClass}>Cant. Solicitada</label> {/* Cambiado texto, quitado * */}
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
            <label htmlFor="importeTotal" className={labelClass}>Importe Total OC</label> {/* Cambiado texto */}
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
            <label htmlFor="cantidad_recepcionada" className={labelClass}>Cantidad Recepcionada *</label> {/* Añadido * */}
            <input id="cantidad_recepcionada" required type="number" value={cantidad_recepcionada} onChange={(e) => setCantidadRecepcionada(e.target.value)} className={`${baseInputClass}`} />
          </div>
           <div>
            <label htmlFor="importeCC" className={labelClass}>Importe a CC</label>
            <input id="importeCC" value={importeCC} onChange={(e) => setImporteCC(e.target.value)} className={`${baseInputClass}`} />
          </div>
          <div>
            <label htmlFor="importeAbonado" className={labelClass}>Importe Abonado</label>
            <input id="importeAbonado" value={importeAbonado} onChange={(e) => setImporteAbonado(e.target.value)} className={`${baseInputClass}`} />
          </div>


          {/* --- Fila 5 (Campos financieros) --- */}
          <div>
            <label htmlFor="formaPago" className={labelClass}>Forma de Pago</label>
            <input id="formaPago" value={formaPago} onChange={(e) => setFormaPago(e.target.value)} className={`${baseInputClass}`} />
          </div>
          <div>
            <label htmlFor="chequePerteneceA" className={labelClass}>Cheque Perteneciente a</label>
            <input id="chequePerteneceA" value={chequePerteneceA} onChange={(e) => setChequePerteneceA(e.target.value)} className={`${baseInputClass}`} />
          </div>
          <div></div> {/* Espacio libre */}

        </div>

        {/* Botones */}
        <div className="flex gap-4 justify-center mt-8">
          <button
            onClick={handleAgregar}
            // Deshabilitar botón si no está aprobada o si faltan datos clave
            disabled={estadoOC !== 'Aprobada' || !cantidad_recepcionada}
            className="bg-green-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-600 transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed" // Estilo mejorado y para disabled
          >
             Registrar ingreso
          </button>
          {/* Eliminado botón "Comprar" que no tenía sentido aquí */}
           <button
             onClick={() => router.back()} // Botón para volver
             type="button"
             className="bg-gray-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-600 transition duration-150 ease-in-out"
           >
             Volver
           </button>
        </div>
      </div>

      {/* Tabla de Solicitudes (sin cambios lógicos) */}
      {solicitudes.length > 0 && (
        <div className="mt-10 w-full max-w-5xl bg-white p-6 rounded-lg shadow-lg text-black">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Items Agregados en esta Sesión:</h2> {/* Texto ajustado */}
          <div className="max-h-80 overflow-y-auto text-sm space-y-3">
            {solicitudes.map((s, idx) => (
              <div key={idx} className="border-b border-gray-200 pb-3 last:border-b-0">
                 {/* Puedes mostrar aquí un resumen de lo que se intentó agregar */}
                 <p><strong>Producto (Intento {idx+1}):</strong> {s.producto} | <strong>Cantidad Recibida:</strong> {s.cantidad_recepcionada}</p>
                 {/* <p><strong>Fecha:</strong> {formatearFecha(s.fecha)} | <strong>Proveedor:</strong> {s.proveedor} | <strong>Producto:</strong> {s.producto} ({s.codigo})</p> */}
                 {/* <p><strong>Cantidad Solicitada:</strong> {s.cantidad} {s.tipo} | <strong>Moneda:</strong> {s.moneda} | <strong>Importe Total:</strong> {s.importeTotal}</p> */}
                 <p><strong>Estado Recepción Seleccionado:</strong> {s.estado_recepcion}</p>
                 {/* <p><strong>Importe a CC:</strong> {s.importeCC} | <strong>Importe Abonado:</strong> {s.importeAbonado}</p> */}
                 {/* <p><strong>Forma Pago:</strong> {s.formaPago} | <strong>Cheque de:</strong> {s.chequePerteneceA}</p> */}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}