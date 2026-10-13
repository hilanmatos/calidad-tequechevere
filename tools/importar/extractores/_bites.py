"""Helpers compartidos por los extractores de Almond Bites (L4) y Yuca Bites (L5).

Los lectores `leer_*` son estrictos: devuelven (valor, nota). Si la celda está vacía → (None, None); si trae un
dato interpretable → (valor, None); si trae texto que no se puede convertir sin adivinar → (None, texto), y ese
texto termina en las observaciones del registro. Así nada del Excel se pierde ni se inventa.
"""
import json
import sys
import re
from collections import Counter
from datetime import date, datetime, time

from catalogo import PRODUCTOS, clave_producto
from normalizar import conforme, corregir_secuencia, fecha, sin_acentos, vacio

INICIO = date(2025, 1, 1)

# '1.20 min' en el tiempo de fritura: False = minutos decimales (72 s); True = minutos.segundos (80 s).
# Pendiente de confirmar con Calidad (ver informe del importador).
# Operaciones (12/10/2026): '1.20 min' es 1 min 20 s
PUNTO_EN_MINUTOS_ES_MMSS = True

METALES = {'ausencia': 'Ausencia', 'presencia': 'Presencia'}
SENSORIAL = {'excelente': 'Excelente', 'bueno': 'Buena', 'buena': 'Buena', 'regular': 'Regular', 'malo': 'Mala',
             'mala': 'Mala',
             # Operaciones (12/10/2026): "Correcto"/"Adecuada" equivalen a Buena
             'correcto': 'Buena', 'correcta': 'Buena', 'adecuado': 'Buena', 'adecuada': 'Buena'}

_NUM = r'([-−]?\d+(?:[.,]\d+)?)'
_NUMERO = re.compile(_NUM + r'\s*(?:°\s*c|º\s*c|°|º|%|kg|gr|g)?\.?$')
_MINUTOS = re.compile(_NUM + r'\s*(min|mins|minuto|minutos)?\.?$')
_HORAS = re.compile(_NUM + r'\s*(h|hr|hrs|hora|horas)\.?$')
_SEGUNDOS = re.compile(_NUM + r'\s*(s|seg|segs|segundo|segundos)\.?$')
_PESO = re.compile(_NUM + r'\s*(kg|gr|g)?\.?$')
_LOTE = re.compile(r'^\[?\s*(?:P[A-Z]\d{3})?\s*\]?\s*\(?\s*(\d{4,6})\s*\)?$')
_UNIDADES = re.compile(r'(\d+)\s*(?:unidades|unidad|und|uds|u)\b')


# ───────────── utilidades de texto ─────────────
def texto_celda(v) -> str:
    """Representación legible de una celda para notas y rechazos."""
    if isinstance(v, datetime):
        return v.strftime('%d/%m/%Y')
    if isinstance(v, date):
        return v.strftime('%d/%m/%Y')
    if isinstance(v, time):
        return v.strftime('%H:%M:%S') if v.second else v.strftime('%H:%M')
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return re.sub(r'\s+', ' ', str(v)).strip()


def _limpio(v) -> str:
    return re.sub(r'\s+', ' ', str(v)).strip().lower()


def _float(s: str) -> float:
    return float(s.replace(',', '.').replace('−', '-'))


# ───────────── lectores ─────────────
def leer_numero(v, sufijos=()):
    """Número con unidad opcional (°C, %, g, kg). Rechaza textos ambiguos como '.2.8' o '22 pulgadas'."""
    if vacio(v):
        return None, None
    if isinstance(v, bool) or isinstance(v, (datetime, date, time)):
        return None, texto_celda(v)
    if isinstance(v, (int, float)):
        return float(v), None
    s = _limpio(v)
    for suf in sufijos:
        if s.endswith(suf):
            s = s[: -len(suf)].strip()
    m = _NUMERO.match(s)
    return (_float(m.group(1)), None) if m else (None, texto_celda(v))


def leer_minutos(v):
    """Duración en minutos: '28 min', '1 hora', 45, o una hora de Excel (h:mm = horas y minutos)."""
    if vacio(v):
        return None, None
    if isinstance(v, time):
        return round(v.hour * 60 + v.minute + v.second / 60, 2), None
    if isinstance(v, bool) or isinstance(v, (datetime, date)):
        return None, texto_celda(v)
    if isinstance(v, (int, float)):
        return float(v), None
    s = _limpio(v)
    m = _MINUTOS.match(s)
    if m:
        return _float(m.group(1)), None
    m = _HORAS.match(s)
    return (_float(m.group(1)) * 60, None) if m else (None, texto_celda(v))


