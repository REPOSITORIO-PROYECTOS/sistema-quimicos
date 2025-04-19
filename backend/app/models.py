# app/models.py

# --- Imports ---
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import event, CheckConstraint, ForeignKey
from sqlalchemy.orm import validates, relationship
from datetime import datetime, timezone
from decimal import Decimal

# Importa la instancia 'db' creada en app/__init__.py
from . import db

# --- Modelo Usuario Interno ---
class UsuarioInterno(db.Model):
    __tablename__ = 'usuarios_internos'
    # ... (Pega aquí las columnas y relaciones de UsuarioInterno) ...
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), nullable=False)
    apellido = db.Column(db.String(100), nullable=False)
    nombre_usuario = db.Column(db.String(50), unique=True, nullable=False)
    contrasena = db.Column(db.String(200), nullable=False) # Guardar HASH
    email = db.Column(db.String(100), unique=True, nullable=False)
    rol = db.Column(db.String(50), nullable=False) # admin, almacen, ventas, etc.
    ventas = db.relationship('Venta', back_populates='usuario_interno', lazy='dynamic')
    ordenes_compra_solicitadas = db.relationship('OrdenCompra', foreign_keys='OrdenCompra.solicitado_por_id', back_populates='solicitante', lazy='dynamic')
    ordenes_compra_aprobadas = db.relationship('OrdenCompra', foreign_keys='OrdenCompra.aprobado_por_id', back_populates='aprobador', lazy='dynamic')
    # ordenes_compra_recibidas = db.relationship('OrdenCompra', foreign_keys='OrdenCompra.recibido_por_id', back_populates='receptor', lazy='dynamic')

# --- Modelo Proveedor ---
class Proveedor(db.Model):
     __tablename__ = 'proveedores'
     # ... (Pega aquí las columnas y relaciones de Proveedor) ...
     id = db.Column(db.Integer, primary_key=True)
     nombre = db.Column(db.String(200), nullable=False, unique=True)
     cuit = db.Column(db.String(20), unique=True, nullable=True)
     direccion = db.Column(db.String(255), nullable=True)
     telefono = db.Column(db.String(50), nullable=True)
     email = db.Column(db.String(100), nullable=True)
     contacto = db.Column(db.String(100), nullable=True)
     condiciones_pago = db.Column(db.String(255), nullable=True)
     ordenes_compra = db.relationship('OrdenCompra', back_populates='proveedor', lazy='dynamic')

# --- Modelo Producto ---
class Producto(db.Model):
    __tablename__ = 'productos'
    # __table_args__ = {'extend_existing': True} # <-- Añadir si el error se mueve aquí
    id = db.Column(db.Integer, primary_key=True)
    # ... (Pega aquí el resto de columnas y relaciones de Producto) ...
    codigo_interno = db.Column(db.String(50), unique=True, nullable=False, index=True)
    nombre = db.Column(db.String(200), nullable=False)
    unidad_venta = db.Column(db.String(50), nullable=True)
    tipo_calculo = db.Column(db.String(2), nullable=True)
    ref_calculo = db.Column(db.String(50), nullable=True)
    margen = db.Column(db.Numeric(10, 4), default=Decimal('0.0'))
    costo_referencia_usd = db.Column(db.Numeric(15, 4), nullable=True)
    es_receta = db.Column(db.Boolean, default=False, nullable=False, index=True)
    ajusta_por_tc = db.Column(db.Boolean, default=False, nullable=False, index=True)
    fecha_actualizacion_costo = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    receta = db.relationship("Receta", back_populates="producto_final", uselist=False, cascade="all, delete-orphan")
    usado_en_recetas = db.relationship("RecetaItem", back_populates="ingrediente", lazy='dynamic')
    detalles_venta = db.relationship("DetalleVenta", back_populates="producto", lazy='dynamic')
    detalles_orden_compra = db.relationship("DetalleOrdenCompra", back_populates="producto", lazy='dynamic')

    @validates('margen')
    def validate_margen(self, key, margen_value):
        if margen_value is not None:
            if not isinstance(margen_value, Decimal):
                margen_value = Decimal(margen_value)
            if margen_value < 0 or margen_value >= 1:
                raise ValueError("El margen debe estar entre 0 (inclusive) y 1 (exclusive).")
        return margen_value

