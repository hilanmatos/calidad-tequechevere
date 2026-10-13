"""'CONTROL DE CALIDAD TEQUEÑOS.xlsx' → formato cq-l1-tequenos (un registro por lote).

Hojas del libro:
- 'Control de calidad': la principal, una fila por lote. El encabezado es la fila con 'FECHA DE PRODUCCIÓN' en la
  columna B. Las columnas a la derecha de 'IMPRESIÓN DE LOTE' son otra tabla (temperatura de cuartos fríos) y no
  son de este formato.
- 'TEQUEÑOS': versión anterior del formato. Sus filas repiten lotes de la principal: se fusionan con ellas (manda la
  principal) y aportan el nombre detallado del producto ('… precocido') y la evaluación sensorial.
- 'Control de masa': estudio puntual de humedad, fuera de la app.

Decisiones:
- Lote = número del lote ('PT026 (27097)' → '27097'); el código PT del Excel solo sirve de evidencia del producto.
- Full Queso es 'precocido' si el nombre lo dice o si la fila trae mediciones de freído (aceite o temperatura
  interna); si no, es el crudo y se descartan los campos de freído (no aplican).
- Si el nombre y el código del lote son de productos distintos, el producto queda sin asignar.
- Lotes repetidos: se conserva la primera fila del lote; las siguientes van a rechazos con motivo 'lote repetido'.
- Celdas con texto que no encaja en el campo (p. ej. 'Pálida', 'Amarillento') van a observaciones.
"""
import re
import sys
from collections import Counter
from datetime import date, datetime, time, timedelta
from pathlib import Path

import openpyxl

from normalizar import conforme, corregir_secuencia, fecha, numero, peso_kg, sin_acentos, texto, vacio

FORMATOS = ['cq-l1-tequenos']
ARCHIVOS = ['CONTROL DE CALIDAD TEQUEÑOS.xlsx']
FORMATO = FORMATOS[0]
ARCHIVO = ARCHIVOS[0]
DESDE = date(2025, 1, 1)
AREA = None  # el formato no se llena por área: la app guarda los registros de línea sin área
VIDA_UTIL = timedelta(days=182)  # seis meses, la que muestran las fechas de vencimiento del Excel

ESCALA = ['Excelente', 'Buena', 'Regular', 'Mala']
CAMPOS_FREIDO = ('tAceite', 'tiempoFreido', 'tInternaFreido', 'aspectoFreido', 'defectos')

# ───────────── normalizadores propios ─────────────


def _sin_fecha(v):
    return isinstance(v, (datetime, date, time))


def _num(v):
    return None if _sin_fecha(v) else numero(v)


def _kg(v):
    return None if _sin_fecha(v) else peso_kg(v)


def segundos(v):
    """Tiempo en segundos: hora de Excel (0:01:08 → 68) o texto con unidad ('1 Minuto', '90 s')."""
    if isinstance(v, time):
        return v.hour * 3600 + v.minute * 60 + v.second
    if not isinstance(v, str) or vacio(v):
        return None
    s = sin_acentos(v).lower()
    n = numero(s)
    if n is None:
        return None
    if re.search(r'\d\s*min', s):
        return round(n * 60)
    if re.search(r'\d\s*(s|seg)\b', s):
        return round(n)
    return None


def temp_agua(v):
    if isinstance(v, str) and sin_acentos(v).strip().lower() == 'ambiente':
        return 'Ambiente'
    return _num(v)


def opcion(v, opciones):
    """La opción del campo que coincide con la celda (sin importar mayúsculas, acentos ni espacios)."""
    if vacio(v):
        return None
    k = sin_acentos(str(v)).strip().lower()
    return next((o for o in opciones if sin_acentos(o).lower() == k), None)


def presentacion(v):
    t = texto(v)
    if t is None:
        return None
    t = re.sub(r'\s+', ' ', t)
    m = re.fullmatch(r'(\d+) unidades', t, re.IGNORECASE)
    return f'{m.group(1)} unidades' if m else t


def proveedor(v):
    t = texto(v)
    if t is None:
        return None
    return ' '.join(p[:1].upper() + p[1:] if p.islower() else p for p in t.split())


