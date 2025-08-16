"use client";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useProductsContextActivos, Producto as ProductoContextType } from "@/context/ProductsContextActivos";
import Select from 'react-select';
import { useRouter } from 'next/navigation';
import BotonVolver from "@/components/BotonVolver";
import Ticket, { VentaData } from '@/components/Ticket';

// --- CAMBIO: Se actualizan los tipos para incluir descuentos ---
type ProductoPedido = { producto: number; qx: number; precio: number; descuento: number; total: number; observacion?: string; };
interface IFormData { 
    clienteId: string | null; 
    cuit: string; 
    fechaEmision: string; 
    formaPago: string; 
    montoPagado: number; 
    descuentoTotal: number; // <-- NUEVO
    vuelto: number; 
    requiereFactura: boolean; 
    observaciones?: string; 
}
interface TotalCalculadoAPI { monto_base: number; forma_pago_aplicada: string; requiere_factura_aplicada: boolean; recargos: { transferencia: number; factura_iva: number; }; monto_final_con_recargos: number; }

const initialFormData: IFormData = { clienteId: null, cuit: "", fechaEmision: "", formaPago: "efectivo", montoPagado: 0, descuentoTotal: 0, vuelto: 0, requiereFactura: false, observaciones: "" };
const initialProductos: ProductoPedido[] = [{ producto: 0, qx: 0, precio: 0, descuento: 0, total: 0, observacion: "" }];
const VENDEDORES = ["martin", "moises", "sergio", "gabriel", "mauricio", "elias", "ardiles", "redonedo"];

