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
  recargos: { transferencia: number; factura_iva: number; };
  monto_final_con_recargos: number; // ya redondeado por backend
  monto_final_con_descuento?: number; // monto con descuento antes de redondeo final o final según implementación
  descuento_total_global_porcentaje?: number;
  tipo_redondeo_aplicado?: string; // centena | decena
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

  // Helper: solo cuantizar a 2 decimales sin redondeo adicional
  const quantizeToDecimals = (v: number) => {
    if (!v || isNaN(v)) return 0;
    return Math.round(v * 100) / 100;
  };

  /**
   * Recalcula precios unitarios y totales replicando la lógica del backend:
   * 1. Obtener precio unitario base (API productos/calcular_precio) para la suma de cantidades del mismo producto.
   * 2. Redondear unitario a centena.
   * 3. Aplicar descuento por ítem (%).
   * 4. Calcular total = (unitario_con_descuento * cantidad) y redondear a centena.
   * 5. Guardar unitario_con_descuento en campo precio (como hace backend) y total en campo total.
   */
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
            return { precioUnitario: 0, precioTotalCalculado: 0, indices, esPrecioEspecial: false };
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
                esPrecioEspecial: precioData.es_precio_especial || false,
                indices 
            };
        } catch (error) {
            if (error instanceof Error) {
                setErrorMensaje(prev => `${prev}\nError al calcular precio para Prod ID ${productoId}: ${error.message}`);
            }
            return { precioUnitario: 0, precioTotalCalculado: 0, indices, esPrecioEspecial: false };
        }
    });

    const priceResults = await Promise.all(pricePromises);
    const newProducts = [...currentProducts];

    priceResults.forEach(({ precioUnitario, indices }) => {
      indices.forEach(index => {
        const item = newProducts[index];
        if (!item) return;
        const cantidad = item.qx || 0;
        const descuento = item.descuento || 0; // %
        // Solo cuantizar a 2 decimales, el backend se encarga del redondeo final
        const unitQuantized = quantizeToDecimals(precioUnitario);
        // Aplicar descuento por ítem
        const unitWithDiscount = unitQuantized * (1 - (descuento / 100));
        // Calcular total sin redondeo adicional (backend lo maneja)
        const totalBruto = unitWithDiscount * cantidad;
        const totalQuantized = quantizeToDecimals(totalBruto);
        item.precio = quantizeToDecimals(unitWithDiscount); // Unitario con descuento cuantizado
        item.total = totalQuantized;   // Total cuantizado, backend aplicará redondeo final
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
      // Cargamos directamente los valores que YA vienen guardados (sin recálculo forzado inicial)
      // Esto evita diferencias con la boleta almacenada.
      const productosDesdeAPI: ProductoVenta[] = datosAPI.detalles?.map((detalle: DetalleFromAPI) => ({
        id_detalle: detalle.detalle_id,
        producto: detalle.producto_id,
        qx: detalle.cantidad,
        descuento: detalle.descuento_item_porcentaje || 0,
        observacion: detalle.observacion_item || "",
        observacion_item: detalle.observacion_item || "",
        precio: detalle.precio_unitario_venta_ars || 0, // ya viene con descuento aplicado
        total: detalle.precio_total_item_ars || 0       // ya viene redondeado
      })) || [];

      if (productosDesdeAPI.length > 0) {
        setProductos(productosDesdeAPI);
        // NO recalcular inmediatamente - usar valores guardados para evitar diferencias
        // Solo recalcular si el usuario cambia algo manualmente
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

// Total final mostrado: preferir monto_final_con_descuento (si existe) sino monto_final_con_recargos
const totalFinalCalculado = useMemo(() => {
  if (totalCalculadoApi) {
    if (typeof totalCalculadoApi.monto_final_con_descuento === 'number') {
      return totalCalculadoApi.monto_final_con_descuento;
    }
    return totalCalculadoApi.monto_final_con_recargos;
  }
  return montoBaseProductos; // fallback básico
}, [totalCalculadoApi, montoBaseProductos]);

  useEffect(() => {
    const recalcularTodo = async () => {
        if (isLoading) return;
        setIsCalculatingTotal(true);
        const token = localStorage.getItem("token");
        if (!token) { setIsCalculatingTotal(false); return; }
        try {
               // Log de body enviado para debug de descuento
               console.log('Enviando calcular_total con payload:', JSON.stringify({ monto_base: montoBaseProductos, forma_pago: formData.formaPago, requiere_factura: formData.requiereFactura, descuento_total_global_porcentaje: formData.descuentoTotal }));
            const resTotal = await fetch("https://quimex.sistemataup.online/ventas/calcular_total", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({ monto_base: montoBaseProductos, forma_pago: formData.formaPago, requiere_factura: formData.requiereFactura, descuento_total_global_porcentaje: formData.descuentoTotal }),
            });
            const dataTotal = await resTotal.json();
               // Log de respuesta para debug de descuento
               console.log('Respuesta calcular_total:', dataTotal);
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
  }, [montoBaseProductos, formData.formaPago, formData.requiereFactura, formData.descuentoTotal, isLoading]);

  useEffect(() => {
    if (formData.formaPago === 'efectivo' && formData.montoPagado >= totalFinalCalculado) {
      const nuevoVuelto = formData.montoPagado - totalFinalCalculado;
      setFormData(prev => ({ ...prev, vuelto: parseFloat(nuevoVuelto.toFixed(2)) }));
    } else {
      setFormData(prev => ({ ...prev, vuelto: 0 }));
    }
  }, [formData.montoPagado, formData.formaPago, totalFinalCalculado]);

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let val: string | number | boolean = value;
    if (type === 'checkbox') val = (e.target as HTMLInputElement).checked;
    else if (type === 'number') {
        val = value === '' ? 0 : parseFloat(value);
        if (name === 'descuentoTotal' ) val = isNaN(val) ? 0 : Math.max(0, Math.min(100, val));
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
        observacion_item: item.observacion || "",
        descuento_item_porcentaje: item.descuento || 0,
      })),
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

  // Calcular el subtotal de todos los ítems con descuento particular
  const itemsFiltrados = productos.filter(p => p.producto && p.qx > 0);
  const itemsFinales = itemsFiltrados.map(item => {
    const pInfo = productosContext?.productos.find(p => p.id === item.producto);
    return {
      id_detalle: item.id_detalle,
      producto_id: item.producto,
      producto_nombre: pInfo?.nombre || `ID: ${item.producto}`,
      cantidad: item.qx,
      observacion_item: item.observacion || "",
      precio_total_item_ars: item.total || 0,
      subtotal_bruto_item_ars: item.total || 0,
    };
  });

  const ventaDataParaTicket: VentaDataParaTicket = {
    venta_id: id,
    fecha_emision: formData.fechaEmision,
    cliente: { nombre: formData.nombre, direccion: formData.direccion },
    nombre_vendedor: "pedidos",
    items: itemsFinales,
  total_final: totalFinalCalculado,
    observaciones: formData.observaciones,
    forma_pago: formData.formaPago, 
    monto_pagado_cliente: formData.montoPagado,
    vuelto_calculado: formData.vuelto,
  // total_bruto_sin_descuento removido: backend maneja cálculo global
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
                {totalCalculadoApi && (
                  <div className="text-xs text-gray-600 mb-2 p-2 bg-gray-100 rounded">
                    <span>Base: $ {totalCalculadoApi.monto_base.toFixed(2)}</span>
                    {totalCalculadoApi.recargos.transferencia > 0 && <span className="ml-3">Rec. Transf: $ {totalCalculadoApi.recargos.transferencia.toFixed(2)}</span>}
                    {totalCalculadoApi.recargos.factura_iva > 0 && <span className="ml-3">IVA: $ {totalCalculadoApi.recargos.factura_iva.toFixed(2)}</span>}
                    {formData.descuentoTotal > 0 && typeof totalCalculadoApi.monto_final_con_descuento === 'number' && (
                      <span className="ml-3 text-red-600">Desc: {formData.descuentoTotal}%</span>
                    )}
                    {totalCalculadoApi.tipo_redondeo_aplicado && (
                      <span className="ml-3 italic">Redondeo: {totalCalculadoApi.tipo_redondeo_aplicado}</span>
                    )}
                  </div>
                )}
                <label className="block text-sm font-medium text-gray-500 mb-1">Total Pedido</label>
                <input type="text" value={`$ ${totalFinalCalculado.toFixed(2)}`} readOnly className="w-full md:w-auto md:max-w-xs inline-block bg-gray-100 shadow-sm border rounded py-2 px-3 text-gray-900 text-right font-bold text-lg"/>
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
        {documentosAImprimir.map((tipo, index) => {
          console.log('Datos enviados al Ticket:', ventaDataParaTicket);
          return (
            <React.Fragment key={index}>
              {index > 0 && <div style={{ pageBreakBefore: 'always' }}></div>}
              <Ticket tipo={tipo as 'comprobante' | 'orden_de_trabajo'} ventaData={ventaDataParaTicket} />
            </React.Fragment>
          );
        })}
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