def lote_y_codigo(v):
    """('27097', 'PT026') de 'PT026 (27097)' o '[PT026] 27097'. El código queda tal como se escribió."""
    if vacio(v):
        return None, None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return str(int(v)), None
    s = str(v).strip().upper()
    m = re.search(r'\b([A-Z]{2}\d{3})\b', s)
    codigo = m.group(1) if m else None
    resto = s.replace(codigo, ' ') if codigo else s
    n = re.search(r'\d{4,}', resto)
    return (n.group() if n else None), codigo


def _invertida(d: date):
    return date(d.year, d.day, d.month) if d.day <= 12 and d.day != d.month else None


def _en_rango(d, hoy):
    return d is not None and DESDE <= d <= hoy


def fechas_produccion(crudas, hoy: date):
    """Fechas de producción corregidas con normalizar.corregir_secuencia.

    Devuelve (fechas, fuera): las fuera de 2025-01-01..hoy quedan en None y se informan aparte en `fuera`
    ({índice: fecha leída}); así tampoco sirven de referencia a las fechas ambiguas vecinas.
    """
    fuera, limpias = {}, []
    for i, v in enumerate(crudas):
        d = fecha(v)
        candidatas = [d] if d is None or isinstance(v, str) else [d, _invertida(d)]
        if d is not None and not any(_en_rango(c, hoy) for c in candidatas):
            fuera[i] = d
            limpias.append(None)
        else:
            limpias.append(v)
    res = corregir_secuencia(limpias, hoy)
    for i, d in enumerate(res):
        if d is not None and not _en_rango(d, hoy):
            fuera[i] = d
            res[i] = None
    return res, fuera


def vencimiento(v, produccion):
    """Fecha de vencimiento. Si Excel la guardó como fecha ambigua (día ≤ 12), elige la lectura más cercana a
    la producción más la vida útil; el texto dd/mm/aaaa es exacto."""
    d = fecha(v)
    if d is None or isinstance(v, str) or produccion is None:
        return d
    inv = _invertida(d)
    if inv is None:
        return d
    meta = produccion + VIDA_UTIL
    return min((d, inv), key=lambda x: abs((x - meta).days))


# ───────────── producto ─────────────

# (fragmento del nombre sin acentos, familia). El orden importa: 'Guayaba queso' no es Full Queso.
NOMBRES = [('guayaba', 'guayaba'), ('salmon', 'salmon'), ('boquita', 'boquita'), ('tequenon', 'tequenon'),
           ('full queso', 'full')]
# Familias que el propio Excel asocia a cada código de lote (nombre y código coinciden en la mayoría de filas).
FAMILIA_CODIGO = {'PT011': 'full', 'PT013': 'full', 'PT026': 'full', 'PT014': 'boquita', 'PT006': 'boquita',
                  'PT007': 'boquita', 'PT015': 'tequenon', 'PT029': 'guayaba', 'PT035': 'salmon', 'PT036': 'salmon',
                  'PT039': 'salmon'}
CLAVES = {'guayaba': 'Tequeño Full de Guayaba (5 cm)', 'boquita': 'Tequeño Boquita', 'tequenon': 'Tequeñón'}
FULL_CRUDO, FULL_PRECOCIDO = 'Tequeño Full Queso', 'Tequeño Full Queso precocido'
SALMON = {10: 'PT035', 50: 'PT036', 40: 'PT039'}  # unidades por empaque → código del catálogo


def _familia(nombre):
    s = sin_acentos(nombre or '').lower()
    return next((fam for patron, fam in NOMBRES if patron in s), None)


def producto(nombre, codigo, presentacion_, freido: bool):
    """(clave del catálogo, None) o (None, motivo por el que queda sin producto)."""
    fam = _familia(nombre)
    if fam is None:
        return None, 'nombre no reconocido'
    fam_codigo = FAMILIA_CODIGO.get(codigo)
    if fam_codigo and fam_codigo != fam:
        return None, f'el código del lote ({codigo}) es de otro producto'
    if fam == 'full':
        precocido = re.search(r'pr[\w-]*cocid', sin_acentos(nombre).lower())
        return (FULL_PRECOCIDO if precocido or freido else FULL_CRUDO), None
    if fam == 'salmon':
        m = re.match(r'\d+', presentacion_ or '')
        clave = SALMON.get(int(m.group())) if m else None
        clave = clave or (codigo if codigo in SALMON.values() else None)
        return (clave, None) if clave else (None, 'presentación de salmón distinta de 10, 40 o 50 unidades')
    return CLAVES[fam], None