export default function RegistrarPedidoPuertaPage() {
    const [formData, setFormData] = useState<IFormData>(initialFormData);
    const [productos, setProductos] = useState<ProductoPedido[]>(initialProductos);
    const [totalCalculadoApi, setTotalCalculadoApi] = useState<TotalCalculadoAPI | null>(null);
    const [isCalculatingTotal, setIsCalculatingTotal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const productosContext = useProductsContextActivos();
    const [nombreVendedor, setNombreVendedor] = useState<string>('');
    const router = useRouter();
    const [lastVentaId, setLastVentaId] = useState<number | undefined>();
    const irAccionesPuerta = () => router.push('/acciones-puerta');

    const opcionesDeProductoParaSelect = useMemo(() =>
        productosContext?.productos.map((prod: ProductoContextType) => ({ value: prod.id, label: prod.nombre })) || [],
    [productosContext?.productos]);

    const resetearFormulario = useCallback(() => {
        const now = new Date();
        const fechaEmisionEstandar = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        setFormData({ ...initialFormData, fechaEmision: fechaEmisionEstandar });
        setProductos([{ ...initialProductos[0] }]);
        setTotalCalculadoApi(null); setNombreVendedor(''); setSuccessMessage(''); setErrorMessage('');
    }, []);

    useEffect(() => { resetearFormulario(); }, [resetearFormulario]);

    const montoBaseProductos = useMemo(() => productos.reduce((sum, item) => sum + (item.total || 0), 0), [productos]);

    const recalculatePricesForProducts = useCallback(async (currentProducts: ProductoPedido[]) => {
        const token = localStorage.getItem("token");
        if (!token) { setErrorMessage("No autenticado."); return; }

        const productQuantities = new Map<number, { totalQuantity: number; indices: number[] }>();
        currentProducts.forEach((p, index) => {
            if (p.producto > 0 && p.qx > 0) {
                const existing = productQuantities.get(p.producto) || { totalQuantity: 0, indices: [] };
                existing.totalQuantity += p.qx;
                existing.indices.push(index);
                productQuantities.set(p.producto, existing);
            }
        });
        const pricePromises = Array.from(productQuantities.entries()).map(async ([productoId, { totalQuantity, indices }]) => {
            try {
                const precioRes = await fetch(`https://quimex.sistemataup.online/productos/calcular_precio/${productoId}`, {
                    method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                    body: JSON.stringify({ producto_id: productoId, quantity: totalQuantity, cliente_id: null }),
                });
                if (!precioRes.ok) throw new Error((await precioRes.json()).message || "Error en API de precios.");
                const precioData = await precioRes.json();
                return { precioUnitario: precioData.precio_venta_unitario_ars || 0, indices };
          } catch (error) {
              if (error instanceof Error) {
                  setErrorMessage(prev => `${prev}\nError Prod ID ${productoId}: ${error.message}`);
              } else {
                  setErrorMessage(prev => `${prev}\nError Prod ID ${productoId}: Error desconocido.`);
              }
              return { precioUnitario: 0, indices };
          }
        });
        const priceResults = await Promise.all(pricePromises);
        const updatedProducts = [...currentProducts];
        priceResults.forEach(({ precioUnitario, indices }) => {
            indices.forEach(index => {
                const item = updatedProducts[index];
                item.precio = precioUnitario;
                // CAMBIO: Se aplica el descuento individual del ítem
                const totalBruto = precioUnitario * item.qx;
                item.total = totalBruto * (1 - (item.descuento / 100));
            });
        });
        updatedProducts.forEach(item => { if (item.producto === 0 || item.qx === 0) { item.precio = 0; item.total = 0; }});
        setProductos(updatedProducts);
    }, [setErrorMessage]);

    useEffect(() => {
        const recalcularTodo = async () => {
            if (montoBaseProductos <= 0 && formData.montoPagado <= 0 && formData.descuentoTotal <= 0) { setTotalCalculadoApi(null); setFormData(prev => ({ ...prev, vuelto: 0 })); return; }
            setIsCalculatingTotal(true); setErrorMessage(''); const token = localStorage.getItem("token"); if (!token) { setErrorMessage("No autenticado."); setIsCalculatingTotal(false); return; }
            try {
                const resTotal = await fetch("https://quimex.sistemataup.online/ventas/calcular_total", {
                    method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                    body: JSON.stringify({ monto_base: montoBaseProductos, forma_pago: formData.formaPago, requiere_factura: formData.requiereFactura }),
                });
                if (!resTotal.ok) throw new Error((await resTotal.json()).error || "Error al calcular total.");
                const dataTotal: TotalCalculadoAPI = await resTotal.json();
                setTotalCalculadoApi(dataTotal);

                // CAMBIO: El descuento total se aplica sobre el monto con recargos
                const montoConRecargos = dataTotal.monto_final_con_recargos;
                const montoFinalParaVuelto = montoConRecargos * (1 - (formData.descuentoTotal / 100));

                if (formData.montoPagado >= montoFinalParaVuelto && montoFinalParaVuelto > 0) {
                    const resVuelto = await fetch("https://quimex.sistemataup.online/ventas/calcular_vuelto", {
                        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                        body: JSON.stringify({ monto_pagado: formData.montoPagado, monto_total_final: montoFinalParaVuelto }),
                    });
                    if (!resVuelto.ok) throw new Error((await resVuelto.json()).error || "Error calculando vuelto.");
                    const dataVuelto = await resVuelto.json();
                    setFormData(prev => ({ ...prev, vuelto: parseFloat((dataVuelto.vuelto || 0).toFixed(2)) }));
                } else { setFormData(prev => ({ ...prev, vuelto: 0 })); }
          } catch (error) {
              if (error instanceof Error) {
                  setErrorMessage(error.message);
              } else {
                  setErrorMessage("Un error desconocido ocurrió al recalcular.");
              }
              setTotalCalculadoApi(null);
              setFormData(prev => ({ ...prev, vuelto: 0 }));
          } finally {
              setIsCalculatingTotal(false);
          }
        };
        recalcularTodo();
    }, [montoBaseProductos, formData.formaPago, formData.requiereFactura, formData.montoPagado, formData.descuentoTotal]);
    
    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        let val: string | number | boolean = value;
        if (type === 'checkbox') { val = (e.target as HTMLInputElement).checked; }
        else if (type === 'number') {
            val = parseFloat(value) || 0;
            if (name === 'descuentoTotal') { val = Math.max(0, Math.min(100, val)); }
        }
        setFormData(prev => ({ ...prev, [name]: val, ...(name === 'formaPago' && { requiereFactura: val === 'factura' }) }));
    };

    const handleProductSelectChange = useCallback(async (index: number, selectedOption: { value: number; label: string } | null) => {
        const nuevosProductos = [...productos];
        if (selectedOption) { nuevosProductos[index] = { ...nuevosProductos[index], producto: selectedOption.value, qx: nuevosProductos[index].qx > 0 ? nuevosProductos[index].qx : 0 }; }
        else { nuevosProductos[index] = { ...initialProductos[0] }; }
        await recalculatePricesForProducts(nuevosProductos);
    }, [productos, recalculatePricesForProducts]);

    const handleProductRowInputChange = useCallback(async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        const nuevosProductos = [...productos];
        const item = nuevosProductos[index];
        if (name === "qx") item.qx = parseFloat(value) || 0;
        else if (name === "observacion") item.observacion = value;
        else if (name === "descuento") { // <-- NUEVO
            item.descuento = Math.max(0, Math.min(100, parseFloat(value) || 0));
        }
        await recalculatePricesForProducts(nuevosProductos);
    }, [productos, recalculatePricesForProducts]);

    const agregarProducto = () => setProductos([...productos, { ...initialProductos[0] }]);
    const eliminarProducto = useCallback(async (index: number) => {
        const nuevosProductos = productos.filter((_, i) => i !== index);
        if (nuevosProductos.length === 0) { nuevosProductos.push({ ...initialProductos[0] }); }
        await recalculatePricesForProducts(nuevosProductos);
    }, [productos, recalculatePricesForProducts]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setIsSubmitting(true); setSuccessMessage(''); setErrorMessage('');
        if (!nombreVendedor.trim()) { setErrorMessage("Seleccione un vendedor."); setIsSubmitting(false); return; }
        if (productos.every(p => p.producto === 0 || p.qx === 0)) { setErrorMessage("Añada al menos un producto."); setIsSubmitting(false); return; }
        const token = localStorage.getItem("token"); const usuarioId = localStorage.getItem("usuario_id");
        if (!token || !usuarioId) { setErrorMessage("Sesión inválida."); setIsSubmitting(false); return; }
        
        // CAMBIO: Se calcula el total final para enviarlo a la API
        const baseTotalConRecargos = totalCalculadoApi ? totalCalculadoApi.monto_final_con_recargos : montoBaseProductos;
        const totalFinalNeto = Math.max(0, baseTotalConRecargos * (1 - (formData.descuentoTotal / 100)));

        const dataPayload = {
            usuario_interno_id: parseInt(usuarioId), nombre_vendedor: nombreVendedor.trim(),
            items: productos.filter(i => i.producto !== 0 && i.qx > 0).map(i => ({ 
                producto_id: i.producto, cantidad: i.qx, 
                observacion_item: i.observacion || "",
                descuento_item_porcentaje: i.descuento, // <-- NUEVO
            })),
            cliente_id: null, fecha_pedido: formData.fechaEmision, direccion_entrega: "", cuit_cliente: "", 
            monto_pagado_cliente: formData.montoPagado, forma_pago: formData.formaPago, 
            requiere_factura: formData.requiereFactura, observaciones: formData.observaciones || "",
            descuento_total_global_porcentaje: formData.descuentoTotal, // <-- NUEVO
            monto_final_con_recargos: totalFinalNeto, // <-- Se envía el total con todos los descuentos
        };
        try {
            const response = await fetch("https://quimex.sistemataup.online/ventas/registrar", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(dataPayload),
            });
            const result = await response.json();
            if (response.ok) {
                setSuccessMessage("¡Venta registrada exitosamente!"); setLastVentaId(result.venta_id);
                setTimeout(() => { handleImprimirPresupuesto(result.venta_id); }, 100);
            } else { setErrorMessage(result.message || result.error || "Error al registrar."); }
      } catch (err) {
          if (err instanceof Error) {
              setErrorMessage(err.message);
          } else {
              setErrorMessage("Error de red o un error desconocido ocurrió.");
          }
      } finally {
          setIsSubmitting(false);
      }
    };
    
    const handleImprimirPresupuesto = (ventaId: number) => {
        document.title = `Venta Puerta - #${ventaId}`;
        window.print();
        setTimeout(() => { resetearFormulario(); irAccionesPuerta(); }, 1500);
    };

    const baseTotalConRecargos = totalCalculadoApi ? totalCalculadoApi.monto_final_con_recargos : montoBaseProductos;
    const displayTotal = Math.max(0, baseTotalConRecargos * (1 - (formData.descuentoTotal / 100)));

    const ventaDataParaTicket: VentaData = {
        venta_id: lastVentaId,
        fecha_emision: formData.fechaEmision,
        cliente: { nombre: "CONSUMIDOR FINAL" },
        nombre_vendedor: nombreVendedor.trim(),
         items: productos.filter(p => p.producto && p.qx > 0).map(item => {
            const pInfo = productosContext?.productos.find(p => p.id === item.producto);
            // El total del item ya tiene el descuento individual aplicado, solo falta el recargo
            const totalItemConRecargo = item.total * (totalCalculadoApi && montoBaseProductos > 0 ? totalCalculadoApi.monto_final_con_recargos / montoBaseProductos : 1);
            return {
                producto_id: item.producto,
                producto_nombre: pInfo?.nombre || `ID: ${item.producto}`,
                cantidad: item.qx,
                precio_total_item_ars: totalItemConRecargo,
            };
        }),
        total_final: displayTotal,
        observaciones: formData.observaciones,
        forma_pago: formData.formaPago,
    };


