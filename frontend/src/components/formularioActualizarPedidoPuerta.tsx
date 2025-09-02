"use client";

import { useProductsContext, Producto as ProductoType } from "@/context/ProductsContext"; 
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import BotonVolver from "./BotonVolver";
import Ticket, { VentaData } from './Ticket';
import Select from 'react-select';

// --- Tipos de Datos Definidos (con descuentos) ---
type ProductoPedido = {
  producto_id: number;
  cantidad: number;
  precio_unitario: number;
  total_linea: number;
  observacion_item?: string;
};
type DetalleAPI = {
  producto_id: number;
  cantidad: number;
  precio_unitario_ars: number;
  descuento_item_porcentaje: number;
  monto_total_ars: number;
  observacion_item?: string;
};
interface IFormData {
  nombre_vendedor: string;
  fecha_emision: string;
  forma_pago: string;
  monto_pagado: number;
  descuentoTotal: number;
  vuelto: number;
  requiere_factura: boolean;
  observaciones?: string;
}
interface TotalCalculadoAPI {
  monto_base: number;
  monto_final_con_recargos: number;
  recargos: {
      transferencia: number;
      factura_iva: number;
  }
}
interface FormularioProps {
  id: number | undefined;
  onVolver: () => void;
}
const VENDEDORES = ["martin", "moises", "sergio", "gabriel", "mauricio", "elias", "ardiles", "redonedo"];
const initialProductoItem : ProductoPedido = { producto_id: 0, cantidad: 0, precio_unitario: 0, total_linea: 0, observacion_item: "" };

