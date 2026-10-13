from datetime import date, datetime

import pytest

from catalogo import PRODUCTOS, clave_producto
from extractores.empanadas import (LAYOUT_MAIZ, LAYOUT_TRIGO, MAIZ, PRODUCTOS_EXCEL, TRIGO, aplicar_unicidad,
                                   clave_unica, encabezados_inesperados, es_fila_vacia, fila_a_registro,
                                   invertir_vencimiento, lote, opcion, producto_catalogo, temp_agua, vencimiento)


# ───────────── Productos ─────────────

def test_producto_trigo_por_nombre_del_excel():
    assert producto_catalogo('Pastelitos de pollo', TRIGO) == 'PP003'
    assert producto_catalogo('Pastelitos de queso', TRIGO) == 'PP001'
    assert producto_catalogo('Discos', TRIGO) == 'PD001'


def test_producto_ignora_mayusculas_acentos_y_espacios():
    assert producto_catalogo('  EMPANADAS  DE CARNE ', TRIGO) == 'PE002'
    assert producto_catalogo('empanaditas de pollo', MAIZ) == 'PE008'
    assert producto_catalogo('Empanadítas de Quéso', MAIZ) == 'PE006'


def test_producto_maiz_por_nombre_del_excel():
    assert producto_catalogo('Empanaditas de queso', MAIZ) == 'PE006'
    assert producto_catalogo('Empanaditas de carne', MAIZ) == 'PE007'
    assert producto_catalogo('Empanaditas de pollo', MAIZ) == 'PE008'


def test_producto_sin_sabor_o_desconocido_es_none():
    assert producto_catalogo('Empanadas', TRIGO) is None
    assert producto_catalogo('Tequeños', TRIGO) is None
    assert producto_catalogo(None, TRIGO) is None


def test_producto_no_cruza_de_linea():
    assert producto_catalogo('Empanaditas de queso', TRIGO) is None
    assert producto_catalogo('Discos', MAIZ) is None


def test_todo_producto_mapeado_existe_en_el_catalogo_de_su_linea():
    for formato, mapa in PRODUCTOS_EXCEL.items():
        claves = {clave_producto(c, n) for f, c, n, _ in PRODUCTOS if f == formato}
        for nombre, clave in mapa.items():
            assert clave in claves, (formato, nombre, clave)


# ───────────── Valores ─────────────

def test_temp_agua():
    assert temp_agua('Ambiente') == 'Ambiente'
    assert temp_agua(' ambiente ') == 'Ambiente'
    assert temp_agua(18.5) == 18.5
    assert temp_agua('22 °C') == 22.0
    assert temp_agua('NA') is None
    assert temp_agua(None) is None


def test_lote():
    assert lote(28834) == '28834'
    assert lote(28834.0) == '28834'
    assert lote(' 29071 ') == '29071'
    assert lote('L-29 071') == 'L-29 071'
    assert lote('-') is None
    assert lote(None) is None


def test_opcion_metales():
    opciones = ('Ausencia', 'Presencia')
    assert opcion('Ausencia ', opciones) == 'Ausencia'
    assert opcion('PRESENCIA', opciones) == 'Presencia'
    assert opcion('NA', opciones) is None
    assert opcion('Correcto', opciones) is None


# ───────────── Fechas ─────────────

def test_invertir_vencimiento_si_la_produccion_venia_invertida():
    # Excel leyó 01/08/2026 como 8 de enero; se corrigió a 1 de agosto
    assert invertir_vencimiento(datetime(2026, 1, 8), date(2026, 8, 1)) is True


def test_no_invertir_vencimiento_si_la_produccion_quedo_igual():
    assert invertir_vencimiento(datetime(2026, 8, 8), date(2026, 8, 8)) is False
    assert invertir_vencimiento(datetime(2026, 9, 15), date(2026, 9, 15)) is False


def test_invertir_vencimiento_por_defecto_si_la_produccion_era_texto():
    # en estas hojas toda fecha que Excel convirtió con día <= 12 viene invertida
    assert invertir_vencimiento('17/08/2026', date(2026, 8, 17)) is True


def test_vencimiento_texto_es_exacto():
    assert vencimiento('17/02/2027', invertir=True) == '2027-02-17'
    assert vencimiento('17/02/2027', invertir=False) == '2027-02-17'


