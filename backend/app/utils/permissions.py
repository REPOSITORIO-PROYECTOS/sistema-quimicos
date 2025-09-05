def obtener_permisos(rol):
    permisos = {
        'admin': ['crear', 'leer', 'editar', 'eliminar'],
        'almacen': ['leer', 'editar'],
        'ventas': ['leer', 'crear']
        # etc.
    }
    return permisos.get(rol, [])

ROLES = {
	'ADMIN':'ADMIN',
	'ALMACEN':'ALMACEN',
	'VENTAS_LOCAL':'VENTAS_LOCAL',
	'VENTAS_PEDIDOS':'VENTAS_PEDIDOS',
	'CONTABLE':'CONTABLE',
    'OPERADOR' : 'OPERADOR'
}
