# app/models.py

# --- Imports ---
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import event, CheckConstraint, ForeignKey, UniqueConstraint
from sqlalchemy.orm import validates, relationship
from datetime import datetime, timezone
from decimal import Decimal
from flask_login import UserMixin

# Importa la instancia 'db' creada en app/__init__.py
from . import db

# --- Modelo Usuario Interno ---

class UsuarioInterno(db.Model, UserMixin):
    __tablename__ = 'usuarios_internos'
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), nullable=False)
    apellido = db.Column(db.String(100), nullable=False)
    nombre_usuario = db.Column(db.String(50), unique=True, nullable=False)
    contrasena = db.Column(db.String(200), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    rol = db.Column(db.String(50), nullable=False)
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
     activo = db.Column(db.Boolean, default=True, nullable=False)
     condiciones_pago = db.Column(db.String(255), nullable=True)
     ordenes_compra = db.relationship('OrdenCompra', back_populates='proveedor', lazy='dynamic')

     def to_dict(self):
          return {
            'id': self.id,
            'nombre': self.nombre,
            'cuit': self.cuit,
            'direccion': self.direccion,
            'telefono': self.telefono,
            'email': self.email,
            'contacto': self.contacto,
            'condiciones_pago': self.condiciones_pago,
            'activo': self.activo
          }

# --- Modelo Producto ---
class Producto(db.Model):
    __tablename__ = 'productos'
    # __table_args__ = {'extend_existing': True} # <-- Añadir si el error se mueve aquí
    id = db.Column(db.Integer, primary_key=True)
    # ... (Pega aquí el resto de columnas y relaciones de Producto) ...
    nombre = db.Column(db.String(200), nullable=False)
#    receta_id = db.Column(db.Integer, db.ForeignKey('recetas.id', ondelete='SET NULL'), nullable=True)
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
    cliente_id = db.Column(db.Integer, db.ForeignKey('clientes.id'), nullable=True)
    fecha_registro = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    fecha_pedido = db.Column(db.DateTime, nullable=True)
    direccion_entrega = db.Column(db.String(255), nullable=True)
    cuit_cliente = db.Column(db.String(20), nullable=True)
    nombre_vendedor = db.Column(db.String(50), nullable=False)
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
    cliente = db.relationship('Cliente', back_populates='ventas')
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
    importe_total_estimado = db.Column(db.Numeric(15,2), nullable=True)
    precio_unitario = db.Column(db.Numeric(15,2), nullable=True)
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

class Cliente(db.Model):
    __tablename__ = 'clientes'
    id = db.Column(db.Integer, primary_key=True)
    nombre_razon_social = db.Column(db.String(255), nullable=False, index=True) # Nombre o Razón Social
    cuit = db.Column(db.String(20), unique=True, nullable=True, index=True) # CUIT/Identificación fiscal (opcional pero único)
    direccion = db.Column(db.String(255), nullable=True)
    localidad = db.Column(db.String(100), nullable=True)
    provincia = db.Column(db.String(100), nullable=True)
    codigo_postal = db.Column(db.String(20), nullable=True)
    telefono = db.Column(db.String(50), nullable=True)
    email = db.Column(db.String(100), nullable=True, index=True)
    contacto_principal = db.Column(db.String(150), nullable=True) # Nombre de la persona de contacto
    condicion_iva = db.Column(db.String(50), nullable=True) # Ej: Responsable Inscripto, Monotributista, Consumidor Final
    lista_precio_asignada = db.Column(db.String(50), nullable=True) # Si manejas diferentes listas
    observaciones = db.Column(db.Text, nullable=True)
    fecha_alta = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    activo = db.Column(db.Boolean, default=True, nullable=False) # Para bajas lógicas

    # Relación inversa con Ventas (Un cliente puede tener muchas ventas)
    # Asumiendo que en Venta tienes: cliente = db.relationship('Cliente', back_populates='ventas')
    ventas = db.relationship('Venta', back_populates='cliente', lazy='dynamic')

    def repr(self):
        return f'<Cliente ID:{self.id} {self.nombre_razon_social}>'

# Modulos precios especiales
class PrecioEspecialCliente(db.Model):
    __tablename__ = 'precios_especiales_cliente'

    id = db.Column(db.Integer, primary_key=True)
    cliente_id = db.Column(db.Integer, db.ForeignKey('clientes.id'), nullable=False, index=True) # Asume tabla 'clientes' con id
    producto_id = db.Column(db.Integer, db.ForeignKey('productos.id'), nullable=False, index=True) # Asume tabla 'productos' con id
    precio_unitario_fijo_ars = db.Column(db.Numeric(15, 4), nullable=False) # Precio fijo en ARS, ajustar precisión si es necesario
    activo = db.Column(db.Boolean, default=True, nullable=False)
    fecha_creacion = db.Column(db.DateTime, default=datetime.utcnow)
    fecha_modificacion = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relaciones (opcional pero útil)
    cliente = db.relationship('Cliente', backref='precios_especiales') # Ajusta 'Cliente' y 'backref'
    producto = db.relationship('Producto', backref='precios_especiales_cliente')

    # Restricción para evitar duplicados
    __table_args__ = (UniqueConstraint('cliente_id', 'producto_id', name='uq_cliente_producto_precio_especial'),)

    def __repr__(self):
        estado = 'Activo' if self.activo else 'Inactivo'
        cliente_info = f"Cliente ID {self.cliente_id}" if not self.cliente else f"'{self.cliente.razon_social}'" # Asume 'razon_social' en Cliente
        producto_info = f"Producto ID {self.producto_id}" if not self.producto else f"'{self.producto.nombre}'"
        return f"<PrecioEspecial {cliente_info} - {producto_info}: ARS {self.precio_unitario_fijo_ars:.2f} ({estado})>"

# --- Modelo Combo ---
class Combo(db.Model):
    __tablename__ = 'combos'
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(255), nullable=False, unique=True, index=True)
    sku_combo = db.Column(db.String(100), unique=True, nullable=True, index=True) # SKU del combo si lo vendes así
    descripcion = db.Column(db.Text, nullable=True)
    activo = db.Column(db.Boolean, default=True, nullable=False, index=True)
    fecha_creacion = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    fecha_modificacion = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Relación con sus componentes
    componentes = db.relationship('ComboComponente', back_populates='combo', lazy='select', cascade="all, delete-orphan") # 'select' para cargar componentes al acceder

    def __repr__(self):
        return f'<Combo {self.nombre}>'

    def to_dict(self, incluir_componentes=False, info_calculada=None):
        data = {
            'id': self.id,
            'nombre': self.nombre,
            'sku_combo': self.sku_combo,
            'descripcion': self.descripcion,
            'activo': self.activo,
            'fecha_creacion': self.fecha_creacion.isoformat() if self.fecha_creacion else None,
            'fecha_modificacion': self.fecha_modificacion.isoformat() if self.fecha_modificacion else None,
            # 'precio_fijo_combo_ars': float(self.precio_fijo_combo_ars) if self.precio_fijo_combo_ars else None
        }
        if incluir_componentes and self.componentes: # Verificar que self.componentes no es None
            data['componentes'] = [comp.to_dict() for comp in self.componentes]
        
        if info_calculada: # Para añadir info de costos/precios calculados
            data.update(info_calculada)
        return data

