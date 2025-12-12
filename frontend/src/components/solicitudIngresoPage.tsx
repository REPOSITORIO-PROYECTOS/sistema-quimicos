'use client';

import { useProductsContext } from "@/context/ProductsContext";
import { useProveedoresContext } from "@/context/ProveedoresContext";
import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import jsPDF from 'jspdf';
export default function SolicitudIngresoPage({ id }: { id: number | string }) {
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
  const [pagoCompletoUI, setPagoCompletoUI] = useState(false);
  
  const { productos: productosDelContexto } = useProductsContext();
  const { proveedores, loading: proveedoresLoading } = useProveedoresContext();
  const [errorMensaje, setErrorMensaje] = useState('');
  const [estadoOC, setEstadoOC] = useState('');
  const [estadoSolicitud, setEstadoSolicitud] = useState<string>('');
  const [montoYaAbonadoOC, setMontoYaAbonadoOC] = useState<number>(0);
  const [idLineaOCOriginal, setIdLineaOCOriginal] = useState<string | number>('');
  const [cantidadYaRecibida, setCantidadYaRecibida] = useState<number>(0);
  // ajusteTC removido: se deduce desde showTc

  let problema = false;
  const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
  const router = useRouter();

  const ESTADO_KEY = `solicitud_estado_${String(id)}`;
  const actualizarEstadoPersistente = (estado: string) => {
    try { localStorage.setItem(ESTADO_KEY, estado); } catch {}
    setEstadoSolicitud(estado);
  };
  const cargarEstadoPersistente = () => {
    try {
      const saved = localStorage.getItem(ESTADO_KEY);
      if (saved) setEstadoSolicitud(saved);
    } catch {}
  };



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
      setIibb(data.iibb?.toString() ?? iibb);
      setShowIibb(Boolean(data.iibb) || showIibb);
      setIva(data.iva?.toString() ?? iva);
      setShowIva(Boolean(data.iva) || showIva);
      if (data.tc) {
        setTc(String(data.tc));
        setShowTc(true);
      }
      const totalOC = typeof data.importe_total_estimado === 'number'
        ? data.importe_total_estimado
        : (typeof itemPrincipal.importe_linea_estimado === 'number' ? itemPrincipal.importe_linea_estimado : 0);
      setImporteTotal(totalOC.toFixed(2));
      setEstadoOC(data.estado || '');
      setIdLineaOCOriginal(itemPrincipal.id_linea || '');
      // ajusteTC removido: estado derivado de showTc
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
      cargarEstadoPersistente();
    }
  }, [id, token, cargarFormulario, cargarEstadoPersistente]);

  useEffect(() => {
    const fetchTC = async () => {
      try {
        const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://quimex.sistemataup.online';
        const tkn = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        const headers: Record<string,string> = tkn ? { Authorization: `Bearer ${tkn}` } : {};
        const res = await fetch(`${API_BASE_URL}/tipos_cambio/obtener/Oficial`, { headers });
        if (!res.ok) return;
        const data = await res.json().catch(()=>({}));
        const valor = Number((data && (data.valor ?? data.data?.valor)) ?? NaN);
        if (isFinite(valor) && valor > 0) {
          setTc(String(valor));
          setShowTc(true);
        }
      } catch {}
    };
    fetchTC();
  }, []);

  useEffect(() => {
    const cantNum = parseFloat(cantidad);
    const precioNum = parseFloat(precioUnitario);
    const tcNum = parseFloat(tc);
    let subtotal = 0;
    if (!isNaN(cantNum) && !isNaN(precioNum) && cantNum > 0 && precioNum >= 0) {
      if (!isNaN(tcNum) && tcNum > 0) {
        subtotal = cantNum * precioNum * tcNum;
      } else {
        subtotal = cantNum * precioNum;
      }
      let total = subtotal;
      if (iva && !isNaN(parseFloat(iva))) {
        total += subtotal * (parseFloat(iva) / 100);
      }
      if (iibb && !isNaN(parseFloat(iibb))) {
        total += subtotal * (parseFloat(iibb) / 100);
      }
      setImporteTotal(total.toFixed(2));
    }
  }, [cantidad, precioUnitario, tc, iva, iibb]);

  useEffect(() => {
    if (pagoCompletoUI) {
      const tot = parseFloat(importeTotal || '0') || 0;
      const restante = Math.max(0, tot - (montoYaAbonadoOC || 0));
      setImporteAbonado(restante.toFixed(2));
    }
  }, [pagoCompletoUI, importeTotal, montoYaAbonadoOC]);

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
      actualizarEstadoPersistente('Recepción pendiente');
      const nuevoAbonoFloat = parseFloat(String(solicitud.importeAbonado ?? '')) || 0;
      if (nuevoAbonoFloat < 0) {
        throw new Error('El importe abonado no puede ser negativo.');
      }
      
      const payload = {
        proveedor_id: Number(solicitud.proveedor_id),
        cantidad: Number(solicitud.cantidad),
        precio_unitario: parseFloat(String(solicitud.precioUnitario)),
        importe_total: parseFloat(String(solicitud.importeTotal)),
        cuenta: solicitud.cuenta,
        iibb: (showIibb ? String(solicitud.iibb ?? iibb) : ''),
        iva: (showIva ? String(solicitud.iva ?? iva) : ''),
        tc: (showTc ? String(solicitud.tc ?? tc) : ''),
        ajuste_tc: showTc ? true : false,
        nro_remito_proveedor: solicitud.nro_remito_proveedor,
        estado_recepcion: solicitud.estado_recepcion,
        importe_abonado: nuevoAbonoFloat,
        forma_pago: solicitud.formaPago,
        cheque_perteneciente_a: solicitud.chequePerteneceA,
        tipo_caja: solicitud.tipo_caja,
        items_recibidos: solicitud.items_recibidos.map((item) => ({
          id_linea: Number(item.id_linea),
          cantidad_recibida: (() => {
            const cr = parseFloat(String(item.cantidad_recibida));
            if (!isNaN(cr) && cr > 0) return cr;
            const cs = parseFloat(String(cantidad));
            return !isNaN(cs) && cs > 0 ? cs : 0;
          })(),
          notas_item: (() => {
            const sol = parseFloat(String(cantidad));
            const rec = parseFloat(String(item.cantidad_recibida || cantidad));
            const ingreso = !isNaN(rec) && rec > 0 ? `Ingresó ${rec}` : '';
            let resto = '';
            if (!isNaN(sol) && !isNaN(rec) && sol > rec) {
              const falta = Math.max(0, sol - rec);
              resto = `Falta ${falta} (pendiente)`;
            }
            return [ingreso, resto].filter(Boolean).join(' ');
          })(),
        })),
      };

      const userText = sessionStorage.getItem("user");
      const user = userText ? (JSON.parse(userText) as { role?: string; usuario?: string; name?: string }) : null;
      if (!user || !token) throw new Error("Error de autenticación.");
      
      const response = await fetch(`https://quimex.sistemataup.online/ordenes_compra/recibir/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-User-Role': user?.role || 'USER',
          'X-User-Name': user?.usuario || user?.name || ''
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || data?.mensaje || `Error ${response.status}`);
      const total = parseFloat(String(solicitud.importeTotal)) || 0;
      const abonadoPrevio = montoYaAbonadoOC || 0;
      const abonadoAhora = nuevoAbonoFloat;
      const deuda = Math.max(0, total - (abonadoPrevio + abonadoAhora));
      actualizarEstadoPersistente(deuda > 0 ? 'Con deuda' : 'Aprobado');

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
      actualizarEstadoPersistente('Recepción pendiente');
      // Type guards for solicitud
      const proveedor_id = typeof solicitud.proveedor_id === 'string' || typeof solicitud.proveedor_id === 'number' ? Number(solicitud.proveedor_id) : 0;
      const cuenta = typeof solicitud.cuenta === 'string' ? solicitud.cuenta : '';
      const iibb_val = typeof solicitud.iibb === 'string' ? solicitud.iibb : iibb;
      const iva_val = typeof solicitud.iva === 'string' ? solicitud.iva : iva;
      const tc_val = typeof solicitud.tc === 'string' ? solicitud.tc : tc;
      const ajuste_tc = showTc ? true : false;
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
        iibb: showIibb ? iibb_val : '',
        iva: showIva ? iva_val : '',
        tc: showTc ? tc_val : '',
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
        importe_abonado: parseFloat(importeAbonado || '0') || 0,
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
      const total = typeof solicitud.importeTotal === 'string' ? parseFloat(solicitud.importeTotal) : 0;
      const abonadoPrevio = montoYaAbonadoOC || 0;
      const abonadoAhora = parseFloat(importeAbonado || '0') || 0;
      const deuda = Math.max(0, total - (abonadoPrevio + abonadoAhora));
      actualizarEstadoPersistente(deuda > 0 ? 'Con deuda' : 'Aprobado');
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

  const guardarCambiosOrdenAPI = async () => {
    try {
      problema = false;
      setErrorMensaje('');
      const proveedor_id = Number(proveedorId);
      const cuenta_val = cuenta;
      const iibb_dom = (typeof document !== 'undefined') ? (document.getElementById('iibb') as HTMLInputElement | null) : null;
      const iibb_val = iibb_dom?.value ?? iibb;
      const iibb_final = iibb_dom ? (iibb_val || '3.5') : '';
      const iva_val = iva;
      const tc_val = tc;
      const ajuste_tc_val = showTc ? true : false;
      const tipo_caja_val = tipoCaja;
      const id_linea = Number(idLineaOCOriginal || 0);
      const cantidad_solicitada_val = Number(cantidad || 0);
      const precio_unitario_est_val = parseFloat(precioUnitario || '0');
      const importe_total_est_val = parseFloat(importeTotal || '0');
      const importe_abonado_val = parseFloat(importeAbonado || '0') || 0;

      const payload = {
        proveedor_id,
        cuenta: cuenta_val,
        iibb: iibb_final,
        iva: iva_val ? iva_val : '',
        tc: showTc ? tc_val : '',
        ajuste_tc: ajuste_tc_val,
        tipo_caja: tipo_caja_val,
        items: [
          {
            id_linea,
            cantidad_solicitada: cantidad_solicitada_val,
            precio_unitario_estimado: precio_unitario_est_val,
          }
        ],
        importe_total_estimado: importe_total_est_val,
        importe_abonado: importe_abonado_val,
      };
      const userItem = sessionStorage.getItem("user");
      const user = userItem ? JSON.parse(userItem) : null;
      if (!user || !token) throw new Error("Error de autenticación.");
      const response = await fetch(`https://quimex.sistemataup.online/ordenes_compra/editar/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role' : user.role || 'USER',
          'X-User-Name' : user.usuario || user.name,
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || result?.mensaje || `Error ${response.status}`);
      const total = parseFloat(importeTotal || '0') || 0;
      const abonadoPrevio = montoYaAbonadoOC || 0;
      const abonadoAhora = parseFloat(importeAbonado || '0') || 0;
      const deuda = Math.max(0, total - (abonadoPrevio + abonadoAhora));
      actualizarEstadoPersistente(deuda > 0 ? 'Con deuda' : 'Aprobado');
    } catch (error: unknown) {
      problema = true;
      setErrorMensaje(error instanceof Error ? error.message : 'Error guardando cambios.');
    }
  };

  const handleAgregar = async () => {
    setErrorMensaje('');
    // Validaciones mínimas (puedes agregar más si es necesario)
    if (!proveedorId || !producto || !cantidad || !precioUnitario) {
      setErrorMensaje('Por favor complete todos los campos obligatorios.');
      return;
    }
    actualizarEstadoPersistente('Recepción pendiente');
    const nuevaSolicitud = {
      proveedor_id: proveedorId, producto, codigo, cantidad, precioUnitario, cuenta,
      iibb: showIibb ? iibb : '',
      iva: showIva ? iva : '',
      tc: showTc ? tc : '',
      tipo, importeTotal,
      estado_recepcion,
        items_recibidos: [{
         id_linea: idLineaOCOriginal,
         cantidad_recibida: Number(cantidad_recepcionada || cantidad || '0'),
         producto_codigo: codigo,
      }],
      ajuste_tc: showTc ? true : false,
      importeAbonado, formaPago, chequePerteneceA,
      tipo_caja: tipoCaja,
    };
    await enviarSolicitudAPI(nuevaSolicitud);
    if(!problema) {
      const total = parseFloat(importeTotal || '0') || 0;
      const abonadoPrevio = montoYaAbonadoOC || 0;
      const abonadoAhora = parseFloat(importeAbonado || '0') || 0;
      const deuda = Math.max(0, total - (abonadoPrevio + abonadoAhora));
      actualizarEstadoPersistente(deuda > 0 ? 'Con deuda' : 'Aprobado');
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
      {estadoSolicitud && (
        <div role="status" aria-live="polite" className="w-full max-w-5xl mb-4">
          <div className={`flex items-center gap-2 p-3 rounded ${estadoSolicitud === 'Recepción pendiente' ? 'bg-blue-100 text-blue-800' : estadoSolicitud === 'Con deuda' ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              {estadoSolicitud === 'Recepción pendiente' ? <path d="M2 10a8 8 0 1116 0A8 8 0 012 10zm8-4a1 1 0 011 1v2.382l1.447.724a1 1 0 01-.894 1.788l-2.5-1.25A1 1 0 018 10V7a1 1 0 011-1z"/> : estadoSolicitud === 'Con deuda' ? <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm-1-5h2v2H9v-2zm0-8h2v6H9V5z"/> : <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm-1.293-7.293l-2-2a1 1 0 011.414-1.414L9 8.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0z"/>}
            </svg>
            <span className="font-semibold">Estado Solicitud:</span>
            <span>{estadoSolicitud}</span>
          </div>
        </div>
      )}
      {errorMensaje && <div className="w-full max-w-4xl mb-4 bg-red-100 border-red-400 text-red-700 px-4 py-3 rounded" role="alert">{errorMensaje}</div>}
      <div className="w-full max-w-5xl">
        {/* --- Bloque 1: Proveedor y OC --- */}
        <div className="mb-8 bg白/20 rounded-lg p-6 shadow flex flex-col gap-4">
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
                  const next = !showTc;
                  setShowTc(next);
                  if (next && (!tc || isNaN(parseFloat(tc)))) {
                    setTc(valorTcOficial);
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
            <div>
              <label htmlFor="cantidadRecepcionada" className={labelClass}>Cantidad a Recepcionar</label>
              <input
                id="cantidadRecepcionada"
                type="number"
                step="0.01"
                min="0"
                value={cantidad_recepcionada}
                onChange={(e) => setCantidadRecepcionada(e.target.value)}
                className={baseInputClass}
                placeholder="Ej: 5"
              />
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
              <div className="mt-2 flex items-center gap-2">
                <input id="pagoCompletoUI" type="checkbox" className="w-4 h-4" checked={pagoCompletoUI} onChange={()=> setPagoCompletoUI(!pagoCompletoUI)} />
                <label htmlFor="pagoCompletoUI" className="text-white text-sm">Pago completo (usar total)</label>
                <button type="button" className="px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700" onClick={()=> { setPagoCompletoUI(true); }}>Usar total</button>
              </div>
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
                actualizarEstadoPersistente('Recepción pendiente');
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
                  router.push('/compras');
                }
              } else {
                await handleAgregar();
                router.push('/compras');
              }
            }} className="bg-green-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-600">Aprobar Orden</button>
            <button
              onClick={async () => {
                setErrorMensaje('');
                await guardarCambiosOrdenAPI();
                if (!problema) {
                  alert('Cambios guardados en la orden (montos actualizados).');
                  router.push('/compras');
                }
              }}
              className="bg-yellow-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-yellow-600"
              type="button"
            >
              Guardar cambios (Pendiente)
            </button>
            <button
              onClick={() => {
                setErrorMensaje('');
                actualizarEstadoPersistente('Rechazado');
                alert('No se aprobó la orden. La orden sigue pendiente.');
                router.push('/compras');
              }}
              className="bg-red-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-600"
              type="button"
            >
              No aprobar
            </button>
            <button onClick={() => router.push('/compras')} type="button" className="bg-gray-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-600 transition">Volver</button>
          </div>
        </div>
      </div>
    </div>
  );
}
