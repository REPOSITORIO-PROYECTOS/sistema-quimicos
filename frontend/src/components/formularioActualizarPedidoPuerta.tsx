"use client";

import { useProductsContext } from "@/context/ProductsContext"; 
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import BotonVolver from "./BotonVolver";

type ProductoPedido = {
  producto: number;
  qx: number;
  precio: number;
  total: number;
  observacion?: string;
};

interface IFormData {
  nombre: string;          
  cuit: string;
  direccion: string;       
  fechaEmision: string;    
  fechaEntrega: string;    
  formaPago: string;
  montoPagado: number;
  vuelto: number;
  cliente_id: number | null; 
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

const VENDEDORES = ["martin", "moises", "sergio", "gabriel", "mauricio", "elias", "ardiles", "redonedo"];

let auxPrecio = 0;

const TicketComponent: React.FC<{
    id: number | undefined;
    formData: IFormData;
    displayTotal: number;
    nombreVendedor: string;
    productos: ProductoPedido[];
    // eslint-disable-next-line
    productosContext: any;
}> = ({ id, formData, displayTotal, nombreVendedor, productos, productosContext }) => {
    return (
        <div className="presupuesto-container">
            <header className="presupuesto-header">
                <div className="logo-container">
                    <img src="/logo.png" alt="QuiMex" className="logo" />
                    <p className="sub-logo-text">PRESUPUESTO NO VALIDO COMO FACTURA</p>
                </div>
                <div className="info-empresa">
                    <p>📱 11 2395 1494</p>
                    <p>📞 4261 3605</p>
                    <p>📸 quimex_berazategui</p>
                </div>
            </header>
            
            <section className="datos-pedido">
                <table className="tabla-datos-principales">
                    <tbody>
                        <tr><td className="font-bold">PEDIDO</td><td>{id || 'N/A'}</td></tr>
                        <tr><td className="font-bold">FECHA</td><td>{formData.fechaEmision ? new Date(formData.fechaEmision).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}</td></tr>
                        <tr><td className="font-bold">CLIENTE</td><td>{formData.nombre || 'CONSUMIDOR FINAL'}</td></tr>
                        <tr><td className="font-bold">VENDEDOR</td><td>{nombreVendedor ? nombreVendedor.charAt(0).toUpperCase() + nombreVendedor.slice(1) : '-'}</td></tr>
                        <tr><td className="font-bold">TOTAL FINAL</td><td>$ {displayTotal.toFixed(2)}</td></tr>
                    </tbody>
                </table>
            </section>
            
            <section className="detalle-productos">
                <table className="tabla-items">
                    <thead>
                        <tr>
                            <th>ITEM</th>
                            <th>PRODUCTO</th>
                            <th>CANTIDAD</th>
                            <th>SUBTOTAL</th>
                        </tr>
                    </thead>
                    <tbody>
                        {productos.filter(p => p.producto && p.qx > 0).map((item, index) => {
                          // eslint-disable-next-line
                            const pInfo = productosContext.productos.find((p: any) => p.id === item.producto);
                            return (
                                <tr key={`item-${index}`}>
                                    <td>{index + 1}</td>
                                    <td>{pInfo?.nombre || `ID: ${item.producto}`}</td>
                                    <td className="text-center">{item.qx}</td>
                                    <td className="text-right">
                                        $ {(item.total * (formData.formaPago === "transferencia" ? 1.105 : formData.formaPago === "factura" ? 1.21 : 1)).toFixed(2)}
                                    </td>
                                </tr>
                            );
                        })}
                        {Array.from({ length: Math.max(0, 12 - productos.filter(p => p.producto && p.qx > 0).length) }).map((_, i) =>
                            <tr key={`empty-row-${i}`} className="empty-row"><td> </td><td> </td><td> </td><td> </td></tr>)}
                    </tbody>
                </table>
            </section>
        </div>
    );
};


export default function DetalleActualizarPedidoPage({ id }: { id: number | undefined }) {
  const [formData, setFormData] = useState<IFormData>({
    nombre: "",
    cuit: "",
    direccion: "", 
    fechaEmision: "",
    fechaEntrega: "", 
    formaPago: "efectivo", 
    montoPagado: 0,
    vuelto: 0,
    cliente_id: null,
    requiereFactura: false, 
    observaciones: "",
  });

  const [productos, setProductos] = useState<ProductoPedido[]>([
    { producto: 0, qx: 0, precio: 0, total: 0, observacion: "" },
  ]);
  const [totalCalculadoApi, setTotalCalculadoApi] = useState<TotalCalculadoAPI | null>(null);
  const [isCalculatingTotal, setIsCalculatingTotal] = useState(false);
  const [errorMensaje, setErrorMensaje] = useState('');
  const [successMensaje, setSuccessMensaje] = useState('');
  const [isLoading, setIsLoading] = useState(true); 
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const irAccionesPuerta = () => router.push('/acciones-puerta');
  const [nombreVendedor, setNombreVendedor] = useState<string>(''); 
  const productosContext = useProductsContext();

  const recalculatePricesForProducts = useCallback(async (currentProducts: ProductoPedido[], clienteId: number | null) => {
    const token = localStorage.getItem("token");
    if (!token) {
        setErrorMensaje("No autenticado. No se pueden calcular precios.");
        return;
    }

    const productQuantities = new Map<number, { totalQuantity: number; indices: number[] }>();
    currentProducts.forEach((p, index) => {
        if (p.producto > 0 && p.qx >= 0) {
            const existing = productQuantities.get(p.producto);
            if (existing) {
                existing.totalQuantity += p.qx;
                existing.indices.push(index);
            } else {
                productQuantities.set(p.producto, {
                    totalQuantity: p.qx,
                    indices: [index],
                });
            }
        }
    });

    const pricePromises = Array.from(productQuantities.entries()).map(
        async ([productoId, { totalQuantity, indices }]) => {
            try {
              const effectiveQuantity = totalQuantity === 0 ? 1 : totalQuantity;
                const precioRes = await fetch(`https://quimex.sistemataup.online/productos/calcular_precio/${productoId}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                    body: JSON.stringify({ producto_id: productoId, quantity: effectiveQuantity, cliente_id: clienteId }),
                });
                if (!precioRes.ok) {
                    const errData = await precioRes.json().catch(() => ({ message: "Error al calcular precio." }));
                    throw new Error(errData.message || "Error al calcular precio.");
                }
                const precioData = await precioRes.json();
                if (totalQuantity < 1)
                  auxPrecio = precioData.precio_total_calculado_ars;
                return {
                    precio: precioData.precio_venta_unitario_ars || 0,
                    indices,
                };
                // eslint-disable-next-line
            } catch (error: any) {
                console.error(`Error al obtener precio para producto ID ${productoId}:`, error);
                setErrorMensaje(error.message || `Error al obtener precio del producto ID ${productoId}.`);
                return { precio: 0, indices };
            }
        }
    );

    const priceResults = await Promise.all(pricePromises);
    const updatedProducts = [...currentProducts];

    priceResults.forEach(result => {
        const { precio, indices } = result;
        indices.forEach(index => {
            const item = updatedProducts[index];
            item.precio = precio;
            item.total = item.qx < 1 ? auxPrecio : item.precio * item.qx;
        });
    });

    updatedProducts.forEach(item => {
        if (item.producto === 0 || item.qx === 0) {
            item.precio = 0;
            item.total = 0;
        }
    });
    setProductos(updatedProducts);
  }, []);

  const cargarFormulario = useCallback(async (pedidoId: number) => {
    setIsLoading(true);
    setErrorMensaje('');
    setSuccessMensaje('');
    const token = localStorage.getItem("token");
    if (!token) {
      setErrorMensaje("Usuario no autenticado. Por favor, inicie sesión.");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`https://quimex.sistemataup.online/ventas/obtener/${pedidoId}`, {
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ message: `Error ${response.status} al cargar el pedido.` }));
        throw new Error(errData.message || "No se pudieron cargar los datos del pedido.");
      }
      const datosAPI = await response.json();
      
      setNombreVendedor(datosAPI.nombre_vendedor || ''); 
      const clienteId = datosAPI.cliente_id || null;

      setFormData({
        nombre: "Cliente puerta",
        direccion: datosAPI.direccion_entrega || "", 
        fechaEmision: datosAPI.fecha_registro || "",
        fechaEntrega: datosAPI.fecha_pedido || "",   
        formaPago: datosAPI.forma_pago || "efectivo",
        montoPagado: datosAPI.monto_pagado_cliente || 0,
        vuelto: datosAPI.vuelto_calculado ?? 0,
        cliente_id: clienteId,
        cuit: "",
        requiereFactura: datosAPI.requiere_factura || false, 
        observaciones: datosAPI.observaciones || "",
      });
      // eslint-disable-next-line
      const productosCargados: ProductoPedido[] = datosAPI.detalles?.map((detalle: any) => ({
        producto: detalle.producto_id,
        qx: detalle.cantidad,
        precio: 0, // Se inicializa en 0, ya que se recalculará inmediatamente
        total: 0, // Se inicializa en 0, ya que se recalculará inmediatamente
        observacion: detalle.observacion_item || "",
      })) || [];
      
      // Llamada crucial para recalcular los precios inmediatamente después de cargar
      await recalculatePricesForProducts(productosCargados, clienteId);

      const totalInicialAPI: TotalCalculadoAPI = {
        monto_base: datosAPI.monto_total_base || 0,
        forma_pago_aplicada: datosAPI.forma_pago || 'efectivo',
        requiere_factura_aplicada: datosAPI.requiere_factura || false,
        recargos: {
            transferencia: datosAPI.recargo_transferencia || 0,
            factura_iva: datosAPI.recargo_iva || 0,
        },
        monto_final_con_recargos: datosAPI.monto_total_final_con_recargos || 0,
      };
      setTotalCalculadoApi(totalInicialAPI);
      // eslint-disable-next-line
    } catch (error: any) {
      console.error("Error detallado en cargarFormulario:", error);
      setErrorMensaje(error.message || "Ocurrió un error desconocido al cargar los detalles del pedido.");
      setNombreVendedor(''); 
    } finally {
      setIsLoading(false);
    }
  }, [recalculatePricesForProducts]); 

