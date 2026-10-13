from datetime import date, datetime

import pytest

from extractores.salsa import lote_texto, opcion_de, producto_salsa, registros_de_filas, vencimiento_corregido

HOY = date(2026, 10, 12)

ENCABEZADO = (
    'N°', 'FECHA DE PRODUCCIÓN', 'PRODUCTO', 'TEMPERATURA AMBIENTE (°C)', '% HUMEDAD AMBIENTE', 'APARIENCIA VEGETALES',
    'LAVADO', 'SANITEC (mL/L) PCC1', 'TIEMPO HIGIENIZACIÓN (min) PCC1', 'ENJUAGUE', 'ESCURRIDO',
    'DESPEPITADO / CORTE 2–3 cm', 'PICADO', 'PESO VEGETAL LIMPIO', 'PESO MAYONESA', 'PESO VINAGRE', 'PESO SAL',
    'TIEMPO MEZCLADO (min)', 'APARIENCIA MEZCLA', 'pH PCC2', 'COLOR', 'OLOR', 'CONSISTENCIA',
    'TEMP. PRODUCTO EN ENVASADO (°C) PCC3', 'TIEMPO EXPUESTO (min) PCC3', 'PESO NETO (g)', 'PESO TEÓRICO (g)',
    'DIFERENCIA (g)', 'ETIQUETADO / ALÉRGENO HUEVO', 'LOTE', 'FECHA DE VENCIMIENTO', 'TAPADO / CIERRE',
    'DETECCIÓN DE METALES PCC4', 'INSPECCIÓN VISUAL FINAL', 'TEMP. ALMACENAMIENTO (°C) PCC5', 'OBSERVACIONES')
CABECERA = [('CONTROL DE CALIDAD – SALSA TÁRTARA',), (None,) * 7 + ('CONTROL DE PCC',),
            ('DATOS GENERALES',) + (None,) * 5 + ('PREPARACIÓN E HIGIENIZACIÓN',), ENCABEZADO]
C = 'Conforme'


def fila(n=1, fecha='13/12/2025', producto='Salsa tártara 600 g', lote=26593, venc='13/06/2026', obs=None, **cambios):
    base = [n, fecha, producto, 29, 59, 'Correcta', C, 20, 3, C, C, C, C, C, C, C, C, 7, 'Homogénea', 3.96,
            'Característico', 'Característico', 'Cremosa / homogénea', 9.1, 35, 599, 600, -1, C, lote, venc,
            'Correcto', 'Ausencia', C, 3.8, obs]
    for i, v in cambios.items():
        base[int(i[1:])] = v
    return tuple(base)


def _extraer(*filas):
    return registros_de_filas([*CABECERA, *filas], HOY, 'salsa.xlsx', 'Control Salsa Tártara')


# ───────── helpers ─────────

@pytest.mark.parametrize('texto_, teorico, codigo', [
    ('Salsa tártara 600 g', None, 'PS002'),
    ('Salsa Tártara Teque Chévere 600g', None, 'PS002'),
    ('Salsa tártara galón', None, 'PS001'),
    ('Salsa Tartara 4,000 g', None, 'PS001'),
    ('Salsa tártara', 600, 'PS002'),
    (None, 4000, 'PS001'),
    ('Salsa tártara', None, None),
    (None, None, None),
])
def test_producto_salsa(texto_, teorico, codigo):
    assert producto_salsa(texto_, teorico) == codigo


@pytest.mark.parametrize('v, esperado', [
    ('Cremosa / homogénea', 'Cremosa y homogénea'),
    ('cremosa y homogenea', 'Cremosa y homogénea'),
    ('Homogénea', 'Homogénea'),
    ('No homogénea', 'No homogénea'),
    ('Característico', 'Característico'),
    ('Ausencia', 'Ausencia'),
])
def test_opcion_de_reconoce_variantes(v, esperado):
    opciones = ['Cremosa y homogénea', 'Líquida', 'Grumosa', 'Homogénea', 'No homogénea', 'Característico', 'Atípico',
                'Ausencia', 'Presencia']
    assert opcion_de(v, opciones) == esperado


