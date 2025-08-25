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
        // Formatea el precio. Si es un número entero, no le añade decimales.
        return new Intl.NumberFormat('es-AR', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        }).format(value);
    };

    const isFinancial = tipo === 'comprobante';
    const numeroDeItemsParaRelleno = 30; // Aumentado el número de filas para productos

    return (
        <>
            <div className="ticket-container">
                <header className="ticket-header">
                    <div className="logo-container">
                        <Image src="/logo.png" alt="Quimex" className="logo" width={70} height={35} priority />
                        <p className="sub-logo-text">
                            {isFinancial ? "COMPROBANTE NO VALIDO COMO FACTURA" : "ORDEN DE TRABAJO"}
                        </p>
                    </div>
                    <div className="info-empresa">
                        <p>📱 11 2395 1494</p>
                        <p>📞 4261 3605</p>
                        <p>📸 quimex_berazategui</p>
                    </div>
                </header>

                <section className="datos-pedido">
                    <table className="tabla-datos-principales">
                        <tbody>
                            <tr><td>PEDIDO:</td><td>{ventaData.venta_id || 'NUEVO'}</td></tr>
                            <tr><td>FECHA:</td><td>{ventaData.fecha_emision ? new Date(ventaData.fecha_emision).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}</td></tr>
                            <tr><td>CLIENTE:</td><td>{ventaData.cliente.nombre.toUpperCase()}</td></tr>
                            
                            {/* --- Lógica Condicional de Contenido --- */}
                            
                            {/* Dirección y Zona solo en el comprobante del cliente */}
                            {isFinancial && ventaData.cliente.direccion && (
                                <tr><td>DIRECCIÓN:</td><td>{ventaData.cliente.direccion.toUpperCase()}</td></tr>
                            )}
                            {isFinancial && ventaData.cliente.localidad && (
                                <tr><td>ZONA:</td><td>{ventaData.cliente.localidad.toUpperCase()}</td></tr>
                            )}

                            {/* Vendedor solo en la Orden de Trabajo interna */}
                            {!isFinancial && (
                                <tr><td>VENDEDOR:</td><td>{ventaData.nombre_vendedor ? ventaData.nombre_vendedor.charAt(0).toUpperCase() + ventaData.nombre_vendedor.slice(1) : '-'}</td></tr>
                            )}
                            
                            {/* Información Financiera solo en el comprobante */}
                            {isFinancial && (
                                <>
                                    <tr><td>TOTAL:</td><td className="font-bold">$ {formatPrice(ventaData.total_final)}</td></tr>
                                    {(ventaData.monto_pagado_cliente ?? 0) > 0 && (
                                        <tr><td>PAGÓ CON:</td><td className="font-bold">$ {formatPrice(ventaData.monto_pagado_cliente!)}</td></tr>
                                    )}
                                    {(ventaData.vuelto_calculado ?? 0) > 0 && (
                                        <tr><td>SU VUELTO:</td><td className="font-bold">$ {formatPrice(ventaData.vuelto_calculado!)}</td></tr>
                                    )}
                                </>
                            )}
                        </tbody>
                    </table>
                </section>

                <section className="detalle-productos">
                    <table className="tabla-items">
                        <thead>
                            {isFinancial ? (
                                <tr><th>CANT</th><th>PRODUCTO</th><th>SUBTOTAL</th></tr>
                            ) : (
                                <tr><th>CANT</th><th>PRODUCTO</th></tr>
                            )}
                        </thead>
                        <tbody>
                            {ventaData.items.map((item, index) => (
                                <tr key={`item-${item.producto_id}-${index}`}>
                                    <td className="text-center">{item.cantidad}</td>
                                    <td>{item.producto_nombre.replaceAll(',', '')}</td>
                                    {isFinancial && (
                                        <td className="text-right">$ {formatPrice(item.precio_total_item_ars)}</td>
                                    )}
                                </tr>
                            ))}
                            {/* Relleno con filas vacías para una altura consistente */}
                            {Array.from({ length: Math.max(0, numeroDeItemsParaRelleno - ventaData.items.length) }).map((_, i) =>
                                <tr key={`empty-${i}`} className="empty-row">
                                    <td>&nbsp;</td>
                                    <td></td>
                                    {isFinancial && <td></td>}
                                </tr>
                            )}
                        </tbody>
                    </table>
                </section>
                
                {/* Las observaciones ahora se muestran en AMBOS tipos de ticket */}
                {ventaData.observaciones && (
                    <section className="ticket-observaciones">
                        <p><strong>Observaciones:</strong> {ventaData.observaciones}</p>
                    </section>
                )}

                <footer className="ticket-footer">
                     <p>{tipo === 'orden_de_trabajo' ? 'Verificar mercadería al recibir' : '¡Gracias por su compra!'}</p>
                </footer>
            </div>

            {/* --- ESTILOS CSS REFINADOS Y COMPACTOS --- */}
            <style jsx global>{`
                @page {
                    size: A4;
                    margin: 5mm;
                }
                body {
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                .ticket-container {
                    width: 100%;
                    font-family: 'Arial', sans-serif;
                    font-size: 9pt; /* Letra más pequeña como base */
                    color: #000;
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                }
                .ticket-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    border-bottom: 1px dashed #000;
                    padding-bottom: 4px;
                    margin-bottom: 4px;
                }
                .logo-container { text-align: left; }
                .logo { width: 70px; height: auto; }
                .sub-logo-text { font-size: 8pt; font-weight: bold; margin: 0; }
                .info-empresa { display: flex; flex-direction: column; align-items: flex-end; font-size: 8pt; }
                .info-empresa p { margin: 0; line-height: 1.2; }

                .datos-pedido { margin-bottom: 4px; }
                .tabla-datos-principales { width: 100%; border-collapse: collapse; }
                .tabla-datos-principales td { padding: 1px 2px; vertical-align: top; line-height: 1.2; }
                .tabla-datos-principales td:first-child { font-weight: bold; padding-right: 5px; }
                
                .detalle-productos { border-top: 1px dashed #000; padding-top: 4px; }
                .tabla-items { width: 100%; border-collapse: collapse; font-size: 9pt; }
                .tabla-items th {
                    border-bottom: 1px solid #000;
                    text-align: left;
                    padding: 2px;
                    font-size: 8pt;
                }
                .tabla-items th:first-child, .tabla-items td:first-child { text-align: center; width: 12%; } /* Cantidad */
                .tabla-items th:last-child, .tabla-items td:last-child { text-align: right; width: 23%; }  /* Subtotal */
                .tabla-items td { padding: 1.5px 2px; vertical-align: top; line-height: 1.3; }
                .empty-row td { height: 1.4em; border-bottom: 1px dotted #ccc; }
                .tabla-items tr:last-of-type .empty-row td { border-bottom: none; }

                .ticket-observaciones {
                    margin-top: 5px;
                    padding: 5px;
                    border: 1px dotted #000;
                    font-size: 8.5pt;
                }
                .ticket-observaciones p { margin: 0; }

                .ticket-footer {
                    text-align: center;
                    border-top: 1px dashed #000;
                    margin-top: auto; /* Empuja el footer hacia abajo */
                    padding-top: 4px;
                    font-weight: bold;
                    font-size: 8pt;
                }
                .font-bold { font-weight: bold; }
                .text-center { text-align: center; }
                .text-right { text-align: right; }
            `}</style>
        </>
    );
};

export default Ticket;