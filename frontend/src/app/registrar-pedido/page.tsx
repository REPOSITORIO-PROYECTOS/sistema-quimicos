"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useProductsContextActivos, Producto as ProductoContextType } from "@/context/ProductsContextActivos";
import { useClientesContext, Cliente } from "@/context/ClientesContext";
import Select from 'react-select';
import { useRouter } from 'next/navigation';
import BotonVolver from "@/components/BotonVolver";
import Ticket, { VentaData } from '@/components/Ticket';

// --- Tipos y Constantes ---
type ProductoPedido = {
  producto: number;
  qx: number;
  precio: number;
  descuento: number;
  total: number;
  observacion?: string;
};
interface IFormData {
  clienteId: string | null;
  cuit: string;
  nombre: string;
  direccion: string;
  fechaEmision: string;
  fechaEntrega: string;
  formaPago: string;
  montoPagado: number;
  descuentoTotal: number;
  vuelto: number;
  requiereFactura: boolean;
  observaciones?: string;
}
interface TotalCalculadoAPI {
  monto_base: number;
  forma_pago_aplicada: string;
  requiere_factura_aplicada: boolean;
  recargos: {
    transferencia: number;
    factura_iva: number;
  };
  monto_final_con_recargos: number;
}
const initialFormData: IFormData = {
  clienteId: null, cuit: "", nombre: "", direccion: "",
  fechaEmision: "", fechaEntrega: "", formaPago: "efectivo",
  montoPagado: 0, descuentoTotal: 0, vuelto: 0,
  requiereFactura: false, observaciones: "",
};
const initialProductos: ProductoPedido[] = [{ producto: 0, qx: 0, precio: 0, descuento: 0, total: 0, observacion: "" }];
const VENDEDOR_FIJO = "pedidos";