# --- Modelo Receta ---
class Receta(db.Model):
    __tablename__ = 'recetas'
    # __table_args__ = {'extend_existing': True} # <-- Añadir si el error se mueve aquí
    id = db.Column(db.Integer, primary_key=True)
    # ... (Pega aquí el resto de columnas y relaciones de Receta) ...
    producto_final_id = db.Column(db.Integer, db.ForeignKey('productos.id', ondelete='CASCADE'), unique=True, nullable=False)
    producto_final = db.relationship("Producto", back_populates="receta")
    items = db.relationship("RecetaItem", back_populates="receta", cascade="all, delete-orphan", lazy='dynamic')
    fecha_creacion = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    fecha_modificacion = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    def verificar_porcentajes(self):
        total_porcentaje = sum(item.porcentaje for item in self.items.all() if item.porcentaje is not None)
        return abs(total_porcentaje - Decimal(100)) < Decimal('0.001')

# --- Modelo RecetaItem ---
class RecetaItem(db.Model):
    __tablename__ = 'receta_items'
    # __table_args__ = {'extend_existing': True} # <-- Añadir si el error se mueve aquí
    id = db.Column(db.Integer, primary_key=True)
    # ... (Pega aquí el resto de columnas y relaciones de RecetaItem) ...
    receta_id = db.Column(db.Integer, db.ForeignKey('recetas.id', ondelete='CASCADE'), nullable=False)
    ingrediente_id = db.Column(db.Integer, db.ForeignKey('productos.id', ondelete='RESTRICT'), nullable=False)
    porcentaje = db.Column(db.Numeric(10, 4), nullable=False)
    receta = db.relationship("Receta", back_populates="items")
    ingrediente = db.relationship("Producto", back_populates="usado_en_recetas")

    @validates('porcentaje')
    def validate_porcentaje(self, key, porcentaje_value):
        if not isinstance(porcentaje_value, Decimal):
             porcentaje_value = Decimal(porcentaje_value)
        if porcentaje_value <= 0 or porcentaje_value > 100:
             raise ValueError("El porcentaje debe ser mayor que 0 y menor o igual a 100.")
        return porcentaje_value


# --- Modelo TipoCambio ---
class TipoCambio(db.Model):
    __tablename__ = 'tipos_cambio'
    # --- Combine __table_args__ si también tienes CheckConstraint ---
    __table_args__ = (CheckConstraint('valor > 0', name='ck_tipocambio_valor_positivo'), {'extend_existing': True})
    # -------------------------------------------------------------
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(50), unique=True, nullable=False, index=True)
    valor = db.Column(db.Numeric(15, 4), nullable=False)
    fecha_actualizacion = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

# --- Modelo Venta ---
class Venta(db.Model):
    __tablename__ = 'ventas'
    # --- ¡¡AÑADIDO AQUÍ PARA SOLUCIONAR!! ---
    __table_args__ = {'extend_existing': True}
    # ---------------------------------------
    id = db.Column(db.Integer, primary_key=True)
    usuario_interno_id = db.Column(db.Integer, db.ForeignKey('usuarios_internos.id'), nullable=False)
    cliente_id = db.Column(db.Integer, nullable=True)
    fecha_registro = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    fecha_pedido = db.Column(db.DateTime, nullable=True)
    direccion_entrega = db.Column(db.String(255), nullable=True)
    cuit_cliente = db.Column(db.String(20), nullable=True)
    observaciones = db.Column(db.Text, nullable=True)
    monto_total = db.Column(db.Numeric(15, 2), nullable=True) # Monto base
    forma_pago = db.Column(db.String(50), nullable=True)
    requiere_factura = db.Column(db.Boolean, default=False, nullable=True)
    recargo_transferencia = db.Column(db.Numeric(10, 2), nullable=True)
    recargo_factura = db.Column(db.Numeric(10, 2), nullable=True)
    monto_final_con_recargos = db.Column(db.Numeric(15, 2), nullable=True)
    monto_pagado_cliente = db.Column(db.Numeric(15, 2), nullable=True)
    vuelto_calculado = db.Column(db.Numeric(15, 2), nullable=True)
    usuario_interno = db.relationship('UsuarioInterno', back_populates='ventas')
    detalles = db.relationship('DetalleVenta', back_populates='venta', cascade="all, delete-orphan", lazy='dynamic')

# --- Modelo DetalleVenta ---
class DetalleVenta(db.Model):
    __tablename__ = 'detalles_venta'
    # __table_args__ = {'extend_existing': True} # <-- Añadir si el error se mueve aquí
    id = db.Column(db.Integer, primary_key=True)
    # ... (Pega aquí el resto de columnas y relaciones de DetalleVenta) ...
    venta_id = db.Column(db.Integer, db.ForeignKey('ventas.id', ondelete='CASCADE'), nullable=False)
    producto_id = db.Column(db.Integer, db.ForeignKey('productos.id', ondelete='RESTRICT'), nullable=False)
    cantidad = db.Column(db.Numeric(15, 4), nullable=False)
    margen_aplicado = db.Column(db.Numeric(10, 4), nullable=True)
    costo_unitario_momento_ars = db.Column(db.Numeric(15, 4), nullable=True)
    coeficiente_usado = db.Column(db.Numeric(10, 4), nullable=True)
    precio_unitario_venta_ars = db.Column(db.Numeric(15, 4), nullable=False)
    precio_total_item_ars = db.Column(db.Numeric(15, 2), nullable=False)
    venta = db.relationship('Venta', back_populates='detalles')
    producto = db.relationship('Producto', back_populates='detalles_venta')


