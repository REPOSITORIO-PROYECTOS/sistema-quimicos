"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useProductsContext } from "@/context/ProductsContext";
import { useProveedoresContext } from "@/context/ProveedoresContext";

export default function PedidoRapidoAdmin() {
  const router = useRouter();
  const { productos } = useProductsContext();
  const { proveedores, loading: proveedoresLoading } = useProveedoresContext();

  const [error, setError] = useState<string>("");
  const [proveedorId, setProveedorId] = useState<string>("");
  const [productoId, setProductoId] = useState<string>("0");
  const [cantidad, setCantidad] = useState<string>("");
  const [precioUnitario, setPrecioUnitario] = useState<string>("");
  const [unidadMedida, setUnidadMedida] = useState<string>("");
  const [cuenta, setCuenta] = useState<string>("");
  const [observaciones, setObservaciones] = useState<string>("");
  const [iibb, setIibb] = useState<string>("");
  const [showIibb, setShowIibb] = useState<boolean>(true);
  const [iva, setIva] = useState<string>("");
  const [showIva, setShowIva] = useState<boolean>(true);
  const [tc, setTc] = useState<string>("");
  const [showTc, setShowTc] = useState<boolean>(true);
  const [tipoCaja, setTipoCaja] = useState<string>("caja diaria");
  const [formaPago, setFormaPago] = useState<string>("Efectivo");
  const [importeTotal, setImporteTotal] = useState<string>("0");
  const [importeTotalUsd, setImporteTotalUsd] = useState<string>("");
  // Pago completo / parcial
  const [pagoCompleto, setPagoCompleto] = useState<boolean>(true);
  const [importeAbonado, setImporteAbonado] = useState<string>("");
  const [pagoError, setPagoError] = useState<string>("");

  // Datos del cheque (modal)
  const [chequeModalOpen, setChequeModalOpen] = useState<boolean>(false);
  const [chequeEmisor, setChequeEmisor] = useState<string>("");
  const [chequeBanco, setChequeBanco] = useState<string>("");
  const [chequeNumero, setChequeNumero] = useState<string>("");
  const [chequeFecha, setChequeFecha] = useState<string>("");

  // Cálculo de importe total (similar a SolicitudIngreso)
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
      if (showIva && iva && !isNaN(parseFloat(iva))) {
        total += subtotal * (parseFloat(iva) / 100);
      }
      if (showIibb && iibb && !isNaN(parseFloat(iibb))) {
        total += subtotal * (parseFloat(iibb) / 100);
      }
      setImporteTotal(total.toFixed(2));
      // Si hay TC activo, calcular también en USD
      if (showTc && !isNaN(tcNum) && tcNum > 0) {
        const totalUsd = total / tcNum;
        setImporteTotalUsd(totalUsd.toFixed(2));
      } else {
        setImporteTotalUsd("");
      }
    } else {
      setImporteTotal("0");
      setImporteTotalUsd("");
    }
  }, [cantidad, precioUnitario, tc, showTc, showIva, iva, showIibb, iibb]);

  // Autocompletar TC, IVA e IIBB y otros defaults

  // Defaults: IVA 21%, IIBB 3.5%, y TC oficial
  useEffect(() => {
    setIva("21");
    setIibb("3.5");
    // Traer Tipo de Cambio Oficial
    const fetchTC = async () => {
      try {
        const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://quimex.sistemataup.online';
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        const headers: Record<string,string> = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(`${API_BASE_URL}/tipos_cambio/obtener/Oficial`, { headers });
        if (!res.ok) throw new Error('No se pudo obtener TC Oficial');
        const data = await res.json();
        const valor = Number((data && (data.valor ?? data.data?.valor)) ?? NaN);
        if (isFinite(valor) && valor > 0) {
          setTc(valor.toString());
          setShowTc(true);
        }
      } catch (e) {
        // Si falla, mantenemos TC oculto o vacío
        console.warn('PedidoRapido: Error obteniendo TC Oficial', e);
      }
    };
    fetchTC();
  }, []);

  useEffect(() => {
    try {
      if (!productoId || productoId === '0') return;
      const prod = productos.find(p => String(p.id) === String(productoId));
      const uv = (prod?.unidad_venta || prod?.unidad_medida || '').toUpperCase();
      if (uv === 'LT' || uv === 'LITROS') setUnidadMedida('Litros');
      else if (uv === 'KG' || uv === 'KILOS') setUnidadMedida('Kilos');
      else setUnidadMedida('Unidades');
    } catch {}
  }, [productoId, productos]);

  const esAdmin = useMemo(() => {
    const userItem = typeof window !== 'undefined' ? sessionStorage.getItem('user') : null;
    const user = userItem ? JSON.parse(userItem) : null;
    return user && user.role && user.role.toUpperCase() === 'ADMIN';
  }, []);

  if (!esAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#20119d]">
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <p className="font-semibold">Acceso restringido. Solo Admin puede crear Pedido Rápido.</p>
          <button className="mt-4 px-4 py-2 bg-[#2c239d] text-white rounded" onClick={() => router.push('/compras')}>Volver</button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setPagoError("");
    try {
      const token = localStorage.getItem("token");
      const userItem = sessionStorage.getItem("user");
      const user = userItem ? JSON.parse(userItem) : null;
      if (!token || !user) throw new Error("Autenticación requerida.");

      if (!proveedorId || !productoId || !cantidad || !precioUnitario) {
        throw new Error("Complete proveedor, producto, cantidad y precio.");
      }

      // Validaciones de pago
      const totalCalculadoForm = (() => {
        const cantNum = parseFloat(cantidad);
        const precioNum = parseFloat(precioUnitario);
        const tcNum = parseFloat(tc);
        let subtotal = 0;
        if (!isNaN(cantNum) && !isNaN(precioNum) && cantNum > 0 && precioNum >= 0) {
          subtotal = (showTc && !isNaN(tcNum) && tcNum > 0) ? (cantNum * precioNum * tcNum) : (cantNum * precioNum);
          let total = subtotal;
          if (showIva && iva && !isNaN(parseFloat(iva))) total += subtotal * (parseFloat(iva) / 100);
          if (showIibb && iibb && !isNaN(parseFloat(iibb))) total += subtotal * (parseFloat(iibb) / 100);
          return total;
        }
        return 0;
      })();
      if (!pagoCompleto) {
        const abonadoNum = parseFloat(importeAbonado || '0');
        if (isNaN(abonadoNum) || abonadoNum <= 0) {
          setPagoError("Ingrese el importe abonado (mayor a 0).");
          return;
        }
        if (abonadoNum > totalCalculadoForm) {
          setPagoError("El importe abonado no puede superar el total.");
          return;
        }
      }

      // 1) Crear OC
      // Calcular observaciones de pago para registrar en la creación
      const importeAbonadoCrear = pagoCompleto ? totalCalculadoForm : (parseFloat(importeAbonado || '0') || 0);
      const deudaRestanteCrear = Math.max(0, totalCalculadoForm - importeAbonadoCrear);
      const observacionesPagoCrear = pagoCompleto
        ? 'Pago completo'
        : `Pago parcial: abonado=${importeAbonadoCrear.toFixed(2)}, deuda restante=${deudaRestanteCrear.toFixed(2)}`;
      const observacionesChequeCrear = formaPago === 'Cheque'
        ? ` | Cheque: Emisor=${chequeEmisor}; Banco=${chequeBanco}; N°=${chequeNumero}; Fecha=${chequeFecha}`
        : '';
      const observacionesFinalCrear = `${observaciones || ''}${observaciones ? ' | ' : ''}${observacionesPagoCrear}${observacionesChequeCrear}`.trim();

      const crearPayload = {
        usuario_interno_id: user.id || undefined,
        forma_pago: formaPago,
        observaciones_solicitud: observacionesFinalCrear,
        items: [
          {
            // Backend espera el ID del producto en 'codigo_interno'
            codigo_interno: Number(productoId),
            cantidad: Number(cantidad),
            precio_unitario_estimado: parseFloat(precioUnitario) || 0,
            unidad_medida: unidadMedida || 'Unidades',
          },
        ],
        fecha_pedido: new Date().toISOString().split('T')[0],
        proveedor_id: Number(proveedorId),
        iibb: showIibb ? iibb : '',
        fecha_limite: new Date().toISOString().split('T')[0],
        cuenta,
        tipo_caja: tipoCaja,
        importe_abonado: importeAbonadoCrear,
        cheque_perteneciente_a: formaPago === 'Cheque' ? chequeEmisor : undefined,
      };

      const crearResp = await fetch('https://quimex.sistemataup.online/ordenes_compra/crear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': user.role,
          'X-User-Name': user.usuario || user.name,
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(crearPayload),
      });
      const crearData = await crearResp.json().catch(() => ({}));
      if (!crearResp.ok) throw new Error(crearData?.error || crearData?.mensaje || 'Error creando OC');
      const nuevaOCId = crearData?.orden?.id || crearData?.id || crearData?.orden_id;
      if (!nuevaOCId) throw new Error('No se pudo obtener ID de la OC creada.');
      const estadoCreado = crearData?.orden?.estado || crearData?.estado || 'Solicitado';

      // 2) Obtener OC para id_linea
      const obtenerResp = await fetch(`https://quimex.sistemataup.online/ordenes_compra/obtener/${nuevaOCId}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      const obtenerData = await obtenerResp.json();
      const itemPrincipal = Array.isArray(obtenerData.items) ? obtenerData.items[0] : null;
      const id_linea = itemPrincipal?.id_linea ? Number(itemPrincipal.id_linea) : 0;
      const cantidad_solicitada = itemPrincipal?.cantidad_solicitada ? Number(itemPrincipal.cantidad_solicitada) : Number(cantidad);
      const precio_unitario_estimado = itemPrincipal?.precio_unitario_estimado ? Number(itemPrincipal.precio_unitario_estimado) : parseFloat(precioUnitario) || 0;
      const importe_total_estimado = parseFloat(importeTotal) || (cantidad_solicitada * precio_unitario_estimado);

      // 3) Aprobar OC automáticamente (solo si está en estado 'Solicitado')
      if (estadoCreado !== 'Solicitado') {
        alert('Orden creada exitosamente. Estado: ' + estadoCreado);
        router.push('/recepciones-pendientes');
        return;
      }

      // Si no es ADMIN, no intentar aprobar
      if (String(user.role).toUpperCase() !== 'ADMIN') {
        alert('Orden creada en estado Solicitado. Se requiere rol ADMIN para aprobar.');
        router.push('/recepciones-pendientes');
        return;
      }

      const totalCalculado = parseFloat(importeTotal) || (cantidad_solicitada * precio_unitario_estimado);
      const importe_abonado = pagoCompleto ? totalCalculado : (parseFloat(importeAbonado) || 0);
      const deuda_restante = Math.max(0, totalCalculado - importe_abonado);
      // Incluir detalles de cheque en observaciones si corresponde
      const observacionesPago = pagoCompleto ? 'Pago completo' : `Pago parcial: abonado=${importe_abonado.toFixed(2)}, deuda restante=${deuda_restante.toFixed(2)}`;
      const observacionesCheque = formaPago === 'Cheque'
        ? ` | Cheque: Emisor=${chequeEmisor}; Banco=${chequeBanco}; N°=${chequeNumero}; Fecha=${chequeFecha}`
        : '';
      const observacionesFinal = `${observaciones || ''}${observaciones ? ' | ' : ''}${observacionesPago}${observacionesCheque}`.trim();

      const aprobarPayload = {
        proveedor_id: Number(proveedorId),
        cuenta,
        iibb: showIibb ? iibb : '',
        iva: showIva ? iva : '',
        tc: showTc ? tc : '',
        ajuste_tc: showTc ? true : false,
        observaciones_solicitud: observacionesFinal,
        tipo_caja: tipoCaja,
        forma_pago: formaPago,
        items: [{ id_linea, cantidad_solicitada, precio_unitario_estimado }],
        importe_total_estimado,
        // Campo opcional para lógica de deuda (si el backend lo soporta)
        importe_abonado,
        cheque_perteneciente_a: formaPago === 'Cheque' ? chequeEmisor : undefined,
      };

      const aprobarResp = await fetch(`https://quimex.sistemataup.online/ordenes_compra/aprobar/${nuevaOCId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': user.role,
          'X-User-Name': user.usuario || user.name,
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(aprobarPayload),
      });
      const aprobarData = await aprobarResp.json().catch(() => ({}));
      if (!aprobarResp.ok) throw new Error(aprobarData?.error || aprobarData?.mensaje || 'Error aprobando OC');

      alert('Pedido Rápido creado y aprobado correctamente.');
      router.push('/recepciones-pendientes');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al crear Pedido Rápido');
    }
  };

  const baseInput = "w-full px-3 py-2 rounded bg-white text-black border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const label = "block text-sm font-medium mb-1 text-white";

  return (
    <div className="min-h-screen flex flex-col items-center bg-[#20119d] px-4 py-10">
      <h1 className="text-white text-3xl font-bold mb-8 text-center">Pedido Rápido (Admin)</h1>
      {error && (
        <div className="w-full max-w-4xl mb-4 bg-red-100 border-red-400 text-red-700 px-4 py-3 rounded" role="alert">{error}</div>
      )}
      <form onSubmit={handleSubmit} className="w-full max-w-5xl bg-white/20 rounded-lg p-6 shadow flex flex-col gap-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          <div>
            <label htmlFor="proveedorId" className={label}>Proveedor</label>
            <select id="proveedorId" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} className={baseInput} disabled={proveedoresLoading}>
              <option value="" disabled>{proveedoresLoading ? "Cargando..." : "Seleccionar Proveedor"}</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="productoId" className={label}>Producto</label>
            <select id="productoId" value={productoId} onChange={(e) => setProductoId(e.target.value)} className={baseInput}>
              <option value="0">Seleccionar Producto</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            {/* Campo de Código Interno removido del formulario; se autocompleta según el producto seleccionado */}
          </div>
          <div>
            <label htmlFor="cantidad" className={label}>Cantidad</label>
            <input id="cantidad" type="number" min={0} value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={baseInput} placeholder="Ej: 10" />
          </div>
          <div>
            <label htmlFor="unidadMedida" className={label}>Unidad de Medida</label>
            <select id="unidadMedida" value={unidadMedida} onChange={(e) => setUnidadMedida(e.target.value)} className={baseInput}>
              <option value="">Seleccionar</option>
              <option value="Litros">Litros</option>
              <option value="Kilos">Kilos</option>
              <option value="Unidades">Unidades</option>
            </select>
          </div>
          <div>
            <label htmlFor="precioUnitario" className={label}>Precio Unitario</label>
            <input id="precioUnitario" type="number" step="0.01" min={0} value={precioUnitario} onChange={(e) => setPrecioUnitario(e.target.value)} className={baseInput} placeholder="Ej: 100.00" />
          </div>
          <div>
            <label className={label}>Cuenta</label>
            <input type="text" value={cuenta} onChange={(e) => setCuenta(e.target.value)} className={baseInput} placeholder="Ej: 411001" />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <label className="text-white text-sm font-medium">IIBB</label>
            <input type="checkbox" checked={showIibb} onChange={() => setShowIibb(!showIibb)} className="accent-blue-600 w-4 h-4" />
            {showIibb && (
              <input type="number" step="0.01" value={iibb} onChange={(e) => setIibb(e.target.value)} className={baseInput + ' ml-2 w-24'} placeholder="Ej: 3.5" />
            )}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <label className="text-white text-sm font-medium">IVA</label>
            <input type="checkbox" checked={showIva} onChange={() => setShowIva(!showIva)} className="accent-blue-600 w-4 h-4" />
            {showIva && (
              <input type="number" step="0.01" value={iva} onChange={(e) => setIva(e.target.value)} className={baseInput + ' ml-2 w-24'} placeholder="Ej: 21" />
            )}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <label className="text-white text-sm font-medium">TC</label>
            <input type="checkbox" checked={showTc} onChange={() => setShowTc(!showTc)} className="accent-blue-600 w-4 h-4" />
            {showTc && (
              <input type="number" step="0.01" value={tc} onChange={(e) => setTc(e.target.value)} className={baseInput + ' ml-2 w-24'} placeholder="Ej: 900.00" />
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 items-end">
          <div>
            <label className={label}>Observaciones</label>
            <input type="text" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className={baseInput} placeholder="Opcional" />
          </div>
          <div>
            <label className={label}>Tipo de Caja</label>
            <input type="text" value={tipoCaja} onChange={(e) => setTipoCaja(e.target.value)} className={baseInput} placeholder="caja diaria" />
          </div>
          <div>
            <label className={label}>Forma de Pago</label>
            <select
              value={formaPago}
              onChange={(e) => {
                const v = e.target.value;
                setFormaPago(v);
                if (v === 'Cheque') {
                  setChequeModalOpen(true);
                }
              }}
              className={baseInput}
            >
              {['Efectivo','Cheque','Transferencia','Cuenta Corriente'].map(fp => (
                <option key={fp} value={fp}>{fp}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Pago completo y monto abonado */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 items-end">
          <div>
            <label className={label}>Pago completo</label>
            <div className="flex items-center gap-3 bg-white/10 rounded p-3">
              <input
                id="pagoCompleto"
                type="checkbox"
                checked={pagoCompleto}
                onChange={() => setPagoCompleto(!pagoCompleto)}
                className="accent-green-500 w-5 h-5"
              />
              <label htmlFor="pagoCompleto" className="text-white text-sm">Marcar si se abona el total</label>
            </div>
          </div>
          <div className="md:col-span-2">
            {!pagoCompleto && (
              <div>
                <label htmlFor="importeAbonado" className={label}>Importe abonado</label>
                <input
                  id="importeAbonado"
                  type="number"
                  step="0.01"
                  min={0}
                  value={importeAbonado}
                  onChange={(e) => setImporteAbonado(e.target.value)}
                  className={`${baseInput} ${pagoError ? 'border-red-500 focus:ring-red-500' : ''}`}
                  placeholder="Ej: 100.00"
                  aria-invalid={pagoError ? 'true' : undefined}
                  aria-describedby={pagoError ? 'pagoError' : undefined}
                />
                {pagoError && (
                  <p id="pagoError" className="mt-1 text-sm text-red-600" role="alert">{pagoError}</p>
                )}
                <p className="text-white/80 text-xs mt-1">Si no es completo, registre el monto abonado y se calculará la deuda restante automáticamente.</p>
              </div>
            )}
          </div>
        </div>

        {/* Total destacado (ARS y USD si hay TC) */}
        <div className="bg-white rounded-xl p-6 shadow-lg flex flex-col items-center justify-center">
          <span className="text-gray-700 text-sm font-medium">Total Estimado</span>
          <div className="mt-2 flex flex-col md:flex-row items-center gap-6">
            <div className="text-center">
              <div className="text-xs text-gray-500">ARS</div>
              <div className="text-[42px] md:text-[56px] font-extrabold tracking-tight text-[#20119d]">
                $ {importeTotal}
              </div>
            </div>
            {importeTotalUsd && (
              <div className="text-center">
                <div className="text-xs text-gray-500">USD</div>
                <div className="text-[42px] md:text-[56px] font-extrabold tracking-tight text-[#20119d]">
                  U$D {importeTotalUsd}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Cheque */}
        {chequeModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
              <h2 className="text-xl font-semibold mb-4">Datos del Cheque</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Emisor</label>
                  <input className={baseInput} value={chequeEmisor} onChange={(e) => setChequeEmisor(e.target.value)} placeholder="Nombre del emisor" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Banco</label>
                  <input className={baseInput} value={chequeBanco} onChange={(e) => setChequeBanco(e.target.value)} placeholder="Banco" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Número</label>
                  <input className={baseInput} value={chequeNumero} onChange={(e) => setChequeNumero(e.target.value)} placeholder="N° de cheque" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Fecha</label>
                  <input type="date" className={baseInput} value={chequeFecha} onChange={(e) => setChequeFecha(e.target.value)} />
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-3">
                <button type="button" className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300" onClick={() => { setChequeModalOpen(false); setFormaPago('Efectivo'); }}>
                  Cancelar
                </button>
                <button type="button" className="px-4 py-2 bg-[#20119d] text-white rounded hover:bg-[#2c239d]" onClick={() => setChequeModalOpen(false)}>
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3 justify-center">
          <button type="submit" className="px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700">Crear y Aprobar</button>
          <button type="button" className="px-6 py-3 bg-gray-200 rounded-lg font-semibold hover:bg-gray-300" onClick={() => router.push('/compras')}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}
