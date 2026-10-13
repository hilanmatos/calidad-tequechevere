"""Pruebas de los helpers compartidos por los extractores de Almond Bites y Yuca Bites (extractores/_bites.py)."""
from datetime import date, datetime, time

import pytest

from extractores._bites import (aplicar_unicidad_lote, leer_conforme, leer_minutos, leer_numero, leer_opcion,
                                leer_peso_kg, leer_segundos, lote_op, METALES, procesar_filas, resolver_producto,
                                SENSORIAL, unidades, vencimiento, verificar_encabezados,
                                dias_tipicos_vencimiento)

HOY = date(2026, 10, 12)


# ───────────── números estrictos ─────────────
def test_leer_numero_acepta_numeros_y_unidades():
    assert leer_numero(33.4) == (33.4, None)
    assert leer_numero(27) == (27.0, None)
    assert leer_numero('177.9°C') == (177.9, None)
    assert leer_numero('172,8 °C') == (172.8, None)
    assert leer_numero('-18.5') == (-18.5, None)


def test_leer_numero_vacio_no_deja_nota():
    assert leer_numero('-') == (None, None)
    assert leer_numero('NA') == (None, None)
    assert leer_numero(None) == (None, None)
    assert leer_numero('     ') == (None, None)


def test_leer_numero_texto_libre_va_a_nota():
    assert leer_numero('Equipo de freido dañado') == (None, 'Equipo de freido dañado')


def test_leer_numero_no_adivina_numeros_mal_escritos():
    # '.2.8' podría ser -2.8 o 2.8: no se interpreta
    assert leer_numero('.2.8') == (None, '.2.8')
    assert leer_numero('22 pulgadas') == (None, '22 pulgadas')


def test_leer_numero_con_sufijo_permitido():
    assert leer_numero(' 200°C horno', sufijos=('horno',)) == (200.0, None)
    assert leer_numero(' 200°C horno') == (None, '200°C horno')


# ───────────── duraciones ─────────────
def test_leer_minutos():
    assert leer_minutos('28 min') == (28.0, None)
    assert leer_minutos('23 min ') == (23.0, None)
    assert leer_minutos('40  min') == (40.0, None)
    assert leer_minutos('1 hora') == (60.0, None)
    assert leer_minutos(20) == (20.0, None)
    assert leer_minutos(time(0, 45)) == (45.0, None)
    assert leer_minutos(time(1, 30)) == (90.0, None)


def test_leer_minutos_no_interpreta_varios_valores_ni_letras():
    assert leer_minutos('18 y 21 min') == (None, '18 y 21 min')
    assert leer_minutos('4O min') == (None, '4O min')  # letra O en lugar de cero
    assert leer_minutos('NA') == (None, None)


def test_leer_segundos():
    assert leer_segundos('1 Minuto') == (60.0, None)
    assert leer_segundos('6 min') == (360.0, None)
    # Operaciones (12/10/2026): el punto separa minutos de segundos
    assert leer_segundos('1.25min') == (85.0, None)
    assert leer_segundos('1.20 min') == (80.0, None)
    assert leer_segundos(time(0, 0, 36)) == (36.0, None)
    assert leer_segundos('45 s') == (45.0, None)


def test_leer_segundos_minutos_decimales_si_se_pide():
    assert leer_segundos('1.20 min', punto_mmss=False) == (72.0, None)
    assert leer_segundos('1.25min', punto_mmss=False) == (75.0, None)


def test_sensorial_correcto_y_adecuada_son_buena():
    # Operaciones (12/10/2026): "Correcto"/"Adecuada" = Buena en la escala Excelente/Buena/Regular/Mala
    assert leer_opcion('Correcto', SENSORIAL) == ('Buena', None)
    assert leer_opcion('Adecuada', SENSORIAL) == ('Buena', None)


def test_leer_segundos_numero_sin_unidad_es_ambiguo():
    assert leer_segundos(90) == (None, '90')