def leer_segundos(v, punto_mmss=PUNTO_EN_MINUTOS_ES_MMSS):
    """Duración en segundos: '1 Minuto', '1.20 min', '45 s' o una hora de Excel (0:00:36).

    Un número sin unidad es ambiguo (¿minutos o segundos?) y va a nota."""
    if vacio(v):
        return None, None
    if isinstance(v, time):
        return float(v.hour * 3600 + v.minute * 60 + v.second), None
    if isinstance(v, (bool, int, float, datetime, date)):
        return None, texto_celda(v)
    s = _limpio(v)
    m = _SEGUNDOS.match(s)
    if m:
        return _float(m.group(1)), None
    m = _MINUTOS.match(s)
    if m and m.group(2):
        crudo = m.group(1).replace(',', '.')
        if punto_mmss and '.' in crudo:
            mins, segs = crudo.split('.')
            return float(int(mins) * 60 + int(segs)), None
        return round(_float(crudo) * 60, 1), None
    return None, texto_celda(v)


def leer_peso_kg(v):
    """Peso del empaque en kg. Sin unidad, un número mayor a 50 se toma como gramos (881 → 0.881)."""
    if vacio(v):
        return None, None
    if isinstance(v, bool) or isinstance(v, (datetime, date, time)):
        return None, texto_celda(v)
    if isinstance(v, (int, float)):
        n, unidad = float(v), None
    else:
        m = _PESO.match(_limpio(v))
        if not m:
            return None, texto_celda(v)
        n, unidad = _float(m.group(1)), m.group(2)
    if unidad == 'kg':
        kg = n
    elif unidad in ('g', 'gr') or n > 50:
        kg = n / 1000
    else:
        kg = n
    return round(kg, 4), None


def leer_conforme(v, opciones):
    """Campo conforme con las opciones del formato. Descripciones libres ('Masa húmeda') van a nota."""
    if vacio(v):
        return None, None
    r = conforme(v, tuple(opciones))
    return (r, None) if r else (None, texto_celda(v))


def leer_opcion(v, mapa: dict):
    if vacio(v):
        return None, None
    r = mapa.get(sin_acentos(_limpio(v)))
    return (r, None) if r else (None, texto_celda(v))


def lote_op(v):
    """Número de orden de producción: 'PK006(27114)' → '27114'. El código de Odoo del prefijo se descarta."""
    if vacio(v):
        return None, None
    if isinstance(v, (int, float)) and not isinstance(v, bool) and float(v).is_integer():
        return str(int(v)), None
    m = _LOTE.match(re.sub(r'\s+', ' ', str(v)).strip().upper())
    return (m.group(1), None) if m else (None, texto_celda(v))


def _ambigua(v, d: date) -> bool:
    """Fecha de Excel (no texto) que admite la lectura con día y mes invertidos."""
    return not isinstance(v, str) and d.day <= 12 and d.day != d.month


def vencimiento(v, fecha_prod, dias_tipicos=None):
    """Fecha de vencimiento 'YYYY-MM-DD'.

    El texto dd/mm/aaaa es exacto. Una fecha de Excel con día ≤ 12 puede venir con día y mes invertidos: se
    descarta la lectura anterior a la producción y, si quedan dos, gana la más cercana a la vida útil típica de
    la hoja (`dias_tipicos`); sin ese dato, la que conserva el día de producción. Si no hay forma de decidir, se
    respeta la lectura de Excel."""
    if vacio(v):
        return None, None
    d = fecha(v)
    if d is None:
        return None, texto_celda(v)
    if fecha_prod is None or not _ambigua(v, d):
        return d.isoformat(), None
    candidatos = [d, date(d.year, d.day, d.month)]
    validos = [c for c in candidatos if c >= fecha_prod] or candidatos
    if len(validos) == 1:
        return validos[0].isoformat(), None
    if dias_tipicos is not None:
        return min(validos, key=lambda c: abs((c - fecha_prod).days - dias_tipicos)).isoformat(), None
    mismo_dia = [c for c in validos if c.day == fecha_prod.day]
    return (mismo_dia[0] if len(mismo_dia) == 1 else d).isoformat(), None


