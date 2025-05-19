"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useProductsContext, Producto as ProductoContextType } from "@/context/ProductsContext";
import { useClientesContext, Cliente } from "@/context/ClientesContext";

type ProductoPedido = {
  producto: number;
  qx: number;
  precio: number;
  total: number;
};

interface IFormData {
  clienteId: string | null;
  cuit: string;
  // nombre: string; // El nombre del cliente se obtiene del contexto/selección
  // direccion: string; // La dirección no está en este formulario de "puerta"
  fechaEmision: string;
  formaPago: string;
  montoPagado: number;
  vuelto: number;
  requiereFactura: boolean; // Campo para el cálculo del total
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

export default function RegistrarPedidoPuertaPage() {
  const {
    clientes,
    loading: loadingClientes,
    error: errorClientes,
  } = useClientesContext();

  const [formData, setFormData] = useState<IFormData>({
    clienteId: null,
    cuit: "",
    // nombre: "", // Se deriva del cliente seleccionado
    // direccion: "", // No es parte de este formulario
    fechaEmision: "",
    formaPago: "efectivo",
    montoPagado: 0,
    vuelto: 0,
    requiereFactura: false,
    observaciones: "",
  });

  const [productos, setProductos] = useState<ProductoPedido[]>([
    { producto: 0, qx: 0, precio: 0, total: 0 },
  ]);

  const [totalCalculadoApi, setTotalCalculadoApi] = useState<TotalCalculadoAPI | null>(null);
  const [isCalculatingTotal, setIsCalculatingTotal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const productosContext = useProductsContext();

  // Inicializar fechaEmision al montar
  useEffect(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setFormData(prev => ({...prev, fechaEmision: now.toISOString().slice(0, 16)}));
  }, []);


  const montoBaseProductos = useMemo(() => {
    return productos.reduce((sum, item) => sum + (item.total || 0), 0);
  }, [productos]);

  // useEffect para llamar a /ventas/calcular_total y luego /ventas/calcular_vuelto
  useEffect(() => {
    const recalcularTodo = async () => {
      if (montoBaseProductos <= 0) {
        setTotalCalculadoApi(null);
        setFormData(prev => ({ ...prev, vuelto: 0 }));
        return;
      }
      setIsCalculatingTotal(true);
      setErrorMessage(''); // Limpiar errores previos
      const token = localStorage.getItem("token");
      if (!token) {
        setErrorMessage("No autenticado para calcular total.");
        setIsCalculatingTotal(false);
        return;
      }

      let montoFinalParaVuelto = montoBaseProductos;

      try {
        // 1. Calcular total con recargos
        const resTotal = await fetch("https://quimex.sistemataup.online/ventas/calcular_total", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({
            monto_base: montoBaseProductos,
            forma_pago: formData.formaPago,
            requiere_factura: formData.requiereFactura,
          }),
        });
        if (!resTotal.ok) {
          const errDataTotal = await resTotal.json().catch(() => ({ error: "Error en API cálculo total."}));
          throw new Error(errDataTotal.error || `Error ${resTotal.status} al calcular total.`);
        }
        const dataTotal: TotalCalculadoAPI = await resTotal.json();
        setTotalCalculadoApi(dataTotal);
        montoFinalParaVuelto = dataTotal.monto_final_con_recargos;

        // 2. Calcular vuelto basado en el nuevo total y monto pagado
        if (formData.montoPagado >= montoFinalParaVuelto && montoFinalParaVuelto > 0) {
            const resVuelto = await fetch("https://quimex.sistemataup.online/ventas/calcular_vuelto", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({
                    monto_pagado: formData.montoPagado,
                    monto_total_final: montoFinalParaVuelto,
                }),
            });
            if(!resVuelto.ok){
                const errDataVuelto = await resVuelto.json().catch(() => ({ error: "Error API vuelto."}));
                throw new Error(errDataVuelto.error || `Error ${resVuelto.status} calculando vuelto.`);
            }
            const dataVuelto = await resVuelto.json();
            setFormData(prev => ({ ...prev, vuelto: parseFloat((dataVuelto.vuelto || 0).toFixed(2)) }));
        } else {
            setFormData(prev => ({ ...prev, vuelto: 0 }));
        }
      }//eslint-disable-next-line
       catch (error: any) {
        console.error("Error en recalcularTodo:", error);
        setErrorMessage(error.message || "Error al recalcular totales/vuelto.");
        setTotalCalculadoApi(null);
        setFormData(prev => ({ ...prev, vuelto: 0 }));
      } finally {
        setIsCalculatingTotal(false);
      }
    };

    recalcularTodo();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [montoBaseProductos, formData.formaPago, formData.requiereFactura, formData.montoPagado]);


  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked :
                type === 'number' ? parseFloat(value) || 0 : value;
    setFormData((prev) => ({ ...prev, [name]: val }));
  };

  const handleClienteSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    const selectedCliente = clientes.find(c => String(c.id) === selectedId);
    setFormData(prev => ({
      ...prev,
      clienteId: selectedId || null,
      cuit: selectedCliente ? String(selectedCliente.cuit || '') : "",
      // No autocompletamos 'nombre' ni 'direccion' en formData aquí, se obtienen de `selectedClienteInfo` para la UI
    }));
  };

  const handleProductoChange = async (
    index: number,
    e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    const nuevosProductos = [...productos];
    const currentProductItem = nuevosProductos[index];

    if (name === "qx") currentProductItem.qx = parseInt(value) || 0;
    else if (name === "producto") currentProductItem.producto = parseInt(value) || 0;
    
    const productoId = currentProductItem.producto;
    const cantidad = currentProductItem.qx;

    if (productoId && cantidad > 0) {
      try {
        const token = localStorage.getItem("token");
        const precioRes = await fetch(`https://quimex.sistemataup.online/productos/calcular_precio/${productoId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ producto_id: productoId, quantity: cantidad }),
        });
        if (!precioRes.ok) {
          const errData = await precioRes.json().catch(()=>({message:"Error calculando precio."}));
          throw new Error(errData.message);
        }
        const precioData = await precioRes.json();
        currentProductItem.precio = precioData.precio_venta_unitario_ars || 0;
        currentProductItem.total = precioData.precio_total_calculado_ars || 0;
      } catch (error) {
        console.error("Error en carga de precio:", error);
        currentProductItem.precio = 0; currentProductItem.total = 0;
      }
    } else {
      currentProductItem.precio = 0; currentProductItem.total = 0;
    }
    setProductos(nuevosProductos);
  };

  const agregarProducto = () => setProductos([...productos, { producto: 0, qx: 0, precio: 0, total: 0 }]);
  const eliminarProducto = (index: number) => {
    const nuevosProductos = [...productos];
    nuevosProductos.splice(index, 1);
    if (nuevosProductos.length === 0) nuevosProductos.push({ producto: 0, qx: 0, precio: 0, total: 0 });
    setProductos(nuevosProductos);
  };
  
  const handleMontoPagadoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: Math.max(0, parseFloat(value) || 0) }));
  };

  const handleSubmit = async (e: React.FormEvent ) => {
    e.preventDefault(); setIsSubmitting(true); setSuccessMessage(''); setErrorMessage('');

    if (!formData.clienteId) {
        setErrorMessage("Seleccione un cliente."); setIsSubmitting(false); return;
    }
    if (productos.every(p=>p.producto===0||p.qx===0)) {
        setErrorMessage("Añada al menos un producto."); setIsSubmitting(false); return;
    }
    if (!totalCalculadoApi && montoBaseProductos > 0) {
        setErrorMessage("Error calculando el total final. Verifique forma de pago."); setIsSubmitting(false); return;
    }
    
    const token = localStorage.getItem("token");
    if (!token) { setErrorMessage("No autenticado."); setIsSubmitting(false); return; }

    const dataPayload = {
      usuario_interno_id: 1,
      items: productos.filter(i=>i.producto!==0&&i.qx>0).map(i=>({producto_id:i.producto,cantidad:i.qx})),
      cliente_id: parseInt(formData.clienteId),
      fecha_emision: formData.fechaEmision || new Date().toISOString().slice(0,16),
      fecha_pedido: formData.fechaEmision || new Date().toISOString().slice(0,16), // Para "en puerta", fecha_pedido = fecha_emision
      direccion_entrega: "", // Pedido en puerta no tiene dirección de entrega específica del pedido
      cuit_cliente: formData.cuit,
      monto_pagado_cliente: formData.montoPagado,
      forma_pago: formData.formaPago,
      vuelto: formData.vuelto,
      requiere_factura: formData.requiereFactura,
      monto_total_base: montoBaseProductos,
      monto_total_final_con_recargos: totalCalculadoApi ? totalCalculadoApi.monto_final_con_recargos : montoBaseProductos,
      observaciones: formData.observaciones || "",
    };
    
    console.log("Enviando datos (Registrar Pedido Puerta):", dataPayload);

    try {
      const response = await fetch("https://quimex.sistemataup.online/ventas/registrar", {
        method: "POST",
        headers: {"Content-Type":"application/json","Authorization":`Bearer ${token}`},
        body: JSON.stringify(dataPayload),
      });
      const result = await response.json();
      if (response.ok) {
        setSuccessMessage("¡Pedido registrado exitosamente!");
        // Limpiar formulario para un nuevo pedido
        const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        setFormData({
            clienteId: null, cuit: "", fechaEmision: now.toISOString().slice(0,16),
            formaPago:"efectivo", montoPagado:0, vuelto:0, requiereFactura: false, observaciones: ""
        });
        setProductos([{ producto: 0, qx: 0, precio: 0, total: 0 }]);
        setTotalCalculadoApi(null);
         if (result.venta_id) handleImprimirPresupuesto(result.venta_id); 
      } else {
        setErrorMessage(result.message || result.detail || `Error ${response.status}`);
      }
      //eslint-disable-next-line
    } catch (err: any) {
      setErrorMessage(err.message || "Error de red.");
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleImprimirPresupuesto = (pedidoIdParaImprimir?: number) => { // pedidoIdParaImprimir opcional
    const clienteSeleccionado = formData.clienteId ? clientes.find(c => String(c.id) === formData.clienteId) : null;
    const nombreCliente = clienteSeleccionado?.nombre_razon_social || "Cliente";
    let fechaFormateada = "Fecha";
    if(formData.fechaEmision){try{fechaFormateada=new Date(formData.fechaEmision).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'});}catch(e){console.log(e);}}
    const numPedido = pedidoIdParaImprimir || "NUEVO"; // Si se pasa un ID (después de guardar) se usa, sino "NUEVO"

    const originalTitle = document.title;
    document.title = `Presupuesto QuiMex - Pedido ${numPedido} - ${nombreCliente} (${fechaFormateada})`;
    window.print();
    setTimeout(() => {document.title = originalTitle;}, 1000);
  };

  if (loadingClientes) {
    return <div className="flex items-center justify-center min-h-screen bg-indigo-900"><p className="text-white text-xl">Cargando clientes...</p></div>;
  }
  if (errorClientes) {
      return <div className="flex flex-col items-center justify-center min-h-screen bg-red-900 text-white p-4">
             <h2 className="text-2xl font-bold mb-4">Error al Cargar Clientes</h2><p className="bg-red-700 p-2 rounded mb-4 text-sm">{errorClientes}</p>
             <button onClick={()=>window.location.reload()} className="bg-white text-red-900 px-4 py-2 rounded hover:bg-gray-200">Reintentar</button>
         </div>;
  }

  const selectedClienteInfo = formData.clienteId ? clientes.find(c => String(c.id) === formData.clienteId) : null;
  const displayTotal = totalCalculadoApi ? totalCalculadoApi.monto_final_con_recargos : montoBaseProductos;

  return (
    <>
      <div className="flex items-center justify-center min-h-screen bg-indigo-900 py-10 px-4 print:hidden">
        <div className="bg-white p-6 md:p-8 rounded-lg shadow-md w-full max-w-4xl">
          <h2 className="text-2xl font-semibold mb-6 text-center text-indigo-800">Registrar Pedido en Puerta</h2>
          {errorMessage && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4"><p>{errorMessage}</p></div>}
          {successMessage && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4"><p>{successMessage}</p></div>}
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <fieldset className="border p-4 rounded-md">
              <legend className="text-lg font-medium text-gray-700 px-2">Datos Cliente/Pedido</legend>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="clienteId">Cliente*</label>
                  <select id="clienteId" name="clienteId" value={formData.clienteId || ""} onChange={handleClienteSelectChange} required
                    className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 disabled:bg-gray-100"
                    disabled={loadingClientes}>
                    <option value="">-- Selecciona Cliente --</option>
                    {clientes.map((cli: Cliente) => <option key={cli.id} value={String(cli.id)}>{cli.nombre_razon_social || `ID: ${cli.id}`}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="cuit">CUIT</label>
                  <input type="text" name="cuit" id="cuit" value={formData.cuit} onChange={handleFormChange} placeholder="Del cliente"
                    className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 bg-gray-100" readOnly disabled={!!formData.clienteId}/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="fechaEmision">Fecha Emisión*</label>
                  <input type="datetime-local" name="fechaEmision" id="fechaEmision" value={formData.fechaEmision} onChange={handleFormChange} required
                    className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"/>
                </div>
                <div className="md:col-span-3"> {/* Observaciones ocupando más espacio */}
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="observaciones">Observaciones</label>
                  <textarea id="observaciones" name="observaciones" value={formData.observaciones || ''} onChange={handleFormChange} rows={2}
                    className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"/>
                </div>
              </div>
            </fieldset>

            <fieldset className="border p-4 rounded-md">
              <legend className="text-lg font-medium text-gray-700 px-2">Productos</legend>
              <div className="mb-2 hidden md:grid md:grid-cols-[minmax(0,1fr)_90px_100px_100px_32px] items-center gap-2 font-semibold text-sm text-gray-600 px-3">
                <span>Producto*</span><span className="text-center">Cantidad*</span><span className="text-right">Precio U.</span><span className="text-right">Total</span><span />
              </div>
              <div className="space-y-3">
                {productos.map((item, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_90px_100px_100px_32px] items-center gap-2 border-b pb-2 last:border-b-0 md:border-none md:pb-0">
                    <div className="w-full">
                      <select name="producto" value={item.producto || 0} onChange={(e) => handleProductoChange(index, e)} required
                        className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                        <option value={0} disabled> -- Seleccionar -- </option>
                        {productosContext?.productos.map((prod: ProductoContextType) => <option value={prod.id} key={prod.id}>{prod.nombre}</option>)}
                      </select>
                    </div>
                    <div className="w-full">
                      <input type="number" name="qx" placeholder="Cant." value={item.qx === 0 ? '' : item.qx} onChange={(e) => handleProductoChange(index, e)} min="1" required
                        className="shadow-sm border rounded w-full py-2 px-2 text-gray-700 text-center focus:outline-none focus:ring-1 focus:ring-indigo-500"/>
                    </div>
                    <input type="text" value={`$ ${item.precio.toFixed(2)}`} readOnly className="shadow-sm border rounded w-full py-2 px-2 text-gray-700 text-right bg-gray-100"/>
                    <input type="text" value={`$ ${item.total.toFixed(2)}`} readOnly className="shadow-sm border rounded w-full py-2 px-2 text-gray-700 text-right bg-gray-100"/>
                    <div className="flex justify-end md:justify-center items-center">
                      {productos.length > 1 && <button type="button" onClick={() => eliminarProducto(index)} title="Eliminar producto" className="text-red-500 hover:text-red-700 font-bold text-xl leading-none p-1 rounded-full hover:bg-red-100">×</button>}
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={agregarProducto}
                className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 text-sm"
                disabled={!productosContext?.productos || productosContext.productos.length === 0}>
                + Agregar Producto
              </button>
            </fieldset>

            <fieldset className="border p-4 rounded-md">
              <legend className="text-lg font-medium text-gray-700 px-2">Pago y Totales</legend>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1fr_auto_1fr_1fr] gap-4 items-end">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="formaPago">Forma de Pago</label>
                  <select id="formaPago" name="formaPago" value={formData.formaPago} onChange={handleFormChange}
                    className="w-full shadow-sm border rounded py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                    <option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option>
                    <option value="tarjeta_credito">Tarjeta de Crédito</option><option value="tarjeta_debito">Tarjeta de Débito</option>
                    <option value="mercado_pago">Mercado Pago</option><option value="cuenta_corriente">Cta. Cte.</option>
                  </select>
                </div>
                <div className="flex items-center pt-5">
                    <input type="checkbox" id="requiereFactura" name="requiereFactura"
                           checked={formData.requiereFactura} onChange={handleFormChange}
                           className="h-5 w-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 mr-2"/>
                    <label className="text-sm font-medium text-gray-700" htmlFor="requiereFactura">¿Factura?</label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="montoPagado">Monto Pagado</label>
                  <input
                    id="montoPagado"
                    type="number"
                    name="montoPagado"
                    className="w-full bg-white shadow-sm border rounded py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    // Cambia esta línea:
                    value={formData.montoPagado === 0 ? '' : formData.montoPagado}
                    // O aún más simple si 0 es el único valor que quieres tratar como vacío:
                    // value={formData.montoPagado || ''}
                    onChange={handleMontoPagadoChange}
                    placeholder="0.00" // El placeholder es importante aquí
                    step="0.01"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="vuelto">Vuelto</label>
                  <input id="vuelto" type="text" name="vuelto" readOnly
                    className="w-full bg-gray-100 shadow-sm border rounded py-2 px-3 text-gray-700 focus:outline-none text-right"
                    value={`$ ${formData.vuelto.toFixed(2)}`}/>
                </div>
              </div>
              <div className="mt-4 text-right">
                {isCalculatingTotal && <p className="text-sm text-blue-600 italic">Calculando total...</p>}
                {totalCalculadoApi && (
                    <div className="text-xs text-gray-600 mb-1">
                        <span>Base: ${totalCalculadoApi.monto_base.toFixed(2)}</span>
                        {totalCalculadoApi.recargos.transferencia > 0 && <span className="ml-2">Rec. Transf: ${totalCalculadoApi.recargos.transferencia.toFixed(2)}</span>}
                        {totalCalculadoApi.recargos.factura_iva > 0 && <span className="ml-2">IVA: ${totalCalculadoApi.recargos.factura_iva.toFixed(2)}</span>}
                    </div>
                )}
                <label className="block text-sm font-medium text-gray-500 mb-1">Total Pedido (c/recargos)</label>
                <input type="text" value={`$ ${displayTotal.toFixed(2)}`} readOnly
                  className="w-full md:w-auto md:max-w-xs inline-block bg-gray-100 shadow-sm border rounded py-2 px-3 text-gray-900 text-right font-bold text-lg focus:outline-none"/>
              </div>
            </fieldset>

            <div className="flex flex-col sm:flex-row justify-end gap-4 mt-8">
              <button type="submit"
                className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 font-semibold order-1 sm:order-2 disabled:opacity-50"
                disabled={loadingClientes || isSubmitting || isCalculatingTotal}>
                {isSubmitting ? 'Registrando...' : 'Registrar Pedido'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* SECCIÓN PARA LA IMPRESIÓN DEL PRESUPUESTO */}
      <div id="presupuesto-imprimible" className="hidden print:block presupuesto-container">
        <header className="presupuesto-header">
          <div className="logo-container"><img src="/logo.png" alt="QuiMex" className="logo" /><p className="sub-logo-text">PRESUPUESTO NO VALIDO COMO FACTURA</p></div>
          <div className="info-empresa"><p>📱 11 2395 1494</p><p>📞 4261 3605</p><p>📸 quimex_berazategui</p></div>
        </header>
        <section className="datos-pedido">
          <table className="tabla-datos-principales"><tbody>
            <tr><td>PEDIDO</td><td>NUEVO</td></tr>
            <tr><td>FECHA</td><td>{formData.fechaEmision ? new Date(formData.fechaEmision).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}) : ''}</td></tr>
            <tr><td>CLIENTE</td><td>{selectedClienteInfo?.nombre_razon_social || (formData.clienteId ? `Cliente ID: ${formData.clienteId}` : 'CONSUMIDOR FINAL')}</td></tr>
            <tr><td>SUBTOTAL (Productos)</td><td className="text-right">$ {montoBaseProductos.toFixed(2)}</td></tr>
          </tbody></table>
          <table className="tabla-datos-secundarios"><tbody>
            <tr><td>DIRECCIÓN</td><td>{selectedClienteInfo?.direccion || '-'}</td></tr>
            {totalCalculadoApi && totalCalculadoApi.recargos.transferencia > 0 && <tr><td>RECARGO ({totalCalculadoApi.forma_pago_aplicada})</td><td className="text-right">$ {totalCalculadoApi.recargos.transferencia.toFixed(2)}</td></tr>}
            {totalCalculadoApi && totalCalculadoApi.recargos.factura_iva > 0 && <tr><td>{formData.requiereFactura ? "IVA (Factura)" : "Recargo (Factura)"}</td><td className="text-right">$ {totalCalculadoApi.recargos.factura_iva.toFixed(2)}</td></tr>}
            <tr><td>TOTAL FINAL</td><td className="text-right">$ {displayTotal.toFixed(2)}</td></tr>
          </tbody></table>
        </section>
        <section className="detalle-productos">
          <table className="tabla-items">
            <thead><tr><th>ITEM</th><th>PRODUCTO</th><th>CANTIDAD</th><th>SUBTOTAL</th></tr></thead>
            <tbody>
              {productos.filter(p => p.producto && p.qx > 0).map((item, index) => {
                const pInfo = productosContext.productos.find(p => p.id === item.producto);
                return (<tr key={`print-item-${index}`}><td>{index + 1}</td><td>{pInfo?.nombre || `ID: ${item.producto}`}</td><td className="text-center">{item.qx}</td><td className="text-right">$ {item.total.toFixed(2)}</td></tr>);
              })}
              {Array.from({ length: Math.max(0, 12 - productos.filter(p => p.producto && p.qx > 0).length) }).map((_, i) => 
                <tr key={`empty-row-${i}`} className="empty-row"><td> </td><td> </td><td> </td><td> </td></tr>)}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}