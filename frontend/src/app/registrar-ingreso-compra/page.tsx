'use client';

import React, { useState } from 'react';

interface ISolicitudes {
  fecha: string,
  proveedor: string,
  producto: string,
  codigo: string,
  moneda: string,
  cantidad: string,
  tipo: string,
  importeTotal: string,
  estadoRecepcion: string,
  cantidadRecepcionada: string,
  ajusteTC: string,
  importeCC: string,
  cantidadAcumulada: string,
  ajusteXTC: string,
  diferenciaCambio: string,
  importeAbonado: string,
  formaPago: string,
  chequePerteneceA: string,
}

export default function SolicitudIngresoPage() {
  const [fecha, setFecha] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [producto, setProducto] = useState('');
  const [codigo, setCodigo] = useState('');
  const [moneda, setMoneda] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [tipo, setTipo] = useState('Litro');
  const [importeTotal, setImporteTotal] = useState('');
  const [estadoRecepcion, setEstadoRecepcion] = useState('completa');
  const [cantidadRecepcionada, setCantidadRecepcionada] = useState('');
  const [ajusteTC, setAjusteTC] = useState('');
  const [importeCC, setImporteCC] = useState('');
  const [cantidadAcumulada, setCantidadAcumulada] = useState('');
  const [ajusteXTC, setAjusteXTC] = useState('');
  const [diferenciaCambio, setDiferenciaCambio] = useState('');
  const [importeAbonado, setImporteAbonado] = useState('');
  const [formaPago, setFormaPago] = useState('');
  const [chequePerteneceA, setChequePerteneceA] = useState('');

  const [solicitudes, setSolicitudes] = useState<ISolicitudes[]>([]);


  const enviarSolicitudAPI = async (solicitud: ISolicitudes) => {
    try {
      const response = await fetch('endpooooooooint', { //poner el endpoint cuando se tenga
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(solicitud),
      });
  
      if (!response.ok) {
        throw new Error('Error al enviar la solicitud');
      }
  
      console.log('Solicitud enviada correctamente');
    } catch (error) {
      console.error('Error al enviar la solicitud:', error);
    }
  };
  



  const handleAgregar = async () => {
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
      estadoRecepcion,
      cantidadRecepcionada,
      ajusteTC,
      importeCC,
      cantidadAcumulada,
      ajusteXTC,
      diferenciaCambio,
      importeAbonado,
      formaPago,
      chequePerteneceA,
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
  };

  const handleComprar = () => {
    alert('Solicitud enviada con éxito.');
    setSolicitudes([]);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#20119d] px-4 py-10">
      <h1 className="text-white text-3xl font-bold mb-8 text-center">Solicitud de Ingreso</h1>

      <div className="flex flex-col gap-4 w-full max-w-4xl text-white">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label>Fecha *</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full px-3 py-2 rounded bg-white text-black" />
          </div>
          <div>
            <label>Proveedor</label>
            <input value={proveedor} onChange={(e) => setProveedor(e.target.value)} className="w-full px-3 py-2 rounded bg-white text-black" />
          </div>
          <div>
            <label>Producto *</label>
            <input value={producto} onChange={(e) => setProducto(e.target.value)} className="w-full px-3 py-2 rounded bg-white text-black" />
          </div>
          <div>
            <label>Código</label>
            <input value={codigo} onChange={(e) => setCodigo(e.target.value)} className="w-full px-3 py-2 rounded bg-white text-black" />
          </div>
          <div>
            <label>Moneda *</label>
            <input value={moneda} onChange={(e) => setMoneda(e.target.value)} className="w-full px-3 py-2 rounded bg-white text-black" />
          </div>
          <div>
            <label>Cantidad *</label>
            <input type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="w-full px-3 py-2 rounded bg-white text-black" />
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
            <select value={estadoRecepcion} onChange={(e) => setEstadoRecepcion(e.target.value)} className="w-full px-3 py-2 rounded bg-white text-black">
              <option value="completa">Completa</option>
              <option value="incompleta">Incompleta</option>
            </select>
          </div>
          <div>
            <label>Cantidad Recepcionada</label>
            <input type="number" value={cantidadRecepcionada} onChange={(e) => setCantidadRecepcionada(e.target.value)} className="w-full px-3 py-2 rounded bg-white text-black" />
          </div>
          <div>
            <label>Ajuste TC</label>
            <input value={ajusteTC} onChange={(e) => setAjusteTC(e.target.value)} className="w-full px-3 py-2 rounded bg-white text-black" />
          </div>
          <div>
            <label>Importe a CC</label>
            <input value={importeCC} onChange={(e) => setImporteCC(e.target.value)} className="w-full px-3 py-2 rounded bg-white text-black" />
          </div>
          <div>
            <label>Cant. Recepcionada Acumulada</label>
            <input value={cantidadAcumulada} onChange={(e) => setCantidadAcumulada(e.target.value)} className="w-full px-3 py-2 rounded bg-white text-black" />
          </div>
          <div>
            <label>Ajuste x TC</label>
            <input value={ajusteXTC} onChange={(e) => setAjusteXTC(e.target.value)} className="w-full px-3 py-2 rounded bg-white text-black" />
          </div>
          <div>
            <label>Diferencia por Ajuste de Cambio</label>
            <input value={diferenciaCambio} onChange={(e) => setDiferenciaCambio(e.target.value)} className="w-full px-3 py-2 rounded bg-white text-black" />
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
                <p><strong>Importe Total:</strong> {s.importeTotal} | <strong>Estado Recepción:</strong> {s.estadoRecepcion}</p>
                <p><strong>Recepcionada:</strong> {s.cantidadRecepcionada} | <strong>Acumulada:</strong> {s.cantidadAcumulada}</p>
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