def test_vencimiento_fecha_de_excel_invertida():
    assert vencimiento(datetime(2027, 1, 2), invertir=True) == '2027-02-01'
    assert vencimiento(datetime(2027, 1, 2), invertir=False) == '2027-01-02'


def test_vencimiento_que_no_se_puede_invertir_queda_igual():
    assert vencimiento(datetime(2027, 1, 13), invertir=True) == '2027-01-13'
    assert vencimiento(datetime(2027, 3, 3), invertir=True) == '2027-03-03'


def test_vencimiento_sin_dato():
    assert vencimiento('-', invertir=True) is None
    assert vencimiento(None, invertir=True) is None


# ───────────── Unicidad por lote ─────────────

def test_clave_unica_como_la_app():
    assert clave_unica(TRIGO, ' 28 834 ') == 'cq-l2-empanadas-trigo|lote|28834'
    assert clave_unica(MAIZ, 'ab12') == 'cq-l3-empanadas-maiz|lote|AB12'
    assert clave_unica(MAIZ, None) is None


def _reg(formato, lote_, fuente, valores=None):
    return {'formato': formato, 'lote': lote_, 'fuente': fuente, 'fecha': '2026-08-01', 'producto': 'PD001',
            'valores': valores or {'tMasa': 30.0}, 'observaciones': None}


def test_aplicar_unicidad_conserva_el_primero_y_rechaza_el_repetido():
    regs = [_reg(TRIGO, '28834', 'f › h › fila 5'), _reg(TRIGO, '28 834', 'f › h › fila 9', {'tMasa': 31.0})]
    ok, rech = aplicar_unicidad(regs)
    assert [r['fuente'] for r in ok] == ['f › h › fila 5']
    assert len(rech) == 1
    assert rech[0]['fuente'] == 'f › h › fila 9'
    assert rech[0]['motivo'] == 'lote repetido con datos distintos (la app admite un registro por lote)'
    assert 'fila 5' in rech[0]['contenido']


def test_aplicar_unicidad_distingue_la_fila_copiada_igual():
    regs = [_reg(TRIGO, '28834', 'f › h › fila 5'), _reg(TRIGO, '28834', 'f › h › fila 6')]
    ok, rech = aplicar_unicidad(regs)
    assert len(ok) == 1
    assert rech[0]['motivo'] == 'lote repetido: fila idéntica a otra ya importada'


def test_aplicar_unicidad_no_toca_registros_sin_lote_ni_lotes_de_otro_formato():
    regs = [_reg(TRIGO, None, 'a'), _reg(TRIGO, None, 'b'), _reg(TRIGO, '1', 'c'), _reg(MAIZ, '1', 'd')]
    ok, rech = aplicar_unicidad(regs)
    assert len(ok) == 4 and rech == []


# ───────────── Filas y encabezados ─────────────

def test_es_fila_vacia_ignora_el_correlativo():
    assert es_fila_vacia((15, None, None, '  '))
    assert es_fila_vacia((None, None))
    assert not es_fila_vacia((15, '17/08/2026', None))


ENC_TRIGO = ('N°', 'FECHA DE PRODUCCIÓN ', 'PRODUCTO ', 'TEMPERATURA AMBIENTE (°C )', '% HUMEDAD AMBIENTE',
             'TEMPERATURA (°C )\nDEL AGUA', 'TEMPERATURA (°C )\nMASA ', '% HUMEDAD MASA', 'APARIENCIA GENERAL\n',
             'PESO DE LA MASA (g)', 'PESO PROMEDIO DEL RELLENO (g)', 'PESO TEÓRICO DEL RELLENO (g)',
             'PESO PROMEDIO DEL PRODUCTO FINAL (g)', 'PESO TEÓRICO (g)', 'APARIENCIA GENERAL ',
             'TEMPERATURA DE RELLENO\n ( °C )', 'TEMPERATURA INTERNA DE CONGELACIÓN \n ( °C ) PCC1', 'APARIENCIA ',
             'PRESENTACIÓN ', 'LOTE', 'FECHA DE VENCIMIENTO', 'PESO (kg) EMPAQUE', 'PESO TEÓRICO (kg)',
             'DIFERENCIA (kg)', 'AUSENCIA/PRESENCIA DE METAL PCC2', 'CALIDAD DEL SELLADO', 'IMPRESIÓN DE LOTE', None)