// --- Componente Principal ---
export default function FormularioActualizarPedidoPuerta({ id, onVolver }: FormularioProps) {
  const [formData, setFormData] = useState<IFormData>({
    nombre_vendedor: "", fecha_emision: "", forma_pago: "efectivo",
    monto_pagado: 0, descuentoTotal: 0, vuelto: 0,
    requiere_factura: false, observaciones: "",
  });
  const [productos, setProductos] = useState<ProductoPedido[]>([]);
  const [totalCalculadoApi, setTotalCalculadoApi] = useState<TotalCalculadoAPI | null>(null);
  const [isCalculatingTotal, setIsCalculatingTotal] = useState(false);
  const [errorMensaje, setErrorMensaje] = useState('');
  const [successMensaje, setSuccessMensaje] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [documentosAImprimir, setDocumentosAImprimir] = useState<string[]>([]);
  const productosContext = useProductsContext();

  const opcionesDeProductoParaSelect = useMemo(() =>
    productosContext.productos.map((prod: ProductoType) => ({ value: prod.id, label: prod.nombre })) || [],
  [productosContext.productos]);
  
  const montoBaseProductos = useMemo(() => {
    return productos.reduce((sum, item) => sum + (item.total_linea || 0), 0);
  }, [productos]);

  const recalculatePricesForProducts = useCallback(async (currentProducts: ProductoPedido[]) => {
    const token = localStorage.getItem("token");
    if (!token) { 
        setErrorMensaje("No autenticado."); 
        return; 
    }

    // --- INICIO DE LA LÓGICA CORRECTA Y DEFINITIVA ---

    // 1. Agrupar cantidades totales por cada ID de producto.
    const productQuantities = new Map<number, { totalQuantity: number; indices: number[] }>();
    currentProducts.forEach((p, index) => {
        if (p.producto_id > 0) {
            const existing = productQuantities.get(p.producto_id) || { totalQuantity: 0, indices: [] };
            existing.totalQuantity += p.cantidad;
            existing.indices.push(index);
            productQuantities.set(p.producto_id, existing);
        }
    });

    // 2. Crear una promesa por cada producto ÚNICO para obtener su precio unitario correcto.
    const pricePromises = Array.from(productQuantities.entries()).map(async ([productoId, { totalQuantity, indices }]) => {
        if (totalQuantity <= 0) {
            return { precioUnitario: 0, precioTotalCalculado: 0, indices };
        }
        try {
            const precioRes = await fetch(`https://quimex.sistemataup.online/productos/calcular_precio/${productoId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({ producto_id: productoId, quantity: totalQuantity, cliente_id: null }),
            });
            if (!precioRes.ok) {
                const errorData = await precioRes.json().catch(() => ({ message: 'API de precios falló' }));
                throw new Error(errorData.message);
            }
            const precioData = await precioRes.json();
            // Se capturan los valores de la API en variables locales
            return { 
                precioUnitario: precioData.precio_venta_unitario_ars || 0,
                precioTotalCalculado: precioData.precio_total_calculado_ars || 0,
                indices 
            };
        } catch (error) {
            if (error instanceof Error) setErrorMensaje(prev => `${prev}\nPrecio Prod ID ${productoId}: ${error.message}`);
            return { precioUnitario: 0, precioTotalCalculado: 0, indices };
        }
    });

    const priceResults = await Promise.all(pricePromises);
    const newProducts = [...currentProducts];

    priceResults.forEach(({ precioUnitario, precioTotalCalculado, indices }) => {
        const totalQuantityForProduct = indices.reduce((sum, index) => sum + (newProducts[index].cantidad || 0), 0);
        indices.forEach(index => {
            const item = newProducts[index];
            if (item) {
                // --- CORRECCIÓN FINAL ---
                // Se usan los nombres de propiedad definidos en el tipo 'ProductoPedido'
                item.precio_unitario = precioUnitario; // Asigna a 'precio_unitario'
                
                const totalBruto = totalQuantityForProduct > 0 
                    ? (precioTotalCalculado / totalQuantityForProduct) * item.cantidad
                    : 0;
                
                item.total_linea = totalBruto;
            }
        });
    });
    setProductos(newProducts);

  }, [setErrorMensaje, setProductos]);


  const cargarFormulario = useCallback(async (pedidoId: number) => {
      setIsLoading(true);
      setErrorMensaje('');
      const token = localStorage.getItem("token");
      if (!token) { setErrorMensaje("No autenticado."); setIsLoading(false); return; }

      try {
        const response = await fetch(`https://quimex.sistemataup.online/ventas/obtener/${pedidoId}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (!response.ok) throw new Error((await response.json()).message || "No se pudieron cargar los datos del pedido.");
        
        const datosAPI = await response.json();
        
        setFormData({
          // ... (Tu lógica para setFormData se mantiene igual, cargando vendedor, forma de pago, etc.)
          nombre_vendedor: datosAPI.nombre_vendedor || '',
          fecha_emision: datosAPI.fecha_pedido || "",
          forma_pago: datosAPI.forma_pago || "efectivo",
          monto_pagado: datosAPI.monto_pagado_cliente || 0,
          descuentoTotal: datosAPI.descuento_total_global_porcentaje || 0,
          vuelto: datosAPI.vuelto_calculado ?? 0,
          requiere_factura: datosAPI.requiere_factura || false,
          observaciones: datosAPI.observaciones || "",
        });

        // Paso 1: Mapeamos los datos básicos de la API (producto y cantidad).
        // Los precios y totales los ignoramos, porque los vamos a recalcular.
        const productosParaRecalcular: ProductoPedido[] = datosAPI.detalles?.map((detalle: DetalleAPI) => ({
          producto_id: detalle.producto_id,
          cantidad: detalle.cantidad,
          // Asumimos descuentos guardados si existen, si no, 0.
          descuento: detalle.descuento_item_porcentaje || 0,
          observacion_item: detalle.observacion_item || "",
          // Precios y totales se inicializan en 0, serán calculados ahora.
          precio_unitario: 0,
          total_linea: 0,
        })) || [];
        
        // Paso 2: Si hay productos, forzamos el recálculo de precios inmediatamente.
        if (productosParaRecalcular.length > 0) {
          // La función recalculatePricesForProducts se encargará de llamar a la API
          // y de hacer el setProductos con los datos frescos y correctos.
          await recalculatePricesForProducts(productosParaRecalcular);
        } else {
          // Si no hay productos, nos aseguramos que el estado quede limpio.
          setProductos([]);
        }
      
    } catch (error) {
      if(error instanceof Error) setErrorMensaje(error.message);
      else setErrorMensaje("Error desconocido al cargar el pedido.");
    } finally {
      setIsLoading(false);
    }
  }, [recalculatePricesForProducts]);

  useEffect(() => {
    if (id) cargarFormulario(id);
    else { setIsLoading(false); setErrorMensaje("ID de pedido no proporcionado."); }
  }, [id, cargarFormulario]);
  
useEffect(() => {
    const recalcularTotalConAPI = async () => {
      // La condición de salida ahora también considera el descuento. Si todo es 0, no hace nada.
      if (isLoading || isSubmitting) return;
      if (montoBaseProductos <= 0 && formData.descuentoTotal <= 0) { 
        setTotalCalculadoApi(null); 
        return; 
      }
      
      setIsCalculatingTotal(true);
      const token = localStorage.getItem("token");
      if (!token) { setIsCalculatingTotal(false); return; }

      try {
        const response = await fetch("https://quimex.sistemataup.online/ventas/calcular_total", {
          method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ monto_base: montoBaseProductos, forma_pago: formData.forma_pago, requiere_factura: formData.requiere_factura }),
        });
        const data = await response.json(); // Se lee la respuesta una sola vez
        if (!response.ok) throw new Error(data.error || `Error calculando total.`);
        
        setTotalCalculadoApi(data);
      } catch (e) {
        if(e instanceof Error) setErrorMensaje(e.message);
        else setErrorMensaje("Error al calcular el total final.");
        setTotalCalculadoApi(null);
      } finally { 
        setIsCalculatingTotal(false); 
      }
    };
    recalcularTotalConAPI();
  // CAMBIO CRÍTICO: Se añade la dependencia que faltaba
  }, [montoBaseProductos, formData.forma_pago, formData.requiere_factura, formData.descuentoTotal, isLoading, isSubmitting]);

  const displayTotal = useMemo(() => {
      const baseTotalConRecargos = totalCalculadoApi ? totalCalculadoApi.monto_final_con_recargos : montoBaseProductos;
      return Math.max(0, baseTotalConRecargos * (1 - (formData.descuentoTotal / 100)));
  }, [totalCalculadoApi, montoBaseProductos, formData.descuentoTotal]);

  useEffect(() => {
    if (formData.forma_pago !== 'efectivo') {
        if (formData.monto_pagado !== 0 || formData.vuelto !== 0) {
            setFormData(prev => ({...prev, monto_pagado: 0, vuelto: 0}));
        }
    } else {
        if (formData.monto_pagado >= displayTotal) {
            const nuevoVuelto = formData.monto_pagado - displayTotal;
            if (formData.vuelto !== nuevoVuelto) {
                setFormData(prev => ({...prev, vuelto: parseFloat(nuevoVuelto.toFixed(2))}));
            }
        } else {
            if (formData.vuelto !== 0) {
                setFormData(prev => ({...prev, vuelto: 0}));
            }
        }
    }
  }, [formData.monto_pagado, displayTotal, formData.forma_pago, formData.vuelto]);

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let val: string | number | boolean = value;
    if (type === 'checkbox') val = (e.target as HTMLInputElement).checked;
    else if (type === 'number') {
        val = parseFloat(value) || 0;
        if(name === 'descuentoTotal') val = Math.max(0, Math.min(100, val));
    }
    setFormData(prev => ({ ...prev, [name]: val, ...(name === 'forma_pago' && { requiere_factura: val === 'factura' }) }));
  };

  const handleProductRowChange = (index: number, field: keyof ProductoPedido, value: string | number) => {
    const nuevosProductos = productos.map((item, idx) => {
        if (index !== idx) return item;
  return { ...item, [field]: value };
    });
    recalculatePricesForProducts(nuevosProductos);
  };

  const agregarProducto = () => setProductos(prev => [...prev, { ...initialProductoItem }]);
  const eliminarProducto = (index: number) => {
    const nuevosProductos = productos.filter((_, i) => i !== index);
    recalculatePricesForProducts(nuevosProductos);
  };
  
  const handleImprimir = useCallback((documentos: string[]) => {
    setDocumentosAImprimir(documentos);
  }, []);

  useEffect(() => {
    if (documentosAImprimir.length > 0) {
      document.title = `Venta Puerta - #${id}`;
      window.print();
      setDocumentosAImprimir([]);
    }
  }, [documentosAImprimir, id]);

  const handleSubmit = async (e: React.FormEvent ) => {
    e.preventDefault();
    setErrorMensaje(''); setSuccessMensaje('');
    if (!id || !formData.nombre_vendedor.trim()) { setErrorMensaje("ID o Vendedor no válidos."); return; }
    setIsSubmitting(true);
    const token = localStorage.getItem("token");
    if (!token) { setErrorMensaje("No autenticado."); setIsSubmitting(false); return; }
    const dataToUpdate = {
      nombre_vendedor: formData.nombre_vendedor.trim(), forma_pago: formData.forma_pago,
      monto_pagado_cliente: formData.monto_pagado, requiere_factura: formData.requiere_factura,
      observaciones: formData.observaciones || "", monto_total_base: montoBaseProductos,
      monto_total_final_con_recargos: displayTotal,
      items: productos.filter(item => item.producto_id > 0 && item.cantidad > 0).map(item => ({
          producto_id: item.producto_id, cantidad: item.cantidad,
          observacion_item: item.observacion_item || "",
      })),
    };
    try {
      const response = await fetch(`https://quimex.sistemataup.online/ventas/actualizar/${id}`, {
        method: "PUT", headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},
        body: JSON.stringify(dataToUpdate),
      });
      const result = await response.json();
      if(!response.ok) throw new Error(result?.message || 'Error al actualizar el pedido.');
      setSuccessMensaje("¡Pedido actualizado con éxito!");
      handleImprimir(['comprobante', 'comprobante']); // IMPRIME 2 AL ACTUALIZAR
      setTimeout(() => onVolver(), 2000);
    } catch (err) {
      if(err instanceof Error) setErrorMensaje(err.message);
      else setErrorMensaje("Error de red.");
    } finally {
        setIsSubmitting(false);
    }
  };

  if (isLoading) { return <div className="flex items-center justify-center min-h-screen bg-indigo-900"><p className="text-white text-xl">Cargando datos...</p></div>; }
  
  const ventaDataParaTicket: VentaData = {
      venta_id: id, fecha_emision: formData.fecha_emision, cliente: { nombre: "CONSUMIDOR FINAL" },
      nombre_vendedor: formData.nombre_vendedor.trim(),
      items: productos.map(p => ({
        producto_id: p.producto_id,
        producto_nombre: productosContext.productos.find(prod => prod.id === p.producto_id)?.nombre || `ID:${p.producto_id}`,
        cantidad: p.cantidad,
        precio_total_item_ars: (p.total_linea || 0) * (totalCalculadoApi && montoBaseProductos > 0 ? totalCalculadoApi.monto_final_con_recargos / montoBaseProductos : 1)
      })),
      total_final: displayTotal, observaciones: formData.observaciones,
      forma_pago: formData.forma_pago,
      monto_pagado_cliente: formData.monto_pagado,
      vuelto_calculado: formData.vuelto,
  };

  return (
    <>
      <div className="flex items-center justify-center min-h-screen bg-indigo-900 py-10 px-4 print:hidden">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-5xl">
          <BotonVolver onClick={onVolver} />
          <h2 className="text-3xl font-bold text-center text-indigo-800 mb-4">
            Actualizar Venta en Puerta #{id}
          </h2>
          {errorMensaje && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert"><p>{errorMensaje}</p></div>}
          {successMensaje && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4" role="alert"><p>{successMensaje}</p></div>}
          <form onSubmit={handleSubmit} className="space-y-6">
            <fieldset className="border p-4 rounded-md">
              <legend className="text-lg font-medium text-gray-700 px-2">Datos Generales</legend>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Vendedor*</label>
                  <select name="nombre_vendedor" value={formData.nombre_vendedor} onChange={handleFormChange} required className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                      <option value="" disabled>-- Seleccione --</option>
                      {VENDEDORES.map(v => <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>)}
                  </select>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Emisión</label><input type="datetime-local" value={formData.fecha_emision ? formData.fecha_emision.substring(0,16) : ''} readOnly disabled className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 bg-gray-100 cursor-not-allowed"/></div>
                <div className="md:col-span-3"><label className="block text-sm font-medium text-gray-700 mb-1">Observaciones Generales</label><textarea name="observaciones" value={formData.observaciones || ''} onChange={handleFormChange} rows={2} className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"/></div>
              </div>
            </fieldset>

            <fieldset className="border p-4 rounded-md">
              <legend className="text-lg font-medium text-gray-700 px-2">Productos</legend>
              <div className="mb-2 hidden md:grid md:grid-cols-[1fr_80px_1fr_100px_100px_40px] items-center gap-2 font-semibold text-sm text-gray-600 px-3">
                <span>Producto</span><span className="text-center">Cant.</span><span>Observación</span><span className="text-right">P. Unit.</span><span className="text-right">Total</span><span></span>
              </div>
              <div className="space-y-3">
                {productos.map((item, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-[1fr_80px_1fr_100px_100px_40px] items-center gap-2 border-b pb-2 last:border-b-0">
                    <Select options={opcionesDeProductoParaSelect} value={opcionesDeProductoParaSelect.find(opt => opt.value === item.producto_id) || null}
                        onChange={(selectedOption) => handleProductRowChange(index, 'producto_id', selectedOption?.value || 0)}
                        className="text-sm react-select-container" classNamePrefix="react-select"/>
                    <input type="number" value={item.cantidad} onChange={(e) => handleProductRowChange(index, 'cantidad', parseFloat(e.target.value) || 0)} onWheel={(e) => (e.target as HTMLInputElement).blur()}
                      className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 text-center focus:outline-none focus:ring-1 focus:ring-indigo-500 no-spinners" min="0" step="any"/>
                    <input type="text" value={item.observacion_item || ''} onChange={(e) => handleProductRowChange(index, 'observacion_item', e.target.value)} className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"/>
                    <input type="text" readOnly disabled value={`$ ${(item.precio_unitario || 0).toFixed(2)}`} className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 bg-gray-100 text-right"/>
                    <input type="text" readOnly disabled value={`$ ${(item.total_linea || 0).toFixed(2)}`} className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 bg-gray-100 text-right"/>
                    <button type="button" onClick={() => eliminarProducto(index)} title="Eliminar" className="text-red-500 hover:text-red-700 font-bold text-xl">×</button>
                  </div>
                ))}
                <button type="button" onClick={agregarProducto} className="mt-2 bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 text-sm">+ Agregar Producto</button>
              </div>
            </fieldset>

            <fieldset className="border p-4 rounded-md">
              <legend className="text-lg font-medium text-gray-700 px-2">Pago y Totales</legend>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Forma de Pago</label>
                  <select name="forma_pago" value={formData.forma_pago} onChange={handleFormChange} className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                    <option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="factura">Factura</option>
                  </select>
                </div>

                {formData.forma_pago === 'efectivo' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Monto Pagado *</label>
                      <input type="number" name="monto_pagado" value={formData.monto_pagado} onChange={handleFormChange} className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 no-spinners" min="0" step="0.01" required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Vuelto</label>
                      <input type="text" readOnly value={`$ ${formData.vuelto.toFixed(2)}`} className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 bg-gray-100 text-right"/>
                    </div>
                  </>
                )}
              </div>
              <div className="mt-4 text-right">
                {isCalculatingTotal && <p className="text-sm text-blue-600 italic">Calculando...</p>}
                {totalCalculadoApi && (<div className="text-xs text-gray-600 mb-1"><span>Base: ${totalCalculadoApi.monto_base.toFixed(2)}</span>{totalCalculadoApi.recargos.transferencia > 0 && <span className="ml-2">Rec.T: ${totalCalculadoApi.recargos.transferencia.toFixed(2)}</span>}{totalCalculadoApi.recargos.factura_iva > 0 && <span className="ml-2">IVA: ${totalCalculadoApi.recargos.factura_iva.toFixed(2)}</span>}</div>)}
                <label className="block text-sm font-medium text-gray-500">Total Pedido</label>
                <input type="text" value={`$ ${displayTotal.toFixed(2)}`} readOnly className="w-full md:w-auto md:max-w-xs inline-block bg-gray-100 shadow-sm border rounded py-2 px-3 text-gray-900 text-right font-bold text-lg"/>
              </div>
            </fieldset>
            
            <div className="flex justify-between items-center mt-8">
              <button type="button" onClick={() => handleImprimir(['comprobante', 'comprobante', 'orden_de_trabajo'])} className="bg-gray-500 text-white px-6 py-2 rounded-md hover:bg-gray-600 font-semibold">
                Reimprimir Todo (3)
              </button>
              <button type="submit" className="bg-green-600 text-white px-8 py-3 rounded-md hover:bg-green-700 font-semibold text-lg" disabled={isLoading || isSubmitting || isCalculatingTotal}>
                {isSubmitting ? 'Actualizando...' : 'Actualizar e Imprimir (2)'}
              </button>
            </div>
          </form>
        </div>
      </div>
      
      <div id="presupuesto-imprimible" className="hidden print:block">
        {documentosAImprimir.map((tipo, index) => (
          <React.Fragment key={index}>
            {index > 0 && <div style={{ pageBreakBefore: 'always' }}></div>}
            <Ticket tipo={tipo as 'comprobante' | 'orden_de_trabajo'} ventaData={ventaDataParaTicket} />
          </React.Fragment>
        ))}
      </div>

      <style jsx global>{`
        .inputD { @apply shadow-sm border rounded w-full py-2 px-3 text-gray-700 bg-gray-100 cursor-not-allowed; }
        .inputE { @apply shadow-sm border rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500; }
        .blockT { @apply block text-sm font-medium text-gray-700 mb-1; }
        .no-spinners::-webkit-outer-spin-button, .no-spinners::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .no-spinners { -moz-appearance: textfield; }
        .react-select__control { border-color: rgb(209 213 219) !important; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05) !important; min-height: 42px !important; }
        .react-select__control--is-focused { border-color: rgb(99 102 241) !important; box-shadow: 0 0 0 1px rgb(99 102 241) !important; }
      `}</style>
    </>
  );
}