def dias_tipicos_vencimiento(pares):
    """Mediana de días entre producción y vencimiento, solo con lecturas no ambiguas. pares: [(celda, fecha)]."""
    dias = []
    for v, f in pares:
        d = None if vacio(v) or f is None else fecha(v)
        if d is not None and not _ambigua(v, d) and d >= f:
            dias.append((d - f).days)
    if not dias:
        return None
    dias.sort()
    return dias[len(dias) // 2]


def presentacion(v):
    return None if vacio(v) else texto_celda(v)


def unidades(pres):
    """Unidades por empaque a partir del texto de presentación ('16 UNIDADES' → 16)."""
    if vacio(pres):
        return None
    m = _UNIDADES.search(sin_acentos(_limpio(pres)))
    return int(m.group(1)) if m else None


def _unidades_catalogo(texto: str) -> set[int]:
    return {int(n) for n in re.findall(r'x\s*(\d+)', texto.lower())}


def resolver_producto(nombre, pres, formato: str, reglas):
    """Clave del catálogo para el nombre del Excel, o None si no corresponde con certeza.

    `reglas`: [(palabras que deben aparecer, nombre del catálogo)]. Debe coincidir exactamente una regla y la
    presentación (si viene) debe existir para ese producto en el catálogo."""
    if vacio(nombre):
        return None
    k = sin_acentos(_limpio(nombre))
    elegidos = [prod for palabras, prod in reglas if all(p in k for p in palabras)]
    if len(elegidos) != 1:
        return None
    fila = next((p for p in PRODUCTOS if p[0] == formato and p[2] == elegidos[0]), None)
    if fila is None:
        return None
    n = unidades(pres)
    if n is not None and n not in _unidades_catalogo(fila[3]):
        return None
    return clave_producto(fila[1], fila[2])


# ───────────── filas → registros ─────────────
def _ref(fuente: str) -> str:
    """'archivo › hoja › fila 5' → 'hoja › fila 5'."""
    return ' › '.join(fuente.split(' › ')[1:]) or fuente


def contenido(fila, largo=160) -> str:
    s = ' | '.join(texto_celda(v) for v in fila if not vacio(v))
    return s if len(s) <= largo else s[: largo - 1] + '…'


def rechazo(fuente, motivo, fila, detalle=None):
    texto = contenido(fila)
    return {'fuente': fuente, 'motivo': motivo, 'contenido': f'{detalle} | {texto}' if detalle else texto}


def _leer(tipo, v, fecha_prod, dias_venc=None):
    if tipo == 'num':
        return leer_numero(v)
    if isinstance(tipo, tuple) and tipo[0] == 'num':
        return leer_numero(v, sufijos=tipo[1])
    if isinstance(tipo, tuple) and tipo[0] == 'conf':
        return leer_conforme(v, tipo[1])
    lector = {
        'min': leer_minutos,
        'seg': leer_segundos,
        'kg': leer_peso_kg,
        'metal': lambda x: leer_opcion(x, METALES),
        'sens': lambda x: leer_opcion(x, SENSORIAL),
        'lote': lote_op,
        'venc': lambda x: vencimiento(x, fecha_prod, dias_venc),
        'pres': lambda x: (presentacion(x), None),
    }[tipo]
    return lector(v)


def procesar_filas(filas, archivo, hoja, formato, columnas, reglas, hoy, col_fecha=1, col_producto=2):
    """Convierte filas de una hoja de control de calidad en registros.

    `filas`: [(número de fila, tupla de celdas)] solo con filas que traen datos.
    `columnas`: [(columna 1-based, campo id | None, tipo, etiqueta para notas)]. Tipos: 'num', ('num', sufijos),
    'min', 'seg', 'kg', ('conf', opciones), 'metal', 'sens', 'pres', 'lote', 'venc', 'obs', 'ignorar'.
    Las columnas sin especificar que traigan algo se copian tal cual a observaciones."""
    spec = {c[0]: c for c in columnas}
    col_pres = next((c[0] for c in columnas if c[2] == 'pres'), None)
    celda = lambda fila, col: fila[col - 1] if col and col <= len(fila) else None  # noqa: E731
    col_venc = next((c[0] for c in columnas if c[2] == 'venc'), None)
    fechas = corregir_secuencia([celda(f, col_fecha) for _, f in filas], hoy)
    dias_venc = dias_tipicos_vencimiento([(celda(fila, col_venc), f) for (_, fila), f in zip(filas, fechas)])
    registros, rechazos = [], []
    for (n, fila), f in zip(filas, fechas):
        fuente = f'{archivo} › {hoja} › fila {n}'
        if f is None:
            rechazos.append(rechazo(fuente, 'fecha ilegible', fila))
            continue
        if not INICIO <= f <= hoy:
            rechazos.append(rechazo(fuente, 'fecha fuera de rango (2025-01-01 a hoy)', fila))
            continue
        valores, notas, lote = {}, [], None
        for col in range(1, len(fila) + 1):
            if col in (col_fecha, col_producto):
                continue
            v = fila[col - 1]
            if col not in spec:
                if not vacio(v):
                    notas.append(texto_celda(v))
                continue
            _, campo, tipo, etiqueta = spec[col]
            if tipo == 'ignorar':
                continue
            if tipo == 'obs':
                if not vacio(v):
                    notas.append(f'{etiqueta}: {texto_celda(v)}' if etiqueta else texto_celda(v))
                continue
            valor, nota = _leer(tipo, v, f, dias_venc)
            if nota is not None:
                notas.append(f'{etiqueta}: {nota}')
            if valor is None:
                continue
            if tipo == 'lote':
                lote = valor
            else:
                valores[campo] = valor
        registros.append({
            'formato': formato,
            'fecha': f.isoformat(),
            'hora': None,
            'area': None,
            'producto': resolver_producto(celda(fila, col_producto), celda(fila, col_pres), formato, reglas),
            'lote': lote,
            'valores': valores,
            'observaciones': '; '.join(notas) or None,
            'accion_correctiva': None,
            'realizado_por': None,
            'fuente': fuente,
        })
    return registros, rechazos


def _encabezado(v) -> str:
    return re.sub(r'\s+', ' ', sin_acentos(str(v or ''))).strip().upper()


def verificar_encabezados(ws, fila: int, esperados: dict):
    """Falla con un mensaje claro si la hoja cambió de diseño (columnas movidas o renombradas)."""
    celdas = next(ws.iter_rows(min_row=fila, max_row=fila, values_only=True), ())
    for col, esperado in esperados.items():
        real = celdas[col - 1] if col <= len(celdas) else None
        if _encabezado(real) != _encabezado(esperado):
            raise ValueError(f'{ws.title}: la columna {col} de la fila {fila} dice {real!r}, '
                             f'se esperaba {esperado!r}. Revisar el mapeo del extractor.')


def filas_con_datos(ws, fila_inicio, ignorar_cols=()):
    """[(número de fila, celdas)] desde `fila_inicio`, saltando filas vacías (o con datos solo en `ignorar_cols`)."""
    res = []
    for n, fila in enumerate(ws.iter_rows(min_row=fila_inicio, values_only=True), start=fila_inicio):
        if any(not vacio(v) for i, v in enumerate(fila, start=1) if i not in ignorar_cols):
            res.append((n, tuple(fila)))
    return res


# ───────────── unicidad por lote ─────────────
def clave_lote(lote) -> str | None:
    """Igual que claveUnica() de la app: sin espacios y en mayúsculas."""
    if not lote:
        return None
    return re.sub(r'\s+', '', lote).upper() or None


DUPLICADO_EXACTO = 'duplicado exacto (mismo lote y mismos datos que otra fila)'
LOTE_REPETIDO = 'lote repetido con otros datos (revisar cuál es el correcto)'


def _comparable(r):
    return r['fecha'], r['producto'], r['valores'], r['observaciones']


def aplicar_unicidad_lote(registros):
    """unicidad 'lote': un registro por número de lote. El primero (en orden de la hoja) se queda; los demás se
    rechazan como duplicado exacto (mismos datos) o como lote repetido (otros datos: hay que revisar)."""
    vistos, quedan, rechazos = {}, [], []
    for r in registros:
        k = clave_lote(r['lote'])
        if k is None:
            quedan.append(r)
            continue
        if k not in vistos:
            vistos[k] = r
            quedan.append(r)
            continue
        previo = vistos[k]
        esta = f'esta fila: fecha {r["fecha"]}, producto {r["producto"]}, lote {r["lote"]}'
        if _comparable(previo) == _comparable(r):
            motivo = DUPLICADO_EXACTO
            detalle = f'igual a {_ref(previo["fuente"])} | {esta}'
        else:
            motivo = LOTE_REPETIDO
            detalle = f'el lote {k} ya está en {_ref(previo["fuente"])} (fecha {previo["fecha"]}) | {esta}'
        rechazos.append({'fuente': r['fuente'], 'motivo': motivo, 'contenido': detalle})
    return quedan, rechazos


# ───────────── resumen para __main__ ─────────────
def imprimir_resumen(registros, rechazos):
    sys.stdout.reconfigure(encoding='utf-8')
    print('Registros por formato:')
    for formato, n in sorted(Counter(r['formato'] for r in registros).items()):
        fechas = sorted(r['fecha'] for r in registros if r['formato'] == formato)
        print(f'  {formato}: {n}  ({fechas[0]} a {fechas[-1]})')
    print(f'Rechazos: {len(rechazos)}')
    for motivo, n in Counter(x['motivo'].split(' (')[0] for x in rechazos).most_common():
        print(f'  {n:3d}  {motivo}')
    print('Muestras:')
    for r in registros[:2]:
        print(json.dumps(r, ensure_ascii=False, indent=2))
