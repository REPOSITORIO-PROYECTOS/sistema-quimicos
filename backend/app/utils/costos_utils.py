# utils/cost_utils.py 
from decimal import Decimal, ROUND_HALF_UP
from ..models import Producto, RecetaItem, Receta, CostoHistorico
from .. import db

# Helper para redondear consistentemente
def redondear_decimal(valor: Decimal, decimales: int = 8) -> Decimal:
    # Usar ROUND_HALF_UP para redondeo estándar (ej: 2.5 -> 3, 2.4 -> 2)
    # El número de decimales puede ser un parámetro de configuración global
    quantizer = Decimal('1e-' + str(decimales))
    return valor.quantize(quantizer, rounding=ROUND_HALF_UP)


def calcular_costo_producto(producto_id: int, visitados: set = None, nivel: int = 0) -> Decimal | None:
    """
    Calcula el costo de un producto recursivamente, con logs de depuración.
    """
    # --- DEBUG: Variable para indentar los logs ---
    indent = "  " * nivel
    
    # --- DEBUG: Imprime al entrar en la función ---
    print(f"{indent}--> Calculando costo para Producto ID: {producto_id}")

    if visitados is None:
        visitados = set()

    if producto_id in visitados:
        print(f"{indent}ERROR [ciclo]: Ciclo detectado al procesar producto ID {producto_id}. Ruta de visita: {visitados}")
        return None

    producto = db.session.get(Producto, producto_id)
    if not producto:
        print(f"{indent}ERROR [no_encontrado]: Producto ID {producto_id} no existe en la base de datos.")
        return None
    
    # --- DEBUG: Muestra el nombre del producto que se está procesando ---
    print(f"{indent}    Producto: '{producto.nombre}' (Es receta: {producto.es_receta})")

    visitados.add(producto_id)
    costo_final = None

    if not producto.es_receta:
        # --- CASO BASE ---
        costo_final = producto.costo_referencia_usd
        if costo_final is None:
             print(f"{indent}WARN [sin_costo_base]: Es un producto base SIN costo de referencia. Retornando None.")
        else:
             # --- DEBUG: Imprime el costo base encontrado ---
             print(f"{indent}    Es un producto base. Costo de referencia: {costo_final}")
    else:
        # --- CASO RECURSIVO ---
        receta = Receta.query.filter_by(producto_final_id=producto.id).first()

        if not receta:
            print(f"{indent}ERROR [datos_inconsistentes]: Marcado como receta pero no tiene una asociada.")
            if producto_id in visitados: visitados.remove(producto_id)
            return None

        if not receta.items:
             print(f"{indent}WARN [receta_vacia]: La receta no tiene items. Costo será 0.")
             costo_final = Decimal(0)
        else:
            costo_calculado_receta = Decimal(0)
            calculo_posible = True
            
            # --- DEBUG: Imprime que va a empezar a iterar sobre los items ---
            print(f"{indent}    Iterando sobre items de la receta:")

            for item in receta.items:
                if not item.ingrediente:
                     print(f"{indent}ERROR [ingrediente_invalido]: Item apunta a un ingrediente que no existe.")
                     calculo_posible = False
                     break

                # --- LLAMADA RECURSIVA ---
                costo_ingrediente = calcular_costo_producto(item.ingrediente_id, visitados.copy(), nivel + 1)

                if costo_ingrediente is None:
                    print(f"{indent}INFO [dependencia_fallida]: No se pudo calcular el costo para el ingrediente ID {item.ingrediente_id} ('{item.ingrediente.nombre}'). Abortando cálculo de esta receta.")
                    calculo_posible = False
                    break
                
                # --- DEBUG: Imprime el cálculo de la contribución ---
                porcentaje_decimal = item.porcentaje / Decimal(100)
                contribucion = costo_ingrediente * porcentaje_decimal
                print(f"{indent}      - Ingrediente: '{item.ingrediente.nombre}' (ID: {item.ingrediente_id})")
                print(f"{indent}        Costo Ingrediente: {costo_ingrediente}")
                print(f"{indent}        Porcentaje: {item.porcentaje}% ({porcentaje_decimal})")
                print(f"{indent}        Contribución al costo: {costo_ingrediente} * {porcentaje_decimal} = {contribucion}")

                costo_calculado_receta += contribucion

            if calculo_posible:
                # --- DEBUG: Muestra la suma total antes y después de redondear ---
                print(f"{indent}    Suma total de contribuciones (sin redondear): {costo_calculado_receta}")
                costo_final = redondear_decimal(costo_calculado_receta)
                print(f"{indent}    Costo final de la receta (redondeado a 4 decimales): {costo_final}")

    # Quitar el ID del set al salir de esta rama de la recursión
    if producto_id in visitados:
        visitados.remove(producto_id)
    
    # --- DEBUG: Imprime el valor final que se va a retornar ---
    print(f"{indent}<-- Retornando costo para Producto ID {producto_id}: {costo_final}")
    
    return costo_final




def guardar_costo_historico():
    hoy = datetime.now().date()
    costo, detalles = calcular_costos_del_dia()
    registro = CostoHistorico(fecha=hoy, costo_total=costo, detalles=detalles)
    db.session.add(registro)
    db.session.commit()
    return registro.to_dict()

# Importar datetime para guardar el histórico
from datetime import datetime
# Ejemplo de función de reporte que guarda el costo del día en el histórico
# Ejemplo de función de reporte que guarda el costo del día en el histórico
def calcular_costos_del_dia():
    costo_total = Decimal(0)
    detalles = "Cálculo simulado. Implementa la lógica real aquí."
    return costo_total, detalles

def reporte_costo_del_dia():
    # Calcula el costo del día (puedes adaptar la lógica según tu sistema)
    resultado = guardar_costo_historico()
    return resultado

def guardar_costo_historico_automatico():
    """
    Guarda automáticamente el costo histórico al iniciar la app (ejemplo: se puede llamar desde un scheduler o al inicio).
    """
    try:
        registro = guardar_costo_historico()
        print(f"Guardado automático de costo histórico: {registro}")
    except Exception as e:
        print(f"Error al guardar costo histórico automáticamente: {e}")