@pytest.mark.parametrize('v', ['Caracteristica', 'Muy cremosa', None, '-'])
def test_opcion_de_sin_coincidencia_exacta(v):
    assert opcion_de(v, ['Característico', 'Atípico', 'Cremosa y homogénea']) is None


def test_vencimiento_texto_es_exacto():
    assert vencimiento_corregido('13/06/2026', date(2025, 12, 13)) == date(2026, 6, 13)


def test_vencimiento_excel_no_ambiguo_queda_igual():
    assert vencimiento_corregido(datetime(2027, 3, 18), date(2026, 9, 18)) == date(2027, 3, 18)


@pytest.mark.parametrize('excel, produccion, esperado', [
    (datetime(2026, 3, 6), date(2025, 12, 3), date(2026, 6, 3)),
    (datetime(2026, 11, 12), date(2026, 6, 11), date(2026, 12, 11)),
    (datetime(2027, 6, 4), date(2026, 10, 6), date(2027, 4, 6)),
])
def test_vencimiento_invertido_coincide_con_el_dia_de_produccion(excel, produccion, esperado):
    assert vencimiento_corregido(excel, produccion) == esperado


def test_vencimiento_descarta_la_version_anterior_a_la_produccion():
    assert vencimiento_corregido(datetime(2026, 2, 7), date(2026, 3, 1)) == date(2026, 7, 2)


def test_vencimiento_sin_pista_conserva_lo_que_guardo_excel():
    assert vencimiento_corregido(datetime(2027, 3, 5), date(2026, 1, 20)) == date(2027, 3, 5)


def test_vencimiento_ilegible():
    assert vencimiento_corregido('pronto', date(2026, 1, 1)) is None
    assert vencimiento_corregido(None, date(2026, 1, 1)) is None


@pytest.mark.parametrize('v, esperado', [(26436, '26436'), (26436.0, '26436'), ('  L-123 ', 'L-123'), (None, None),
                                         ('-', None)])
def test_lote_texto(v, esperado):
    assert lote_texto(v) == esperado


# ───────── filas → registros ─────────

def test_fila_completa():
    registros, rechazos, sin_destino = _extraer(fila())
    assert rechazos == []
    assert sin_destino == []
    (r,) = registros
    assert r['formato'] == 'cq-salsa-tartara'
    assert (r['fecha'], r['hora'], r['area'], r['producto'], r['lote']) == ('2025-12-13', None, None, 'PS002', '26593')
    assert r['valores'] == {
        'tAmbiente': 29, 'hrAmbiente': 59, 'aparienciaVegetales': 'Correcta',
        'lavado': C, 'sanitec': 20, 'tiempoHigienizacion': 3, 'enjuague': C, 'escurrido': C, 'corte': C, 'picado': C,
        'pesoVegetal': C, 'pesoMayonesa': C, 'pesoVinagre': C, 'pesoSal': C, 'tiempoMezclado': 7,
        'aparienciaMezcla': 'Homogénea', 'ph': 3.96, 'colorSalsa': 'Característico', 'olor': 'Característico',
        'consistencia': 'Cremosa y homogénea', 'tEnvasado': 9.1, 'tiempoExpuesto': 35, 'pesoNeto': 599,
        'etiquetado': C, 'vencimiento': '2026-06-13', 'cierre': 'Correcto', 'metales': 'Ausencia',
        'inspeccionVisual': C, 'tAlmacenamiento': 3.8,
    }
    assert r['observaciones'] is None and r['accion_correctiva'] is None and r['realizado_por'] is None
    assert r['fuente'] == 'salsa.xlsx › Control Salsa Tártara › fila 5'


def test_no_envia_diferencia_calculada():
    registros, _, _ = _extraer(fila())
    assert 'diferenciaNeto' not in registros[0]['valores']


