'use client';

import { useProductsContext } from "@/context/ProductsContext";
import { useProveedoresContext } from "@/context/ProveedoresContext";
import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import jsPDF from 'jspdf';
//eslint-disable-next-line
export default function SolicitudIngresoPage({ id }: any) {
  const [fecha, setFecha] = useState('');
  const [proveedorId, setProveedorId] = useState('');
  const [producto, setProducto] = useState('0');
  const [codigo, setCodigo] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [precioUnitario, setPrecioUnitario] = useState('');
  const [cuenta, setCuenta] = useState('');
  const [iibb, setIibb] = useState('');
  const [tipo, setTipo] = useState('Litro');
  const [importeTotal, setImporteTotal] = useState('');
  const [estado_recepcion, setEstadoRecepcion] = useState('Completa');
  const [cantidad_recepcionada, setCantidadRecepcionada] = useState('');
  const [nro_remito_proveedor, setNroRemitoProveedor] = useState('');
  const [ajusteTC, setAjusteTC] = useState('False');
  const [importeAbonado, setImporteAbonado] = useState('');
  const [formaPago, setFormaPago] = useState('Efectivo');
  const [chequePerteneceA, setChequePerteneceA] = useState('');
  const [tipoCaja, setTipoCaja] = useState('caja diaria');
  
  const { productos: productosDelContexto } = useProductsContext();
  const { proveedores, loading: proveedoresLoading } = useProveedoresContext();
  const [errorMensaje, setErrorMensaje] = useState('');
  const [estadoOC, setEstadoOC] = useState('');
  const [montoYaAbonadoOC, setMontoYaAbonadoOC] = useState<number>(0);
  const [idLineaOCOriginal, setIdLineaOCOriginal] = useState<string | number>('');
  const [cantidadYaRecibida, setCantidadYaRecibida] = useState<number>(0);

  let problema = false;
  const token = typeof window !== 'undefined' ? localStorage.getItem("token") : null;
  const router = useRouter();


  const cargarFormulario = useCallback(async () => {
    try {
      setErrorMensaje('');
      const response = await fetch(`https://quimex.sistemataup.online/ordenes_compra/obtener/${id}`,{headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }});
      if (!response.ok) throw new Error(`Error al traer la orden`);
      const data = await response.json();
      if (!data?.items?.length) throw new Error("No se encontraron items en la OC.");
      
      const itemPrincipal = data.items[0];

      setMontoYaAbonadoOC(parseFloat(data.importe_abonado) || 0);
      setFecha(formatearFecha(data.fecha_creacion));
      setProveedorId(data.proveedor_id?.toString() ?? '');
      setProducto(itemPrincipal.producto_id?.toString() ?? '0');
      setCodigo(itemPrincipal.producto_codigo || '');
      setCantidad(itemPrincipal.cantidad_solicitada?.toString() ?? '');
      setPrecioUnitario(itemPrincipal.precio_unitario_estimado?.toString() ?? '0');
      setCuenta(data.cuenta?.toString() ?? '');
      setIibb(data.iibb?.toString() ?? '');
      setImporteTotal(itemPrincipal.importe_linea_estimado?.toString() ?? '0');
      setEstadoOC(data.estado || '');
      setIdLineaOCOriginal(itemPrincipal.id_linea || '');
      setAjusteTC(data.ajuste_tc === true ? 'True' : 'False');
      setNroRemitoProveedor(data.nro_remito_proveedor || '');
      setChequePerteneceA(data.cheque_perteneciente_a?.toString() ?? '');
      setTipoCaja(data.tipo_caja);
      setCantidadYaRecibida(parseFloat(itemPrincipal.cantidad_recibida) || 0);
      
      setEstadoRecepcion('Completa');
      setCantidadRecepcionada('');
      setImporteAbonado('');
      setFormaPago(data.forma_pago || 'Efectivo');
      
      if (itemPrincipal.producto_id) {
    await cargarCamposProducto(itemPrincipal.producto_id);
      }
      //eslint-disable-next-line
    } catch (err: any) {
      setErrorMensaje(err.message);
    }
  }, [id, token, cargarCamposProducto]);

  useEffect(() => {
    if (id && token) {
      cargarFormulario();
    }
  }, [id, token, cargarFormulario]);

  useEffect(() => {
    const cantNum = parseFloat(cantidad);
    const precioNum = parseFloat(precioUnitario);
    if (!isNaN(cantNum) && !isNaN(precioNum) && cantNum > 0 && precioNum >= 0) {
      const total = cantNum * precioNum;
      setImporteTotal(total.toFixed(2));
    }
  }, [cantidad, precioUnitario]);


  async function cargarCamposProducto(id_producto:number){
    try {
      const response = await fetch(`https://quimex.sistemataup.online/productos/obtener/${id_producto}`,{headers: { "Authorization": `Bearer ${token}` }});
      if (!response.ok) return;
      const dataProd = await response.json();
      const unidad = dataProd.unidad_venta;
      if (unidad === 'LT') setTipo('Litro');
      else if (unidad === 'KG') setTipo('Kilo');
      else setTipo('Unidad');
    } catch (err) {
      console.error("Error cargando tipo de producto:", err);
    }
  }

  const formatearFecha = (fechaOriginal: string | Date | undefined): string => {
    if (!fechaOriginal) return '';
    try {
        const fecha = new Date(fechaOriginal);
        return fecha.toISOString().split('T')[0];
    } catch {
        return '';
    }
  };
  //eslint-disable-next-line
  const enviarSolicitudAPI = async (solicitud: any) => {
    try {
      problema = false;
      setErrorMensaje('');
      const nuevoAbonoFloat = parseFloat(solicitud.importeAbonado) || 0;
      
      const payload = {
        proveedor_id: Number(solicitud.proveedor_id),
        cantidad: Number(solicitud.cantidad),
        precio_unitario: parseFloat(solicitud.precioUnitario),
        importe_total: parseFloat(solicitud.importeTotal),
        cuenta: solicitud.cuenta,
        iibb: solicitud.iibb,
        ajuste_tc: solicitud.ajusteTC === 'True',
        nro_remito_proveedor: solicitud.nro_remito_proveedor,
        estado_recepcion: solicitud.estado_recepcion,
        importe_abonado: nuevoAbonoFloat,
        forma_pago: solicitud.formaPago,
        cheque_perteneciente_a: solicitud.chequePerteneceA,
        tipo_caja: solicitud.tipo_caja,
        //eslint-disable-next-line
        items_recibidos: solicitud.items_recibidos.map((item: any) => ({
            id_linea: Number(item.id_linea),
            cantidad_recibida: parseFloat(item.cantidad_recibida) || 0,
            producto_codigo: String(item.producto_codigo),
            costo_unitario_ars: parseFloat(solicitud.precioUnitario) || 0
        })),
      };

      const userItem = sessionStorage.getItem("user");
      const user = userItem ? JSON.parse(userItem) : null;
      if (!user || !token) throw new Error("Error de autenticación.");
      
      const response = await fetch(`https://quimex.sistemataup.online/ordenes_compra/recibir/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-User-Role' : user.role || 'USER',
            'X-User-Name' : user.usuario || user.name,
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || data?.mensaje || `Error ${response.status}`);
      //eslint-disable-next-line
    } catch (error: any) {
        problema = true;
        setErrorMensaje(error.message || "Ocurrió un error desconocido.");
    }
  };

  const handleAgregar = async () => {
    setErrorMensaje('');

    // --- INICIO DE LA VALIDACIÓN ---
    const cantRecepcionadaNum = parseFloat(cantidad_recepcionada);
    if (!cantidad_recepcionada || isNaN(cantRecepcionadaNum) ) {
        setErrorMensaje("La 'Cantidad Recepcionada' es obligatoria");
        return; // Detiene la ejecución si el campo no es válido
    }
    if (!nro_remito_proveedor.trim()) {
        setErrorMensaje("El 'N° Remito Proveedor' es un campo obligatorio.");
        return; // Detiene la ejecución si el campo está vacío
    }
    // --- FIN DE LA VALIDACIÓN ---

    const nuevaSolicitud = {
      proveedor_id: proveedorId, producto, codigo, cantidad, precioUnitario, cuenta, iibb, tipo, importeTotal,
      estado_recepcion, cantidad_recepcionada,
      items_recibidos: [{
         "id_linea": idLineaOCOriginal, "cantidad_recibida": parseFloat(cantidad_recepcionada) || 0,
         "costo_unitario_ars": 0, "notas_item": "", "producto_codigo": codigo,
      }],
      ajusteTC, importeAbonado, formaPago, chequePerteneceA,
      nro_remito_proveedor: nro_remito_proveedor.trim(), tipo_caja: tipoCaja,
    };

    await enviarSolicitudAPI(nuevaSolicitud);
    if(!problema) {
      alert("Ingreso registrado correctamente.");
      router.back();
    }
  };

  const handleDescargarPDF = () => {
    const doc = new jsPDF();
    const productoInfo = productosDelContexto.find(p => p.id.toString() === producto);
    const proveedorInfo = proveedores.find(p => p.id.toString() === proveedorId);
    let y = 20;

    doc.setFontSize(22);
    doc.text(`Orden de Compra #${id}`, 105, y, { align: 'center' });
    y += 15;
    doc.setLineWidth(0.5); doc.line(20, y, 190, y); y += 10;
    doc.setFontSize(12);

    const agregarCampo = (label: string, value: string) => {
        doc.text(label, 20, y); doc.text(value || 'N/A', 90, y); y += 8;
    };
    
    agregarCampo('Fecha OC:', fecha);
    agregarCampo('Proveedor:', proveedorInfo?.nombre || 'N/A');
    agregarCampo('Estado OC:', estadoOC);
    agregarCampo('Cuenta Contable:', cuenta);
    agregarCampo('Percepción IIBB (%):', iibb);
    y += 5; doc.line(20, y, 190, y); y += 10;
    
    doc.setFontSize(14); doc.text('Detalles del Pedido:', 20, y); y += 8; doc.setFontSize(12);

    agregarCampo('Producto:', `${productoInfo?.nombre || 'N/A'} (${codigo})`);
    agregarCampo('Cantidad Solicitada:', `${cantidad} ${tipo}`);
    agregarCampo('Precio Unitario:', `$${parseFloat(precioUnitario || '0').toFixed(2)}`);
    agregarCampo('Importe Total OC:', `$${parseFloat(importeTotal || '0').toFixed(2)}`);
    y += 5; doc.line(20, y, 190, y); y += 10;

    doc.setFontSize(14); doc.text('Información de Recepción:', 20, y); y += 8; doc.setFontSize(12);
    agregarCampo('Estado Recepción:', estado_recepcion);
    agregarCampo('Cantidad Recepcionada (Total):', `${cantidadYaRecibida + parseFloat(cantidad_recepcionada || '0')} ${tipo}`);
    agregarCampo('N° Remito Proveedor:', nro_remito_proveedor);
    doc.save(`Orden_de_Compra_${id}.pdf`);
  };

  const baseInputClass = "w-full px-3 py-2 rounded bg-white text-black border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const disabledInputClass = "disabled:bg-gray-200 disabled:text-gray-600 disabled:cursor-not-allowed";
  const labelClass = "block text-sm font-medium mb-1 text-white";
  const opcionesFormaPago = ["Cheque", "Efectivo", "Transferencia", "Cuenta Corriente"];
  
  let placeholderParaImporteAbonado = "Ej: 100.00";
  if (estadoOC === "Con Deuda") {
    const totalDeLaOC = parseFloat(importeTotal) || 0;
    const deudaActual = totalDeLaOC - montoYaAbonadoOC;
    if (deudaActual > 0) {
      placeholderParaImporteAbonado = `Deuda pendiente: $${deudaActual.toFixed(2)}`;
    }
  }

  const cantidadSolicitadaNum = parseFloat(cantidad) || 0;
  const cantidadPendiente = cantidadSolicitadaNum - cantidadYaRecibida;
  const placeholderParaCantidad = `Pendiente: ${cantidadPendiente.toFixed(2)} ${tipo}`;

  return (
    <div className="min-h-screen flex flex-col items-center bg-[#20119d] px-4 py-10">
      <h1 className="text-white text-3xl font-bold mb-8 text-center">Solicitud de Ingreso (OC: {id})</h1>
      {estadoOC && (<p className="text-white text-lg mb-4">Estado Orden de Compra: <span className={`font-semibold ${estadoOC === 'Aprobado' ? 'text-green-300' : estadoOC === 'Con Deuda' ? 'text-orange-300' : 'text-yellow-300'}`}>{estadoOC}</span></p>)}
      {errorMensaje && <div className="w-full max-w-4xl mb-4 bg-red-100 border-red-400 text-red-700 px-4 py-3 rounded" role="alert">{errorMensaje}</div>}
      
      <div className="bg-white/10 backdrop-blur-sm p-6 md:p-8 rounded-lg shadow-xl w-full max-w-5xl text-white">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-x-6 gap-y-4">
          
          <div>
            <label htmlFor="fecha" className={labelClass}>Fecha OC</label>
            <input id="fecha" type="date" value={fecha} readOnly className={`${baseInputClass} ${disabledInputClass}`} />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="proveedor" className={labelClass}>Proveedor</label>
            <select id="proveedor" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} className={baseInputClass} disabled={proveedoresLoading}>
              <option value="" disabled>{proveedoresLoading ? "Cargando..." : "Seleccionar Proveedor"}</option>
              {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="producto" className={labelClass}>Producto (Principal)</label>
            <input id="producto" value={`${productosDelContexto.find(p=>p.id.toString() === producto)?.nombre || 'N/A'} (${codigo})`} className={`${baseInputClass} ${disabledInputClass}`} disabled />
          </div>

          <div>
            <label htmlFor="cantidad" className={labelClass}>Cant. Solicitada</label>
            <input id="cantidad" type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={baseInputClass} />
          </div>
          <div>
            <label htmlFor="precioUnitario" className={labelClass}>Precio Unitario (Sin IVA)</label>
            <input id="precioUnitario" type="number" step="0.01" value={precioUnitario} onChange={(e) => setPrecioUnitario(e.target.value)} className={baseInputClass} placeholder="Ej: 150.50" />
          </div>
          <div>
            <label htmlFor="importeTotal" className={labelClass}>Importe Total OC</label>
            <input id="importeTotal" type="number" step="0.01" value={importeTotal} onChange={(e) => setImporteTotal(e.target.value)} className={baseInputClass} />
          </div>
          <div>
            <label htmlFor="unidad" className={labelClass}>Unidad Medida</label>
            <input id="unidad" type="text" value={tipo} readOnly className={`${baseInputClass} ${disabledInputClass}`} />
          </div>
          
          <hr className="col-span-1 md:col-span-4 border-t border-white/20 my-2" />
          
           <div>
            <label htmlFor="estado_recepcion" className={labelClass}>Estado Recepción *</label>
            <select id="estado_recepcion" value={estado_recepcion} onChange={(e) => setEstadoRecepcion(e.target.value)} className={`${baseInputClass}`} required>
              <option value="Completa">Completa</option> <option value="Parcial">Parcial</option> <option value="Extra">Extra</option> <option value="Con Daños">Con Daños</option>
            </select>
          </div>
          
          <div>
            <label htmlFor="cantidad_recepcionada" className={labelClass}>Cantidad Recepcionada *</label>
            <input 
                id="cantidad_recepcionada" 
                type="number" 
                min="0" 
                value={cantidad_recepcionada} 
                onChange={(e) => setCantidadRecepcionada(e.target.value)} 
                className={baseInputClass} 
                placeholder={placeholderParaCantidad}
                required
            />
            {cantidadYaRecibida > 0 && (
                <p className="text-xs text-gray-300 mt-1">
                    Ya recibido: {cantidadYaRecibida.toFixed(2)} {tipo}
                </p>
            )}
          </div>
          
          <div>
            <label htmlFor="nro_remito_proveedor" className={labelClass}>N° Remito Proveedor *</label>
            <input id="nro_remito_proveedor" type="text" value={nro_remito_proveedor} onChange={(e) => setNroRemitoProveedor(e.target.value)} className={baseInputClass} required />
          </div>
          <div>
            <label htmlFor="importeAbonado" className={labelClass}>Importe a Abonar (Nuevo)</label>
            <input id="importeAbonado" type="number" step="0.01" min="0" value={importeAbonado} onChange={(e) => setImporteAbonado(e.target.value)} className={baseInputClass} placeholder={placeholderParaImporteAbonado}/>
            {estadoOC === "Con Deuda" && montoYaAbonadoOC > 0 && (<p className="text-xs text-gray-300 mt-1">Ya abonado: ${montoYaAbonadoOC.toFixed(2)}</p>)}
          </div>

          <div>
            <label htmlFor="formaPago" className={labelClass}>Forma de Pago</label>
            <select id="formaPago" value={formaPago} onChange={(e) => setFormaPago(e.target.value)} className={baseInputClass}>
                {opcionesFormaPago.map(opcion => <option key={opcion} value={opcion}>{opcion}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="chequePerteneceA" className={labelClass}>Cheque Perteneciente a</label>
            <input id="chequePerteneceA" type="text" value={chequePerteneceA} onChange={(e) => setChequePerteneceA(e.target.value)} className={baseInputClass}/>
          </div>
          <div>
            <label htmlFor="tipoCaja" className={labelClass}>Tipo de Caja</label>
            <select id="tipoCaja" value={tipoCaja} onChange={(e) => setTipoCaja(e.target.value)} className={baseInputClass}>
                <option value="caja diaria">Caja Diaria</option>
                <option value="caja mayor">Caja Mayor</option>
            </select>
          </div>
           <div className="md:col-span-1">
            <label htmlFor="ajusteTC" className={labelClass}>Ajuste x TC</label>
            <select id="ajusteTC" value={ajusteTC} onChange={(e) => setAjusteTC(e.target.value)} className={`${baseInputClass}`}>
              <option value="True">Sí</option>
              <option value="False">No</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="cuenta" className={labelClass}>Cuenta</label>
            <input id="cuenta" type="text" value={cuenta} onChange={(e) => setCuenta(e.target.value)} className={baseInputClass} placeholder="Ej: 411001" />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="iibb" className={labelClass}>IIBB (%)</label>
            <input id="iibb" type="number" step="0.01" value={iibb} onChange={(e) => setIibb(e.target.value)} className={baseInputClass} placeholder="Ej: 3.5" />
          </div>

        </div>

        <div className="flex items-center justify-between mt-8">
            <button onClick={handleDescargarPDF} type="button" className="bg-blue-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-600 transition">Descargar</button>
            <div className="flex gap-4">
              <button onClick={handleAgregar} className="bg-green-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-600">Registrar ingreso</button>
               <button onClick={() => router.back()} type="button" className="bg-gray-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-600 transition">Volver</button>
            </div>
        </div>
      </div>
    </div>
  );
}