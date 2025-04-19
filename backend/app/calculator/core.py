# -*- coding: utf-8 -*-
# Archivo: calculator/core.py (v1.6 - Multi-Matriz con Parámetro - Limpio)

import sys
import os
import bisect
import traceback
import csv # Requerido para el procesamiento robusto de CSV
import io  # Requerido para tratar string como archivo

# --- INICIO: Importación de Datos ---
# print("--- DEBUG [core.py]: v1.6 - Iniciando importación de datos (Multi-Matriz - Limpio)...")
DATOS_TABLA_PL_RAW = None
DATOS_TABLA_PD_RAW = None
modulo_cargado_path = "No cargado"

try:
    from ..data import tabla_multiplicadores as modulo_datos_imp
    modulo_cargado_path = getattr(modulo_datos_imp, '__file__', 'Ruta desconocida')

    # Busca los atributos de las tablas RAW dentro del módulo cargado
    if hasattr(modulo_datos_imp, 'DATOS_TABLA_PL_RAW'):
        DATOS_TABLA_PL_RAW = modulo_datos_imp.DATOS_TABLA_PL_RAW
        # print("--- INFO [core.py]: DATOS_TABLA_PL_RAW cargado OK.")
    else:
        print("--- WARNING [core.py]: Variable 'DATOS_TABLA_PL_RAW' NO encontrada en el módulo de datos.")

    if hasattr(modulo_datos_imp, 'DATOS_TABLA_PD_RAW'):
        DATOS_TABLA_PD_RAW = modulo_datos_imp.DATOS_TABLA_PD_RAW
        # print("--- INFO [core.py]: DATOS_TABLA_PD_RAW cargado OK.")
    else:
        print("--- WARNING [core.py]: Variable 'DATOS_TABLA_PD_RAW' NO encontrada en el módulo de datos.")

    # Verifica si al menos una tabla se cargó
    if DATOS_TABLA_PL_RAW is None and DATOS_TABLA_PD_RAW is None:
         print(f"--- ERROR [core.py]: Ninguna tabla RAW (PL o PD) fue encontrada en {modulo_cargado_path}.")
         raise AttributeError("No se encontraron datos de tabla RAW (PL o PD).")

except ModuleNotFoundError:
    print(f"--- ERROR [core.py]: No se pudo encontrar el MÓDULO 'data.tabla_multiplicadores'.")
    print(f"--- ERROR [core.py]: Directorio actual: {os.getcwd()}")
    print(f"--- ERROR [core.py]: Verifica la estructura: [tu_proyecto]/data/tabla_multiplicadores.py")
    raise # Relanzar para detener la ejecución si no se encuentra el módulo de datos
except AttributeError as e:
    print(f"--- ERROR [core.py]: Fallo al obtener atributo necesario - {e}")
    raise
except Exception as e:
    print(f"--- ERROR [core.py]: Error inesperado importando datos: {type(e).__name__} - {e}")
    print(traceback.format_exc())
    raise
# --- FIN: Importación de Datos ---


