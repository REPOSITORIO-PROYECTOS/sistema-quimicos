// Ruta: src/types/ventas.d.ts

/**
 * Representa una línea de producto dentro de un formulario de venta en el frontend.
 * Este es el "tipo de trabajo" para los arrays de productos.
 */
export type ProductoVenta = {
  id_detalle?: number;      // El ID del detalle de venta (solo existe al actualizar)
  producto: number;         // El ID del producto (ej: 10)
  qx: number;               // La cantidad del producto en la línea (ej: 0.1)
  precio: number;           // El precio unitario calculado
  descuento: number;        // El descuento en % para esta línea (ej: 10 para un 10%)
  total: number;            // El total de la línea (precio * qx - descuento)
  observacion?: string;    
  observacion_item?: string; // <-- AÑADIR SIGNO DE INTERROGACIÓN
 // Observaciones específicas de esta línea
};

/**
 * Representa los datos del formulario principal de una venta.
 */
export interface FormDataVenta {
  // --- Datos del Cliente ---
  clienteId: number | null;
  nombre: string;
  cuit: string;
  localidad: string;
  direccion: string;
  // --- Vendedor (para pedidos, seleccionable; en puerta ya existe otra gestión) ---
  vendedor?: string;
  
  // --- Datos del Pedido ---
  fechaEmision: string;
  fechaEntrega: string;
  observaciones?: string;

  // --- Datos de Pago ---
  formaPago: 'efectivo' | 'transferencia' | 'factura';
  montoPagado: number;
  descuentoTotal: number;
  vuelto: number;
  requiereFactura: boolean;
}

/**
 * Representa el objeto de datos que se usa para generar un Ticket o Comprobante.
 * Es una versión simplificada de todos los datos de la venta.
 */
export interface VentaDataParaTicket {
  venta_id?: number;
  fecha_emision: string;
  cliente: {
    nombre: string;
    direccion?: string;
    localidad?: string;
  };
  nombre_vendedor: string;
  items: Array<{
    producto_id: number;
    producto_nombre: string;
    cantidad: number;
    precio_total_item_ars: number;
    descuento_item_porcentaje?: number;
    subtotal_bruto_item_ars?: number;
    observacion_item?: string;
  }>;
  total_final: number;
  observaciones?: string;
  forma_pago?: string;
  monto_pagado_cliente?: number;
  vuelto_calculado?: number;
  descuento_total_global_porcentaje?: number;
  total_bruto_sin_descuento?: number;
}