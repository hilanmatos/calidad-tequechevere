"""Extractor de 'CONTROL DE CALIDAD ALMOND BITES.xlsx' → formato cq-l4-almond (Línea 4 Almond Bites).

Hoja 'Control de proceso': encabezados en la fila 3, una fila por producción (lote) desde la fila 4.
Uso: python -m extractores.almond "<carpeta de Calidad>"   (desde tools/importar)
"""
import sys
from datetime import date
from pathlib import Path

from openpyxl import load_workbook

from extractores._bites import (aplicar_unicidad_lote, filas_con_datos, imprimir_resumen, procesar_filas,
                                verificar_encabezados)

FORMATOS = ['cq-l4-almond']
ARCHIVOS = ['CONTROL DE CALIDAD ALMOND BITES.xlsx']

HOJA = 'Control de proceso'
FILA_ENCABEZADOS = 3

REGLAS = [
    (('almond', 'queso'), 'Almond Bite de Queso'),
    (('almond', 'chocolate'), 'Almond Bite de Chocolate'),
]

CORRECTA = ('conf', ('Correcta', 'Incorrecta'))
CORRECTO = ('conf', ('Correcto', 'Incorrecto'))

# Encabezados tal como están en el Excel (se comparan sin acentos, espacios ni mayúsculas).
ENCABEZADOS = {
    1: 'FECHA', 2: 'PRODUCTO', 3: 'TEMPERATURA (°C) MASA ALMOND BITES', 4: 'T° Ambiente proceso',
    5: '%H Ambiente proceso', 6: '% HUMEDAD DE LA MASA', 7: 'APARIENCIA GENERAL', 8: 'TEMPERATURA DEL RELLENO (°C)',
    9: 'Tiempo de espera', 10: 'T°C relleno final', 11: 'TIEMPO DE FORMADO', 12: 'PESO PROMEDIO POR UNIDAD (g)',
    13: 'PESO PROMEDIO DE RELLENO (g)', 14: 'APARIENCIA', 15: '% DE PRODUCTO NO CONFORME',
    16: 'TEMPERATURA INTERNA DE PRODUCTO ( °C ) PCC1', 17: 'APARIENCIA', 18: 'PRESENTACIÓN', 19: 'LOTE',
    20: 'FECHA DE VENCIMIENTO', 21: 'PESO PROMEDIO EMPAQUE (KG)', 22: 'PESO REAL (KG)', 23: 'DIFERENCIA',
    24: 'TEMPERATURA INTERNA FINAL DE PRODUCTO (T°C) PCC2', 25: 'CALIDAD DE SELLADO', 26: 'IMPRESIÓN DE LOTE',
    27: 'AUSENCIA/PRESENCIA DE METALES PCC3', 28: 'SABOR', 29: 'COLOR', 30: 'TEXTURA', 31: 'APARIENCIA', 32: 'FOTO',
}

# (columna, campo, tipo, etiqueta para observaciones). Col 1 = fecha, col 2 = producto.
COLUMNAS = [
    (3, 'tMasa', 'num', 'Temperatura de la masa'),
    (4, 'tAmbiente', 'num', 'Temperatura ambiente'),
    (5, 'hrAmbiente', 'num', 'Humedad relativa ambiente'),
    (6, 'hMasa', 'num', 'Humedad de la masa'),
    (7, 'aparienciaMasa', CORRECTA, 'Apariencia de la masa'),
    (8, 'tRelleno', 'num', 'Temperatura del relleno'),
    (9, 'tiempoEspera', 'min', 'Tiempo de espera del relleno'),
    (10, 'tRellenoFinal', 'num', 'Temperatura final del relleno'),
    (11, 'tiempoFormado', 'min', 'Tiempo de formado'),
    (12, 'pesoPromedio', 'num', 'Peso promedio por unidad'),
    (13, 'pesoRelleno', 'num', 'Peso promedio del relleno'),
    (14, 'aparienciaFormado', CORRECTA, 'Apariencia (formado)'),
    (15, 'pctNoConforme', 'num', 'Producto no conforme'),
    (16, 'tInternaCong', 'num', 'Temperatura interna (congelación)'),
    (17, 'aparienciaCong', CORRECTA, 'Apariencia (congelación)'),
    (18, 'presentacion', 'pres', 'Presentación'),
    (19, None, 'lote', 'Lote'),
    (20, 'vencimiento', 'venc', 'Fecha de vencimiento'),
    (21, 'pesoEmpaque', 'kg', 'Peso medido del empaque'),
    (22, None, 'ignorar', 'Peso real (es el declarado: lo calcula la app)'),
    (23, None, 'ignorar', 'Diferencia (calculada por la app)'),
    (24, 'tFinal', 'num', 'Temperatura interna final'),
    (25, 'sellado', CORRECTO, 'Calidad del sellado'),
    (26, 'impresionLote', CORRECTA, 'Impresión de lote'),
    (27, 'metales', 'metal', 'Detección de metales'),
    (28, 'sabor', 'sens', 'Sabor (sensorial)'),
    (29, 'color', 'sens', 'Color (sensorial)'),
    (30, 'textura', 'sens', 'Textura (sensorial)'),
    (31, 'aparienciaSensorial', 'sens', 'Apariencia (sensorial)'),
    (32, None, 'obs', 'Foto'),
]


def extraer(carpeta: Path, hoy: date) -> tuple[list[dict], list[dict]]:
    archivo = ARCHIVOS[0]
    wb = load_workbook(Path(carpeta) / archivo, read_only=True, data_only=True)
    try:
        rechazos = [{'fuente': f'{archivo} › {ws.title}', 'motivo': 'hoja no reconocida (no se importó)',
                     'contenido': ''} for ws in wb.worksheets if ws.title != HOJA]
        ws = wb[HOJA]
        verificar_encabezados(ws, FILA_ENCABEZADOS, ENCABEZADOS)
        filas = filas_con_datos(ws, FILA_ENCABEZADOS + 1)
        registros, rech = procesar_filas(filas, archivo, ws.title, FORMATOS[0], COLUMNAS, REGLAS, hoy)
    finally:
        wb.close()
    registros, repetidos = aplicar_unicidad_lote(registros)
    return registros, rechazos + rech + repetidos


if __name__ == '__main__':
    imprimir_resumen(*extraer(Path(sys.argv[1]), date.today()))
