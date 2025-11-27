'use client';

import { useProductsContext } from "@/context/ProductsContext";
import { useProveedoresContext } from "@/context/ProveedoresContext";
import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import jsPDF from 'jspdf';
//eslint-disable-next-line
export default function SolicitudIngresoPage({ id }: any) {
  const [fecha, setFecha] = useState('');
  const [proveedorId, setProveedorId] = useState('');
  const [producto, setProducto] = useState('0');
  const [codigo, setCodigo] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [precioUnitario, setPrecioUnitario] = useState('');
  const [cuenta, setCuenta] = useState('');
  const [iibb, setIibb] = useState('');
  const [showIibb, setShowIibb] = useState(false);
  const [iva, setIva] = useState('');
  const [showIva, setShowIva] = useState(false);
  const [tc, setTc] = useState('');
  const [showTc, setShowTc] = useState(false);
  // Simular valor oficial del día (en real, fetch desde API)
  const valorTcOficial = '900.00';
  const [tipo, setTipo] = useState('Litro');
  const [importeTotal, setImporteTotal] = useState('');
  const [estado_recepcion, setEstadoRecepcion] = useState('Completa');
  const [cantidad_recepcionada, setCantidadRecepcionada] = useState('');
  const [nro_remito_proveedor, setNroRemitoProveedor] = useState('');
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
  const [cantidadYaRecibida, setCantidadYaRecibida] = useState<number>(0);
  const [ajusteTC, setAjusteTC] = useState<string>('False');

  let problema = false;
  const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
  const router = useRouter();



  const cargarCamposProducto = useCallback(async (id_producto:number) => {
    try {
      const response = await fetch(`https://quimex.sistemataup.online/productos/obtener/${id_producto}`,{headers: { "Authorization": `Bearer ${token}` }});
      if (!response.ok) return;
      const dataProd = await response.json();
      const unidad = dataProd.unidad_venta;
      if (unidad === 'LT') setTipo('Litros');
      else if (unidad === 'KG') setTipo('Kilos');
      else setTipo('Unidades');
    } catch (err) {
      console.error("Error cargando tipo de producto:", err);
    }
  }, [token]);

  const cargarFormulario = useCallback(async () => {
    try {
      setErrorMensaje('');
      const response = await fetch(`https://quimex.sistemataup.online/ordenes_compra/obtener/${id}`,{headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }});
      if (!response.ok) throw new Error(`Error al traer la orden`);
      const data = await response.json();
      if (!data?.items?.length) throw new Error("No se encontraron items en la OC.");
      
      const itemPrincipal = data.items[0];

      setMontoYaAbonadoOC(parseFloat(data.importe_abonado) || 0);
      setFecha(formatearFecha(data.fecha_creacion));
      setProveedorId(data.proveedor_id?.toString() ?? '');
      setProducto(itemPrincipal.producto_id?.toString() ?? '0');
      setCodigo(itemPrincipal.producto_codigo || '');
      setCantidad(itemPrincipal.cantidad_solicitada?.toString() ?? '');
      setPrecioUnitario(itemPrincipal.precio_unitario_estimado?.toString() ?? '0');
      setCuenta(data.cuenta?.toString() ?? '');
  setIibb(data.iibb?.toString() ?? '');
  setIva(data.iva?.toString() ?? '');
  setTc(data.tc?.toString() ?? '');
      setImporteTotal(itemPrincipal.importe_linea_estimado?.toString() ?? '0');
      setEstadoOC(data.estado || '');
      setIdLineaOCOriginal(itemPrincipal.id_linea || '');
      setAjusteTC(data.ajuste_tc === true ? 'True' : 'False');
      setNroRemitoProveedor(data.nro_remito_proveedor || '');
      setChequePerteneceA(data.cheque_perteneciente_a?.toString() ?? '');
      setTipoCaja(data.tipo_caja);
      setCantidadYaRecibida(parseFloat(itemPrincipal.cantidad_recibida) || 0);
      
      setEstadoRecepcion('Completa');
      setCantidadRecepcionada('');
      setImporteAbonado('');
      setFormaPago(data.forma_pago || 'Efectivo');
      
      if (itemPrincipal.unidad_medida) {
        setTipo(String(itemPrincipal.unidad_medida));
      } else if (itemPrincipal.producto_id) {
        await cargarCamposProducto(itemPrincipal.producto_id);
      }
      
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMensaje(err.message);
      } else if (typeof err === 'string') {
        setErrorMensaje(err);
      } else {
        setErrorMensaje('Ocurrió un error desconocido.');
      }
    }
  }, [id, token, cargarCamposProducto]);

  useEffect(() => {
    if (id && token) {
      cargarFormulario();
    }
  }, [id, token, cargarFormulario]);

  useEffect(() => {
    const cantNum = parseFloat(cantidad);
    const precioNum = parseFloat(precioUnitario);
    const tcNum = parseFloat(tc);
    let subtotal = 0;
    if (!isNaN(cantNum) && !isNaN(precioNum) && cantNum > 0 && precioNum >= 0) {
      if (showTc && !isNaN(tcNum) && tcNum > 0) {
        subtotal = cantNum * precioNum * tcNum;
      } else {
        subtotal = cantNum * precioNum;
      }
      let total = subtotal;
      // Sumar IVA si corresponde
      if (showIva && iva && !isNaN(parseFloat(iva))) {
        total += subtotal * (parseFloat(iva) / 100);
      }
      // Sumar IIBB si corresponde
      if (showIibb && iibb && !isNaN(parseFloat(iibb))) {
        total += subtotal * (parseFloat(iibb) / 100);
      }
      setImporteTotal(total.toFixed(2));
    }
  }, [cantidad, precioUnitario, tc, showTc, showIva, iva, showIibb, iibb]);

  const formatearFecha = (fechaOriginal: string | Date | undefined): string => {
    if (!fechaOriginal) return '';
    try {
        const fecha = new Date(fechaOriginal);
        return fecha.toISOString().split('T')[0];
    } catch {
        return '';
    }
  };
  // Tipos para payload de recepción
  interface ItemRecibidoInput {
    id_linea: number | string;
    cantidad_recibida: number | string;
    producto_codigo?: string;
  }
  interface SolicitudIngresoPayload {
    proveedor_id: string | number;
    cantidad: string | number;
    precioUnitario: string | number;
    importeTotal: string | number;
    cuenta?: string;
    iibb?: string;
    iva?: string;
    tc?: string;
    nro_remito_proveedor?: string;
    estado_recepcion?: string;
    importeAbonado?: string | number;
    formaPago?: string;
    chequePerteneceA?: string;
    tipo_caja?: string;
    items_recibidos: ItemRecibidoInput[];
  }
  const enviarSolicitudAPI = async (solicitud: SolicitudIngresoPayload) => {
    try {
      problema = false;
      setErrorMensaje('');
      const nuevoAbonoFloat = parseFloat(String(solicitud.importeAbonado ?? '')) || 0;
      
      const payload = {
        proveedor_id: Number(solicitud.proveedor_id),
        cantidad: Number(solicitud.cantidad),
        precio_unitario: parseFloat(String(solicitud.precioUnitario)),
        importe_total: parseFloat(String(solicitud.importeTotal)),
        cuenta: solicitud.cuenta,
        iibb: showIibb ? solicitud.iibb : '',
        iva: showIva ? solicitud.iva : '',
        tc: showTc ? solicitud.tc : '',
        ajuste_tc: showTc ? true : (ajusteTC === 'True'),
        nro_remito_proveedor: solicitud.nro_remito_proveedor,
        estado_recepcion: solicitud.estado_recepcion,
        importe_abonado: nuevoAbonoFloat,
        forma_pago: solicitud.formaPago,
        cheque_perteneciente_a: solicitud.chequePerteneceA,
        tipo_caja: solicitud.tipo_caja,
        items_recibidos: solicitud.items_recibidos.map((item) => ({
          id_linea: Number(item.id_linea),
          cantidad_recibida: parseFloat(String(item.cantidad_recibida)) || 0,
        })),
      };

      const userText = sessionStorage.getItem("user");
      const user = userText ? (JSON.parse(userText) as { role?: string; usuario?: string; name?: string }) : null;
      if (!user || !token) throw new Error("Error de autenticación.");
      
      const response = await fetch(`https://quimex.sistemataup.online/ordenes_compra/recibir/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || data?.mensaje || `Error ${response.status}`);

  } catch (error: unknown) {
    problema = true;
    if (error instanceof Error) {
      setErrorMensaje(error.message);
    } else if (typeof error === 'string') {
      setErrorMensaje(error);
    } else {
      setErrorMensaje("Ocurrió un error desconocido.");
    }
  }
  };

  // Enviar aprobación (guardar todos los campos editables)
  const enviarAprobacionAPI = async (solicitud: Record<string, unknown>) => {
    try {
      problema = false;
      setErrorMensaje('');
      // Type guards for solicitud
      const proveedor_id = typeof solicitud.proveedor_id === 'string' || typeof solicitud.proveedor_id === 'number' ? Number(solicitud.proveedor_id) : 0;
      const cuenta = typeof solicitud.cuenta === 'string' ? solicitud.cuenta : '';
      const iibb_val = showIibb ? (typeof solicitud.iibb === 'string' ? solicitud.iibb : iibb) : '';
      const iva_val = showIva ? (typeof solicitud.iva === 'string' ? solicitud.iva : iva) : '';
      const tc_val = showTc ? (typeof solicitud.tc === 'string' ? solicitud.tc : tc) : '';
      const ajuste_tc = showTc ? true : (ajusteTC === 'True');
      const observaciones_solicitud = typeof solicitud.observaciones_solicitud === 'string' ? solicitud.observaciones_solicitud : '';
      const tipo_caja = typeof solicitud.tipo_caja === 'string' ? solicitud.tipo_caja : '';
      // items_recibidos
      let id_linea = 0;
      if (
        Array.isArray(solicitud.items_recibidos) &&
        solicitud.items_recibidos.length > 0 &&
        typeof solicitud.items_recibidos[0] === 'object' &&
        solicitud.items_recibidos[0] !== null &&
        'id_linea' in solicitud.items_recibidos[0]
      ) {
        id_linea = Number((solicitud.items_recibidos[0] as Record<string, unknown>).id_linea);
      }
      const cantidad_solicitada = typeof solicitud.cantidad === 'string' || typeof solicitud.cantidad === 'number' ? Number(solicitud.cantidad) : 0;
      const precio_unitario_estimado = typeof solicitud.precioUnitario === 'string' ? parseFloat(solicitud.precioUnitario) : 0;
      const importe_total_estimado = typeof solicitud.importeTotal === 'string' ? parseFloat(solicitud.importeTotal) : 0;
      const payload = {
        proveedor_id,
        cuenta,
        iibb: iibb_val,
        iva: iva_val,
        tc: tc_val,
        ajuste_tc,
        observaciones_solicitud,
        tipo_caja,
        items: [
          {
            id_linea,
            cantidad_solicitada,
            precio_unitario_estimado,
          }
        ],
        importe_total_estimado,
      };
      const userItem = sessionStorage.getItem("user");
      const user = userItem ? JSON.parse(userItem) : null;
      if (!user || !token) throw new Error("Error de autenticación.");
      const response = await fetch(`https://quimex.sistemataup.online/ordenes_compra/aprobar/${id}`, {
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
      if (!response.ok) throw new Error(data?.error || data?.mensaje || `Error ${response.status}`);
    } catch (error: unknown) {
      problema = true;
      if (error instanceof Error) {
        setErrorMensaje(error.message);
      } else if (typeof error === 'string') {
        setErrorMensaje(error);
      } else {
        setErrorMensaje("Ocurrió un error desconocido.");
      }
    }
  };

  const handleAgregar = async () => {
    setErrorMensaje('');
    // Validaciones mínimas (puedes agregar más si es necesario)
    if (!proveedorId || !producto || !cantidad || !precioUnitario) {
      setErrorMensaje('Por favor complete todos los campos obligatorios.');
      return;
    }
    const nuevaSolicitud = {
      proveedor_id: proveedorId, producto, codigo, cantidad, precioUnitario, cuenta,
      iibb: showIibb ? iibb : '',
      iva: showIva ? iva : '',
      tc: showTc ? tc : '',
      tipo, importeTotal,
      estado_recepcion,
      items_recibidos: [{
         "id_linea": idLineaOCOriginal,
         "cantidad_recibida": Number(cantidad_recepcionada || '0'),
         "producto_codigo": codigo,
      }],
      ajusteTC, importeAbonado, formaPago, chequePerteneceA,
      tipo_caja: tipoCaja,
    };
    await enviarSolicitudAPI(nuevaSolicitud);
    if(!problema) {
      alert("Ingreso registrado correctamente.");
      router.back();
    }
  };

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
    agregarCampo('Cantidad Recepcionada (Total):', `${cantidadYaRecibida + parseFloat(cantidad_recepcionada || '0')} ${tipo}`);
    agregarCampo('N° Remito Proveedor:', nro_remito_proveedor);
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





  // --- Cálculos para el resumen ---
  // Cálculos para el resumen (solo declarar una vez)


  const importeTotalNum = parseFloat(importeTotal) || 0;
  const montoAbonadoNum = montoYaAbonadoOC || 0;
  const importeAbonadoNum = parseFloat(importeAbonado) || 0;
  const totalAbonado = montoAbonadoNum + importeAbonadoNum;
  const deudaPendiente = importeTotalNum - totalAbonado;

  return (
    <div className="min-h-screen flex flex-col items-center bg-[#20119d] px-4 py-10">
      <h1 className="text-white text-3xl font-bold mb-8 text-center">Solicitud de Ingreso (OC: {id})</h1>
      {estadoOC && (<p className="text-white text-lg mb-4">Estado Orden de Compra: <span className={`font-semibold ${estadoOC === 'Aprobado' ? 'text-green-300' : estadoOC === 'Con Deuda' ? 'text-orange-300' : 'text-yellow-300'}`}>{estadoOC}</span></p>)}
      {errorMensaje && <div className="w-full max-w-4xl mb-4 bg-red-100 border-red-400 text-red-700 px-4 py-3 rounded" role="alert">{errorMensaje}</div>}
      <div className="w-full max-w-5xl">
        {/* --- Bloque 1: Proveedor y OC --- */}
        <div className="mb-8 bg-white/20 rounded-lg p-6 shadow flex flex-col gap-4">
          <h2 className="text-lg font-bold text-white mb-2">Datos del Proveedor y Orden</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="fecha" className={labelClass}>Fecha OC</label>
              <input id="fecha" type="date" value={fecha} readOnly className={`${baseInputClass} ${disabledInputClass}`} />
            </div>
            <div>
              <label htmlFor="proveedor" className={labelClass}>Proveedor</label>
              <select id="proveedor" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} className={baseInputClass} disabled={proveedoresLoading}>
                <option value="" disabled>{proveedoresLoading ? "Cargando..." : "Seleccionar Proveedor"}</option>
                {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="cuenta" className={labelClass}>Cuenta</label>
              <input id="cuenta" type="text" value={cuenta} onChange={(e) => setCuenta(e.target.value)} className={baseInputClass} placeholder="Ej: 411001" />
            </div>
            <div className="flex items-center gap-1 mt-2">
              <label htmlFor="toggleIibb" className="flex items-center cursor-pointer">
                <input id="toggleIibb" type="checkbox" checked={showIibb} onChange={() => {
                  if (!showIibb && (!iibb || iibb === '')) {
                    setIibb('3.5');
                    setShowIibb(true);
                  } else if (showIibb) {
                    setIibb('');
                    setShowIibb(false);
                  }
                }} className="accent-blue-600 w-4 h-4 mr-1" />
                <span className="text-white text-sm font-medium select-none">IIBB</span>
              </label>
              {showIibb && (
                <input id="iibb" type="number" step="0.01" value={iibb} onChange={(e) => setIibb(e.target.value)} className={baseInputClass + ' ml-2 w-24'} placeholder="Ej: 3.5" />
              )}
            </div>
            <div className="flex items-center gap-1 mt-2">
              <label htmlFor="toggleIva" className="flex items-center cursor-pointer">
                <input id="toggleIva" type="checkbox" checked={showIva} onChange={() => {
                  if (!showIva && (!iva || iva === '')) {
                    setIva('21');
                    setShowIva(true);
                  } else if (showIva) {
                    setIva('');
                    setShowIva(false);
                  }
                }} className="accent-blue-600 w-4 h-4 mr-1" />
                <span className="text-white text-sm font-medium select-none">IVA</span>
              </label>
              {showIva && (
                <input id="iva" type="number" step="0.01" value={iva} onChange={(e) => setIva(e.target.value)} className={baseInputClass + ' ml-2 w-24'} placeholder="Ej: 21" />
              )}
            </div>
            <div className="flex items-center gap-1 mt-2">
              <label htmlFor="toggleTc" className="flex items-center cursor-pointer">
                <input id="toggleTc" type="checkbox" checked={showTc} onChange={() => {
                  setShowTc(!showTc);
                  if (!showTc) {
                    setTc(valorTcOficial);
                  } else {
                    setTc('');
                  }
                }} className="accent-blue-600 w-4 h-4 mr-1" />
                <span className="text-white text-sm font-medium select-none">TC</span>
              </label>
              {showTc && (
                <input id="tc" type="number" step="0.01" value={tc} onChange={(e) => setTc(e.target.value)} className={baseInputClass + ' ml-2 w-28'} placeholder="Ej: 900.00" />
              )}
            </div>
            <div>
              <label htmlFor="tipoCaja" className={labelClass}>Tipo de Caja</label>
              <select id="tipoCaja" value={tipoCaja ?? ''} onChange={(e) => setTipoCaja(e.target.value)} className={baseInputClass}>
                  <option value="caja diaria">Caja Diaria</option>
                  <option value="caja mayor">Caja Mayor</option>
              </select>
            </div>
          </div>
        </div>

        {/* --- Bloque 2: Detalle del Ítem --- */}
        <div className="mb-8 bg-white/20 rounded-lg p-6 shadow flex flex-col gap-4">
          <h2 className="text-lg font-bold text-white mb-2">Detalle del Ítem</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="producto" className={labelClass}>Producto (Principal)</label>
              <input id="producto" value={`${productosDelContexto.find(p=>p.id.toString() === producto)?.nombre || 'N/A'} (${codigo})`} className={`${baseInputClass} ${disabledInputClass}`} disabled />
            </div>
            <div>
              <label htmlFor="cantidad" className={labelClass}>Cant. Solicitada</label>
              <input id="cantidad" type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={baseInputClass} />
            </div>
            <div>
              <label htmlFor="unidad" className={labelClass}>Unidad Medida</label>
              <input id="unidad" type="text" value={tipo} readOnly className={`${baseInputClass} ${disabledInputClass}`} />
            </div>
            <div>
              <label htmlFor="precioUnitario" className={labelClass}>Precio Unitario (Sin IVA)</label>
              <input id="precioUnitario" type="number" step="0.01" value={precioUnitario} onChange={(e) => setPrecioUnitario(e.target.value)} className={baseInputClass} placeholder="Ej: 150.50" />
            </div>
            <div>
              <label htmlFor="importeTotal" className={labelClass}>Importe Total OC</label>
              <input id="importeTotal" type="number" step="0.01" value={importeTotal} onChange={(e) => setImporteTotal(e.target.value)} className={baseInputClass} />
            </div>
            {/* Estado Recepción removido por requerimiento */}
          </div>
        </div>

        {/* --- Bloque 3: Resumen Financiero --- */}
        <div className="mb-8 bg-white/20 rounded-lg p-6 shadow flex flex-col gap-4">
          <h2 className="text-lg font-bold text-white mb-2">Resumen Financiero</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
            <div className="flex flex-col items-center bg-yellow-100 rounded-lg p-3 shadow">
              <span className="text-xs text-gray-700 font-semibold mb-1">Importe Total OC</span>
              <span className="text-2xl font-bold text-yellow-700">{importeTotalNum.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
            </div>
            <div className="flex flex-col items-center bg-green-100 rounded-lg p-3 shadow">
              <span className="text-xs text-gray-700 font-semibold mb-1">Ya Abonado</span>
              <span className="text-2xl font-bold text-green-700">{montoAbonadoNum.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
            </div>
            <div className="flex flex-col items-center bg-blue-100 rounded-lg p-3 shadow">
              <span className="text-xs text-gray-700 font-semibold mb-1">A Abonar Ahora</span>
              <span className="text-2xl font-bold text-blue-700">{importeAbonadoNum.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
            <div className="flex flex-col items-center bg-green-200 rounded-lg p-3 shadow">
              <span className="text-xs text-gray-700 font-semibold mb-1">Total Abonado</span>
              <span className="text-2xl font-bold text-green-900">{totalAbonado.toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
            </div>
            <div className={`flex flex-col items-center rounded-lg p-3 shadow ${deudaPendiente > 0 ? 'bg-red-200' : 'bg-green-100'}`}>
              <span className="text-xs text-gray-700 font-semibold mb-1">Deuda Pendiente</span>
              <span className={`text-2xl font-bold ${deudaPendiente > 0 ? 'text-red-700' : 'text-green-700'}`}>{(deudaPendiente > 0 ? deudaPendiente : 0).toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <div>
              <label htmlFor="importeAbonado" className={labelClass}>A Abonar Ahora</label>
              <input id="importeAbonado" type="number" step="0.01" min="0" value={importeAbonado} onChange={(e) => setImporteAbonado(e.target.value)} className={baseInputClass + ' mt-2'} placeholder={placeholderParaImporteAbonado}/>
              {estadoOC === "Con Deuda" && montoYaAbonadoOC > 0 && (<p className="text-xs text-gray-300 mt-1">Ya abonado: ${montoYaAbonadoOC.toFixed(2)}</p>)}
            </div>
            <div>
              <label htmlFor="formaPago" className={labelClass}>Forma de Pago</label>
              <select id="formaPago" value={formaPago} onChange={(e) => setFormaPago(e.target.value)} className={baseInputClass}>
                  {opcionesFormaPago.map(opcion => <option key={opcion} value={opcion}>{opcion}</option>)}
              </select>
            </div>
            {formaPago === 'Cheque' && (
              <div>
                <label htmlFor="chequePerteneceA" className={labelClass}>Cheque Perteneciente a</label>
                <input id="chequePerteneceA" type="text" value={chequePerteneceA} onChange={(e) => setChequePerteneceA(e.target.value)} className={baseInputClass}/>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between mt-8 gap-4">
          <button onClick={handleDescargarPDF} type="button" className="bg-blue-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-600 transition">Descargar</button>
          <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
            <button onClick={async () => {
              if (estadoOC === 'Solicitado') {
                await enviarAprobacionAPI({
                  proveedor_id: proveedorId,
                  cuenta,
                  iibb: showIibb ? iibb : '',
                  tc: showTc ? tc : '',
                  observaciones_solicitud: '',
                  tipo_caja: tipoCaja,
                  items_recibidos: [{
                    id_linea: idLineaOCOriginal,
                    cantidad: cantidad,
                    precioUnitario: precioUnitario,
                  }],
                  importeTotal,
                });
                if (!problema) {
                  alert("Orden aprobada correctamente.");
                  router.back();
                }
              } else {
                await handleAgregar();
                router.back();
              }
            }} className="bg-green-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-600">Aprobar Orden</button>
            <button
              onClick={() => {
                setErrorMensaje('');
                alert('Cambios guardados. La orden sigue pendiente de aprobación.');
                router.push('/ordenes/pendientes');
              }}
              className="bg-yellow-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-yellow-600"
              type="button"
            >
              Guardar cambios (Pendiente)
            </button>
            <button
              onClick={() => {
                setErrorMensaje('');
                alert('No se aprobó la orden. La orden sigue pendiente.');
                router.push('/ordenes/pendientes');
              }}
              className="bg-red-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-600"
              type="button"
            >
              No aprobar
            </button>
            <button onClick={() => router.back()} type="button" className="bg-gray-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-600 transition">Volver</button>
          </div>
        </div>
      </div>
    </div>
  );
}
