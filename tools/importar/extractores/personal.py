"""Extractor de la familia personal: `higiene-uniforme` y `lavado-manos`.

HIGIENE Y UNIFORME (archivo de revisión de higiene). Una fila del Excel = un operario en una fecha. El registro de la
app es uno por (fecha, área) con todos los operarios de ese día: {'revision': {nombre: {columna: estado}}}.

    Hoja           Período                 Escala      Formato
    'Gluten Free'  15/09/2025–05/02/2026   1 = cumple  anterior: 8 criterios, "Cabello, barba" en una sola columna
    'Tequeños'     15/09/2025–05/02/2026   1 = cumple  anterior
    'GF FEB.'      02/02–27/02/2026        0 = cumple  anterior; la fecha va solo en la primera fila de cada bloque
    'TQ FEB.'      02/02–27/02/2026        0 = cumple  anterior; ídem
    'GF ', 'TQ '   02/03–28/09/2026        0 = cumple  10 criterios con Mes y Área; 'Cabello cubierto' y 'Zapatos'
                                                       se llenan desde el 01/08/2026: antes, la columna 'Barba' es el
                                                       criterio combinado anterior (así lo usa la hoja 'TOTAL ')
    'Planta Alta'  21/07–28/09/2026        0 = cumple  igual que 'TQ ' (Diego y Dayanna; se suma a 'TQ ')
    'Tienda'       27/07–28/09/2026        excluida
    'TOTAL ', 'RESULTADOS', 'DATOS', 'cálculo': resúmenes, no se importan.

  La escala se comprueba con los datos de cada hoja (el estado "cumple" es la gran mayoría de las celdas; en las hojas
  nuevas la columna TOTAL suma los 1). Si no coincide con la esperada, la hoja no se importa.

  Solapamientos: 'Gluten Free'/'Tequeños' repiten del 02/02 al 05/02/2026 los días que también están en 'GF FEB.' y
  'TQ FEB.' (y no coinciden: las hojas FEB. registran fallas que las viejas marcan como cumple). Por cada fecha y área
  se usa la hoja más reciente de la serie (prioridad: GF/TQ/Planta Alta > FEB. > viejas). 'TQ ' y 'Planta Alta' son
  del mismo período y del mismo área de la app con operarios distintos: se combinan.

LAVADO DE MANOS (Hoja2; Hoja1 es la plantilla vacía). Bloques semanales: una fila con fecha de inicio (lunes) y de fin
  (viernes o sábado), el encabezado 'N° | Nombre | horarios' y una fila por operario. Cada día ocupa las columnas que
  empiezan en 06:30 (06:30, 09:30, 12:30, 02:30 = 14:30; el sábado, media jornada, sin 14:30). La fecha de cada día es
  el lunes de la semana más el número de día; la fecha de fin solo sirve para deducir el lunes si el inicio no lo es
  (hay un fin mal escrito: 08/06–13/05/2026). El área sale del catálogo vigente o, para quien ya no está, de las hojas
  de higiene en la fecha más cercana (±30 días).
"""
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta
from pathlib import Path

from openpyxl import load_workbook

from normalizar import corregir_secuencia, falla, fecha, fecha_con_mes, hora, lavado, MESES, numero, sin_acentos, texto
from operarios import VIGENTES, area_de, canonico

ARCHIVO_HIGIENE = ('Formato de revisón de higiene y Uniforme de operaciones '
                   '(Copia en conflicto de TEQUE CHEVERE PTY 2026-10-05).xlsx')
ARCHIVO_LAVADO = 'Lavado de Manos Transistmica.xlsx'

FORMATOS = ['higiene-uniforme', 'lavado-manos']
ARCHIVOS = [ARCHIVO_HIGIENE, ARCHIVO_LAVADO]

DESDE = date(2025, 1, 1)
TIENDA = 'Tienda'
MOTIVO_TIENDA = 'Tienda: excluida por decisión de Operaciones'
OPERARIOS_TIENDA = {'Bleisy', 'Luis', 'María'}

# hoja → (área por defecto, escala esperada, prioridad: por cada fecha y área gana la hoja de mayor prioridad)
HOJAS_HIGIENE = {
    'Planta Alta': ('Planta Alta', '0=cumple', 2),
    'TQ ': ('Planta Alta', '0=cumple', 2),
    'GF ': ('Gluten Free', '0=cumple', 2),
    'Tienda': (TIENDA, '0=cumple', 2),
    'GF FEB.': ('Gluten Free', '0=cumple', 1),
    'TQ FEB.': ('Planta Alta', '0=cumple', 1),
    'Gluten Free': ('Gluten Free', '1=cumple', 0),
    'Tequeños': ('Planta Alta', '1=cumple', 0),
}
RESUMENES = {'TOTAL ', 'RESULTADOS', 'DATOS', 'cálculo'}

