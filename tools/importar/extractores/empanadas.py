"""Líneas 2 (empanadas de trigo, discos y pastelitos) y 3 (empanadas de maíz).

Los dos Excel usan la misma plantilla: una hoja 'Control de calidad', títulos en las filas 1 a 3,
encabezados en la fila 4 y una fila por lote producido desde la 5. Cada fila es un registro. La de maíz
trae además 'PESO DE LA MASA' con campo propio y 'APARIENCIA PCC2' del empaque.

Fechas: Excel convirtió las fechas escritas dd/mm/aaaa con día <= 12 a fecha mm/dd (quedan invertidas);
las de día > 12 quedaron como texto exacto. La fecha de producción se resuelve con
normalizar.corregir_secuencia y la de vencimiento de la misma fila se invierte igual que la de producción.

Unicidad 'lote' (src/formatos/cq-empanadas.ts): la app no admite dos registros del mismo formato con el
mismo lote (sin espacios, en mayúsculas). Se conserva la primera fila y las siguientes van a rechazos.
"""
import re
import unicodedata
from collections import Counter
from datetime import date, datetime
from pathlib import Path

from openpyxl import load_workbook

from normalizar import conforme, corregir_secuencia, fecha, numero, peso_kg, sin_acentos, texto, vacio

TRIGO = 'cq-l2-empanadas-trigo'
MAIZ = 'cq-l3-empanadas-maiz'
FORMATOS = [TRIGO, MAIZ]

ARCHIVO_TRIGO = 'CONTROL DE CALIDAD EMPANADAS DE TRIGO, DISCOS Y PASTELITOS (Copia en conflicto de TEQUE CHEVERE PTY 2026-10-05).xlsx'
ARCHIVO_MAIZ = 'CONTROL DE CALIDAD  EMPANADAS DE MAÍZ.xlsx'
ARCHIVOS = [ARCHIVO_TRIGO, ARCHIVO_MAIZ]

FECHA_MIN = date(2025, 1, 1)

# Nombre del Excel (normalizado con _clave) → clave del catálogo (catalogo.py). Solo correspondencias seguras.
PRODUCTOS_EXCEL = {
    TRIGO: {
        'pastelitos de queso': 'PP001',
        'pastelitos de pollo': 'PP003',
        # 'Empanadas de queso': 94.8 g por unidad y 1.3 kg por empaque = Premium de 15 (la Dulce es de 60 unidades)
        'empanadas de queso': 'PE001',
        'empanadas de carne': 'PE002',
        # 'Discos': 12 unidades de ~38 g, peso teórico 0.46 kg en el Excel = tapas de 12 cm (las de 17 cm son de 25)
        'discos': 'PD001',
    },
    MAIZ: {
        'empanaditas de queso': 'PE006',
        'empanaditas de carne': 'PE007',
        'empanaditas de pollo': 'PE008',
    },
}

APARIENCIA = ('Correcta', 'Incorrecta')


def _apariencia(v):
    return conforme(v, APARIENCIA)


def _sellado(v):
    return conforme(v, ('Correcto', 'Incorrecto'))


def opcion(v, opciones):
    """La opción del campo que coincide con la celda (sin importar mayúsculas, acentos ni espacios)."""
    if vacio(v):
        return None
    s = sin_acentos(str(v)).strip().lower()
    return next((o for o in opciones if sin_acentos(o).lower() == s), None)


def _metales(v):
    return opcion(v, ('Ausencia', 'Presencia'))


def temp_agua(v):
    """Temperatura del agua: número en °C, o 'Ambiente' si el Excel dice que se usó a temperatura ambiente."""
    if vacio(v):
        return None
    n = numero(v)
    if n is None and 'ambiente' in sin_acentos(str(v)).lower():
        return 'Ambiente'
    return n


# campo id → (normalizador, etiqueta en la app)
CAMPOS = {
    'tAmbiente': (numero, 'Temperatura ambiente'),
    'hrAmbiente': (numero, 'Humedad relativa ambiente'),
    'tAgua': (temp_agua, 'Temperatura del agua'),
    'tMasa': (numero, 'Temperatura de la masa'),
    'hMasa': (numero, 'Humedad de la masa'),
    'aparienciaMasa': (_apariencia, 'Apariencia de la masa'),
    'pesoMasa': (numero, 'Peso de la masa'),
    'pesoRelleno': (numero, 'Peso promedio del relleno'),
    'pesoProducto': (numero, 'Peso promedio del producto final'),
    'aparienciaProducto': (_apariencia, 'Apariencia del producto'),
    'tRelleno': (numero, 'Temperatura del relleno'),
    'tInternaCong': (numero, 'Temperatura interna'),
    'aparienciaCong': (_apariencia, 'Apariencia en congelación'),
    'presentacion': (texto, 'Presentación'),
    'pesoEmpaque': (peso_kg, 'Peso medido del empaque'),
    'aparienciaEmpaque': (_apariencia, 'Apariencia del empaque'),
    'metales': (_metales, 'Detección de metales'),
    'sellado': (_sellado, 'Calidad del sellado'),
    'impresionLote': (_apariencia, 'Impresión de lote'),
}

