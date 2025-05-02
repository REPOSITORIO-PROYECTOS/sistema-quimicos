"use client";
//TODO
//meter dentro del formulario el producto, que no se salga
//recargar la pagina o limpiar los datos cuando se agrega un pedido de compra en acciones

// --- PASO 1: Importar lo necesario del contexto de Clientes ---
import React, { useState } from "react"; // Asegúrate que React esté importado
import { useProductsContext } from "@/context/ProductsContext";
import { useClientesContext, Cliente } from "@/context/ClientesContext"; // <-- Importa tu hook y el tipo Cliente

type ProductoI = {
  producto: number;
  qx: number;
  precio: number;
  total: number;
};

// --- PASO 2: Modificar la interfaz ---
interface IFormData {
  // nombre: string; // <-- Se reemplaza nombre
  clienteId: string | null; // <-- ID del cliente seleccionado (usaremos string por el value del select)
  cuit: string;
  direccion: string;
  fechaEmision: string;
  fechaEntrega: string;
  formaPago: string;
  montoPagado: number;
  vuelto: number;
}

export default function RegistrarPedidoPage() {
  // --- PASO 3: Consumir el contexto de clientes ---
  const {
    clientes,
    loading: loadingClientes,
    error: errorClientes,
  } = useClientesContext();

  // --- PASO 4: Actualizar estado inicial ---
  const [formData, setFormData] = useState<IFormData>({
    // nombre: "", // <-- Se reemplaza
    clienteId: null, // <-- Estado inicial para el cliente
    cuit: "",
    direccion: "",
    fechaEmision: "",
    fechaEntrega: "",
    formaPago: "efectivo", // <- Valor por defecto
    montoPagado: 0,
    vuelto: 0,
  });

  const [productos, setProductos] = useState<ProductoI[]>([
    { producto: 0, qx: 0, precio: 0, total: 0 },
  ]);

  const productosContext = useProductsContext(); // Para productos

  // --- Handler original para la mayoría de los inputs (CUIT, Dirección, Fechas) ---
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // --- PASO 5: Crear handler ESPECÍFICO para el select de cliente ---
  const handleClienteSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value; // El value del option es string
    const selectedCliente = clientes.find(c => String(c.id) === selectedId);

    setFormData(prev => ({
      ...prev,
      clienteId: selectedId || null, // Guarda el ID seleccionado (o null si es la opción default)
      // Autocompleta CUIT y Dirección al seleccionar cliente
      cuit: selectedCliente ? String(selectedCliente.cuit) : "",
      direccion: selectedCliente?.direccion || "",
      // Mantenemos el resto de los campos del estado anterior
      fechaEmision: prev.fechaEmision,
      fechaEntrega: prev.fechaEntrega,
      formaPago: prev.formaPago,
      montoPagado: prev.montoPagado,
      vuelto: prev.vuelto,
    }));
  };


  // --- Sin cambios en handleProductoChange, agregarProducto, eliminarProducto, calcularTotal ---
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

    const productoId = nuevosProductos[index].producto;
    const cantidad = nuevosProductos[index].qx;
    // console.log("antes del if");
    // console.log(cantidad);
    if (productoId && cantidad > 0) {
      try {
        // console.log("entra al try");
        const precioRes = await fetch(`https://quimex.sistemataup.online/productos/calcular_precio/${productoId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            producto_id: productoId,
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
    } else {
      nuevosProductos[index].precio = 0;
      nuevosProductos[index].total = 0;
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


  // --- PASO 6: Modificar handleSubmit MÍNIMAMENTE ---
  const handleSubmit = async (e: React.FormEvent ) => {
    e.preventDefault();


    const clienteIdParaApi = formData.clienteId ? parseInt(formData.clienteId, 10) : null;

    const data = {
      usuario_interno_id: 1, //DE MOMENTO ESTATICO 
      items: productos.map((item) => ({
        producto_id: item.producto,
        cantidad: item.qx.toString(),
      })),
      // --- Usar el ID convertido ---
      cliente_id: clienteIdParaApi,
      fecha_pedido: formData.fechaEntrega,
      fecha_emision: formData.fechaEmision,
      // --- Usar CUIT y Dirección del estado formData (que pueden haber sido editados) ---
      direccion_entrega: formData.direccion,
      cuit_cliente: formData.cuit,
      monto_pagado_cliente: formData.montoPagado,
      forma_pago: formData.formaPago,
      vuelto: formData.vuelto,
      observaciones: "",
    };

    console.log("Enviando datos:", data); // Para depuración

    try {
      const response = await fetch("https://quimex.sistemataup.online/ventas/registrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      console.log("Respuesta API:", result);

      if (response.ok) {
        console.log("Venta registrada:", result);
        // --- Limpiar formulario, incluyendo clienteId ---
        setFormData({
          // nombre: "", // Se elimina
          clienteId: null, // <-- Resetear cliente
          cuit: "",
          direccion: "",
          fechaEmision: "",
          fechaEntrega: "",
          formaPago:"efectivo",
          montoPagado:0,
          vuelto:0,
        });
        setProductos([{ producto: 0, qx: 0, precio: 0, total: 0 }]);
        alert("¡Pedido registrado exitosamente!"); // Feedback
      } else {
        const errorMsg = result.message || result.detail || `Error ${response.status}`;
        console.error("Error al registrar venta:", errorMsg);
        alert(`Error al registrar el pedido: ${errorMsg}`);
      }
    } catch (err) {
      console.error("Error en la petición fetch:", err);
      alert("Error de red o al conectar con el servidor.");
    }
  };

  // --- Sin cambios en handleMontoPagadoChange ---
  const handleMontoPagadoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const montoIngresado = Math.max(0, parseFloat(value) || 0);

    setFormData((prev) => ({
      ...prev,
      [name]: montoIngresado,
      vuelto: 0, // Resetear vuelto
    }));
    const totalACobrar = calcularTotal();

    if (montoIngresado >= totalACobrar && totalACobrar > 0){
        const datosParaApi = {
          monto_pagado: montoIngresado,
          monto_total_final: totalACobrar,
        };
        const URL_API_VALIDACION_PAGO = "https://quimex.sistemataup.online/ventas/calcular_vuelto";
        try {
          const response = await fetch(URL_API_VALIDACION_PAGO, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(datosParaApi),
          });
          if (response.ok) {
            const data = await response.json();
            // console.log(data);
            setFormData(prev => ({
              ...prev,
              vuelto: data.vuelto || 0,
            }));
          } else {
             console.error("Error API calcular vuelto:", await response.text());
             setFormData(prev => ({ ...prev, vuelto: 0 }));
          }
        } catch (error) {
          console.error("Error en fetch a API Validación:", error);
          setFormData(prev => ({ ...prev, vuelto: 0 }));
        }
    } else {
       setFormData(prev => ({ ...prev, vuelto: 0 }));
    }
  };

  // --- PASO 7: Añadir manejo de carga y error para clientes ---
  if (loadingClientes) {
    return (
       <div className="flex items-center justify-center min-h-screen bg-indigo-900">
           <p className="text-white text-xl">Cargando clientes...</p>
       </div>
    );
  }

  if (errorClientes) {
      return (
         <div className="flex flex-col items-center justify-center min-h-screen bg-red-900 text-white p-4">
             <h2 className="text-2xl font-bold mb-4">Error al Cargar Clientes</h2>
             <p className="bg-red-700 p-2 rounded mb-4 text-sm">{errorClientes}</p>
             <button
               onClick={() => window.location.reload()}
               className="bg-white text-red-900 px-4 py-2 rounded hover:bg-gray-200"
             >
               Intentar de nuevo
             </button>
         </div>
      );
  }

  // --- Renderizado del componente ---
  return (
    <div className="flex items-center justify-center min-h-screen bg-indigo-900 py-10 px-4">
      <div className="bg-white p-6 md:p-8 rounded-lg shadow-md w-full max-w-4xl"> {/* Ancho ajustado */}
        <h2 className="text-2xl font-semibold mb-6 text-center text-indigo-800">Registrar Pedido</h2>
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* --- Datos del cliente y Pedido --- */}
          <fieldset className="border p-4 rounded-md">
              <legend className="text-lg font-medium text-gray-700 px-2">Datos Cliente/Pedido</legend>
              {/* --- PASO 8: Modificar el renderizado del map --- */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4"> {/* Cambiado a 3 cols para mejor layout */}
                {/* Mapeamos los campos originales, pero interceptamos "nombre" */}
                {["cliente", "cuit", "direccion", "fechaEmision", "fechaEntrega"].map((campo) => {
                  // --- RENDERIZADO CONDICIONAL PARA EL SELECT ---
                  if (campo === "cliente") {
                    return (
                      <div key="cliente-select-container" className="md:col-span-1"> {/* Contenedor del select */}
                        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="cliente-select">
                          Cliente {(!clientes || clientes.length === 0) && '(No disponibles)'}
                        </label>
                        <select
                          id="cliente-select"
                          name="clienteId" // El name debe coincidir con el handler específico si lo usaras, pero aquí usamos onChange directo
                          value={formData.clienteId || ""} // Enlaza al estado clienteId
                          onChange={handleClienteSelectChange} // Usa el handler específico
                          className="shadow-sm appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100"
                          disabled={!clientes || clientes.length === 0}
                        >
                          <option value="">-- Selecciona Cliente --</option>
                          {clientes.map((cli: Cliente) => (
                            <option key={cli.id} value={String(cli.id)}> {/* Value es el ID como string */}
                              {cli.nombre_razon_social || `ID: ${cli.id}`} {/* Muestra el nombre/razón social */}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  }

                  // --- Renderizado normal para los otros campos (CUIT, Dirección, Fechas) ---
                  return (
                    <div key={campo} className="md:col-span-1"> {/* Ajusta col-span si es necesario */}
                      <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor={campo}>
                        {campo === "cuit"
                          ? "CUIT" // Ya no es opcional si se autocompleta
                          : campo === "fechaEmision"
                          ? "Fecha Emisión"
                          : campo === "fechaEntrega"
                          ? "Fecha Entrega Est."
                          : campo.charAt(0).toUpperCase() + campo.slice(1)}

                         {/* Indicador si el dato viene del cliente */}
                         {(campo === 'cuit' || campo === 'direccion') && formData.clienteId && <span className="text-xs text-gray-500"> (del cliente)</span>}
                      </label>
                      <input
                        className="shadow-sm appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        type={campo.includes("fecha") ? "datetime-local" : "text"}
                        name={campo} // <- name coincide con la key en formData
                        id={campo}
                        value={//eslint-disable-next-line
                          (formData as any)[campo]} // Conectado a formData (cuit, direccion, fechas)
                        onChange={handleFormChange} // <-- USA EL HANDLER GENERAL para permitir edición manual
                        required={campo === "fechaEntrega" || campo === "direccion"}
                         // Requerido solo para fecha entrega
                        placeholder={//eslint-disable-next-line
                          campo === 'cuit' ? 'Ingrese CUIT' : campo === 'direccion' ? 'Ingrese Dirección' : ''}
                      />
                    </div>
                  );
                })}
              </div>
          </fieldset>

          {/* --- Productos (Sin cambios) --- */}
          <fieldset className="border p-4 rounded-md">
             <legend className="text-lg font-medium text-gray-700 px-2">Productos</legend>
              <div className="mb-2 hidden md:grid md:grid-cols-[minmax(0,1fr)_90px_100px_100px_32px] items-center gap-2 font-semibold text-sm text-gray-600 px-3">
                <span>Producto</span>
                <span className="text-center">Cantidad</span>
                <span className="text-right">Precio U.</span>
                <span className="text-right">Total</span>
                <span />
              </div>
              <div className="space-y-3">
                {productos.map((item, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_90px_100px_100px_32px] items-center gap-2 border-b pb-2 last:border-b-0 md:border-none md:pb-0">
                    <div className="w-full">
                        <label className="md:hidden text-xs font-medium text-gray-500">Producto</label>
                        <select
                            name="producto"
                            value={item.producto || 0}
                            onChange={(e) => handleProductoChange(index, e)}
                            className="shadow-sm border rounded w-full py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            required
                        >
                        <option value={0} disabled> -- Seleccionar -- </option>
                        {//eslint-disable-next-line
                        productosContext?.productos.map((producto: any) => (
                            <option value={producto.id} key={producto.id}>
                            {producto.nombre} {/* Opcional: (ID: {producto.id}) */}
                            </option>
                        ))}
                        </select>
                    </div>
                     <div className="w-full">
                        <label className="md:hidden text-xs font-medium text-gray-500">Cantidad</label>
                        <input
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
                    <div className="w-full">
                        <label className="md:hidden text-xs font-medium text-gray-500">Precio Unit.</label>
                        <input
                            className="shadow-sm border rounded w-full py-2 px-2 text-gray-700 text-right bg-gray-100 focus:outline-none"
                            type="text"
                            value={`$ ${item.precio.toFixed(2)}`}
                            readOnly
                        />
                     </div>
                     <div className="w-full">
                        <label className="md:hidden text-xs font-medium text-gray-500">Total</label>
                        <input
                            className="shadow-sm border rounded w-full py-2 px-2 text-gray-700 text-right bg-gray-100 focus:outline-none"
                            type="text"
                            value={`$ ${item.total.toFixed(2)}`}
                            readOnly
                        />
                     </div>
                    <div className="flex justify-end md:justify-center items-center">
                        {productos.length > 1 && (
                        <button
                            type="button"
                            onClick={() => eliminarProducto(index)}
                            className="text-red-500 hover:text-red-700 font-bold text-xl leading-none p-1 rounded-full hover:bg-red-100"
                            title="Eliminar producto"
                        >
                            ×
                        </button>
                        )}
                    </div>
                    </div>
                ))}
              </div>
              <button
                type="button"
                onClick={agregarProducto}
                className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 text-sm"
              >
                + Agregar Producto
              </button>
          </fieldset>

          {/* --- Pago y Totales (Sin cambios) --- */}
          <fieldset className="border p-4 rounded-md">
             <legend className="text-lg font-medium text-gray-700 px-2">Pago y Totales</legend>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="formaPago">Forma de Pago</label>
                    <select
                        id="formaPago"
                        name="formaPago"
                        className="w-full shadow-sm border rounded py-2 px-3 text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        value={formData.formaPago}
                        // Puedes usar handleFormChange aquí también si lo adaptas para select
                        onChange={(e) => setFormData({ ...formData, formaPago: e.target.value })}
                    >
                        <option value="efectivo">Efectivo</option>
                        <option value="transferencia">Transferencia</option>
                        <option value="tarjeta">Tarjeta</option>
                        <option value="cuenta_corriente">Cta. Cte.</option>
                        <option value="otro">Otro</option>
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
                    <input
                        id="vuelto"
                        type="text"
                        name="vuelto"
                        className="w-full bg-gray-100 shadow-sm border rounded py-2 px-3 text-gray-700 focus:outline-none text-right"
                        value={`$ ${formData.vuelto.toFixed(2)}`}
                        readOnly
                    />
                </div>
                <div className="text-right">
                    <label className="block text-sm font-medium text-gray-500 mb-1">Total Pedido</label>
                     <input
                      type="text"
                      value={`$ ${calcularTotal().toFixed(2)}`}
                      readOnly
                      className="w-full bg-gray-100 shadow-sm border rounded py-2 px-3 text-gray-900 text-right font-bold text-lg focus:outline-none"
                    />
                </div>
             </div>
          </fieldset>

          {/* Botones de Acción (Sin cambios) */}
          <div className="flex flex-col sm:flex-row justify-end gap-4 mt-8">
            <button
              type="button"
              className="bg-gray-500 text-white px-6 py-2 rounded-md hover:bg-gray-600 order-2 sm:order-1"
              onClick={() => window.print()}
            >
              Imprimir Vista
            </button>
            <button
              type="submit"
              className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 font-semibold order-1 sm:order-2"
              disabled={loadingClientes} // Deshabilitar mientras carga clientes
            >
              Registrar Pedido
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}