def hay_freido(valores) -> bool:
    """Hubo freído si se midió la temperatura del aceite o la interna (el tiempo se copiaba de fila en fila)."""
    return any(isinstance(valores.get(c), (int, float)) for c in ('tAceite', 'tInternaFreido'))


# ───────────── fusión y repetidos ─────────────


def fusionar(principal, vieja):
    """Valores de la hoja principal completados con los de la vieja; pendientes solo de campos que quedan vacíos."""
    valores = {k: v for k, v in principal['valores'].items() if v is not None}
    for k, v in vieja['valores'].items():
        if v is not None and k not in valores:
            valores[k] = v
    pendientes = {}
    for hoja in (principal, vieja):
        for k, t in hoja['pendientes'].items():
            if k not in valores and k not in pendientes:
                pendientes[k] = t
    return {'valores': valores, 'pendientes': pendientes}


# Operaciones (12/10/2026): "Correcto"/"Adecuada" equivalen a Buena. Se aplica después de fusionar, así una
# evaluación de la escala anotada en la otra hoja para el mismo lote tiene prioridad.
_EQUIVALE_BUENA = {'correcto', 'correcta', 'adecuado', 'adecuada'}
CAMPOS_ESCALA = ('aspectoFreido', 'sabor', 'color', 'textura', 'aparienciaSensorial')


def equivaler_escala(x):
    for k in CAMPOS_ESCALA:
        t = x['pendientes'].get(k)
        if t is not None and x['valores'].get(k) is None and sin_acentos(str(t)).strip().lower() in _EQUIVALE_BUENA:
            x['valores'][k] = 'Buena'
            del x['pendientes'][k]


def quitar_repetidos(registros):
    """(los que quedan, [(repetido, primera fila de su lote)]). Los registros sin lote no se comparan."""
    primeras, quedan, repetidos = {}, [], []
    for r in registros:
        k = r['lote'].strip().upper() if r['lote'] else None
        if k and k in primeras:
            repetidos.append((r, primeras[k]))
            continue
        if k:
            primeras[k] = r
        quedan.append(r)
    return quedan, repetidos


# ───────────── lectura de las hojas ─────────────


def _correcta(v):
    return conforme(v, ('Correcta', 'Incorrecta'))


def _correcto(v):
    return conforme(v, ('Correcto', 'Incorrecto'))


def _escala(v):
    return opcion(v, ESCALA)


def _metales(v):
    return opcion(v, ['Ausencia', 'Presencia'])