# Columnas de la plantilla: (encabezado normalizado, destino). Destino: id de campo, una clave del encabezado
# del registro ('fecha', 'producto', 'lote', 'vencimiento'), 'obs' (texto libre a observaciones),
# '#' (correlativo) o None (sin destino: valores teóricos y calculados que la app toma del catálogo).
_COMUNES = [
    ('N°', '#'),
    ('FECHA DE PRODUCCION', 'fecha'),
    ('PRODUCTO', 'producto'),
    ('TEMPERATURA AMBIENTE (°C )', 'tAmbiente'),
    ('% HUMEDAD AMBIENTE', 'hrAmbiente'),
    ('TEMPERATURA (°C ) DEL AGUA', 'tAgua'),
    ('TEMPERATURA (°C ) MASA', 'tMasa'),
    ('% HUMEDAD MASA', 'hMasa'),
    ('APARIENCIA GENERAL', 'aparienciaMasa'),
]
_PRODUCTO_A_EMPAQUE = [
    ('PESO PROMEDIO DEL RELLENO (G)', 'pesoRelleno'),
    ('PESO TEORICO DEL RELLENO (G)', None),
    ('PESO PROMEDIO DEL PRODUCTO FINAL (G)', 'pesoProducto'),
    ('PESO TEORICO (G)', None),
    ('APARIENCIA GENERAL', 'aparienciaProducto'),
    ('TEMPERATURA DE RELLENO ( °C )', 'tRelleno'),
    ('TEMPERATURA INTERNA DE CONGELACION ( °C ) PCC1', 'tInternaCong'),
    ('APARIENCIA', 'aparienciaCong'),
    ('PRESENTACION', 'presentacion'),
    ('LOTE', 'lote'),
    ('FECHA DE VENCIMIENTO', 'vencimiento'),
    ('PESO (KG) EMPAQUE', 'pesoEmpaque'),
    ('PESO TEORICO (KG)', None),
    ('DIFERENCIA (KG)', None),
]
_CIERRE = [
    ('CALIDAD DEL SELLADO', 'sellado'),
    ('IMPRESION DE LOTE', 'impresionLote'),
    ('', 'obs'),
]
LAYOUT_TRIGO = (_COMUNES + [('PESO DE LA MASA (G)', None)] + _PRODUCTO_A_EMPAQUE
                + [('AUSENCIA/PRESENCIA DE METAL PCC2', 'metales')] + _CIERRE)
LAYOUT_MAIZ = (_COMUNES + [('PESO DE LA MASA (G)', 'pesoMasa')] + _PRODUCTO_A_EMPAQUE
               + [('APARIENCIA PCC2', 'aparienciaEmpaque'), ('AUSENCIA/PRESENCIA DE METAL PCC3', 'metales')] + _CIERRE)


def _clave(s) -> str:
    return re.sub(r'\s+', ' ', sin_acentos(str(s or ''))).strip().upper()


def _visible(s) -> str:
    return re.sub(r'\s+', ' ', str(s or '')).strip()


def producto_catalogo(nombre, formato):
    """Clave del catálogo para el nombre de producto del Excel, o None si no hay correspondencia segura."""
    if vacio(nombre):
        return None
    return PRODUCTOS_EXCEL.get(formato, {}).get(_clave(nombre).lower())


def lote(v):
    if vacio(v):
        return None
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def _invertida(d: date):
    return date(d.year, d.day, d.month) if d.day <= 12 and d.day != d.month else None


def invertir_vencimiento(fecha_cruda, fecha_corregida: date) -> bool:
    """El vencimiento se invierte salvo que la producción fuera una fecha de Excel que quedó tal cual."""
    if isinstance(fecha_cruda, (datetime, date)):
        return fecha(fecha_cruda) != fecha_corregida
    return True


def vencimiento(v, invertir: bool):
    d = fecha(v)
    if d is None:
        return None
    if invertir and isinstance(v, (datetime, date)):
        d = _invertida(d) or d
    return d.isoformat()