class ComboComponente(db.Model):
    __tablename__ = 'combo_componentes'
    id = db.Column(db.Integer, primary_key=True)
    combo_id = db.Column(db.Integer, db.ForeignKey('combos.id', ondelete='CASCADE'), nullable=False)
    producto_id = db.Column(db.Integer, db.ForeignKey('productos.id', ondelete='RESTRICT'), nullable=False)
    cantidad = db.Column(db.Numeric(15, 4), nullable=False)
    combo = db.relationship('Combo', back_populates='componentes')
    producto = db.relationship('Producto')

    @validates('cantidad')
    def validate_cantidad(self, key, cantidad_value):
        if not isinstance(cantidad_value, Decimal):
             cantidad_value = Decimal(str(cantidad_value))
        if cantidad_value <= 0:
             raise ValueError("La cantidad del componente debe ser mayor que cero.")
        return cantidad_value
    
    def to_dict(self):
        componente_info = {}
        unidad_venta_componente = "N/A"
        costo_unitario_usd_componente = "N/A" # Lo obtendremos al calcular

        if self.producto:
            componente_info = {
                'producto_id': self.producto_id, 
                'nombre': self.producto.nombre,
                'es_receta': self.producto.es_receta
            }
            unidad_venta_componente = self.producto.unidad_venta
            # El costo individual lo calcularemos en la función de cálculo del combo

        return {
            'id': self.id, # ID del registro ComboComponente
            'componente': componente_info,
            'cantidad': float(self.cantidad),
            'unidad_venta_componente': unidad_venta_componente,
        }