# índice de columna (A = 0) → (campo, normalizador)
HOJA_PRINCIPAL = {
    'nombre': 'Control de calidad', 'obligatoria': True, 'fecha': 1, 'producto': 2, 'lote': 26, 'vencimiento': 27,
    'columnas': {
        3: ('tAmbiente', _num), 4: ('hrAmbiente', _num), 5: ('tAgua', temp_agua), 6: ('tMasa', _num),
        7: ('hMasa', _num), 8: ('proveedorQueso', proveedor), 9: ('hQueso', _num), 10: ('aparienciaMasa', _correcta),
        11: ('vueltas', _num), 12: ('aparienciaEnrollado', _correcta), 13: ('pesoPromedio', _num),
        15: ('pesoRelleno', _num), 17: ('tInternaTurbo', _num), 18: ('tAceite', _num), 19: ('tiempoFreido', segundos),
        20: ('tInternaFreido', _num), 21: ('aspectoFreido', _escala), 22: ('defectos', _num),
        23: ('tInicialCong', _num), 24: ('aparienciaCong', _correcta), 25: ('presentacion', presentacion),
        28: ('tFinal', _num), 29: ('pesoEmpaque', _kg), 32: ('metales', _metales), 33: ('tSellado', _num),
        34: ('sellado', _correcto), 35: ('impresionLote', _correcta),
    },
    # columna → fragmento que debe tener su encabezado (sin acentos, minúsculas)
    'encabezado': {1: 'fecha de produccion', 2: 'producto', 5: 'agua', 7: 'humedad masa', 13: 'peso promedio',
                   17: 'temperatura interna', 18: 'aceite', 19: 'tiempo de freido', 20: 'pcc1', 23: 'pcc2',
                   26: 'lote', 27: 'vencimiento', 28: 'pcc3', 29: 'empaque', 32: 'metal', 35: 'impresion de lote'},
}
HOJA_VIEJA = {
    'nombre': 'TEQUEÑOS', 'fecha': 1, 'producto': 2, 'lote': 4, 'vencimiento': 5,
    'columnas': {
        3: ('presentacion', presentacion), 6: ('pesoEmpaque', _kg), 7: ('impresionLote', _correcta),
        8: ('tMasa', _num), 9: ('hMasa', _num), 10: ('aparienciaMasa', _correcta), 11: ('vueltas', _num),
        12: ('aparienciaEnrollado', _correcta), 13: ('pesoPromedio', _num), 14: ('tAceite', _num),
        15: ('tiempoFreido', segundos), 16: ('aspectoFreido', _escala), 17: ('defectos', _num),
        18: ('tInicialCong', _num), 19: ('aparienciaCong', _correcta), 20: ('sabor', _escala), 21: ('color', _escala),
        22: ('textura', _escala), 23: ('aparienciaSensorial', _escala),
    },
    'encabezado': {1: 'fecha de produccion', 2: 'producto', 4: 'lote', 5: 'vencimiento', 14: 'aceite', 20: 'sabor',
                   21: 'color', 22: 'textura'},
}

ETIQUETAS = {
    'tAmbiente': 'Temperatura ambiente', 'hrAmbiente': 'Humedad relativa ambiente', 'tAgua': 'Temperatura del agua',
    'tMasa': 'Temperatura de la masa', 'hMasa': 'Humedad de la masa', 'proveedorQueso': 'Proveedor del queso',
    'hQueso': 'Humedad del queso', 'aparienciaMasa': 'Apariencia de la masa', 'vueltas': 'Vueltas de masa',
    'aparienciaEnrollado': 'Apariencia del enrollado', 'pesoPromedio': 'Peso promedio por unidad',
    'pesoRelleno': 'Peso promedio del relleno', 'tInternaTurbo': 'Temperatura interna en turbo',
    'tAceite': 'Temperatura del aceite', 'tiempoFreido': 'Tiempo de freído',
    'tInternaFreido': 'Temperatura interna de freído', 'aspectoFreido': 'Aspecto general del freído',
    'defectos': 'Tequeños con defecto', 'tInicialCong': 'Temperatura inicial de congelación',
    'aparienciaCong': 'Apariencia en congelación', 'presentacion': 'Presentación',
    'vencimiento': 'Fecha de vencimiento', 'tFinal': 'Temperatura final del producto',
    'pesoEmpaque': 'Peso medido del empaque', 'metales': 'Detección de metales', 'tSellado': 'Temperatura de sellado',
    'sellado': 'Calidad del sellado', 'impresionLote': 'Impresión de lote', 'sabor': 'Sabor (sensorial)',
    'color': 'Color (sensorial)', 'textura': 'Textura (sensorial)', 'aparienciaSensorial': 'Apariencia (sensorial)',
    'lote': 'Lote',
}


def _clave_texto(v) -> str:
    return re.sub(r'\s+', ' ', sin_acentos(str(v or '')).lower()).strip()


def _celda(fila, i):
    return fila[i] if i < len(fila) else None


def _pendiente(crudo) -> bool:
    """Celda con contenido que el normalizador no pudo interpretar (y que no es un simple guion o punto)."""
    if vacio(crudo):
        return False
    return not isinstance(crudo, str) or bool(re.search(r'[^\W\d_]', crudo))


def _corto(v) -> str:
    if isinstance(v, datetime):
        return v.strftime('%d/%m/%Y')
    if isinstance(v, time):
        return v.strftime('%H:%M:%S')
    return re.sub(r'\s+', ' ', str(v)).strip()


