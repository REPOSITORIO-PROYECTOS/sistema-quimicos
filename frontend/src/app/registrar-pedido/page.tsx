"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { SingleValue } from 'react-select';
import { useProductsContextActivos, Producto as ProductoContextType } from "@/context/ProductsContextActivos";
import { useClientesContext, Cliente } from "@/context/ClientesContext";
import Select from 'react-select';
import AsyncSelect from 'react-select/async';
import { useRouter } from 'next/navigation';
import BotonVolver from "@/components/BotonVolver";
import Ticket, { VentaData } from '@/components/Ticket';
import { ProductoVenta, FormDataVenta } from '@/types/ventas';

interface TotalCalculadoAPI {
  monto_base: number;
  forma_pago_aplicada: string;
  requiere_factura_aplicada: boolean;
  recargos: {
    transferencia: number;
    factura_iva: number;
  };
  monto_final_con_recargos: number;            // Total después de recargos (sin descuento global si backend decide separar)
  monto_final_con_descuento?: number;          // Total final tras descuento global (si el backend lo provee)
  tipo_redondeo_aplicado?: string;             // Info de trazabilidad opcional
}
const initialFormData: FormDataVenta = {
  clienteId: null, cuit: "", nombre: "", direccion: "",
  localidad: "",
  fechaEmision: "", fechaEntrega: "", formaPago: "efectivo",
  montoPagado: 0, descuentoTotal: 0, vuelto: 0,
  requiereFactura: false, observaciones: "",
  vendedor: 'pedidos', // Forzado: siempre 'pedidos'
};
const initialProductos: ProductoVenta[] = [{ producto: 0, qx: 0, precio: 0, descuento: 0, total: 0, observacion: "" }];
// Eliminado selector de vendedores: flujo registrar pedido siempre usa 'pedidos'

