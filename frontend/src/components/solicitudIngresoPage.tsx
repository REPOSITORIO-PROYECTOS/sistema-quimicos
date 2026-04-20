'use client';

import { PUBLIC_API_BASE_URL } from '@/lib/publicApiBase';
import { useProductsContext } from "@/context/ProductsContext";
import { useProveedoresContext } from "@/context/ProveedoresContext";
import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import jsPDF from 'jspdf';

const normalizarEstado = (estado?: string | null) => String(estado || '').trim().toUpperCase();

type HistorialPago = {
  id: number;
  monto: number;
  fecha?: string | null;
  descripcion?: string | null;
  usuario?: string | null;
};

type ChequePago = {
  numero: string;
  perteneceA: string;
};

/** Rol del usuario en sesión (solo cliente). */
function leerRolSesionCliente(): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = localStorage.getItem('user') || sessionStorage.getItem('user');
    if (raw) {
      const u = JSON.parse(raw) as { role?: string; rol?: string };
      return String(u?.role || u?.rol || localStorage.getItem('rol') || '').trim().toUpperCase();
    }
  } catch {
    /* ignore */
  }
  return String(localStorage.getItem('rol') || '').trim().toUpperCase();
}

const derivarEstadoSolicitud = (estado?: string | null, estadoRecepcion?: string | null) => {
  const e = normalizarEstado(estado);
  const er = normalizarEstado(estadoRecepcion);

  if (e === 'CON DEUDA') return 'Con deuda';
  if (er === 'PARCIAL' || er === 'EN_ESPERA_RECEPCION') return 'Recepción pendiente';
  if (e === 'RECIBIDO' || er === 'COMPLETA') return 'Aprobado';
  if (e === 'SOLICITADO') return 'Pendiente de aprobación';
  return 'Recepción pendiente';
};

const CENT_TOLERANCE = 0.009;

/** El campo "A abonar" es siempre en pesos; el backend guarda `importe_abonado` en moneda de la OC (USD si `ajuste_tc`). */
function abonoOrdenDesdePesosIngresados(pesos: number, ordenEnUsd: boolean, tcStr: string): number {
  const p = Number.isFinite(pesos) ? pesos : 0;
  if (!ordenEnUsd) return p;
  if (p <= 0) return p;
  const t = parseFloat(String(tcStr).trim().replace(',', '.')) || 0;
  if (t <= 0) return NaN;
  return Number((p / t).toFixed(2));
}

/** Misma lógica que el backend (`_parse_percentage_rate`). */
function parsePctRateCompras(raw: string | number | undefined | null): number {
  if (raw === undefined || raw === null) return 0;
  const s = String(raw).trim();
  if (!s) return 0;
  const v = parseFloat(s.replace(',', '.'));
  if (!Number.isFinite(v) || v < 0) return 0;
  return v <= 1 ? v : v / 100;
}

/** Misma lógica que el backend (`_parse_iibb_rate`). */
function parseIibbRateCompras(raw: string | number | undefined | null): number {
  if (raw === undefined || raw === null) return 0;
  const s0 = String(raw).trim();
  if (!s0) return 0;
  if (s0.endsWith('%')) {
    const v = parseFloat(s0.slice(0, -1).trim().replace(',', '.'));
    if (!Number.isFinite(v)) return 0;
    return v / 100;
  }
  const v = parseFloat(s0.replace(',', '.'));
  if (!Number.isFinite(v) || v < 0) return 0;
  return v <= 1 ? v : v / 100;
}

