"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useProductsContext, Producto as ProductoContextType } from "@/context/ProductsContext";
import { useClientesContext, Cliente } from "@/context/ClientesContext";
import Select from 'react-select';
import { useRouter } from 'next/navigation';
import BotonVolver from "@/components/BotonVolver";

// --- Tipos y Constantes (Sin cambios) ---
let idClient = 0;
let auxPrecio = 0;
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
  clienteId: null,
  cuit: "",
  nombre: "",
  direccion: "",
  fechaEmision: "",
  fechaEntrega: "",
  formaPago: "efectivo",
  montoPagado: 0,
  descuentoTotal: 0,
  vuelto: 0,
  requiereFactura: false,
  observaciones: "",
};
const initialProductos: ProductoPedido[] = [{ producto: 0, qx: 0, precio: 0, descuento: 0, total: 0, observacion: "" }];

// --- INICIO: COMPONENTE DE TICKET MODIFICADO (Sin cambios en este componente) ---
const TicketComponent: React.FC<{
    formData: IFormData;
    montoBaseProductos: number;
    totalCalculadoApi: TotalCalculadoAPI | null;
    displayTotal: number;
    baseTotalConRecargos: number;
    productos: ProductoPedido[];
    // eslint-disable-next-line
    productosContext: any;
    isOriginal: boolean;
}> = ({
    formData,
    totalCalculadoApi,
    displayTotal,
    baseTotalConRecargos,
    productos,
    productosContext,
    isOriginal,
}) => {
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
                <table className="tabla-datos-principales"><tbody>
                    <tr><td>PEDIDO</td><td>NUEVO</td></tr>
                    <tr><td>FECHA</td><td>{formData.fechaEmision ? new Date(formData.fechaEmision).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}) : ''}</td></tr>
                    <tr><td>CLIENTE</td><td>{formData.nombre || (formData.clienteId ? `Cliente ID: ${formData.clienteId}` : 'CONSUMIDOR FINAL')}</td></tr>
                    <tr><td>DIRECCIÓN</td><td>{formData.direccion || '-'}</td></tr>
                    {isOriginal && formData.descuentoTotal > 0 && (
                        <tr><td>DESCUENTO TOTAL ({formData.descuentoTotal}%)</td><td className="text-red-600 print:text-red-600">- $ {(baseTotalConRecargos * (formData.descuentoTotal / 100)).toFixed(2)}</td></tr>
                    )}
                    {isOriginal && (
                        <tr><td>TOTAL FINAL</td><td className="font-bold">$ {displayTotal.toFixed(2)}</td></tr>
                    )}
                </tbody></table>
            </section>
            <section className="detalle-productos">
                <table className="tabla-items">
                    <thead>
                        {isOriginal ? (
                            <tr>
                                <th>ITEM</th>
                                <th>PRODUCTO</th>
                                <th>CANT.</th>
                                <th>DESC.%</th>
                                <th>SUBTOTAL</th>
                            </tr>
                        ) : (
                            <tr>
                                <th>ITEM</th>
                                <th>PRODUCTO</th>
                                <th>CANT.</th>
                            </tr>
                        )}
                    </thead>
                    <tbody>
                        {productos.filter(p => p.producto && p.qx > 0).map((item, index) => {

                          // eslint-disable-next-line
                            const pInfo = productosContext?.productos.find((p: any) => p.id === item.producto);
                            return (
                                <tr key={`print-item-${index}`}>
                                    <td>{index + 1}</td>
                                    <td>{pInfo?.nombre || `ID: ${item.producto}`}</td>
                                    <td className="text-center">{item.qx}</td>
                                    {isOriginal && (
                                        <>
                                            <td className="text-center">{item.descuento > 0 ? `${item.descuento}%` : '-'}</td>
                                            <td className="text-right">
                                                $ {(
                                                  item.total *
                                                  (totalCalculadoApi?.forma_pago_aplicada === "transferencia" ? 1.105 :
                                                   totalCalculadoApi?.forma_pago_aplicada === "factura" ? 1.21 : 1)
                                                ).toFixed(2)}
                                            </td>
                                        </>
                                    )}
                                </tr>
                            );
                        })}
                        {Array.from({ length: Math.max(0, 12 - productos.filter(p => p.producto && p.qx > 0).length) }).map((_, i) =>
                            isOriginal ? (
                                <tr key={`empty-row-${i}`} className="empty-row"><td> </td><td> </td><td> </td><td> </td><td> </td></tr>
                            ) : (
                                <tr key={`empty-row-${i}`} className="empty-row"><td> </td><td> </td><td> </td></tr>
                            )
                        )}
                    </tbody>
                </table>
            </section>
            <footer className="presupuesto-footer"></footer>
        </div>
    );
};
// --- FIN: COMPONENTE DE TICKET MODIFICADO ---