export default function RegistrarPedidoPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<FormDataVenta>({ ...initialFormData });
  const [productos, setProductos] = useState<ProductoVenta[]>(initialProductos);
  const [lastVentaId, setLastVentaId] = useState<number | undefined>();
  const irAccionesPedidos = () => router.push('/acciones');
  const [totalCalculadoApi, setTotalCalculadoApi] = useState<TotalCalculadoAPI | null>(null);
  const [isCalculatingTotal, setIsCalculatingTotal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const productosContext = useProductsContextActivos();

  const opcionesDeProductoParaSelect = useMemo(() =>
    productosContext?.productos.map((prod: ProductoContextType) => ({
      value: prod.id,
      label: prod.nombre,
    })) || [],
    [productosContext?.productos]);

  // Clientes desde el contexto (para estados generales)
  const { loading: loadingClientes, error: errorClientes } = useClientesContext();

  // Función para búsqueda remota usada por AsyncSelect
  const fetchClientesRemoto = async (inputValue: string): Promise<{ value: Cliente; label: string }[]> => {
    if (!inputValue || inputValue.trim().length === 0) return [];
    const token = localStorage.getItem("token");
    const url = `https://quimex.sistemataup.online/clientes/buscar_todos?search_term=${encodeURIComponent(inputValue)}`;
    const response = await fetch(url, { headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` } });
    if (!response.ok) return [];
    const data = await response.json();
    return (data.clientes || []).map((cli: Cliente) => ({
      value: cli,
      label: `${cli.nombre_razon_social || `ID: ${cli.id}`}${cli.cuit ? ` (${cli.cuit})` : ''}`
    }));
  };


  const resetearFormulario = useCallback(() => {
    const now = new Date();
    const fechaLocalAjustada = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
    const fechaEmisionEstandar = fechaLocalAjustada.toISOString().slice(0, 16); // <-- CORRECTO

    setFormData({ ...initialFormData, fechaEmision: fechaEmisionEstandar, vendedor: 'pedidos' });
    setProductos([{ ...initialProductos[0] }]);
    setTotalCalculadoApi(null);
    setSuccessMessage('');
    setErrorMessage('');
  }, []);

  useEffect(() => { resetearFormulario(); }, [resetearFormulario]);

  const montoBaseProductos = useMemo(() => {
    return productos.reduce((sum, item) => sum + (item.total || 0), 0);
  }, [productos]);

  // Total mostrado: confiar en el backend; si entrega monto_final_con_descuento usarlo; si no, usar monto_final_con_recargos
  const displayTotal = useMemo(() => {
    if (totalCalculadoApi) {
      if (typeof totalCalculadoApi.monto_final_con_descuento === 'number') {
        return totalCalculadoApi.monto_final_con_descuento;
      }
      return totalCalculadoApi.monto_final_con_recargos;
    }
    // Fallback: suma local (sin aplicar descuento global ni redondeos, ya que eso lo hace el backend cuando responde)
    return montoBaseProductos;
  }, [totalCalculadoApi, montoBaseProductos]);

  useEffect(() => {
    const recalcularTodo = async () => {
      if (montoBaseProductos <= 0 && formData.descuentoTotal <= 0) {
        setTotalCalculadoApi(null);
        return;
      }
      setIsCalculatingTotal(true);
      const token = localStorage.getItem("token");
      if (!token) {
        setErrorMessage("No autenticado.");
        setIsCalculatingTotal(false);
        return;
      }
      try {
        // Log de payload para debug de descuento en RegistrarPedidoPage
        console.log('RegistrarPedidoPage - payload calcular_total:', { monto_base: montoBaseProductos, forma_pago: formData.formaPago, requiere_factura: formData.requiereFactura, descuento_total_global_porcentaje: formData.descuentoTotal });
        const resTotal = await fetch("https://quimex.sistemataup.online/ventas/calcular_total", {
          method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ monto_base: montoBaseProductos, forma_pago: formData.formaPago, requiere_factura: formData.requiereFactura, descuento_total_global_porcentaje: formData.descuentoTotal }),
        });
        console.log('RegistrarPedidoPage - respuesta calcular_total:', resTotal);
        const dataTotal = await resTotal.json();
        if (!resTotal.ok) throw new Error(dataTotal.error || `Error ${resTotal.status}`);
        setTotalCalculadoApi(dataTotal);
      } catch (error) {
        if (error instanceof Error) setErrorMessage(error.message);
        else setErrorMessage("Ocurrió un error desconocido al recalcular.");
        setTotalCalculadoApi(null);
      } finally {
        setIsCalculatingTotal(false);
      }
    };
    recalcularTodo();
  }, [montoBaseProductos, formData.formaPago, formData.requiereFactura, formData.descuentoTotal]);

  useEffect(() => {
    if (formData.formaPago !== 'efectivo') {
      setFormData(prev => ({ ...prev, montoPagado: 0, vuelto: 0 }));
    } else {
      if (formData.montoPagado >= displayTotal) {
        const nuevoVuelto = formData.montoPagado - displayTotal;
        setFormData(prev => ({ ...prev, vuelto: parseFloat(nuevoVuelto.toFixed(2)) }));
      } else {
        setFormData(prev => ({ ...prev, vuelto: 0 }));
      }
    }
  }, [formData.montoPagado, displayTotal, formData.formaPago]);

  const recalculatePricesForProducts = useCallback(async (currentProducts: ProductoVenta[], clienteId: number | null) => {
    const token = localStorage.getItem("token");
    if (!token) {
      setErrorMessage("No autenticado.");
      return;
    }

    const productQuantities = new Map<number, { totalQuantity: number; indices: number[] }>();
    currentProducts.forEach((p, index) => {
      if (p.producto > 0) {
        const existing = productQuantities.get(p.producto) || { totalQuantity: 0, indices: [] };
        existing.totalQuantity += p.qx;
        existing.indices.push(index);
        productQuantities.set(p.producto, existing);
      }
    });

    const pricePromises = Array.from(productQuantities.entries()).map(async ([productoId, { totalQuantity, indices }]) => {
      if (totalQuantity <= 0) {
        // Devolvemos todos los campos esperados
        return { precioUnitario: 0, precioTotalCalculado: 0, indices };
      }
      try {
        const precioRes = await fetch(`https://quimex.sistemataup.online/productos/calcular_precio/${productoId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({
            producto_id: productoId,
            quantity: totalQuantity,
            cliente_id: clienteId
          }),
        });
        if (!precioRes.ok) {
          const errorData = await precioRes.json().catch(() => ({ message: 'API de precios falló' }));
          throw new Error(errorData.message);
        }
        const precioData = await precioRes.json();
        // --- CAPTURAMOS AMBOS VALORES DE LA API ---
        return {
          precioUnitario: precioData.precio_venta_unitario_ars || 0,
          precioTotalCalculado: precioData.precio_total_calculado_ars || 0,
          indices
        };
      } catch (error) {
        if (error instanceof Error) {
          setErrorMessage(prev => `${prev}\nError al calcular precio para Prod ID ${productoId}: ${error.message}`);
        }
        return { precioUnitario: 0, precioTotalCalculado: 0, indices };
      }
    });

    const priceResults = await Promise.all(pricePromises);
    const newProducts = [...currentProducts];

    priceResults.forEach(({ precioUnitario, precioTotalCalculado, indices }) => {
      const totalQuantityForProduct = indices.reduce((sum, index) => sum + (newProducts[index].qx || 0), 0);
      indices.forEach(index => {
        const item = newProducts[index];
        if (!item) return;
        item.precio = precioUnitario;
        const totalBrutoDistribuido = totalQuantityForProduct > 0 ? (precioTotalCalculado / totalQuantityForProduct) * item.qx : 0;
        // Aplicar solo descuento de ítem (sin redondeos locales) para estimar la base; backend hará redondeo global
        const subtotalConDescuento = totalBrutoDistribuido * (1 - (item.descuento / 100));
        item.total = subtotalConDescuento; // Mantener decimales; presentación formateada afuera
      });
    });

    // 5. Actualizar el estado del componente con los precios correctos.
    setProductos(newProducts);

  }, [setErrorMessage]); // Las dependencias son correctas

  const handleProductSelectChange = (index: number, selectedOption: { value: number; label: string } | null) => {
    const nuevosProductos = [...productos];
    nuevosProductos[index].producto = selectedOption?.value || 0;
    nuevosProductos[index].qx = selectedOption ? 0 : 0;
    recalculatePricesForProducts(nuevosProductos, formData.clienteId);
  };

  // Debounce para evitar llamadas excesivas a la API
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);
  const DEBOUNCE_DELAY = 500;

  const handleProductRowInputChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const nuevosProductos = productos.map((item, idx) => {
      if (index !== idx) return item;
      let newValue: string | number = value;
      if (name === 'qx' || name === 'descuento') {
        newValue = value === '' ? 0 : parseFloat(value) || 0;
        if (name === 'descuento') newValue = Math.max(0, Math.min(100, newValue));
      }
      return { ...item, [name]: newValue };
    });
    setProductos(nuevosProductos);
    // Solo llamar a la API si cambia cantidad o descuento
    if (name === 'qx' || name === 'descuento' || name === 'producto') {
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
      debounceTimeout.current = setTimeout(() => {
        recalculatePricesForProducts(nuevosProductos, formData.clienteId);
      }, DEBOUNCE_DELAY);
    }
  };

  const agregarProducto = () => setProductos([...productos, { ...initialProductos[0] }]);
  const eliminarProducto = (index: number) => {
    const nuevosProductos = productos.filter((_, i) => i !== index);
    recalculatePricesForProducts(nuevosProductos.length > 0 ? nuevosProductos : [{ ...initialProductos[0] }], formData.clienteId);
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let val: string | number | boolean = value;
    if (type === 'checkbox') { val = (e.target as HTMLInputElement).checked; }
    else if (type === 'number') {
      val = value === '' ? 0 : parseFloat(value);
      if (name === 'descuentoTotal') val = Math.max(0, Math.min(100, val));
    }
    if (name === 'vendedor') return; // Ignorar intentos de cambio de vendedor
    setFormData(prev => ({ ...prev, [name]: val, ...(name === 'formaPago' && { requiereFactura: val === 'factura' }) }));
  };
  const handleClienteSelectChange = (selectedOption: SingleValue<unknown>) => {
    const opt = selectedOption as { value?: Cliente } | null | undefined;
    const selectedCliente = opt && opt.value ? opt.value : null;
    setFormData(prev => ({
      ...prev,
      clienteId: selectedCliente ? selectedCliente.id : null,
      nombre: selectedCliente?.nombre_razon_social || "",
      direccion: selectedCliente?.direccion || "",
      localidad: selectedCliente?.localidad || "",
    }));
    // Recalcular precios con el nuevo cliente para aplicar precios especiales
    if (productos.some(p => p.producto > 0 && p.qx > 0)) {
      recalculatePricesForProducts(productos, selectedCliente?.id || null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage('');
    setErrorMessage('');

    if (!formData.clienteId) { setErrorMessage("Seleccione un cliente."); return; }
    if (productos.every(p => p.producto === 0 || p.qx === 0)) { setErrorMessage("Añada al menos un producto."); return; }

    setIsSubmitting(true);
    const token = localStorage.getItem("token");
    const usuarioId = localStorage.getItem("usuario_id");
    if (!token || !usuarioId) { setErrorMessage("Sesión inválida."); setIsSubmitting(false); return; }
    const montoFinalCalculado = displayTotal;

    // --- FIN DE LA CORRECCIÓN ---

    const dataPayload = {
      usuario_interno_id: parseInt(usuarioId),
      items: productos.filter(item => item.producto > 0 && item.qx > 0).map(item => ({
        producto_id: item.producto,
        cantidad: item.qx,
        precio_unitario_venta_ars: item.precio || 0,
        precio_total_item_ars: item.total || 0,
        descuento_item_porcentaje: item.descuento || 0,
        observacion_item: item.observacion || ""
      })),
      cliente_id: formData.clienteId ? parseInt(String(formData.clienteId)) : null,
      fecha_pedido: formData.fechaEntrega ? new Date(formData.fechaEntrega).toISOString() : formData.fechaEmision,
      direccion_entrega: formData.direccion,
      localidad: formData.localidad,
      nombre_vendedor: 'pedidos',
      monto_pagado_cliente: formData.montoPagado,
      forma_pago: formData.formaPago,
      vuelto: formData.vuelto,
      requiere_factura: formData.requiereFactura,
      monto_total_base: montoBaseProductos,
      monto_final_con_recargos: montoFinalCalculado,
      observaciones: formData.observaciones || "",
      descuento_total_global_porcentaje: formData.descuentoTotal,
    };

    try {
      const response = await fetch("https://quimex.sistemataup.online/ventas/registrar", {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(dataPayload),
      });
      const result = await response.json();
      if (response.ok) {
        setSuccessMessage(`¡Pedido registrado exitosamente!`);
        if (result.venta_id) {
          setLastVentaId(result.venta_id);
          setTimeout(() => handleImprimirPresupuesto(result.venta_id), 100);
        }
        setTimeout(() => { irAccionesPedidos(); }, 2000);
      } else {
        setErrorMessage(result.message || result.error || `Error ${response.status}`);
      }
    } catch (err) {
      if (err instanceof Error) setErrorMessage(err.message);
      else setErrorMessage("Error de red o desconocido al registrar.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImprimirPresupuesto = (pedidoIdParaImprimir: number) => {
    const originalTitle = document.title;
    const nombreCliente = formData.nombre || "Cliente";
    document.title = `Pedido QuiMex - N° ${pedidoIdParaImprimir} - ${nombreCliente}`;
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000); // 1 segundo es un tiempo seguro para que la operación de impresión se complete
  };


  if (loadingClientes) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-indigo-900">
        <p className="text-white text-xl">Cargando Clientes...</p>
      </div>
    );
  }

  if (errorClientes) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-red-900 text-white p-4">
        <h2 className="text-2xl font-bold mb-4">Error al Cargar Clentes</h2>
        <p className="bg-red-700 p-2 rounded mb-4 text-sm">{errorClientes}</p>
        <button
          onClick={() => window.location.reload()}
          className="bg-white text-red-900 px-4 py-2 rounded hover:bg-gray-200"
        >
          Reintentar
        </button>
      </div>
    );
  }
  const baseTotalConRecargos = totalCalculadoApi ? totalCalculadoApi.monto_final_con_recargos : montoBaseProductos;
  const getNumericInputValue = (value: number) => value === 0 ? '' : String(value);

  const ventaDataParaTicket: VentaData = {
    venta_id: lastVentaId,
    fecha_emision: formData.fechaEmision,
    cliente: {
      nombre: formData.nombre,
      direccion: formData.direccion,
      localidad: formData.localidad
    },
    nombre_vendedor: formData.vendedor || 'pedidos',
    items: (() => {
      const itemsFiltrados = productos.filter(p => p.producto && p.qx > 0);
      // Usar totales sin redondear
      const totalesOriginales = itemsFiltrados.map(item => item.total || 0);
      const sumaTotales = totalesOriginales.reduce((sum, val) => sum + val, 0);
      // Recargo total desde la API
      const recargoTotal = (totalCalculadoApi?.recargos.transferencia || 0) + (totalCalculadoApi?.recargos.factura_iva || 0);
      const adjustedItems = itemsFiltrados.map((item, idx) => {
        const pInfo = productosContext?.productos.find(p => p.id === item.producto);
        const totalOriginal = totalesOriginales[idx];
        // Proporción del recargo para este ítem
        const proporcion = sumaTotales > 0 ? totalOriginal / sumaTotales : 0;
        const recargoItem = recargoTotal * proporcion;
        // Total final del ítem con recargo distribuido
        const totalFinalItem = totalOriginal + recargoItem;
        return {
          producto_id: item.producto,
          producto_nombre: pInfo?.nombre || `ID: ${item.producto}`,
          cantidad: item.qx,
          precio_total_item_ars: Math.round(totalFinalItem * 100) / 100, // round to 2 decimals
          observacion_item: item.observacion || ""
        };
      });
      // Make the sum exact to displayTotal
      const sumAdjusted = adjustedItems.reduce((sum, item) => sum + item.precio_total_item_ars, 0);
      const difference = Math.round((displayTotal - sumAdjusted) * 100) / 100;
      if (adjustedItems.length > 0 && Math.abs(difference) > 0.01) {
        adjustedItems[adjustedItems.length - 1].precio_total_item_ars += difference;
        adjustedItems[adjustedItems.length - 1].precio_total_item_ars = Math.round(adjustedItems[adjustedItems.length - 1].precio_total_item_ars * 100) / 100;
      }
      return adjustedItems;
    })(),
    total_final: displayTotal,
    observaciones: formData.observaciones,
    forma_pago: formData.formaPago,
    monto_pagado_cliente: formData.montoPagado,
    vuelto_calculado: formData.vuelto,
    descuento_total_global_porcentaje: formData.descuentoTotal || 0,
  };

  return (
    <>
      <div className="flex items-center justify-center min-h-screen bg-indigo-900 py-10 px-4 print:hidden">
        <div className="bg-white p-6 md:p-8 rounded-lg shadow-md w-full max-w-5xl">
          <BotonVolver onClick={irAccionesPedidos} />
          <h2 className="text-3xl font-bold text-center text-indigo-800 mb-4">Registrar Pedido</h2>
          {errorMessage && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" onClick={() => setErrorMessage('')}><p>{errorMessage}</p></div>}
          {successMessage && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4"><p>{successMessage}</p></div>}
          <form onSubmit={handleSubmit} className="space-y-6">
            <fieldset className="border p-4 rounded-md">
              <legend className="text-lg font-medium text-gray-700 px-2">Datos Cliente/Pedido</legend>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="clienteId">Cliente*</label>
                  <AsyncSelect
                    id="clienteId"
                    name="clienteId"
                    loadOptions={fetchClientesRemoto}
                    defaultOptions={[]}
                    value={formData.clienteId ? {
                      value: { id: formData.clienteId, nombre_razon_social: formData.nombre },
                      label: formData.nombre || `ID: ${formData.clienteId}`
                    } : null}
                    onChange={handleClienteSelectChange}
                    placeholder="Buscar cliente por nombre o CUIT..."
                    isClearable
                    isSearchable
                    noOptionsMessage={() => "No se encontraron clientes"}
                    className="text-sm react-select-container"
                    classNamePrefix="react-select"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="direccion">Dirección</label>
                  <input type="text" name="direccion" id="direccion" value={formData.direccion} onChange={handleFormChange} className="shadow-sm border rounded w-full py-2 px-3 text-gray-700" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="fechaEmision">Fecha Emisión*</label>
                  <input type="datetime-local" name="fechaEmision" id="fechaEmision" disabled value={formData.fechaEmision} className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 bg-gray-100" />
                </div>
                {/* Vendedor fijo: 'pedidos' (se elimina el selector) */}
                <input type="hidden" name="vendedor" value="pedidos" />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="fechaEntrega">Fecha Entrega</label>
                  <input type="datetime-local" name="fechaEntrega" id="fechaEntrega" value={formData.fechaEntrega} onChange={handleFormChange} className="shadow-sm border rounded w-full py-2 px-3 text-gray-700" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="observaciones">Observaciones</label>
                  <textarea id="observaciones" name="observaciones" value={formData.observaciones || ''} onChange={handleFormChange} rows={1} className="shadow-sm border rounded w-full py-2 px-3 text-gray-700" />
                </div>
              </div>
            </fieldset>
            <fieldset className="border p-4 rounded-md">
              <legend className="text-lg font-medium text-gray-700 px-2">Productos</legend>
              <div className="mb-2 hidden md:grid md:grid-cols-[1fr_80px_80px_1fr_100px_100px_40px] items-center gap-2 font-semibold text-sm text-gray-600 px-2">
                <span>Producto</span><span className="text-center">Cant.</span><span className="text-center">Desc.%</span><span>Observación</span><span className="text-right">P.Unit</span><span className="text-right">Total</span><span></span>
              </div>
              <div className="space-y-3">
                {productos.map((item, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-[1fr_80px_80px_1fr_100px_100px_40px] items-center gap-2 border-b pb-2 last:border-b-0">
                    <Select options={opcionesDeProductoParaSelect} value={opcionesDeProductoParaSelect.find(opt => opt.value === item.producto) || null} onChange={(opt) => handleProductSelectChange(index, opt)} className="text-sm react-select-container" classNamePrefix="react-select" />
                    <input type="number" name="qx" value={item.qx === 0 ? '' : item.qx} onChange={(e) => handleProductRowInputChange(index, e)} className="shadow-sm border rounded w-full py-2 px-2 text-gray-700 text-center no-spinners" onWheel={(e) => (e.target as HTMLInputElement).blur()} />
                    <input type="number" name="descuento" value={item.descuento === 0 ? '' : item.descuento} onChange={(e) => handleProductRowInputChange(index, e)} className="shadow-sm border rounded w-full py-2 px-2 text-gray-700 text-center no-spinners" onWheel={(e) => (e.target as HTMLInputElement).blur()} />
                    <input type="text" name="observacion" value={item.observacion || ''} onChange={(e) => handleProductRowInputChange(index, e)} className="shadow-sm border rounded w-full py-2 px-2 text-gray-700 text-sm" />
                    <input type="text" readOnly value={`$ ${(item.precio || 0).toFixed(2)}`} className="shadow-sm border rounded w-full py-2 px-2 text-gray-700 text-sm text-right bg-gray-100" />
                    <input type="text" readOnly value={`$ ${(item.total || 0).toFixed(2)}`} className="shadow-sm border rounded w-full py-2 px-2 text-gray-700 text-sm text-right bg-gray-100" />
                    <button type="button" onClick={() => eliminarProducto(index)} className="text-red-500 hover:text-red-700 font-bold text-xl">×</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={agregarProducto} className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 text-sm">+ Agregar Producto</button>
            </fieldset>

            <fieldset className="border p-4 rounded-md">
              <legend className="text-lg font-medium text-gray-700 px-2">Pago y Totales</legend>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Forma de Pago</label><select name="formaPago" value={formData.formaPago} onChange={handleFormChange} className="w-full shadow-sm border rounded py-2 px-3 text-gray-700"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="factura">Factura</option></select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Descuento Total (%)</label><input type="number" name="descuentoTotal" className="w-full bg-white shadow-sm border rounded py-2 px-3 text-gray-700 no-spinners" value={getNumericInputValue(formData.descuentoTotal)} onChange={handleFormChange} placeholder="0" step="1" min="0" max="100" /></div>
                {/* CAMBIO: Lógica condicional para Monto Pagado y Vuelto */}
                {formData.formaPago === 'efectivo' && (
                  <>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Monto Pagado</label><input type="number" name="montoPagado" className="w-full bg-white shadow-sm border rounded py-2 px-3 text-gray-700 no-spinners" value={getNumericInputValue(formData.montoPagado)} onChange={handleFormChange} placeholder="0.00" step="0.01" min="0" /></div>
                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Vuelto</label><input type="text" name="vuelto" readOnly className="w-full bg-gray-100 shadow-sm border rounded py-2 px-3 text-gray-700 text-right" value={`$ ${formData.vuelto.toFixed(2)}`} /></div>
                  </>
                )}
              </div>
              <div className="mt-4 text-right">
                {isCalculatingTotal && <p className="text-sm text-blue-600 italic">Calculando...</p>}
                {totalCalculadoApi && (<div className="text-xs text-gray-600 mb-1"><span>Base: ${totalCalculadoApi.monto_base.toFixed(2)}</span>{totalCalculadoApi.recargos.transferencia > 0 && <span className="ml-2">Rec. Transf: ${totalCalculadoApi.recargos.transferencia.toFixed(2)}</span>}{totalCalculadoApi.recargos.factura_iva > 0 && <span className="ml-2">IVA: ${totalCalculadoApi.recargos.factura_iva.toFixed(2)}</span>}{formData.descuentoTotal > 0 && (<span className="ml-2 text-red-600">Desc. Total ({formData.descuentoTotal}%): -$ {(baseTotalConRecargos * (formData.descuentoTotal / 100)).toFixed(2)}</span>)}</div>)}
                <label className="block text-sm font-medium text-gray-500 mb-1">Total Pedido</label>
                <input type="text" value={`$ ${displayTotal.toFixed(2)}`} readOnly className="w-full md:w-auto md:max-w-xs inline-block bg-gray-100 shadow-sm border rounded py-2 px-3 text-gray-900 text-right font-bold text-lg" />
              </div>
            </fieldset>

            <div className="flex justify-end mt-8">
              <button type="submit" className="bg-green-600 text-white px-8 py-3 rounded-md hover:bg-green-700 font-semibold text-lg disabled:opacity-50" disabled={loadingClientes || isSubmitting || isCalculatingTotal}>
                {isSubmitting ? 'Registrando...' : 'Registrar'}
              </button>
            </div>
          </form>
        </div>
      </div>
      <div id="presupuesto-imprimible" className="hidden print:block">
        <Ticket tipo="comprobante" ventaData={ventaDataParaTicket} />
        <div style={{ pageBreakBefore: 'always' }}></div>
        <Ticket tipo="comprobante" ventaData={ventaDataParaTicket} />
        <div style={{ pageBreakBefore: 'always' }}></div>
        <Ticket tipo="orden_de_trabajo" ventaData={ventaDataParaTicket} />
      </div>
      <style jsx global>{`
        .no-spinners::-webkit-outer-spin-button,
        .no-spinners::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .no-spinners { -moz-appearance: textfield; }
        .react-select__control { border-color: rgb(209 213 219) !important; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05) !important; min-height: 42px !important; }
        .react-select__control--is-focused { border-color: rgb(99 102 241) !important; box-shadow: 0 0 0 1px rgb(99 102 241) !important; }
        .react-select__option { background-color: white; color: #333; }
        .react-select__option--is-focused { background-color: #4f46e5 !important; color: white !important; }
        .react-select__option--is-selected { background-color: #6366f1 !important; color: white !important; }
      `}</style>
    </>
  );
}

// fetchClientesRemoto moved inside component