def _resumen(fila, hoja, produccion=None, vence=None) -> str:
    """Texto corto de la fila; con las fechas ya corregidas si se conocen."""
    partes = [_celda(fila, 0), produccion or _celda(fila, hoja['fecha']), _celda(fila, hoja['producto']),
              _celda(fila, hoja['lote']), vence or _celda(fila, hoja['vencimiento'])]
    return ' · '.join(p.strftime('%d/%m/%Y') if isinstance(p, date) else _corto(p) for p in partes if not vacio(p))


def _leer_hoja(wb, hoja, hoy):
    """(filas leídas, rechazos). Cada fila: dict con número de fila, fecha, lote, código, nombre, valores…"""
    origen = f'{ARCHIVO} › {hoja["nombre"]}'
    ws = next((w for w in wb.worksheets if _clave_texto(w.title) == _clave_texto(hoja['nombre'])), None)
    if ws is None:
        falta = [{'fuente': origen, 'motivo': 'hoja no encontrada', 'contenido': ''}]
        return [], falta if hoja.get('obligatoria') else []
    filas = list(ws.iter_rows(values_only=True))
    inicio = next((i for i, f in enumerate(filas[:15])
                   if _clave_texto(_celda(f, hoja['fecha'])).startswith('fecha de produccion')), None)
    if inicio is None:
        return [], [{'fuente': origen, 'motivo': 'encabezado no encontrado', 'contenido': ''}]
    malos = [f'{i}:{_celda(filas[inicio], i)!r}' for i, frag in hoja['encabezado'].items()
             if frag not in _clave_texto(_celda(filas[inicio], i))]
    if malos:
        return [], [{'fuente': origen, 'motivo': 'encabezado inesperado', 'contenido': ', '.join(malos)}]

    datos = [(inicio + 2 + k, f) for k, f in enumerate(filas[inicio + 1:])]
    fechas, fuera = fechas_produccion([_celda(f, hoja['fecha']) for _, f in datos], hoy)
    leidas, rechazos = [], []
    for k, (n, f) in enumerate(datos):
        fuente = f'{origen} › fila {n}'
        nombre = texto(_celda(f, hoja['producto']))
        lote, codigo = lote_y_codigo(_celda(f, hoja['lote']))
        valores, pendientes = {}, {}
        for i, (campo, normalizar) in hoja['columnas'].items():
            crudo = _celda(f, i)
            v = normalizar(crudo)
            if v is not None:
                valores[campo] = v
            elif _pendiente(crudo):
                pendientes[campo] = _corto(crudo)
        if lote is None and _pendiente(_celda(f, hoja['lote'])):
            pendientes['lote'] = _corto(_celda(f, hoja['lote']))
        if not (nombre or lote or valores):
            continue  # fila vacía (solo el número correlativo o la fecha)
        if k in fuera:
            rechazos.append({'fuente': fuente, 'motivo': 'fecha fuera de rango', 'contenido': _resumen(f, hoja)})
            continue
        if fechas[k] is None:
            rechazos.append({'fuente': fuente, 'motivo': 'fecha ilegible', 'contenido': _resumen(f, hoja)})
            continue
        vence_crudo = _celda(f, hoja['vencimiento'])
        vence = vencimiento(vence_crudo, fechas[k])
        if vence:
            valores['vencimiento'] = vence.isoformat()
        elif _pendiente(vence_crudo):
            pendientes['vencimiento'] = _corto(vence_crudo)
        leidas.append({'fila': n, 'fuente': fuente, 'fecha': fechas[k], 'nombre': nombre, 'lote': lote,
                       'codigo': codigo, 'valores': valores, 'pendientes': pendientes,
                       'resumen': _resumen(f, hoja, fechas[k], vence)})
    return leidas, rechazos


def _registro(leida):
    """(registro, motivo por el que quedó sin producto o None)."""
    valores, pendientes = dict(leida['valores']), dict(leida['pendientes'])
    clave, motivo = producto(leida['nombre'], leida['codigo'], valores.get('presentacion'), hay_freido(valores))
    if clave == FULL_CRUDO:
        for c in CAMPOS_FREIDO:
            valores.pop(c, None)
            pendientes.pop(c, None)
    obs = [f'{ETIQUETAS[c]}: {pendientes[c]}' for c in ETIQUETAS if c in pendientes]
    return {
        'formato': FORMATO,
        'fecha': leida['fecha'].isoformat(),
        'hora': None,
        'area': AREA,
        'producto': clave,
        'lote': leida['lote'],
        'valores': valores,
        'observaciones': '; '.join(obs) or None,
        'accion_correctiva': None,
        'realizado_por': None,
        'fuente': leida['fuente'],
    }, motivo