export default function RegistrarPedidoPage() {
  const {
    clientes,
    loading: loadingClientes,
    error: errorClientes,
  } = useClientesContext();
  const router = useRouter();
  const [formData, setFormData] = useState<IFormData>(initialFormData);
  const [productos, setProductos] = useState<ProductoPedido[]>(initialProductos);
  const irAccionesPedidos = () => router.push('/acciones');
  const [totalCalculadoApi, setTotalCalculadoApi] = useState<TotalCalculadoAPI | null>(null);
  const [isCalculatingTotal, setIsCalculatingTotal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const productosContext = useProductsContext();

  const opcionesDeProductoParaSelect = useMemo(() =>
    productosContext?.productos.map((prod: ProductoContextType) => ({
      value: prod.id,
      label: prod.nombre,
    })) || [],
  [productosContext?.productos]);

  const resetearFormulario = () => {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());

      setFormData({
        clienteId: null,
        cuit: "",
        nombre: "",
        direccion: "",
        fechaEmision: now.toISOString().slice(0, 16),
        fechaEntrega: "",
        formaPago: "efectivo",
        montoPagado: 0,
        descuentoTotal: 0,
        vuelto: 0,
        requiereFactura: false,
        observaciones: "",
      });

      setProductos([
       { producto: 0, qx: 0, precio: 0, descuento: 0, total: 0, observacion: "" }
      ]);

      setTotalCalculadoApi(null);
      setSuccessMessage('');
      setErrorMessage('');
    };


     useEffect(() => {
      resetearFormulario();
    }, []);

  const montoBaseProductos = React.useMemo(() => {
    return productos.reduce((sum, item) => sum + (item.total || 0), 0);
  }, [productos]);

  useEffect(() => {
    const recalcularTodo = async () => {
      if (montoBaseProductos <= 0 && formData.montoPagado <= 0) {
        setTotalCalculadoApi(null);
        setFormData(prev => ({ ...prev, vuelto: 0 }));
        return;
      }
      if (montoBaseProductos <= 0 && formData.montoPagado > 0) {
        setTotalCalculadoApi(null);
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

      let montoFinalParaVueltoNeto = montoBaseProductos;

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

        if (JSON.stringify(totalCalculadoApi) !== JSON.stringify(dataTotal)) {
            setTotalCalculadoApi(dataTotal);
        }

        const montoConRecargosBruto = dataTotal.monto_final_con_recargos;
        const descuentoTotalPorcentaje = formData.descuentoTotal || 0;
        montoFinalParaVueltoNeto = montoConRecargosBruto * (1 - (descuentoTotalPorcentaje / 100));
        montoFinalParaVueltoNeto = Math.max(0, montoFinalParaVueltoNeto);

        if (formData.montoPagado >= montoFinalParaVueltoNeto && montoFinalParaVueltoNeto > 0) {
            const resVuelto = await fetch("https://quimex.sistemataup.online/ventas/calcular_vuelto", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({
                    monto_pagado: formData.montoPagado,
                    monto_total_final: montoFinalParaVueltoNeto,
                }),
            });
            if(!resVuelto.ok){
                const errDataVuelto = await resVuelto.json().catch(() => ({ error: "Error en API cálculo de vuelto."}));
                throw new Error(errDataVuelto.error || `Error ${resVuelto.status} al calcular vuelto.`);
            }
            const dataVuelto = await resVuelto.json();
            const nuevoVuelto = parseFloat((dataVuelto.vuelto || 0).toFixed(2));
            if (formData.vuelto !== nuevoVuelto) {
                setFormData(prev => ({ ...prev, vuelto: nuevoVuelto }));
            }
        } else {
            if (formData.vuelto !== 0) {
                setFormData(prev => ({ ...prev, vuelto: 0 }));
            }
        }
        // eslint-disable-next-line
      } catch (error: any) {
        console.error("Error en recalcularTodo:", error);
        setErrorMessage(error.message || "Error al recalcular totales/vuelto.");
        if (totalCalculadoApi !== null) {
            setTotalCalculadoApi(null);
        }
        const descuentoTotalPorcentaje = formData.descuentoTotal || 0;
        const montoBaseNeto = montoBaseProductos * (1 - (descuentoTotalPorcentaje / 100));
        const vueltoCalculadoLocal = formData.montoPagado > montoBaseNeto ? formData.montoPagado - montoBaseNeto : 0;
        const nuevoVueltoLocal = parseFloat(vueltoCalculadoLocal.toFixed(2));
        if (formData.vuelto !== nuevoVueltoLocal) {
            setFormData(prev => ({ ...prev, vuelto: nuevoVueltoLocal }));
        }
      } finally {
        setIsCalculatingTotal(false);
      }
    };

    if (montoBaseProductos > 0 || formData.montoPagado > 0 || formData.descuentoTotal > 0 || (totalCalculadoApi && (formData.formaPago !== totalCalculadoApi.forma_pago_aplicada || formData.requiereFactura !== totalCalculadoApi.requiere_factura_aplicada ))) {
        recalcularTodo();
    } else if (montoBaseProductos === 0 && formData.montoPagado === 0 && formData.descuentoTotal === 0) {
        if (totalCalculadoApi !== null) setTotalCalculadoApi(null);
        if (formData.vuelto !== 0) setFormData(prev => ({ ...prev, vuelto: 0 }));
    }
  }, [montoBaseProductos, formData.formaPago, formData.requiereFactura, formData.montoPagado, formData.descuentoTotal, totalCalculadoApi, formData.vuelto]);


  const recalculatePricesForProducts = useCallback(async (currentProducts: ProductoPedido[]) => {
    const token = localStorage.getItem("token");
    if (!token) {
        setErrorMessage("No autenticado. No se pueden calcular precios.");
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
              if (totalQuantity==0)
                  totalQuantity = 1;
                const precioRes = await fetch(`https://quimex.sistemataup.online/productos/calcular_precio/${productoId}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                    body: JSON.stringify({ producto_id: productoId, quantity: totalQuantity,cliente_id: idClient || null}),
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
                setErrorMessage(error.message);
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
            let totalBruto;
            if (item.qx < 1)
               totalBruto = auxPrecio;
            else
              totalBruto = item.precio * item.qx;

            item.total = totalBruto * (1 - (item.descuento / 100));
        });
    });

    updatedProducts.forEach(item => {
        if (item.producto === 0 || item.qx === 0) {
            item.precio = 0;
            item.total = 0;
        }
    });

    setProductos(updatedProducts);
  }, [setErrorMessage]);

  const handleProductSelectChange = async (
    index: number,
    selectedOption: { value: number; label: string } | null
  ) => {
    const nuevosProductos = [...productos];
    const currentProductItem = nuevosProductos[index];

    if (selectedOption) {
        currentProductItem.producto = selectedOption.value;
        currentProductItem.qx = currentProductItem.qx > 0 ? currentProductItem.qx : 0;
    } else {
        nuevosProductos[index] = { ...initialProductos[0] };
    }

    setProductos(nuevosProductos);
    await recalculatePricesForProducts(nuevosProductos);
  };

  const handleProductRowInputChange = async (
    index: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = e.target;
    const nuevosProductos = [...productos];
    const currentProductItem = nuevosProductos[index];

    if (name === "qx") {
        currentProductItem.qx = parseFloat(value) || 0;
    } else if (name === "descuento") {
        const descVal = parseFloat(value) || 0;
        currentProductItem.descuento = Math.max(0, Math.min(100, descVal));
    } else if (name === "observacion") {
        currentProductItem.observacion = value;
    }

    setProductos(nuevosProductos);
    await recalculatePricesForProducts(nuevosProductos);
  };

  const agregarProducto = () => setProductos([...productos, { producto: 0, qx: 0, precio: 0, descuento: 0, total: 0, observacion: "" }]);

  const eliminarProducto = async (index: number) => {
    const nuevosProductos = [...productos];
    nuevosProductos.splice(index, 1);
    if (nuevosProductos.length === 0) {
        nuevosProductos.push({ producto: 0, qx: 0, precio: 0, descuento: 0, total: 0, observacion: "" });
    }
    setProductos(nuevosProductos);
    await recalculatePricesForProducts(nuevosProductos);
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let val: string | number | boolean = value;

    if (type === 'checkbox') {
      val = (e.target as HTMLInputElement).checked;
    } else if (type === 'number') {
      val = parseFloat(value);
      if (isNaN(val)) {
        val = (name === 'montoPagado' || name === 'descuentoTotal') ? 0 : value;
      }
      if (name === 'descuentoTotal') {
        val = Math.max(0, Math.min(100, Number(val)));
      }
    }

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
    idClient = parseInt(e.target.value);
    const selectedCliente = clientes.find(c => String(c.id) === selectedId);
    setFormData(prev => ({
      ...prev,
      clienteId: selectedId || null,
      cuit: selectedCliente ? String(selectedCliente.cuit || '') : "",
      nombre: selectedCliente?.nombre_razon_social || "",
      direccion: selectedCliente?.direccion || "",
    }));
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

    const montoConRecargosBruto = totalCalculadoApi ? totalCalculadoApi.monto_final_con_recargos : montoBaseProductos;
    const descuentoTotalAplicar = formData.descuentoTotal || 0;
    const montoTotalFinalNeto = Math.max(0, montoConRecargosBruto * (1 - (descuentoTotalAplicar / 100)));

    const dataPayload = {
      usuario_interno_id: parseInt(usuarioId, 10),
      items: productos.filter(item => item.producto !== 0 && item.qx > 0).map(item => ({
        producto_id: item.producto,
        cantidad: item.qx,
        observacion_item: item.observacion || "",
        descuento_item_porcentaje: item.descuento,
      })),
      cliente_id: clienteIdParaApi,
      fecha_emision: formData.fechaEmision || new Date().toISOString().slice(0,16),
      fecha_pedido: formData.fechaEntrega || formData.fechaEmision || new Date().toISOString().slice(0,16),
      direccion_entrega: formData.direccion,
      cuit_cliente: formData.cuit,
      nombre_vendedor:"vendedor",
      monto_pagado_cliente: formData.montoPagado,
      forma_pago: formData.formaPago,
      vuelto: formData.vuelto,
      requiere_factura: formData.requiereFactura,
      monto_total_base: montoBaseProductos,
      descuento_total_global_porcentaje: descuentoTotalAplicar,
      monto_final_con_recargos: parseFloat(montoTotalFinalNeto.toFixed(2)),
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
        setSuccessMessage(`¡Pedido registrado exitosamente!`);
        resetearFormulario();

        if (result.venta_id) {
           handleImprimirPresupuesto(result.venta_id);
           alert("PEDIDO REGISTRADO CON EXITO");
           setTimeout(() => {
             irAccionesPedidos();
           }, 1500);
        }

      } else {
        setErrorMessage(result.message || result.detail || result.error || `Error ${response.status} al registrar el pedido.`);
      }
      // eslint-disable-next-line
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

  const baseTotalConRecargos = totalCalculadoApi ? totalCalculadoApi.monto_final_con_recargos : montoBaseProductos;
  const displayTotal = Math.max(0, baseTotalConRecargos * (1 - (formData.descuentoTotal || 0) / 100));

  const ticketProps = {
      formData,
      montoBaseProductos,
      totalCalculadoApi,
      displayTotal,
      baseTotalConRecargos,
      productos,
      productosContext
  };

  return (
    <>
      <div className="flex items-center justify-center min-h-screen bg-indigo-900 py-10 px-4 print:hidden">
        <div className="bg-white p-6 md:p-8 rounded-lg shadow-md w-full max-w-5xl">
          <BotonVolver className="ml-0" />
          <h2 className="text-3xl font-bold text-center text-indigo-800 mb-4">
            Registrar Pedido
          </h2>

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
                  <input type="datetime-local" name="fechaEmision" id="fechaEmision" disabled value={formData.fechaEmision} onChange={handleFormChange} required
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
              <div className="mb-2 hidden md:grid md:grid-cols-[minmax(0,0.7fr)_70px_minmax(0,0.5fr)_70px_90px_90px_32px] items-center gap-x-2 font-semibold text-sm text-gray-600 px-1 md:px-3">
                <span>Producto*</span>
                <span className="text-center">Cant*</span>
                <span>Observ. Prod.</span>
                <span className="text-center">Desc%</span>
                <span className="text-right">P.Unit</span>
                <span className="text-right">Total</span>
                <span />
              </div>
              <div className="space-y-3">
                {productos.map((item, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-[minmax(0,0.7fr)_70px_minmax(0,0.5fr)_70px_90px_90px_32px] items-center gap-x-2 gap-y-1 border-b pb-2 last:border-b-0 md:border-none md:pb-0">
                    <div className="w-full">
                      <Select
                        name={`producto-${index}`}
                        options={opcionesDeProductoParaSelect}
                        value={opcionesDeProductoParaSelect.find(opt => opt.value === item.producto) || null}
                        onChange={(selectedOption) => handleProductSelectChange(index, selectedOption)}
                        placeholder="Buscar producto..."
                        isClearable
                        isSearchable
                        isLoading={productosContext.loading}
                        noOptionsMessage={() => "No se encontraron productos"}
                        loadingMessage={() => "Cargando productos..."}
                        className="text-sm react-select-container"
                        classNamePrefix="react-select"
                      />
                    </div>
                    <div className="w-full">
                      <input type="number" name="qx" placeholder="Cant." value={item.qx === 0 ? '' : item.qx} onChange={(e) => handleProductRowInputChange(index, e)} min="0" required step="any"
                        className="shadow-sm border rounded w-full py-2 px-2 text-gray-700 text-sm text-center focus:outline-none focus:ring-1 focus:ring-indigo-500 no-spinners"/>
                    </div>
                    <div className="w-full">
                        <input
                        type="text"
                        name="observacion"
                        placeholder="Obs. ítem"
                        value={item.observacion || ''}
                        onChange={(e) => handleProductRowInputChange(index, e)}
                        className="shadow-sm border rounded w-full py-2 px-2 text-gray-700 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                    </div>
                    <div className="w-full">
                      <input
                        type="number"
                        name="descuento"
                        placeholder="0%"
                        value={item.descuento === 0 ? '' : item.descuento}
                        onChange={(e) => handleProductRowInputChange(index, e)}
                        min="0" max="100"
                        className="shadow-sm border rounded w-full py-2 px-2 text-gray-700 text-sm text-center focus:outline-none focus:ring-1 focus:ring-indigo-500 no-spinners"/>
                    </div>
                    <input type="text" value={`$ ${item.precio.toFixed(2)}`} readOnly title="Precio unitario con descuento por volumen" className="shadow-sm border rounded w-full py-2 px-2 text-gray-700 text-sm text-right bg-gray-100"/>
                    <input type="text" value={`$ ${item.total.toFixed(2)}`} readOnly title="Total con descuento de producto" className="shadow-sm border rounded w-full py-2 px-2 text-gray-700 text-sm text-right bg-gray-100"/>
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="formaPago">Forma de Pago</label>
                  <select id="formaPago" name="formaPago" value={formData.formaPago} onChange={handleFormChange}
                    className="w-full shadow-sm border rounded py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                    <option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option>
                    <option value="factura">Factura</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="descuentoTotal">Descuento Total (%)</label>
                  <input
                      id="descuentoTotal"
                      type="number"
                      name="descuentoTotal"
                      className="w-full bg-white shadow-sm border rounded py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 no-spinners"
                      value={formData.descuentoTotal === 0 ? '' : formData.descuentoTotal}
                      onChange={handleFormChange}
                      placeholder="0"
                      step="1"
                      min="0"
                      max="100"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="montoPagado">Monto Pagado</label>
                    <input
                        id="montoPagado"
                        type="number"
                        name="montoPagado"
                        className="w-full bg-white shadow-sm border rounded py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 no-spinners"
                        value={formData.montoPagado === 0 ? '' : formData.montoPagado}
                        onChange={handleFormChange}
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
                        <span>Base (Prod. c/desc): ${totalCalculadoApi.monto_base.toFixed(2)}</span>
                        {totalCalculadoApi.recargos.transferencia > 0 && <span className="ml-2">Rec. Transf: ${totalCalculadoApi.recargos.transferencia.toFixed(2)}</span>}
                        {totalCalculadoApi.recargos.factura_iva > 0 && <span className="ml-2">IVA: ${totalCalculadoApi.recargos.factura_iva.toFixed(2)}</span>}
                        {formData.descuentoTotal > 0 && (
                            <span className="ml-2 text-red-600">
                                Desc. Total ({formData.descuentoTotal}%): -$ {(baseTotalConRecargos * (formData.descuentoTotal / 100)).toFixed(2)}
                            </span>
                        )}
                    </div>
                )}
                <label className="block text-sm font-medium text-gray-500 mb-1">Total Pedido (c/recargos y desc. total)</label>
                <input type="text" value={`$ ${displayTotal.toFixed(2)}`} readOnly
                  className="w-full md:w-auto md:max-w-xs inline-block bg-gray-100 shadow-sm border rounded py-2 px-3 text-gray-900 text-right font-bold text-lg focus:outline-none"/>
              </div>
            </fieldset>

            <div className="flex justify-end mt-8">
              <button type="submit"
                className="bg-green-600 text-white px-8 py-3 rounded-md hover:bg-green-700 font-semibold text-lg disabled:opacity-50"
                disabled={loadingClientes || isSubmitting || isCalculatingTotal}>
                {isSubmitting ? 'Registrando...' : 'Registrar'}
              </button>
            </div>

          </form>
        </div>
      </div>

      {/* --- INICIO: SECCIÓN DE IMPRESIÓN MODIFICADA --- */}
      <div id="presupuesto-imprimible" className="hidden print:block">
        {/* Ticket 1 (con precios) - se imprimirá en la primera hoja */}
        <TicketComponent {...ticketProps} isOriginal={true} />

        {/* Este div fuerza un salto de página antes de imprimir su contenido */}
        <div style={{ pageBreakBefore: 'always' }}>
          {/* Ticket 2 (sin precios) - se imprimirá en la segunda hoja */}
          <TicketComponent {...ticketProps} isOriginal={false} />
        </div>
      </div>
      {/* --- FIN: SECCIÓN DE IMPRESIÓN MODIFICADA --- */}
      
      <style jsx global>{`
        .no-spinners::-webkit-outer-spin-button,
        .no-spinners::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .no-spinners {
          -moz-appearance: textfield;
        }
         .react-select__control {
            border-color: rgb(209 213 219) !important;
            box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05) !important;
            min-height: 42px !important;
        }
        .react-select__control--is-focused {
            border-color: rgb(99 102 241) !important;
            box-shadow: 0 0 0 1px rgb(99 102 241) !important;
        }
        .react-select__value-container {
            padding-left: 0.75rem !important;
            padding-right: 0.75rem !important;
        }
      `}</style>
    </>
  );
}