"use client";

import React, { useState, useEffect } from "react";
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
  nombre: string;
  direccion: string;
  fechaEmision: string;
  fechaEntrega: string;
  formaPago: string;
  montoPagado: number;
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
  clienteId: null,
  cuit: "",
  nombre: "",
  direccion: "",
  fechaEmision: "", // Se establecerá en useEffect
  fechaEntrega: "",
  formaPago: "efectivo",
  montoPagado: 0,
  vuelto: 0,
  requiereFactura: false,
  observaciones: "",
};

const initialProductos: ProductoPedido[] = [{ producto: 0, qx: 0, precio: 0, total: 0 }];

export default function RegistrarPedidoPage() { 
  const {
    clientes,
    loading: loadingClientes,
    error: errorClientes,
  } = useClientesContext();

  const [formData, setFormData] = useState<IFormData>(initialFormData);
  const [productos, setProductos] = useState<ProductoPedido[]>(initialProductos);

  const [totalCalculadoApi, setTotalCalculadoApi] = useState<TotalCalculadoAPI | null>(null);
  const [isCalculatingTotal, setIsCalculatingTotal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  
  const productosContext = useProductsContext();
  const [nombreVendedor, setNombreVendedor] = useState<string | null>(null); // NUEVO ESTADO para el nombre del vendedor

  // Establecer fecha de emisión inicial y nombre del vendedor al cargar el componente
  useEffect(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); 
    setFormData(prev => ({...prev, fechaEmision: now.toISOString().slice(0, 16)}));

    // Obtener nombre del vendedor de localStorage
    const storedUserName = localStorage.getItem("user_name");
    if (storedUserName) {
      setNombreVendedor(storedUserName);
    }
  }, []); // Se ejecuta solo una vez al montar

  const montoBaseProductos = React.useMemo(() => {
    return productos.reduce((sum, item) => sum + (item.total || 0), 0);
  }, [productos]);

  // useEffect para llamar a /ventas/calcular_total y luego /ventas/calcular_vuelto
  useEffect(() => {
    const recalcularTodo = async () => {
      if (montoBaseProductos <= 0 && formData.montoPagado <= 0) { // Modificado para no recalcular si solo montoPagado es > 0 y no hay productos
        setTotalCalculadoApi(null);
        setFormData(prev => ({ ...prev, vuelto: 0 }));
        return;
      }
      if (montoBaseProductos <= 0 && formData.montoPagado > 0) { // Si no hay productos pero se ingresa monto pagado, no calcular recargos
        setTotalCalculadoApi(null); 
        // Calcular vuelto si montoPagado > 0 (y montoBase es 0)
        if(formData.montoPagado > 0) {
          setFormData(prev => ({ ...prev, vuelto: formData.montoPagado }));
        } else {
          setFormData(prev => ({ ...prev, vuelto: 0 }));
        }
        return;
      }

      setIsCalculatingTotal(true);
      setErrorMessage(''); 
      const token = localStorage.getItem("token");
      if (!token) {
        setErrorMessage("No autenticado para calcular total.");
        setIsCalculatingTotal(false);
        return;
      }

      let montoFinalParaVuelto = montoBaseProductos;

      try {
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
          const errDataTotal = await resTotal.json().catch(() => ({ error: "Error en API de cálculo de total."}));
          throw new Error(errDataTotal.error || `Error ${resTotal.status} al calcular total.`);
        }
        const dataTotal: TotalCalculadoAPI = await resTotal.json();
        setTotalCalculadoApi(dataTotal);
        montoFinalParaVuelto = dataTotal.monto_final_con_recargos;

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
                const errDataVuelto = await resVuelto.json().catch(() => ({ error: "Error en API cálculo de vuelto."}));
                throw new Error(errDataVuelto.error || `Error ${resVuelto.status} al calcular vuelto.`);
            }
            const dataVuelto = await resVuelto.json();
            setFormData(prev => ({ ...prev, vuelto: parseFloat((dataVuelto.vuelto || 0).toFixed(2)) }));
        } else {
            setFormData(prev => ({ ...prev, vuelto: 0 }));
        }
        //eslint-disable-next-line
      } catch (error: any) {
        console.error("Error en recalcularTodo:", error);
        setErrorMessage(error.message || "Error al recalcular totales/vuelto.");
        setTotalCalculadoApi(null); 
        setFormData(prev => ({ ...prev, vuelto: 0 }));
      } finally {
        setIsCalculatingTotal(false);
      }
    };
    
    if (montoBaseProductos > 0 || formData.montoPagado > 0) {
        recalcularTodo();
    } else {
        setTotalCalculadoApi(null);
        setFormData(prev => ({ ...prev, vuelto: 0 }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [montoBaseProductos, formData.formaPago, formData.requiereFactura, formData.montoPagado]);


  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' 
      ? (e.target as HTMLInputElement).checked 
      : type === 'number' 
      ? parseFloat(value) || 0 
      : value;
  
    setFormData((prev) => {
      const newState = { ...prev, [name]: val };
      if (name === 'formaPago') {
        newState.requiereFactura = (val === 'factura');
      }
      return newState;
    });
  };

  const handleClienteSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    const selectedCliente = clientes.find(c => String(c.id) === selectedId);
    setFormData(prev => ({
      ...prev,
      clienteId: selectedId || null,
      cuit: selectedCliente ? String(selectedCliente.cuit || '') : "",
      nombre: selectedCliente?.nombre_razon_social || "",
      direccion: selectedCliente?.direccion || "",
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
          const errData = await precioRes.json().catch(()=>({message:"Error al calcular precio."}));
          throw new Error(errData.message || "Error al calcular precio.");
        }
        const precioData = await precioRes.json();
        currentProductItem.precio = precioData.precio_venta_unitario_ars || 0;
        currentProductItem.total = precioData.precio_total_calculado_ars || 0;
        //eslint-disable-next-line
      } catch (error: any) {
        console.error("Error en carga de precio:", error);
        setErrorMessage(error.message || "Error al obtener precio de producto.")
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
    const montoIngresado = Math.max(0, parseFloat(value) || 0);
    setFormData((prev) => ({ ...prev, [name]: montoIngresado }));
  };


  const handleSubmit = async (e: React.FormEvent ) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSuccessMessage('');
    setErrorMessage('');

    if (!formData.clienteId) {
        setErrorMessage("Seleccione un cliente."); setIsSubmitting(false); return;
    }
    if (productos.every(p => p.producto === 0 || p.qx === 0)) {
        setErrorMessage("Añada al menos un producto."); setIsSubmitting(false); return;
    }
    if (!totalCalculadoApi && montoBaseProductos > 0) { 
        setErrorMessage("Error calculando el total final. Verifique la forma de pago o intente de nuevo."); setIsSubmitting(false); return;
    }

    const clienteIdParaApi = parseInt(formData.clienteId, 10);
    const token = localStorage.getItem("token");
    const usuarioId = localStorage.getItem("usuario_id");

    if (!token) {
        setErrorMessage("No autenticado."); setIsSubmitting(false); return;
    }
    if (!usuarioId) {
        setErrorMessage("ID de usuario no encontrado. Por favor, vuelva a iniciar sesión."); setIsSubmitting(false); return;
    }


    const dataPayload = {
      usuario_interno_id: parseInt(usuarioId, 10), 
      items: productos.filter(item => item.producto !== 0 && item.qx > 0).map(item => ({
        producto_id: item.producto,
        cantidad: item.qx,
      })),
      cliente_id: clienteIdParaApi,
      fecha_emision: formData.fechaEmision || new Date().toISOString().slice(0,16),
      fecha_pedido: formData.fechaEntrega || formData.fechaEmision || new Date().toISOString().slice(0,16),
      direccion_entrega: formData.direccion,
      cuit_cliente: formData.cuit,
      monto_pagado_cliente: formData.montoPagado,
      forma_pago: formData.formaPago,
      vuelto: formData.vuelto,
      requiere_factura: formData.requiereFactura,
      monto_total_base: montoBaseProductos,
      monto_total_final_con_recargos: totalCalculadoApi ? totalCalculadoApi.monto_final_con_recargos : montoBaseProductos,
      observaciones: formData.observaciones || "",
    };
    
    const endpoint = "https://quimex.sistemataup.online/ventas/registrar";
    const method = "POST";

    console.log(`Enviando datos (${method}) a ${endpoint}:`, dataPayload);

    try {
      const response = await fetch(endpoint, {
        method: method,
        headers: {"Content-Type":"application/json","Authorization":`Bearer ${token}`},
        body: JSON.stringify(dataPayload),
      });
      const result = await response.json();
      if (response.ok) {
        const mensajeExito = `¡Pedido registrado exitosamente!`;
        setSuccessMessage(mensajeExito);
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        setFormData({...initialFormData, fechaEmision: now.toISOString().slice(0, 16)});
        setProductos(initialProductos);
        setTotalCalculadoApi(null);
        
        if (result.venta_id) { 
           handleImprimirPresupuesto(result.venta_id);
        }
      } else {
        setErrorMessage(result.message || result.detail || `Error ${response.status} al registrar el pedido.`);
      }
      //eslint-disable-next-line
    } catch (err: any) {
      setErrorMessage(err.message || "Error de red al intentar registrar el pedido.");
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleImprimirPresupuesto = (pedidoIdParaImprimir?: number) => {
    const nombreCliente = formData.nombre || "Cliente";
    let fechaFormateada = "Fecha";
    if (formData.fechaEmision) {
        try {
            fechaFormateada = new Date(formData.fechaEmision).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'});
        } catch(e){ console.error("Error formateando fecha para título:", e); }
    }
    const numPedido = pedidoIdParaImprimir || "NUEVO"; 

    const originalTitle = document.title;
    document.title = `Presupuesto QuiMex - Pedido ${numPedido} - ${nombreCliente} (${fechaFormateada})`;
    window.print();
    setTimeout(() => { document.title = originalTitle; }, 1000);
  };

  if (loadingClientes) { 
    return <div className="flex items-center justify-center min-h-screen bg-indigo-900"><p className="text-white text-xl">Cargando clientes...</p></div>;
  }
  if (errorClientes) { 
      return <div className="flex flex-col items-center justify-center min-h-screen bg-red-900 text-white p-4">
             <h2 className="text-2xl font-bold mb-4">Error al Cargar Clientes</h2> <p className="bg-red-700 p-2 rounded mb-4 text-sm">{errorClientes}</p>
             <button onClick={() => window.location.reload()} className="bg-white text-red-900 px-4 py-2 rounded hover:bg-gray-200">Reintentar</button>
         </div>;
  }

  const displayTotal = totalCalculadoApi ? totalCalculadoApi.monto_final_con_recargos : montoBaseProductos;

  return (
    <>
      <div className="flex items-center justify-center min-h-screen bg-indigo-900 py-10 px-4 print:hidden">
        <div className="bg-white p-6 md:p-8 rounded-lg shadow-md w-full max-w-4xl">
          
          {/* MODIFICACIÓN PARA MOSTRAR NOMBRE DE VENDEDOR Y TÍTULO */}
          <div className="relative mb-6">
            {nombreVendedor && (
              <div className="absolute left-0 top-1/2 transform -translate-y-1/2">
                <span className="text-sm sm:text-base font-medium text-gray-700 whitespace-nowrap">
                  Vendedor: {nombreVendedor}
                </span>
              </div>
            )}
            <h2 className="text-2xl font-semibold text-center text-indigo-800">
              Registrar Pedido 
            </h2>
          </div>
          {/* FIN DE MODIFICACIÓN */}

          {errorMessage && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4"><p>{errorMessage}</p></div>}
          {successMessage && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4"><p>{successMessage}</p></div>}
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <fieldset className="border p-4 rounded-md">
              <legend className="text-lg font-medium text-gray-700 px-2">Datos Cliente/Pedido</legend>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="clienteId">Cliente*</label>
                  <select id="clienteId" name="clienteId" value={formData.clienteId || ""} onChange={handleClienteSelectChange} required
                    className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100"
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
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="direccion">Dirección</label>
                  <input type="text" name="direccion" id="direccion" value={formData.direccion} onChange={handleFormChange} placeholder="Entrega/Cliente"
                    className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="fechaEmision">Fecha Emisión*</label>
                  <input type="datetime-local" name="fechaEmision" id="fechaEmision" value={formData.fechaEmision} onChange={handleFormChange} required
                    className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="fechaEntrega">Fecha Entrega</label>
                  <input type="datetime-local" name="fechaEntrega" id="fechaEntrega" value={formData.fechaEntrega} onChange={handleFormChange}
                    className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"/>
                </div>
                 <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="observaciones">Observaciones</label>
                  <textarea id="observaciones" name="observaciones" value={formData.observaciones || ''} onChange={handleFormChange} rows={1}
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
                    <option value="factura">Factura</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="montoPagado">Monto Pagado</label>
                  <input
                      id="montoPagado"
                      type="number"
                      name="montoPagado"
                      className="w-full bg-white shadow-sm border rounded py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      value={formData.montoPagado === 0 ? '' : formData.montoPagado}
                      onChange={handleMontoPagadoChange}
                      placeholder="0.00" 
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
               <button type="button" onClick={() => handleImprimirPresupuesto()}
                className="bg-gray-500 text-white px-6 py-2 rounded-md hover:bg-gray-600 font-semibold order-2 sm:order-1 disabled:opacity-50"
                disabled={isSubmitting || isCalculatingTotal || productos.every(p => p.producto === 0 || p.qx === 0)}>
                Imprimir Presupuesto
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
            <tr><td>CLIENTE</td><td>{formData.nombre || (formData.clienteId ? `Cliente ID: ${formData.clienteId}` : 'CONSUMIDOR FINAL')}</td></tr>
            <tr><td>SUBTOTAL (Productos)</td><td className="text-right">$ {montoBaseProductos.toFixed(2)}</td></tr>
          </tbody></table>
          <table className="tabla-datos-secundarios"><tbody>
            <tr><td>DIRECCIÓN</td><td>{formData.direccion || '-'}</td></tr>
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
                const pInfo = productosContext?.productos.find(p => p.id === item.producto);
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