# ───────────── peso del empaque ─────────────
def test_leer_peso_kg():
    assert leer_peso_kg(0.442) == (0.442, None)
    assert leer_peso_kg(881) == (0.881, None)
    assert leer_peso_kg('484g') == (0.484, None)
    assert leer_peso_kg('0.912 kg') == (0.912, None)
    assert leer_peso_kg('-') == (None, None)
    assert leer_peso_kg('sin balanza') == (None, 'sin balanza')


# ───────────── conforme y opciones ─────────────
def test_leer_conforme_con_opciones_del_campo():
    assert leer_conforme('correcta', ('Correcta', 'Incorrecta')) == ('Correcta', None)
    assert leer_conforme('Correcto', ('Correcta', 'Incorrecta')) == ('Correcta', None)
    assert leer_conforme('Correcta', ('Correcto', 'Incorrecto')) == ('Correcto', None)
    assert leer_conforme('-', ('Correcta', 'Incorrecta')) == (None, None)


def test_leer_conforme_descripcion_libre_va_a_nota():
    assert leer_conforme('Masa semi húmeda', ('Correcta', 'Incorrecta')) == (None, 'Masa semi húmeda')
    assert leer_conforme('La mayoría abiertas', ('Correcta', 'Incorrecta')) == (None, 'La mayoría abiertas')


def test_leer_opcion_metales():
    assert leer_opcion('Ausencia ', METALES) == ('Ausencia', None)
    assert leer_opcion('Presencia', METALES) == ('Presencia', None)
    assert leer_opcion('-', METALES) == (None, None)


def test_leer_opcion_sensorial():
    assert leer_opcion('Bueno', SENSORIAL) == ('Buena', None)
    assert leer_opcion('Excelente', SENSORIAL) == ('Excelente', None)
    assert leer_opcion('grisáceo', SENSORIAL) == (None, 'grisáceo')
    assert leer_opcion('Equipo de freido dañado', SENSORIAL) == (None, 'Equipo de freido dañado')


# ───────────── lote ─────────────
@pytest.mark.parametrize('celda, lote', [
    ('PK006(27114)', '27114'),
    ('PY001 (25015)', '25015'),
    ('[PY007] 25017', '25017'),
    ('PY007 (27062', '27062'),
    ('PY001(27140)', '27140'),
    (28950, '28950'),
    (28950.0, '28950'),
])
def test_lote_op_extrae_el_numero_de_orden(celda, lote):
    assert lote_op(celda) == (lote, None)


def test_lote_op_vacio_o_ilegible():
    assert lote_op('-') == (None, None)
    assert lote_op(None) == (None, None)
    assert lote_op('pendiente') == (None, 'pendiente')


# ───────────── vencimiento ─────────────
def test_vencimiento_texto_es_exacto():
    assert vencimiento('16/10/26', date(2026, 4, 16)) == ('2026-10-16', None)
    assert vencimiento('20/01/2027', date(2026, 7, 20)) == ('2027-01-20', None)


def test_vencimiento_fecha_excel_invertida_se_corrige_con_el_dia_de_produccion():
    # producción 11/04/2026; Excel leyó "11/10/2026" como 10 de noviembre
    assert vencimiento(datetime(2026, 11, 10), date(2026, 4, 11)) == ('2026-10-11', None)
    # producción 02/05/2026; Excel leyó "02/11/2026" como 11 de febrero (antes de producir)
    assert vencimiento(datetime(2026, 2, 11), date(2026, 5, 2)) == ('2026-11-02', None)
    # producción 02/07/2026; Excel leyó "02/01/2027" como 1 de febrero
    assert vencimiento(datetime(2027, 2, 1), date(2026, 7, 2)) == ('2027-01-02', None)


def test_vencimiento_fecha_excel_correcta_se_respeta():
    assert vencimiento(datetime(2026, 6, 5), date(2025, 12, 5)) == ('2026-06-05', None)
    assert vencimiento(datetime(2026, 10, 10), date(2026, 4, 10)) == ('2026-10-10', None)