  useEffect(() => {
    if (id) {
      cargarFormulario(id);
    } else {
      setErrorMensaje("ID de pedido no proporcionado para cargar los detalles.");
      setIsLoading(false);
    }
  }, [id, cargarFormulario]);
  
  const montoBaseProductos = useMemo(() => {
    return productos.reduce((sum, item) => sum + (item.total || 0), 0);
  }, [productos]);
  
  const handleProductRowInputChange = async (
    index: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = e.target;
    const nuevosProductos = [...productos];
    const currentProductItem = nuevosProductos[index];

    if (name === "qx") {
        currentProductItem.qx = parseFloat(value) || 0;
    } else if (name === "observacion") {
        currentProductItem.observacion = value;
    }
    
    await recalculatePricesForProducts(nuevosProductos, formData.cliente_id);
  };

  useEffect(() => {
    const recalcularTotalConAPI = async () => {
      if (isLoading) return;
      if (montoBaseProductos <= 0) {
        if (totalCalculadoApi !== null) setTotalCalculadoApi(null);
        return;
      }
      setIsCalculatingTotal(true); 
      setErrorMensaje('');
      const token = localStorage.getItem("token");
      if (!token) { 
        setErrorMensaje("No autenticado."); 
        setIsCalculatingTotal(false); 
        return; 
      }
      try {
        const response = await fetch("https://quimex.sistemataup.online/ventas/calcular_total", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({
            monto_base: montoBaseProductos,
            forma_pago: formData.formaPago,
            requiere_factura: formData.requiereFactura,
          }),
        });
        if (!response.ok) { 
          const errData = await response.json().catch(()=>({error:"Error API al calcular total."}));
          throw new Error(errData.error || `Error ${response.status} calculando total.`);
        }
        const data: TotalCalculadoAPI = await response.json();
        
        if (!totalCalculadoApi || totalCalculadoApi.monto_final_con_recargos !== data.monto_final_con_recargos) {
          setTotalCalculadoApi(data);
        }
        // eslint-disable-next-line
      } catch (e:any) { 
        setErrorMensaje(e.message || "Error al calcular el total final."); 
        if (totalCalculadoApi !== null) setTotalCalculadoApi(null);
      } finally { 
        setIsCalculatingTotal(false); 
      }
    };
    recalcularTotalConAPI();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [montoBaseProductos, formData.formaPago, formData.requiereFactura, isLoading, id]);

