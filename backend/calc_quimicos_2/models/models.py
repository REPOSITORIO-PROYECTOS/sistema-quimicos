from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class UsuarioInterno(db.Model):
    __tablename__ = 'usuarios_internos'
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100))

class Producto(db.Model):
    __tablename__ = 'productos'
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100))
    unidad_venta = db.Column(db.String(50))
    costo = db.Column(db.Float)
    margen = db.Column(db.Float)
    tipo_calculo = db.Column(db.String(50))
    ref_calculo = db.Column(db.String(50))

class Venta(db.Model):
    __tablename__ = 'ventas'
    id = db.Column(db.Integer, primary_key=True)
    usuario_interno_id = db.Column(db.Integer, db.ForeignKey('usuarios_internos.id'))
    cliente_id = db.Column(db.Integer, nullable=True)
    fecha_registro = db.Column(db.DateTime, default=datetime.utcnow)
    fecha_pedido = db.Column(db.DateTime, nullable=True)
    direccion_entrega = db.Column(db.String(200), nullable=True)
    cuit_cliente = db.Column(db.String(20), nullable=True)
    observaciones = db.Column(db.Text, nullable=True)
    monto_total = db.Column(db.Float)

class DetalleVenta(db.Model):
    __tablename__ = 'detalles_venta'
    id = db.Column(db.Integer, primary_key=True)
    venta_id = db.Column(db.Integer, db.ForeignKey('ventas.id'))
    producto_id = db.Column(db.Integer, db.ForeignKey('productos.id'))
    cantidad = db.Column(db.Float)
    margen_aplicado = db.Column(db.Float)
    costo_unitario_momento = db.Column(db.Float)
    coeficiente_usado = db.Column(db.Float)
    precio_unitario_venta = db.Column(db.Float)
    precio_total_item = db.Column(db.Float)