# --- INICIO: FUNCIÓN PARA PROCESAR UNA TABLA CSV RAW ---
# print("--- DEBUG [core.py]: Definiendo _procesar_tabla_a_datos...")
def _procesar_tabla_a_datos(datos_raw, nombre_tabla_debug=""):
    """
    Convierte UNA tabla en formato string CSV (con comas decimales permitidas)
    en una estructura optimizada para búsqueda por rangos:
    1. Diccionario anidado: {referencia_float: {cantidad_float: coeficiente_float}}
    2. Lista ordenada de claves de referencia (float).
    3. Lista ordenada de claves de cantidad (float) de las cabeceras.

    Returns:
        tuple: (dict_tabla, lista_refs_ordenada, lista_qtys_ordenada)
               o (None, None, None) si hay un error de formato o procesamiento.
    """
    # print(f"--- DEBUG [_procesar_tabla_a_datos]: Iniciando procesamiento ({nombre_tabla_debug})...")
    if not isinstance(datos_raw, str) or not datos_raw.strip():
         print(f"--- ERROR [_procesar_tabla_a_datos]: datos_raw para '{nombre_tabla_debug}' inválido o vacío.")
         return None, None, None

    tabla_procesada = {}
    referencias_keys = set()
    cabeceras_cantidad_str_original = []
    lista_cantidades_ordenada = []

    try:
        f = io.StringIO(datos_raw.strip())
        reader = csv.reader(f, delimiter=',', quotechar='"', skipinitialspace=True)

        # 1. Procesar Cabeceras de Cantidad
        try:
            linea_cabecera_qty = next(reader)
            if len(linea_cabecera_qty) < 3:
                 print(f"--- ERROR [_procesar_tabla_a_datos]: Línea cabecera QTY para '{nombre_tabla_debug}' inválida.")
                 return None, None, None
            cabeceras_cantidad_str_original = linea_cabecera_qty[2:]
            cabeceras_cantidad_float_temp = []
            for cabecera in cabeceras_cantidad_str_original:
                valor_limpio = cabecera.strip().replace(',', '.')
                if valor_limpio:
                    try: cabeceras_cantidad_float_temp.append(float(valor_limpio))
                    except ValueError: print(f"--- WARNING [_procesar_tabla_a_datos]: Ignorando cabecera QTY inválida '{cabecera}' en '{nombre_tabla_debug}'.")
                # else: print(f"--- WARNING [_procesar_tabla_a_datos]: Ignorando cabecera QTY vacía en '{nombre_tabla_debug}'.") # Opcional
            lista_cantidades_ordenada = sorted(cabeceras_cantidad_float_temp)
            if not lista_cantidades_ordenada:
                 print(f"--- ERROR [_procesar_tabla_a_datos]: No se encontraron cabeceras QTY válidas en '{nombre_tabla_debug}'.")
                 return None, None, None
        except StopIteration:
            print(f"--- ERROR [_procesar_tabla_a_datos]: No se pudo leer cabecera QTY en '{nombre_tabla_debug}' (¿vacío?).")
            return None, None, None

        # Mapeo de cabeceras originales (float) para referencia en filas
        cabeceras_original_float = []
        for h in cabeceras_cantidad_str_original:
             try: cabeceras_original_float.append(float(h.strip().replace(',', '.')))
             except ValueError: cabeceras_original_float.append(None)

        # 2. Saltar Línea de Cabecera de Referencia
        try:
            next(reader) # Simplemente lee y descarta la segunda línea
        except StopIteration:
            print(f"--- ERROR [_procesar_tabla_a_datos]: Faltan datos después de cabecera QTY en '{nombre_tabla_debug}'.")
            return None, None, None

        # 3. Procesar Filas de Datos
        filas_procesadas_count = 0
        linea_num_actual = 3
        for partes in reader:
            if not partes or not partes[0].strip(): # Ignorar líneas vacías o sin referencia
                linea_num_actual += 1
                continue
            try:
                referencia_str_limpia = partes[0].strip().replace(',', '.')
                referencia_key = float(referencia_str_limpia)
                if referencia_key in referencias_keys:
                    print(f"--- WARNING [_procesar_tabla_a_datos]: Referencia {referencia_key} duplicada en '{nombre_tabla_debug}' (línea ~{linea_num_actual}). Se sobrescribirá.")
                referencias_keys.add(referencia_key)
                tabla_procesada[referencia_key] = {}
                valores_coeficiente = partes[2:]

                for i, cantidad_key_mapeo in enumerate(cabeceras_original_float):
                    if cantidad_key_mapeo is None: continue # Salta si cabecera original era inválida
                    if i >= len(valores_coeficiente): break # No más datos en esta fila
                    valor_str = valores_coeficiente[i]
                    valor_limpio = valor_str.strip().replace(',', '.')
                    if valor_limpio:
                        try:
                            coeficiente_float = float(valor_limpio)
                            tabla_procesada[referencia_key][cantidad_key_mapeo] = coeficiente_float
                        except ValueError:
                             print(f"--- WARNING [_procesar_tabla_a_datos]: Valor inválido '{valor_str}' en '{nombre_tabla_debug}' Ref={referencia_key}, ColQty={cantidad_key_mapeo} (línea ~{linea_num_actual}). Ignorado.")
                filas_procesadas_count += 1
            except (ValueError, IndexError) as e:
                print(f"--- WARNING [_procesar_tabla_a_datos]: Error procesando línea ~{linea_num_actual} ('{partes}') en '{nombre_tabla_debug}'. Error: {e}. Fila ignorada.")
            linea_num_actual += 1

        # 4. Finalización
        lista_referencias_ordenada = sorted(list(referencias_keys))
        if not tabla_procesada or not lista_referencias_ordenada:
             print(f"--- ERROR [_procesar_tabla_a_datos]: No se generaron datos válidos finales para '{nombre_tabla_debug}'.")
             return None, None, None

        # print(f"--- DEBUG [_procesar_tabla_a_datos]: Procesamiento OK para '{nombre_tabla_debug}'.")
        return tabla_procesada, lista_referencias_ordenada, lista_cantidades_ordenada

    except Exception as e:
        print(f"--- ERROR CRITICO INESPERADO procesando '{nombre_tabla_debug}': {type(e).__name__} - {e}")
        print(traceback.format_exc())
        return None, None, None