  useEffect(() => {
    const calcularVueltoConAPI = async () => {
        const token = localStorage.getItem("token");
        if (!token || isLoading) {
            let nuevoVueltoDeterminado = formData.vuelto; 
            if (!isLoading && montoBaseProductos === 0 && formData.montoPagado > 0) nuevoVueltoDeterminado = formData.montoPagado;
            else if (!isLoading && (montoBaseProductos > 0 || formData.montoPagado === 0)) nuevoVueltoDeterminado = 0;
            if (formData.vuelto !== nuevoVueltoDeterminado) setFormData(prev => ({ ...prev, vuelto: nuevoVueltoDeterminado }));
            return;
        }
        const montoFinalParaVuelto = totalCalculadoApi ? totalCalculadoApi.monto_final_con_recargos : montoBaseProductos;
        if (formData.montoPagado >= montoFinalParaVuelto && montoFinalParaVuelto >= 0) {
            try {
                const resVuelto = await fetch("https://quimex.sistemataup.online/ventas/calcular_vuelto", {
                    method: "POST", headers: {"Content-Type":"application/json", "Authorization":`Bearer ${token}`},
                    body: JSON.stringify({monto_pagado:formData.montoPagado, monto_total_final:montoFinalParaVuelto}),
                });
                if(!resVuelto.ok){
                    const errData = await resVuelto.json().catch(()=>({error:"Error API al calcular vuelto."}));
                    throw new Error(errData.error || `Error ${resVuelto.status} calculando vuelto.`);
                }
                const dataVuelto = await resVuelto.json();
                const nuevoVueltoApi = parseFloat((dataVuelto.vuelto||0).toFixed(2));
                if (formData.vuelto !== nuevoVueltoApi) setFormData(p => ({ ...p, vuelto: nuevoVueltoApi }));
                // eslint-disable-next-line
            } catch (error: any) {
                setErrorMensaje(error.message || "Error al calcular el vuelto.");
                if (formData.vuelto !== 0) setFormData(p => ({ ...p, vuelto: 0 }));
            }
        } else {
            if (formData.vuelto !== 0) setFormData(p => ({ ...p, vuelto: 0 }));
        }
    };
    if (!isCalculatingTotal) calcularVueltoConAPI();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.montoPagado, totalCalculadoApi, montoBaseProductos, isLoading, isCalculatingTotal]);

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked :
                type === 'number' ? parseFloat(value) || 0 : value;
    setFormData((prev) => {
    const newState = { ...prev, [name]: val };
    if (name === 'formaPago') newState.requiereFactura = (val === 'factura');
    return newState;
    });
  };
  
  const handleVendedorInputChange = (e: React.ChangeEvent<HTMLSelectElement>) => setNombreVendedor(e.target.value);
  
  const handleSubmit = async (e: React.FormEvent ) => {
    e.preventDefault();
    setErrorMensaje(''); 
    setSuccessMensaje('');

    if (!id) {
      setErrorMensaje("ID de pedido no válido para actualizar.");
      return;
    }
    if (!nombreVendedor.trim()) { 
        setErrorMensaje("Por favor, seleccione o confirme el nombre del vendedor.");
        return;
    }
    if (!totalCalculadoApi && montoBaseProductos > 0) {
        setErrorMensaje("Error calculando el total final del pedido. No se puede actualizar.");
        return;
    }

    const totalDelPedido = totalCalculadoApi ? totalCalculadoApi.monto_final_con_recargos : montoBaseProductos;
    if (totalDelPedido > 0 && formData.montoPagado < totalDelPedido) {
        setErrorMensaje(`El monto pagado ($${formData.montoPagado.toFixed(2)}) es menor al total del pedido ($${totalDelPedido.toFixed(2)}).`);
        return;
    }

    setIsSubmitting(true);
    const token = localStorage.getItem("token");
    if (!token) { 
      setErrorMensaje("No autenticado."); 
      setIsSubmitting(false); 
      return; 
    }

    const dataToUpdate = {
      nombre_vendedor: nombreVendedor.trim(), 
      fecha_pedido: formData.fechaEntrega,    
      direccion_entrega: formData.direccion, 
      monto_pagado_cliente: formData.montoPagado,
      forma_pago: formData.formaPago,
      vuelto: formData.vuelto,
      items: productos.filter(item => item.producto !== 0 && item.qx > 0).map(item => ({
          producto_id: item.producto,
          cantidad: item.qx,
          observacion_item: item.observacion || "",
        })),
      observaciones: formData.observaciones || "",
      requiere_factura: formData.requiereFactura,
      monto_total_base: montoBaseProductos,
      monto_total_final_con_recargos: totalDelPedido,
    };
 
    try {
      const response = await fetch(`https://quimex.sistemataup.online/ventas/actualizar/${id}`, {
        method: "PUT",
        headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},
        body: JSON.stringify(dataToUpdate),
      });
      const result = await response.json();
      if(!response.ok){
        setErrorMensaje(result?.message || result?.detail || result?.error || 'Error al actualizar el pedido.');
      } else {
        setSuccessMensaje("¡Pedido actualizado con éxito!");
        handleImprimirPresupuesto();
        setTimeout(() => irAccionesPuerta(), 1500);
      }
      // eslint-disable-next-line
    } catch (err: any) {
      setErrorMensaje(err.message || "Error de red.");
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleMontoPagadoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: Math.max(0, parseFloat(value) || 0) }));
  };

  const handleImprimirPresupuesto = () => {
    const nombreCliente = "Cliente puerta";
    let fechaFormateada = "Fecha";
    if(formData.fechaEmision){try{fechaFormateada=new Date(formData.fechaEmision).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'});}catch(e){console.error(e)}}
    const numPedido = id || "Desconocido";
    const originalTitle = document.title;
    document.title = `Presupuesto QuiMex - Pedido ${numPedido} - ${nombreCliente} (${fechaFormateada})`;
    window.print();
    setTimeout(() => {document.title = originalTitle;}, 1000);
  };

  if (isLoading) {
    return <div className="flex flex-col items-center justify-center min-h-screen bg-indigo-900"><p className="text-white text-xl">Cargando datos del pedido...</p></div>;
  }

 const displayTotal = totalCalculadoApi?.monto_final_con_recargos ?? montoBaseProductos;

  const ticketProps = {
    id,
    formData,
    displayTotal,
    nombreVendedor,
    productos,
    productosContext,
  };

  return (
    <>
      <div className="flex items-center justify-center min-h-screen bg-indigo-900 py-10 px-4 print:hidden">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-5xl">
          <BotonVolver className="ml-0" />
          <h2 className="text-3xl font-bold text-center text-indigo-800 mb-4">
            Detalle y Actualización del Pedido #{id}
          </h2>
          <div className="mb-6">
              <label htmlFor="nombreVendedor" className="block text-sm font-medium text-gray-700 mb-1">
                  Vendedor*
              </label>
              <select
                  id="nombreVendedor"
                  name="nombreVendedor"
                  value={nombreVendedor}
                  onChange={handleVendedorInputChange}
                  className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  required
              >
                  <option value="" disabled>-- Seleccione un vendedor --</option>
                  {VENDEDORES.map(vendedor => (
                      <option key={vendedor} value={vendedor}>
                          {vendedor.charAt(0).toUpperCase() + vendedor.slice(1)}
                      </option>
                  ))}
              </select>
          </div>

          {errorMensaje && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4" role="alert"><p><strong>Error:</strong> {errorMensaje}</p></div>}
          {successMensaje && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4" role="alert"><p><strong>Éxito:</strong> {successMensaje}</p></div>}
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <fieldset className="border p-4 rounded-md">
              <legend className="text-lg font-medium text-gray-700 px-2">Datos Cliente/Pedido</legend>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="nombre">Nombre Cliente</label><input type="text" name="nombre" id="nombre" value="Cliente puerta" readOnly disabled className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 bg-gray-100 cursor-not-allowed focus:outline-none"/></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="fechaEmision">Fecha de Emisión</label><input type="datetime-local" name="fechaEmision" id="fechaEmision" value={formData.fechaEmision ? formData.fechaEmision.substring(0,16) : ''} readOnly disabled className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 bg-gray-100 cursor-not-allowed focus:outline-none"/></div>
                <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="observaciones">Observaciones</label><textarea id="observaciones" name="observaciones" value={formData.observaciones || ''} onChange={handleFormChange} rows={2} className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"/></div>
              </div>
            </fieldset>

            <fieldset className="border p-4 rounded-md">
              <legend className="text-lg font-medium text-gray-700 px-2">Productos del Pedido</legend>
              <div className="mb-2 hidden md:grid md:grid-cols-[1fr_90px_1fr_100px_100px] items-center gap-2 font-semibold text-sm text-gray-600 px-3">
                <span>Producto</span>
                <span className="text-center">Cant.</span>
                <span>Observ. Prod.</span>
                <span className="text-right">P.Unit</span>
                <span className="text-right">Total</span>
              </div>
              <div className="space-y-2">
                {productos.map((item, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-[1fr_90px_1fr_100px_100px] items-center gap-2 border-b pb-1 last:border-b-0">
                    <input type="text" readOnly disabled value={productosContext.productos.find(p=>p.id===item.producto)?.nombre||`ID:${item.producto}`} className="shadow-sm border rounded w-full py-1 px-3 text-gray-700 bg-gray-100"/>
                    <input 
                      type="number"
                      name="qx"
                      value={item.qx === 0 ? '' : item.qx} 
                      onChange={(e) => handleProductRowInputChange(index, e)}
                      className="shadow-sm border rounded w-full py-1 px-2 text-gray-700 text-center focus:outline-none focus:ring-1 focus:ring-indigo-500 no-spinners"
                      min="0"
                      step="any"
                      disabled
                    />
                    <input 
                      type="text"
                      name="observacion"
                      value={item.observacion || ''} 
                      onChange={(e) => handleProductRowInputChange(index, e)}
                      className="shadow-sm border rounded w-full py-1 px-3 text-gray-700 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <input type="text" readOnly disabled value={`$ ${item.precio.toFixed(2)}`} className="shadow-sm border rounded w-full py-1 px-2 text-gray-700 text-right bg-gray-100"/>
                    <input type="text" readOnly disabled value={`$ ${item.total.toFixed(2)}`} className="shadow-sm border rounded w-full py-1 px-2 text-gray-700 text-right bg-gray-100"/>
                  </div>
                ))}
                {productos.length === 0 && <p className="text-sm text-gray-500">No hay productos.</p>}
              </div>
            </fieldset>

            <fieldset className="border p-4 rounded-md">
              <legend className="text-lg font-medium text-gray-700 px-2">Pago y Totales</legend>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1fr_auto_1fr_1fr] gap-4 items-end">
                <div><label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="formaPago">Forma de Pago</label>
                  <select id="formaPago" name="formaPago" value={formData.formaPago} onChange={handleFormChange} className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                    <option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option>
                    <option value="factura">Factura</option>
                  </select>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="montoPagado">Monto Pagado</label>
                <input id="montoPagado" type="number" name="montoPagado" value={formData.montoPagado === 0 ? '' : formData.montoPagado} onChange={handleMontoPagadoChange} placeholder="0.00" step="0.01" min="0" className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 no-spinners"/></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="vuelto">Vuelto</label><input id="vuelto" type="text" name="vuelto" readOnly value={`$ ${formData.vuelto.toFixed(2)}`} className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 bg-gray-100 text-right focus:outline-none"/></div>
              </div>
              <div className="mt-4 text-right">
                {isCalculatingTotal && <p className="text-sm text-blue-600 italic">Calculando...</p>}
                {totalCalculadoApi && (<div className="text-xs text-gray-600 mb-1"><span>Base:${totalCalculadoApi.monto_base.toFixed(2)}</span>{totalCalculadoApi.recargos.transferencia>0&&<span className="ml-2">Rec.T:${totalCalculadoApi.recargos.transferencia.toFixed(2)}</span>}{totalCalculadoApi.recargos.factura_iva>0&&<span className="ml-2">IVA:${totalCalculadoApi.recargos.factura_iva.toFixed(2)}</span>}</div>)}
                <label className="block text-sm font-medium text-gray-500 mb-1">Total Pedido (c/recargos)</label>
                <input type="text" value={`$ ${displayTotal.toFixed(2)}`} readOnly className="w-full md:w-auto md:max-w-xs inline-block bg-gray-100 shadow-sm border rounded py-2 px-3 text-gray-900 text-right font-bold text-lg focus:outline-none"/>
              </div>
            </fieldset>
            
            <div className="flex justify-end mt-8">
              <button 
                type="submit" 
                className="bg-green-600 text-white px-8 py-3 rounded-md hover:bg-green-700 font-semibold text-lg disabled:opacity-50" 
                disabled={isLoading || isSubmitting || isCalculatingTotal || !nombreVendedor.trim()}>
                {isSubmitting ? 'Actualizando...' : 'Actualizar Pedido e Imprimir'}
              </button>
            </div>
          </form>
        </div>
      </div>
      
      <div id="presupuesto-imprimible" className="hidden print:block">
        <TicketComponent {...ticketProps} />
        <div
            className="ticket-separator"
            style={{
                borderTop: '3px dotted #888',
                margin: '20mm 0',
                width: '100%'
            }}
        ></div>
        <TicketComponent {...ticketProps} />
      </div>

      <style jsx global>{`
        .inputD { @apply shadow-sm border rounded w-full py-2 px-3 text-gray-700 bg-gray-100 cursor-not-allowed focus:outline-none; }
        .inputE { @apply shadow-sm border rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500; }
        .blockT { @apply block text-sm font-medium text-gray-700 mb-1; }

        .no-spinners::-webkit-outer-spin-button,
        .no-spinners::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .no-spinners {
          -moz-appearance: textfield; 
        }
        @media print {
            .ticket-separator {
                page-break-before: always;
                border-top: 3px dashed #888;
                margin: 0;
            }
        }
      `}</style>
    </>
  );
}