# Criterios que el formato del Excel no tenía (zapatos en el formato anterior): None = no se envían y el motor los
# completa con 'cumple'. Con 'na' se verían como "No aplica" (ver informe).
SIN_COLUMNA = 'na'
NOTA_FORMATO_ANTERIOR = ('Excel con el formato anterior: cabello y barba eran un solo criterio y no se evaluaban '
                         'zapatos.')

_BARBA = ('barba', 'bigote')
_CABELLO = ('cabello', 'pelo', 'redecilla', 'gorro', 'cofia', 'malla')
_HORARIOS = {'06:30': 'h0630', '09:30': 'h0930', '12:30': 'h1230', '02:30': 'h1430', '14:30': 'h1430'}
_ETIQUETA_HORARIO = {'h0630': '06:30', 'h0930': '09:30', 'h1230': '12:30', 'h1430': '14:30'}
_DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']


# ---------------------------------------------------------------- helpers puros

def _norm(s) -> str:
    return re.sub(r'\s+', ' ', sin_acentos(str(s)).lower()).strip()


def area_app(v):
    """Área de la app para el texto de la columna Área o el nombre de la hoja ('TEQUEÑOS' → 'Planta Alta')."""
    if v is None:
        return None
    s = _norm(v)
    if s in ('tequenos', 'tq', 'planta alta'):
        return 'Planta Alta'
    if s in ('gluten free', 'gf'):
        return 'Gluten Free'
    if s == 'tienda':
        return TIENDA
    return None


def columnas_de(encabezado):
    """Columnas de la app que cubre un encabezado de criterio del Excel; None si no es un criterio."""
    if encabezado is None:
        return None
    s = _norm(encabezado)
    if 'total' in s or 'observ' in s:
        return None
    if s.startswith('estado de salud'):
        return ('salud',)
    if 'manos' in s:
        return ('manos',)
    if 'cabello' in s and 'barba' in s:
        return ('cabello', 'barba')
    for clave, col in (('cabello', 'cabello'), ('barba', 'barba'), ('mascar', 'mascarilla'), ('delantal', 'delantal'),
                       ('zapato', 'zapatos'), ('maquillaje', 'maquillaje'), ('accesorios', 'accesorios'),
                       ('uniforme', 'uniforme')):
        if clave in s:
            return (col,)
    return None


def _cero_uno(v):
    """0 o 1 si la celda es exactamente eso (tolera un acento suelto: '0´'); None en otro caso."""
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return int(v) if v in (0, 1) else None
    if isinstance(v, str):
        m = re.fullmatch(r"([01])[´`'’]?", v.strip())
        return int(m.group(1)) if m else None
    return None


def estado_higiene(v, escala: str):
    """'cumple' | 'falla' | 'na' | '-' (no evaluado) | 'ilegible' | None (celda vacía)."""
    if v is None or (isinstance(v, str) and not v.strip()):
        return None
    if isinstance(v, str):
        s = v.strip().lower().replace('.', '')
        if s in ('na', 'n/a'):
            return 'na'
        if s == '-':
            return '-'
    n = _cero_uno(v)
    if n is None:
        return 'ilegible'
    return 'falla' if falla(n, escala) else 'cumple'


def detectar_escala(valores):
    """Escala de una hoja según sus datos: el valor que domina (≥ 70 % de los 0/1) es "cumple"."""
    c = Counter(n for n in map(_cero_uno, valores) if n is not None)
    total = c[0] + c[1]
    if not total:
        return None
    if c[1] / total >= 0.7:
        return '1=cumple'
    if c[0] / total >= 0.7:
        return '0=cumple'
    return None


def repartir_combinado(estado: str, obs):
    """Reparte el criterio anterior "Cabello, barba completamente cubierto" en las columnas cabello y barba.

    Una falla se atribuye según la observación del Excel (barba/bigote → barba; cabello/redecilla/gorro… → cabello);
    sin pista va a cabello, que aplica a todo el personal, y barba no se envía."""
    if estado != 'falla':
        return {'cabello': estado, 'barba': estado}
    o = _norm(obs or '')
    b = any(k in o for k in _BARBA)
    c = any(k in o for k in _CABELLO)
    if b and c:
        return {'cabello': 'falla', 'barba': 'falla'}
    if b:
        return {'cabello': 'cumple', 'barba': 'falla'}
    if c:
        return {'cabello': 'falla', 'barba': 'cumple'}
    return {'cabello': 'falla'}