def test_encabezados_del_excel_de_trigo_coinciden():
    assert encabezados_inesperados(ENC_TRIGO, LAYOUT_TRIGO) == []


def test_encabezados_detecta_columna_cambiada():
    enc = list(ENC_TRIGO)
    enc[6] = 'TEMPERATURA DEL HORNO'
    assert encabezados_inesperados(tuple(enc), LAYOUT_TRIGO) == ["columna 7: 'TEMPERATURA DEL HORNO'"]


def test_encabezados_de_maiz_tienen_apariencia_del_empaque():
    enc = ENC_TRIGO[:24] + ('APARIENCIA PCC2', 'AUSENCIA/PRESENCIA DE METAL PCC3', 'CALIDAD DEL SELLADO',
                            'IMPRESIÓN DE LOTE', None)
    assert encabezados_inesperados(enc, LAYOUT_MAIZ) == []


FILA_DISCOS = (1, datetime(2026, 1, 8), 'Discos', 20, 54, 'Ambiente', 38.7, 25.05, 'Correcta', 'NA', 'NA', 'NA',
               36.9, 'NA', 'Correcta', 'NA', -3.2, 'Correcta', 'Correcta', 28834, datetime(2027, 1, 2), 0.461,
               'NA', 'NA', 'Ausencia ', 'Correcto', 'Correcto', None)


def test_fila_a_registro_trigo():
    r = fila_a_registro(FILA_DISCOS, LAYOUT_TRIGO, TRIGO, date(2026, 8, 1), True, 'f › h › fila 5')
    assert r['formato'] == TRIGO
    assert r['fecha'] == '2026-08-01'
    assert r['hora'] is None and r['area'] is None
    assert r['producto'] == 'PD001'
    assert r['lote'] == '28834'
    assert r['valores'] == {
        'tAmbiente': 20.0, 'hrAmbiente': 54.0, 'tAgua': 'Ambiente', 'tMasa': 38.7, 'hMasa': 25.05,
        'aparienciaMasa': 'Correcta', 'pesoProducto': 36.9, 'aparienciaProducto': 'Correcta',
        'tInternaCong': -3.2, 'aparienciaCong': 'Correcta', 'presentacion': 'Correcta',
        'vencimiento': '2027-02-01', 'pesoEmpaque': 0.461, 'metales': 'Ausencia', 'sellado': 'Correcto',
        'impresionLote': 'Correcta',
    }
    assert r['observaciones'] is None
    assert r['accion_correctiva'] is None
    assert r['realizado_por'] is None
    assert r['fuente'] == 'f › h › fila 5'


def test_fila_a_registro_no_envia_columnas_teoricas_ni_calculadas():
    fila = list(FILA_DISCOS)
    fila[11], fila[13], fila[22], fila[23] = 12, 38, 0.46, 0.001
    r = fila_a_registro(tuple(fila), LAYOUT_TRIGO, TRIGO, date(2026, 8, 1), True, 'x')
    assert not {'pesoDeclarado', 'diferenciaPeso'} & r['valores'].keys()
    assert 12 not in r['valores'].values() and 0.46 not in r['valores'].values()


def test_fila_a_registro_maiz_con_peso_de_masa_y_apariencia_del_empaque():
    fila = (1, datetime(2026, 1, 8), 'Empanaditas de queso', 20, 54, 'Ambiente', 24.7, 30.06, 'Correcta', 48, 9.3,
            'NA', 34.6, 'NA', 'Correcta', 10.6, -1.2, 'Correcta', 'Correcta', 28838, datetime(2027, 1, 2), 1.08,
            'NA', 'NA', 'Conforme', 'Ausencia ', 'Correcto', 'Correcto', None)
    r = fila_a_registro(fila, LAYOUT_MAIZ, MAIZ, date(2026, 8, 1), True, 'x')
    assert r['producto'] == 'PE006'
    assert r['valores']['pesoMasa'] == 48.0
    assert r['valores']['pesoRelleno'] == 9.3
    assert r['valores']['tRelleno'] == 10.6
    assert r['valores']['aparienciaEmpaque'] == 'Correcta'
    assert r['valores']['metales'] == 'Ausencia'