return (
  <>
    {/* Contenedor principal con fondo oscuro */}
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-indigo-900 py-10 px-4 print:hidden">
        {/* Panel del formulario con sombra realzada */}
        <div className="bg-white p-6 md:p-8 rounded-xl shadow-2xl w-full max-w-5xl border border-gray-200">
            <BotonVolver className="ml-0" />
            <h2 className="text-3xl font-bold text-center text-indigo-800 mb-4">Registrar Venta en Local</h2>
            
            {/* --- SECCIÓN VENDEDOR --- */}
            <div className="mb-6">
                <label htmlFor="nombreVendedor" className="block text-sm font-medium text-gray-700 mb-1">Vendedor*</label>
                <select id="nombreVendedor" value={nombreVendedor} onChange={(e) => setNombreVendedor(e.target.value)} required
                    className="shadow-sm border border-gray-300 rounded-md w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="" disabled>-- Seleccione un vendedor --</option>
                    {VENDEDORES.map(v => <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>)}
                </select>
            </div>
            
            {/* --- MENSAJES DE ESTADO --- */}
            {errorMessage && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4 rounded-r-md" onClick={() => setErrorMessage('')}><p>{errorMessage}</p></div>}
            {successMessage && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4 rounded-r-md"><p>{successMessage}</p></div>}
            
            <form onSubmit={handleSubmit} className="space-y-6">
                
                {/* --- CAMBIO DE ESTILO: Fieldset con fondo y sombra sutil --- */}
                <fieldset className="bg-gray-50 border border-gray-200 p-4 rounded-lg shadow-sm">
                    <legend className="text-lg font-semibold text-gray-800 px-2">Productos</legend>
                    {/* Encabezados de la tabla de productos */}
                    <div className="mb-3 hidden md:grid md:grid-cols-[minmax(0,1fr)_80px_minmax(0,1fr)_100px_100px_32px] items-center gap-2 font-bold text-sm text-gray-600 px-3">
                        <span>Producto*</span><span className="text-center">Cant*</span><span>Observación</span>
                        <span className="text-right">Precio U.</span><span className="text-right">Total</span><span />
                    </div>
                    {/* Filas de productos */}
                    <div className="space-y-3">
                        {productos.map((item, index) => (
                            <div key={index} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_80px_minmax(0,1fr)_100px_100px_32px] items-center gap-2 border-b border-gray-200 pb-3 last:border-b-0">
                                <Select name={`producto-${index}`} options={opcionesDeProductoParaSelect} value={opcionesDeProductoParaSelect.find(opt => opt.value === item.producto) || null}
                                    onChange={(selectedOption) => handleProductSelectChange(index, selectedOption)} placeholder="Buscar producto..." isClearable isSearchable
                                    isLoading={productosContext.loading} className="text-sm react-select-container" classNamePrefix="react-select" />
                                <input type="number" name="qx" placeholder="Cant." value={item.qx === 0 ? '' : item.qx} onChange={(e) => handleProductRowInputChange(index, e)} min="0" step="any" required
                                    className="shadow-sm border border-gray-300 rounded-md w-full py-2 px-2 text-gray-700 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500 no-spinners"/>
                                <input type="text" name="observacion" placeholder="Obs. ítem" value={item.observacion || ''} onChange={(e) => handleProductRowInputChange(index, e)}
                                    className="shadow-sm border border-gray-300 rounded-md w-full py-2 px-2 text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                <input type="text" value={`$ ${item.precio.toFixed(2)}`} readOnly className="shadow-sm border border-gray-300 rounded-md w-full py-2 px-2 text-gray-700 text-right bg-gray-100 cursor-not-allowed"/>
                                <input type="text" value={`$ ${item.total.toFixed(2)}`} readOnly className="shadow-sm border border-gray-300 rounded-md w-full py-2 px-2 text-gray-700 text-right bg-gray-100 cursor-not-allowed"/>
                                <div className="flex justify-end md:justify-center items-center">
                                    {productos.length > 1 && <button type="button" onClick={() => eliminarProducto(index)} title="Eliminar producto" className="text-red-500 hover:text-red-700 font-bold text-2xl leading-none p-1 rounded-full flex items-center justify-center h-8 w-8 hover:bg-red-100 transition-colors">×</button>}
                                </div>
                            </div>
                        ))}
                    </div>
                    <button type="button" onClick={agregarProducto} className="mt-4 bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors text-sm font-semibold">
                        + Agregar Producto
                    </button>
                </fieldset>

                {/* --- CAMBIO DE ESTILO: Fieldset con fondo y sombra sutil --- */}
                <fieldset className="bg-gray-50 border border-gray-200 p-4 rounded-lg shadow-sm">
                    <legend className="text-lg font-semibold text-gray-800 px-2">Pago y Totales</legend>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="formaPago">Forma de Pago</label>
                            <select id="formaPago" name="formaPago" value={formData.formaPago} onChange={handleFormChange} className="w-full shadow-sm border border-gray-300 rounded-md py-2 px-3 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                <option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="factura">Factura</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="montoPagado">Monto Pagado</label>
                            <input id="montoPagado" type="number" name="montoPagado" value={formData.montoPagado === 0 ? '' : formData.montoPagado} onChange={handleFormChange}
                                className="w-full bg-white shadow-sm border border-gray-300 rounded-md py-2 px-3 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 no-spinners" placeholder="0.00" step="0.01" min="0" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="vuelto">Vuelto</label>
                            <input id="vuelto" type="text" name="vuelto" readOnly value={`$ ${formData.vuelto.toFixed(2)}`}
                                className="w-full bg-gray-200 shadow-sm border border-gray-300 rounded-md py-2 px-3 text-gray-800 focus:outline-none text-right font-medium cursor-not-allowed"/>
                        </div>
                    </div>
                    <div className="mt-6 text-right space-y-2">
                        {isCalculatingTotal && <p className="text-sm text-blue-600 italic">Calculando total...</p>}
                        {totalCalculadoApi && (
                            <div className="text-xs text-gray-600 mb-1 p-2 bg-gray-200 rounded-md inline-block">
                                <span>Base: ${totalCalculadoApi.monto_base.toFixed(2)}</span>
                                {totalCalculadoApi.recargos.transferencia > 0 && <span className="ml-3">Rec. Transf: ${totalCalculadoApi.recargos.transferencia.toFixed(2)}</span>}
                                {totalCalculadoApi.recargos.factura_iva > 0 && <span className="ml-3">IVA: ${totalCalculadoApi.recargos.factura_iva.toFixed(2)}</span>}
                            </div>
                        )}
                        <div className="flex justify-end items-center">
                             <label className="block text-base font-semibold text-gray-600 mr-4">Total Pedido</label>
                            <input type="text" value={`$ ${displayTotal.toFixed(2)}`} readOnly
                                className="w-full md:w-auto md:max-w-xs inline-block bg-gray-200 shadow-inner border border-gray-300 rounded-md py-2 px-4 text-gray-900 text-right font-bold text-xl cursor-not-allowed"/>
                        </div>
                    </div>
                </fieldset>

                <div className="flex justify-end pt-4">
                    <button type="submit" className="bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 font-semibold text-lg disabled:opacity-50 transition-all transform hover:scale-105 shadow-lg" disabled={isSubmitting || isCalculatingTotal || !nombreVendedor.trim()}>
                        {isSubmitting ? 'Registrando...' : 'Registrar Venta'}
                    </button>
                </div>
            </form>
        </div>
    </div>

    {/* Contenedor para la impresión */}
    <div id="presupuesto-imprimible" className="hidden print:block">
        <Ticket tipo="comprobante" ventaData={ventaDataParaTicket} />
        <div style={{ pageBreakBefore: 'always' }}></div>
        <Ticket tipo="comprobante" ventaData={ventaDataParaTicket} />
    </div>
    
    <style jsx global>{`
      .no-spinners::-webkit-outer-spin-button, .no-spinners::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      .no-spinners { -moz-appearance: textfield; }
      .react-select__control { border-color: #d1d5db !important; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05) !important; min-height: 42px !important; border-radius: 0.375rem !important;}
      .react-select__control--is-focused { border-color: #4f46e5 !important; box-shadow: 0 0 0 2px #c7d2fe !important; }
      .react-select__option { background-color: white; color: #333; }
      .react-select__option--is-focused { background-color: #e0e7ff !important; color: #1e1b4b !important; }
      .react-select__option--is-selected { background-color: #4f46e5 !important; color: white !important; }     
    `}</style>
  </>
);
}