def evaluar_fila(celdas, escala: str, obs):
    """Fila de higiene → (valor del checklist para ese operario | None, [(columna, valor ilegible)]).

    celdas: [(columnas de la app, valor de la celda)]. Todo guiones = no asistió; un guion suelto = no aplica;
    celda vacía = no se envía."""
    estados, ilegibles = [], []
    for cols, v in celdas:
        e = estado_higiene(v, escala)
        if e == 'ilegible':
            ilegibles.append(('/'.join(cols), v))
        elif e is not None:
            estados.append((cols, e))
    if not estados:
        return None, ilegibles
    if all(e == '-' for _, e in estados):
        fila = {'_ausente': 'si'}
    else:
        fila = {}
        for cols, e in estados:
            e = 'na' if e == '-' else e
            if len(cols) == 2:
                fila.update(repartir_combinado(e, obs))
            else:
                fila[cols[0]] = e
        if SIN_COLUMNA:
            # Criterio sin columna en esa hoja, celda vacía o barba sin atribuir: no se evaluó. Se envía 'na'
            # para que el motor no lo complete con 'cumple'.
            for c in ('salud', 'manos', 'cabello', 'barba', 'mascarilla', 'uniforme', 'zapatos', 'delantal',
                      'maquillaje', 'accesorios'):
                fila.setdefault(c, SIN_COLUMNA)
    o = texto(obs)
    if o:
        fila['_obs'] = o
    return fila, ilegibles


def rellenar_fechas(filas):
    """[(celda Fecha, es fila de operario)] → fecha de cada fila. Una fila de operario sin fecha hereda la de la
    fila de operario inmediatamente anterior (hojas FEB.: la fecha va solo en la primera fila del bloque)."""
    res, ultimo, previo = [], None, False
    for v, es_operario in filas:
        if not es_operario:
            res.append(None)
            previo = False
            continue
        if v is None and previo:
            v = ultimo
        res.append(v)
        ultimo, previo = v, True
    return res


def corregir_arrastre(fechas):
    """Deshace el autorrelleno de Excel que sube el año fila a fila (15/11/2025, 15/11/2026, 15/11/2027…):
    tres o más fechas seguidas con el mismo día y mes y años consecutivos toman la primera."""
    res = list(fechas)
    i = 0
    while i < len(res):
        if res[i] is None:
            i += 1
            continue
        j = i
        while (j + 1 < len(res) and res[j + 1] is not None and (res[j + 1].month, res[j + 1].day) ==
               (res[i].month, res[i].day) and res[j + 1].year == res[j].year + 1):
            j += 1
        if j - i >= 2:
            for k in range(i + 1, j + 1):
                res[k] = res[i]
        i = j + 1
    return res


def fuera_de_secuencia(fechas):
    """Índices de fechas que rompen el orden cronológico de la hoja (las hojas se llenan día a día, en orden).

    Las filas seguidas con la misma fecha forman un día; se busca la secuencia no decreciente con más días y, a igual
    cantidad, la que conserva los días que aparecen primero. Se marcan las filas de los días que quedan fuera."""
    dias = []
    for i, f in enumerate(fechas):
        if f is None:
            continue
        if dias and dias[-1][0] == f:
            dias[-1][1].append(i)
        else:
            dias.append((f, [i]))
    if all(dias[k][0] <= dias[k + 1][0] for k in range(len(dias) - 1)):
        return set()

    def preferencia(cadena):
        return len(cadena), [-k for k in cadena]

    mejor = []
    for k, (f, _) in enumerate(dias):
        previa = max((mejor[j] for j in range(k) if dias[j][0] <= f), key=preferencia, default=())
        mejor.append(previa + (k,))
    quedan = set(max(mejor, key=preferencia))
    return {i for k, (_, filas) in enumerate(dias) if k not in quedan for i in filas}


def bloques_repetidos(secuencia):
    """Filas de bloques que repiten una fecha ya usada en la hoja (bloque copiado sin cambiar la fecha).

    secuencia: fecha de cada fila de la hoja, en orden (None = fila separadora o sin fecha válida). Un bloque es una
    tanda de filas seguidas con la misma fecha."""
    vistas, marcadas, actual, repetido = set(), set(), None, False
    for i, f in enumerate(secuencia):
        if f is None:
            actual = None
            continue
        if f != actual:
            repetido = f in vistas
            vistas.add(f)
            actual = f
        if repetido:
            marcadas.add(i)
    return marcadas


def lunes_de_bloque(ini, fin):
    """Lunes de una semana de lavado: el inicio si es lunes; si no, el lunes de la fecha de fin (viernes o sábado)."""
    if ini is not None and ini.weekday() == 0:
        return ini
    if fin is not None and fin.weekday() in (4, 5):
        return fin - timedelta(days=fin.weekday())
    return None


