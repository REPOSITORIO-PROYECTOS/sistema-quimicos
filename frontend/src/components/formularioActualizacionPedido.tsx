"use client";

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useProductsContext, Producto as ProductoContextType } from "@/context/ProductsContext";

// Tipos
type ProductoPedido = {
  id_detalle?: number;
  producto: number;
  qx: number;
  precio: number;
  descuento: number;
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
  descuentoTotal: number;
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
  monto_final_con_recargos: number; // Este es ANTES del descuento global
}

const initialProductoItem: ProductoPedido = { producto: 0, qx: 0, precio: 0, descuento: 0, total: 0, observacion: "" };

export default function DetalleActualizarPedidoPage({ id }: { id: number | undefined }) {
  const [formData, setFormData] = useState<IFormData>({
    nombre: "",
    cuit: "",
    direccion: "",
    fechaEmision: "",
    fechaEntrega: "",
    formaPago: "efectivo",
    montoPagado: 0,
    descuentoTotal: 0,
    vuelto: 0,
    cliente_id: null,
    requiereFactura: false,
    observaciones: "",
  });

  const [productos, setProductos] = useState<ProductoPedido[]>([initialProductoItem]);
  const [totalCalculadoApi, setTotalCalculadoApi] = useState<TotalCalculadoAPI | null>(null);
  const [isCalculatingTotal, setIsCalculatingTotal] = useState(false);
  const [errorMensaje, setErrorMensaje] = useState('');
  const [successMensaje, setSuccessMensaje] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const productosContext = useProductsContext();

  const [initialTotalNetoDelGet, setInitialTotalNetoDelGet] = useState<number | null>(null);
  const [hasUserInteracted, setHasUserInteracted] = useState(false); // Para saber si el usuario ya modificó algo

  const cargarFormulario = useCallback(async (pedidoId: number) => {
    setIsLoading(true);
    setErrorMensaje('');
    setSuccessMensaje('');
    setInitialTotalNetoDelGet(null);
    setTotalCalculadoApi(null);
    setHasUserInteracted(false); // Resetear en cada carga
    const token = localStorage.getItem("token");
    if (!token) {
      setErrorMensaje("Usuario no autenticado."); setIsLoading(false); return;
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

      setFormData({
        nombre: datosAPI.cliente_nombre || "N/A",
        cuit: datosAPI.cuit_cliente || "",
        direccion: datosAPI.direccion_entrega || "",
        fechaEmision: datosAPI.fecha_registro || "",
        fechaEntrega: datosAPI.fecha_pedido || "",
        formaPago: datosAPI.forma_pago || "efectivo",
        montoPagado: datosAPI.monto_pagado_cliente || 0,
        descuentoTotal: datosAPI.descuento_total_global_porcentaje || 0,
        vuelto: datosAPI.vuelto_calculado == null ? 0 : datosAPI.vuelto_calculado,
        cliente_id: datosAPI.cliente_id || null,
        requiereFactura: datosAPI.requiere_factura || false,
        observaciones: datosAPI.observaciones || "",
      });
      //eslint-disable-next-line
      const productosCargados: ProductoPedido[] = datosAPI.detalles?.map((detalle: any) => ({
        id_detalle: detalle.id,
        producto: detalle.producto_id,
        qx: detalle.cantidad,
        precio: detalle.precio_unitario_base_ars || detalle.precio_unitario_venta_ars || 0,
        descuento: detalle.descuento_item_porcentaje || 0,
        total: detalle.precio_total_item_ars || 0,
        observacion: detalle.observacion_item || "",
      })) || [];
      setProductos(productosCargados.length > 0 ? productosCargados : [initialProductoItem]);


      if (datosAPI.monto_final_con_recargos !== undefined && datosAPI.monto_final_con_recargos !== null) {
        setInitialTotalNetoDelGet(parseFloat(datosAPI.monto_final_con_recargos));
      }
      //eslint-disable-next-line
    } catch (error: any) {
      setErrorMensaje(error.message || "Ocurrió un error desconocido al cargar los detalles del pedido.");
    } finally {
      setIsLoading(false);
    }
  }, []);

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

  useEffect(() => {
    const recalcularTodo = async () => {
      if (isLoading) return; // No calcular si los datos iniciales aún están cargando

      // Si no hay interacción del usuario y tenemos un total inicial del GET, no es necesario recalcular inmediatamente
      // a menos que las condiciones base (formaPago, requiereFactura) que afectan los recargos API hayan cambiado.
      // Esta condición es para la primera carga: si los datos cargados del form no fuerzan un cambio en recargos,
      // podríamos evitar la llamada API. Sin embargo, para asegurar consistencia, es mejor recalcular.
      // La lógica de `displayTotalToShow` decidirá si muestra el `initialTotalNetoDelGet`.

      if (montoBaseProductos <= 0 && formData.montoPagado <= 0 && formData.descuentoTotal === 0) {
        setTotalCalculadoApi(null);
        // setInitialTotalNetoDelGet(null); // No lo reseteamos aquí, puede ser útil si el usuario vuelve a 0
        setFormData(prev => ({ ...prev, vuelto: 0 }));
        return;
      }
      if (montoBaseProductos <= 0 && formData.montoPagado > 0) {
         setTotalCalculadoApi(null);
         const montoACobrar = montoBaseProductos * (1 - (formData.descuentoTotal / 100));
         const vueltoCalculado = Math.max(0, formData.montoPagado - montoACobrar);
         setFormData(prev => ({ ...prev, vuelto: parseFloat(vueltoCalculado.toFixed(2)) }));
         return;
      }

      setIsCalculatingTotal(true);
      const token = localStorage.getItem("token");
      if (!token) {
        setErrorMensaje("No autenticado para calcular total."); setIsCalculatingTotal(false); return;
      }

      let montoFinalConRecargosBruto = montoBaseProductos;

      try {
        if (montoBaseProductos > 0) {
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
              const errDataTotal = await resTotal.json().catch(() => ({ error: "Error API total."}));
              throw new Error(errDataTotal.error || `Error ${resTotal.status} calculando total.`);
            }
            const dataTotal: TotalCalculadoAPI = await resTotal.json();
            setTotalCalculadoApi(dataTotal);
            montoFinalConRecargosBruto = dataTotal.monto_final_con_recargos;
        } else {
            setTotalCalculadoApi(null); // Si no hay monto base, no hay recargos de API
            montoFinalConRecargosBruto = 0;
        }

        const montoFinalParaVueltoNeto = Math.max(0, montoFinalConRecargosBruto * (1 - (formData.descuentoTotal / 100)));

        if (formData.montoPagado >= montoFinalParaVueltoNeto && montoFinalParaVueltoNeto >= 0) {
            const resVuelto = await fetch("https://quimex.sistemataup.online/ventas/calcular_vuelto", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({
                    monto_pagado: formData.montoPagado,
                    monto_total_final: montoFinalParaVueltoNeto,
                }),
            });
            if(!resVuelto.ok){
                const errDataVuelto = await resVuelto.json().catch(() => ({ error: "Error API vuelto."}));
                throw new Error(errDataVuelto.error || `Error ${resVuelto.status} calculando vuelto.`);
            }
            const dataVuelto = await resVuelto.json();
            const nuevoVuelto = parseFloat((dataVuelto.vuelto || 0).toFixed(2));
            setFormData(prev => ({ ...prev, vuelto: nuevoVuelto }));
        } else {
            setFormData(prev => ({ ...prev, vuelto: 0 }));
        }
        //eslint-disable-next-line
      } catch (error: any) {
        setErrorMensaje((prevError) => prevError && prevError.includes(error.message) ? prevError : (prevError ? `${prevError}. ${error.message}` : error.message || "Error recalculando totales/vuelto."));
        setTotalCalculadoApi(null);
        const montoBaseNetoConDescuentoGlobal = montoBaseProductos * (1 - (formData.descuentoTotal / 100));
        const vueltoCalculadoLocal = formData.montoPagado > montoBaseNetoConDescuentoGlobal ? formData.montoPagado - montoBaseNetoConDescuentoGlobal : 0;
        const nuevoVueltoLocal = parseFloat(vueltoCalculadoLocal.toFixed(2));
        setFormData(prev => ({ ...prev, vuelto: nuevoVueltoLocal }));
      } finally {
        setIsCalculatingTotal(false);
      }
    };

    // Se recalcula si las dependencias cambian Y (el usuario ha interactuado O no tenemos un total inicial del GET)
    // O si isLoading es false (primera carga completada) y no hemos interactuado pero necesitamos el primer cálculo
    if (!isLoading && (hasUserInteracted || initialTotalNetoDelGet === null ||
        (totalCalculadoApi && ( // Si ya se calculó una vez, recalcular si cambian formaPago/requiereFactura
            formData.formaPago !== totalCalculadoApi.forma_pago_aplicada ||
            formData.requiereFactura !== totalCalculadoApi.requiere_factura_aplicada
        ))
    )) {
        const debeRecalcularLogico = montoBaseProductos > 0 ||
                               formData.montoPagado > 0 ||
                               formData.descuentoTotal > 0 ||
                               (totalCalculadoApi && (
                                    formData.formaPago !== totalCalculadoApi.forma_pago_aplicada ||
                                    formData.requiereFactura !== totalCalculadoApi.requiere_factura_aplicada
                               )) ||
                               (montoBaseProductos === 0 && (formData.montoPagado > 0 || formData.descuentoTotal > 0));

        if (debeRecalcularLogico) {
            recalcularTodo();
        } else if (montoBaseProductos === 0 && formData.montoPagado === 0 && formData.descuentoTotal === 0) {
            setTotalCalculadoApi(null);
            if (formData.vuelto !== 0) setFormData(prev => ({ ...prev, vuelto: 0 }));
        }
    } else if (!isLoading && montoBaseProductos === 0 && formData.montoPagado === 0 && formData.descuentoTotal === 0) {
        // Caso de reset completo sin interacción, pero ya no está cargando
        setTotalCalculadoApi(null);
        if (formData.vuelto !== 0) setFormData(prev => ({ ...prev, vuelto: 0 }));
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [montoBaseProductos, formData.formaPago, formData.requiereFactura, formData.montoPagado, formData.descuentoTotal, isLoading, hasUserInteracted, initialTotalNetoDelGet]);


  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setHasUserInteracted(true);
    const { name, value, type } = e.target;
    let val: string | number | boolean = value;

    if (type === 'checkbox') {
      val = (e.target as HTMLInputElement).checked;
    } else if (type === 'number') {
      if (value === '') { val = 0; }
      else {
        val = parseFloat(value);
        if (name === 'descuentoTotal') val = isNaN(val) ? 0 : Math.max(0, Math.min(100, val));
        else if (isNaN(val)) val = 0;
      }
    }
    setFormData((prev) => {
      const newState = { ...prev, [name]: val };
      if (name === 'formaPago') newState.requiereFactura = (val === 'factura');
      return newState;
    });
  };

  const handleProductoChange = async (
    index: number,
    e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLSelectElement>
  ) => {
    setHasUserInteracted(true);
    const { name, value } = e.target;
    const nuevosProductos = [...productos];
    const currentProductItem = { ...nuevosProductos[index] };
    let needsApiCallForPrice = false;

    if (name === "qx") {
        currentProductItem.qx = value === '' ? 0 : parseInt(value) || 0;
        needsApiCallForPrice = true;
    } else if (name === "producto") {
        currentProductItem.producto = parseInt(value) || 0;
        currentProductItem.precio = 0; currentProductItem.total = 0;
        needsApiCallForPrice = true;
    } else if (name === "descuento") {
        const descVal = value === '' ? 0 : parseFloat(value) || 0;
        currentProductItem.descuento = Math.max(0, Math.min(100, descVal));
    } else if (name === "observacion") {
        currentProductItem.observacion = value;
    }

    const productoId = currentProductItem.producto;
    const cantidad = currentProductItem.qx;

    if (needsApiCallForPrice && productoId > 0 && cantidad > 0) {
      try {
        const token = localStorage.getItem("token");
        const precioRes = await fetch(`https://quimex.sistemataup.online/productos/calcular_precio/${productoId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ producto_id: productoId, quantity: cantidad }),
        });
        if (!precioRes.ok) {
          const errData = await precioRes.json().catch(()=>({message:"Error al calcular precio."}));
          setErrorMensaje(errData.message || "Error al calcular precio.");
          currentProductItem.precio = 0;
        } else {
           const precioData = await precioRes.json();
           currentProductItem.precio = precioData.precio_venta_unitario_ars || 0;
        }
        //eslint-disable-next-line
      } catch (error: any) {
        setErrorMensaje(error.message || "Error al obtener precio de producto.")
        currentProductItem.precio = 0;
      }
    } else if (!productoId || cantidad <= 0) {
        currentProductItem.precio = 0;
    }

    currentProductItem.total = (currentProductItem.precio > 0 && currentProductItem.qx > 0)
                               ? (currentProductItem.precio * currentProductItem.qx) * (1 - (currentProductItem.descuento / 100))
                               : 0;
    nuevosProductos[index] = currentProductItem;
    setProductos(nuevosProductos);
  };

  const agregarProducto = () => { setHasUserInteracted(true); setProductos([...productos, { ...initialProductoItem }]); };
  const eliminarProducto = (index: number) => {
    setHasUserInteracted(true);
    const nuevosProductos = productos.filter((_, i) => i !== index);
    setProductos(nuevosProductos.length > 0 ? nuevosProductos : [{ ...initialProductoItem }]);
  };
  const handleMontoPagadoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHasUserInteracted(true);
    const { name, value } = e.target;
    const montoIngresado = value === '' ? 0 : Math.max(0, parseFloat(value) || 0);
    setFormData((prev) => ({ ...prev, [name]: montoIngresado }));
  };

  const handleSubmit = async (e: React.FormEvent ) => {
    e.preventDefault();
    // ... (Lógica de validación y preparación de dataToUpdate como antes)
    setErrorMensaje(''); setSuccessMensaje('');
    if (!id) { setErrorMensaje("ID de pedido no válido."); return; }
    if (productos.every(p => p.producto === 0 || p.qx === 0) && montoBaseProductos <= 0) {
        setErrorMensaje("Añada al menos un producto."); setIsSubmitting(false); return;
    }
    if (!totalCalculadoApi && montoBaseProductos > 0 && !hasUserInteracted && initialTotalNetoDelGet === null) {
         // Si no hubo interacción y no tenemos un total inicial del GET, y la API no ha respondido aún,
         // es probable que el useEffect esté en proceso o falló. Pedir reintento o verificar.
        setErrorMensaje("Calculando total final, por favor espere o verifique la forma de pago."); setIsSubmitting(false); return;
    }
     if (!totalCalculadoApi && montoBaseProductos > 0 && hasUserInteracted) {
         // Si hubo interacción, pero la API de recálculo no respondió (totalCalculadoApi es null)
        setErrorMensaje("Error al calcular el total con recargos. Verifique forma de pago/factura."); setIsSubmitting(false); return;
    }


    setIsSubmitting(true);
    const token = localStorage.getItem("token");
    const usuarioId = localStorage.getItem("usuario_id");
    if (!token || !usuarioId) { setErrorMensaje("No autenticado o ID de usuario no encontrado."); setIsSubmitting(false); return; }

    let montoFinalParaEnviarAlBackend;
    // Priorizar el total recalculado por API si existe (indica que hubo interacción o primer cálculo exitoso)
    if (totalCalculadoApi) {
        montoFinalParaEnviarAlBackend = Math.max(0, totalCalculadoApi.monto_final_con_recargos * (1 - (formData.descuentoTotal / 100)));
    } else if (initialTotalNetoDelGet !== null && !hasUserInteracted) {
        // Si no hubo interacción y teníamos un total del GET, lo usamos.
        // Esto asume que el descuentoTotal no cambió si no hubo interacción.
        // Para ser más precisos, deberíamos recalcular el descuento global sobre el "monto_final_con_recargos" que originó el initialTotalNetoDelGet.
        // Esta parte es compleja. Para el submit, es mejor confiar en un recálculo.
        // Si initialTotalNetoDelGet es el único disponible, es porque nada cambió O la API falló.
        // Si la API falló y totalCalculadoApi es null, usamos el cálculo local.
        const montoBrutoEstimado = montoBaseProductos; // Si no hay API, el bruto es el base de productos
        montoFinalParaEnviarAlBackend = Math.max(0, montoBrutoEstimado * (1 - (formData.descuentoTotal / 100)));

    } else { // Fallback a cálculo local si todo lo demás falla
         montoFinalParaEnviarAlBackend = Math.max(0, montoBaseProductos * (1 - (formData.descuentoTotal / 100)));
    }


    const dataToUpdate = {
      cliente_id: formData.cliente_id,
      fecha_pedido: formData.fechaEntrega || formData.fechaEmision,
      direccion_entrega: formData.direccion,
      monto_pagado_cliente: formData.montoPagado,
      forma_pago: formData.formaPago,
      vuelto: formData.vuelto,
      observaciones: formData.observaciones || "",
      requiere_factura: formData.requiereFactura,
      usuario_interno_id: parseInt(usuarioId, 10),
      items: productos.filter(item => item.producto !== 0 && item.qx > 0).map(item => ({
          id_detalle: item.id_detalle || undefined,
          producto_id: item.producto,
          cantidad: item.qx,
          descuento_item_porcentaje: item.descuento,
          observacion_item: item.observacion || "",
        })),
      monto_total_base: montoBaseProductos,
      descuento_total_global_porcentaje: formData.descuentoTotal,
      monto_final_con_recargos: parseFloat(montoFinalParaEnviarAlBackend.toFixed(2)), // Este es el neto final
    };

    try {
      const response = await fetch(`https://quimex.sistemataup.online/ventas/actualizar/${id}`, {
        method: "PUT",
        headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},
        body: JSON.stringify(dataToUpdate),
      });
      const result = await response.json();
      if(!response.ok){
        let detailedError = "";
        if (result && result.detail && Array.isArray(result.detail)) {
          //eslint-disable-next-line
            detailedError = result.detail.map((err: any) => `${err.loc ? err.loc.join('->') + ': ' : ''}${err.msg}`).join('; ');
        }
        setErrorMensaje(detailedError || result?.message || result?.detail || result?.error || 'Error al actualizar el pedido.');
      } else {
        setSuccessMensaje("¡Pedido actualizado con éxito!");
        setHasUserInteracted(false); // Resetear para la próxima carga o si el usuario quiere seguir editando
        // setInitialTotalNetoDelGet(null); // Ya no necesitamos este valor después del submit
        // Opcional: await cargarFormulario(id); para reflejar el estado guardado
        handleImprimirPresupuesto();
      }
      //eslint-disable-next-line
    } catch (err: any) {
      setErrorMensaje(err.message || "Error de red.");
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleImprimirPresupuesto = () => { /* ... Misma lógica que antes ... */
    const nombreCliente = formData.nombre || "Cliente";
    let fechaFormateada = "Fecha";
    if(formData.fechaEmision){try{fechaFormateada=new Date(formData.fechaEmision).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'});}catch(e){console.error(e)}}
    const numPedido = id || "Desconocido";
    const originalTitle = document.title;
    document.title = `Presupuesto QuiMex - Pedido ${numPedido} - ${nombreCliente} (${fechaFormateada})`;
    window.print();
    setTimeout(() => {document.title = originalTitle;}, 1000);
  };


  if (isLoading && !id) return <div className="flex items-center justify-center min-h-screen bg-red-900"><p className="text-white text-xl">Error: ID de pedido no especificado.</p></div>;
  if (isLoading) return <div className="flex items-center justify-center min-h-screen bg-indigo-900"><p className="text-white text-xl">Cargando detalles del pedido...</p></div>;

  let displayTotalToShow: number;
  if (!hasUserInteracted && initialTotalNetoDelGet !== null) {
    // Si el usuario NO ha interactuado y tenemos un total inicial del GET, lo mostramos.
    displayTotalToShow = initialTotalNetoDelGet;
  } else {
    // Si el usuario SÍ interactuó, o no teníamos un total inicial, calculamos dinámicamente.
    const montoConRecargosBrutoActual = totalCalculadoApi ? totalCalculadoApi.monto_final_con_recargos : montoBaseProductos;
    displayTotalToShow = Math.max(0, montoConRecargosBrutoActual * (1 - (formData.descuentoTotal / 100)));
  }

  const inputBaseClasses = "shadow-sm border rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500";
  const inputReadOnlyClasses = "shadow-sm border rounded w-full py-2 px-3 text-gray-700 bg-gray-100 cursor-not-allowed focus:outline-none";
  const labelBaseClasses = "block text-sm font-medium text-gray-700 mb-1";

  const getNumericInputValue = (value: number) => {
    // Mostrar string vacío si el valor es 0 Y el usuario no está en medio de un cálculo (para mejor UX al borrar)
    // O si es el estado inicial y no hay interacción.
    if (value === 0 && (!isCalculatingTotal || !hasUserInteracted)) return '';
    return String(value);
  };

  return (
    <>
      <div className="flex items-center justify-center min-h-screen bg-indigo-900 py-10 px-4 print:hidden">
        <div className="bg-white p-6 md:p-8 rounded-lg shadow-md w-full max-w-5xl">
          <h2 className="text-3xl font-bold text-center text-indigo-800 mb-6">Actualizar Pedido #{id}</h2>
          {errorMensaje && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4"><p>{errorMensaje}</p></div>}
          {successMensaje && <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-4"><p>{successMensaje}</p></div>}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Fieldset Datos Cliente/Pedido */}
            <fieldset className="border p-4 rounded-md">
              <legend className="text-lg font-medium text-gray-700 px-2">Datos Cliente/Pedido</legend>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div><label className={labelBaseClasses} htmlFor="nombre">Nombre Cliente</label><input type="text" name="nombre" id="nombre" value={formData.nombre} readOnly disabled className={inputReadOnlyClasses}/></div>
                <div><label className={labelBaseClasses} htmlFor="cuit">CUIT</label><input type="text" name="cuit" id="cuit" value={formData.cuit} readOnly disabled className={inputReadOnlyClasses}/></div>
                <div><label className={labelBaseClasses} htmlFor="direccion">Dirección Entrega</label><input type="text" name="direccion" id="direccion" value={formData.direccion} onChange={handleFormChange} className={inputBaseClasses}/></div>
                <div><label className={labelBaseClasses} htmlFor="fechaEmision">Fecha Emisión (Original)</label><input type="datetime-local" name="fechaEmision" id="fechaEmision" value={formData.fechaEmision ? formData.fechaEmision.substring(0,16) : ''} readOnly disabled className={inputReadOnlyClasses}/></div>
                <div><label className={labelBaseClasses} htmlFor="fechaEntrega">Fecha Entrega/Pedido</label><input type="datetime-local" name="fechaEntrega" id="fechaEntrega" value={formData.fechaEntrega ? formData.fechaEntrega.substring(0,16) : ''} onChange={handleFormChange} className={inputBaseClasses}/></div>
                <div className="lg:col-span-1">
                    <label className={labelBaseClasses} htmlFor="observaciones">Observaciones Pedido</label>
                    <textarea id="observaciones" name="observaciones" value={formData.observaciones || ''} onChange={handleFormChange} rows={1} className={inputBaseClasses}/>
                </div>
              </div>
            </fieldset>

            {/* Fieldset Productos del Pedido */}
            <fieldset className="border p-4 rounded-md">
              <legend className="text-lg font-medium text-gray-700 px-2">Productos del Pedido</legend>
              <div className="mb-2 hidden md:grid md:grid-cols-[minmax(0,0.7fr)_minmax(0,0.5fr)_70px_70px_90px_90px_32px] items-center gap-x-2 font-semibold text-sm text-gray-600 px-1 md:px-3">
                <span>Producto*</span><span>Observ. Prod.</span><span className="text-center">Cant*</span><span className="text-center">Desc%</span><span className="text-right">P.Unit</span><span className="text-right">Total</span><span />
              </div>
              <div className="space-y-3">
                {productos.map((item, index) => (
                  <div key={`producto-item-${index}-${item.producto}`} className="grid grid-cols-1 md:grid-cols-[minmax(0,0.7fr)_minmax(0,0.5fr)_70px_70px_90px_90px_32px] items-center gap-x-2 gap-y-1 border-b pb-2 last:border-b-0 md:border-none md:pb-0">
                    <select name="producto" value={item.producto || 0} onChange={(e) => handleProductoChange(index, e)} required className={`${inputBaseClasses} text-sm`}>
                      <option value={0} disabled> -- Seleccionar -- </option>
                      {productosContext?.productos.map((prod: ProductoContextType) => <option value={prod.id} key={prod.id}>{prod.nombre}</option>)}
                    </select>
                    <input type="text" name="observacion" placeholder="Obs. ítem" value={item.observacion || ''} onChange={(e) => handleProductoChange(index, e)} className={`${inputBaseClasses} text-sm`}/>
                    <input type="number" name="qx" placeholder="Cant." value={getNumericInputValue(item.qx)} onChange={(e) => handleProductoChange(index, e)} min="0" required className={`${inputBaseClasses} text-sm text-center`}/>
                    <input type="number" name="descuento" placeholder="0%" value={getNumericInputValue(item.descuento)} onChange={(e) => handleProductoChange(index, e)} min="0" max="100" className={`${inputBaseClasses} text-sm text-center`}/>
                    <input type="text" value={`$ ${item.precio.toFixed(2)}`} readOnly title="Precio unitario base" className={`${inputReadOnlyClasses} text-sm text-right`}/>
                    <input type="text" value={`$ ${item.total.toFixed(2)}`} readOnly title="Total con descuento de producto" className={`${inputReadOnlyClasses} text-sm text-right`}/>
                    <div className="flex justify-end md:justify-center items-center">{productos.length > 1 && <button type="button" onClick={() => eliminarProducto(index)} title="Eliminar producto" className="text-red-500 hover:text-red-700 font-bold text-xl leading-none p-1 rounded-full hover:bg-red-100">×</button>}</div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={agregarProducto} className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 text-sm" disabled={!productosContext?.productos || productosContext.productos.length === 0 || isLoading || isCalculatingTotal || isSubmitting}>+ Agregar Producto</button>
            </fieldset>

            {/* Fieldset Pago y Totales */}
            <fieldset className="border p-4 rounded-md">
              <legend className="text-lg font-medium text-gray-700 px-2">Pago y Totales</legend>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                <div><label className={labelBaseClasses} htmlFor="formaPago">Forma de Pago</label><select id="formaPago" name="formaPago" value={formData.formaPago} onChange={handleFormChange} className={inputBaseClasses}><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="factura">Factura</option></select></div>
                <div><label className={labelBaseClasses} htmlFor="montoPagado">Monto Pagado</label><input id="montoPagado" type="number" name="montoPagado" value={getNumericInputValue(formData.montoPagado)} onChange={handleMontoPagadoChange} placeholder="0.00" step="0.01" min="0" className={inputBaseClasses}/></div>
                <div><label className={labelBaseClasses} htmlFor="descuentoTotal">Descuento Total (%)</label><input id="descuentoTotal" type="number" name="descuentoTotal" className={inputBaseClasses} value={getNumericInputValue(formData.descuentoTotal)} onChange={handleFormChange} placeholder="0" step="1" min="0" max="100"/></div>
                <div><label className={labelBaseClasses} htmlFor="vuelto">Vuelto</label><input id="vuelto" type="text" name="vuelto" readOnly value={`$ ${formData.vuelto.toFixed(2)}`} className={`${inputReadOnlyClasses} text-right`}/></div>
              </div>
              <div className="mt-4 text-right">
                {isCalculatingTotal && <p className="text-sm text-blue-600 italic">Calculando...</p>}
                {(totalCalculadoApi || (initialTotalNetoDelGet === null && montoBaseProductos > 0)) && ( // Mostrar desglose si hay API o si es cálculo local sin total inicial
                <div className="text-xs text-gray-600 mb-1">
                    <span>Base (Prod. c/desc ítem): ${totalCalculadoApi ? totalCalculadoApi.monto_base.toFixed(2) : montoBaseProductos.toFixed(2)}</span>
                    {totalCalculadoApi && totalCalculadoApi.recargos.transferencia > 0 && <span className="ml-2">Rec. Transf: ${totalCalculadoApi.recargos.transferencia.toFixed(2)}</span>}
                    {totalCalculadoApi && totalCalculadoApi.recargos.factura_iva > 0 && <span className="ml-2">IVA: ${totalCalculadoApi.recargos.factura_iva.toFixed(2)}</span>}
                    {formData.descuentoTotal > 0 && (
                        <span className="ml-2 text-red-600">
                            Desc. Global ({formData.descuentoTotal}%): -$ {( (totalCalculadoApi ? totalCalculadoApi.monto_final_con_recargos : montoBaseProductos) * (formData.descuentoTotal / 100)).toFixed(2)}
                        </span>
                    )}
                </div>
                )}
                <label className="block text-sm font-medium text-gray-500 mb-1">Total Pedido (c/recargos y desc. global)</label>
                <input type="text" value={`$ ${displayTotalToShow.toFixed(2)}`} readOnly className="w-full md:w-auto md:max-w-xs inline-block bg-gray-100 shadow-sm border rounded py-2 px-3 text-gray-900 text-right font-bold text-lg focus:outline-none"/>
              </div>
            </fieldset>

            {/* Botón Submit */}
            <div className="flex justify-end mt-8"><button type="submit" className="bg-green-600 text-white px-8 py-3 rounded-md hover:bg-green-700 font-semibold text-lg disabled:opacity-50" disabled={isLoading || isSubmitting || isCalculatingTotal }>{isSubmitting ? 'Actualizando...' : 'Actualizar Pedido e Imprimir'}</button></div>
          </form>
        </div>
      </div>
      {/* Sección Imprimible */}
      <div id="presupuesto-imprimible" className="hidden print:block presupuesto-container">
        <header className="presupuesto-header">
            <div className="logo-container"><img src="/logo.png" alt="QuiMex" className="logo" /><p className="sub-logo-text">PRESUPUESTO NO VALIDO COMO FACTURA</p></div>
            <div className="info-empresa"><p>📱 11 2395 1494</p><p>📞 4261 3605</p><p>📸 quimex_berazategui</p></div>
        </header>
        <section className="datos-pedido">
            <table className="tabla-datos-principales"><tbody>
                <tr><td>PEDIDO</td><td>{id || 'N/A'}</td></tr>
                <tr><td>FECHA</td><td>{formData.fechaEmision ? new Date(formData.fechaEmision).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}) : ''}</td></tr>
                <tr><td>CLIENTE</td><td>{formData.nombre || 'CONSUMIDOR FINAL'}</td></tr>
                <tr><td>SUBTOTAL (Productos c/desc. ítem)</td><td className="text-right">$ {montoBaseProductos.toFixed(2)}</td></tr>
            </tbody></table>
            <table className="tabla-datos-secundarios"><tbody>
                <tr><td>DIRECCIÓN</td><td>{formData.direccion || '-'}</td></tr>
                {totalCalculadoApi && totalCalculadoApi.recargos.transferencia > 0 && <tr><td>RECARGO ({totalCalculadoApi.forma_pago_aplicada})</td><td className="text-right">$ {totalCalculadoApi.recargos.transferencia.toFixed(2)}</td></tr>}
                {totalCalculadoApi && totalCalculadoApi.recargos.factura_iva > 0 && <tr><td>{formData.requiereFactura ? "IVA (Factura)" : "Recargo (Factura)"}</td><td className="text-right">$ {totalCalculadoApi.recargos.factura_iva.toFixed(2)}</td></tr>}
                {formData.descuentoTotal > 0 && <tr><td>DESCUENTO GLOBAL ({formData.descuentoTotal}%)</td><td className="text-right text-red-600 print:text-red-600">- $ {( (totalCalculadoApi ? totalCalculadoApi.monto_final_con_recargos : montoBaseProductos) * (formData.descuentoTotal / 100)).toFixed(2)}</td></tr>}
                <tr><td>TOTAL FINAL</td><td className="text-right font-bold">$ {displayTotalToShow.toFixed(2)}</td></tr>
            </tbody></table>
        </section>
        <section className="detalle-productos">
            <table className="tabla-items">
                <thead><tr><th>ITEM</th><th>PRODUCTO</th><th>OBSERV.</th><th>CANT.</th><th>DESC.%</th><th>SUBTOTAL</th></tr></thead>
                <tbody>
                {productos.filter(p => p.producto && p.qx > 0).map((item, index) => {
                    const pInfo = productosContext?.productos.find(p => p.id === item.producto);
                    return (
                    <tr key={`print-item-${index}`}>
                        <td>{index + 1}</td>
                        <td>{pInfo?.nombre || `ID: ${item.producto}`}</td>
                        <td>{item.observacion || '-'}</td>
                        <td className="text-center">{item.qx}</td>
                        <td className="text-center">{item.descuento > 0 ? `${item.descuento}%` : '-'}</td>
                        <td className="text-right">$ {item.total.toFixed(2)}</td>
                    </tr>);
                })}
                {Array.from({ length: Math.max(0, 12 - productos.filter(p => p.producto && p.qx > 0).length) }).map((_, i) =>
                    <tr key={`empty-row-${i}`} className="empty-row"><td> </td><td> </td><td> </td><td> </td><td> </td><td> </td></tr>)}
                </tbody>
            </table>
        </section>
        <footer className="presupuesto-footer">
            <p>Precios sujetos a modificaciones sin previo aviso. Presupuesto válido por 7 días.</p>
             {formData.observaciones && <p className="observaciones-generales"><strong>Observaciones Generales:</strong> {formData.observaciones}</p>}
        </footer>
      </div>
      <style jsx global>{`
        .presupuesto-container { font-family: Arial, sans-serif; color: #333; margin: 20px; }
        .presupuesto-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom:15px;}
        .logo-container { display:flex; flex-direction:column; align-items:center;}
        .logo { max-height: 70px; margin-bottom: 5px; }
        .sub-logo-text { font-size: 0.7em; text-align: center; margin-top: -5px; font-weight: bold;}
        .info-empresa { text-align: right; font-size: 0.9em; }
        .info-empresa p { margin: 2px 0; }
        .datos-pedido { display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 0.9em; }
        .tabla-datos-principales, .tabla-datos-secundarios { width: 48%; border-collapse: collapse; }
        .tabla-datos-principales td, .tabla-datos-secundarios td { padding: 3px 5px; border: 1px solid #ccc;}
        .tabla-datos-principales td:first-child, .tabla-datos-secundarios td:first-child { font-weight: bold; background-color: #f0f0f0; width:40%;}
        .tabla-items { width: 100%; border-collapse: collapse; font-size: 0.9em; margin-bottom: 15px; }
        .tabla-items th, .tabla-items td { border: 1px solid #ccc; padding: 4px; text-align: left; }
        .tabla-items th { background-color: #e0e0e0; font-weight: bold; }
        .tabla-items .text-center { text-align: center; }
        .tabla-items .text-right { text-align: right; }
        .empty-row td { height: 1.2em; }
        .presupuesto-footer { border-top: 1px solid #000; padding-top: 10px; margin-top: 20px; font-size: 0.8em; text-align: center; }
        .presupuesto-footer .observaciones-generales { margin-top: 10px; text-align: left; font-style: italic;}
        .text-red-600 { color: #E53E3E; }
        .print\\:text-red-600 { color: #E53E3E !important; }
      `}</style>
    </>
  );
}