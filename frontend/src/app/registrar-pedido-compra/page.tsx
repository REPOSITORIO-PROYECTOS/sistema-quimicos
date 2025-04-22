'use client';

import React, { useState } from 'react';

export default function RegistrarPedidoPage() {
  const [fecha, setFecha] = useState('');
  const [codigo, setCodigo] = useState('');
  const [producto, setProducto] = useState('');
  const [proveedor_id, setProveedor] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [moneda, setTipoCambio] = useState('');
  const [precioSinIva, setPrecioSinIva] = useState('');
  const [cuenta, setCuenta] = useState('');
  const [iibb, setIibb] = useState('');
  const [importeTotal, setImporteTotal] = useState('');
  const [importeAbonado, setImporteAbonado] = useState('');
  const [formaPago, setFormaPago] = useState('');
  const [chequePerteneciente, setChequePerteneciente] = useState('');
  const [pedidos, setPedidos] = useState<
    {
      fecha: string;
      codigo: string;
      producto: string;
      proveedor_id: string;
      cantidad: string;
      moneda: string;
      precioSinIva: string;
      cuenta: string;
      iibb: string;
      importeTotal: string;
      importeAbonado: string;
      formaPago: string;
      chequePerteneciente: string;
    }[]
  >([]);

  const handleAgregar = async () => {
    if (!fecha || !codigo || !producto || !cantidad || !moneda || !precioSinIva || !importeTotal || !importeAbonado) return;
  
    const nuevoPedido = {
      fecha,
      codigo,
      producto,
      proveedor_id,
      cantidad,
      moneda,
      precioSinIva,
      cuenta,
      iibb,
      importeTotal,
      importeAbonado,
      formaPago,
      chequePerteneciente,
    };
  
    const ventaPayload = {
      usuario_interno_id: 123, // todavia no hay endpoint
      items: [
        {
          id: parseInt(codigo),  //HACE REFERENCIA AL ID DEL PRODUCTO
          cantidad: cantidad.toString(),
        },
      ],
      cliente_id: 123, // todavia no hay endpoint
      producto,
      fecha_pedido: fecha,
      direccion_entrega: '',
      cuit_cliente: '',
      observaciones: '',
      proveedor_id:parseInt(proveedor_id),
      moneda
    };
  
    try { 
      console.log("entra al try");  
      const response = await fetch('https://sistemataup.online/ordenes_compra/crear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role' : 'admin',
          'X-User-Name' : '1'
        },
        body: JSON.stringify(ventaPayload),
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error en la respuesta:', errorData);
        return;
      }
  
      const data = await response.json();
      console.log('Venta registrada con éxito:', data);
  
      setPedidos((prev) => [...prev, nuevoPedido]);
  
      // Limpiar campos
      setFecha('');
      setCodigo('');
      setProducto('');
      setProveedor('');
      setCantidad('');
      setTipoCambio('');
      setPrecioSinIva('');
      setCuenta('');
      setIibb('');
      setImporteTotal('');
      setImporteAbonado('');
      setFormaPago('');
      setChequePerteneciente('');
    } catch (error) {
      console.error('Error al registrar venta:', error);
    }
  };


  const handleComprar = () => {
    console.log('Comprar');
  };


  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#20119d] px-4 py-10">
      <h1 className="text-white text-3xl font-bold mb-8 text-center">
        Solicitar Compra
      </h1>

      <div className="flex flex-col gap-4 w-full max-w-md text-white">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Fecha</label>
          <input
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            type="date"
            className="px-4 py-3 rounded bg-white text-black"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Código</label>
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            type="text"
            className="px-4 py-3 rounded bg-white text-black"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Producto</label>
          <input
            value={producto}
            onChange={(e) => setProducto(e.target.value)}
            type="text"
            className="px-4 py-3 rounded bg-white text-black"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Proveedor</label>
          <input
            value={proveedor_id}
            onChange={(e) => setProveedor(e.target.value)}
            type="text"
            className="px-4 py-3 rounded bg-white text-black"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Cantidad</label>
          <input
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            type="number"
            className="px-4 py-3 rounded bg-white text-black"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Tipo de Cambio</label>
          <input
            value={moneda}
            onChange={(e) => setTipoCambio(e.target.value)}
            type="text"
            className="px-4 py-3 rounded bg-white text-black"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Precio Sin IVA</label>
          <input
            value={precioSinIva}
            onChange={(e) => setPrecioSinIva(e.target.value)}
            type="number"
            step="0.01"
            className="px-4 py-3 rounded bg-white text-black"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Cuenta</label>
          <input
            value={cuenta}
            onChange={(e) => setCuenta(e.target.value)}
            type="text"
            className="px-4 py-3 rounded bg-white text-black"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">IIBB</label>
          <input
            value={iibb}
            onChange={(e) => setIibb(e.target.value)}
            type="text"
            className="px-4 py-3 rounded bg-white text-black"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Importe Total</label>
          <input
            value={importeTotal}
            onChange={(e) => setImporteTotal(e.target.value)}
            type="number"
            step="0.01"
            className="px-4 py-3 rounded bg-white text-black"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Importe Abonado</label>
          <input
            value={importeAbonado}
            onChange={(e) => setImporteAbonado(e.target.value)}
            type="number"
            step="0.01"
            className="px-4 py-3 rounded bg-white text-black"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Forma de Pago</label>
          <input
            value={formaPago}
            onChange={(e) => setFormaPago(e.target.value)}
            type="text"
            className="px-4 py-3 rounded bg-white text-black"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Cheque Perteneciente a</label>
          <input
            value={chequePerteneciente}
            onChange={(e) => setChequePerteneciente(e.target.value)}
            type="text"
            className="px-4 py-3 rounded bg-white text-black"
          />
        </div>

        <div className="flex gap-4 justify-center mt-4">
          <button
            onClick={handleAgregar}
            className="bg-gray-300 text-black px-6 py-2 rounded hover:bg-gray-400"
          >
            Agregar Pedido
          </button>
          <button
            onClick={handleComprar}
            className="bg-green-500 text-white px-6 py-2 rounded hover:bg-green-600"
          >
            Comprar
          </button>
        </div>
      </div>

      {pedidos.length > 0 && (
        <div className="mt-10 w-full max-w-md bg-white p-4 rounded text-black">
          <h2 className="text-lg font-semibold mb-3">Pedidos Registrados:</h2>
          <ul className="space-y-2 max-h-64 overflow-y-auto text-sm">
            {pedidos.map((pedido, idx) => (
              <li key={idx} className="border-b border-gray-300 pb-2">
                {pedido.producto} - {pedido.cantidad} unidades - Código: {pedido.codigo} - Proveedor: {pedido.proveedor_id} - {pedido.fecha} - Importe Total: ${pedido.importeTotal}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