# --- FIN: FUNCIÓN PARA PROCESAR LA TABLA ---


# --- INICIO: INICIALIZACIÓN DE DATOS (Carga y Procesa todas las tablas) ---
# print("--- DEBUG [core.py]: Iniciando procesamiento de todas las tablas RAW...")
DATOS_PROCESADOS = {} # Diccionario global para almacenar datos procesados

if DATOS_TABLA_PL_RAW:
    # print("--- Procesando Tabla PL ---")
    tabla_pl, refs_pl, qtys_pl = _procesar_tabla_a_datos(DATOS_TABLA_PL_RAW, "PL")
    if tabla_pl is not None:
        DATOS_PROCESADOS['PL'] = {'tabla': tabla_pl, 'refs': refs_pl, 'qtys': qtys_pl}
        print("--- INFO [core.py]: Datos de tabla 'PL' cargados correctamente.")
    else:
        print("--- ERROR [core.py]: Falló el procesamiento de la tabla 'PL'. Funcionalidad para PL no disponible.")

if DATOS_TABLA_PD_RAW:
    # print("--- Procesando Tabla PD ---")
    tabla_pd, refs_pd, qtys_pd = _procesar_tabla_a_datos(DATOS_TABLA_PD_RAW, "PD")
    if tabla_pd is not None:
        DATOS_PROCESADOS['PD'] = {'tabla': tabla_pd, 'refs': refs_pd, 'qtys': qtys_pd}
        print("--- INFO [core.py]: Datos de tabla 'PD' cargados correctamente.")
    else:
        print("--- ERROR [core.py]: Falló el procesamiento de la tabla 'PD'. Funcionalidad para PD no disponible.")

# Verifica si al menos una tabla se procesó con éxito
if not DATOS_PROCESADOS:
    print("--- ERROR FATAL [core.py]: No se pudieron procesar los datos de NINGUNA tabla. Verifique los datos RAW y los errores anteriores.")
    raise RuntimeError("Fallo crítico en el procesamiento de datos de tabla.")

# print("--- DEBUG [core.py]: Fin inicialización de datos procesados. ---")
# --- FIN: INICIALIZACIÓN DE DATOS ---


# --- Constante para el mínimo absoluto (puede moverse a un archivo de config si se desea) ---
MINIMO_ABSOLUTO = 0.001

