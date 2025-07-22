# calculator/core.py

import csv
import io
import traceback
from decimal import Decimal

# --- INICIO: IMPORTACIÓN DE DATOS ---
try:
    from ..data import tabla_multiplicadores as modulo_datos
    DATOS_TABLA_PL_RAW = getattr(modulo_datos, 'DATOS_TABLA_PL_RAW', None)
    DATOS_TABLA_PD_RAW = getattr(modulo_datos, 'DATOS_TABLA_PD_RAW', None)
    if not DATOS_TABLA_PL_RAW and not DATOS_TABLA_PD_RAW:
        raise ImportError("No se encontraron datos de tabla RAW (PL o PD).")
except ImportError as e:
    print(f"--- ERROR FATAL [core.py]: No se pudo cargar el módulo de datos. {e}")
    raise

# --- INICIO: FUNCIÓN PARA PROCESAR UNA TABLA ---
def _procesar_tabla_a_datos(datos_raw_str, nombre_tabla=""):
    """
    Convierte una tabla CSV en un diccionario anidado y listas de claves.
    Almacena las claves tanto en formato string como Decimal para búsquedas robustas.
    """
    if not datos_raw_str or not isinstance(datos_raw_str, str):
        return None
    
    tabla = {}
    refs_str, qtys_str = set(), set()
    
    try:
        reader = csv.reader(io.StringIO(datos_raw_str.strip()), delimiter=',')
        
        # Procesar cabeceras de cantidad (primera fila)
        header_qty_str = [h.strip() for h in next(reader)[2:] if h.strip()]
        for q in header_qty_str:
            qtys_str.add(q.replace(',', '.'))
            
        next(reader) # Saltar segunda fila (cabecera de referencia)

        # Procesar filas de datos
        for row in reader:
            if not row or not row[0].strip(): continue
            ref_str = row[0].strip().replace(',', '.')
            refs_str.add(ref_str)
            
            ref_key = ref_str # Usamos string como clave para consistencia
            tabla[ref_key] = {}
            
            valores_coef = [v.strip().replace(',', '.') for v in row[2:]]
            
            for i, qty_header_str in enumerate(header_qty_str):
                if i < len(valores_coef) and valores_coef[i]:
                    qty_key = qty_header_str.replace(',', '.')
                    tabla[ref_key][qty_key] = valores_coef[i]

        # Ordenar las claves numéricamente
        sorted_refs_str = sorted(list(refs_str), key=Decimal)
        sorted_qtys_str = sorted(list(qtys_str), key=Decimal)
        
        return {
            "tabla": tabla,
            "refs_str": sorted_refs_str,
            "qtys_str": sorted_qtys_str
        }

    except Exception as e:
        print(f"--- ERROR CRÍTICO procesando tabla '{nombre_tabla}': {e}")
        traceback.print_exc()
        return None

# --- INICIO: INICIALIZACIÓN DE DATOS ---
DATOS_PROCESADOS = {}
if DATOS_TABLA_PL_RAW:
    datos_pl = _procesar_tabla_a_datos(DATOS_TABLA_PL_RAW, "PL")
    if datos_pl:
        DATOS_PROCESADOS['PL'] = datos_pl
        print("--- INFO [core.py]: Datos de tabla 'PL' cargados correctamente.")
if DATOS_TABLA_PD_RAW:
    datos_pd = _procesar_tabla_a_datos(DATOS_TABLA_PD_RAW, "PD")
    if datos_pd:
        DATOS_PROCESADOS['PD'] = datos_pd
        print("--- INFO [core.py]: Datos de tabla 'PD' cargados correctamente.")
if not DATOS_PROCESADOS:
    raise RuntimeError("Fallo crítico: No se pudieron procesar los datos de NINGUNA tabla.")

# --- INICIO: FUNCIÓN BUSCADORA DE COEFICIENTE (FINAL Y CORRECTA) ---
def obtener_coeficiente_por_rango(referencia_input, cantidad_input, tipo_producto):
    """
    Busca el coeficiente correcto usando la lógica de "el escalón más grande que
    sea menor o igual a la cantidad solicitada".
    """
    try:
        if tipo_producto not in DATOS_PROCESADOS: return None
        datos = DATOS_PROCESADOS[tipo_producto]
        tabla_actual = datos['tabla']
        refs_str_list = datos['refs_str']
        qtys_str_list = datos['qtys_str']

        ref_valor = Decimal(str(referencia_input).replace(',', '.'))
        qty_valor = Decimal(str(cantidad_input).replace(',', '.'))

        # 2. Encontrar la FILA (Referencia)
        ref_key_usar = None
        for ref_str in refs_str_list:
            if ref_valor >= Decimal(ref_str):
                ref_key_usar = ref_str
        if ref_key_usar is None: ref_key_usar = refs_str_list[0]

        # 3. Encontrar la COLUMNA (Cantidad)
        qty_key_usar = None
        for qty_str in qtys_str_list:
            if qty_valor >= Decimal(qty_str):
                qty_key_usar = qty_str
        if qty_key_usar is None: qty_key_usar = qtys_str_list[0]

        # 4. Devolver el coeficiente y el límite del tier
        coeficiente = tabla_actual[ref_key_usar][qty_key_usar]
        
        return (str(coeficiente), qty_key_usar)

    except (IndexError, KeyError, TypeError) as e:
        print(f"ERROR CORE: No se encontró la clave en la matriz. Detalle: {e}")
        return None
    except Exception as e:
        print(f"ERROR FATAL en obtener_coeficiente_por_rango: {e}")
        traceback.print_exc()
        return None

print("--- INFO [core.py]: Módulo core.py cargado y listo. ---")