def test_vocabulario_conforme_en_campos_correcto_correcta():
    registros, _, _ = _extraer(fila(c5='Conforme', c31='Conforme'))
    v = registros[0]['valores']
    assert v['aparienciaVegetales'] == 'Correcta' and v['cierre'] == 'Correcto'


def test_corrige_fechas_invertidas_de_produccion_y_vencimiento():
    registros, _, _ = _extraer(
        fila(1, datetime(2025, 3, 12), lote=26436, venc=datetime(2026, 3, 6)),
        fila(2, '13/12/2025'),
        fila(3, datetime(2026, 11, 6), lote=29453, venc=datetime(2026, 11, 12)),
        fila(4, '18/09/2026', lote=29584, venc='18/03/2027'),
        fila(5, datetime(2026, 6, 10), lote=None, venc=datetime(2027, 6, 4)),
    )
    assert [(r['fecha'], r['valores']['vencimiento']) for r in registros] == [
        ('2025-12-03', '2026-06-03'), ('2025-12-13', '2026-06-13'), ('2026-06-11', '2026-12-11'),
        ('2026-09-18', '2027-03-18'), ('2026-10-06', '2027-04-06')]


def test_numero_con_unidad_y_observaciones():
    registros, _, _ = _extraer(fila(c24='30 min', obs='se refrigeró. '))
    r = registros[0]
    assert r['valores']['tiempoExpuesto'] == 30
    assert r['observaciones'] == 'se refrigeró.'


def test_sin_lote_se_importa_con_lote_none():
    registros, rechazos, _ = _extraer(fila(lote=None))
    assert rechazos == [] and registros[0]['lote'] is None


def test_valor_no_reconocido_va_a_observaciones_y_no_a_valores():
    registros, _, _ = _extraer(fila(c22='Muy espesa', c7='alto', obs='Nota'))
    r = registros[0]
    assert 'consistencia' not in r['valores'] and 'sanitec' not in r['valores']
    assert r['observaciones'] == "Nota; Sanitec sin valor reconocible en el Excel: 'alto'; " \
                                 "Consistencia sin valor reconocible en el Excel: 'Muy espesa'"


def test_producto_no_reconocido_queda_none_y_se_anota():
    registros, _, _ = _extraer(fila(producto='Salsa tártara', c26=None))
    r = registros[0]
    assert r['producto'] is None
    assert r['observaciones'] == "Producto en el Excel: 'Salsa tártara'"


def test_ignora_filas_solo_con_numero_correlativo():
    registros, rechazos, _ = _extraer(fila(), (7,) + (None,) * 35)
    assert len(registros) == 1 and rechazos == []


def test_rechazos_de_fecha():
    _, rechazos, _ = _extraer(fila(1, None), fila(2, 'mañana'), fila(3, '10/01/2024'), fila(4, '20/10/2026'))
    assert [r['motivo'] for r in rechazos] == ['sin fecha', 'fecha ilegible', 'fecha fuera de rango (2025-01-01 a hoy)',
                                              'fecha fuera de rango (2025-01-01 a hoy)']


def test_rechaza_lote_repetido():
    registros, rechazos, _ = _extraer(fila(1, lote=26593), fila(2, '14/12/2025', lote=' 26593'))
    assert len(registros) == 1
    assert rechazos[0]['motivo'] == 'lote repetido: 26593 ya está en la fila 5'
    assert rechazos[0]['fuente'].endswith('fila 6')


def test_columna_desconocida_se_reporta():
    filas = [*CABECERA[:3], ENCABEZADO + ('FIRMA',), fila() + ('JC',)]
    _, _, sin_destino = registros_de_filas(filas, HOY, 'salsa.xlsx', 'Hoja')
    assert sin_destino == ['FIRMA']


def test_hoja_sin_encabezado_se_rechaza():
    registros, rechazos, _ = registros_de_filas([('hola',)], HOY, 'salsa.xlsx', 'Hoja2')
    assert registros == []
    assert rechazos[0]['motivo'] == 'hoja sin encabezado reconocible'
