'use client';

import { useProductsContext } from "@/context/ProductsContext";
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// --- Interface ---
interface ISolicitudes {
  fecha: string,
  proveedor: string,
  producto: string, // ID del producto/línea de la OC
  codigo: string,   // Código del producto
  moneda: string,   // Moneda de la OC
  cantidad: string, // Cantidad solicitada en la OC
  tipo: string,     // Unidad de medida
  importeTotal: string, // Total de la OC
  estado_recepcion: string, // Estado de esta recepción
  cantidad_recepcionada: string, // Cantidad que se está recepcionando ahora
  items_recibidos: [ // Detalles de los items que se están recepcionando
    {
     "id_linea": string | number, // ID de la línea de la OC original
     "cantidad_recibida": number,
     "costo_unitario_ars": number, // Costo al momento de la recepción
     "notas_item": string,
     "producto_codigo": string | number // Código del producto
     },
  ]
  ajusteTC: string, // 'true' o 'false'
  // Campos que parecen no usarse activamente para el envío de recepción:
  cantidadAcumulada: string, 
  ajusteXTC: string,
  diferenciaCambio: string,
  // ---
  importeAbonado: string,    // *Nuevo* importe que el usuario abona en esta recepción
  formaPago: string,         // Forma de pago para este nuevo abono
  chequePerteneceA: string,  // Datos del cheque si aplica
  nro_remito_proveedor : string,
}