def clave_unica(formato, lote_):
    """La misma clave que claveUnica() de src/motor/evaluar.ts para unicidad 'lote'."""
    if lote_ is None or not str(lote_).strip():
        return None
    return f"{formato}|lote|{re.sub(r'\s+', '', str(lote_)).upper()}"


def _contenido(r) -> str:
    return f"lote {r.get('lote')}, {r.get('fecha')}, {r.get('producto') or 'sin producto'}"


def aplicar_unicidad(registros):
    """Deja un registro por lote y formato: el primero en el Excel. Los repetidos van a rechazos."""
    primeros, aceptados, rechazos = {}, [], []
    for r in registros:
        k = clave_unica(r['formato'], r.get('lote'))
        previo = primeros.get(k) if k else None
        if previo is None:
            if k:
                primeros[k] = r
            aceptados.append(r)
            continue
        igual = all(r.get(c) == previo.get(c) for c in ('fecha', 'producto', 'valores', 'observaciones'))
        motivo = ('lote repetido: fila idéntica a otra ya importada' if igual
                  else 'lote repetido con datos distintos (la app admite un registro por lote)')
        rechazos.append({'fuente': r['fuente'], 'motivo': motivo,
                         'contenido': f"{_contenido(r)}; ya importado desde {previo['fuente']}"})
    return aceptados, rechazos


def es_fila_vacia(fila) -> bool:
    """Fila de la plantilla sin datos (a lo sumo el correlativo N°)."""
    return all(vacio(v) for v in fila[1:])


def encabezados_inesperados(fila, layout) -> list[str]:
    errores = []
    for i in range(max(len(fila), len(layout))):
        crudo = fila[i] if i < len(fila) else None
        esperado = layout[i][0] if i < len(layout) else ''
        if _clave(crudo) != esperado:
            errores.append(f'columna {i + 1}: {_visible(crudo)!r}')
    return errores


def fila_a_registro(fila, layout, formato, fecha_prod: date, invertir_venc: bool, fuente: str) -> dict:
    valores, notas = {}, []
    producto = lote_ = None
    for i, (_, destino) in enumerate(layout):
        v = fila[i] if i < len(fila) else None
        if destino in (None, '#', 'fecha') or vacio(v):
            continue
        if destino == 'producto':
            producto = producto_catalogo(v, formato)
            if producto is None:
                notas.append(f"Producto en el Excel: {_visible(v)!r} (sin correspondencia segura en el catálogo)")
        elif destino == 'lote':
            lote_ = lote(v)
        elif destino == 'obs':
            notas.append(_visible(v))
        else:
            if destino == 'vencimiento':
                x, etiqueta = vencimiento(v, invertir_venc), 'Fecha de vencimiento'
            else:
                normalizar, etiqueta = CAMPOS[destino]
                x = normalizar(v)
            if x is None:
                notas.append(f'{etiqueta} (Excel): {_visible(v)!r}')
            else:
                valores[destino] = x
    return {
        'formato': formato,
        'fecha': fecha_prod.isoformat(),
        'hora': None,
        'area': None,
        'producto': producto,
        'lote': lote_,
        'valores': valores,
        'observaciones': '; '.join(notas) or None,
        'accion_correctiva': None,
        'realizado_por': None,
        'fuente': fuente,
    }


# ───────────── Lectura de los Excel ─────────────

def _buscar(carpeta: Path, nombre: str):
    ruta = carpeta / nombre
    if ruta.exists():
        return ruta
    buscado = unicodedata.normalize('NFC', nombre)
    return next((p for p in carpeta.iterdir() if unicodedata.normalize('NFC', p.name) == buscado), None)


def _resumen_fila(fila) -> str:
    partes = [fecha(v).isoformat() if isinstance(v, datetime) else _visible(v) for v in fila if not vacio(v)]
    return ' | '.join(partes)[:160]


