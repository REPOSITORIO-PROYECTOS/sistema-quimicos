// Ruta: src/components/Ticket.tsx

import React from 'react';
import Image from 'next/image'; // La importación es correcta y ahora SÍ se usa

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
  };
  vendedor: string;
  items: ProductoVenta[];
  total_final: number;
  observaciones?: string;
}

interface TicketProps {
  // El 'tipo' determina si es para el cliente o para uso interno
  tipo: 'comprobante' | 'orden_de_trabajo';
  ventaData: VentaData;
}


// --- El Componente de Ticket: Réplica del diseño original ---
const Ticket: React.FC<TicketProps> = ({ tipo, ventaData }) => {

    const formatPrice = (value: number): string => {
        if (value % 1 === 0) return value.toString();
        return value.toFixed(2);
    };

    // Determina si se debe mostrar información financiera
    const isFinancial = tipo === 'comprobante';

    return (
        <>
            <div className="presupuesto-container">
                <header className="presupuesto-header">
                    <div className="logo-container">
                        {/* CAMBIO CRÍTICO: Se reemplaza <img> por <Image /> */}
                        <Image 
                          src="/logo.png" 
                          alt="Quimex"  
                          className="logo"
                          width={80}  // Atributo obligatorio
                          height={40} // Atributo obligatorio
                        />
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
                            <tr><td>PEDIDO</td><td>{ventaData.venta_id || 'NUEVO'}</td></tr>
                            <tr><td>FECHA</td><td>{ventaData.fecha_emision ? new Date(ventaData.fecha_emision).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}</td></tr>
                            {ventaData.cliente.direccion && ventaData.cliente.direccion.trim() !== '' && (
                            <tr><td>DIRECCIÓN</td><td>{ventaData.cliente.direccion.toUpperCase()}</td></tr>
                            )}
                            <tr><td>CLIENTE</td><td>{ventaData.cliente.nombre.toUpperCase()}</td></tr>
                            <tr><td>VENDEDOR</td><td>{ventaData.vendedor ? ventaData.vendedor.charAt(0).toUpperCase() + ventaData.vendedor.slice(1) : '-'}</td></tr>
                            {isFinancial && (
                                <tr><td>TOTAL FINAL</td><td className="font-bold">$ {formatPrice(ventaData.total_final)}</td></tr>
                            )}
                        </tbody>
                    </table>
                </section>

                <section className="detalle-productos">
                    <table className="tabla-items">
                        <thead>
                            {isFinancial ? (
                                <tr><th>ITEM</th><th>PRODUCTO</th><th>CANTIDAD</th><th>SUBTOTAL</th></tr>
                            ) : (
                                <tr><th>ITEM</th><th>PRODUCTO</th><th>CANTIDAD</th></tr>
                            )}
                        </thead>
                        <tbody>
                            {ventaData.items.map((item, index) => (
                                <tr key={`item-${item.producto_id}-${index}`}>
                                    <td>{index + 1}</td>
                                    <td>{item.producto_nombre.replaceAll(',', '')}</td>
                                    <td className="text-center">{item.cantidad}</td>
                                    {isFinancial && (
                                        <td className="text-right">$ {formatPrice(item.precio_total_item_ars)}</td>
                                    )}
                                </tr>
                            ))}
                            {/* Relleno con filas vacías para una altura consistente */}
                            {Array.from({ length: Math.max(0, 12 - ventaData.items.length) }).map((_, i) =>
                                isFinancial ? (
                                    <tr key={`empty-${i}`} className="empty-row"><td>&nbsp;</td><td></td><td></td><td></td></tr>
                                ) : (
                                    <tr key={`empty-${i}`} className="empty-row"><td>&nbsp;</td><td></td><td></td></tr>
                                )
                            )}
                        </tbody>
                    </table>
                </section>
                
                {ventaData.observaciones && (
                    <section className="ticket-observaciones-importante">
                        <p><strong>Observaciones:</strong></p>
                        <p>{ventaData.observaciones}</p>
                    </section>
                )}

                <footer className="ticket-footer-original">
                     <p>{tipo === 'orden_de_trabajo' ? 'Verificar mercadería al recibir' : '¡Gracias por su compra!'}</p>
                </footer>
            </div>

            {/* --- ESTILOS CSS CON SECCIÓN DE OBSERVACIONES MEJORADA --- */}
            <style jsx global>{`
                @page {
                    margin-top: 4mm;
                    margin-bottom: 4mm;
                    margin-right: 4mm;
                    margin-left: 10mm; 
                }

                .presupuesto-container {
                    width: 100%;
                    font-family: 'Courier New', Courier, monospace;
                    font-size: 11px;
                    color: #000;
                }
                .presupuesto-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    border-bottom: 1px dashed #000;
                    padding-bottom: 5px;
                    margin-bottom: 5px;
                }
                .logo-container { text-align: left; }
                .logo { width: 80px; margin-bottom: 4px; height: auto; } /* 'height: auto' es buena práctica con Image */
                .sub-logo-text { font-size: 9px; font-weight: bold; margin: 0; }
                .info-empresa {                     
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                    font-size: 10px;
                }
                .info-empresa p { margin: 0; line-height: 1.2; }

                .datos-pedido { margin-bottom: 5px; }
                .tabla-datos-principales { width: 100%; border-collapse: collapse; }
                .tabla-datos-principales td { padding: 1px 2px; vertical-align: top;}
                .tabla-datos-principales td:first-child { font-weight: bold; }
                
                .detalle-productos { border-top: 1px dashed #000; padding-top: 5px; }
                .tabla-items { width: 100%; border-collapse: collapse; font-size: 10px; }
                .tabla-items th {
                    border-bottom: 1px solid #000;
                    text-align: left;
                    padding: 2px;
                }
                .tabla-items th:nth-child(3), .tabla-items td:nth-child(3) { text-align: center; }
                .tabla-items th:nth-child(4), .tabla-items td:nth-child(4) { text-align: right; }
                .tabla-items td { padding: 1px 2px; vertical-align: top; }
                .empty-row td { 
                    height: 14px; 
                    border-bottom: 1px dotted #ccc;
                }
                 .tabla-items tr:last-of-type td {
                     border-bottom: none;
                }

                .ticket-observaciones-importante {
                    margin-top: 10px;
                    padding: 8px;
                    border: 1px dotted #000;
                    font-size: 11px;
                }
                .ticket-observaciones-importante p {
                    margin: 0 0 4px 0;
                }
                .ticket-observaciones-importante p:last-child {
                    margin-bottom: 0;
                }

                .ticket-footer-original {
                    text-align: center;
                    border-top: 1px dashed #000;
                    margin-top: 8px;
                    padding-top: 5px;
                    font-weight: bold;
                }
                .font-bold { font-weight: bold; }
                .text-center { text-align: center; }
                .text-right { text-align: right; }
            `}</style>
        </>
    );
};

export default Ticket;