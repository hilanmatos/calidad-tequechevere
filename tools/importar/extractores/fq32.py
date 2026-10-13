"""F-Q-32 Control de peso durante el proceso (tequeños, empanaditas/pastelitos/discos y gluten free).

La fuente son tres Word, no Excel. Cada documento repite el mismo bloque por página: una instrucción con
"Fecha: ____ Hora: ____", la tabla de muestras (una fila por mesa de trabajo: N°, operador, producto, M1..M10,
C, NC y dos columnas que cambian según el documento) y las tablas de condiciones (etiqueta | valor).
Al 12/10/2026 los tres archivos son plantillas sin llenar: el extractor lee las tablas igual y devuelve
listas vacías; si una página llega a traer datos, sale como registro.
"""
import re
from datetime import date

from catalogo import PRODUCTOS, clave_producto
from normalizar import fecha as leer_fecha
from normalizar import hora as leer_hora
from normalizar import numero, peso_kg, sin_acentos, texto, vacio
from operarios import canonico

# archivo → (formato de la app, área, líneas de productos que se pueden elegir en la tabla de muestras)
DOCUMENTOS = {
    'F-Q-32 Control de Peso Durante el Proceso -Septiembre 2026.docx':
        ('fq32-tequenos', 'Planta Alta', ['cq-l1-tequenos']),
    'F-Q-32 Control de Peso Durante el Proceso Empanaditas, pastelitos, discos.docx':
        ('fq32-empanadas', 'Planta Alta', ['cq-l2-empanadas-trigo', 'cq-l3-empanadas-maiz']),
    'F-Q-32 Control de Peso Durante el Proceso Yuca Bites - Septiembre 2026.docx':
        ('fq32-gluten-free', 'Gluten Free', ['cq-l4-almond', 'cq-l5-yuca']),
}
ARCHIVOS = list(DOCUMENTOS)
FORMATOS = [formato for formato, _, _ in DOCUMENTOS.values()]
DESDE = date(2025, 1, 1)

# --- fecha y hora de la instrucción de cada página

_FECHA_HORA = re.compile(r'Fecha:\s*(.*?)\s*Hora:\s*(.*)$', re.S)


def _sobre_raya(s: str):
    s = s.replace('_', ' ').strip()
    return s or None


def fecha_hora(texto_instruccion: str):
    """Lo escrito tras 'Fecha:' y 'Hora:' (sin las rayas de la plantilla), o None si no hay nada."""
    m = _FECHA_HORA.search(texto_instruccion or '')
    if not m:
        return None, None
    return _sobre_raya(m.group(1)), _sobre_raya(m.group(2))


_PM = re.compile(r'p\.?\s*m\b', re.I)
_AM = re.compile(r'a\.?\s*m\b', re.I)


def hora_texto(v):
    """'HH:MM' de una hora escrita a mano, respetando am/pm (normalizar.hora no los mira)."""
    h = leer_hora(v)
    if h is None:
        return None
    hh, s = int(h[:2]), str(v)
    if _PM.search(s) and hh < 12:
        hh += 12
    elif _AM.search(s) and hh == 12:
        hh = 0
    return f'{hh:02d}:{h[3:]}'


# --- tabla de muestras

def peso_g(v):
    """Peso de una muestra en gramos. Acepta coma decimal, 'g' y 'kg'."""
    n = numero(v)
    if n is None:
        return None
    return round(n * 1000, 3) if 'kg' in str(v).lower() else n


def apariencia(c: str, nc: str):
    """'C' o 'NC' según la casilla marcada; None si no hay marca o si están marcadas las dos."""
    en_c, en_nc = not vacio(c), not vacio(nc)
    if en_c == en_nc:
        return None
    return 'C' if en_c else 'NC'


_EXTRAS = (('observ', 'observacion'), ('realizado', 'realizado'), ('lote', 'lote'), ('vencim', 'vencimiento'))


def columnas_extra(encabezados):
    """Nombre interno de las dos últimas columnas de la tabla de muestras (None si no se reconoce)."""
    res = []
    for e in encabezados:
        k = sin_acentos(e or '').lower()
        res.append(next((nombre for clave, nombre in _EXTRAS if clave in k), None))
    return res