def _extraer_hoja(ws, archivo, formato, layout, hoy):
    registros, rechazos = [], []
    info = {'sin_destino': Counter(), 'productos_sin_mapear': Counter()}
    filas = list(ws.iter_rows(values_only=True))
    i_enc = next((i for i, f in enumerate(filas[:15]) if f and _clave(f[0]) == 'N°'), None)
    if i_enc is None:
        if any(not vacio(v) for f in filas for v in f):
            rechazos.append({'fuente': f'{archivo} › {ws.title}', 'motivo': 'hoja sin encabezado reconocible',
                             'contenido': ''})
        return registros, rechazos, info
    errores = encabezados_inesperados(filas[i_enc], layout)
    if errores:
        rechazos.append({'fuente': f'{archivo} › {ws.title}', 'motivo': 'encabezados distintos a la plantilla',
                         'contenido': '; '.join(errores)[:300]})
        return registros, rechazos, info

    datos = [(n, f) for n, f in enumerate(filas[i_enc + 1:], start=i_enc + 2) if not es_fila_vacia(f)]
    fechas = corregir_secuencia([f[1] for _, f in datos], hoy)
    i_prod = next(i for i, (_, d) in enumerate(layout) if d == 'producto')
    for (n, f), d in zip(datos, fechas):
        fuente = f'{archivo} › {ws.title} › fila {n}'
        if d is None:
            motivo = 'sin fecha de producción' if vacio(f[1]) else 'fecha de producción ilegible'
            rechazos.append({'fuente': fuente, 'motivo': motivo, 'contenido': _resumen_fila(f)})
            continue
        if not FECHA_MIN <= d <= hoy:
            rechazos.append({'fuente': fuente, 'motivo': 'fecha fuera de rango (2025-01-01 a hoy)',
                             'contenido': _resumen_fila(f)})
            continue
        r = fila_a_registro(f, layout, formato, d, invertir_vencimiento(f[1], d), fuente)
        registros.append(r)
        for i, ((_, destino), v) in enumerate(zip(layout, f)):
            if destino is None and not vacio(v):
                info['sin_destino'][_visible(filas[i_enc][i])] += 1
        if r['producto'] is None:
            info['productos_sin_mapear'][_visible(f[i_prod]) or '(vacío)'] += 1
    return registros, rechazos, info


def _extraer_archivo(carpeta: Path, archivo: str, formato: str, layout, hoy: date):
    ruta = _buscar(carpeta, archivo)
    if ruta is None:
        return [], [{'fuente': archivo, 'motivo': 'archivo no encontrado', 'contenido': str(carpeta)}], {}
    wb = load_workbook(ruta, read_only=True, data_only=True)
    try:
        registros, rechazos = [], []
        info = {'sin_destino': Counter(), 'productos_sin_mapear': Counter()}
        for ws in wb.worksheets:
            regs, rech, inf = _extraer_hoja(ws, archivo, formato, layout, hoy)
            registros += regs
            rechazos += rech
            for k in info:
                info[k] += inf[k]
    finally:
        wb.close()
    aceptados, repetidos = aplicar_unicidad(registros)
    return aceptados, rechazos + repetidos, info


_FUENTES = [(ARCHIVO_TRIGO, TRIGO, LAYOUT_TRIGO), (ARCHIVO_MAIZ, MAIZ, LAYOUT_MAIZ)]


def extraer(carpeta: Path, hoy: date) -> tuple[list[dict], list[dict]]:
    registros, rechazos = [], []
    for archivo, formato, layout in _FUENTES:
        regs, rech, _ = _extraer_archivo(Path(carpeta), archivo, formato, layout, hoy)
        registros += regs
        rechazos += rech
    return registros, rechazos


if __name__ == '__main__':
    import json
    import sys

    sys.stdout.reconfigure(encoding='utf-8')
    carpeta = Path(sys.argv[1])
    hoy = date.today()
    todos_rech = []
    for archivo, formato, layout in _FUENTES:
        regs, rech, info = _extraer_archivo(carpeta, archivo, formato, layout, hoy)
        todos_rech += rech
        fechas = sorted(r['fecha'] for r in regs)
        print(f'\n== {formato} ({archivo})')
        print(f'registros: {len(regs)}' + (f'  fechas: {fechas[0]} a {fechas[-1]}' if fechas else ''))
        print('por producto:', dict(Counter(r['producto'] or '(sin producto)' for r in regs)))
        print('productos sin correspondencia:', dict(info.get('productos_sin_mapear', {})))
        print('columnas sin destino con datos (filas):', dict(info.get('sin_destino', {})))
        venc_previo = [r['fuente'].rsplit('› ', 1)[-1] for r in regs
                       if r['valores'].get('vencimiento') and r['valores']['vencimiento'] <= r['fecha']]
        print(f'vencimiento anterior o igual a la producción: {len(venc_previo)} {venc_previo}')
        con_obs = [r['fuente'].rsplit('› ', 1)[-1] + ': ' + r['observaciones'] for r in regs if r['observaciones']]
        print(f'con observaciones: {len(con_obs)}', *con_obs, sep='\n  ')
        sin_lote = sum(1 for r in regs if not r['lote'])
        print(f'sin lote: {sin_lote}')
        if regs:
            print('muestra:', json.dumps(regs[0], ensure_ascii=False, indent=1))
    print('\n== rechazos por motivo:', dict(Counter(r['motivo'] for r in todos_rech)) or 'ninguno')
    for r in todos_rech:
        print(' ', r)
