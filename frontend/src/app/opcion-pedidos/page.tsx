"use client";

import FormularioActualizarPedido from '@/components/formularioActualizacionPedido';
import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import BotonVolver from '@/components/BotonVolver';

type DetalleItem = {
  cantidad: number;
  precio_total_item_ars: number;
  precio_unitario_venta_ars: number;
  producto_id: number;
  producto_nombre: string;
};

type BoletaOriginal = {
  venta_id: number;
  monto_final_con_recargos: number;
  fecha_pedido: string;
  cliente_nombre: string;
  direccion_entrega: string;
  detalles: DetalleItem[];
  fecha_emision?: string;
  nombre_vendedor?: string;
  cuit_cliente?: string;
  forma_pago: string;
  monto_pagado_cliente?: number;
  vuelto_calculado?: number;
  requiere_factura?: boolean;
  monto_total_base: number;
  descuento_total_global_porcentaje?: number;
  observaciones?: string;
  recargos?: {
    factura_iva: number;
    transferencia: number;
  };
};

type BoletaParaLista = {
  venta_id: number;
  monto_final_con_recargos: number;
  fecha_pedido: string;
  fecha_pedido_formateada: string;
  cliente_nombre: string;
  direccion_entrega: string;
};


type Pagination = {
  total_items: number;
  total_pages: number;
  current_page: number;
  per_page: number;
  has_next: boolean;
  has_prev: boolean;
};