def columnas_lavado(fila):
    """Encabezado 'N° | Nombre | 06:30 09:30 12:30 02:30 …' → [(índice de columna, día 0–5, id de columna)]."""
    res, dia = [], -1
    for j, v in enumerate(fila):
        col = _HORARIOS.get(hora(v)) if isinstance(v, (time, datetime, str)) else None
        if col is None:
            continue
        if col == 'h0630':
            dia += 1
        if dia >= 0:
            res.append((j, dia, col))
    return res


def estado_lavado(v):
    """'lavo' | 'no' | 'ausente' (guion o letras: vacaciones, enfermo) | 'ilegible' | None (vacía)."""
    if isinstance(v, (int, float)) and not isinstance(v, bool) and v not in (0, 1):
        return 'ilegible'
    if isinstance(v, str):
        s = v.strip()
        if s and s != '-' and not s.isalpha() and numero(s) not in (0, 1):
            return 'ilegible'
    return lavado(v)


def _enumerar(cosas):
    return cosas[0] if len(cosas) == 1 else f'{", ".join(cosas[:-1])} y {cosas[-1]}'


def dia_lavado(celdas):
    """Celdas de un operario en un día ({id de columna: valor}) → (valor del checklist | None, [(col, ilegible)])."""
    fila, ausentes, ilegibles = {}, [], []
    for col, v in celdas.items():
        e = estado_lavado(v)
        if e in ('lavo', 'no'):
            fila[col] = e
        elif e == 'ausente':
            ausentes.append(col)
        elif e == 'ilegible':
            ilegibles.append((col, v))
    if not fila:
        return ({'_ausente': 'si'} if ausentes else None), ilegibles
    if ausentes:
        fila['_obs'] = 'No estaba a las ' + _enumerar([_ETIQUETA_HORARIO[c] for c in ausentes])
    return fila, ilegibles


def area_cercana(apariciones, dia: date, max_dias: int = 30):
    """Área de la aparición en higiene más cercana a `dia` (si está a ≤ max_dias y no hay empate entre áreas)."""
    if not apariciones:
        return None
    d = min(abs((f - dia).days) for f, _ in apariciones)
    if d > max_dias:
        return None
    areas = {a for f, a in apariciones if abs((f - dia).days) == d}
    return areas.pop() if len(areas) == 1 else None


# ---------------------------------------------------------------- lectura

def _corto(v) -> str:
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, time):
        return v.strftime('%H:%M')
    return str(v).strip()


def _contenido(valores, n=160) -> str:
    return ' | '.join(_corto(v) for v in valores if v is not None and str(v).strip())[:n]


def _fuente(archivo, hoja, filas) -> str:
    filas = sorted(set(filas))
    rango = f'fila {filas[0]}' if len(filas) == 1 else f'filas {filas[0]}–{filas[-1]}'
    return f'{archivo} › {hoja} › {rango}'


def _rechazo(archivo, hoja, fila, motivo, contenido=''):
    return {'fuente': _fuente(archivo, hoja, [fila]), 'motivo': motivo, 'contenido': contenido}


def _fallas(valor) -> int:
    return sum(1 for e in valor.values() if e == 'falla')


def _celda(r, j):
    return r[j] if j is not None and j < len(r) else None