//eslint-disable-next-line
export default function SolicitudIngresoPage({ id }: any) {
  // --- Estados ---
  const [fecha, setFecha] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [producto, setProducto] = useState('0'); 
  const [codigo, setCodigo] = useState('');     
  // const [moneda, setMoneda] = useState(''); // Si no es editable, obtener de la OC
  const [cantidad, setCantidad] = useState(''); 
  const [tipo, setTipo] = useState('Litro');    
  const [importeTotal, setImporteTotal] = useState(''); 
  const [estado_recepcion, setEstadoRecepcion] = useState('Completa'); 
  const [cantidad_recepcionada, setCantidadRecepcionada] = useState(''); 
  
  const [nro_remito_proveedor, setNroRemitoProveedor] = useState('');
  const [ajusteTC, setAjusteTC] = useState('false'); 
  
  const [importeAbonado, setImporteAbonado] = useState(''); 
  const [formaPago, setFormaPago] = useState('Efectivo'); // 1. VALOR INICIAL PARA EL SELECTOR
  const [chequePerteneceA, setChequePerteneceA] = useState('');
  
  const [solicitudes] = useState<ISolicitudes[]>([]);
  const { productos: productosDelContexto } = useProductsContext(); // Renombrar para evitar conflicto
  const [errorMensaje, setErrorMensaje] = useState('');
  const [estadoOC, setEstadoOC] = useState(''); 
  
  const [montoYaAbonadoOC, setMontoYaAbonadoOC] = useState<number>(0);
  const [idLineaOCOriginal, setIdLineaOCOriginal] = useState<string | number>(''); // Para guardar el ID de línea de la OC


  let problema = false; 
  const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
  const router = useRouter();

  useEffect(() => {
    if (id && token) { 
      cargarFormulario();
    } else if (id && !token) {
        setErrorMensaje("No autenticado. No se pueden cargar los datos de la orden.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]); 

  async function cargarFormulario() {
    try {
      setErrorMensaje('');
      const response = await fetch(`https://quimex.sistemataup.online/ordenes_compra/obtener/${id}`,{headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }});
      if (!response.ok) throw new Error(`Error al traer la orden (${response.status}): ${response.statusText}`);
      const data = await response.json();
      if (!data || !data.items || data.items.length === 0) {
        console.error("Respuesta de API incompleta o sin items:", data);
        setErrorMensaje("No se encontraron items en la orden de compra o la respuesta es inválida.");
        return;
      }
      
      console.log("Datos OC cargados:", data);
      const itemPrincipal = data.items[0]; 

      setMontoYaAbonadoOC(parseFloat(data.importe_abonado) || 0); // Asegúrate que 'data.importe_abonado_total_oc' sea el campo correcto
                                                                     // que indica el acumulado ya pagado de la OC.
      setFecha(formatearFecha(data.fecha_creacion));
      setProveedor(data.proveedor_nombre || 'N/A');
      setProducto(itemPrincipal.producto_id?.toString() ?? '0'); // ID del producto para mostrar
      setCodigo(itemPrincipal.producto_codigo || ''); // Código del producto
      setCantidad(itemPrincipal.cantidad_solicitada?.toString() ?? '');
      // setMoneda(data.moneda_oc || ''); // Si hay una moneda general para la OC
      setImporteTotal(data.items[0].importe_linea_estimado?.toString() ?? '0'); // Total GENERAL de la OC
      setEstadoOC(data.estado || '');
      setIdLineaOCOriginal(itemPrincipal.id_linea_oc || itemPrincipal.id_linea || ''); // ID DE LA LÍNEA DE LA OC

      // Resetear campos de la recepción actual
      setNroRemitoProveedor(data.nro_remito_proveedor?.toString() ?? '0');
      setCantidadRecepcionada(itemPrincipal.cantidad_recibida?.toString() ?? '0');
      setAjusteTC(data.ajuste_tc === true ? 'true' : 'false'); // Si la OC tiene un default
      setImporteAbonado(''); 
      setFormaPago(data.forma_pago || 'Efectivo'); // Si la OC tiene un default
      setChequePerteneceA('');
      
      console.log("Estado OC:", data.estado, "Monto ya abonado OC:", parseFloat(data.importe_abonado_total_oc) || 0, "Total OC:", data.importe_total_estimado);

      if (itemPrincipal.producto_id) {
          await cargarCamposProducto(itemPrincipal.producto_id);
      }
    }
    // eslint-disable-next-line
    catch (err: any) {
      console.error("Error detallado al cargar formulario:", err);
      setErrorMensaje(`Error cargando datos: ${err.message}`);
      setEstadoOC('');
      setMontoYaAbonadoOC(0);
    }
  }

  async function cargarCamposProducto(id_producto:number){
    try{
      const response = await fetch(`https://quimex.sistemataup.online/productos/obtener/${id_producto}`,{headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }});
      if (!response.ok) throw new Error(`Error al traer producto ${id_producto}: ${response.statusText}`);
      const dataProd = await response.json();
      // setProducto(dataProd.id?.toString() ?? '0'); // El ID del producto ya se seteó con itemPrincipal.producto_id
      // setCodigo(dataProd.codigo?.toString() ?? id_producto.toString()); // El código ya se seteó
      const unidad = dataProd.unidad_venta;
      if (unidad == 'LT') setTipo('Litro');
      else if (unidad == 'KG') setTipo('Kilo');
      else setTipo('Unidad');
    }
    // eslint-disable-next-line
     catch (err: any) {
      console.error("Error cargando campos producto:", err);
      setErrorMensaje(`Error cargando detalles del producto: ${err.message}`);
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

  const enviarSolicitudAPI = async (solicitud: ISolicitudes) => {
    try {
      problema = false;
      setErrorMensaje('');

      const nuevoAbonoFloat = parseFloat(solicitud.importeAbonado) || 0;
      const totalAbonadoParaEnviar = montoYaAbonadoOC + nuevoAbonoFloat;

      const payload = {
        items_recibidos: solicitud.items_recibidos.map(item => ({
            id_linea: Number(item.id_linea), // Enviar como número
            cantidad_recibida: item.cantidad_recibida, // Ya es número
            producto_codigo: String(item.producto_codigo), // Enviar como string
            // costo_unitario_ars: item.costo_unitario_ars, // La API lo calculará o se debe ingresar
            // notas_item: item.notas_item,
        })),
        importe_abonado: totalAbonadoParaEnviar,
        estado_recepcion: solicitud.estado_recepcion,
        nro_remito_proveedor: solicitud.nro_remito_proveedor,
        ajuste_tc: solicitud.ajusteTC === 'true',
        forma_pago: solicitud.formaPago,
        cheque_perteneciente_a: solicitud.chequePerteneceA,
      };

      console.log("Enviando payload a API de recepción:", JSON.stringify(payload, null, 2));
      // eslint-disable-next-line
      const userItem:any = sessionStorage.getItem("user"); 
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
            'X-User-Role' : user.role || 'USER', 
            'X-User-Name' : user.usuario || user.name, 
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
    // eslint-disable-next-line
    catch (error: any) {
      console.error('Error al enviar la solicitud (recepción):', error);
      problema = true;
      setErrorMensaje(`Error de red o al procesar la solicitud: ${error.message}`);
    }
  };

  const handleAgregar = async () => {
    setErrorMensaje('');

    if (estadoOC !== 'Aprobado' && estadoOC !== 'Con Deuda' && estadoOC !== 'Pendiente') {
        setErrorMensaje(`No se puede registrar ingreso para una OC en estado: ${estadoOC}.`);
        return;
    }
    const cantRecepcionadaNum = parseFloat(cantidad_recepcionada);
    if (!cantidad_recepcionada || isNaN(cantRecepcionadaNum) || cantRecepcionadaNum <= 0) {
        setErrorMensaje("La cantidad recepcionada debe ser un número mayor a cero.");
        return;
    }
    if (!nro_remito_proveedor.trim()) {
        setErrorMensaje("El número de remito del proveedor es obligatorio.");
        return;
    }
    
    const nuevoAbonoNum = parseFloat(importeAbonado) || 0;
    if (nuevoAbonoNum < 0) {
        setErrorMensaje("El importe a abonar no puede ser negativo.");
        return;
    }

    // ***** 2. VALIDACIÓN DEL MONTO A ABONAR *****
    const totalDeLaOC = parseFloat(importeTotal) || 0;
    const maximoAbonoPermitido = totalDeLaOC - montoYaAbonadoOC;

    if (nuevoAbonoNum > maximoAbonoPermitido + 0.001) { // Pequeña tolerancia para errores de floating point
        setErrorMensaje(`El importe a abonar ($${nuevoAbonoNum.toFixed(2)}) no puede superar la deuda pendiente ($${maximoAbonoPermitido.toFixed(2)}).`);
        return;
    }
    // ***** FIN VALIDACIÓN *****

    if (!idLineaOCOriginal) {
        setErrorMensaje("Error: No se pudo identificar la línea de la orden de compra. Recargue la página.");
        return;
    }


    const nuevaSolicitud: ISolicitudes = {
      fecha, proveedor, 
      producto: producto, // ID del producto principal de la OC
      codigo: codigo,     // Código del producto principal
      moneda: '',         // Moneda de la OC (si la tienes en estado)
      cantidad: cantidad, // Cantidad solicitada en la OC
      tipo, 
      importeTotal,       // Total de la OC
      estado_recepcion,
      cantidad_recepcionada, // Lo que se está recibiendo ahora
      items_recibidos: [
        {
         "id_linea": idLineaOCOriginal, // Usar el ID de línea guardado
         "cantidad_recibida": cantRecepcionadaNum,
         "costo_unitario_ars": 0, // La API debe calcular esto o debe ser ingresado
         "notas_item": "",     
         "producto_codigo": codigo, // Código del producto que se está recibiendo
         },
      ],
      ajusteTC, 
      cantidadAcumulada: '', 
      ajusteXTC: '', 
      diferenciaCambio: '', 
      importeAbonado: importeAbonado, // El *nuevo* importe que el usuario está abonando
      formaPago, 
      chequePerteneceA,
      nro_remito_proveedor: nro_remito_proveedor.trim(),
    };

    await enviarSolicitudAPI(nuevaSolicitud);

    if(!problema) {
      console.log("Recepción procesada.");
      alert("Ingreso registrado correctamente.");
      setCantidadRecepcionada('');
      setImporteAbonado(''); 
      setFormaPago('Efectivo'); // Resetear a valor por defecto
      setChequePerteneceA('');
      setEstadoRecepcion('Completa');
      setNroRemitoProveedor('');
      if (id) {
        cargarFormulario(); 
      }
      // router.push('/compras');
    } else {
       console.log("Hubo un problema al enviar a la API de recepción.");
    }
  };

  const baseInputClass = "w-full px-3 py-2 rounded bg-white text-black border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const disabledInputClass = "disabled:bg-gray-200 disabled:text-gray-600 disabled:cursor-not-allowed disabled:border-gray-300";
  const labelClass = "block text-sm font-medium mb-1 text-white";

  let placeholderParaImporteAbonado = "Ej: 100.00"; 
  if (estadoOC === "Con Deuda") { 
    const totalDeLaOC = parseFloat(importeTotal) || 0;
    const yaAbonado = montoYaAbonadoOC;
    const deudaActual = totalDeLaOC - yaAbonado;
    if (deudaActual > 0) {
      placeholderParaImporteAbonado = `Deuda pendiente: $${deudaActual.toFixed(2)}`;
    } else {
      placeholderParaImporteAbonado = yaAbonado >= totalDeLaOC ? "Pagada completamente" : "Revisar abonos";
    }
  }

  const opcionesFormaPago = ["Cheque", "Efectivo", "Transferencia", "Cuenta Corriente"];

  return (
    <div className="min-h-screen flex flex-col items-center bg-[#20119d] px-4 py-10">
      <h1 className="text-white text-3xl font-bold mb-8 text-center">Solicitud de Ingreso (OC: {id})</h1>
      {estadoOC && (
        <p className="text-white text-lg mb-4">Estado Orden de Compra: <span className={`font-semibold ${estadoOC === 'Aprobado' ? 'text-green-300' : estadoOC === 'Con Deuda' ? 'text-orange-300' : 'text-yellow-300'}`}>{estadoOC}</span></p>
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
            <label htmlFor="producto" className={labelClass}>Producto (Principal)</label>
            <select id="producto" name="producto" required value={producto} className={`${baseInputClass} ${disabledInputClass}`} disabled >
                <option value="0" disabled>{codigo ? `${productosDelContexto.find(p=>p.id.toString() === producto)?.nombre || 'Producto no en contexto'} (${codigo})` : 'Cargando producto...'}</option>
            </select>
          </div>

          {/* --- Fila 2 --- */}
          <div>
            <label htmlFor="codigo" className={labelClass}>Código Prod.</label>
            <input id="codigo" value={codigo} className={`${baseInputClass} ${disabledInputClass}`} disabled />
          </div>
          <div>
            <label htmlFor="ajusteTC" className={labelClass}>Ajuste x TC</label>
            <select
              id="ajusteTC"
              value={ajusteTC} 
              className={`${baseInputClass}`} 
              onChange={(e) => setAjusteTC(e.target.value)}
            >
              <option value="true">Sí</option>
              <option value="false">No</option>
            </select>
          </div>
          <div>
            <label htmlFor="cantidad" className={labelClass}>Cant. Solicitada</label>
            <input id="cantidad" required type="number" value={cantidad} className={`${baseInputClass} ${disabledInputClass}`} disabled />
          </div>

          {/* --- Fila 3 --- */}
          <div>
            <label htmlFor="tipo" className={labelClass}>Unidad Medida</label>
            <input id="tipo" value={tipo} className={`${baseInputClass} ${disabledInputClass}`} disabled /> 
          </div>
          <div>
            <label htmlFor="importeTotal" className={labelClass}>Importe Total OC</label>
            <input id="importeTotal" type="number" value={importeTotal} className={`${baseInputClass} ${disabledInputClass}`} disabled />
          </div>
           <div>
            <label htmlFor="estado_recepcion" className={labelClass}>Estado Recepción *</label>
            <select id="estado_recepcion" value={estado_recepcion} onChange={(e) => setEstadoRecepcion(e.target.value)} className={`${baseInputClass}`} required >
              <option value="Completa">Completa</option> <option value="Parcial">Parcial</option> <option value="Extra">Extra</option> <option value="Con Daños">Con Daños</option>
            </select>
          </div>

          {/* --- Fila 4 (Campos de recepción) --- */}
          <div>
            <label htmlFor="cantidad_recepcionada" className={labelClass}>Cantidad Recepcionada *</label>
            <input id="cantidad_recepcionada" required type="number" min="0" value={cantidad_recepcionada} onChange={(e) => setCantidadRecepcionada(e.target.value)} className={`${baseInputClass}`} />
          </div>
          <div>
            <label htmlFor="nro_remito_proveedor" className={labelClass}>N° Remito Proveedor *</label>
            <input 
              id="nro_remito_proveedor" 
              type="text" 
              value={nro_remito_proveedor} 
              onChange={(e) => setNroRemitoProveedor(e.target.value)} 
              className={`${baseInputClass}`}
              placeholder="Ej: R-0001-0012345"
              required
            />
          </div>
          <div>
            <label htmlFor="importeAbonado" className={labelClass}>Importe a Abonar (Nuevo)</label>
            <input 
              id="importeAbonado" 
              type="number"
              step="0.01"
              min="0"
              value={importeAbonado} 
              onChange={(e) => setImporteAbonado(e.target.value)} 
              className={`${baseInputClass}`}
              placeholder={placeholderParaImporteAbonado} 
            />
             {estadoOC === "Con Deuda" && montoYaAbonadoOC > 0 && (
                <p className="text-xs text-gray-300 mt-1">
                Ya abonado: ${montoYaAbonadoOC.toFixed(2)}
                </p>
            )}
          </div>
          
          {/* --- Fila 5 (Campos financieros) --- */}
          <div>
            {/* ***** 1. CAMPO FORMA DE PAGO COMO SELECTOR ***** */}
            <label htmlFor="formaPago" className={labelClass}>Forma de Pago (Nuevo Abono)</label>
            <select
                id="formaPago"
                name="formaPago"
                value={formaPago}
                onChange={(e) => setFormaPago(e.target.value)}
                className={`${baseInputClass}`}
            >
                <option value="" disabled>Seleccione forma de pago</option>
                {opcionesFormaPago.map(opcion => (
                    <option key={opcion} value={opcion}>{opcion}</option>
                ))}
            </select>
          </div>
          <div>
            <label htmlFor="chequePerteneceA" className={labelClass}>Cheque Perteneciente a</label>
            <input id="chequePerteneceA" type="text" value={chequePerteneceA} onChange={(e) => setChequePerteneceA(e.target.value)} className={`${baseInputClass}`} placeholder="Ej: Banco XYZ"/>
          </div>
          <div></div> 
        </div>

        {/* Botones */}
        <div className="flex gap-4 justify-center mt-8">
          <button
            onClick={handleAgregar}
            disabled={(estadoOC !== 'Aprobado' && estadoOC !== 'Con Deuda' && estadoOC !== 'Pendiente') || !cantidad_recepcionada || !nro_remito_proveedor.trim()}
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
                 {parseFloat(s.importeAbonado) > 0 && <p><strong>Nuevo Abono:</strong> ${parseFloat(s.importeAbonado).toFixed(2)} ({s.formaPago})</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}