export default function TotalPedidos() {
  const [boletasApiOriginales, setBoletasApiOriginales] = useState<Partial<BoletaOriginal>[]>([]);
  const [boletasFiltradasParaLista, setBoletasFiltradasParaLista] = useState<BoletaParaLista[]>([]);
  const [boletasPaginadas, setBoletasPaginadas] = useState<BoletaParaLista[]>([]);
  
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [idBoleta, setIdBoleta] = useState<number|undefined>();
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const itemsPerPage = 20;

  const [selectedBoletas, setSelectedBoletas] = useState<Set<number>>(new Set());
  const [isPrinting, setIsPrinting] = useState(false);
  const [printingMessage, setPrintingMessage] = useState<string | null>(null);
  const [fechaSeleccionada, setFechaSeleccionada] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [boletas, setBoletas] = useState<BoletaParaLista[]>([]);


  
  useEffect(() => {
    const fetchBoletasResumen = async () => {
      try {
        setLoading(true);
        setError(null);
        const token = localStorage.getItem("token")

        const response = await fetch(`https://quimex.sistemataup.online/ventas/obtener_todas?per_page=1000`,{headers:{"content-type":"application/json","Authorization":`Bearer ${token}`}});
        if (!response.ok) {
          throw new Error(`Error al traer boletas: ${response.statusText}`);
        }
        const data = await response.json();
        setBoletasApiOriginales((data.ventas || []) as Partial<BoletaOriginal>[]);
      } 
      // eslint-disable-next-line
    catch (error: unknown) {
        if (error instanceof Error) {
            setError(error.message); // O cualquier otro manejo de error
        } else {
            setError('Ocurrió un error desconocido.');
        }
    }
    };

    fetchBoletasResumen();
  }, []);


  useEffect(() => {
    if (boletasApiOriginales.length === 0 && !loading) {
        setBoletasFiltradasParaLista([]);
        return;
    }
    
    const filtradosConDireccion = boletasApiOriginales.filter(
      (item) => item.direccion_entrega && item.direccion_entrega.trim() !== ""
    );

    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    manana.setHours(0, 0, 0, 0);
    
    const filtradosPorFecha = filtradosConDireccion.filter(item => {
        if (!item.fecha_pedido) return false;
        try {
            const fechaPedido = new Date(item.fecha_pedido);
            const fechaPedidoSoloFecha = new Date(fechaPedido.getFullYear(), fechaPedido.getMonth(), fechaPedido.getDate());
            return fechaPedidoSoloFecha.getTime() === manana.getTime();
        } catch (e) {
            console.error("Error parseando fecha_pedido:", item.fecha_pedido, e);
            return false;
        }
    });

    const procesadosParaLista = filtradosPorFecha.map((item): BoletaParaLista => {
      const fechaFormateada = item.fecha_pedido
        ? new Date(item.fecha_pedido).toLocaleDateString("es-AR", {
            day: "2-digit", month: "2-digit", year: "numeric",
          })
        : "N/A";
      return { 
        venta_id: item.venta_id!,
        monto_final_con_recargos: item.monto_final_con_recargos!,
        fecha_pedido: item.fecha_pedido!,
        fecha_pedido_formateada: fechaFormateada,
        cliente_nombre: item.cliente_nombre!,
        direccion_entrega: item.direccion_entrega!,
       };
    });

    setBoletasFiltradasParaLista(procesadosParaLista);

  }, [boletasApiOriginales, loading]);


  useEffect(() => {
    if (boletasFiltradasParaLista.length === 0) {
        setBoletasPaginadas([]);
        setPagination(null);
        return;
    }

    const totalItems = boletasFiltradasParaLista.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const currentPage = Math.min(page, totalPages || 1);
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const itemsToShow = boletasFiltradasParaLista.slice(startIndex, endIndex);

    setBoletasPaginadas(itemsToShow);
    setPagination({
      total_items: totalItems,
      total_pages: totalPages,
      current_page: currentPage,
      per_page: itemsPerPage,
      has_next: currentPage < totalPages,
      has_prev: currentPage > 1,
    });

  }, [boletasFiltradasParaLista, page, itemsPerPage]);


  const handleCheckboxChange = (ventaId: number) => {
    setSelectedBoletas(prevSelected => {
      const newSelected = new Set(prevSelected);
      if (newSelected.has(ventaId)) {
        newSelected.delete(ventaId);
      } else {
        newSelected.add(ventaId);
      }
      return newSelected;
    });
  };

  const handleSelectAllOnPage = () => {
    const allOnPageIds = new Set(boletasPaginadas.map(b => b.venta_id));
    const currentPageSelected = boletasPaginadas.length > 0 && boletasPaginadas.every(b => selectedBoletas.has(b.venta_id));
    
    setSelectedBoletas(prevSelected => {
        const newSelected = new Set(prevSelected);
        if (currentPageSelected) {
            allOnPageIds.forEach(id => newSelected.delete(id));
        } else {
            allOnPageIds.forEach(id => newSelected.add(id));
        }
        return newSelected;
    });
  };
  
  useEffect(() => {
    const fetchBoletasPorFecha = async () => {
      // Si no hay fecha seleccionada, no hacemos nada.
      if (!fechaSeleccionada) return;

      try {
        setLoading(true);
        setError(null);
        setBoletas([]); // Limpiamos la lista anterior
        setPagination(null);
        
        const token = localStorage.getItem("token");

        // --- CONSTRUIMOS LA URL CON LA FECHA Y LA PAGINACIÓN ---
        const params = new URLSearchParams();
        params.append('fecha_desde', fechaSeleccionada);
        params.append('fecha_hasta', fechaSeleccionada);
        params.append('page', String(page));
        
        // Llamamos al endpoint que trae boletas CON entrega
        const apiUrl = `https://quimex.sistemataup.online/ventas/con_entrega?${params.toString()}`;
        
        const response = await fetch(apiUrl, {headers:{"content-type":"application/json","Authorization":`Bearer ${token}`}});
        if (!response.ok) {
          throw new Error(`Error al traer boletas: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Procesamos los datos recibidos para la lista
        const boletasProcesadas = (data.ventas || []).map((item: BoletaOriginal): BoletaParaLista => {
            const fechaFormateada = item.fecha_pedido
              ? new Date(item.fecha_pedido).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
              : "N/A";
            return { 
              venta_id: item.venta_id,
              monto_final_con_recargos: item.monto_final_con_recargos,
              fecha_pedido: item.fecha_pedido,
              fecha_pedido_formateada: fechaFormateada,
              cliente_nombre: item.cliente_nombre,
              direccion_entrega: item.direccion_entrega,
            };
        });

        setBoletas(boletasProcesadas);
        setPagination(data.pagination);

} catch (err: unknown) {
        let errorMessage = 'Error desconocido al cargar los pedidos.';
        if (err instanceof Error) {
          errorMessage = err.message;
        }
        setError(errorMessage);
        setBoletas([]);
        setPagination(null);
      } finally {
        setLoading(false);
      }
    };

    fetchBoletasPorFecha();
  }, [fechaSeleccionada, page]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFechaSeleccionada(e.target.value);
    setPage(1); // Muy importante: resetea a la página 1 con cada nueva fecha
  };

  const renderBoletaParaImprimir = (boletaData: BoletaOriginal) => {
    const montoBase = boletaData.monto_total_base || 0;
    const recargosTransferencia = boletaData.recargos?.transferencia || 0;
    const recargosIva = boletaData.recargos?.factura_iva || 0;
    const descuentoTotalPorc = boletaData.descuento_total_global_porcentaje || 0;
    
    const totalConRecargosBruto = montoBase + recargosTransferencia + recargosIva;
    const montoDescuentoTotal = totalConRecargosBruto * (descuentoTotalPorc / 100);
    const displayTotal = totalConRecargosBruto - montoDescuentoTotal;
    const fechaBoleta = boletaData.fecha_pedido || boletaData.fecha_emision || new Date().toISOString();

    const fontSizeBaseBoleta = '10pt'; 
    const fontSizeItems = '1em'; 

    return `
      <div class="presupuesto-container" style="width: 210mm; height: auto; min-height:280mm; padding: 10mm; box-sizing: border-box; font-family: Arial, sans-serif; font-size: ${fontSizeBaseBoleta}; border: 1px solid #eee; margin-bottom:5mm; page-break-after: always;">
        <header class="presupuesto-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; border-bottom: 2px solid black; padding-bottom: 10px;">
          <div class="logo-container" style="text-align: left;">
            <img src="/logo.png" alt="QuiMex" class="logo" style="max-width: 150px; margin-bottom: 5px;" />
            <p class="sub-logo-text" style="font-size: 0.8em; font-weight: bold;">PRESUPUESTO NO VALIDO COMO FACTURA</p>
          </div>
          <div class="info-empresa" style="text-align: right; font-size: 0.9em;">
            <p>📱 11 2395 1494</p><p>📞 4261 3605</p><p>📸 quimex_berazategui</p>
          </div>
        </header>
        <section class="datos-pedido" style="margin-bottom: 15px; display: flex; justify-content: space-between; flex-wrap: wrap;">
          <table class="tabla-datos-principales" style="width: 48%; border-collapse: collapse; margin-bottom: 5mm;">
            <tbody>
              <tr><td style="font-weight: bold; padding: 2px 0;">PEDIDO:</td><td>#${boletaData.venta_id}</td></tr>
              <tr><td style="font-weight: bold; padding: 2px 0;">FECHA:</td><td>${new Date(fechaBoleta).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'})}</td></tr>
              <tr><td style="font-weight: bold; padding: 2px 0;">CLIENTE:</td><td>${boletaData.cliente_nombre || 'CONSUMIDOR FINAL'}</td></tr>
              ${boletaData.cuit_cliente ? `<tr><td style="font-weight: bold; padding: 2px 0;">CUIT:</td><td>${boletaData.cuit_cliente}</td></tr>` : ''}
              ${boletaData.nombre_vendedor ? `<tr><td style="font-weight: bold; padding: 2px 0;">VENDEDOR:</td><td>${boletaData.nombre_vendedor}</td></tr>` : ''}
            </tbody>
          </table>
          <table class="tabla-datos-secundarios" style="width: 48%; border-collapse: collapse; margin-bottom: 5mm;">
            <tbody>
              <tr><td style="font-weight: bold; padding: 2px 0;">DIRECCIÓN:</td><td>${boletaData.direccion_entrega || '-'}</td></tr>
              <tr><td style="font-weight: bold; padding: 2px 0;">FORMA PAGO:</td><td>${boletaData.forma_pago}</td></tr>
              <tr><td style="font-weight: bold; padding: 2px 0;">SUBTOTAL (Prod):</td><td style="text-align: right;">$ ${montoBase.toFixed(2)}</td></tr>
              ${recargosTransferencia > 0 ? `<tr><td style="font-weight: bold; padding: 2px 0;">RECARGO TRANSF.:</td><td style="text-align: right;">$ ${recargosTransferencia.toFixed(2)}</td></tr>` : ''}
              ${recargosIva > 0 ? `<tr><td style="font-weight: bold; padding: 2px 0;">${boletaData.requiere_factura ? "IVA (Factura)" : "Recargo Factura"}:</td><td style="text-align: right;">$ ${recargosIva.toFixed(2)}</td></tr>` : ''}
              ${descuentoTotalPorc > 0 ? `<tr><td style="font-weight: bold; padding: 2px 0;">DESC. TOTAL (${descuentoTotalPorc}%):</td><td style="text-align: right; color: red;">- $ ${montoDescuentoTotal.toFixed(2)}</td></tr>` : ''}
              <tr><td style="font-weight: bold; padding: 2px 0; font-size: 1.15em;">TOTAL FINAL:</td><td style="text-align: right; font-weight: bold; font-size: 1.15em;">$ ${displayTotal.toFixed(2)}</td></tr>
            </tbody>
          </table>
        </section>
        <section class="detalle-productos" style="margin-bottom: 15px;">
          <table class="tabla-items" style="width: 100%; border-collapse: collapse; font-size: ${fontSizeItems};">
            <thead>
              <tr style="background-color: #f0f0f0;">
                <th style="border: 1px solid black; padding: 3px; text-align: center; width: 10%;">ITEM</th>
                <th style="border: 1px solid black; padding: 3px; text-align: left; width: 45%;">PRODUCTO</th>
                <th style="border: 1px solid black; padding: 3px; text-align: center; width: 15%;">CANT.</th>
                <th style="border: 1px solid black; padding: 3px; text-align: right; width: 15%;">P. UNIT.</th>
                <th style="border: 1px solid black; padding: 3px; text-align: right; width: 15%;">SUBTOTAL</th>
              </tr>
            </thead>
            <tbody>
              ${(boletaData.detalles || []).map((item: DetalleItem, index: number) => `
                <tr>
                  <td style="border: 1px solid black; padding: 2px 3px; text-align: center;">${index + 1}</td>
                  <td style="border: 1px solid black; padding: 2px 3px;">${item.producto_nombre || 'N/A'}</td>
                  <td style="border: 1px solid black; padding: 2px 3px; text-align: center;">${item.cantidad || 0}</td>
                  <td style="border: 1px solid black; padding: 2px 3px; text-align: right;">$ ${(typeof item.precio_unitario_venta_ars === 'number' ? item.precio_unitario_venta_ars : 0).toFixed(2)}</td>
                  <td style="border: 1px solid black; padding: 2px 3px; text-align: right;">$ ${(typeof item.precio_total_item_ars === 'number' ? item.precio_total_item_ars : 0).toFixed(2)}</td>
                </tr>
              `).join('')}
              ${Array.from({ length: Math.max(0, 12 - (boletaData.detalles || []).length) }).map(() => 
                `<tr class="empty-row"><td style="border: 1px solid black; padding: 2px 3px; height: 1.1em;"> </td><td style="border: 1px solid black;"> </td><td style="border: 1px solid black;"> </td><td style="border: 1px solid black;"> </td><td style="border: 1px solid black;"> </td></tr>`).join('')}
            </tbody>
          </table>
        </section>
        ${boletaData.observaciones ? `<section class="observaciones" style="margin-top: 10px; font-size: 0.9em; padding: 3px 0;"><p style="margin:0;"><strong>Observaciones:</strong> ${boletaData.observaciones}</p></section>` : ''}
        <footer class="presupuesto-footer" style="margin-top: auto; padding-top: 10px; border-top: 1px solid #ccc; font-size: 0.8em; text-align: center;">
          <p>Precios sujetos a modificaciones sin previo aviso. Presupuesto válido por 7 días.</p>
        </footer>
      </div>
    `;
  };

  const renderRemitoParaImprimir = (boletaData: BoletaOriginal) => {
    const fechaBoleta = boletaData.fecha_pedido || boletaData.fecha_emision || new Date().toISOString();
    const fontSizeBaseBoleta = '10pt'; 
    const fontSizeItems = '1em'; 

    return `
      <div class="presupuesto-container" style="width: 210mm; height: auto; min-height:280mm; padding: 10mm; box-sizing: border-box; font-family: Arial, sans-serif; font-size: ${fontSizeBaseBoleta}; border: 1px solid #eee; margin-bottom:5mm; page-break-after: always;">
        <header class="presupuesto-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; border-bottom: 2px solid black; padding-bottom: 10px;">
          <div class="logo-container" style="text-align: left;">
            <img src="/logo.png" alt="QuiMex" class="logo" style="max-width: 150px; margin-bottom: 5px;" />
            <p class="sub-logo-text" style="font-size: 0.8em; font-weight: bold;">REMITO</p>
          </div>
          <div class="info-empresa" style="text-align: right; font-size: 0.9em;">
            <p>📱 11 2395 1494</p><p>📞 4261 3605</p><p>📸 quimex_berazategui</p>
          </div>
        </header>
        <section class="datos-pedido" style="margin-bottom: 15px; display: flex; justify-content: space-between; flex-wrap: wrap;">
          <table class="tabla-datos-principales" style="width: 100%; border-collapse: collapse; margin-bottom: 5mm;">
            <tbody>
              <tr><td style="font-weight: bold; padding: 2px 0;">PEDIDO:</td><td>#${boletaData.venta_id}</td></tr>
              <tr><td style="font-weight: bold; padding: 2px 0;">FECHA:</td><td>${new Date(fechaBoleta).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'})}</td></tr>
              <tr><td style="font-weight: bold; padding: 2px 0;">CLIENTE:</td><td>${boletaData.cliente_nombre || 'CONSUMIDOR FINAL'}</td></tr>
              ${boletaData.cuit_cliente ? `<tr><td style="font-weight: bold; padding: 2px 0;">CUIT:</td><td>${boletaData.cuit_cliente}</td></tr>` : ''}
              <tr><td style="font-weight: bold; padding: 2px 0;">DIRECCIÓN:</td><td>${boletaData.direccion_entrega || '-'}</td></tr>
            </tbody>
          </table>
        </section>
        <section class="detalle-productos" style="margin-bottom: 15px;">
          <table class="tabla-items" style="width: 100%; border-collapse: collapse; font-size: ${fontSizeItems};">
            <thead>
              <tr style="background-color: #f0f0f0;">
                <th style="border: 1px solid black; padding: 3px; text-align: center; width: 10%;">ITEM</th>
                <th style="border: 1px solid black; padding: 3px; text-align: left; width: 75%;">PRODUCTO</th>
                <th style="border: 1px solid black; padding: 3px; text-align: center; width: 15%;">CANT.</th>
              </tr>
            </thead>
            <tbody>
              ${(boletaData.detalles || []).map((item: DetalleItem, index: number) => `
                <tr>
                  <td style="border: 1px solid black; padding: 2px 3px; text-align: center;">${index + 1}</td>
                  <td style="border: 1px solid black; padding: 2px 3px;">${item.producto_nombre || 'N/A'}</td>
                  <td style="border: 1px solid black; padding: 2px 3px; text-align: center;">${item.cantidad || 0}</td>
                </tr>
              `).join('')}
              ${Array.from({ length: Math.max(0, 12 - (boletaData.detalles || []).length) }).map(() => 
                `<tr class="empty-row"><td style="border: 1px solid black; padding: 2px 3px; height: 1.1em;"> </td><td style="border: 1px solid black;"> </td><td style="border: 1px solid black;"> </td></tr>`).join('')}
            </tbody>
          </table>
        </section>
        ${boletaData.observaciones ? `<section class="observaciones" style="margin-top: 10px; font-size: 0.9em; padding: 3px 0;"><p style="margin:0;"><strong>Observaciones:</strong> ${boletaData.observaciones}</p></section>` : ''}
        <footer class="presupuesto-footer" style="margin-top: auto; padding-top: 10px; border-top: 1px solid #ccc; font-size: 0.8em; text-align: center;">
            <p>Recibí conforme</p>
        </footer>
      </div>
    `;
  };

  const handleImprimirSeleccionados = async () => {
    if (selectedBoletas.size === 0) {
      alert("Por favor, seleccione al menos una boleta para imprimir.");
      return;
    }
    setIsPrinting(true);
    setPrintingMessage("Cargando detalles de boletas...");
    setError(null);

    const idsSeleccionados = Array.from(selectedBoletas);
    const boletasDetalladasAImprimir: BoletaOriginal[] = [];
    const token = localStorage.getItem("token");

    if (!token) {
        setError("No autenticado. No se puede imprimir.");
        setIsPrinting(false);
        setPrintingMessage(null);
        return;
    }
    
    let count = 0;
    for (const ventaId of idsSeleccionados) {
        count++;
        setPrintingMessage(`Cargando detalle ${count} de ${idsSeleccionados.length}... (Boleta #${ventaId})`);
        try {
            const detalleRes = await fetch(`https://quimex.sistemataup.online/ventas/obtener/${ventaId}`, {
                headers: {"content-type":"application/json","Authorization":`Bearer ${token}`}
            });

            if (!detalleRes.ok) {
                const errorData = await detalleRes.json().catch(() => ({ message: `Error ${detalleRes.status}` }));
                console.error(`Error obteniendo detalles para boleta #${ventaId}:`, errorData.message || detalleRes.statusText);
                setError(prev => (prev ? prev + "\n" : "") + `Error detalle boleta #${ventaId}: ${errorData.message || detalleRes.statusText}`);
                continue; 
            }
            const data = await detalleRes.json();
            if (data && data.detalles) {
                data.detalles = Array.isArray(data.detalles) ? data.detalles : [];
                boletasDetalladasAImprimir.push(data as BoletaOriginal);
            } else {
                console.warn(`Respuesta para boleta #${ventaId} sin detalles o estructura inesperada.`);
                setError(prev => (prev ? prev + "\n" : "") + `Respuesta inesperada para boleta #${ventaId}.`);
            }
            // eslint-disable-next-line
        } catch (error: any) {
            console.error("Error en fetch de detalles para boleta:", ventaId, error);
            setError(prev => (prev ? prev + "\n" : "") + `Error de red para boleta #${ventaId}: ${error.message}`);
        }
    }

    if (boletasDetalladasAImprimir.length === 0) {
      setError((prevError) => (prevError ? prevError + "\n" : "") + "No se pudieron obtener los detalles de ninguna boleta seleccionada para imprimir.");
      setIsPrinting(false);
      setPrintingMessage(null);
      return;
    }
    
    setPrintingMessage(`Generando PDF con ${boletasDetalladasAImprimir.length} boleta(s)...`);

    const pdf = new jsPDF('p', 'mm', 'a4');
    const printContainer = document.createElement('div');
    printContainer.style.position = 'fixed';
    printContainer.style.left = '-9999px';
    printContainer.style.width = '210mm';
    document.body.appendChild(printContainer);

    for (let i = 0; i < boletasDetalladasAImprimir.length; i++) {
      const boleta = boletasDetalladasAImprimir[i];
      setPrintingMessage(`Procesando boleta ${i + 1} de ${boletasDetalladasAImprimir.length} para PDF... (ID: ${boleta.venta_id})`);
      printContainer.innerHTML = renderBoletaParaImprimir(boleta);
      const boletaElement = printContainer.querySelector('.presupuesto-container') as HTMLElement;

      if (boletaElement) {
        try {
          const canvas = await html2canvas(boletaElement, { 
            scale: 2.5, 
            useCORS: true,
            logging: false, 
            width: boletaElement.offsetWidth, 
            height: boletaElement.offsetHeight, 
            windowWidth: boletaElement.scrollWidth,
            windowHeight: boletaElement.scrollHeight
          });
          const imgData = canvas.toDataURL('image/png', 0.9); 
          
          if (i > 0) { 
            pdf.addPage();
          }
          const pdfWidth = pdf.internal.pageSize.getWidth() - 20; 
          const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
          const pageHeight = pdf.internal.pageSize.getHeight() - 20; 

          if (pdfHeight > pageHeight) { 
             pdf.addImage(imgData, 'PNG', 10, 10, (canvas.width * pageHeight) / canvas.height , pageHeight);
          } else {
             pdf.addImage(imgData, 'PNG', 10, 10, pdfWidth, pdfHeight);
          }
          // eslint-disable-next-line
        } catch (error: any) {
          console.error("Error al generar canvas para boleta:", boleta.venta_id, error);
          setError(prev => (prev ? prev + "\n" : "") + `Error al procesar boleta #${boleta.venta_id} para PDF: ${error.message}`);
        }
      }
    }
    
    document.body.removeChild(printContainer);
    setPrintingMessage(null);
    
    if (pdf.internal.pages && pdf.internal.pages.length > 1 && boletasDetalladasAImprimir.length > 0) {
      pdf.autoPrint();
      window.open(pdf.output('bloburl'), '_blank');
    } else if (boletasDetalladasAImprimir.length > 0) { 
        setError((prevError) => (prevError ? prevError + "\n" : "") + "No se pudieron generar páginas en el PDF, aunque se procesaron boletas.");
    } else {
        if (!error) {
             setError((prevError) => (prevError ? prevError + "\n" : "") + "No se generaron páginas en el PDF.");
        }
    }

    setIsPrinting(false);
  };
  
  const handleImprimirRemitosSeleccionados = async () => {
    if (selectedBoletas.size === 0) {
      alert("Por favor, seleccione al menos un remito para imprimir.");
      return;
    }
    setIsPrinting(true);
    setPrintingMessage("Cargando detalles de remitos...");
    setError(null);

    const idsSeleccionados = Array.from(selectedBoletas);
    const remitosDetalladosAImprimir: BoletaOriginal[] = [];
    const token = localStorage.getItem("token");

    if (!token) {
        setError("No autenticado. No se puede imprimir.");
        setIsPrinting(false);
        setPrintingMessage(null);
        return;
    }
    
    let count = 0;
    for (const ventaId of idsSeleccionados) {
        count++;
        setPrintingMessage(`Cargando detalle ${count} de ${idsSeleccionados.length}... (Remito #${ventaId})`);
        try {
            const detalleRes = await fetch(`https://quimex.sistemataup.online/ventas/obtener/${ventaId}`, {
                headers: {"content-type":"application/json","Authorization":`Bearer ${token}`}
            });

            if (!detalleRes.ok) {
                const errorData = await detalleRes.json().catch(() => ({ message: `Error ${detalleRes.status}` }));
                console.error(`Error obteniendo detalles para remito #${ventaId}:`, errorData.message || detalleRes.statusText);
                setError(prev => (prev ? prev + "\n" : "") + `Error detalle remito #${ventaId}: ${errorData.message || detalleRes.statusText}`);
                continue; 
            }
            const data = await detalleRes.json();
            if (data && data.detalles) {
                data.detalles = Array.isArray(data.detalles) ? data.detalles : [];
                remitosDetalladosAImprimir.push(data as BoletaOriginal);
            } else {
                console.warn(`Respuesta para remito #${ventaId} sin detalles o estructura inesperada.`);
                setError(prev => (prev ? prev + "\n" : "") + `Respuesta inesperada para remito #${ventaId}.`);
            }
            // eslint-disable-next-line
        } catch (error: any) {
            console.error("Error en fetch de detalles para remito:", ventaId, error);
            setError(prev => (prev ? prev + "\n" : "") + `Error de red para remito #${ventaId}: ${error.message}`);
        }
    }

    if (remitosDetalladosAImprimir.length === 0) {
      setError((prevError) => (prevError ? prevError + "\n" : "") + "No se pudieron obtener los detalles de ningún remito seleccionado para imprimir.");
      setIsPrinting(false);
      setPrintingMessage(null);
      return;
    }
    
    setPrintingMessage(`Generando PDF con ${remitosDetalladosAImprimir.length} remito(s)...`);

    const pdf = new jsPDF('p', 'mm', 'a4');
    const printContainer = document.createElement('div');
    printContainer.style.position = 'fixed';
    printContainer.style.left = '-9999px';
    printContainer.style.width = '210mm';
    document.body.appendChild(printContainer);

    for (let i = 0; i < remitosDetalladosAImprimir.length; i++) {
      const remito = remitosDetalladosAImprimir[i];
      setPrintingMessage(`Procesando remito ${i + 1} de ${remitosDetalladosAImprimir.length} para PDF... (ID: ${remito.venta_id})`);
      printContainer.innerHTML = renderRemitoParaImprimir(remito);
      const remitoElement = printContainer.querySelector('.presupuesto-container') as HTMLElement;

      if (remitoElement) {
        try {
          const canvas = await html2canvas(remitoElement, { 
            scale: 2.5, 
            useCORS: true,
            logging: false, 
            width: remitoElement.offsetWidth, 
            height: remitoElement.offsetHeight, 
            windowWidth: remitoElement.scrollWidth,
            windowHeight: remitoElement.scrollHeight
          });
          const imgData = canvas.toDataURL('image/png', 0.9); 
          
          if (i > 0) { 
            pdf.addPage();
          }
          const pdfWidth = pdf.internal.pageSize.getWidth() - 20; 
          const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
          const pageHeight = pdf.internal.pageSize.getHeight() - 20; 

          if (pdfHeight > pageHeight) { 
             pdf.addImage(imgData, 'PNG', 10, 10, (canvas.width * pageHeight) / canvas.height , pageHeight);
          } else {
             pdf.addImage(imgData, 'PNG', 10, 10, pdfWidth, pdfHeight);
          }
          // eslint-disable-next-line
        } catch (error: any) {
          console.error("Error al generar canvas para remito:", remito.venta_id, error);
          setError(prev => (prev ? prev + "\n" : "") + `Error al procesar remito #${remito.venta_id} para PDF: ${error.message}`);
        }
      }
    }
    
    document.body.removeChild(printContainer);
    setPrintingMessage(null);
    
    if (pdf.internal.pages && pdf.internal.pages.length > 1 && remitosDetalladosAImprimir.length > 0) {
      pdf.autoPrint();
      window.open(pdf.output('bloburl'), '_blank');
    } else if (remitosDetalladosAImprimir.length > 0) { 
        setError((prevError) => (prevError ? prevError + "\n" : "") + "No se pudieron generar páginas en el PDF, aunque se procesaron remitos.");
    } else {
        if (!error) {
             setError((prevError) => (prevError ? prevError + "\n" : "") + "No se generaron páginas en el PDF.");
        }
    }

    setIsPrinting(false);
  };

  return (
    <>
      {idBoleta === undefined ? (
        <div className="flex flex-col items-center justify-center min-h-screen bg-indigo-900 py-10 px-4">
          <div className="bg-white p-6 md:p-8 rounded-lg shadow-md w-full max-w-6xl">
            <BotonVolver className="ml-0" />

            {/* --- SECCIÓN DE CABECERA MODIFICADA --- */}
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <h2 className="text-2xl md:text-3xl font-semibold text-indigo-800 text-center sm:text-left">
                  Pedidos para Entregar
                </h2>

                {/* --- NUEVO: SELECTOR DE FECHA --- */}
                <div className="flex items-center gap-2">
                  <label htmlFor="fecha-entrega" className="font-medium text-gray-700 whitespace-nowrap">Ver fecha:</label>
                  <input
                    type="date"
                    id="fecha-entrega"
                    value={fechaSeleccionada}
                    onChange={handleDateChange} // Asegúrate de tener esta función en tu componente
                    className="border border-gray-300 rounded-md p-2 shadow-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <button
                      onClick={handleImprimirSeleccionados}
                      disabled={selectedBoletas.size === 0 || isPrinting}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 flex items-center justify-center"
                  >
                    {isPrinting && printingMessage?.includes('boleta') && (
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                    {isPrinting && printingMessage?.includes('boleta') ? printingMessage : `Imprimir Boletas (${selectedBoletas.size})`}
                  </button>
                  <button
                      onClick={handleImprimirRemitosSeleccionados}
                      disabled={selectedBoletas.size === 0 || isPrinting}
                      className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 flex items-center justify-center"
                  >
                    {isPrinting && printingMessage?.includes('remito') && (
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                    {isPrinting && printingMessage?.includes('remito') ? printingMessage : `Imprimir Remitos (${selectedBoletas.size})`}
                  </button>
                </div>
            </div>

            {loading && <p className="text-center text-gray-600 my-4">Buscando pedidos para la fecha seleccionada...</p>}
            {error && <pre className="whitespace-pre-wrap text-center text-red-600 my-4 bg-red-100 p-3 rounded-md text-sm">Error: {error}</pre>}


            {!loading && (
              <>
                <div className="overflow-x-auto">
                  <ul className="min-w-full space-y-3">
                    <li className="grid grid-cols-12 gap-3 items-center bg-indigo-100 p-3 rounded-md font-semibold text-indigo-800 text-xs md:text-sm uppercase sticky top-0 z-10">
                      <div className="col-span-1 flex items-center justify-center">
                        <input 
                            type="checkbox"
                            className="form-checkbox h-4 w-4 text-indigo-600 transition duration-150 ease-in-out cursor-pointer"
                            onChange={handleSelectAllOnPage}
                            checked={boletas.length > 0 && boletas.every(b => selectedBoletas.has(b.venta_id))} // Lógica de 'checked' corregida
                            disabled={boletas.length === 0}
                            title="Seleccionar/Deseleccionar todos en esta página"
                        />
                      </div>
                      <span className="col-span-3">Nombre / Razón Social</span>
                      <span className="col-span-2">Monto</span>
                      <span className="col-span-3">Dirección</span>
                      <span className="col-span-2">Fecha Pedido</span>
                      <span className="col-span-1 text-center">Acción</span>
                    </li>

                    {boletas.length > 0 ? (
                        boletas.map((boleta) => (
                            <li key={boleta.venta_id} className="grid grid-cols-12 gap-3 items-center bg-gray-50 hover:bg-gray-100 p-3 rounded-md transition duration-150 ease-in-out">
                            <div className="col-span-1 flex items-center justify-center">
                                <input 
                                    type="checkbox"
                                    className="form-checkbox h-4 w-4 text-indigo-600 transition duration-150 ease-in-out cursor-pointer"
                                    checked={selectedBoletas.has(boleta.venta_id)}
                                    onChange={() => handleCheckboxChange(boleta.venta_id)}
                                />
                            </div>
                            <span className="col-span-3 text-sm truncate" title={boleta.cliente_nombre}>{boleta.cliente_nombre}</span>
                            <span className="col-span-2 text-sm">${boleta.monto_final_con_recargos.toFixed(2)}</span>
                            <span className="col-span-3 text-sm truncate" title={boleta.direccion_entrega}>{boleta.direccion_entrega}</span>
                            <span className="col-span-2 text-sm">{boleta.fecha_pedido_formateada}</span>
                            <div className="col-span-1 flex items-center justify-center gap-2">
                                <button
                                title="Actualizar Pedido"
                                className="text-indigo-600 hover:text-indigo-900 text-lg transition duration-150 ease-in-out"
                                onClick={() => setIdBoleta(boleta.venta_id)}
                                >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                </svg>
                                </button>
                            </div>
                            </li>
                        ))
                    ) : (
                        <li className="text-center text-gray-500 py-8 col-span-12">
                          No se encontraron pedidos con entrega para la fecha seleccionada.
                        </li>
                    )}
                  </ul>
                </div>

                {pagination && pagination.total_pages > 1 && (
                  <div className="flex flex-col sm:flex-row justify-center items-center mt-6 gap-3">
                    <button
                      onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                      disabled={!pagination.has_prev || loading || isPrinting}
                      className="px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out"
                    >
                      Anterior
                    </button>
                    <span className="text-sm text-indigo-700 font-medium">
                      Página {pagination.current_page} de {pagination.total_pages} (Total: {pagination.total_items})
                    </span>
                    <button
                      onClick={() => setPage((prev) => prev + 1)}
                      disabled={!pagination.has_next || loading || isPrinting}
                      className="px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out"
                    >
                      Siguiente
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <FormularioActualizarPedido id={idBoleta}  />
      )}
    </>
  );
}