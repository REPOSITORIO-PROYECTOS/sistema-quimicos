'use client';

import { useProductsContext } from "@/context/ProductsContext";
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface ISolicitudes {
  fecha: string,
  proveedor: string,
  producto: string,
  codigo: string,
  moneda: string,
  cantidad: string,
  tipo: string,
  importeTotal: string,
  estado_recepcion: string,
  cantidad_recepcionada: string,
  items_recibidos: [
    {
     "id_linea": 8,
     "cantidad_recibida": 450.0,
     "costo_unitario_ars": 12.34,
     "notas_item": "Caja abierta",
     },
  ]
  ajusteTC: string,
  importeCC: string,
  cantidadAcumulada: string,
  ajusteXTC: string,
  diferenciaCambio: string,
  importeAbonado: string,
  formaPago: string,
  chequePerteneceA: string,
  nro_remito_proveedor : string,
}
//eslint-disable-next-line
export default function SolicitudIngresoPage({ id }: any) {
  const [fecha, setFecha] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [producto, setProducto] = useState('');
  const [codigo, setCodigo] = useState('');
  const [moneda, setMoneda] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [tipo, setTipo] = useState('Litro');
  const [importeTotal, setImporteTotal] = useState('');
  const [estado_recepcion, setEstadoRecepcion] = useState('Completa');
  const [cantidad_recepcionada, setCantidadRecepcionada] = useState('');
  const [ajusteTC, setAjusteTC] = useState('');
  const [importeCC, setImporteCC] = useState('');
  const [cantidadAcumulada, setCantidadAcumulada] = useState('');
  const [ajusteXTC, setAjusteXTC] = useState('');
  const [diferenciaCambio, setDiferenciaCambio] = useState('');
  const [importeAbonado, setImporteAbonado] = useState('');
  const [formaPago, setFormaPago] = useState('');
  const [chequePerteneceA, setChequePerteneceA] = useState('');
  const [nro_remito_proveedor,setNroRemito] = useState('remitoProv');
  const [solicitudes, setSolicitudes] = useState<ISolicitudes[]>([]);
  const { productos} = useProductsContext();
  const [errorMensaje, setErrorMensaje] = useState('');
  let problema = false;
  
  const router = useRouter();

  useEffect(() => {
    cargarFormulario();
  }, []);

  async function cargarFormulario() {
    try {
      const response = await fetch(`https://sistemataup.online/ordenes_compra/obtener/${id}`);

      if (!response.ok) {
        throw new Error(`Error al traer boletas: ${response.statusText}`);
      }
      const data = await response.json();
      setEstadoRecepcion(data.estado_recepcion);
      console.log(data);
      setFecha(formatearFecha(data.fecha_creacion));
      setCantidadRecepcionada(data.items[0].cantidad_recibida);
      const cant = data.items[0].cantidad_solicitada;
      setCantidad(data.items[0].cantidad_solicitada);
      setProveedor(data.proveedor_nombre);
      cargarCamposProducto(data.items[0].producto_id,cant);
      // eslint-disable-next-line
    } catch (err: any) {
      console.log("error", err);
    } 
  }



  async function cargarCamposProducto(id_producto:number,cantidad_f : number){
    try{
      const response = await fetch(`https://sistemataup.online/productos/obtener/${id_producto}`);
      if (!response.ok) {
        throw new Error(`Error al traer boletas: ${response.statusText}`);
      }
      const data = await response.json();
      console.log(data);
      setCodigo(id_producto.toString());
      setProducto(data.id.toString());
      const unidad = data.unidad_venta;
      if (unidad == 'LT')
        setTipo('Litro')
      else if (unidad == 'KG')
        setTipo('Kilo');
        else setTipo('Unidad');

      calcular_precio(id_producto,cantidad_f);
    }
    // eslint-disable-next-line
    catch (err: any) {
      console.log("error", err);
    } 
  }


  async function calcular_precio(id_producto:number,cantidad_f:number){
    try{
      const response = await fetch(`https://sistemataup.online/productos/calcular_precio/${id_producto}`,{
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          producto_id: id_producto,
          quantity: cantidad_f,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Error al traer boletas: ${response.statusText}`);
      }

      const precioData = await response.json();
      setImporteTotal(precioData.precio_total_calculado_ars);
    }
    // eslint-disable-next-line
    catch (err: any) {
      console.log("error", err);
    } 

  }

  const formatearFecha = (fechaOriginal: string): string => {
    const fecha = new Date(fechaOriginal);
    const year = fecha.getFullYear();
    const month = String(fecha.getMonth() + 1).padStart(2, '0');
    const day = String(fecha.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };



  const enviarSolicitudAPI = async (solicitud: ISolicitudes) => {
    try { 
      problema = false;
      setErrorMensaje('');                                                                             
      const response = await fetch(`https://sistemataup.online/ordenes_compra/recibir/${id}/recibir`, { 
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role' : 'admin',
          'X-User-Name' : '1'
        },
        body: JSON.stringify(solicitud),
      });
      const data = await response.json();
      if (!response.ok) {
        problema = true;
        // Si la respuesta tiene mensaje de error, lo mostramos
        setErrorMensaje(data.mensaje || 'Error al enviar el formulario');
        return;
      }
      if (!response.ok) {
        throw new Error('Error al enviar la solicitud');
      }
  
      console.log('Solicitud enviada correctamente');
    } catch (error) {
      console.error('Error al enviar la solicitud:', error);
    }
  };

                                      //TODO
  const handleAgregar = async () => { //CAMBIAR TODOS LOS DATOS ESTATICOS
    if (!producto || !cantidad || !fecha || !moneda) return;
  
    const nuevaSolicitud: ISolicitudes = {
      fecha,
      proveedor,
      producto,
      codigo,
      moneda,
      cantidad,
      tipo,
      importeTotal,
      estado_recepcion,
      items_recibidos: [
        {
         "id_linea": 8,
         "cantidad_recibida": 450.0,
         "costo_unitario_ars": 12.34,
         "notas_item": "Caja abierta",
         },
      ],
      cantidad_recepcionada,
      ajusteTC,
      importeCC,
      cantidadAcumulada,
      ajusteXTC,
      diferenciaCambio,
      importeAbonado,
      formaPago,
      chequePerteneceA,
      nro_remito_proveedor,
    };
  
    setSolicitudes((prev) => [...prev, nuevaSolicitud]);
    
    await enviarSolicitudAPI(nuevaSolicitud);
  
    // Limpiar campos
    setFecha('');
    setProveedor('');
    setProducto('');
    setCodigo('');
    setMoneda('');
    setCantidad('');
    setTipo('Litro');
    setImporteTotal('');
    setEstadoRecepcion('completa');
    setCantidadRecepcionada('');
    setAjusteTC('');
    setImporteCC('');
    setCantidadAcumulada('');
    setAjusteXTC('');
    setDiferenciaCambio('');
    setImporteAbonado('');
    setFormaPago('');
    setChequePerteneceA('');
    setNroRemito('');
    if(!problema)
      router.push('/compras');
  };

  const handleComprar = () => {
    alert('Solicitud enviada con éxito.');
    setSolicitudes([]);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#20119d] px-4 py-10">
      <h1 className="text-white text-3xl font-bold mb-8 text-center">Solicitud de Ingreso</h1>
      {errorMensaje && (
      <div className="text-red-600 font-semibold mb-4">{errorMensaje}</div>)}
      <div className="flex flex-col gap-4 w-full max-w-4xl text-white">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label>Fecha *</label>
            <input required type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full px-3 py-2 rounded bg-white text-black" />
          </div>
          <div>
            <label>Proveedor</label>
            <input value={proveedor} onChange={(e) => setProveedor(e.target.value)} className="w-full px-3 py-2 rounded bg-white text-black" />
          </div>
          <div>
            <label>Producto *</label>
            <select 
                name="producto"
                required
                value={producto}
                onChange={(e) => setProducto(e.target.value)}
                className="w-full px-3 py-2 rounded bg-white text-black"
              >
                <option value={0} disabled>Seleccionar producto</option>

                {// eslint-disable-next-line
                productos.map((producto: any, index: number) => (
                  <option value={producto.id} key={index}>
                    {producto.nombre}
                  </option>
                ))}
          </select>

            </div>
          <div>
            <label>Código</label>
            <input value={codigo} onChange={(e) => setCodigo(e.target.value)} className="w-full px-3 py-2 rounded bg-white text-black" />
          </div>
          <div>
            <label>Moneda *</label>
            <input required value={moneda} onChange={(e) => setMoneda(e.target.value)} className="w-full px-3 py-2 rounded bg-white text-black" />
          </div>
          <div>
            <label>Cantidad *</label>
            <input required type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="w-full px-3 py-2 rounded bg-white text-black" />
          </div>
          <div>
            <label>Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full px-3 py-2 rounded bg-white text-black">
              <option value="Litro">Litro</option>
              <option value="Kilo">Kilo</option>
              <option value="Unidad">Unidad</option>
            </select>
          </div>
          <div>
            <label>Importe Total</label>
            <input type="number" value={importeTotal} onChange={(e) => setImporteTotal(e.target.value)} className="w-full px-3 py-2 rounded bg-white text-black" />
          </div>
          <div>
            <label>Estado Recepción</label>
            <select value={estado_recepcion} onChange={(e) => setEstadoRecepcion(e.target.value)} className="w-full px-3 py-2 rounded bg-white text-black">
              <option value="completa">Completa</option>
              <option value="Parcial">Parcial</option>
              <option value="Extra">Extra</option>
              <option value="Con Daños">Con Daños</option>
            </select>
          </div>
          <div>
            <label>Cantidad Recepcionada</label>
            <input type="number" value={cantidad_recepcionada} onChange={(e) => setCantidadRecepcionada(e.target.value)} className="w-full px-3 py-2 rounded bg-white text-black" />
          </div>
          <div>
            <label>Importe a CC</label>
            <input value={importeCC} onChange={(e) => setImporteCC(e.target.value)} className="w-full px-3 py-2 rounded bg-white text-black" />
          </div>
          <div>
            <label>Importe Abonado</label>
            <input value={importeAbonado} onChange={(e) => setImporteAbonado(e.target.value)} className="w-full px-3 py-2 rounded bg-white text-black" />
          </div>
          <div>
            <label>Forma de Pago</label>
            <input value={formaPago} onChange={(e) => setFormaPago(e.target.value)} className="w-full px-3 py-2 rounded bg-white text-black" />
          </div>
          <div>
            <label>Cheque Perteneciente a</label>
            <input value={chequePerteneceA} onChange={(e) => setChequePerteneceA(e.target.value)} className="w-full px-3 py-2 rounded bg-white text-black" />
          </div>
        </div>

        <div className="flex gap-4 justify-center mt-6">
          <button onClick={handleAgregar} className="bg-gray-300 text-black px-6 py-2 rounded hover:bg-gray-400">
            Agregar Solicitud
          </button>
          <button onClick={handleComprar} className="bg-green-400 text-black px-6 py-2 rounded hover:bg-green-500">
            Comprar
          </button>
        </div>
      </div>

      {solicitudes.length > 0 && (
        <div className="mt-10 w-full max-w-5xl bg-white p-4 rounded text-black">
          <h2 className="text-lg font-semibold mb-3">Solicitudes Registradas:</h2>
          <div className="max-h-80 overflow-y-auto text-sm">
            {solicitudes.map((s, idx) => (
              <div key={idx} className="border-b border-gray-300 pb-2 mb-2">
                <p><strong>Producto:</strong> {s.producto} | <strong>Cantidad:</strong> {s.cantidad} {s.tipo} | <strong>Fecha:</strong> {s.fecha}</p>
                <p><strong>Proveedor:</strong> {s.proveedor} | <strong>Código:</strong> {s.codigo} | <strong>Moneda:</strong> {s.moneda}</p>
                <p><strong>Importe Total:</strong> {s.importeTotal} | <strong>Estado Recepción:</strong> {s.estado_recepcion}</p>
                <p><strong>Recepcionada:</strong> {s.cantidad_recepcionada} | <strong>Acumulada:</strong> {s.cantidadAcumulada}</p>
                <p><strong>Ajuste TC:</strong> {s.ajusteTC} | <strong>Ajuste x TC:</strong> {s.ajusteXTC}</p>
                <p><strong>Diferencia Cambio:</strong> {s.diferenciaCambio} | <strong>Importe a CC:</strong> {s.importeCC}</p>
                <p><strong>Importe Abonado:</strong> {s.importeAbonado} | <strong>Forma de Pago:</strong> {s.formaPago}</p>
                <p><strong>Cheque de:</strong> {s.chequePerteneceA}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