def leer_fila(celdas, extras):
    """Una mesa de trabajo: [N°, operador, producto, M1..M10, C, NC, extra1, extra2] → dict, o None si está vacía."""
    if all(vacio(c) for c in celdas[1:]):
        return None
    c, nc = celdas[13], celdas[14]
    fila = {
        'operador': texto(celdas[1]),
        'producto': texto(celdas[2]),
        'muestras': [peso_g(m) for m in celdas[3:13]],
        'apariencia': apariencia(c, nc),
    }
    for nombre, valor in zip(extras, celdas[15:17]):
        if nombre:
            fila[nombre] = texto(valor)
    fila['avisos'] = ['apariencia marcada en C y en NC'] if not vacio(c) and not vacio(nc) else []
    return fila


# --- producto escrito → clave del catálogo

_RELLENO = {'de', 'del', 'con', 'y', 'la', 'el'}


def _palabras(s: str) -> set:
    s = re.sub(r'[^a-z0-9]+', ' ', sin_acentos(s).lower())
    return {p[:-1] if len(p) > 3 and p.endswith('s') else p for p in s.split() if p not in _RELLENO}


def producto_catalogo(escrito, lineas):
    """Clave del catálogo para el producto escrito, solo entre las líneas del formato.

    Un producto es candidato si su nombre más su presentación contienen todas las palabras escritas; gana el de
    nombre más corto. Si no hay candidato o el empate es entre productos distintos, devuelve None: no se adivina.
    """
    buscadas = set() if vacio(escrito) else _palabras(str(escrito))
    if not buscadas:
        return None
    candidatos = []
    for linea, codigo, nombre, presentacion in PRODUCTOS:
        if linea in lineas and buscadas <= _palabras(nombre) | _palabras(presentacion):
            candidatos.append((len(_palabras(nombre)), clave_producto(codigo, nombre)))
    if not candidatos:
        return None
    corto = min(n for n, _ in candidatos)
    claves = {clave for n, clave in candidatos if n == corto}
    return claves.pop() if len(claves) == 1 else None


# --- tablas de condiciones

# etiqueta normalizada (sin acentos, símbolos ni espacios) → (campo, tipo)
_CONDICIONES = {
    'ticcongelacion': ('tiCongelacion', 'numero'),
    'tfcongelacion': ('tfCongelacion', 'numero'),
    'tcfritura': ('tFritura', 'numero'),
    'tcaceite': ('tAceite', 'numero'),
    'ticongelacionempaque': ('tiCongEmpaque', 'numero'),
    'tfcongelacionempaque': ('tfCongEmpaque', 'numero'),
    'tcambiente': ('tAmbiente', 'numero'),
    'hambiente': ('hrAmbiente', 'numero'),
    'tcmasa': ('tMasa', 'numero'),
    'hmasa': ('hMasa', 'numero'),
    'lotequeso': ('loteQueso', 'texto'),
    'hqueso': ('hQueso', 'numero'),
    'tcqueso': ('tQueso', 'numero'),
    'loteprod': ('loteProducto', 'texto'),
    'nbandejasciclo': ('bandejasCiclo', 'numero'),
    # empanaditas, pastelitos y discos
    'hdelamasa': ('hMasa', 'numero'),
    'tmasa': ('tMasa', 'numero'),
    'trelleno': ('tRelleno', 'numero'),
    'wdeempaque': ('pesoEmpaque', 'kg'),
}
_CONVERTIR = {'numero': numero, 'texto': texto, 'kg': peso_kg}


def _etiqueta(s: str) -> str:
    return re.sub(r'[^a-z0-9]', '', sin_acentos(s or '').lower())


def condiciones(filas):
    """Filas 'etiqueta | valor | etiqueta | valor' → (valores por campo, conflictos).

    Si un mismo campo aparece con dos valores distintos (empanadas trae una tabla para pastelitos y otra para
    empanaditas, y la app guarda un solo juego), no se elige ninguno: va a conflictos para las observaciones.
    """
    vistos = {}
    for f in filas:
        for etiqueta, crudo in zip(f[0::2], f[1::2]):
            campo = _CONDICIONES.get(_etiqueta(etiqueta))
            if not campo:
                continue
            valor = _CONVERTIR[campo[1]](crudo)
            if valor is not None:
                vistos.setdefault(campo[0], []).append((etiqueta.strip(), str(crudo).strip(), valor))
    valores, conflictos = {}, []
    for campo, lecturas in vistos.items():
        if len({v for _, _, v in lecturas}) == 1:
            valores[campo] = lecturas[0][2]
        else:
            escritos = list(dict.fromkeys(t for _, t, _ in lecturas))
            conflictos.append(f'{lecturas[0][0]}: {" / ".join(escritos)}')
    return valores, conflictos