def _leer_hoja_higiene(ws, hoja, hoy, rechazos, nombres):
    """Filas válidas de una hoja de higiene: dicts con hoja, fila, fecha, area, nombre, valor, anterior."""
    area_def, escala_esperada, prioridad = HOJAS_HIGIENE[hoja]
    rows = list(ws.iter_rows(min_row=1, min_col=1, values_only=True))
    hi = next((i for i, r in enumerate(rows) if any(v is not None and _norm(v) == 'operarios' for v in r)), None)
    if hi is None:
        rechazos.append(_rechazo(ARCHIVO_HIGIENE, hoja, 1, 'hoja sin encabezado reconocible'))
        return []
    pos = {}
    for j, h in enumerate(rows[hi]):
        s = _norm(h) if h is not None else ''
        clave = {'fecha': 'fecha', 'mes': 'mes', 'area': 'area', 'operarios': 'op'}.get(s)
        if clave:
            pos[clave] = j
        elif 'observ' in s and 'total' not in s:
            pos['obs'] = j
    criterios = [(j, columnas_de(h)) for j, h in enumerate(rows[hi]) if columnas_de(h)]
    j_de = {c: j for j, c in criterios}
    j_cab, j_zap, j_bar = j_de.get(('cabello',)), j_de.get(('zapatos',)), j_de.get(('barba',))
    anterior_hoja = ('cabello', 'barba') in j_de

    filas = [(hi + 2 + k, r) for k, r in enumerate(rows[hi + 1:])]
    es_op = [texto(_celda(r, pos['op'])) is not None for _, r in filas]
    for (_, r), op in zip(filas, es_op):
        if op:
            crudo = re.sub(r'\s+', ' ', str(_celda(r, pos['op']))).strip()
            nombres[crudo] = canonico(crudo)

    # Escala comprobada con los datos de la hoja
    escala = detectar_escala([_celda(r, j) for (_, r), op in zip(filas, es_op) if op for j, _ in criterios])
    if escala != escala_esperada:
        rechazos.append(_rechazo(ARCHIVO_HIGIENE, hoja, hi + 1, 'escala no confirmada con los datos: hoja no importada',
                                 f'esperada {escala_esperada}, detectada {escala}'))
        return []

    # Filas sin operario: solo se reportan si traen algo que se pierde
    for (n, r), op in zip(filas, es_op):
        if op:
            continue
        obs = texto(_celda(r, pos.get('obs')))
        notas = [_celda(r, j) for j, _ in criterios if _cero_uno(_celda(r, j)) is not None]
        if notas and _celda(r, pos['fecha']) is not None:
            rechazos.append(_rechazo(ARCHIVO_HIGIENE, hoja, n, 'fila con valores pero sin operario', _contenido(r)))
        elif obs:
            rechazos.append(_rechazo(ARCHIVO_HIGIENE, hoja, n, 'observación suelta sin operario ni fecha', obs))

    # Fechas: herencia dentro del bloque, día/mes invertidos (Mes y secuencia), arrastre de año, rango y orden
    crudas = rellenar_fechas([(_celda(r, pos['fecha']), op) for (_, r), op in zip(filas, es_op)])
    ops = [(n, r, c) for (n, r), op, c in zip(filas, es_op, crudas) if op]
    sec = corregir_secuencia([c for _, _, c in ops], hoy)
    fechas = []
    for (n, r, cruda), s in zip(ops, sec):
        mes = MESES.get(_norm(_celda(r, pos.get('mes')) or ''))
        cm = fecha_con_mes(cruda, _celda(r, pos.get('mes'))) if mes else None
        fechas.append(cm if cm and cm.month == mes else s)
    fechas = corregir_arrastre(fechas)
    for k, ((n, r, cruda), f) in enumerate(zip(ops, fechas)):
        if f is None:
            motivo = 'fila sin fecha' if cruda is None else 'fecha ilegible'
            rechazos.append(_rechazo(ARCHIVO_HIGIENE, hoja, n, motivo, _contenido(r)))
        elif not DESDE <= f <= hoy:
            rechazos.append(_rechazo(ARCHIVO_HIGIENE, hoja, n, 'fecha fuera de rango', f'{f} · {_contenido(r)}'))
            fechas[k] = None
    for k in sorted(fuera_de_secuencia(fechas)):
        n, r, _ = ops[k]
        rechazos.append(_rechazo(ARCHIVO_HIGIENE, hoja, n, 'fecha fuera de secuencia en la hoja (revisar: mal escrita)',
                                 f'{fechas[k]} · {_contenido(r)}'))
        fechas[k] = None
    # Un bloque separado que repite una fecha ya usada en la hoja (hojas FEB.: 27/02 dos veces) se descarta entero.
    fecha_de = {n: f for (n, _, _), f in zip(ops, fechas)}
    secuencia = [fecha_de.get(n) for n, _ in filas]
    primera = {}
    for (n, _), f in zip(filas, secuencia):
        primera.setdefault(f, n)
    repetidas = {filas[i][0] for i in bloques_repetidos(secuencia)}
    for k, (n, r, _) in enumerate(ops):
        if n in repetidas:
            rechazos.append(_rechazo(ARCHIVO_HIGIENE, hoja, n,
                                     'fecha repetida en la hoja: bloque con la misma fecha que otro anterior',
                                     f'{fechas[k]} ya está desde la fila {primera[fechas[k]]} · {_contenido(r)}'))
            fechas[k] = None

    res = []
    tienda_vistas = set()
    for (n, r, _), f in zip(ops, fechas):
        if f is None:
            continue
        nombre = canonico(_celda(r, pos['op']))
        area = area_app(_celda(r, pos.get('area'))) if _celda(r, pos.get('area')) is not None else area_def
        if area is None:
            rechazos.append(_rechazo(ARCHIVO_HIGIENE, hoja, n, 'área desconocida', _contenido(r)))
            continue
        if area == TIENDA or nombre in OPERARIOS_TIENDA:
            if (f, area) not in tienda_vistas:
                tienda_vistas.add((f, area))
                rechazos.append(_rechazo(ARCHIVO_HIGIENE, hoja, n, MOTIVO_TIENDA, f'{f} · {nombre}'))
            continue
        # Antes del 01/08/2026 las hojas nuevas dejaban vacíos 'Cabello cubierto' y 'Zapatos' y usaban la columna
        # 'Barba' como el criterio combinado anterior.
        combinado = (j_cab is not None and j_bar is not None and _celda(r, j_cab) is None
                     and (j_zap is None or _celda(r, j_zap) is None) and _celda(r, j_bar) is not None)
        celdas = []
        for j, cols in criterios:
            if combinado and cols == ('cabello',) or combinado and cols == ('zapatos',):
                continue
            celdas.append((('cabello', 'barba') if combinado and cols == ('barba',) else cols, _celda(r, j)))
        obs = _celda(r, pos.get('obs'))
        valor, ilegibles = evaluar_fila(celdas, escala, obs)
        if valor is None:
            motivo = 'fila sin valores legibles' if ilegibles else 'operario sin evaluación'
            rechazos.append(_rechazo(ARCHIVO_HIGIENE, hoja, n, motivo, f'{f} · {_contenido(r)}'))
            continue
        for col, v in ilegibles:
            rechazos.append(_rechazo(ARCHIVO_HIGIENE, hoja, n, 'valor no interpretable (se importó el resto de la fila)',
                                     f'{f} · {nombre} · {col} = {v!r}'))
        res.append({'hoja': hoja, 'fila': n, 'fecha': f, 'area': area, 'nombre': nombre, 'valor': valor,
                    'anterior': anterior_hoja or combinado, 'prioridad': prioridad, 'contenido': _contenido(r)})
    return res


