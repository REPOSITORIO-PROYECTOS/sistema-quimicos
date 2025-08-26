// Ruta: src/components/Ticket.tsx
"use client";

import React from 'react';
import Image from 'next/image';

// --- Definiciones de Tipos de Datos ---
type ProductoVenta = {
  producto_id: number;
  producto_nombre: string;
  cantidad: number;
  precio_total_item_ars: number;
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

    const isFinancial = tipo === 'comprobante';

    // ELIMINADO: La constante 'numeroDeItemsParaRelleno' ya no es necesaria.

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
                        {ventaData.items.map((item, index) => (
                            <tr key={`item-${item.producto_id}-${index}`}>
                                <td className="col-cantidad">{item.cantidad}</td>
                                <td className="col-producto">{item.producto_nombre}</td>
                                {isFinancial ? (
                                    <td className="col-subtotal">$ {formatPrice(item.precio_total_item_ars)}</td>
                                ) : null}
                            </tr>
                        ))}
                        
                        {/* ELIMINADO: La lógica de relleno de filas ha sido removida. */}
                        
                    </tbody>
                </table>
            </section>
            
            {/* Tabla de totales, separada para un mejor estilo y claridad */}
            {isFinancial && (
                <section className="datos-totales">
                    <table className="tabla-datos-secundarios">
                        <tbody>
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