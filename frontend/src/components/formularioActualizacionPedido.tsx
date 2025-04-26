"use client";

import { useProductsContext } from "@/context/ProductsContext";
import React, { useEffect, useState } from 'react';
const cliente_id = 0;
type ProductoI = {
  producto: number;
  qx: number;
  precio: number;
  total: number;
};

interface IFormData {
  nombre:string;
  cuit: string;
  direccion: string;
  fechaEmision: string;
  fechaEntrega: string;
  formaPago: string;
  montoPagado: number;
  vuelto: number,
  cliente_id:number,
}

 export default function RegistrarPedidoPage({id}:{id:number|undefined}) {
   const [formData, setFormData] = useState<IFormData>({
     nombre: "",
     cuit: "",
     direccion: "",
     fechaEmision: "",
     fechaEntrega: "",
     formaPago:"",
     montoPagado:0,
     vuelto:0,
     cliente_id:cliente_id,
   });

   const [errorMensaje, setErrorMensaje] = useState('');

  useEffect(() => {
    cargarFormulario();
  }, []);



  async function cargarFormulario(){ 
    const response = await fetch(`https://sistemataup.online/ventas/obtener/${id}`);
    const datos = await response.json();
    console.log(datos);
    console.log("el vuelto es :   ",datos.vuelto_calculado);
    let var_vuelto = datos.vuelto_calculado;
    if (var_vuelto == null) var_vuelto = 0;
    
    setFormData({
      nombre: datos.nombre_razon_social,
      cuit: datos.cuit_cliente,
      direccion: datos.direccion_entrega,
      fechaEmision: datos.fecha_registro,
      fechaEntrega: datos.fecha_pedido,
      formaPago:datos.forma_pago,
      montoPagado:datos.monto_pagado_cliente,
      vuelto:var_vuelto,
      cliente_id:datos.cliente_id
    });
    // eslint-disable-next-line
    const nuevosProductos: ProductoI[] = datos.detalles.map((detalle: any) => ({
      producto: detalle.producto_id,
      qx: detalle.cantidad,
      precio: detalle.precio_unitario_venta_ars,
      total: detalle.precio_total_item_ars  
    }));  
    setProductos(nuevosProductos);
  }
  
 
   const [productos, setProductos] = useState<ProductoI[]>([
     { producto: 0, qx: 0, precio: 0, total: 0 },
   ]);
 
   const productosContext = useProductsContext();
 
   const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
     const { name, value } = e.target;
     setFormData((prev) => ({ ...prev, [name]: value }));
   };
 
   const handleProductoChange = async (
     index: number,
     e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLSelectElement>
   ) => {
     const { name, value } = e.target;
     const nuevosProductos = [...productos];
   
     if (name === "qx") {
       nuevosProductos[index].qx = parseInt(value) || 0;
     } else if (name === "producto") {
       nuevosProductos[index].producto = parseInt(value);
     }
 
     const productoNombre = nuevosProductos[index].producto;
     const cantidad = nuevosProductos[index].qx;
     console.log("antes del if");
     console.log(cantidad);
     if (productoNombre && cantidad > 0) {
       try {   
         console.log("entra al try");
         const precioRes = await fetch(`https://sistemataup.online/productos/calcular_precio/${productoNombre}`, {
           method: "POST",
           headers: {
             "Content-Type": "application/json",
           },
           body: JSON.stringify({
             producto_id: productoNombre,
             quantity: cantidad,
           }),
         });
   
         if (!precioRes.ok) throw new Error("Error al calcular el precio");
   
         const precioData = await precioRes.json();
         nuevosProductos[index].precio = precioData.precio_venta_unitario_ars;
         nuevosProductos[index].total = precioData.precio_total_calculado_ars;
       } catch (error) {
         console.error("Error en la carga de producto:", error);
         nuevosProductos[index].precio = 0;
         nuevosProductos[index].total = 0;
       }
     }
   
     setProductos(nuevosProductos);
   };
  

  const agregarProducto = () => {
    setProductos([...productos, {producto: 0, qx: 0, precio: 0, total: 0 }]);
  };

  const eliminarProducto = (index: number) => {
    const nuevosProductos = [...productos];
    nuevosProductos.splice(index, 1);
    setProductos(nuevosProductos);
  };

  const calcularTotal = () => {
    return productos.reduce((total, item) => total + (item.total || 0), 0);
  };

  const handleSubmit = async (e: React.FormEvent ) => {
    e.preventDefault();
    setErrorMensaje('');
    const data = {
      usuario_interno_id: 1, //aca hay que cambiarlo  por el numero de usuario
      items: productos.map((item) => ({
        producto_id: item.producto, 
        cantidad: item.qx.toString(), 
      })),
      cliente_id:formData.cliente_id,
      fecha_pedido: formData.fechaEntrega,
      fecha_emision: formData.fechaEmision,
      direccion_entrega: formData.direccion,
      cuit_cliente: formData.cuit,
      monto_pagado_cliente:formData.montoPagado,
      forma_pago:formData.formaPago,
      vuelto:formData.vuelto,
      observaciones: "", 
    };
  
    try {
      const response = await fetch(`https://sistemataup.online/ventas/actualizar/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
  
      const result = await response.json();
      if(!response.ok){
        setErrorMensaje(result?.mensaje || 'Error al enviar el formulario');
      }
      if (response.ok) {
        console.log("Venta registrada:", result);
        // Limpiar formulario
        setFormData({
          nombre: "",
          cuit: "",
          direccion: "",
          fechaEmision: "",
          fechaEntrega: "",
          formaPago:"",
          montoPagado:0,
          vuelto:0,
          cliente_id:cliente_id
        });
        setProductos([{ producto: 0, qx: 0, precio: 0, total: 0 }]);
      }
    } catch (err) {
      console.error("Error en la petición:", err);
    }
  };


  const handleMontoPagadoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target; 
    const montoIngresado = Math.max(0, parseFloat(value) || 0); 

    setFormData((prev) => ({
      ...prev,
      [name]: montoIngresado, 
    }));
    const totalACobrar = calcularTotal();
    const datosParaApi = {
      monto_pagado: montoIngresado, 
      monto_total_final: totalACobrar,
  
    };
    const URL_API_VALIDACION_PAGO = "https://sistemataup.online/ventas/calcular_vuelto"; 

    if (montoIngresado >= totalACobrar){
        try {

          const response = await fetch(URL_API_VALIDACION_PAGO, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(datosParaApi),
          });
          if (response.ok) {
            const data = await response.json(); 
            console.log(data);
            setFormData(prev => ({
              ...prev,
              vuelto: data.vuelto,
            }));} 
        } catch (error) {
          console.error("Error en fetch a API Validación:", error);
        }
  };}
  
  
  
  /*const formatearFecha = (fechaOriginal: string): string => {
    const fecha = new Date(fechaOriginal);
    const year = fecha.getFullYear();
    const month = String(fecha.getMonth() + 1).padStart(2, '0');
    const day = String(fecha.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
*/

  return (
    <div className="flex items-center justify-center min-h-screen bg-indigo-900 py-10"> {/* Añadido padding */}
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-3xl"> {/* Ancho ajustado */}
        <h2 className="text-2xl font-semibold mb-6 text-center text-indigo-800">Registrar Pedido</h2>
        {errorMensaje && (
      <div className="text-red-600 font-semibold mb-4">{errorMensaje}</div>)}

        <form onSubmit={handleSubmit} className="space-y-6"> {/* Espaciado entre secciones */}

          {/* --- Datos del cliente y Pedido --- */}
        <fieldset className="border p-4 rounded-md">
            <legend className="text-lg font-medium text-gray-700 px-2">Datos Cliente/Pedido</legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {["nombre", "cuit", "direccion", "fechaEmision", "fechaEntrega"].map((campo) => (
                <div key={campo}>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor={campo}>
                    {campo === "cuit"
                    ? "CUIT (Opcional)"
                    : campo === "fechaEmision"
                    ? "Fecha de Emisión"
                    : campo === "fechaEntrega"
                    ? "Fecha Estimada Entrega"
                    : campo.charAt(0).toUpperCase() + campo.slice(1)}
                </label>
                <input
                    className="shadow-sm appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed" // Añadí estilos para disabled
                    type={campo.includes("fecha") ? "datetime-local" : "text"}
                    name={campo}
                    // eslint-disable-next-line
                    id={campo}
                    // eslint-disable-next-line
                    value={(formData as any)[campo]} // Conectado a formData
                    onChange={handleFormChange} // Usa el handler general
                    disabled={campo === "nombre" || campo === "fechaEmision"}
                />
                </div>
            ))}
            </div>
        </fieldset>

          {/* --- Productos --- */}
          <fieldset className="border p-4 rounded-md">
             <legend className="text-lg font-medium text-gray-700 px-2">Productos</legend>
             {/* Encabezados de la tabla de productos (opcional, mejora la legibilidad) */}
              <div className="mb-2 hidden md:flex items-center gap-2 font-semibold text-sm text-gray-600">
                <span className="flex-1">Producto</span>
                <span className="w-20 text-center">Cantidad</span>
                <span className="w-24 text-right">Precio Unit.</span>
                <span className="w-24 text-right">Total</span>
                <span className="w-8" /> {/* Espacio para botón eliminar */}
              </div>

              {/* Mapeo de productos */}
              <div className="space-y-3">
                {productos.map((item, index) => (
                    <div key={index} className="flex flex-col md:flex-row items-stretch md:items-center gap-2 border-b pb-2 last:border-b-0">
                    {/* Select Producto */}
                    <div className="flex-1">
                        <label className="md:hidden text-xs font-medium text-gray-500">Producto</label>
                        <select disabled
                            name="producto"
                            value={item.producto}
                            onChange={(e) => handleProductoChange(index, e)}
                            className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            required
                        >
                        <option value={0} disabled> -- Seleccionar -- </option>
                        {
                          // eslint-disable-next-line
                        productosContext?.productos.map((producto: any) => (
                            <option value={producto.id} key={producto.id}>
                            {producto.nombre} (ID: {producto.id})
                            </option>
                        ))}
                        </select>
                    </div>
                    {/* Input Cantidad (Qx) */}
                     <div className="w-full md:w-20">
                        <label className="md:hidden text-xs font-medium text-gray-500">Cantidad</label>
                        <input disabled
                            className="shadow-sm border rounded w-full py-2 px-2 text-gray-700 text-center focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            type="number"
                            name="qx"
                            placeholder="Cant."
                            value={item.qx === 0 ? '' : item.qx}
                            onChange={(e) => handleProductoChange(index, e)}
                            min="1"
                            required
                        />
                    </div>
                    {/* Input Precio (calculado) */}
                    <div className="w-full md:w-24">
                        <label className="md:hidden text-xs font-medium text-gray-500">Precio Unit.</label>
                        <input disabled
                            className="shadow-sm border rounded w-full py-2 px-2 text-gray-700 text-right bg-gray-100 focus:outline-none"
                            type="text"
                            name="precio"
                            placeholder="$ 0.00"
                            value={`$ ${item.precio}`}
                            readOnly // Cambiado a readOnly
                        />
                     </div>
                    {/* Input Total (calculado) */}
                     <div className="w-full md:w-24">
                        <label className="md:hidden text-xs font-medium text-gray-500">Total</label>
                        <input disabled
                            className="shadow-sm border rounded w-full py-2 px-2 text-gray-700 text-right bg-gray-100 focus:outline-none"
                            type="text"
                            name="total"
                            placeholder="$ 0.00"
                            value={`$ ${item.total}`}
                            readOnly // Cambiado a readOnly
                        />
                     </div>
                    {/* Botón Eliminar Producto */}
                    <div className="w-full md:w-8 flex justify-end md:justify-center items-center pt-2 md:pt-0">
                        {productos.length > 1 && (
                        <button disabled
                            type="button"
                            onClick={() => eliminarProducto(index)}
                            className="text-red-500 hover:text-red-700 font-bold text-2xl leading-none p-1 rounded-full hover:bg-red-100"
                            title="Eliminar este producto"
                        >
                            ×
                        </button>
                        )}
                    </div>
                    </div>
                ))}
              </div>


              {/* Botón Agregar Producto */}
              <button disabled
                type="button"
                onClick={agregarProducto}
                className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 text-sm"
              >
                + Agregar Otro Producto
              </button>
          </fieldset>

          {/* --- Sección de Pago y Totales --- */}
          <fieldset className="border p-4 rounded-md">
             <legend className="text-lg font-medium text-gray-700 px-2">Pago y Totales</legend>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end"> {/* Usamos grid para alinear */}

                {/* Forma de Pago */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="formaPago">Forma de Pago</label>
                    <select
                        id="formaPago"
                        name="formaPago" // El 'name' coincide con la clave en formData
                        className="w-full shadow-sm border rounded py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        value={formData.formaPago}
                        onChange={(e) => setFormData({ ...formData, formaPago: e.target.value })}
                    >
                        {/* Opciones de pago */}
                        <option value="efectivo">Efectivo</option>
                        <option value="transferencia">Transferencia</option>
                        <option value="tarjeta">Tarjeta de Crédito/Débito</option>
                        <option value="cuenta_corriente">Cuenta Corriente</option>
                        <option value="otro">Otro</option>
                    </select>
                </div>

                {/* Monto Pagado */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="montoPagado">Monto Pagado</label>
                    <input
                        id="montoPagado"
                        type="number"
                        name="montoPagado" // El 'name' coincide con la clave en formData
                        className="w-full bg-white shadow-sm border rounded py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        value={formData.montoPagado} 
                        onChange={handleMontoPagadoChange}
                        placeholder="0.00"
                        step="0.01" // Permite decimales
                        min="0" // No permite negativos
                    />
                </div>

                {/* Vuelto (Calculado) */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="vuelto">Vuelto</label>
                    <input
                        id="vuelto"
                        type="text" 
                        name="vuelto" 
                        className="w-full bg-gray-100 shadow-sm border rounded py-2 px-3 text-gray-700 focus:outline-none text-right" // Alineado derecha
                        value={`$ ${formData.vuelto}`} 
                        readOnly 
                    />
                </div>

                 {/* Total General (Calculado) */}
                <div className="text-right"> {/* Alineado a la derecha para que coincida con Vuelto */}
                    <label className="block text-sm font-medium text-gray-500 mb-1">Total Pedido</label>
                     <input
                      type="text"
                      value={`$ ${calcularTotal()}`} 
                      readOnly 
                      className="w-full bg-gray-100 shadow-sm border rounded py-2 px-3 text-gray-900 text-right font-bold text-lg focus:outline-none" // Estilo resaltado
                    />
                </div>

             </div>
          </fieldset>


          {/* Botones de Acción */}
          <div className="flex justify-end gap-4 mt-8">
            <button
              type="button"
              className="bg-gray-500 text-white px-6 py-2 rounded-md hover:bg-gray-600"
              onClick={() => window.print()}
            >
              Imprimir Vista
            </button>
            <button
              type="submit"
              className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 font-semibold"
            >
              Actualizar pedido
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