def _higiene(carpeta: Path, hoy: date):
    rechazos, nombres = [], {}
    wb = load_workbook(carpeta / ARCHIVO_HIGIENE, read_only=True, data_only=True)
    filas = []
    for hoja in wb.sheetnames:
        if hoja in RESUMENES:
            continue
        if hoja not in HOJAS_HIGIENE:
            rechazos.append(_rechazo(ARCHIVO_HIGIENE, hoja, 1, 'hoja no reconocida: no se importa'))
            continue
        filas += _leer_hoja_higiene(wb[hoja], hoja, hoy, rechazos, nombres)
    wb.close()
    orden = {h: k for k, h in enumerate(HOJAS_HIGIENE)}
    filas.sort(key=lambda x: (orden[x['hoja']], x['fila']))

    # 1. Por fecha y área, gana la hoja más reciente de la serie; las demás se descartan (un rechazo por hoja y fecha).
    mejor = defaultdict(int)
    for x in filas:
        mejor[(x['fecha'], x['area'])] = max(mejor[(x['fecha'], x['area'])], x['prioridad'])
    perdedoras = defaultdict(list)
    for x in filas:
        if x['prioridad'] < mejor[(x['fecha'], x['area'])]:
            perdedoras[(x['hoja'], x['fecha'], x['area'])].append(x)
    for (hoja, f, area), grupo in perdedoras.items():
        ganadora = next(y['hoja'] for y in filas if y['fecha'] == f and y['area'] == area
                        and y['prioridad'] == mejor[(f, area)])
        rechazos.append({'fuente': _fuente(ARCHIVO_HIGIENE, hoja, [y['fila'] for y in grupo]),
                         'motivo': 'duplicado: la fecha y el área ya están en una hoja más reciente',
                         'contenido': f'{f} {area}: se conserva la hoja {ganadora.strip()!r} · '
                                      f'{", ".join(y["nombre"] for y in grupo)}'})
    filas = [x for x in filas if x['prioridad'] == mejor[(x['fecha'], x['area'])]]

    # 2. Registro por (fecha, área); hojas paralelas ('TQ ' y 'Planta Alta') se combinan. Un operario anotado dos
    #    veces el mismo día conserva la fila que registra más fallas (si empatan, la primera); la otra va a rechazos.
    grupos = defaultdict(list)
    for x in filas:
        grupos[(x['fecha'], x['area'])].append(x)
    registros, apariciones = [], defaultdict(list)
    for (f, area), grupo in sorted(grupos.items()):
        revision, usadas = {}, []
        for x in grupo:
            if x['nombre'] in revision:
                previa = next(y for y in usadas if y['nombre'] == x['nombre'])
                iguales = 'iguales' if previa['valor'] == x['valor'] else 'DISTINTOS'
                gana, pierde = (x, previa) if _fallas(x['valor']) > _fallas(previa['valor']) else (previa, x)
                if gana is x:
                    usadas[usadas.index(previa)] = x
                    revision[x['nombre']] = x['valor']
                rechazos.append(_rechazo(ARCHIVO_HIGIENE, pierde['hoja'], pierde['fila'],
                                         'duplicado: operario ya registrado ese día',
                                         f'{f} {x["nombre"]}: se conserva {gana["hoja"].strip()!r} fila {gana["fila"]} '
                                         f'(valores {iguales}) · {pierde["contenido"]}'))
                continue
            revision[x['nombre']] = x['valor']
            usadas.append(x)
            apariciones[x['nombre']].append((f, area))
        por_hoja = defaultdict(list)
        for x in usadas:
            por_hoja[x['hoja']].append(x['fila'])
        registros.append({
            'formato': 'higiene-uniforme', 'fecha': f.isoformat(), 'hora': None, 'area': area, 'producto': None,
            'lote': None, 'valores': {'revision': revision},
            'observaciones': NOTA_FORMATO_ANTERIOR if any(x['anterior'] for x in usadas) else None,
            'accion_correctiva': None, 'realizado_por': None,
            'fuente': ' + '.join(_fuente(ARCHIVO_HIGIENE, h, fs) for h, fs in por_hoja.items()),
        })
    return registros, rechazos, apariciones, nombres


