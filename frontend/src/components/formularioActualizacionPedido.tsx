"use client";

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useProductsContextActivos, Producto as ProductoContextType } from "@/context/ProductsContextActivos";
import { useRouter } from 'next/navigation';
import BotonVolver from './BotonVolver';
import Ticket from './Ticket';
import Select from 'react-select';
import { ProductoVenta, FormDataVenta, VentaDataParaTicket } from "@/types/ventas";
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
const initialProductoItem: ProductoVenta = { producto: 0, qx: 0, precio: 0, descuento: 0, total: 0, observacion: "" };
const initialFormData: FormDataVenta = {
    nombre: "", cuit: "", direccion: "", fechaEmision: "", fechaEntrega: "",
    formaPago: "efectivo", montoPagado: 0, descuentoTotal: 0, vuelto: 0,
    clienteId: null, requiereFactura: false, observaciones: "",localidad: "",
};



// Clases base para inputs y labels
const labelBaseClasses = "block text-sm font-medium text-gray-700 mb-1";
const inputBaseClasses = "w-full bg-white border border-gray-300 rounded px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";
const inputReadOnlyClasses = "w-full bg-gray-100 border border-gray-200 rounded px-3 py-2 text-gray-500 cursor-not-allowed";

export default function DetalleActualizarPedidoPage({ id }: { id: number | undefined }) {
  const [formData, setFormData] = useState<FormDataVenta>(initialFormData);
  const router = useRouter();
  const irAcciones = () => router.push('/acciones');
  const [productos, setProductos] = useState<ProductoVenta[]>([initialProductoItem]);
  const [totalCalculadoApi, setTotalCalculadoApi] = useState<TotalCalculadoAPI | null>(null);
  const [isCalculatingTotal, setIsCalculatingTotal] = useState(false);
  const [errorMensaje, setErrorMensaje] = useState('');
  const [successMensaje, setSuccessMensaje] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const productosContext = useProductsContextActivos();
  const [documentosAImprimir, setDocumentosAImprimir] = useState<string[]>([]);
  
  const opcionesDeProductoParaSelect = useMemo(() =>
    productosContext?.productos.map((prod: ProductoContextType) => ({
      value: prod.id,
      label: prod.nombre,
    })) || [],
  [productosContext?.productos]);

  const montoBaseProductos = useMemo(() => {
    return productos.reduce((sum, item) => sum + (item.total || 0), 0);
  }, [productos]);

  const recalculatePricesForProducts = useCallback(async (currentProducts: ProductoVenta[], clienteId: number | null) => {
    const token = localStorage.getItem("token");
    if (!token) { 
        setErrorMensaje("No autenticado."); 
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
            
            return { 
                precioUnitario: precioData.precio_venta_unitario_ars || 0,
                precioTotalCalculado: precioData.precio_total_calculado_ars || 0,
                indices 
            };
        } catch (error) {
            if (error instanceof Error) {
                setErrorMensaje(prev => `${prev}\nError al calcular precio para Prod ID ${productoId}: ${error.message}`);
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
            if (item) {
                item.precio = precioUnitario;
                const totalBruto = totalQuantityForProduct > 0 
                    ? (precioTotalCalculado / totalQuantityForProduct) * item.qx
                    : 0;
                    const subtotalBrutoConDescuento = totalBruto * (1 - (item.descuento / 100));
                    item.total = subtotalBrutoConDescuento;
            }
        });
    });

    setProductos(newProducts);
  }, [setErrorMensaje]);

  const cargarFormulario = useCallback(async (pedidoId: number) => {
    setIsLoading(true);
    setErrorMensaje('');
    const token = localStorage.getItem("token");
    if (!token) { setErrorMensaje("No autenticado."); setIsLoading(false); return; }
    try {
      const response = await fetch(`https://quimex.sistemataup.online/ventas/obtener/${pedidoId}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!response.ok) throw new Error((await response.json()).message || "No se pudieron cargar los datos.");
      const datosAPI = await response.json();
      
      const clienteId = datosAPI.cliente_id || null;

      setFormData({
        nombre: datosAPI.cliente_nombre || "Cliente",
        cuit: datosAPI.cuit_cliente || "",
        direccion: datosAPI.direccion_entrega || "",
        fechaEmision: datosAPI.fecha_registro || "",
        fechaEntrega: datosAPI.fecha_pedido || "",
        formaPago: datosAPI.forma_pago || "efectivo",
        montoPagado: datosAPI.monto_pagado_cliente || 0,
        descuentoTotal: datosAPI.descuento_total_global_porcentaje || 0,
        vuelto: datosAPI.vuelto_calculado ?? 0,
        clienteId: clienteId,
        requiereFactura: datosAPI.requiere_factura || false,
        observaciones: datosAPI.observaciones || "",
        localidad: datosAPI.localidad || "",
      });


      type DetalleFromAPI = {
      detalle_id?: number;
      producto_id: number;
      cantidad: number;
      precio_unitario_venta_ars: number;
      descuento_item_porcentaje: number;
      precio_total_item_ars: number;
      observacion_item?: string;
    };
      // Paso 1: Mapeamos los datos básicos de la API (producto, cantidad, descuento).
      const productosParaRecalcular: ProductoVenta[] = datosAPI.detalles?.map((detalle: DetalleFromAPI) => ({
        id_detalle: detalle.detalle_id,
        producto: detalle.producto_id,
        qx: detalle.cantidad,
        descuento: detalle.descuento_item_porcentaje || 0,
        observacion: detalle.observacion_item || "",
        observacion_item: detalle.observacion_item || "",
        // Precios y totales se inicializan en 0, serán calculados ahora.
        precio: 0,
        total: 0,
      })) || [];
      
      // Paso 2: Forzamos el recálculo de precios inmediatamente con los productos cargados.
      // Esto asegura que los precios se actualicen al abrir el formulario.
      if (productosParaRecalcular.length > 0) {
        await recalculatePricesForProducts(productosParaRecalcular, clienteId);
      } else {
        setProductos([initialProductoItem]);
      }

    } catch (error) {
      if (error instanceof Error) setErrorMensaje(error.message);
      else setErrorMensaje("Error desconocido al cargar el pedido.");
    } finally {
      setIsLoading(false);
    }
  }, [recalculatePricesForProducts]); 

  useEffect(() => {
    if (id) cargarFormulario(id);
    else { setIsLoading(false); setErrorMensaje("ID de pedido no proporcionado."); }
  }, [id, cargarFormulario]);

const displayTotalToShow = useMemo(() => {
    const montoConRecargosBruto = totalCalculadoApi ? totalCalculadoApi.monto_final_con_recargos : montoBaseProductos;
    const montoBrutoFinal = Math.max(0, montoConRecargosBruto * (1 - (formData.descuentoTotal / 100)));

    if (montoBrutoFinal > 0) {
        return montoBrutoFinal;
    }
    return 0;

}, [totalCalculadoApi, montoBaseProductos, formData.descuentoTotal]);

  useEffect(() => {
    const recalcularTodo = async () => {
        if (isLoading) return;
        setIsCalculatingTotal(true);
        const token = localStorage.getItem("token");
        if (!token) { setIsCalculatingTotal(false); return; }
        try {
            const resTotal = await fetch("https://quimex.sistemataup.online/ventas/calcular_total", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({ monto_base: montoBaseProductos, forma_pago: formData.formaPago, requiere_factura: formData.requiereFactura }),
            });
            const dataTotal = await resTotal.json();
            if (!resTotal.ok) throw new Error(dataTotal.error || `Error calculando total.`);
            setTotalCalculadoApi(dataTotal);
        } catch (error) {
            if (error instanceof Error) setErrorMensaje(error.message);
            else setErrorMensaje("Error al recalcular totales.");
            setTotalCalculadoApi(null);
        } finally {
            setIsCalculatingTotal(false);
        }
    };
    recalcularTodo();
  }, [montoBaseProductos, formData.formaPago, formData.requiereFactura, isLoading]);

  useEffect(() => {
    if (formData.montoPagado >= displayTotalToShow) {
        const nuevoVuelto = formData.montoPagado - displayTotalToShow;
        setFormData(prev => ({ ...prev, vuelto: parseFloat(nuevoVuelto.toFixed(2)) }));
    } else {
        setFormData(prev => ({ ...prev, vuelto: 0 }));
    }
  }, [formData.montoPagado, displayTotalToShow]);

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let val: string | number | boolean = value;
    if (type === 'checkbox') val = (e.target as HTMLInputElement).checked;
    else if (type === 'number') {
        val = value === '' ? 0 : parseFloat(value);
        if (name === 'descuentoTotal') val = isNaN(val) ? 0 : Math.max(0, Math.min(100, val));
        else if (isNaN(val)) val = 0;
    }
    setFormData(prev => ({ ...prev, [name]: val, ...(name === 'formaPago' && { requiereFactura: val === 'factura' }) }));
  };

  const handleProductRowChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
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
    recalculatePricesForProducts(nuevosProductos, formData.clienteId);
  };
  
  const handleProductSelectChange = (index: number, selectedOption: { value: number; label: string } | null) => {
    const nuevosProductos = [...productos];
    nuevosProductos[index].producto = selectedOption?.value || 0;
    recalculatePricesForProducts(nuevosProductos, formData.clienteId);
  };

  const agregarProducto = () => setProductos([...productos, { ...initialProductoItem }]);
  const eliminarProducto = (index: number) => {
    const nuevosProductos = productos.filter((_, i) => i !== index);
    recalculatePricesForProducts(nuevosProductos.length > 0 ? nuevosProductos : [{ ...initialProductoItem }], formData.clienteId);
  };

  const handleImprimir = useCallback((documentos: string[]) => {
    setDocumentosAImprimir(documentos);
  }, []);

  useEffect(() => {
    if (documentosAImprimir.length > 0) {
      document.title = `Pedido ${id} - ${formData.nombre}`;
      window.print();
      setDocumentosAImprimir([]);
    }
  }, [documentosAImprimir, id, formData.nombre]);

  const handleSubmit = async (e: React.FormEvent ) => {
    e.preventDefault();
    setErrorMensaje(''); setSuccessMensaje('');
    if (!id) { setErrorMensaje("ID de pedido no válido."); return; }
    setIsSubmitting(true);
    const token = localStorage.getItem("token");
    const usuarioId = localStorage.getItem("usuario_id");
    if (!token || !usuarioId) { setErrorMensaje("No autenticado."); setIsSubmitting(false); return; }
    const dataToUpdate = {
      cliente_id: formData.clienteId,
      fecha_pedido: formData.fechaEntrega || formData.fechaEmision,
      direccion_entrega: formData.direccion,
      monto_pagado_cliente: formData.montoPagado,
      forma_pago: formData.formaPago,
      vuelto: formData.vuelto,
      observaciones: formData.observaciones || "",
      requiere_factura: formData.requiereFactura,
      usuario_interno_id: parseInt(usuarioId),
      items: productos.filter(item => item.producto > 0 && item.qx > 0).map(item => ({
          id_detalle: item.id_detalle,
          producto_id: item.producto,
          cantidad: item.qx,
          descuento_item_porcentaje: item.descuento || 0,
          observacion_item: item.observacion || "",
        })),
      monto_total_base: montoBaseProductos,
      monto_final_con_recargos: parseFloat(displayTotalToShow.toFixed(2)),
      descuento_total_global_porcentaje: formData.descuentoTotal || 0,
    };
    try {
      const response = await fetch(`https://quimex.sistemataup.online/ventas/actualizar/${id}`, {
        method: "PUT", headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},
        body: JSON.stringify(dataToUpdate),
      });
      const result = await response.json();
      if(!response.ok) throw new Error(result?.message || 'Error al actualizar.');
      setSuccessMensaje("¡Pedido actualizado con éxito!");
      handleImprimir(['comprobante', 'comprobante', 'orden_de_trabajo']);
      setTimeout(irAcciones, 2000);
    } catch (err) {
      if(err instanceof Error) setErrorMensaje(err.message);
      else setErrorMensaje("Error de red.");
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const getNumericInputValue = (value: number) => value === 0 ? '' : String(value);

  const ventaDataParaTicket: VentaDataParaTicket = {
    venta_id: id,
    fecha_emision: formData.fechaEmision,
    cliente: { nombre: formData.nombre, direccion: formData.direccion },
    nombre_vendedor: "pedidos",
    items: productos.filter(p => p.producto && p.qx > 0).map(item => {
      const pInfo = productosContext?.productos.find(p => p.id === item.producto);
      const subtotalRedondeadoBase = item.total || 0;
      let subtotalFinalParaTicket = subtotalRedondeadoBase;
      if (totalCalculadoApi && montoBaseProductos > 0) {
        const factorRecargo = totalCalculadoApi.monto_final_con_recargos / montoBaseProductos;
        const subtotalConRecargo = subtotalRedondeadoBase * factorRecargo;
        subtotalFinalParaTicket = subtotalConRecargo;
      }
      const descuentoPorc = item.descuento || 0;
      const subtotalBruto = descuentoPorc > 0 ? (subtotalFinalParaTicket / (1 - descuentoPorc / 100)) : subtotalFinalParaTicket;
      return {
        producto_id: item.producto,
        producto_nombre: pInfo?.nombre || `ID: ${item.producto}`,
        cantidad: item.qx,
        precio_total_item_ars: subtotalFinalParaTicket,
        observacion_item: item.observacion || item.observacion_item || "",
        descuento_item_porcentaje: descuentoPorc,
        subtotal_bruto_item_ars: subtotalBruto,
      };
    }),
    total_final: displayTotalToShow,
    observaciones: formData.observaciones,
    forma_pago: formData.formaPago, 
    monto_pagado_cliente: formData.montoPagado,
    vuelto_calculado: formData.vuelto,
    descuento_total_global_porcentaje: formData.descuentoTotal || 0,
    total_bruto_sin_descuento: productos.filter(p => p.producto && p.qx > 0).reduce((sum, item) => {
      const subtotalRedondeadoBase = item.total || 0;
      let subtotalFinalParaTicket = subtotalRedondeadoBase;
      if (totalCalculadoApi && montoBaseProductos > 0) {
        const factorRecargo = totalCalculadoApi.monto_final_con_recargos / montoBaseProductos;
        const subtotalConRecargo = subtotalRedondeadoBase * factorRecargo;
        subtotalFinalParaTicket = subtotalConRecargo;
      }
      const descuentoPorc = item.descuento || 0;
      const subtotalBruto = descuentoPorc > 0 ? (subtotalFinalParaTicket / (1 - descuentoPorc / 100)) : subtotalFinalParaTicket;
      return sum + subtotalBruto;
    }, 0),
  };

  return (
    <>
      <div className="flex items-center justify-center min-h-screen bg-indigo-900 py-10 px-4 print:hidden">
        <div className="bg-white p-6 md:p-8 rounded-lg shadow-md w-full max-w-5xl">
          <BotonVolver onClick={irAcciones} />
          <h2 className="text-3xl font-bold text-center text-indigo-800 mb-6">Actualizar Pedido #{id}</h2>
          {errorMensaje && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4"><p>{errorMensaje}</p></div>}
          {successMensaje && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4"><p>{successMensaje}</p></div>}
          <form onSubmit={handleSubmit} className="space-y-6">
            <fieldset className="border p-4 rounded-md">
              <legend className="text-lg font-medium text-gray-700 px-2">Datos Cliente/Pedido</legend>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div><label className={labelBaseClasses} htmlFor="nombre">Cliente</label><input type="text" id="nombre" value={formData.nombre} readOnly disabled className={inputReadOnlyClasses}/></div>
                <div><label className={labelBaseClasses} htmlFor="cuit">CUIT</label><input type="text" id="cuit" value={formData.cuit} readOnly disabled className={inputReadOnlyClasses}/></div>
                <div><label className={labelBaseClasses} htmlFor="direccion">Dirección</label><input type="text" name="direccion" id="direccion" value={formData.direccion} onChange={handleFormChange} className={inputBaseClasses}/></div>
                <div><label className={labelBaseClasses} htmlFor="fechaEmision">Fecha Emisión</label><input type="datetime-local" id="fechaEmision" value={formData.fechaEmision ? formData.fechaEmision.substring(0,16) : ''} readOnly disabled className={inputReadOnlyClasses}/></div>
                <div><label className={labelBaseClasses} htmlFor="fechaEntrega">Fecha Entrega</label><input type="datetime-local" name="fechaEntrega" id="fechaEntrega" value={formData.fechaEntrega ? formData.fechaEntrega.substring(0,16) : ''} onChange={handleFormChange} className={inputBaseClasses}/></div>
                <div><label className={labelBaseClasses} htmlFor="observaciones">Observaciones</label><textarea name="observaciones" id="observaciones" value={formData.observaciones || ''} onChange={handleFormChange} rows={1} className={inputBaseClasses}/></div>
              </div>
            </fieldset>
            <fieldset className="border p-4 rounded-md">
              <legend className="text-lg font-medium text-gray-700 px-2">Productos</legend>
              <div className="mb-2 hidden md:grid md:grid-cols-[1fr_80px_80px_1fr_100px_100px_40px] items-center gap-2 font-semibold text-sm text-gray-600 px-2">
                <span>Producto</span><span className="text-center">Cant.</span><span className="text-center">Desc.%</span><span>Observación</span><span className="text-right">P.Unit</span><span className="text-right">Total</span><span></span>
              </div>
              <div className="space-y-3">
                {productos.map((item, index) => (
                  <div key={item.id_detalle || `new-${index}`} className="grid grid-cols-1 md:grid-cols-[1fr_80px_80px_1fr_100px_100px_40px] items-center gap-2 border-b pb-2 last:border-b-0">
                    <Select options={opcionesDeProductoParaSelect} value={opcionesDeProductoParaSelect.find(opt => opt.value === item.producto) || null} onChange={(opt) => handleProductSelectChange(index, opt)} className="text-sm react-select-container" classNamePrefix="react-select"/>
                    <input type="number" name="qx" value={item.qx === 0 ? '' : item.qx} onChange={(e) => handleProductRowChange(index, e)} className={`${inputBaseClasses} text-center no-spinners`} onWheel={(e) => (e.target as HTMLInputElement).blur()}/>
                    <input type="number" name="descuento" value={item.descuento === 0 ? '' : item.descuento} onChange={(e) => handleProductRowChange(index, e)} className={`${inputBaseClasses} text-center no-spinners`} onWheel={(e) => (e.target as HTMLInputElement).blur()}/>
                    <input type="text" name="observacion" value={item.observacion || ''} onChange={(e) => handleProductRowChange(index, e)} className={`${inputBaseClasses} text-sm`}/>
                    <input type="text" readOnly value={`$ ${(item.precio || 0).toFixed(2)}`} className={`${inputReadOnlyClasses} text-sm text-right`}/>
                    <input type="text" readOnly value={`$ ${(item.total || 0).toFixed(2)}`} className={`${inputReadOnlyClasses} text-sm text-right`}/>
                    <button type="button" onClick={() => eliminarProducto(index)} className="text-red-500 hover:text-red-700 font-bold text-xl">×</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={agregarProducto} className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 text-sm">+ Agregar Producto</button>
            </fieldset>
            <fieldset className="border p-4 rounded-md">
              <legend className="text-lg font-medium text-gray-700 px-2">Pago y Totales</legend>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                <div><label className={labelBaseClasses}>Forma de Pago</label><select name="formaPago" value={formData.formaPago} onChange={handleFormChange} className={inputBaseClasses}><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="factura">Factura</option></select></div>
                <div><label className={labelBaseClasses}>Monto Pagado</label><input type="number" name="montoPagado" value={getNumericInputValue(formData.montoPagado)} onChange={handleFormChange} className={`${inputBaseClasses} no-spinners`}/></div>
                <div><label className={labelBaseClasses}>Descuento Total (%)</label><input type="number" name="descuentoTotal" value={getNumericInputValue(formData.descuentoTotal)} onChange={handleFormChange} className={`${inputBaseClasses} no-spinners`}/></div>
                <div><label className={labelBaseClasses}>Vuelto</label><input type="text" readOnly value={`$ ${formData.vuelto.toFixed(2)}`} className={`${inputReadOnlyClasses} text-right`}/></div>
              </div>
              <div className="mt-4 text-right">
                {isCalculatingTotal && <p className="text-sm text-blue-600 italic">Calculando...</p>}
                {totalCalculadoApi && <div className="text-xs text-gray-600 mb-1">...</div>}
                <label className="block text-sm font-medium text-gray-500 mb-1">Total Pedido</label>
                <input type="text" value={`$ ${displayTotalToShow.toFixed(2)}`} readOnly className="w-full md:w-auto md:max-w-xs inline-block bg-gray-100 shadow-sm border rounded py-2 px-3 text-gray-900 text-right font-bold text-lg"/>
              </div>
            </fieldset>
            {/* CAMBIO: Lógica de botones de impresión */}
            <div className="flex justify-between items-center mt-8">
              <button type="button" onClick={() => handleImprimir(['orden_de_trabajo'])} className="bg-gray-500 text-white px-8 py-3 rounded-md hover:bg-gray-600 font-semibold">
                Reimprimir OT
              </button>
              <button type="submit" className="bg-green-600 text-white px-8 py-3 rounded-md hover:bg-green-700 font-semibold" disabled={isLoading || isSubmitting || isCalculatingTotal}>
                {isSubmitting ? 'Actualizando...' : 'Actualizar e Imprimir Todo'}
              </button>
            </div>
          </form>
        </div>
      </div>
      {/* CAMBIO: Sección de impresión dinámica */}
      <div id="presupuesto-imprimible" className="hidden print:block">
        {documentosAImprimir.map((tipo, index) => (
          <React.Fragment key={index}>
            {index > 0 && <div style={{ pageBreakBefore: 'always' }}></div>}
            <Ticket tipo={tipo as 'comprobante' | 'orden_de_trabajo'} ventaData={ventaDataParaTicket} />
          </React.Fragment>
        ))}
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