# utils/cost_utils.py 
from decimal import Decimal, ROUND_HALF_UP
from ..models import Producto, RecetaItem # Asegúrate de la ruta correcta
from .. import db # Si necesitas acceso a la sesión de DB

# Helper para redondear consistentemente
def redondear_decimal(valor: Decimal, decimales: int = 4) -> Decimal:
    # Usar ROUND_HALF_UP para redondeo estándar (ej: 2.5 -> 3, 2.4 -> 2)
    # El número de decimales puede ser un parámetro de configuración global
    quantizer = Decimal('1e-' + str(decimales))
    return valor.quantize(quantizer, rounding=ROUND_HALF_UP)

def calcular_costo_producto(producto_id: int, visitados: set = None) -> Decimal | None:
    """
    Calcula el costo de un producto recursivamente.
    Devuelve el costo como Decimal o None si no se puede calcular
    (ej., falta costo base de ingrediente, ciclo detectado).

    Args:
        producto_id: ID del producto a calcular.
        visitados: Set usado internamente para detectar ciclos de recetas.
                   ¡No pasar manualmente al llamar desde fuera!
    """
    if visitados is None:
        visitados = set() # Inicializar en la llamada raíz

    if producto_id in visitados:
        print(f"ERROR [calcular_costo_producto]: Ciclo detectado al intentar calcular costo para producto ID {producto_id}")
        return None # ¡Ciclo detectado!

    producto = db.session.get(Producto, producto_id) # Usar db.session.get es más eficiente
    if not producto:
        print(f"ERROR [calcular_costo_producto]: Producto ID {producto_id} no encontrado.")
        return None

    # Añadir al set ANTES de procesar hijos/ingredientes
    visitados.add(producto_id)

    costo_final = None # Inicializar costo

    if not producto.es_receta:
        # Caso Base: Es materia prima o producto comprado
        costo_final = producto.costo_referencia_usd # Devuelve el costo base (puede ser None si no está fijado)
        if costo_final is None:
             print(f"WARNING [calcular_costo_producto]: Producto base ID {producto_id} ('{producto.nombre}') no tiene costo_referencia_usd definido.")

    else:
        # Caso Recursivo: Es una receta, calcular basado en ingredientes
        if not producto.receta_asociada: # Verificamos que la relación existe
            print(f"ERROR [calcular_costo_producto]: Producto ID {producto_id} ('{producto.nombre}') marcado como receta pero sin receta asociada.")
            visitados.remove(producto_id) # Quitar antes de retornar error
            return None

        costo_calculado_receta = Decimal(0)
        # Acceder a la relación inversa (asumiendo que la tienes definida en Producto)
        # o buscar la receta por producto_final_id
        receta = producto.receta_asociada # Asumiendo relación uno-a-uno desde Producto a Receta

        if not receta.items:
             print(f"WARNING [calcular_costo_producto]: Receta para producto ID {producto_id} ('{producto.nombre}') no tiene items.")
             # Una receta sin items podría tener costo 0 o ser un error, depende de la lógica de negocio.
             # Devolver 0 podría ser una opción. Devolver None si se considera inválido.
             costo_final = Decimal(0) # Opcional: devolver 0 si receta vacía es válida
             # visitados.remove(producto_id) # Quitar antes de retornar
             # return None # Si receta vacía no debe tener costo

        else:
            calculo_posible = True
            for item in receta.items:
                if not item.ingrediente:
                     print(f"ERROR [calcular_costo_producto]: Item de receta para producto {producto_id} apunta a ingrediente_id {item.ingrediente_id} que no existe o falta relación.")
                     calculo_posible = False
                     break # No podemos continuar si falta un ingrediente

                # Llamada recursiva para obtener el costo del ingrediente
                costo_ingrediente = calcular_costo_producto(item.ingrediente_id, visitados.copy()) # Pasar copia del set

                if costo_ingrediente is None:
                    print(f"INFO [calcular_costo_producto]: No se pudo calcular el costo para el ingrediente ID {item.ingrediente_id} ('{item.ingrediente.nombre}') de la receta {producto_id}.")
                    calculo_posible = False
                    break # Si falta el costo de un ingrediente, no podemos calcular el total

                # Calcular contribución de este ingrediente
                contribucion = costo_ingrediente * (item.porcentaje / Decimal(100))
                costo_calculado_receta += contribucion

            if calculo_posible:
                # Redondear el resultado final de la receta
                costo_final = redondear_decimal(costo_calculado_receta)
            # else: costo_final sigue siendo None

    # Quitar el ID del set al salir de esta rama de la recursión
    # ¡Importante hacerlo ANTES de retornar!
    if producto_id in visitados:
        visitados.remove(producto_id)

    return costo_final