def _bloques_lavado(rows):
    """[(fila de fechas | None, fila de encabezado, [filas de operario])] de una hoja de lavado (filas 1-based)."""
    res = []
    for i, r in enumerate(rows):
        if _norm(_celda(r, 0) or '') in ('n°', 'no', 'n') and _norm(_celda(r, 1) or '') == 'nombre':
            fechas = next((k for k in (i, i - 1, i - 2) if k >= 0 and (fecha(_celda(rows[k], 0)) or fecha(_celda(rows[k], 1)))),
                          None)
            ops = []
            for k in range(i + 1, len(rows)):
                if texto(_celda(rows[k], 1)) is None:
                    break
                ops.append(k)
            res.append((fechas, i, ops))
    return res


def _lavado(carpeta: Path, hoy: date, apariciones):
    rechazos, registros, nombres = [], [], {}
    wb = load_workbook(carpeta / ARCHIVO_LAVADO, read_only=True, data_only=True)
    for hoja in wb.sheetnames:
        rows = list(wb[hoja].iter_rows(min_row=1, min_col=1, values_only=True))
        bloques = _bloques_lavado(rows)
        con_fecha = [b for b in bloques if b[0] is not None]
        for b in bloques:
            if b[0] is None and any(estado_lavado(v) for k in b[2] for v in rows[k][2:]):
                rechazos.append({'fuente': _fuente(ARCHIVO_LAVADO, hoja, [k + 1 for k in b[2]]),
                                 'motivo': 'semana sin fechas', 'contenido': ''})
        sec = corregir_secuencia([v for b in con_fecha for v in (_celda(rows[b[0]], 0), _celda(rows[b[0]], 1))], hoy)
        grupos = defaultdict(dict)          # (fecha, área) → {nombre: valor}
        filas_de = defaultdict(set)         # (fecha, área) → filas del Excel
        semanas = {}
        for n_b, (i_f, i_h, ops) in enumerate(con_fecha):
            ini, fin = sec[2 * n_b], sec[2 * n_b + 1]
            lunes = lunes_de_bloque(ini, fin)
            filas_bloque = [k + 1 for k in ops]
            fechas_txt = _contenido(rows[i_f][:2])
            if lunes is None:
                rechazos.append({'fuente': _fuente(ARCHIVO_LAVADO, hoja, filas_bloque),
                                 'motivo': 'semana sin lunes reconocible', 'contenido': fechas_txt})
                continue
            if lunes in semanas:
                rechazos.append({'fuente': _fuente(ARCHIVO_LAVADO, hoja, filas_bloque),
                                 'motivo': 'semana repetida: misma fila de fechas que un bloque anterior',
                                 'contenido': f'{fechas_txt} ya está en la fila {semanas[lunes]}; datos distintos'})
                continue
            semanas[lunes] = i_f + 1
            columnas = columnas_lavado(rows[i_h])
            for k in ops:
                r = rows[k]
                crudo = re.sub(r'\s+', ' ', str(r[1])).strip()
                nombre = canonico(crudo)
                nombres[crudo] = nombre
                if nombre in OPERARIOS_TIENDA:
                    rechazos.append(_rechazo(ARCHIVO_LAVADO, hoja, k + 1, MOTIVO_TIENDA, f'semana del {lunes} · {nombre}'))
                    continue
                sin_area = []
                for dia in range(6):
                    f = lunes + timedelta(days=dia)
                    celdas = {col: _celda(r, j) for j, d, col in columnas if d == dia}
                    valor, ilegibles = dia_lavado(celdas)
                    if ilegibles:
                        rechazos.append(_rechazo(ARCHIVO_LAVADO, hoja, k + 1,
                                                 'valor no interpretable (se importó el resto del día)',
                                                 f'{f} {nombre}: ' + ', '.join(f'{_ETIQUETA_HORARIO[c]} = {v!r}'
                                                                              for c, v in ilegibles)))
                    if valor is None:
                        continue
                    if not DESDE <= f <= hoy:
                        rechazos.append(_rechazo(ARCHIVO_LAVADO, hoja, k + 1, 'fecha fuera de rango', f'{f} {nombre}'))
                        continue
                    area = area_de(nombre) or area_cercana(apariciones.get(nombre), f)
                    if area is None:
                        sin_area.append(f)
                        continue
                    if nombre in grupos[(f, area)]:
                        rechazos.append(_rechazo(ARCHIVO_LAVADO, hoja, k + 1, 'duplicado: operario ya registrado ese día',
                                                 f'{f} {nombre}'))
                        continue
                    grupos[(f, area)][nombre] = valor
                    filas_de[(f, area)].add(k + 1)
                if sin_area:
                    rechazos.append(_rechazo(
                        ARCHIVO_LAVADO, hoja, k + 1,
                        'operario sin área: no está en el catálogo vigente ni en higiene cerca de la fecha',
                        f'{crudo!r} → {nombre!r}; días: {", ".join(d.strftime("%d/%m") for d in sin_area)}'))
        for (f, area), lavado_dia in sorted(grupos.items()):
            if not any(set(v) & {'h0630', 'h0930', 'h1230', 'h1430'} for v in lavado_dia.values()):
                rechazos.append({'fuente': _fuente(ARCHIVO_LAVADO, hoja, filas_de[(f, area)]),
                                 'motivo': 'día sin lavados registrados (todos ausentes)', 'contenido': f'{f} {area}'})
                continue
            registros.append({
                'formato': 'lavado-manos', 'fecha': f.isoformat(), 'hora': None, 'area': area, 'producto': None,
                'lote': None, 'valores': {'lavado': lavado_dia}, 'observaciones': None, 'accion_correctiva': None,
                'realizado_por': None,
                'fuente': f'{_fuente(ARCHIVO_LAVADO, hoja, filas_de[(f, area)])} ({_DIAS[f.weekday()]})',
            })
    wb.close()
    return registros, rechazos, nombres