# --- una página → registro

def _realizado_pie(pie):
    """Nombre escrito en 'Realizado por: ____' del pie de página (solo lo trae el de empanadas)."""
    m = re.search(r'Realizado por:\s*(.*?)\s*(?:Revisado por:|$)', pie or '', re.S)
    return _sobre_raya(m.group(1)) if m else None


def _motivo_fecha(escrita, d, hoy):
    if not escrita:
        return 'sin fecha'
    if d is None:
        return 'fecha ilegible'
    return None if DESDE <= d <= hoy else 'fecha fuera de rango'


def pagina_a_registro(pagina, archivo, hoy):
    """Página leída del Word → (registro o None, rechazos). Una página sin datos no da ni registro ni rechazo.

    pagina = {'n', 'instruccion', 'muestras': filas de la tabla (2 de encabezado + mesas), 'condiciones': filas,
              'pie'}
    """
    formato, area, lineas = DOCUMENTOS[archivo]
    fuente = f'{archivo} › página {pagina["n"]}'
    tabla = pagina.get('muestras') or []
    extras = columnas_extra(tabla[0][-2:]) if tabla else []
    leidas = [(f[0].strip() or str(i), leida) for i, f in enumerate(tabla[2:], start=1)
              if len(f) >= 17 and (leida := leer_fila(f, extras))]
    conds, conflictos = condiciones(pagina.get('condiciones') or [])
    if not leidas and not conds:
        return None, []

    escrita, hora_escrita = fecha_hora(pagina.get('instruccion', ''))
    d = leer_fecha(escrita) if escrita else None
    motivo = _motivo_fecha(escrita, d, hoy)
    if motivo:
        mesas = ', '.join(f"{l['operador'] or '?'} / {l['producto'] or '?'}" for _, l in leidas)
        contenido = f"fecha escrita: {escrita or '(en blanco)'}; mesas con datos: {len(leidas)} {mesas}".strip()
        return None, [{'fuente': fuente, 'motivo': motivo, 'contenido': contenido[:200]}]

    filas, notas, realizados = [], [], []
    for mesa, l in leidas:
        producto = producto_catalogo(l['producto'], lineas)
        if l['producto'] and producto is None:
            notas.append(f"Mesa {mesa}: producto '{l['producto']}' no está en el catálogo")
        fila = {'operario': canonico(l['operador']), 'producto': producto, 'muestras': l['muestras']}
        if l['apariencia']:
            fila['apariencia'] = l['apariencia']
        if l.get('lote'):
            fila['lote'] = l['lote']
        if l.get('vencimiento'):
            venc = leer_fecha(l['vencimiento'])
            if venc:
                fila['vencimiento'] = venc.isoformat()
            else:
                notas.append(f"Mesa {mesa}: vencimiento ilegible '{l['vencimiento']}'")
        if l.get('observacion'):
            fila['observacion'] = l['observacion']
        if l.get('realizado'):
            realizados.append(canonico(l['realizado']))
        notas += [f'Mesa {mesa}: {aviso}' for aviso in l['avisos']]
        filas.append(fila)
    if conflictos:
        notas.append('Condiciones con dos valores distintos: ' + '; '.join(conflictos))

    return {
        'formato': formato,
        'fecha': d.isoformat(),
        'hora': hora_texto(hora_escrita),
        'area': area,
        'producto': None,
        'lote': None,
        'valores': ({'muestras': filas} if filas else {}) | conds,
        'observaciones': '; '.join(notas) or None,
        'accion_correctiva': None,
        'realizado_por': ', '.join(dict.fromkeys(realizados)) or _realizado_pie(pagina.get('pie')),
        'fuente': fuente,
    }, []


# --- lectura del Word