def test_vencimiento_ambos_posteriores_gana_el_que_conserva_el_dia_de_produccion():
    # producción 01/07/2026: se tecleó "01/07/2027" y Excel lo leyó como 7 de enero
    assert vencimiento(datetime(2027, 1, 7), date(2026, 7, 1)) == ('2027-07-01', None)
    # sin coincidencia de día ni forma de decidir: se respeta la lectura de Excel
    assert vencimiento(datetime(2027, 3, 4), date(2026, 9, 20)) == ('2027-03-04', None)


def test_dias_tipicos_vencimiento_usa_solo_lecturas_no_ambiguas():
    pares = [('16/10/26', date(2026, 4, 16)),            # texto: exacto, 183 días
             (datetime(2026, 9, 21), date(2026, 3, 21)),  # día > 12: exacto, 184 días
             (datetime(2026, 10, 10), date(2026, 4, 10)), # día = mes: exacto, 183 días
             (datetime(2026, 5, 11), date(2026, 5, 6)),   # ambiguo: no cuenta
             ('-', date(2026, 4, 8))]
    assert dias_tipicos_vencimiento(pares) == 183


def test_dias_tipicos_vencimiento_sin_muestras_es_none():
    assert dias_tipicos_vencimiento([(datetime(2026, 5, 11), date(2026, 5, 6))]) is None


def test_vencimiento_con_vida_util_tipica_de_la_hoja():
    # producción 06/05/2026; Excel leyó "05/11/2026" como 11 de mayo: ambas son posteriores y ninguna conserva el día
    assert vencimiento(datetime(2026, 5, 11), date(2026, 5, 6), dias_tipicos=183) == ('2026-11-05', None)
    # producción 09/06/2026; Excel leyó "08/12/2026" como 12 de agosto
    assert vencimiento(datetime(2026, 8, 12), date(2026, 6, 9), dias_tipicos=183) == ('2026-12-08', None)
    # producción 01/07/2026: 7-ene-2027 (190 días) se parece más a la vida útil típica que 1-jul-2027
    assert vencimiento(datetime(2027, 1, 7), date(2026, 7, 1), dias_tipicos=183) == ('2027-01-07', None)
    # la lectura anterior a la producción se descarta aunque quede más cerca
    assert vencimiento(datetime(2026, 2, 11), date(2026, 5, 2), dias_tipicos=183) == ('2026-11-02', None)


def test_vencimiento_vacio_o_ilegible():
    assert vencimiento('-', date(2026, 4, 8)) == (None, None)
    assert vencimiento('a 6 meses', date(2026, 4, 8)) == (None, 'a 6 meses')


# ───────────── producto ─────────────
REGLAS_YUCA = [
    (('yuca', 'queso'), 'Yuca Bite de Queso'),
    (('yuca', 'pollo'), 'Yuca Bite de Pollo'),
    (('yuca', 'carne'), 'Yuca Bite de Carne'),
    (('carimanola',), 'Mini Carimañola'),
]


def test_unidades_de_la_presentacion():
    assert unidades('16 UNIDADES ') == 16
    assert unidades('32  UNIDADES') == 32
    assert unidades('20 unidades') == 20
    assert unidades(None) is None
    assert unidades('-') is None


def test_resolver_producto_por_nombre():
    assert resolver_producto('Yuca bites de Pollo', '32 UNIDADES', 'cq-l5-yuca', REGLAS_YUCA) == 'Yuca Bite de Pollo'
    assert resolver_producto('carimañola de carne', '50 UNIDADES', 'cq-l5-yuca', REGLAS_YUCA) == 'Mini Carimañola'
    assert resolver_producto('Yuca bites de queso', None, 'cq-l5-yuca', REGLAS_YUCA) == 'Yuca Bite de Queso'