# --- Modelo OrdenCompra ---
class OrdenCompra(db.Model):
    __tablename__ = 'ordenes_compra'
    # __table_args__ = {'extend_existing': True} # <-- Añadir si el error se mueve aquí
    id = db.Column(db.Integer, primary_key=True)
    # ... (Pega aquí el resto de columnas y relaciones de OrdenCompra) ...
    nro_solicitud_interno = db.Column(db.String(50), unique=True, nullable=True)
    nro_remito_proveedor = db.Column(db.String(100), index=True, nullable=True)
    proveedor_id = db.Column(db.Integer, db.ForeignKey('proveedores.id'), nullable=False)
    moneda = db.Column(db.String(3), nullable=True)
    importe_total_estimado = db.Column(db.Numeric(15,2), nullable=True)
    observaciones_solicitud = db.Column(db.Text, nullable=True)
    estado = db.Column(db.String(50), default='Solicitado', nullable=False, index=True)
    solicitado_por_id = db.Column(db.Integer, db.ForeignKey('usuarios_internos.id'), nullable=True)
    aprobado_por_id = db.Column(db.Integer, db.ForeignKey('usuarios_internos.id'), nullable=True)
    recibido_por_id = db.Column(db.Integer, db.ForeignKey('usuarios_internos.id'), nullable=True)
    fecha_creacion = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    fecha_actualizacion = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    fecha_aprobacion = db.Column(db.DateTime, nullable=True)
    fecha_rechazo = db.Column(db.DateTime, nullable=True)
    motivo_rechazo = db.Column(db.Text, nullable=True)
    fecha_recepcion = db.Column(db.DateTime, nullable=True)
    estado_recepcion = db.Column(db.String(50), nullable=True)
    notas_recepcion = db.Column(db.Text, nullable=True)
    ajuste_tc = db.Column(db.Boolean, nullable=True)
    importe_cc = db.Column(db.Numeric(15,2), nullable=True)
    dif_ajuste_cambio = db.Column(db.Numeric(15,2), nullable=True)
    importe_abonado = db.Column(db.Numeric(15,2), nullable=True)
    forma_pago = db.Column(db.String(50), nullable=True)
    cheque_perteneciente_a = db.Column(db.String(200), nullable=True)
    proveedor = db.relationship('Proveedor', back_populates='ordenes_compra')
    items = db.relationship('DetalleOrdenCompra', back_populates='orden', cascade='all, delete-orphan', lazy='select')
    solicitante = db.relationship('UsuarioInterno', foreign_keys=[solicitado_por_id], back_populates='ordenes_compra_solicitadas')
    aprobador = db.relationship('UsuarioInterno', foreign_keys=[aprobado_por_id], back_populates='ordenes_compra_aprobadas')
    # receptor = db.relationship('UsuarioInterno', foreign_keys=[recibido_por_id], back_populates='ordenes_compra_recibidas')


# --- Modelo DetalleOrdenCompra ---
class DetalleOrdenCompra(db.Model):
    __tablename__ = 'detalles_orden_compra'
    # __table_args__ = {'extend_existing': True} # <-- Añadir si el error se mueve aquí
    id = db.Column(db.Integer, primary_key=True)
    # ... (Pega aquí el resto de columnas y relaciones de DetalleOrdenCompra) ...
    orden_id = db.Column(db.Integer, db.ForeignKey('ordenes_compra.id', ondelete='CASCADE'), nullable=False)
    producto_id = db.Column(db.Integer, db.ForeignKey('productos.id', ondelete='RESTRICT'), nullable=False)
    cantidad_solicitada = db.Column(db.Numeric(15, 4), nullable=False)
    precio_unitario_estimado = db.Column(db.Numeric(15, 4), nullable=True)
    importe_linea_estimado = db.Column(db.Numeric(15, 2), nullable=True)
    cantidad_recibida = db.Column(db.Numeric(15, 4), nullable=True, default=Decimal('0.0'))
    costo_unitario_recepcion_ars = db.Column(db.Numeric(15, 4), nullable=True)
    notas_item_recepcion = db.Column(db.String(255), nullable=True)
    orden = db.relationship('OrdenCompra', back_populates='items')
    producto = db.relationship('Producto', back_populates='detalles_orden_compra')