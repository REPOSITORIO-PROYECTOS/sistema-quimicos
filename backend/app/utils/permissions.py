def obtener_permisos(rol):
    permisos = {
        'admin': ['crear', 'leer', 'editar', 'eliminar'],
        'almacen': ['leer', 'editar'],
        'ventas': ['leer', 'crear']
        # etc.
    }
    return permisos.get(rol, [])

ROLES = ['ADMIN', 'ALMACEN', 'VENTAS']