def test_resolver_producto_presentacion_que_no_existe_en_catalogo_es_incierto():
    # la Mini Carimañola solo se empaca x50
    assert resolver_producto('carimañola de carne', '16 UNIDADES', 'cq-l5-yuca', REGLAS_YUCA) is None
    # el Yuca Bite de Carne no tiene x32
    assert resolver_producto('Yuca bites de carne', '32 UNIDADES', 'cq-l5-yuca', REGLAS_YUCA) is None


def test_resolver_producto_desconocido_es_none():
    assert resolver_producto('Yuky snack de queso blanco', '32 unidades', 'cq-l5-yuca', REGLAS_YUCA) is None
    assert resolver_producto(None, None, 'cq-l5-yuca', REGLAS_YUCA) is None


# ───────────── unicidad por lote ─────────────
def _reg(fuente, lote, fecha='2026-05-29', valores=None):
    return {'formato': 'cq-l5-yuca', 'fecha': fecha, 'producto': 'Yuca Bite de Queso', 'lote': lote,
            'valores': valores or {'tMasa': 30.0}, 'observaciones': None, 'fuente': fuente}


def test_unicidad_lote_agrupa_duplicados_exactos():
    a, b = _reg('f › h › fila 5', '27791'), _reg('f › h › fila 9', '27791')
    quedan, rechazos = aplicar_unicidad_lote([a, b])
    assert quedan == [a]
    assert rechazos[0]['fuente'] == 'f › h › fila 9'
    assert rechazos[0]['motivo'].startswith('duplicado exacto')
    assert rechazos[0]['contenido'].startswith('igual a h › fila 5')


def test_unicidad_lote_rechaza_lote_repetido_con_otros_datos():
    a = _reg('f › h › fila 47', '27791')
    b = _reg('f › h › fila 48', ' 27 791 ', fecha='2026-06-03', valores={'tMasa': 31.0})
    quedan, rechazos = aplicar_unicidad_lote([a, b])
    assert quedan == [a]
    assert rechazos[0]['motivo'] == 'lote repetido con otros datos (revisar cuál es el correcto)'
    assert rechazos[0]['contenido'].startswith('el lote 27791 ya está en h › fila 47 (fecha 2026-05-29)')


def test_unicidad_lote_deja_pasar_registros_sin_lote():
    a, b = _reg('f › h › fila 5', None), _reg('f › h › fila 6', None)
    quedan, rechazos = aplicar_unicidad_lote([a, b])
    assert quedan == [a, b] and rechazos == []


# ───────────── procesamiento de filas ─────────────
COLUMNAS = [
    (3, 'tMasa', 'num', 'Temperatura de la masa'),
    (4, 'aparienciaMasa', ('conf', ('Correcta', 'Incorrecta')), 'Apariencia de la masa'),
    (5, 'presentacion', 'pres', 'Presentación'),
    (6, 'lote', 'lote', 'Lote'),
    (7, 'vencimiento', 'venc', 'Fecha de vencimiento'),
    (8, 'sabor', 'sens', 'Sabor'),
    (9, None, 'ignorar', 'Peso real'),
]
REGLAS_ALMOND = [(('almond', 'queso'), 'Almond Bite de Queso')]


def _procesar(filas):
    return procesar_filas(filas, archivo='A.xlsx', hoja='H', formato='cq-l4-almond', columnas=COLUMNAS,
                          reglas=REGLAS_ALMOND, hoy=HOY)


def test_procesar_filas_arma_el_registro():
    fila = ('16/04/2026', 'Almond bites con queso', 33.2, 'Correcta', '20 UNIDADES', 'PK006(27114)', '16/10/26',
            'Bueno', 0.32)
    registros, rechazos = _procesar([(5, fila)])
    assert rechazos == []
    r = registros[0]
    assert r['formato'] == 'cq-l4-almond' and r['fecha'] == '2026-04-16' and r['hora'] is None
    assert r['area'] is None
    assert r['producto'] == 'Almond Bite de Queso' and r['lote'] == '27114'
    assert r['valores'] == {'tMasa': 33.2, 'aparienciaMasa': 'Correcta', 'presentacion': '20 UNIDADES',
                            'vencimiento': '2026-10-16', 'sabor': 'Buena'}
    assert r['observaciones'] is None and r['accion_correctiva'] is None
    assert r['realizado_por'] is None  # el Excel no dice quién; importar.py guarda 'Importado de Excel'
    assert r['fuente'] == 'A.xlsx › H › fila 5'