def test_fila_a_registro_guarda_en_observaciones_lo_que_no_se_puede_interpretar():
    fila = list(FILA_DISCOS)
    fila[2] = 'Empanadas'
    fila[16] = 'Equipo dañado'
    fila[24] = 'Revisar'
    fila[27] = 'Se repitió la medición'
    r = fila_a_registro(tuple(fila), LAYOUT_TRIGO, TRIGO, date(2026, 8, 1), True, 'x')
    assert r['producto'] is None
    assert 'tInternaCong' not in r['valores'] and 'metales' not in r['valores']
    obs = r['observaciones']
    assert "Producto en el Excel: 'Empanadas'" in obs
    assert "Temperatura interna (Excel): 'Equipo dañado'" in obs
    assert "Detección de metales (Excel): 'Revisar'" in obs
    assert 'Se repitió la medición' in obs


def test_fila_a_registro_peso_de_masa_de_trigo_no_tiene_campo():
    fila = list(FILA_DISCOS)
    fila[9] = 76.5
    r = fila_a_registro(tuple(fila), LAYOUT_TRIGO, TRIGO, date(2026, 8, 1), True, 'x')
    assert 'pesoMasa' not in r['valores']
    assert 76.5 not in r['valores'].values()


# ───────────── Hoja completa ─────────────

def _hoja(filas):
    from openpyxl import Workbook
    ws = Workbook().active
    ws.title = 'Control de calidad'
    ws.append(['LINEA 2- EMPANADAS DE HARINA, DISCOS Y PASTELITOS'])
    ws.append([None])
    ws.append(['DATOS GENERALES'])
    ws.append(list(ENC_TRIGO))
    for f in filas:
        ws.append(list(f))
    return ws


def _con(fila, **cambios):
    f = list(fila)
    for i, v in cambios.items():
        f[int(i[1:])] = v
    return tuple(f)


def test_extraer_hoja_corrige_fechas_y_rechaza_las_malas():
    from extractores.empanadas import _extraer_hoja
    filas = [
        FILA_DISCOS,                                                         # 01/08 leído como 8 de enero
        _con(FILA_DISCOS, c1='17/08/2026', c19=29071, c20='17/02/2027'),
        _con(FILA_DISCOS, c1=datetime(2026, 1, 9), c19=29306, c20=datetime(2027, 1, 3)),  # 01/09
        _con(FILA_DISCOS, c1='sept 15', c19=1),
        _con(FILA_DISCOS, c1='15/09/2024', c19=2),
        _con(FILA_DISCOS, c1=None, c19=3),
        (22,) + (None,) * 27,                                                # plantilla sin datos
    ]
    regs, rech, info = _extraer_hoja(_hoja(filas), 'trigo.xlsx', TRIGO, LAYOUT_TRIGO, date(2026, 10, 12))
    assert [(r['fecha'], r['valores']['vencimiento']) for r in regs] == [
        ('2026-08-01', '2027-02-01'), ('2026-08-17', '2027-02-17'), ('2026-09-01', '2027-03-01')]
    assert regs[0]['fuente'] == 'trigo.xlsx › Control de calidad › fila 5'
    assert [(r['fuente'].rsplit(' ', 1)[1], r['motivo']) for r in rech] == [
        ('8', 'fecha de producción ilegible'),
        ('9', 'fecha fuera de rango (2025-01-01 a hoy)'),
        ('10', 'sin fecha de producción'),
    ]
    assert info['sin_destino'] == {}


def test_extraer_hoja_con_encabezado_cambiado_rechaza_la_hoja():
    from extractores.empanadas import _extraer_hoja
    ws = _hoja([FILA_DISCOS])
    ws.cell(row=4, column=7, value='TEMPERATURA DEL HORNO')
    regs, rech, _ = _extraer_hoja(ws, 'trigo.xlsx', TRIGO, LAYOUT_TRIGO, date(2026, 10, 12))
    assert regs == []
    assert rech[0]['motivo'] == 'encabezados distintos a la plantilla'
    assert 'TEMPERATURA DEL HORNO' in rech[0]['contenido']