export default function RegistrarPedidoPage() {
  const { clientes, loading: loadingClientes, error: errorClientes } = useClientesContext();
  const router = useRouter();
  const [formData, setFormData] = useState<IFormData>(initialFormData);
  const [productos, setProductos] = useState<ProductoPedido[]>(initialProductos);
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

const resetearFormulario = useCallback(() => {
    const now = new Date();
    const fechaLocalAjustada = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
    const fechaEmisionEstandar = fechaLocalAjustada.toISOString().slice(0, 16); // <-- CORRECTO
    
    setFormData({ ...initialFormData, fechaEmision: fechaEmisionEstandar });
    setProductos([{ ...initialProductos[0] }]);
    setTotalCalculadoApi(null);
    setSuccessMessage('');
    setErrorMessage('');
}, []);

  useEffect(() => { resetearFormulario(); }, [resetearFormulario]);

  const montoBaseProductos = useMemo(() => {
    return productos.reduce((sum, item) => sum + (item.total || 0), 0);
  }, [productos]);
    
  const displayTotal = useMemo(() => {
    const baseTotalConRecargos = totalCalculadoApi ? totalCalculadoApi.monto_final_con_recargos : montoBaseProductos;
    return Math.max(0, baseTotalConRecargos * (1 - (formData.descuentoTotal || 0) / 100));
  }, [totalCalculadoApi, montoBaseProductos, formData.descuentoTotal]);

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
        const resTotal = await fetch("https://quimex.sistemataup.online/ventas/calcular_total", {
          method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ monto_base: montoBaseProductos, forma_pago: formData.formaPago, requiere_factura: formData.requiereFactura }),
        });
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
  
  const recalculatePricesForProducts = useCallback(async (currentProducts: ProductoPedido[]) => {
    const token = localStorage.getItem("token");
    if (!token) { setErrorMessage("No autenticado."); return; }
    
    const productsToUpdate = currentProducts.map(async (item) => {
        if (item.producto <= 0 || item.qx <= 0) return { ...item, precio: 0, total: 0 };
        try {
            const clienteId = formData.clienteId ? parseInt(formData.clienteId) : null;
            const precioRes = await fetch(`https://quimex.sistemataup.online/productos/calcular_precio/${item.producto}`, {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({ producto_id: item.producto, quantity: item.qx, cliente_id: clienteId }),
            });
            if (!precioRes.ok) throw new Error((await precioRes.json()).message || "Error en API de precios.");
            const precioData = await precioRes.json();
            const totalBruto = precioData.precio_total_calculado_ars || 0;
            return { ...item, precio: precioData.precio_venta_unitario_ars || 0, total: totalBruto * (1 - (item.descuento / 100)) };
        } catch (error) { 
            if (error instanceof Error) setErrorMessage(prev => `${prev}\nError Prod ID ${item.producto}: ${error.message}`);
            return { ...item, precio: 0, total: 0 };
        }
    });
    const newProducts = await Promise.all(productsToUpdate);
    setProductos(newProducts);
  }, [formData.clienteId, setErrorMessage]);
  
  const handleProductSelectChange = (index: number, selectedOption: { value: number; label: string } | null) => {
    const nuevosProductos = [...productos];
    nuevosProductos[index].producto = selectedOption?.value || 0;
    nuevosProductos[index].qx = selectedOption ? 0 : 0;
    recalculatePricesForProducts(nuevosProductos);
  };

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
    recalculatePricesForProducts(nuevosProductos);
  };

  const agregarProducto = () => setProductos([...productos, { ...initialProductos[0] }]);
  const eliminarProducto = (index: number) => {
    const nuevosProductos = productos.filter((_, i) => i !== index);
    recalculatePricesForProducts(nuevosProductos.length > 0 ? nuevosProductos : [{ ...initialProductos[0] }]);
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let val: string | number | boolean = value;
    if (type === 'checkbox') { val = (e.target as HTMLInputElement).checked; } 
    else if (type === 'number') {
      val = value === '' ? 0 : parseFloat(value);
      if (name === 'descuentoTotal') val = Math.max(0, Math.min(100, val));
    }
    setFormData(prev => ({ ...prev, [name]: val, ...(name === 'formaPago' && { requiereFactura: val === 'factura' }) }));
  };
  const handleClienteSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    const selectedCliente = clientes.find(c => String(c.id) === selectedId);
    setFormData(prev => ({
      ...prev, clienteId: selectedId || null,
      nombre: selectedCliente?.nombre_razon_social || "",
      direccion: selectedCliente?.direccion || "",
    }));
  };
  
  const handleSubmit = async (e: React.FormEvent ) => {
    e.preventDefault();
    setSuccessMessage('');
    setErrorMessage('');

    if (!formData.clienteId) { setErrorMessage("Seleccione un cliente."); return; }
    if (productos.every(p => p.producto === 0 || p.qx === 0)) { setErrorMessage("Añada al menos un producto."); return; }
    
    // --- INICIO DE LA VALIDACIÓN CRÍTICA ---
    if (formData.formaPago === 'efectivo' && formData.montoPagado < displayTotal) {
        setErrorMessage(`El monto pagado (${formatCurrency(formData.montoPagado)}) no puede ser menor al total del pedido (${formatCurrency(displayTotal)}).`);
        return;
    }
    // --- FIN DE LA VALIDACIÓN CRÍTICA ---

    setIsSubmitting(true);
    const token = localStorage.getItem("token");
    const usuarioId = localStorage.getItem("usuario_id");
    if (!token || !usuarioId) { setErrorMessage("Sesión inválida."); setIsSubmitting(false); return; }

    const dataPayload = {
      usuario_interno_id: parseInt(usuarioId),
      items: productos.filter(item => item.producto > 0 && item.qx > 0).map(item => ({
        producto_id: item.producto, cantidad: item.qx,
        observacion_item: item.observacion || "", descuento_item_porcentaje: item.descuento,
      })),
      cliente_id: formData.clienteId ? parseInt(formData.clienteId) : null, 
      fecha_pedido: formData.fechaEmision, 
      direccion_entrega: formData.direccion,
      nombre_vendedor: VENDEDOR_FIJO,
      monto_pagado_cliente: formData.montoPagado, 
      forma_pago: formData.formaPago, 
      vuelto: formData.vuelto, 
      requiere_factura: formData.requiereFactura, 
      monto_total_base: montoBaseProductos, 
      descuento_total_global_porcentaje: formData.descuentoTotal,
      monto_final_con_recargos: parseFloat(displayTotal.toFixed(2)), 
      observaciones: formData.observaciones || "",
    };

    try {
      const response = await fetch("https://quimex.sistemataup.online/ventas/registrar", {
        method: "POST", headers: {"Content-Type":"application/json","Authorization":`Bearer ${token}`},
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
  const formatCurrency = (value: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(value);
  
  const ventaDataParaTicket: VentaData = {
      venta_id: lastVentaId,
      fecha_emision: formData.fechaEmision,
      cliente: { nombre: formData.nombre, direccion: formData.direccion },
      vendedor: VENDEDOR_FIJO,
      items: productos
          .filter(p => p.producto && p.qx > 0)
          .map(item => {
              const pInfo = productosContext?.productos.find(p => p.id === item.producto);
              const totalConRecargosItem = (item.total || 0) * (totalCalculadoApi && montoBaseProductos > 0 ? totalCalculadoApi.monto_final_con_recargos / montoBaseProductos : 1);
              return {
                  producto_id: item.producto, producto_nombre: pInfo?.nombre || `ID: ${item.producto}`,
                  cantidad: item.qx, precio_total_item_ars: totalConRecargosItem,
              };
          }),
      total_final: displayTotal,
      observaciones: formData.observaciones,
      forma_pago: formData.formaPago, // Se añade la forma de pago
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
                  <select id="clienteId" name="clienteId" value={formData.clienteId || ""} onChange={handleClienteSelectChange} required
                    className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500" disabled={loadingClientes}>
                    <option value="">-- Selecciona Cliente --</option>
                    {clientes.map((cli: Cliente) => <option key={cli.id} value={String(cli.id)}>{cli.nombre_razon_social || `ID: ${cli.id}`}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="direccion">Dirección</label>
                  <input type="text" name="direccion" id="direccion" value={formData.direccion} onChange={handleFormChange} className="shadow-sm border rounded w-full py-2 px-3 text-gray-700"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="fechaEmision">Fecha Emisión*</label>
                  <input type="datetime-local" name="fechaEmision" id="fechaEmision" disabled value={formData.fechaEmision} className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 bg-gray-100"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="fechaEntrega">Fecha Entrega</label>
                  <input type="datetime-local" name="fechaEntrega" id="fechaEntrega" value={formData.fechaEntrega} onChange={handleFormChange} className="shadow-sm border rounded w-full py-2 px-3 text-gray-700"/>
                </div>
                 <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="observaciones">Observaciones</label>
                  <textarea id="observaciones" name="observaciones" value={formData.observaciones || ''} onChange={handleFormChange} rows={1} className="shadow-sm border rounded w-full py-2 px-3 text-gray-700"/>
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
                    <Select options={opcionesDeProductoParaSelect} value={opcionesDeProductoParaSelect.find(opt => opt.value === item.producto) || null} onChange={(opt) => handleProductSelectChange(index, opt)} className="text-sm react-select-container" classNamePrefix="react-select"/>
                    <input type="number" name="qx" value={item.qx === 0 ? '' : item.qx} onChange={(e) => handleProductRowInputChange(index, e)} className="shadow-sm border rounded w-full py-2 px-2 text-gray-700 text-center no-spinners"/>
                    <input type="number" name="descuento" value={item.descuento === 0 ? '' : item.descuento} onChange={(e) => handleProductRowInputChange(index, e)} className="shadow-sm border rounded w-full py-2 px-2 text-gray-700 text-center no-spinners"/>
                    <input type="text" name="observacion" value={item.observacion || ''} onChange={(e) => handleProductRowInputChange(index, e)} className="shadow-sm border rounded w-full py-2 px-2 text-gray-700 text-sm"/>
                    <input type="text" readOnly value={`$ ${(item.precio || 0).toFixed(2)}`} className="shadow-sm border rounded w-full py-2 px-2 text-gray-700 text-sm text-right bg-gray-100"/>
                    <input type="text" readOnly value={`$ ${(item.total || 0).toFixed(2)}`} className="shadow-sm border rounded w-full py-2 px-2 text-gray-700 text-sm text-right bg-gray-100"/>
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
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Descuento Total (%)</label><input type="number" name="descuentoTotal" className="w-full bg-white shadow-sm border rounded py-2 px-3 text-gray-700 no-spinners" value={getNumericInputValue(formData.descuentoTotal)} onChange={handleFormChange} placeholder="0" step="1" min="0" max="100"/></div>
                {/* CAMBIO: Lógica condicional para Monto Pagado y Vuelto */}
                {formData.formaPago === 'efectivo' && (
                  <>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Monto Pagado</label><input type="number" name="montoPagado" className="w-full bg-white shadow-sm border rounded py-2 px-3 text-gray-700 no-spinners" value={getNumericInputValue(formData.montoPagado)} onChange={handleFormChange} placeholder="0.00" step="0.01" min="0"/></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Vuelto</label><input type="text" name="vuelto" readOnly className="w-full bg-gray-100 shadow-sm border rounded py-2 px-3 text-gray-700 text-right" value={`$ ${formData.vuelto.toFixed(2)}`}/></div>
                  </>
                )}
              </div>
              <div className="mt-4 text-right">
                {isCalculatingTotal && <p className="text-sm text-blue-600 italic">Calculando...</p>}
                {totalCalculadoApi && ( <div className="text-xs text-gray-600 mb-1"><span>Base: ${totalCalculadoApi.monto_base.toFixed(2)}</span>{totalCalculadoApi.recargos.transferencia > 0 && <span className="ml-2">Rec. Transf: ${totalCalculadoApi.recargos.transferencia.toFixed(2)}</span>}{totalCalculadoApi.recargos.factura_iva > 0 && <span className="ml-2">IVA: ${totalCalculadoApi.recargos.factura_iva.toFixed(2)}</span>}{formData.descuentoTotal > 0 && (<span className="ml-2 text-red-600">Desc. Total ({formData.descuentoTotal}%): -$ {(baseTotalConRecargos * (formData.descuentoTotal / 100)).toFixed(2)}</span>)}</div>)}
                <label className="block text-sm font-medium text-gray-500 mb-1">Total Pedido</label>
                <input type="text" value={`$ ${displayTotal.toFixed(2)}`} readOnly className="w-full md:w-auto md:max-w-xs inline-block bg-gray-100 shadow-sm border rounded py-2 px-3 text-gray-900 text-right font-bold text-lg"/>
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