def test_procesar_filas_texto_libre_va_a_observaciones():
    fila = ('16/04/2026', 'Almond bites con queso', '.2.8', 'Masa húmeda', None, None, None,
            'Equipo de freido dañado', None)
    registros, _ = _procesar([(5, fila)])
    r = registros[0]
    assert 'tMasa' not in r['valores'] and 'aparienciaMasa' not in r['valores'] and 'sabor' not in r['valores']
    assert r['observaciones'] == ('Temperatura de la masa: .2.8; Apariencia de la masa: Masa húmeda; '
                                  'Sabor: Equipo de freido dañado')


def test_procesar_filas_columnas_extra_sin_encabezado_van_a_observaciones():
    fila = ('16/04/2026', 'Almond bites con queso', 33.2, None, None, None, None, None, None, None,
            'Se realizó a las 6:30 am ')
    registros, _ = _procesar([(5, fila)])
    assert registros[0]['observaciones'] == 'Se realizó a las 6:30 am'


def test_procesar_filas_corrige_fechas_invertidas_por_secuencia():
    filas = [(4, (datetime(2026, 4, 8), 'Almond bites con queso', 33.4)),
             (5, ('16/04/2026', 'Almond bites con queso', 33.2))]
    registros, _ = _procesar(filas)
    assert [r['fecha'] for r in registros] == ['2026-04-08', '2026-04-16']


def test_procesar_filas_rechaza_fecha_ilegible_y_fuera_de_rango():
    filas = [(5, ('pendiente', 'Almond bites con queso', 33.2)),
             (6, ('15/03/2024', 'Almond bites con queso', 33.2))]
    registros, rechazos = _procesar(filas)
    assert registros == []
    assert [x['motivo'] for x in rechazos] == ['fecha ilegible', 'fecha fuera de rango (2025-01-01 a hoy)']
    assert rechazos[0]['fuente'] == 'A.xlsx › H › fila 5'
    assert 'pendiente' in rechazos[0]['contenido']


def test_procesar_filas_producto_incierto_queda_none():
    fila = ('16/04/2026', 'Almond bites mixtos', 33.2)
    registros, _ = _procesar([(5, fila)])
    assert registros[0]['producto'] is None


# ───────────── encabezados ─────────────
def _hoja(encabezados, fila=3):
    from openpyxl import Workbook
    ws = Workbook().active
    for col, t in encabezados.items():
        ws.cell(row=fila, column=col, value=t)
    return ws


def test_verificar_encabezados_acepta_acentos_y_espacios():
    ws = _hoja({1: 'FECHA', 19: 'LOTE', 28: 'PRESENTACIÓN '})
    verificar_encabezados(ws, 3, {1: 'FECHA', 19: 'LOTE', 28: 'PRESENTACION'})


def test_verificar_encabezados_falla_si_la_hoja_cambio():
    ws = _hoja({1: 'FECHA', 19: 'FECHA DE VENCIMIENTO'})
    with pytest.raises(ValueError, match='columna 19'):
        verificar_encabezados(ws, 3, {1: 'FECHA', 19: 'LOTE'})


def test_procesar_filas_resuelve_vencimiento_ambiguo_con_la_vida_util_de_la_hoja():
    filas = [(4, ('16/04/2026', 'Almond bites con queso', 33.2, None, None, None, '16/10/2026')),
             (5, ('21/04/2026', 'Almond bites con queso', 33.2, None, None, None, '21/10/2026')),
             (6, ('06/05/2026', 'Almond bites con queso', 33.2, None, None, None, datetime(2026, 5, 11)))]
    registros, _ = _procesar(filas)
    assert registros[2]['valores']['vencimiento'] == '2026-11-05'