_W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
W_P, W_T, W_SYM, W_TBL, W_TR, W_TC, W_TXBX = (_W + t for t in ('p', 't', 'sym', 'tbl', 'tr', 'tc', 'txbxContent'))


def _en_cuadro(el) -> bool:
    return next(el.iterancestors(W_TXBX), None) is not None


def texto_celda(el) -> str:
    """Texto de una celda o párrafo, sin los cuadros de texto anclados (rótulos y tablas de especificación).

    Los w:sym (símbolos insertados) cuentan como '√': en la plantilla solo sirven para marcar C/NC.
    """
    partes = []
    for p in el.iter(W_P):
        if _en_cuadro(p):
            continue
        t = ''.join('√' if x.tag == W_SYM else (x.text or '') for x in p.iter(W_T, W_SYM) if not _en_cuadro(x))
        if t.strip():
            partes.append(t.strip())
    return ' '.join(partes)


def paginas(ruta):
    """Bloques de la plantilla: cada instrucción con 'Fecha:' abre una página que se lleva las tablas siguientes."""
    from docx import Document  # aquí para no exigir python-docx a quien solo use los helpers

    doc = Document(str(ruta))
    pie = ' '.join(dict.fromkeys(t for s in doc.sections for p in s.footer.paragraphs if (t := texto_celda(p._p))))
    res = []
    for el in doc.element.body.iterchildren():
        if el.tag == W_P and 'Fecha:' in (t := texto_celda(el)):
            res.append({'n': len(res) + 1, 'instruccion': t, 'tablas': [], 'pie': pie})
        elif el.tag == W_TBL and res:
            res[-1]['tablas'].append([[texto_celda(tc) for tc in tr.iterchildren(W_TC)] for tr in el.iterchildren(W_TR)])
    for pg in res:
        tablas = pg.pop('tablas')
        muestras = next((t for t in tablas if any(len(f) >= 17 for f in t)), None)
        pg['muestras'] = muestras
        pg['condiciones'] = [f for t in tablas if t is not muestras
                             and not any('especificaciones' in sin_acentos(c).lower() for fila in t for c in fila)
                             for f in t]
    return res


def extraer_documento(ruta, archivo, hoy):
    """(registros, rechazos, páginas leídas) de un documento."""
    registros, rechazos = [], []
    pgs = paginas(ruta)
    for pg in pgs:
        reg, rech = pagina_a_registro(pg, archivo, hoy)
        if reg:
            registros.append(reg)
        rechazos += rech
    return registros, rechazos, len(pgs)


def _extraer(carpeta, hoy):
    registros, rechazos, paginas_por_archivo = [], [], {}
    for archivo in ARCHIVOS:
        ruta = carpeta / archivo
        if not ruta.exists():
            rechazos.append({'fuente': archivo, 'motivo': 'archivo no encontrado', 'contenido': ''})
            continue
        regs, rech, paginas_por_archivo[archivo] = extraer_documento(ruta, archivo, hoy)
        registros += regs
        rechazos += rech
    return registros, rechazos, paginas_por_archivo


def extraer(carpeta, hoy):
    registros, rechazos, _ = _extraer(carpeta, hoy)
    return registros, rechazos


if __name__ == '__main__':
    import json
    import sys
    from collections import Counter
    from pathlib import Path

    sys.stdout.reconfigure(encoding='utf-8')
    registros, rechazos, leidas = _extraer(Path(sys.argv[1]), date.today())
    print('Páginas leídas por documento:')
    for archivo, n in leidas.items():
        con_datos = sum(r['fuente'].startswith(archivo + ' ›') for r in registros + rechazos)
        print(f'  {archivo}: {n} páginas, {con_datos} con datos, {n - con_datos} en blanco')
    print('Registros por formato:')
    for formato in FORMATOS:
        print(f"  {formato}: {sum(r['formato'] == formato for r in registros)}")
    fechas = sorted(r['fecha'] for r in registros)
    print('Rango de fechas:', f'{fechas[0]} a {fechas[-1]}' if fechas else '(sin registros)')
    print('Rechazos por motivo:', dict(Counter(r['motivo'] for r in rechazos)) or '(ninguno)')
    for r in registros[:2]:
        print(json.dumps(r, ensure_ascii=False, indent=2))