def extraer_detalle(carpeta: Path, hoy: date):
    """(registros, rechazos, nombres sin producto con su cantidad)."""
    ruta = Path(carpeta) / ARCHIVO
    if not ruta.exists():
        return [], [{'fuente': ARCHIVO, 'motivo': 'archivo no encontrado', 'contenido': str(ruta)}], Counter()
    wb = openpyxl.load_workbook(ruta, read_only=True, data_only=True)
    try:
        principal, rechazos = _leer_hoja(wb, HOJA_PRINCIPAL, hoy)
        vieja, rech_vieja = _leer_hoja(wb, HOJA_VIEJA, hoy)
    finally:
        wb.close()
    rechazos += rech_vieja

    # La hoja vieja repite lotes de la principal: se fusiona con la fila del mismo lote y fecha.
    por_lote = {(p['lote'], p['fecha']): p for p in principal if p['lote']}
    solas = []
    for v in vieja:
        p = por_lote.get((v['lote'], v['fecha']))
        if p is None:
            solas.append(v)
            continue
        p.update(fusionar(p, v))
        p['nombre'] = v['nombre'] or p['nombre']  # la hoja vieja trae el nombre completo ('… precocido')
        p['fuente'] += f' + {HOJA_VIEJA["nombre"]} › fila {v["fila"]}'

    leidas = {x['fuente']: x for x in principal + solas}
    for x in leidas.values():
        equivaler_escala(x)
    hechos = {f: _registro(x) for f, x in leidas.items()}
    registros, repetidos = quitar_repetidos([r for r, _ in hechos.values()])
    for r, primera in repetidos:
        fila = primera['fuente'].split(' › ', 1)[1]
        rechazos.append({'fuente': r['fuente'], 'motivo': 'lote repetido',
                         'contenido': f'lote {r["lote"]} ya registrado en {fila}; {leidas[r["fuente"]]["resumen"]}'})
    sin_producto = Counter(f'{leidas[r["fuente"]]["nombre"] or "(sin nombre)"} · {hechos[r["fuente"]][1]}'
                           for r in registros if r['producto'] is None)
    return registros, rechazos, sin_producto


def extraer(carpeta: Path, hoy: date) -> tuple[list[dict], list[dict]]:
    """Devuelve (registros, rechazos). No sube nada ni toca la base."""
    registros, rechazos, _ = extraer_detalle(carpeta, hoy)
    return registros, rechazos


if __name__ == '__main__':
    import json

    sys.stdout.reconfigure(encoding='utf-8')
    if len(sys.argv) < 2:
        sys.exit('Uso: python -m extractores.tequenos "<carpeta de Calidad>"')
    regs, rech, sin_prod = extraer_detalle(Path(sys.argv[1]), date.today())
    print(f'Archivo: {ARCHIVO}')
    for formato, n in sorted(Counter(r['formato'] for r in regs).items()):
        fechas = sorted(r['fecha'] for r in regs if r['formato'] == formato)
        print(f'  {formato}: {n} registros ({fechas[0]} a {fechas[-1]})')
    print('Por producto:')
    for prod, n in Counter(r['producto'] or '(sin producto)' for r in regs).most_common():
        print(f'  {n:4}  {prod}')
    print(f'Rechazos: {len(rech)}')
    for motivo, n in Counter(x['motivo'] for x in rech).most_common():
        print(f'  {n:4}  {motivo}')
    if sin_prod:
        print('Nombres sin producto del catálogo:')
        for nombre, n in sin_prod.most_common():
            print(f'  {n:4}  {nombre}')
    print('Muestras:')
    for r in [regs[0], regs[len(regs) // 2]] if regs else []:
        print(json.dumps(r, ensure_ascii=False, indent=1, default=str))