def _extraer(carpeta: Path, hoy: date):
    reg_h, rech_h, apariciones, nombres_h = _higiene(carpeta, hoy)
    reg_l, rech_l, nombres_l = _lavado(carpeta, hoy, apariciones)
    return reg_h + reg_l, rech_h + rech_l, {**nombres_h, **nombres_l}


def extraer(carpeta: Path, hoy: date) -> tuple[list[dict], list[dict]]:
    """Devuelve (registros, rechazos). No sube nada ni toca la base."""
    registros, rechazos, _ = _extraer(Path(carpeta), hoy)
    return registros, rechazos


# ---------------------------------------------------------------- resumen por consola

def imprimir_resumen(registros, rechazos, nombres):
    print('Registros por formato y área:')
    for (formato, area), n in sorted(Counter((r['formato'], r['area']) for r in registros).items()):
        print(f'  {formato:18} {area:12} {n:5}')
    for formato in FORMATOS:
        fechas = sorted(r['fecha'] for r in registros if r['formato'] == formato)
        if fechas:
            print(f'Rango {formato}: {fechas[0]} a {fechas[-1]}')
    personas = Counter(r['formato'] for r in registros for v in r['valores'].values() for _ in v)
    print('Filas de operario importadas:', dict(personas))
    print(f'\nRechazos por motivo ({len(rechazos)}):')
    for motivo, n in Counter(r['motivo'] for r in rechazos).most_common():
        print(f'  {n:5}  {motivo}')
    vigentes = {n for ns in VIGENTES.values() for n in ns}
    print('\nNombres históricos → nombre canónico (* = no está en VIGENTES: se crea inactivo):')
    for crudo, canon in sorted(nombres.items(), key=lambda x: (x[1] or '', x[0])):
        marca = ' (Tienda, excluida)' if canon in OPERARIOS_TIENDA else '' if canon in vigentes else '  *'
        print(f'  {crudo!r:24} → {canon}{marca}')
    print('\nMuestras:')
    for formato in FORMATOS:
        muestra = next((r for r in registros if r['formato'] == formato and r['observaciones'] is None
                        and any('_obs' in v for v in next(iter(r['valores'].values())).values())), None) \
            or next((r for r in registros if r['formato'] == formato), None)
        if muestra:
            print(json.dumps(muestra, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    if len(sys.argv) != 2:
        sys.exit('uso: python -m extractores.personal "<carpeta de Calidad>"')
    imprimir_resumen(*_extraer(Path(sys.argv[1]), date.today()))