# --- INICIO: FUNCIÓN BUSCADORA DE COEFICIENTE (Interfaz Pública) ---
# print(f"--- DEBUG [core.py]: Definiendo obtener_coeficiente_por_rango...")
def obtener_coeficiente_por_rango(referencia_input, cantidad_input, tipo_producto):
    """
    Busca el coeficiente en la tabla especificada por tipo_producto ('PL' o 'PD').

    Aplica rangos interpretados como (valor_anterior, valor_actual].
    Utiliza un mínimo absoluto definido en MINIMO_ABSOLUTO (ej: 0.001).
    El último rango definido en la tabla se considera abierto (se extiende indefinidamente).

    Args:
        referencia_input: El valor de referencia a buscar (str o numérico).
        cantidad_input: El valor de cantidad a buscar (str o numérico).
        tipo_producto (str): Identificador de la tabla a usar (ej: 'PL', 'PD').
                             Debe coincidir con una clave en DATOS_PROCESADOS.

    Returns:
        float: El coeficiente encontrado como número de punto flotante.
        None: Si la tabla no está cargada, los inputs son inválidos,
              están por debajo del mínimo absoluto, o si la combinación
              específica de rangos no tiene un coeficiente definido en la tabla.
    """
    # print(f"\n--- DEBUG [obtener_coeficiente_por_rango]: Buscando Coeficiente para TIPO='{tipo_producto}', Ref='{referencia_input}', Cant='{cantidad_input}' ---")

    # 1. Seleccionar datos según tipo_producto
    if tipo_producto not in DATOS_PROCESADOS:
        print(f"--- ERROR [obtener_coeficiente_por_rango]: Tipo de producto '{tipo_producto}' desconocido o sus datos no se cargaron.")
        return None

    datos_actuales = DATOS_PROCESADOS[tipo_producto]
    tabla_actual = datos_actuales['tabla']
    lista_ref_actual = datos_actuales['refs']
    lista_qty_actual = datos_actuales['qtys']

    # 2. Verificar que los datos para este tipo estén listos
    if not tabla_actual or not lista_ref_actual or not lista_qty_actual:
         print(f"--- ERROR [obtener_coeficiente_por_rango]: Datos internos para '{tipo_producto}' vacíos o no inicializados.")
         return None

    try:
        # 3. Convertir y validar inputs
        try:
            ref_valor = float(str(referencia_input).replace(',', '.'))
        except (ValueError, TypeError):
            print(f"--- WARNING [obtener_coeficiente_por_rango]: Valor de Referencia '{referencia_input}' inválido.")
            return None
        try:
            qty_valor = float(str(cantidad_input).replace(',', '.'))
        except (ValueError, TypeError):
            print(f"--- WARNING [obtener_coeficiente_por_rango]: Valor de Cantidad '{cantidad_input}' inválido.")
            return None

        # 4. Validar contra Mínimo Absoluto
        if ref_valor < MINIMO_ABSOLUTO or qty_valor < MINIMO_ABSOLUTO:
            # print(f"--- DEBUG [obtener_coeficiente_por_rango]: Input Ref({ref_valor}) o Qty({qty_valor}) < Min({MINIMO_ABSOLUTO}).") # Debug opcional
            return None # No se aplica coeficiente por debajo del mínimo

        # 5. Encontrar Clave de Referencia Aplicable (lógica (prev, actual])
        indice_ref = bisect.bisect_left(lista_ref_actual, ref_valor)
        if indice_ref == len(lista_ref_actual): # Mayor o igual que el último punto
            ref_key_usar = lista_ref_actual[-1] # Usar la última clave
        else:
            ref_key_usar = lista_ref_actual[indice_ref] # Usar la clave encontrada (>= valor)

        # 6. Encontrar Clave de Cantidad Aplicable (lógica (prev, actual])
        indice_qty = bisect.bisect_left(lista_qty_actual, qty_valor)
        if indice_qty == len(lista_qty_actual): # Mayor o igual que el último punto
            qty_key_usar = lista_qty_actual[-1] # Usar la última clave
        else:
            qty_key_usar = lista_qty_actual[indice_qty] # Usar la clave encontrada (>= valor)

        # print(f"--- DEBUG [obtener_coeficiente_por_rango]: Usando RefKey={ref_key_usar}, QtyKey={qty_key_usar}") # Debug opcional

        # 7. Buscar Coeficiente en la Tabla Procesada
        dict_referencia = tabla_actual.get(ref_key_usar)
        if dict_referencia is not None:
            coeficiente = dict_referencia.get(qty_key_usar)
            if coeficiente is not None:
                return coeficiente # ¡Éxito! Devuelve el float encontrado
            else:
                # Claves válidas, pero sin valor (Celda en blanco original)
                print(f"--- INFO [obtener_coeficiente_por_rango]: No hay coeficiente definido para TIPO='{tipo_producto}', RefKey={ref_key_usar}, QtyKey={qty_key_usar} (celda vacía en tabla original).")
                return None
        else:
            # Error interno (No debería ocurrir si las listas están sincronizadas con la tabla)
            print(f"--- ERROR INTERNO [obtener_coeficiente_por_rango]: Inconsistencia - Falta entrada para RefKey={ref_key_usar} en TIPO='{tipo_producto}'.")
            return None

    except IndexError:
         # Podría ocurrir si las listas están vacías (aunque se verifica al inicio)
         print(f"--- ERROR [obtener_coeficiente_por_rango]: Error de índice inesperado durante búsqueda para TIPO='{tipo_producto}'.")
         # print(traceback.format_exc()) # Descomentar para depuración profunda
         return None
    except Exception as e:
         # Captura cualquier otro error inesperado durante la búsqueda
         print(f"--- ERROR INESPERADO [obtener_coeficiente_por_rango]: {type(e).__name__} - {e} buscando TIPO='{tipo_producto}'.")
         # print(traceback.format_exc()) # Descomentar para depuración profunda
         return None

# print("--- DEBUG [core.py]: Definición de obtener_coeficiente_por_rango completa. ---")
# --- FIN: FUNCIÓN BUSCADORA DE COEFICIENTE ---

print("--- INFO [core.py]: Módulo core.py (Multi-Matriz) cargado y listo. ---")