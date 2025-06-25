'use client';

import { useProductsContext } from "@/context/ProductsContext";
import { useProveedoresContext } from "@/context/ProveedoresContext";
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import jsPDF from 'jspdf';

// La interface se mantiene igual para manejar el estado del formulario
/*interface ISolicitudes {
  fecha: string;
  proveedor: string;
  proveedor_id: string;
  producto: string;
  codigo: string;
  moneda: string;
  cantidad: string;
  precioUnitario: string;
  cuenta: string;
  iibb: string;
  tipo: string;
  importeTotal: string;
  estado_recepcion: string;
  cantidad_recepcionada: string;
  items_recibidos: [
    {
     "id_linea": string | number;
     "cantidad_recibida": number;
     "costo_unitario_ars": number;
     "notas_item": string;
     "producto_codigo": string | number;
     },
  ];
  ajusteTC: string;
  cantidadAcumulada: string;
  ajusteXTC: string;
  diferenciaCambio: string;
  importeAbonado: string;
  formaPago: string;
  chequePerteneceA: string;
  nro_remito_proveedor : string;
  tipo_caja: string;
}*/
// eslint-disable-next-line
export default function SolicitudIngresoPage({ id }: any) {
  // Todos tus estados se mantienen igual
  const [fecha, setFecha] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [proveedorId, setProveedorId] = useState('');
  const [producto, setProducto] = useState('0');
  const [codigo, setCodigo] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [precioUnitario, setPrecioUnitario] = useState('');
  const [cuenta, setCuenta] = useState('');
  const [iibb, setIibb] = useState('');
  const [tipo, setTipo] = useState('Litro');
  const [importeTotal, setImporteTotal] = useState('');
  const [estado_recepcion, setEstadoRecepcion] = useState('Completa');
  const [cantidad_recepcionada, setCantidadRecepcionada] = useState('');
  const [nro_remito_proveedor, setNroRemitoProveedor] = useState('');
  const [ajusteTC, setAjusteTC] = useState('false');
  const [importeAbonado, setImporteAbonado] = useState('');
  const [formaPago, setFormaPago] = useState('Efectivo');
  const [chequePerteneceA, setChequePerteneceA] = useState('');
  const [tipoCaja, setTipoCaja] = useState('caja diaria');
  
  const { productos: productosDelContexto } = useProductsContext();
  const { proveedores, loading: proveedoresLoading } = useProveedoresContext();
  const [errorMensaje, setErrorMensaje] = useState('');
  const [estadoOC, setEstadoOC] = useState('');
  const [montoYaAbonadoOC, setMontoYaAbonadoOC] = useState<number>(0);
  const [idLineaOCOriginal, setIdLineaOCOriginal] = useState<string | number>('');

  let problema = false;
  const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
  const router = useRouter();

  // El resto de tus funciones (useEffect, cargarFormulario, etc.) se mantienen EXACTAMENTE IGUAL.
  useEffect(() => {
    if (id && token) {
      cargarFormulario();
    }
  }, [id, token]);

  useEffect(() => {
    const cantNum = parseFloat(cantidad);
    const precioNum = parseFloat(precioUnitario);
    if (!isNaN(cantNum) && !isNaN(precioNum) && cantNum > 0 && precioNum >= 0) {
      const total = cantNum * precioNum;
      setImporteTotal(total.toFixed(2));
    }
  }, [cantidad, precioUnitario]);

  async function cargarFormulario() {
    try {
      setErrorMensaje('');
      const response = await fetch(`https://quimex.sistemataup.online/ordenes_compra/obtener/${id}`,{headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }});
      if (!response.ok) throw new Error(`Error al traer la orden`);
      const data = await response.json();
      if (!data?.items?.length) throw new Error("No se encontraron items en la OC.");
      
      const itemPrincipal = data.items[0];

      setMontoYaAbonadoOC(parseFloat(data.importe_abonado) || 0);
      setFecha(formatearFecha(data.fecha_creacion));
      setProveedor(data.proveedor_nombre || 'N/A');
      setProveedorId(data.proveedor_id?.toString() ?? '');
      setProducto(itemPrincipal.producto_id?.toString() ?? '0');
      setCodigo(itemPrincipal.producto_codigo || '');
      setCantidad(itemPrincipal.cantidad_solicitada?.toString() ?? '');
      setPrecioUnitario(itemPrincipal.precio_unitario_estimado?.toString() ?? '0');
      setCuenta(data.cuenta?.toString() ?? '');
      setIibb(data.iibb?.toString() ?? '');
      setImporteTotal(itemPrincipal.importe_linea_estimado?.toString() ?? '0');
      setEstadoOC(data.estado || '');
      setIdLineaOCOriginal(itemPrincipal.id_linea_oc || '');
      setAjusteTC(data.ajuste_tc === true ? 'true' : 'false');
      setNroRemitoProveedor(data.nro_remito_proveedor || '');
      
      setEstadoRecepcion('Completa');
      setCantidadRecepcionada('');
      setImporteAbonado('');
      setFormaPago('Efectivo');
      setChequePerteneceA('');
      
      if (itemPrincipal.producto_id) {
        await cargarCamposProducto(itemPrincipal.producto_id);
      }
      // eslint-disable-next-line
    } catch (err: any) {
      setErrorMensaje(err.message);
    }
  }

  async function cargarCamposProducto(id_producto:number){
    try {
      const response = await fetch(`https://quimex.sistemataup.online/productos/obtener/${id_producto}`,{headers: { "Authorization": `Bearer ${token}` }});
      if (!response.ok) return;
      const dataProd = await response.json();
      const unidad = dataProd.unidad_venta;
      if (unidad === 'LT') setTipo('Litro');
      else if (unidad === 'KG') setTipo('Kilo');
      else setTipo('Unidad');
    } catch (err) {
      console.error("Error cargando tipo de producto:", err);
    }
  }

  const formatearFecha = (fechaOriginal: string | Date | undefined): string => {
    if (!fechaOriginal) return '';
    try {
        const fecha = new Date(fechaOriginal);
        return fecha.toISOString().split('T')[0];
    } catch {
        return '';
    }
  };

  // =========================================================================
  // FUNCIÓN CORREGIDA
  // =========================================================================
  // eslint-disable-next-line
  const enviarSolicitudAPI = async (solicitud: any) => {
    try {
      problema = false;
      setErrorMensaje('');
      const nuevoAbonoFloat = parseFloat(solicitud.importeAbonado) || 0;
      const totalAbonadoParaEnviar = montoYaAbonadoOC + nuevoAbonoFloat;

      // Construimos el payload EXACTAMENTE como la API lo espera
      const payload = {
        // Los campos de costo/cantidad generales se eliminan del nivel superior
        
        // El array de items ahora incluye el costo unitario
        // eslint-disable-next-line
        items_recibidos: solicitud.items_recibidos.map((item: any) => ({
            id_linea: Number(item.id_linea),
            cantidad_recibida: item.cantidad_recibida,
            producto_codigo: String(item.producto_codigo),
            costo_unitario_ars: parseFloat(solicitud.precioUnitario) || 0 // <-- ¡AQUÍ ESTÁ LA CORRECCIÓN CLAVE!
        })),

        // El resto de los campos que la API sí espera en el nivel superior
        nro_remito_proveedor: solicitud.nro_remito_proveedor,
        estado_recepcion: solicitud.estado_recepcion,
        importe_abonado: totalAbonadoParaEnviar,
        ajuste_tc: solicitud.ajusteTC === 'true',
        forma_pago: solicitud.formaPago,
        cheque_perteneciente_a: solicitud.chequePerteneceA,
        tipo_caja: solicitud.tipo_caja,
        // Los campos 'cuenta' e 'iibb' no son leídos por este endpoint, así que no es necesario enviarlos.
      };
      // eslint-disable-next-line
      const userItem:any = sessionStorage.getItem("user");
      const user = userItem ? JSON.parse(userItem) : null;
      if (!user || !token) throw new Error("Error de autenticación.");
      
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
      if (!response.ok) throw new Error(data?.mensaje || `Error ${response.status}`);
    }
    // eslint-disable-next-line
    catch (error: any) {
      problema = true;
      setErrorMensaje(error.message);
    }
  };

  const handleAgregar = async () => {
    // Esta función se mantiene igual, ya que `nuevaSolicitud` contiene todos los datos del form
    // y la corrección se hace dentro de `enviarSolicitudAPI`.
    setErrorMensaje('');
    
    const nuevoAbonoNum = parseFloat(importeAbonado) || 0;
    if (nuevoAbonoNum < 0) {
        setErrorMensaje("El importe a abonar no puede ser negativo.");
        return;
    }
    const totalDeLaOC = parseFloat(importeTotal) || 0;
    const maximoAbonoPermitido = totalDeLaOC - montoYaAbonadoOC;
    if (nuevoAbonoNum > maximoAbonoPermitido + 0.001) {
        setErrorMensaje(`El importe a abonar ($${nuevoAbonoNum.toFixed(2)}) no puede superar la deuda pendiente ($${maximoAbonoPermitido.toFixed(2)}).`);
        return;
    }
    /*if (!idLineaOCOriginal) {
        setErrorMensaje("Error: No se pudo identificar la línea de la orden de compra.");
        return;
    }*/

    const nuevaSolicitud = {
      fecha, proveedor, proveedor_id: proveedorId, producto, codigo, cantidad, precioUnitario, cuenta, iibb, tipo, importeTotal,
      estado_recepcion, cantidad_recepcionada,
      items_recibidos: [{
         "id_linea": idLineaOCOriginal, "cantidad_recibida": parseFloat(cantidad_recepcionada),
         "costo_unitario_ars": 0, "notas_item": "", "producto_codigo": codigo,
      }],
      ajusteTC, importeAbonado, formaPago, chequePerteneceA,
      nro_remito_proveedor: nro_remito_proveedor.trim(), tipo_caja: tipoCaja,
    };

    await enviarSolicitudAPI(nuevaSolicitud);
    if(!problema) {
      alert("Ingreso registrado correctamente.");
      router.back();
    }
  };

  // La función del PDF y el JSX se mantienen igual que en la respuesta anterior.
  const handleDescargarPDF = () => {
    const doc = new jsPDF();
    const productoInfo = productosDelContexto.find(p => p.id.toString() === producto);
    const proveedorInfo = proveedores.find(p => p.id.toString() === proveedorId);
    let y = 20;

    doc.setFontSize(22);
    doc.text(`Orden de Compra #${id}`, 105, y, { align: 'center' });
    y += 15;
    doc.setLineWidth(0.5); doc.line(20, y, 190, y); y += 10;
    doc.setFontSize(12);

    const agregarCampo = (label: string, value: string) => {
        doc.text(label, 20, y); doc.text(value || 'N/A', 90, y); y += 8;
    };
    
    agregarCampo('Fecha OC:', fecha);
    agregarCampo('Proveedor:', proveedorInfo?.nombre || 'N/A');
    agregarCampo('Estado OC:', estadoOC);
    agregarCampo('Cuenta Contable:', cuenta);
    agregarCampo('Percepción IIBB (%):', iibb);
    y += 5; doc.line(20, y, 190, y); y += 10;
    
    doc.setFontSize(14); doc.text('Detalles del Pedido:', 20, y); y += 8; doc.setFontSize(12);

    agregarCampo('Producto:', `${productoInfo?.nombre || 'N/A'} (${codigo})`);
    agregarCampo('Cantidad Solicitada:', `${cantidad} ${tipo}`);
    agregarCampo('Precio Unitario:', `$${parseFloat(precioUnitario || '0').toFixed(2)}`);
    agregarCampo('Importe Total OC:', `$${parseFloat(importeTotal || '0').toFixed(2)}`);
    y += 5; doc.line(20, y, 190, y); y += 10;

    doc.setFontSize(14); doc.text('Información de Recepción:', 20, y); y += 8; doc.setFontSize(12);
    agregarCampo('Estado Recepción:', estado_recepcion);
    agregarCampo('Cantidad Recepcionada:', cantidad_recepcionada);
    agregarCampo('N° Remito Proveedor:', nro_remito_proveedor);

    if(parseFloat(importeAbonado) > 0) {
      y += 5; doc.line(20, y, 190, y); y += 10;
      doc.setFontSize(14); doc.text('Detalles del Pago:', 20, y); y += 8; doc.setFontSize(12);
      agregarCampo('Importe Abonado (Nuevo):', `$${parseFloat(importeAbonado).toFixed(2)}`);
      agregarCampo('Forma de Pago:', formaPago);
      if(formaPago === 'Cheque') {
        agregarCampo('Cheque Perteneciente a:', chequePerteneceA);
      }
      agregarCampo('Tipo de Caja:', tipoCaja);
    }
    
    doc.save(`Orden_de_Compra_${id}.pdf`);
  };

  const baseInputClass = "w-full px-3 py-2 rounded bg-white text-black border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const disabledInputClass = "disabled:bg-gray-200 disabled:text-gray-600 disabled:cursor-not-allowed";
  const labelClass = "block text-sm font-medium mb-1 text-white";
  const opcionesFormaPago = ["Cheque", "Efectivo", "Transferencia", "Cuenta Corriente"];
  
  let placeholderParaImporteAbonado = "Ej: 100.00";
  if (estadoOC === "Con Deuda") {
    const totalDeLaOC = parseFloat(importeTotal) || 0;
    const deudaActual = totalDeLaOC - montoYaAbonadoOC;
    if (deudaActual > 0) {
      placeholderParaImporteAbonado = `Deuda pendiente: $${deudaActual.toFixed(2)}`;
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center bg-[#20119d] px-4 py-10">
      <h1 className="text-white text-3xl font-bold mb-8 text-center">Solicitud de Ingreso (OC: {id})</h1>
      {estadoOC && (<p className="text-white text-lg mb-4">Estado Orden de Compra: <span className={`font-semibold ${estadoOC === 'Aprobado' ? 'text-green-300' : estadoOC === 'Con Deuda' ? 'text-orange-300' : 'text-yellow-300'}`}>{estadoOC}</span></p>)}
      {errorMensaje && <div className="w-full max-w-4xl mb-4 bg-red-100 border-red-400 text-red-700 px-4 py-3 rounded" role="alert">{errorMensaje}</div>}
      
      <div className="bg-white/10 backdrop-blur-sm p-6 md:p-8 rounded-lg shadow-xl w-full max-w-5xl text-white">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-x-6 gap-y-4">
          
          <div>
            <label htmlFor="fecha" className={labelClass}>Fecha OC</label>
            <input id="fecha" type="date" value={fecha} readOnly className={`${baseInputClass} ${disabledInputClass}`} />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="proveedor" className={labelClass}>Proveedor</label>
            <select id="proveedor" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} className={baseInputClass} disabled={proveedoresLoading}>
              <option value="" disabled>{proveedoresLoading ? "Cargando..." : "Seleccionar Proveedor"}</option>
              {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="producto" className={labelClass}>Producto (Principal)</label>
            <input id="producto" value={`${productosDelContexto.find(p=>p.id.toString() === producto)?.nombre || 'N/A'} (${codigo})`} className={`${baseInputClass} ${disabledInputClass}`} disabled />
          </div>

          <div>
            <label htmlFor="cantidad" className={labelClass}>Cant. Solicitada</label>
            <input id="cantidad" type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={baseInputClass} />
          </div>
          <div>
            <label htmlFor="precioUnitario" className={labelClass}>Precio Unitario (Sin IVA)</label>
            <input id="precioUnitario" type="number" step="0.01" value={precioUnitario} onChange={(e) => setPrecioUnitario(e.target.value)} className={baseInputClass} placeholder="Ej: 150.50" />
          </div>
          <div>
            <label htmlFor="importeTotal" className={labelClass}>Importe Total OC</label>
            <input id="importeTotal" type="number" step="0.01" value={importeTotal} onChange={(e) => setImporteTotal(e.target.value)} className={baseInputClass} />
          </div>
          <div>
            <label htmlFor="unidad" className={labelClass}>Unidad Medida</label>
            <input id="unidad" type="text" value={tipo} readOnly className={`${baseInputClass} ${disabledInputClass}`} />
          </div>
          
          <hr className="col-span-1 md:col-span-4 border-t border-white/20 my-2" />
          
           <div>
            <label htmlFor="estado_recepcion" className={labelClass}>Estado Recepción *</label>
            <select id="estado_recepcion" value={estado_recepcion} onChange={(e) => setEstadoRecepcion(e.target.value)} className={`${baseInputClass}`} required>
              <option value="Completa">Completa</option> <option value="Parcial">Parcial</option> <option value="Extra">Extra</option> <option value="Con Daños">Con Daños</option>
            </select>
          </div>
          <div>
            <label htmlFor="cantidad_recepcionada" className={labelClass}>Cantidad Recepcionada *</label>
            <input id="cantidad_recepcionada" type="number" min="0" value={cantidad_recepcionada} onChange={(e) => setCantidadRecepcionada(e.target.value)} className={baseInputClass} required/>
          </div>
          <div>
            <label htmlFor="nro_remito_proveedor" className={labelClass}>N° Remito Proveedor *</label>
            <input id="nro_remito_proveedor" type="text" value={nro_remito_proveedor} onChange={(e) => setNroRemitoProveedor(e.target.value)} className={baseInputClass} required />
          </div>
          <div>
            <label htmlFor="importeAbonado" className={labelClass}>Importe a Abonar (Nuevo)</label>
            <input id="importeAbonado" type="number" step="0.01" min="0" value={importeAbonado} onChange={(e) => setImporteAbonado(e.target.value)} className={baseInputClass} placeholder={placeholderParaImporteAbonado}/>
            {estadoOC === "Con Deuda" && montoYaAbonadoOC > 0 && (<p className="text-xs text-gray-300 mt-1">Ya abonado: ${montoYaAbonadoOC.toFixed(2)}</p>)}
          </div>

          <div>
            <label htmlFor="formaPago" className={labelClass}>Forma de Pago</label>
            <select id="formaPago" value={formaPago} onChange={(e) => setFormaPago(e.target.value)} className={baseInputClass}>
                {opcionesFormaPago.map(opcion => <option key={opcion} value={opcion}>{opcion}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="chequePerteneceA" className={labelClass}>Cheque Perteneciente a</label>
            <input id="chequePerteneceA" type="text" value={chequePerteneceA} onChange={(e) => setChequePerteneceA(e.target.value)} className={baseInputClass}/>
          </div>
          <div>
            <label htmlFor="tipoCaja" className={labelClass}>Tipo de Caja</label>
            <select id="tipoCaja" value={tipoCaja} onChange={(e) => setTipoCaja(e.target.value)} className={baseInputClass}>
                <option value="caja diaria">Caja Diaria</option>
                <option value="caja mayor">Caja Mayor</option>
            </select>
          </div>
           <div className="md:col-span-1">
            <label htmlFor="ajusteTC" className={labelClass}>Ajuste x TC</label>
            <select id="ajusteTC" value={ajusteTC} onChange={(e) => setAjusteTC(e.target.value)} className={`${baseInputClass}`}>
              <option value="true">Sí</option>
              <option value="false">No</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="cuenta" className={labelClass}>Cuenta</label>
            <input id="cuenta" type="text" value={cuenta} onChange={(e) => setCuenta(e.target.value)} className={baseInputClass} placeholder="Ej: 411001" />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="iibb" className={labelClass}>IIBB (%)</label>
            <input id="iibb" type="number" step="0.01" value={iibb} onChange={(e) => setIibb(e.target.value)} className={baseInputClass} placeholder="Ej: 3.5" />
          </div>

        </div>

        <div className="flex items-center justify-between mt-8">
            <button onClick={handleDescargarPDF} type="button" className="bg-blue-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-600 transition">Descargar</button>
            <div className="flex gap-4">
              <button onClick={handleAgregar} disabled={(estadoOC !== 'Aprobado' && estadoOC !== 'Con Deuda' && estadoOC !== 'Pendiente') || !cantidad_recepcionada || !nro_remito_proveedor.trim()} className="bg-green-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-600 disabled:opacity-50">Registrar ingreso</button>
               <button onClick={() => router.back()} type="button" className="bg-gray-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-600 transition">Volver</button>
            </div>
        </div>
      </div>
    </div>
  );
}