/** Total OC en moneda de la orden: base + IVA(base) + IIBB(base) como en `crear` / `editar`. */
function totalConImpuestosAdditive(base: number, ivaStr: string, iibbStr: string): number {
  return base + base * parsePctRateCompras(ivaStr) + base * parseIibbRateCompras(iibbStr);
}

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
  const [tcInicializadoDesdeSnapshot, setTcInicializadoDesdeSnapshot] = useState(false);
  const [tcComprasActual, setTcComprasActual] = useState<string>('');
  const [tipo, setTipo] = useState('Litro');
  const [importeTotal, setImporteTotal] = useState('');
  const [nro_remito_proveedor, setNroRemitoProveedor] = useState('');
  const [importeAbonado, setImporteAbonado] = useState('');
  const [importeAbonadoVisual, setImporteAbonadoVisual] = useState('');
  const [editandoImporteAbonado, setEditandoImporteAbonado] = useState(false);
  const [formaPago, setFormaPago] = useState('Efectivo');
  const [chequePerteneceA, setChequePerteneceA] = useState('');
  const [chequesPago, setChequesPago] = useState<ChequePago[]>([{ numero: '', perteneceA: '' }]);
  const [referenciaPago, setReferenciaPago] = useState('');
  const [fechaPago, setFechaPago] = useState('');
  const [tipoCaja, setTipoCaja] = useState('caja diaria');
  const [pagoCompletoUI, setPagoCompletoUI] = useState(false);

  const { productos: productosDelContexto } = useProductsContext();
  const { proveedores, loading: proveedoresLoading } = useProveedoresContext();
  const [errorMensaje, setErrorMensaje] = useState('');
  const [estadoOC, setEstadoOC] = useState('');
  const [estadoRecepcionActual, setEstadoRecepcionActual] = useState('');
  const [estadoSolicitud, setEstadoSolicitud] = useState<string>('');
  const [montoYaAbonadoOC, setMontoYaAbonadoOC] = useState<number>(0);
  const [idLineaOCOriginal, setIdLineaOCOriginal] = useState<string | number>('');
  const [cantidadTotalSolicitada, setCantidadTotalSolicitada] = useState<number>(0);
  const [cantidadTotalRecibida, setCantidadTotalRecibida] = useState<number>(0);
  const [cantidadTotalPendienteRecepcion, setCantidadTotalPendienteRecepcion] = useState<number>(0);
  const [historialPagos, setHistorialPagos] = useState<HistorialPago[]>([]);
  // ajusteTC removido: se deduce desde showTc

  let problema = false;
  const token = typeof window !== 'undefined' ? localStorage.getItem("authToken") : null;
  const router = useRouter();

  const ESTADO_KEY = `solicitud_estado_${String(id)}`;
  const actualizarEstadoPersistente = useCallback((estado: string) => {
    try { localStorage.setItem(ESTADO_KEY, estado); } catch { }
    setEstadoSolicitud(estado);
  }, [ESTADO_KEY]);
  const cargarEstadoPersistente = useCallback(() => {
    try {
      const key = `solicitud_estado_${String(id)}`;
      const saved = localStorage.getItem(key);
      if (saved) setEstadoSolicitud(saved);
    } catch { }
  }, [id]);



  const cargarCamposProducto = useCallback(async (id_producto: number) => {
    try {
      const response = await fetch(`${PUBLIC_API_BASE_URL}/productos/obtener/${id_producto}`, { headers: { "Authorization": `Bearer ${token}` } });
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
      const response = await fetch(`${PUBLIC_API_BASE_URL}/ordenes_compra/obtener/${id}`, { headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` } });
      if (!response.ok) throw new Error(`Error al traer la orden`);
      const data = await response.json();
      if (!data?.items?.length) throw new Error("No se encontraron items en la OC.");

      const itemPrincipal = data.items[0];
      const items = Array.isArray(data.items) ? data.items : [];
      const totalSolicitadaApi = Number(data.cantidad_total_solicitada);
      const totalRecibidaApi = Number(data.cantidad_total_recibida);
      const totalPendienteApi = Number(data.cantidad_total_pendiente_recepcion);
      const totalSolicitada = Number.isFinite(totalSolicitadaApi)
        ? totalSolicitadaApi
        : items.reduce((acc: number, item: Record<string, unknown>) => acc + (parseFloat(String(item.cantidad_solicitada || 0)) || 0), 0);
      const totalRecibida = Number.isFinite(totalRecibidaApi)
        ? totalRecibidaApi
        : items.reduce((acc: number, item: Record<string, unknown>) => acc + (parseFloat(String(item.cantidad_recibida || 0)) || 0), 0);
      const totalPendiente = Number.isFinite(totalPendienteApi)
        ? totalPendienteApi
        : Math.max(0, totalSolicitada - totalRecibida);

      setMontoYaAbonadoOC(parseFloat(data.importe_abonado) || 0);
      setHistorialPagos(Array.isArray(data.historial_pagos) ? data.historial_pagos : []);
      setCantidadTotalSolicitada(totalSolicitada);
      setCantidadTotalRecibida(totalRecibida);
      setCantidadTotalPendienteRecepcion(totalPendiente);
      setFecha(formatearFecha(data.fecha_creacion));
      setProveedorId(data.proveedor_id?.toString() ?? '');
      setProducto(itemPrincipal.producto_id?.toString() ?? '0');
      setCodigo(itemPrincipal.producto_codigo || '');
      setCantidad(itemPrincipal.cantidad_solicitada?.toString() ?? '');
      setPrecioUnitario(itemPrincipal.precio_unitario_estimado?.toString() ?? '0');
      setCuenta(data.cuenta?.toString() ?? '');
      const iibbStrNorm = data.iibb != null && data.iibb !== '' ? String(data.iibb).trim() : '';
      setIibb(iibbStrNorm);
      setShowIibb(iibbStrNorm !== '' && iibbStrNorm !== '0');
      setShowTc(Boolean(data.ajuste_tc));
      const ivaRaw = data.iva;
      let ivaNormalizado = ivaRaw !== undefined && ivaRaw !== null ? String(ivaRaw).trim() : '';
      // Si la cabecera perdió IVA (null/0) pero la OC es USD y tiene IIBB, asumir IVA 21 % (caso típico Quimex).
      if (
        (!ivaNormalizado || ivaNormalizado === '0') &&
        data.ajuste_tc &&
        iibbStrNorm &&
        iibbStrNorm !== '0'
      ) {
        ivaNormalizado = '21';
      }
      setIva(ivaNormalizado);
      setShowIva(ivaNormalizado !== '' && ivaNormalizado !== '0');
      // TC: solo para OC en USD (`ajuste_tc`). En pesos el backend guarda tc_transaccion=1 como placeholder;
      // si lo mostramos, el usuario ve "1" y además se bloquea la carga de DolarCompras.
      const ordenEnDolar = Boolean(data.ajuste_tc);
      const tcSnapshotBackend = Number(data.tc_snapshot);
      if (ordenEnDolar && Number.isFinite(tcSnapshotBackend) && tcSnapshotBackend > 0) {
        setTc(String(tcSnapshotBackend));
        setTcInicializadoDesdeSnapshot(true);
      } else if (ordenEnDolar) {
        let tcEncontrado: number | null = null;
        const textos = [
          String(data.observaciones_solicitud || ''),
          String(data.notas_recepcion || ''),
        ];
        for (const txt of textos) {
          try {
            const snapshotMatch = txt.match(/__TC_SNAPSHOT__:(.*?)(?:\n|$)/);
            if (snapshotMatch && snapshotMatch[1]) {
              const snapshot = JSON.parse(snapshotMatch[1]);
              const tcParsed = Number(snapshot.tc_usado);
              if (Number.isFinite(tcParsed) && tcParsed > 0) {
                tcEncontrado = tcParsed;
                break;
              }
            }
          } catch {
            // ignore parsing error and continue
          }
        }
        if (tcEncontrado !== null) {
          setTc(String(tcEncontrado));
          setTcInicializadoDesdeSnapshot(true);
        } else {
          setTc('');
          setTcInicializadoDesdeSnapshot(false);
        }
      } else {
        setTc('');
        setTcInicializadoDesdeSnapshot(false);
      }
      const baseSolicitudLineas = items.reduce((acc: number, item: Record<string, unknown>) => {
        const c = parseFloat(String(item.cantidad_solicitada ?? 0)) || 0;
        const p = parseFloat(String(item.precio_unitario_estimado ?? 0)) || 0;
        return acc + c * p;
      }, 0);
      const totalOC = Number(data.importe_total_estimado);
      const totalEsperado = totalConImpuestosAdditive(
        baseSolicitudLineas,
        ivaNormalizado || '0',
        iibbStrNorm || '0'
      );
      // Si el total guardado quedó por debajo de la base solicitada (p. ej. solo recepcionado), mostrar el total coherente con líneas + impuestos.
      const totalApi = Number.isFinite(totalOC) ? totalOC : 0;
      const usarCorreccion =
        baseSolicitudLineas > 0.0001 &&
        totalApi < baseSolicitudLineas * 0.9 &&
        totalEsperado >= baseSolicitudLineas * 0.99;
      setImporteTotal((usarCorreccion ? totalEsperado : totalApi).toFixed(2));
      setEstadoOC(data.estado || '');
      setEstadoRecepcionActual(data.estado_recepcion || '');
      setIdLineaOCOriginal(itemPrincipal.id_linea || '');
      // ajusteTC removido: estado derivado de showTc
      setNroRemitoProveedor(data.nro_remito_proveedor || '');
      setChequePerteneceA(data.cheque_perteneciente_a?.toString() ?? '');
      setTipoCaja(data.tipo_caja);

      setImporteAbonado('');
      setImporteAbonadoVisual('');
      setEditandoImporteAbonado(false);
      setReferenciaPago('');
      setFechaPago('');
      setFormaPago(data.forma_pago || 'Efectivo');
      setChequesPago([{ numero: '', perteneceA: data.cheque_perteneciente_a?.toString() ?? '' }]);

      if (itemPrincipal.unidad_medida) {
        setTipo(String(itemPrincipal.unidad_medida));
      } else if (itemPrincipal.producto_id) {
        await cargarCamposProducto(itemPrincipal.producto_id);
      }

      actualizarEstadoPersistente(derivarEstadoSolicitud(data.estado, data.estado_recepcion));

    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMensaje(err.message);
      } else if (typeof err === 'string') {
        setErrorMensaje(err);
      } else {
        setErrorMensaje('Ocurrió un error desconocido.');
      }
    }
  }, [id, token, cargarCamposProducto, actualizarEstadoPersistente]);

  const aplicarOrdenActualizada = useCallback((orden: Record<string, unknown>) => {
    const estadoNuevo = String(orden.estado || estadoOC);
    const estadoRecepcionNuevo = String(orden.estado_recepcion || estadoRecepcionActual);
    const totalNuevo = parseFloat(String(orden.importe_total_estimado ?? importeTotal ?? 0)) || 0;
    const abonadoNuevo = parseFloat(String(orden.importe_abonado ?? montoYaAbonadoOC)) || 0;

    setEstadoOC(estadoNuevo);
    setEstadoRecepcionActual(estadoRecepcionNuevo);
    setMontoYaAbonadoOC(abonadoNuevo);
    setImporteTotal(totalNuevo.toFixed(2));
    setFormaPago(String(orden.forma_pago || formaPago || 'Efectivo'));
    setChequePerteneceA(String(orden.cheque_perteneciente_a || ''));
    setHistorialPagos(Array.isArray(orden.historial_pagos) ? (orden.historial_pagos as HistorialPago[]) : []);
    if (Array.isArray(orden.items) && orden.items.length > 0) {
      const items = orden.items as Array<Record<string, unknown>>;
      const totalSolicitadaApi = Number(orden.cantidad_total_solicitada);
      const totalRecibidaApi = Number(orden.cantidad_total_recibida);
      const totalPendienteApi = Number(orden.cantidad_total_pendiente_recepcion);
      const totalSolicitada = Number.isFinite(totalSolicitadaApi)
        ? totalSolicitadaApi
        : items.reduce((acc: number, item) => acc + (parseFloat(String(item.cantidad_solicitada || 0)) || 0), 0);
      const totalRecibida = Number.isFinite(totalRecibidaApi)
        ? totalRecibidaApi
        : items.reduce((acc: number, item) => acc + (parseFloat(String(item.cantidad_recibida || 0)) || 0), 0);
      const totalPendiente = Number.isFinite(totalPendienteApi)
        ? totalPendienteApi
        : Math.max(0, totalSolicitada - totalRecibida);

      setCantidadTotalSolicitada(totalSolicitada);
      setCantidadTotalRecibida(totalRecibida);
      setCantidadTotalPendienteRecepcion(totalPendiente);
    }
    setImporteAbonado('');
    setImporteAbonadoVisual('');
    setEditandoImporteAbonado(false);
    setReferenciaPago('');
    setFechaPago('');
    setPagoCompletoUI(false);
    setChequesPago([{ numero: '', perteneceA: '' }]);

    if ('iva' in orden) {
      const iv = orden.iva != null ? String(orden.iva).trim() : '';
      let ivAdj = iv;
      if ((!ivAdj || ivAdj === '0') && orden.ajuste_tc && orden.iibb != null) {
        const ib0 = String(orden.iibb).trim();
        if (ib0 && ib0 !== '0') ivAdj = '21';
      }
      setIva(ivAdj);
      setShowIva(ivAdj !== '' && ivAdj !== '0');
    }
    if ('iibb' in orden) {
      const ib = orden.iibb != null ? String(orden.iibb).trim() : '';
      setIibb(ib);
      setShowIibb(ib !== '' && ib !== '0');
    }
    if ('ajuste_tc' in orden && orden.ajuste_tc != null) {
      setShowTc(Boolean(orden.ajuste_tc));
    }

    if (Array.isArray(orden.items) && orden.items.length > 0) {
      const itemsArr = orden.items as Array<Record<string, unknown>>;
      const baseLin = itemsArr.reduce((acc: number, item) => {
        const c = parseFloat(String(item.cantidad_solicitada ?? 0)) || 0;
        const p = parseFloat(String(item.precio_unitario_estimado ?? 0)) || 0;
        return acc + c * p;
      }, 0);
      const totN = parseFloat(String(orden.importe_total_estimado ?? 0)) || 0;
      const ivs = 'iva' in orden && orden.iva != null ? String(orden.iva).trim() : '';
      const ibs = 'iibb' in orden && orden.iibb != null ? String(orden.iibb).trim() : '';
      let ivu = ivs;
      if ((!ivu || ivu === '0') && orden.ajuste_tc && ibs && ibs !== '0') ivu = '21';
      const esp = totalConImpuestosAdditive(baseLin, ivu || '0', ibs || '0');
      if (baseLin > 0.0001 && totN < baseLin * 0.9 && esp >= baseLin * 0.99) {
        setImporteTotal(esp.toFixed(2));
      }
    }

    actualizarEstadoPersistente(derivarEstadoSolicitud(estadoNuevo, estadoRecepcionNuevo));
  }, [estadoOC, estadoRecepcionActual, importeTotal, montoYaAbonadoOC, formaPago, actualizarEstadoPersistente]);

  useEffect(() => {
    if (id && token) {
      cargarFormulario();
      cargarEstadoPersistente();
    }
  }, [id, token, cargarFormulario, cargarEstadoPersistente]);

  useEffect(() => {
    const fetchTC = async () => {
      if (tcInicializadoDesdeSnapshot) return;
      try {
        const tkn = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
        const headers: Record<string, string> = tkn ? { Authorization: `Bearer ${tkn}` } : {};
        const res = await fetch(`${PUBLIC_API_BASE_URL}/tipos_cambio/obtener/DolarCompras`, { headers });
        let data: { valor?: number; data?: { valor?: number } } = {};
        if (!res.ok) {
          const fallback = await fetch(`${PUBLIC_API_BASE_URL}/tipos_cambio/obtener/Oficial`, { headers });
          if (!fallback.ok) return;
          data = await fallback.json().catch(() => ({}));
        } else {
          data = await res.json().catch(() => ({}));
        }
        const valor = Number((data && (data.valor ?? data.data?.valor)) ?? NaN);
        if (isFinite(valor) && valor > 0) {
          setTcComprasActual(String(valor));
          if (!tc || !isFinite(Number(tc)) || Number(tc) <= 0) {
            setTc(String(valor));
          }
        }
      } catch { }
    };
    fetchTC();
  }, [tc, tcInicializadoDesdeSnapshot]);

  useEffect(() => {
    if (pagoCompletoUI) {
      const tot = parseFloat(importeTotal || '0') || 0;
      const abonadoOc = montoYaAbonadoOC || 0;
      const restanteOc = Math.max(0, tot - abonadoOc);
      const tcN = parseFloat(String(tc).replace(',', '.')) || 0;
      const restantePesos = showTc && tcN > 0 ? restanteOc * tcN : restanteOc;
      setImporteAbonado(restantePesos.toFixed(2));
      if (editandoImporteAbonado) {
        setImporteAbonadoVisual(restantePesos.toFixed(2));
      } else {
        setImporteAbonadoVisual(restantePesos.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      }
    }
  }, [pagoCompletoUI, importeTotal, montoYaAbonadoOC, editandoImporteAbonado, showTc, tc]);

  useEffect(() => {
    if (formaPago !== 'Cheque') {
      setChequesPago([{ numero: '', perteneceA: '' }]);
      setChequePerteneceA('');
    }
  }, [formaPago]);

  const formatearFecha = (fechaOriginal: string | Date | undefined): string => {
    if (!fechaOriginal) return '';
    try {
      const fecha = new Date(fechaOriginal);
      return fecha.toISOString().split('T')[0];
    } catch {
      return '';
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
      // El botón "Aprobar" manda cantidad/precio dentro de items_recibidos[0], no en la raíz del objeto.
      const primerItemRecibido =
        Array.isArray(solicitud.items_recibidos) &&
        solicitud.items_recibidos.length > 0 &&
        typeof solicitud.items_recibidos[0] === 'object' &&
        solicitud.items_recibidos[0] !== null
          ? (solicitud.items_recibidos[0] as Record<string, unknown>)
          : null;

      let id_linea = 0;
      if (primerItemRecibido && 'id_linea' in primerItemRecibido) {
        id_linea = Number(primerItemRecibido.id_linea);
      }

      const parseNumOpcional = (v: unknown): number | null => {
        if (v === undefined || v === null) return null;
        const s = String(v).trim().replace(',', '.');
        if (s === '') return null;
        const n = Number(s);
        return Number.isFinite(n) ? n : null;
      };

      const rawCantidad = solicitud.cantidad ?? primerItemRecibido?.cantidad;
      const rawPrecio = solicitud.precioUnitario ?? primerItemRecibido?.precioUnitario;
      const cantidadNum = parseNumOpcional(rawCantidad);
      const precioNum = parseNumOpcional(rawPrecio);

      const lineaAprobar: Record<string, unknown> = { id_linea };
      // No mandar 0: el backend lo aplicaría y borraría la cantidad real (p. ej. solo se actualiza TC).
      if (cantidadNum !== null && cantidadNum > 0) lineaAprobar.cantidad_solicitada = cantidadNum;
      if (precioNum !== null && precioNum > 0) lineaAprobar.precio_unitario_estimado = precioNum;

      const itemsPayload =
        id_linea > 0 && Object.keys(lineaAprobar).length > 1 ? [lineaAprobar] : [];

      const payload = {
        proveedor_id,
        cuenta,
        iibb: showIibb ? iibb_val : '',
        iva: showIva ? iva_val : '',
        tc: showTc ? tc_val : '',
        ajuste_tc,
        observaciones_solicitud,
        tipo_caja,
        items: itemsPayload,
        importe_abonado: (() => {
          const pesos = parseFloat(importeAbonado || '0') || 0;
          const enOc = abonoOrdenDesdePesosIngresados(pesos, showTc, tc);
          if (showTc && pesos > 0 && Number.isNaN(enOc)) {
            throw new Error('Indique un tipo de cambio válido para registrar el abono en la OC (USD).');
          }
          return enOc;
        })(),
        referencia_pago: typeof solicitud.referencia_pago === 'string' ? solicitud.referencia_pago : referenciaPago,
      };
      const userItem = localStorage.getItem("user") || sessionStorage.getItem("user");
      const user = userItem ? JSON.parse(userItem) : null;
      if (!user || !token) throw new Error("Error de autenticación.");
      const response = await fetch(`${PUBLIC_API_BASE_URL}/ordenes_compra/aprobar/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': user.role || 'USER',
          'X-User-Name': user.usuario || user.name,
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || data?.mensaje || `Error ${response.status}`);
      const orden = data?.orden || {};
      aplicarOrdenActualizada(orden as Record<string, unknown>);
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
      const isIibbActive = !!iibb_dom || showIibb;
      const iibb_final = isIibbActive ? ((iibb_val && iibb_val !== '') ? iibb_val : '3.5') : '';
      const iva_val = iva;
      const tc_val = tc;
      const ajuste_tc_val = showTc ? true : false;
      const tipo_caja_val = tipoCaja;
      const id_linea = Number(idLineaOCOriginal || 0);
      const cantidad_solicitada_val = Number(cantidad || 0);
      const precio_unitario_est_val = parseFloat(precioUnitario || '0');
      const pesosAbono = parseFloat(importeAbonado || '0') || 0;
      const importe_abonado_val = abonoOrdenDesdePesosIngresados(pesosAbono, ajuste_tc_val, tc_val);
      if (ajuste_tc_val && pesosAbono > 0 && Number.isNaN(importe_abonado_val)) {
        throw new Error('Indique un tipo de cambio válido para convertir el abono a dólares de la OC.');
      }

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
        importe_abonado: importe_abonado_val,
      };
      const userItem = localStorage.getItem("user") || sessionStorage.getItem("user");
      const user = userItem ? JSON.parse(userItem) : null;
      if (!user || !token) throw new Error("Error de autenticación.");
      const response = await fetch(`${PUBLIC_API_BASE_URL}/ordenes_compra/editar/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': user.role || 'USER',
          'X-User-Name': user.usuario || user.name,
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || result?.mensaje || `Error ${response.status}`);
      const orden = result?.orden || {};
      aplicarOrdenActualizada(orden as Record<string, unknown>);
    } catch (error: unknown) {
      problema = true;
      setErrorMensaje(error instanceof Error ? error.message : 'Error guardando cambios.');
    }
  };

  const registrarPagoAPI = async () => {
    try {
      problema = false;
      setErrorMensaje('');

      // Recargar datos antes de registrar pago para asegurar que tenemos el importe_abonado correcto
      let abonadoActual = montoYaAbonadoOC;
      let totalObjetivoActual = parseFloat(importeTotal) || 0;
      const reloadResponse = await fetch(`${PUBLIC_API_BASE_URL}/ordenes_compra/obtener/${id}`, {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });

      if (reloadResponse.ok) {
        const reloadData = await reloadResponse.json();
        abonadoActual = parseFloat(reloadData.importe_abonado) || 0;
        totalObjetivoActual = Number(reloadData.importe_total_estimado) || 0;
        if (totalObjetivoActual > 0) {
          setImporteTotal(totalObjetivoActual.toFixed(2));
        }
        setMontoYaAbonadoOC(abonadoActual);
      }

      const montoPagoPesos = parseFloat(importeAbonado || '0') || 0;
      if (montoPagoPesos <= 0) {
        throw new Error('Ingrese un monto a pagar mayor a cero.');
      }

      const saldoPendienteOc = Math.max(0, totalObjetivoActual - abonadoActual);
      if (saldoPendienteOc <= 0) {
        throw new Error('La orden no tiene saldo pendiente.');
      }

      const tcApi = parseFloat(String(tc).trim().replace(',', '.')) || 0;
      const saldoPendientePesos = showTc && tcApi > 0 ? saldoPendienteOc * tcApi : saldoPendienteOc;

      const montoDesdeInputVisual = parsearMontoEnPesos(importeAbonadoVisual || '');
      const montoDesdeEstado = parseFloat(importeAbonado || '0') || 0;
      const hayMontoManualValido = Number.isFinite(montoDesdeInputVisual) && montoDesdeInputVisual > 0;
      const montoManualPesos = hayMontoManualValido ? montoDesdeInputVisual : montoDesdeEstado;
      const manualPareceDistintoAlSaldo = Math.abs((montoManualPesos || 0) - saldoPendientePesos) > CENT_TOLERANCE;
      const montoElegidoPesos = (pagoCompletoUI && !manualPareceDistintoAlSaldo)
        ? saldoPendientePesos
        : montoManualPesos;

      if (showTc && tcApi <= 0) {
        throw new Error('Se requiere un tipo de cambio válido para pagar una orden en dólares (el importe se ingresa en pesos).');
      }

      if (!pagoCompletoUI && montoElegidoPesos <= 0) {
        throw new Error('Ingrese un monto valido en A Abonar Ahora.');
      }

      if ((montoElegidoPesos - saldoPendientePesos) > CENT_TOLERANCE) {
        throw new Error(
          `El monto supera la deuda pendiente ($ ${saldoPendientePesos.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}).`
        );
      }

      let montoPagoAplicado: number;
      if (showTc) {
        if (Math.abs(montoElegidoPesos - saldoPendientePesos) <= CENT_TOLERANCE) {
          montoPagoAplicado = Number(saldoPendienteOc.toFixed(2));
        } else {
          const usd = Number((montoElegidoPesos / tcApi).toFixed(2));
          montoPagoAplicado = usd > saldoPendienteOc + CENT_TOLERANCE
            ? Number(saldoPendienteOc.toFixed(2))
            : usd;
        }
      } else {
        montoPagoAplicado = Math.abs(montoElegidoPesos - saldoPendientePesos) <= CENT_TOLERANCE
          ? Number(saldoPendienteOc.toFixed(2))
          : Number(montoElegidoPesos.toFixed(2));
      }

      const userItem = localStorage.getItem('user') || sessionStorage.getItem('user');
      const user = userItem ? JSON.parse(userItem) : null;
      if (!user || !token) throw new Error('Error de autenticación.');

      let chequeTitulares = chequePerteneceA;
      let referenciaCompuesta = referenciaPago;
      let chequesPayload: Array<{ numero: string; pertenece_a: string }> = [];

      if (formaPago === 'Cheque') {
        const chequesValidos = chequesPago
          .map((item) => ({
            numero: String(item.numero || '').trim(),
            pertenece_a: String(item.perteneceA || '').trim(),
          }))
          .filter((item) => item.numero || item.pertenece_a);

        const hayIncompletos = chequesValidos.some((item) => !item.numero || !item.pertenece_a);
        if (hayIncompletos) {
          throw new Error('Complete numero y titular en cada cheque cargado.');
        }
        if (chequesValidos.length === 0) {
          throw new Error('Debe cargar al menos un cheque con numero y titular.');
        }

        chequesPayload = chequesValidos;
        chequeTitulares = Array.from(new Set(chequesValidos.map((item) => item.pertenece_a))).join(', ');
        const detalleCheques = chequesValidos
          .map((item) => `N° ${item.numero} (${item.pertenece_a})`)
          .join(', ');
        referenciaCompuesta = [referenciaPago, `Cheques: ${detalleCheques}`]
          .map((part) => String(part || '').trim())
          .filter(Boolean)
          .join(' | ');
      }

      const response = await fetch(`${PUBLIC_API_BASE_URL}/ordenes_compra/pagos/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': user.role || 'USER',
          'X-User-Name': user.usuario || user.name,
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          monto: montoPagoAplicado,
          forma_pago: formaPago,
          cheque_perteneciente_a: formaPago === 'Cheque' ? chequeTitulares : null,
          cheques: formaPago === 'Cheque' ? chequesPayload : undefined,
          referencia_pago: referenciaCompuesta,
          fecha_pago: fechaPago || undefined
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || data?.mensaje || `Error ${response.status}`);
      aplicarOrdenActualizada((data?.orden || {}) as Record<string, unknown>);
      if (String(data?.tipo_pago || '').toUpperCase() === 'PARCIAL') {
        alert('Pago parcial registrado correctamente.');
      } else if (String(data?.tipo_pago || '').toUpperCase() === 'TOTAL') {
        alert('Pago total registrado correctamente.');
      } else {
        alert('Pago registrado correctamente.');
      }
    } catch (error: unknown) {
      problema = true;
      setErrorMensaje(error instanceof Error ? error.message : 'Error registrando pago.');
    }
  };

  const handleDescargarPDF = () => {
    const doc = new jsPDF();
    const productoInfo = productosDelContexto.find(p => p.id.toString() === producto);
    const proveedorInfo = proveedores.find(p => p.id.toString() === proveedorId);
    let y = 20;

    const totOcMoneda = parseFloat(importeTotal || '0') || 0;
    const tcPdf = parseFloat(String(tc || '').trim().replace(',', '.')) || 0;
    const pdfOrdenUsd = showTc;
    const pdfTcOk = pdfOrdenUsd && tcPdf > 0;
    const puOc = parseFloat(precioUnitario || '0') || 0;
    const totArs = pdfTcOk ? totOcMoneda * tcPdf : !pdfOrdenUsd ? totOcMoneda : null;
    const puArs = pdfTcOk ? puOc * tcPdf : !pdfOrdenUsd ? puOc : null;

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
    if (pdfOrdenUsd && tcPdf > 0) {
      agregarCampo('TC compras (snapshot):', tcPdf.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    }
    y += 5; doc.line(20, y, 190, y); y += 10;

    doc.setFontSize(14); doc.text('Detalles del Pedido:', 20, y); y += 8; doc.setFontSize(12);

    agregarCampo('Producto:', `${productoInfo?.nombre || 'N/A'} (${codigo})`);
    agregarCampo('Cantidad Solicitada:', `${cantidad} ${tipo}`);
    if (pdfTcOk && puArs !== null) {
      agregarCampo(
        'Precio Unitario (ARS, sin IVA):',
        `$${puArs.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      );
      agregarCampo('Precio en OC (USD):', `US$${puOc.toFixed(2)}`);
    } else if (pdfOrdenUsd) {
      agregarCampo('Precio Unitario (OC USD, sin IVA):', `US$${puOc.toFixed(2)}`);
    } else {
      agregarCampo(
        'Precio Unitario (ARS, sin IVA):',
        `$${puOc.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      );
    }
    if (pdfTcOk && totArs !== null) {
      agregarCampo(
        'Importe Total OC (ARS):',
        `$${totArs.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      );
      agregarCampo('Importe total en OC (USD):', `US$${totOcMoneda.toFixed(2)}`);
    } else if (pdfOrdenUsd) {
      agregarCampo('Importe Total OC (USD):', `US$${totOcMoneda.toFixed(2)}`);
    } else {
      agregarCampo(
        'Importe Total OC (ARS):',
        `$${totOcMoneda.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      );
    }
    y += 5; doc.line(20, y, 190, y); y += 10;

    doc.setFontSize(14); doc.text('Información de Recepción:', 20, y); y += 8; doc.setFontSize(12);
    agregarCampo('Estado Recepción:', estadoRecepcionActual || 'N/A');
    agregarCampo('Cantidad recepcionada (total OC):', `${cantidadTotalRecibida.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${tipo}`);
    agregarCampo('N° Remito Proveedor:', nro_remito_proveedor);
    doc.save(`Orden_de_Compra_${id}.pdf`);
  };

  const baseInputClass = "w-full px-3 py-2 rounded bg-white text-black border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const disabledInputClass = "disabled:bg-gray-200 disabled:text-gray-600 disabled:cursor-not-allowed";
  const labelClass = "block text-sm font-medium mb-1 text-white";
  const opcionesFormaPago = ["Cheque", "Efectivo", "Transferencia", "Cuenta Corriente"];

  // --- Cálculos para el resumen ---
  // Cálculos para el resumen (solo declarar una vez)


  const importeTotalNum = parseFloat(importeTotal) || 0;
  const montoAbonadoNum = montoYaAbonadoOC || 0;
  const importeAbonadoNum = parseFloat(importeAbonado) || 0;
  const totalObjetivoUI = importeTotalNum;
  const deudaPendienteOC = Math.max(0, totalObjetivoUI - montoAbonadoNum);
  const tcNum = parseFloat(tc);
  const tcValido = !isNaN(tcNum) && tcNum > 0;
  const ordenEnUsd = showTc;
  /** Valores de cabecera están en moneda de la OC; para pantalla el usuario ve siempre ARS cuando hay TC (OC en USD × TC). */
  const aPesosArs = (valorEnMonedaOc: number) =>
    ordenEnUsd && tcValido ? valorEnMonedaOc * tcNum : !ordenEnUsd ? valorEnMonedaOc : null;
  const formatearPesosArs = (valorEnMonedaOc: number) => {
    const ars = aPesosArs(valorEnMonedaOc);
    if (ars !== null) {
      return `$ ${ars.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ARS`;
    }
    return `US$ ${valorEnMonedaOc.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  const totalOcUsd = ordenEnUsd ? totalObjetivoUI : (tcValido ? (totalObjetivoUI / tcNum) : 0);
  /** Tope del input "A abonar": siempre en pesos (OC en USD: deuda en USD × TC; sin TC válido en USD → 0). */
  const topeAbonarPesos = !ordenEnUsd
    ? deudaPendienteOC
    : tcValido
      ? deudaPendienteOC * tcNum
      : 0;
  const pagoSuperaDeuda = topeAbonarPesos > 0 && (importeAbonadoNum - topeAbonarPesos) > CENT_TOLERANCE;
  const pagoEquivUsdEnOc =
    ordenEnUsd && tcValido && importeAbonadoNum > 0
      ? Math.min(importeAbonadoNum / tcNum, deudaPendienteOC)
      : 0;
  const bloquearRegistrarPago =
    importeAbonadoNum <= 0 || pagoSuperaDeuda || deudaPendienteOC <= 0 || (ordenEnUsd && !tcValido);

  let placeholderParaImporteAbonado = 'Ej: 100,00 (pesos)';
  if (normalizarEstado(estadoOC) === 'CON DEUDA') {
    const totalDeLaOC = parseFloat(importeTotal) || 0;
    const deudaOc = totalDeLaOC - montoYaAbonadoOC;
    if (deudaOc > 0) {
      if (ordenEnUsd && tcValido) {
        placeholderParaImporteAbonado = `Deuda en pesos (~$ ${(deudaOc * tcNum).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
      } else if (ordenEnUsd) {
        placeholderParaImporteAbonado = `Deuda en OC: US$ ${deudaOc.toFixed(2)} (defina TC para pagar en $)`;
      } else {
        placeholderParaImporteAbonado = `Deuda pendiente: $ ${deudaOc.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
    }
  }
  const normalizarMontoPagoEnBlur = () => {
    const valorParseado = parsearMontoEnPesos(importeAbonadoVisual || importeAbonado || '0');
    const valor = Number.isFinite(valorParseado) ? valorParseado : parseFloat(importeAbonado || '0');
    if (Number.isNaN(valor) || valor <= 0) {
      setImporteAbonado('');
      setImporteAbonadoVisual('');
      setEditandoImporteAbonado(false);
      return;
    }
    setImporteAbonado(valor.toFixed(2));
    setImporteAbonadoVisual(valor.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setEditandoImporteAbonado(false);
  };
  const parsearMontoEnPesos = (valor: string) => {
    const raw = valor.replace(/\s/g, '').replace(/\$/g, '');
    if (!raw) return NaN;

    const tieneComa = raw.includes(',');
    const tienePunto = raw.includes('.');

    let normalizado = raw;

    if (tieneComa && tienePunto) {
      const ultimoSeparador = Math.max(raw.lastIndexOf(','), raw.lastIndexOf('.'));
      const parteEntera = raw.slice(0, ultimoSeparador).replace(/[^\d]/g, '');
      const parteDecimal = raw.slice(ultimoSeparador + 1).replace(/[^\d]/g, '');
      normalizado = `${parteEntera}.${parteDecimal}`;
    } else if (tieneComa || tienePunto) {
      const sep = tieneComa ? ',' : '.';
      const partes = raw.split(sep);
      if (partes.length > 2) {
        const decimal = partes.pop() || '';
        normalizado = `${partes.join('').replace(/[^\d]/g, '')}.${decimal.replace(/[^\d]/g, '')}`;
      } else {
        const entero = (partes[0] || '').replace(/[^\d]/g, '');
        const decimal = (partes[1] || '').replace(/[^\d]/g, '');
        const pareceDecimal = decimal.length > 0 && decimal.length <= 2;
        normalizado = pareceDecimal ? `${entero}.${decimal}` : `${entero}${decimal}`;
      }
    } else {
      normalizado = raw.replace(/[^\d]/g, '');
    }

    const numero = Number(normalizado);
    return Number.isFinite(numero) ? numero : NaN;
  };
  const manejarCambioImporteAbonado = (valor: string) => {
    setPagoCompletoUI(false);
    setEditandoImporteAbonado(true);
    setImporteAbonadoVisual(valor);
    if (!valor.trim()) {
      setImporteAbonado('');
      return;
    }
    const numero = parsearMontoEnPesos(valor);
    if (Number.isNaN(numero) || numero < 0) {
      return;
    }
    setImporteAbonado(numero.toFixed(2));
  };
  const iniciarEdicionImporteAbonado = () => {
    setEditandoImporteAbonado(true);
    if (importeAbonado) {
      setImporteAbonadoVisual(importeAbonado);
    }
  };
  const actualizarCheque = (index: number, key: keyof ChequePago, value: string) => {
    setChequesPago((prev) => prev.map((item, idx) => (idx === index ? { ...item, [key]: value } : item)));
  };
  const agregarCheque = () => {
    setChequesPago((prev) => [...prev, { numero: '', perteneceA: '' }]);
  };
  const eliminarCheque = (index: number) => {
    setChequesPago((prev) => {
      if (prev.length <= 1) return [{ numero: '', perteneceA: '' }];
      return prev.filter((_, idx) => idx !== index);
    });
  };
  const pagosOrdenados = [...historialPagos].sort((a, b) => {
    const fechaA = a.fecha ? new Date(a.fecha).getTime() : 0;
    const fechaB = b.fecha ? new Date(b.fecha).getTime() : 0;
    return fechaB - fechaA;
  });

  const formatearFechaPago = (valor?: string | null) => {
    if (!valor) return 'Sin fecha';
    const fechaValor = new Date(valor);
    if (Number.isNaN(fechaValor.getTime())) return 'Sin fecha';
    return fechaValor.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const rolUsuario = leerRolSesionCliente();
  const esAdmin = rolUsuario === 'ADMIN';
  const solicitudPendienteAprobacion = normalizarEstado(estadoOC) === 'SOLICITADO';
  // Almacén (y resto de no-admin): en SOLICITADO no define TC/moneda; lo hace admin al aprobar.
  const mostrarBloqueTc = !solicitudPendienteAprobacion || esAdmin;

  return (
    <div className="min-h-screen flex flex-col items-center bg-[#20119d] px-4 py-10">
      <h1 className="text-white text-3xl font-bold mb-8 text-center">Solicitud de Ingreso (OC: {id})</h1>
      {estadoOC && (
        <p className="text-white text-lg mb-2">
          Estado Orden de Compra:{' '}
          <span className={`font-semibold ${normalizarEstado(estadoOC) === 'APROBADO' || normalizarEstado(estadoOC) === 'RECIBIDO' ? 'text-green-300' : normalizarEstado(estadoOC) === 'CON DEUDA' ? 'text-orange-300' : 'text-yellow-300'}`}>
            {estadoOC}
          </span>
        </p>
      )}
      {estadoRecepcionActual && (
        <p className="text-white text-base mb-4">
          Estado Recepción:{' '}
          <span className={`font-semibold ${normalizarEstado(estadoRecepcionActual) === 'COMPLETA' ? 'text-green-300' : normalizarEstado(estadoRecepcionActual) === 'PARCIAL' ? 'text-orange-300' : 'text-blue-300'}`}>
            {estadoRecepcionActual}
          </span>
        </p>
      )}
      {estadoSolicitud && (
        <div role="status" aria-live="polite" className="w-full max-w-5xl mb-4">
          <div className={`flex items-center gap-2 p-3 rounded ${estadoSolicitud === 'Recepción pendiente' ? 'bg-blue-100 text-blue-800' : estadoSolicitud === 'Con deuda' ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              {estadoSolicitud === 'Recepción pendiente' ? <path d="M2 10a8 8 0 1116 0A8 8 0 012 10zm8-4a1 1 0 011 1v2.382l1.447.724a1 1 0 01-.894 1.788l-2.5-1.25A1 1 0 018 10V7a1 1 0 011-1z" /> : estadoSolicitud === 'Con deuda' ? <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm-1-5h2v2H9v-2zm0-8h2v6H9V5z" /> : <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm-1.293-7.293l-2-2a1 1 0 011.414-1.414L9 8.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0z" />}
            </svg>
            <span className="font-semibold">Estado Solicitud:</span>
            <span>{estadoSolicitud}</span>
          </div>
        </div>
      )}
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
            {mostrarBloqueTc && (
              <div className="flex items-center gap-1 mt-2">
                <label htmlFor="toggleTc" className="flex items-center cursor-pointer">
                  <input id="toggleTc" type="checkbox" checked={showTc} onChange={() => {
                    const next = !showTc;
                    setShowTc(next);
                    if (next && (!tc || isNaN(parseFloat(tc)))) {
                      setTc(tcComprasActual || tc);
                    }
                  }} className="accent-blue-600 w-4 h-4 mr-1" />
                  <span className="text-white text-sm font-medium select-none">TC (USD)</span>
                </label>
                {showTc && (
                  <input
                    id="tc"
                    type="number"
                    step="0.01"
                    value={tc}
                    readOnly
                    disabled
                    className={baseInputClass + ' ml-2 w-28 disabled:cursor-not-allowed disabled:opacity-70'}
                    placeholder="TC compras"
                  />
                )}
              </div>
            )}
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
              <input id="producto" value={`${productosDelContexto.find(p => p.id.toString() === producto)?.nombre || 'N/A'} (${codigo})`} className={`${baseInputClass} ${disabledInputClass}`} disabled />
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
              <label htmlFor="precioUnitario" className={labelClass}>
                Precio Unitario (Sin IVA){showTc ? ' — USD' : ' — ARS'}
              </label>
              <input id="precioUnitario" type="number" step="0.01" value={precioUnitario} onChange={(e) => setPrecioUnitario(e.target.value)} className={baseInputClass} placeholder="Ej: 150.50" />
            </div>
            <div>
              <label htmlFor="importeTotal" className={labelClass}>
                Importe Total OC{showTc ? ' (USD en sistema)' : ' (ARS)'}
              </label>
              <input id="importeTotal" type="number" step="0.01" value={importeTotal} readOnly className={`${baseInputClass} ${disabledInputClass}`} />
            </div>
          </div>
        </div>

        {/* --- Bloque 3: Resumen Financiero --- */}
        <div className="mb-8 bg-white/20 rounded-lg p-6 shadow flex flex-col gap-4">
          <h2 className="text-lg font-bold text-white mb-2">Resumen Financiero</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
            <div className="flex flex-col items-center bg-sky-100 rounded-lg p-3 shadow">
              <span className="text-xs text-gray-700 font-semibold mb-1">Cantidad Total Solicitada</span>
              <span className="text-2xl font-bold text-sky-700">{cantidadTotalSolicitada.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex flex-col items-center bg-emerald-100 rounded-lg p-3 shadow">
              <span className="text-xs text-gray-700 font-semibold mb-1">Cantidad Total Recepcionada</span>
              <span className="text-2xl font-bold text-emerald-700">{cantidadTotalRecibida.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className={`flex flex-col items-center rounded-lg p-3 shadow ${cantidadTotalPendienteRecepcion > 0 ? 'bg-orange-200' : 'bg-green-100'}`}>
              <span className="text-xs text-gray-700 font-semibold mb-1">Cantidad Pendiente de Recepción</span>
              <span className={`text-2xl font-bold ${cantidadTotalPendienteRecepcion > 0 ? 'text-orange-700' : 'text-green-700'}`}>
                {cantidadTotalPendienteRecepcion.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
            <div className="flex flex-col items-center bg-yellow-100 rounded-lg p-3 shadow">
              <span className="text-xs text-gray-700 font-semibold mb-1">Importe Total OC (ARS)</span>
              <span className="text-2xl font-bold text-yellow-700">{formatearPesosArs(importeTotalNum)}</span>
              <span className="text-xs text-gray-600 mt-1 text-center">
                {!ordenEnUsd && tcValido
                  ? `TC (compras): ${tcNum.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · Equiv. aprox. US$ ${totalOcUsd.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : ordenEnUsd && tcValido
                    ? `En la OC (USD): US$ ${importeTotalNum.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · TC ${tcNum.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : ordenEnUsd && !tcValido
                      ? 'Definí el tipo de cambio para ver el total en pesos.'
                      : 'Sin tipo de cambio para equivalencia en US$.'
                }
              </span>
            </div>
            <div className="flex flex-col items-center bg-green-100 rounded-lg p-3 shadow">
              <span className="text-xs text-gray-700 font-semibold mb-1">Total Abonado (ARS)</span>
              <span className="text-2xl font-bold text-green-700">{formatearPesosArs(montoAbonadoNum)}</span>
              {ordenEnUsd && tcValido && montoAbonadoNum > 0 && (
                <span className="text-xs text-gray-600 mt-1 text-center">
                  En la OC: US$ {montoAbonadoNum.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
            </div>
            <div className={`flex flex-col items-center rounded-lg p-3 shadow ${deudaPendienteOC > 0 ? 'bg-red-200' : 'bg-green-100'}`}>
              <span className="text-xs text-gray-700 font-semibold mb-1">Deuda Pendiente (ARS)</span>
              <span className={`text-2xl font-bold ${deudaPendienteOC > 0 ? 'text-red-700' : 'text-green-700'}`}>
                {formatearPesosArs(deudaPendienteOC > 0 ? deudaPendienteOC : 0)}
              </span>
              {ordenEnUsd && tcValido && deudaPendienteOC > 0 && (
                <span className="text-xs text-gray-600 mt-1 text-center">
                  En la OC: US$ {deudaPendienteOC.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <div>
              <label htmlFor="importeAbonado" className={labelClass}>A Abonar Ahora ($ — pesos)</label>
              <input id="importeAbonado" type="text" inputMode="decimal" value={importeAbonadoVisual} onFocus={iniciarEdicionImporteAbonado} onChange={(e) => manejarCambioImporteAbonado(e.target.value)} onBlur={normalizarMontoPagoEnBlur} className={baseInputClass + ' mt-2'} placeholder={placeholderParaImporteAbonado} />
              {normalizarEstado(estadoOC) === 'CON DEUDA' && montoYaAbonadoOC > 0 && (
                <p className="text-xs text-gray-300 mt-1">
                  Ya abonado (ARS): {formatearPesosArs(montoYaAbonadoOC)}
                  {ordenEnUsd && tcValido && (
                    <span className="block text-gray-400 mt-0.5">
                      En la OC: US$ {montoYaAbonadoOC.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  )}
                </p>
              )}
              {ordenEnUsd && importeAbonadoNum > 0 && tcValido && (
                <p className="text-xs text-gray-200 mt-1">
                  Impacto en la OC (USD): ~US${' '}
                  {pagoEquivUsdEnOc.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              )}
              {pagoSuperaDeuda && (
                <p className="text-xs text-red-200 mt-1">
                  El monto ingresado supera la deuda pendiente ($ {topeAbonarPesos.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}).
                </p>
              )}
              <div className="mt-2 flex items-center gap-2">
                <input id="pagoCompletoUI" type="checkbox" className="w-4 h-4" checked={pagoCompletoUI} onChange={() => setPagoCompletoUI(!pagoCompletoUI)} />
                <label htmlFor="pagoCompletoUI" className="text-white text-sm">Pago completo (usar total)</label>
                <button type="button" className="px-2 py-1 text-xs rounded bg-green-600 text-white hover:bg-green-700" onClick={() => { setPagoCompletoUI(true); }}>Usar total</button>
              </div>
            </div>
            <div>
              <label htmlFor="formaPago" className={labelClass}>Forma de Pago</label>
              <select id="formaPago" value={formaPago} onChange={(e) => setFormaPago(e.target.value)} className={baseInputClass}>
                {opcionesFormaPago.map(opcion => <option key={opcion} value={opcion}>{opcion}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="fechaPago" className={labelClass}>Fecha del Pago</label>
              <input id="fechaPago" type="datetime-local" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} className={baseInputClass} />
            </div>
            <div>
              <label htmlFor="referenciaPago" className={labelClass}>Referencia / Detalle del Pago</label>
              <input id="referenciaPago" type="text" value={referenciaPago} onChange={(e) => setReferenciaPago(e.target.value)} className={baseInputClass} placeholder="Ej: Recibo 123 / Transferencia banco" />
            </div>
            {formaPago === 'Cheque' && (
              <div className="md:col-span-2 rounded-md border border-white/20 p-3">
                <label className={labelClass}>Cheques del pago</label>
                <div className="space-y-2">
                  {chequesPago.map((cheque, idx) => (
                    <div key={`cheque-${idx}`} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
                      <div className="md:col-span-2">
                        <label className="text-xs text-gray-200 mb-1 block">Numero de cheque</label>
                        <input
                          type="text"
                          value={cheque.numero}
                          onChange={(e) => actualizarCheque(idx, 'numero', e.target.value)}
                          className={baseInputClass}
                          placeholder="Ej: 00012345"
                        />
                      </div>
                      <div className="md:col-span-3">
                        <label className="text-xs text-gray-200 mb-1 block">Perteneciente a</label>
                        <input
                          type="text"
                          value={cheque.perteneceA}
                          onChange={(e) => actualizarCheque(idx, 'perteneceA', e.target.value)}
                          className={baseInputClass}
                          placeholder="Ej: Juan Perez"
                        />
                      </div>
                      <div className="md:col-span-1">
                        <button
                          type="button"
                          onClick={() => eliminarCheque(idx)}
                          className="w-full px-2 py-2 text-xs rounded bg-red-600 text-white hover:bg-red-700"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={agregarCheque}
                  className="mt-2 px-3 py-2 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                >
                  Agregar otro cheque
                </button>
              </div>
            )}
          </div>
          <div className="mt-4 rounded-lg bg-slate-900/40 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-semibold text-white">Historial de Pagos</h3>
              <span className="text-xs text-slate-200">{pagosOrdenados.length} pago(s) registrados</span>
            </div>
            {pagosOrdenados.length > 0 ? (
              <div className="space-y-2">
                {pagosOrdenados.map((pago) => (
                  <div key={pago.id} className="rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm text-white">
                    <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                      <span className="font-semibold">
                        {ordenEnUsd && tcValido ? (
                          <>
                            $ {(Number(pago.monto || 0) * tcNum).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                            <span className="text-slate-300 font-normal">ARS</span>
                            <span className="block text-[11px] font-normal text-slate-400 mt-0.5">
                              En OC: US$ {Number(pago.monto || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </>
                        ) : ordenEnUsd && !tcValido ? (
                          <>US$ {Number(pago.monto || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
                        ) : (
                          <>
                            $ {Number(pago.monto || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                            <span className="text-slate-300 font-normal">ARS</span>
                          </>
                        )}
                      </span>
                      <span className="text-xs text-slate-200">{formatearFechaPago(pago.fecha)}</span>
                    </div>
                    <div className="text-xs text-slate-200 mt-1">{pago.descripcion || 'Pago sin detalle adicional'}</div>
                    {pago.usuario && <div className="text-[11px] text-slate-300 mt-1">Registrado por: {pago.usuario}</div>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-200">Todavía no hay pagos registrados para esta orden.</p>
            )}
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between mt-8 gap-4">
          <button onClick={handleDescargarPDF} type="button" className="bg-blue-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-600 transition">Descargar</button>
          <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
            {normalizarEstado(estadoOC) === 'SOLICITADO' && esAdmin && (
              <button onClick={async () => {
                actualizarEstadoPersistente('Recepción pendiente');
                await enviarAprobacionAPI({
                  proveedor_id: proveedorId,
                  cuenta,
                  iibb: showIibb ? iibb : '',
                  iva: showIva ? iva : '',
                  tc: showTc ? tc : '',
                  referencia_pago: referenciaPago,
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
              }} className="bg-green-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-600">Aprobar Orden</button>
            )}
            {normalizarEstado(estadoOC) !== 'SOLICITADO' && normalizarEstado(estadoOC) !== 'RECHAZADO' && (
              <button
                onClick={registrarPagoAPI}
                className={`px-6 py-3 rounded-lg font-semibold text-white ${bloquearRegistrarPago ? 'bg-emerald-900/50 cursor-not-allowed' : 'bg-emerald-700 hover:bg-emerald-800'}`}
                type="button"
                disabled={bloquearRegistrarPago}
              >
                Registrar pago
              </button>
            )}
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
              Guardar cambios
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
