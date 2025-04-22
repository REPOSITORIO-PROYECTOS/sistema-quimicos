"use client";
//TODO
//meter dentro del formulario el producto, que no se salga
//recargar la pagina o limpiar los datos cuando se agrega un pedido de compra en acciones
import { useProductsContext } from "@/context/ProductsContext";
import { useState } from "react";
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
}

export default function RegistrarPedidoPage() {
  const [formData, setFormData] = useState<IFormData>({
    nombre: "",
    cuit: "",
    direccion: "",
    fechaEmision: "",
    fechaEntrega: "",
  });

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
      try {   /*
        const idRes = await fetch(`http://82.25.69.192:8000/calculate_price/${productoNombre}`);  //cambiar cuando se tenga la direcicon
        if (!idRes.ok) throw new Error("No se pudo obtener el ID del producto"); */
  
        //const idData = await idRes.json();
        //const productId = 1;
  
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
  
    const data = {
      usuario_interno_id: 1, //aca hay que cambiarlo  por el numero de usuario
      items: productos.map((item) => ({
        producto_id: item.producto, 
        cantidad: item.qx.toString(), 
      })),
      cliente_id: formData.cuit ? 123 : null, 
      fecha_pedido: formData.fechaEmision,
      direccion_entrega: formData.direccion,
      cuit_cliente: formData.cuit,
      observaciones: "", 
    };
  
    try {
      const response = await fetch("https://sistemataup.online/ventas/registrar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
  
      const result = await response.json();
  
      if (response.ok) {
        console.log("Venta registrada:", result);
        // Limpiar formulario
        setFormData({
          nombre: "",
          cuit: "",
          direccion: "",
          fechaEmision: "",
          fechaEntrega: "",
        });
        setProductos([{ producto: 0, qx: 0, precio: 0, total: 0 }]);
      }
    } catch (err) {
      console.error("Error en la petición:", err);
    }
  };
  

  return (
    <div className="flex items-center justify-center min-h-screen bg-indigo-900">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-2xl">
        <h2 className="text-2xl font-semibold mb-4">Registrar Pedido</h2>
        <form onSubmit={handleSubmit}>
          {/* Datos del cliente */}
          {["nombre", "cuit", "direccion", "fechaEmision", "fechaEntrega"].map((campo) => (
            <div className="mb-4" key={campo}>
              <label className="gap-2 font-bold mb-1" htmlFor={campo}>
                {campo === "cuit"
                  ? "CUIT"
                  : campo === "fechaEmision"
                  ? "Fecha de Emisión"
                  : campo === "fechaEntrega"
                  ? "Fecha de Entrega"
                  : campo.charAt(0).toUpperCase() + campo.slice(1)}
              </label>
              <input
                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                type={campo.includes("fecha") ? "date" : "text"}
                name={campo}
                id={campo}
                //TODO quitar este any
                // eslint-disable-next-line
                value={(formData as any)[campo]}
                onChange={handleFormChange}
              />
            </div>
          ))}

          {/* Productos */}
          <div className="mb-4">
            <div className="flex items-center gap-2 font-bold mb-1">
              <span className="w-full">Producto</span>
              <span className="w-30">Qx</span>
              <span className="w-30">Precio</span>
              <span className="w-35">Total</span>
              <span className="w-8" />
            </div>

            {productos.map((item, index) => (
            <div key={index} className="flex items-center gap-2 mb-2">
              {/* Producto */}
              {/*
              <input
                className="shadow border rounded w-full py-2 px-3 text-gray-700 focus:outline-none"
                type="text"
                name="producto"
                placeholder="Producto"
                value={item.producto}
                onChange={(e) => handleProductoChange(index, e)}
              />
              */}
              <select
                  name="producto"
                  value={item.producto}
                  onChange={(e) => handleProductoChange(index, e)}
                  className="shadow border rounded w-full py-2 px-3 text-gray-700 focus:outline-none"
                >
                  <option value={0} disabled>Seleccionar producto</option>
                  {productosContext?.productos.map((producto: any, index: number) => (
                    <option value={producto.id} key={index}>
                      {producto.nombre}
                    </option>
                  ))}
              </select>
              {/* Cantidad (Qx) */}
              <input
                className="shadow border rounded w-16 py-2 px-2 text-gray-700 text-left focus:outline-none"
                type="number"
                name="qx"
                placeholder="Qx"
                value={item.qx}
                onChange={(e) => handleProductoChange(index, e)}
              />
              {/* Precio */}
              <input
                className="shadow border rounded w-20 py-2 px-2 text-gray-700 text-left bg-gray-100"
                type="number"
                name="precio"
                placeholder="Precio"
                value={item.precio}
                disabled
              />
              {/* Total */}
              <input
                className="shadow border rounded w-20 py-2 px-2 text-gray-700 text-left bg-gray-100"
                type="number"
                name="total"
                placeholder="Total"
                value={item.total}
                disabled
              />
              {/* Eliminar Producto */}
              <button
                type="button"
                onClick={() => eliminarProducto(index)}
                className="text-red-500 hover:text-red-700 font-bold text-xl"
                title="Eliminar producto"
              >
                ×
              </button>
            </div>
          ))}


            <button
              type="button"
              onClick={agregarProducto}
              className="mt-2 bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
            >
              Agregar producto
            </button>
          </div>

          {/* Total */}
          <div className="mb-4">
            <label className="gap-2 font-bold mb-1">Total</label>
            <input
              type="number"
              value={calcularTotal()}
              readOnly
              className="w-full bg-gray-100 shadow border rounded py-2 px-3 text-gray-700 focus:outline-none"
            />
          </div>

          {/* Botones */}
          <div className="flex justify-end mt-4">
            <button
              type="submit"
              className="bg-green-500 text-white px-4 py-2 rounded-md mr-2"
            >
              Aceptar
            </button>
            <button
              type="button"
              className="bg-red-500 text-white px-4 py-2 rounded-md"
              onClick={() => window.print()}
            >
              Imprimir
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
