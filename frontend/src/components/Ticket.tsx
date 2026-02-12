// Ruta: src/components/Ticket.tsx
"use client";

import React from 'react';
import Image from 'next/image';

// --- Definiciones de Tipos de Datos ---
type ProductoVenta = {
    producto_id: number;
    observacion_item?: string;
    producto_nombre: string;
    cantidad: number;
    precio_total_item_ars: number;
    descuento_item_porcentaje?: number; // opcional, para mostrar en ticket
    subtotal_bruto_item_ars?: number; // opcional, para mostrar el subtotal antes de descuento
};

export interface VentaData {
  venta_id?: number;
  fecha_emision: string;
  cliente: {
    nombre: string;
    direccion?: string;
    localidad?: string; // Asegúrate de que este campo se pase desde el componente padre
  };
  nombre_vendedor: string;
  items: ProductoVenta[];
    total_final: number;
    observaciones?: string;
    forma_pago?: string;
    monto_pagado_cliente?: number;
    vuelto_calculado?: number;
    descuento_total_global_porcentaje?: number;
}

interface TicketProps {
  tipo: 'comprobante' | 'orden_de_trabajo';
  ventaData: VentaData;
}


// --- El Componente de Ticket (Versión Final Refinada) ---
const Ticket: React.FC<TicketProps> = ({ tipo, ventaData }) => {

    const formatPrice = (value: number): string => {
        return new Intl.NumberFormat('es-AR', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        }).format(value);
    };

    // Calcular el descuento global en plata basado en la suma de los items
    const sumaTotalesItems = ventaData.items.reduce((sum, item) => sum + item.precio_total_item_ars, 0);
    const descuentoGlobalPorc = ventaData.descuento_total_global_porcentaje || 0;
    const descuentoGlobalEnPlata = descuentoGlobalPorc > 0 ? sumaTotalesItems * (descuentoGlobalPorc / 100) : 0;

    if (descuentoGlobalPorc > 0) {
      console.log('✓ TICKET RECIBIÓ DESCUENTO:', descuentoGlobalPorc, '% / $', descuentoGlobalEnPlata);
    }

    const isFinancial = tipo === 'comprobante';

    return (
        // El div contenedor ahora se llama #presupuesto-imprimible para coincidir con globals.css
        <div id="presupuesto-imprimible"> 
            
            {/* El header ahora usa la clase .presupuesto-header para coincidir con globals.css */}
            <header className="presupuesto-header">
                <div className="logo-container">
                    {/* Ajusta width/height si es necesario, pero el CSS controlará el tamaño final */}
                    <Image src="/logo.png" alt="Quimex" className="logo" width={150} height={50} priority />
                </div>
                <div className="info-empresa">
                    <p>{isFinancial ? "COMPROBANTE NO VALIDO COMO FACTURA" : "ORDEN DE TRABAJO"}</p>
                    <p>Tel: 11 2395 1494 / 4261 3605</p>
                    <p>Instagram: quimex_berazategui</p>
                </div>
            </header>

            <section className="datos-pedido">
                <table className="tabla-datos-principales">
                    <tbody>
                        <tr><td>PEDIDO:</td><td>{ventaData.venta_id || 'NUEVO'}</td></tr>
                        <tr><td>FECHA:</td><td>{ventaData.fecha_emision ? new Date(ventaData.fecha_emision).toLocaleDateString('es-AR') : ''}</td></tr>
                        <tr><td>CLIENTE:</td><td>{ventaData.cliente.nombre.toUpperCase()}</td></tr>
                        
                        {isFinancial && ventaData.cliente.direccion && (
                            <tr><td>DIRECCIÓN:</td><td>{ventaData.cliente.direccion.toUpperCase()}</td></tr>
                        )}
                        {isFinancial && ventaData.cliente.localidad && (
                            <tr><td>LOCALIDAD:</td><td>{ventaData.cliente.localidad.toUpperCase()}</td></tr>
                        )}

                        {!(isFinancial && ventaData.nombre_vendedor === 'pedidos') && (
                            <tr><td>VENDEDOR:</td><td>{ventaData.nombre_vendedor ? ventaData.nombre_vendedor.charAt(0).toUpperCase() + ventaData.nombre_vendedor.slice(1) : '-'}</td></tr>
                        )}
                    </tbody>
                </table>
            </section>

            <section className="detalle-productos">
                <table className="tabla-items">
                    <thead>
                        <tr>
                            <th className="col-cantidad">CANT</th>
                            <th className="col-producto">PRODUCTO</th>
                            {isFinancial && <th className="col-subtotal">SUBTOTAL</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {ventaData.items.map((item, index) => {
                            // Usar solo los valores del backend
                            const descuentoPorc = item.descuento_item_porcentaje || 0;
                            const subtotalBruto = item.subtotal_bruto_item_ars !== undefined
                                ? item.subtotal_bruto_item_ars
                                : item.precio_total_item_ars;
                            const descuentoEnPlata = item.subtotal_bruto_item_ars !== undefined && descuentoPorc > 0
                                ? subtotalBruto - item.precio_total_item_ars
                                : 0;
                            return (
                                <React.Fragment key={`item-fragment-${item.producto_id}-${index}`}>
                                    <tr className="product-row">
                                        <td className="col-cantidad">{item.cantidad}</td>
                                        <td className="col-producto">{item.producto_nombre}</td>
                                        {isFinancial && (
                                            <td className="col-subtotal">$ {formatPrice(item.precio_total_item_ars)}</td>
                                        )}
                                    </tr>
                                    {/* Mostrar descuento por ítem si existe y viene el subtotal bruto */}
                                    {isFinancial && descuentoPorc > 0 && item.subtotal_bruto_item_ars !== undefined && (
                                        <tr className="discount-row">
                                            <td></td>
                                            <td colSpan={1} className="col-descuento text-xs text-red-700">
                                                Desc. {descuentoPorc}%
                                            </td>
                                            <td className="col-descuento text-xs text-red-700">
                                                -$ {formatPrice(descuentoEnPlata)}
                                            </td>
                                        </tr>
                                    )}
                                    {item.observacion_item && (
                                        <tr className="observation-row">
                                            <td></td>
                                            <td colSpan={isFinancial ? 2 : 1} className="col-observacion">
                                                ↳ {item.observacion_item}
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </section>
            
            {/* Tabla de totales, separada para un mejor estilo y claridad */}
            {isFinancial && (
                <section className="datos-totales">
                    <table className="tabla-datos-secundarios">
                        <tbody>
                            {/* Mostrar descuento global si existe */}
                            {descuentoGlobalPorc > 0 && (
                                <tr>
                                    <td>Descuento {descuentoGlobalPorc}%:</td>
                                    <td className="text-red-700">-$ {formatPrice(descuentoGlobalEnPlata)}</td>
                                </tr>
                            )}
                            <tr className="total-row">
                                <td>TOTAL:</td>
                                <td>$ {formatPrice(ventaData.total_final)}</td>
                            </tr>
                            {ventaData.forma_pago && (
                            <tr>
                                <td>FORMA PAGO:</td>
                                <td>{ventaData.forma_pago.charAt(0).toUpperCase() + ventaData.forma_pago.slice(1)}</td>
                            </tr>
                            )}
                            {(ventaData.monto_pagado_cliente ?? 0) > 0 && (
                                <tr>
                                    <td>PAGÓ CON:</td>
                                    <td>$ {formatPrice(ventaData.monto_pagado_cliente!)}</td>
                                </tr>
                            )}
                            {(ventaData.vuelto_calculado ?? 0) > 0 && (
                                <tr>
                                    <td>SU VUELTO:</td>
                                    <td>$ {formatPrice(ventaData.vuelto_calculado!)}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </section>
            )}

            {ventaData.observaciones && (
                <section className="ticket-observaciones">
                    <p><strong>Observaciones:</strong> {ventaData.observaciones}</p>
                </section>
            )}

            <footer className="ticket-footer">
                 <p>{tipo === 'orden_de_trabajo' ? 'Verificar mercadería al recibir' : '¡Gracias por su compra!'}</p>
            </footer>
        </div>
        
        // --- ELIMINADO ---
        // Todo el bloque <style jsx global>{`...`}</style> ha sido removido.
        // La estilización ahora es controlada 100% por globals.css
    );
};

export default Ticket;