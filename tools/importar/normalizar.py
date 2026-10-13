"""Normalizadores puros para los valores de los Excel de Calidad.

Cada función recibe una celda tal como la entrega openpyxl (str, int, float, datetime, time o None)
y devuelve el valor limpio que guarda la app, o None cuando la celda no trae un dato utilizable.
"""
import re
import unicodedata
from datetime import date, datetime, time

_VACIOS = {'', '-', '—', '–', 'na', 'n/a', 'n.a.', 'nd', 'n/d'}
_NUMERO = re.compile(r'-?\d+(?:\.\d+)?')
_FECHA_DMA = re.compile(r'^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$')
_FECHA_ISO = re.compile(r'^(\d{4})-(\d{2})-(\d{2})')
_HORA = re.compile(r'^(\d{1,2}):(\d{2})')
MESES = {m: i for i, m in enumerate(
    ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre',
     'noviembre', 'diciembre'], start=1)}
MESES['setiembre'] = 9

_POSITIVOS = {'correcta', 'correcto', 'conforme', 'bueno', 'buena', 'bien', 'ok', 'si', 'aceptable', 'cumple', 'c'}
_NEGATIVOS = {'incorrecta', 'incorrecto', 'no conforme', 'malo', 'mala', 'deficiente', 'rechazado', 'no cumple', 'nc'}


def sin_acentos(s: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


def vacio(v) -> bool:
    if v is None:
        return True
    return isinstance(v, str) and v.strip().lower() in _VACIOS


def texto(v):
    return None if vacio(v) else str(v).strip()


def numero(v):
    if vacio(v):
        return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    m = _NUMERO.search(str(v).replace(',', '.'))
    return float(m.group()) if m else None


def peso_kg(v):
    """Peso en kg. Acepta '484g', '0.912 kg' y gramos sin unidad (cualquier número mayor a 50)."""
    n = numero(v)
    if n is None:
        return None
    s = str(v).lower()
    if 'kg' in s:
        kg = n
    elif re.search(r'\d\s*g', s) or n > 50:
        kg = n / 1000
    else:
        kg = n
    return round(kg, 4)


def fecha(v):
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    if not isinstance(v, str):
        return None
    s = v.strip()
    m = _FECHA_DMA.match(s)
    if m:
        d, mes, a = (int(x) for x in m.groups())
        a = a + 2000 if a < 100 else a
        try:
            return date(a, mes, d)
        except ValueError:
            return None
    m = _FECHA_ISO.match(s)
    if m:
        try:
            return date(*(int(x) for x in m.groups()))
        except ValueError:
            return None
    return None


def _invertida(d: date):
    """El mismo día con día y mes intercambiados, si es una fecha distinta y válida."""
    return date(d.year, d.day, d.month) if d.day <= 12 and d.day != d.month else None


def fecha_con_mes(v, mes):
    """Fecha corregida con la columna 'Mes' de la hoja: invierte día y mes si así coincide."""
    d = fecha(v)
    if d is None:
        return None
    m = MESES.get(sin_acentos(str(mes or '')).strip().lower())
    if m is None or d.month == m:
        return d
    inv = _invertida(d)
    return inv if inv and inv.month == m else d


def corregir_secuencia(valores, hoy: date):
    """Resuelve fechas que Excel guardó con día y mes invertidos.

    Las fechas escritas como texto dd/mm/aaaa son exactas. Las que llegan como fecha de Excel con día
    menor o igual a 12 son ambiguas: se descarta la versión futura y se elige la más cercana a la
    fecha vecina ya resuelta (anterior o, si no hay, siguiente).
    """
    candidatos = []
    for v in valores:
        d = fecha(v)
        if d is None:
            candidatos.append(None)
        elif isinstance(v, str) or _invertida(d) is None:
            candidatos.append([d])
        else:
            candidatos.append([c for c in (d, _invertida(d)) if c <= hoy] or [d])
    res = [c[0] if c and len(c) == 1 else None for c in candidatos]
    for i, c in enumerate(candidatos):
        if not c or len(c) == 1:
            continue
        ref = next((res[j] for j in range(i - 1, -1, -1) if res[j]), None) \
            or next((res[j] for j in range(i + 1, len(res)) if res[j]), None)
        res[i] = min(c, key=lambda x: abs((x - ref).days)) if ref else c[0]
    return res


def conforme(v, opciones=('Conforme', 'No conforme')):
    if vacio(v):
        return None
    s = sin_acentos(str(v)).strip().lower()
    if s in _NEGATIVOS or s.startswith('no '):
        return opciones[1]
    if s in _POSITIVOS:
        return opciones[0]
    return None


def falla(v, escala: str):
    """Higiene: True si la celda indica falla. escala '1=cumple' (hojas viejas) o '0=cumple'."""
    n = numero(v)
    if n not in (0, 1):
        return None
    cumple = 1 if escala.startswith('1') else 0
    return int(n) != cumple


def lavado(v):
    """Lavado de manos: 0 = se lavó, 1 = no se lavó, guion o texto = no estaba (ausente)."""
    if v is None or (isinstance(v, str) and not v.strip()):
        return None
    n = None if isinstance(v, str) and v.strip() == '-' else numero(v)
    if n == 0:
        return 'lavo'
    if n == 1:
        return 'no'
    return 'ausente'


def hora(v):
    if isinstance(v, (time, datetime)):
        return f'{v.hour:02d}:{v.minute:02d}'
    if vacio(v):
        return None
    s = str(v).strip()
    m = _HORA.match(s)
    if not m:
        return None
    h = int(m.group(1))
    sufijo = re.sub(r'[\s.]', '', s[m.end():].lower())
    if sufijo.startswith('pm') and h < 12:
        h += 12
    elif sufijo.startswith('am') and h == 12:
        h = 0
    return f'{h:02d}:{m.group(2)}'
