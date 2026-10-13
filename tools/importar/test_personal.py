from datetime import date, datetime, time

import pytest

from extractores.personal import (area_app, area_cercana, columnas_de, columnas_lavado, corregir_arrastre, detectar_escala,
                                  dia_lavado, estado_higiene, estado_lavado, evaluar_fila, fuera_de_secuencia,
                                  lunes_de_bloque, rellenar_fechas, repartir_combinado, bloques_repetidos)


# ---------- áreas ----------

@pytest.mark.parametrize('texto, area', [
    ('TEQUEÑOS', 'Planta Alta'), ('Tequeños', 'Planta Alta'), ('Planta alta', 'Planta Alta'), ('TQ', 'Planta Alta'),
    ('Gluten Free', 'Gluten Free'), ('GF', 'Gluten Free'), ('Tienda', 'Tienda'),
])
def test_area_app_traduce_las_areas_del_excel(texto, area):
    assert area_app(texto) == area


def test_area_app_desconocida_o_vacia_es_none():
    assert area_app('Bodega') is None
    assert area_app(None) is None


# ---------- encabezados de higiene ----------

@pytest.mark.parametrize('encabezado, columnas', [
    ('Estado de salud', ('salud',)),
    ('Manos limpias y uñas cortas', ('manos',)),
    ('Cabello,barba completamente cubierto', ('cabello', 'barba')),
    ('Cabello cubierto', ('cabello',)),
    ('Barba con cubre barba', ('barba',)),
    ('Uso adecuado de mascarrilla', ('mascarilla',)),
    ('Uniforme llimpio y en buen estado', ('uniforme',)),
    ('Zapatos limpios y cerrados', ('zapatos',)),
    ('Uso correcto de accesorios del uniforme (delantal,mangas, etc.)', ('delantal',)),
    ('Delantal y cubre mangas cuando aplique', ('delantal',)),
    ('Maquillaje', ('maquillaje',)),
    ('Sin maquillaje y sin pestañas postizas', ('maquillaje',)),
    ('Ausencia de accesorios (joyas,relojes,etc.)', ('accesorios',)),
])
def test_columnas_de_mapea_cada_criterio(encabezado, columnas):
    assert columnas_de(encabezado) == columnas


@pytest.mark.parametrize('encabezado', ['TOTAL DE OBSERVACIONES:', 'observaciones', 'Operarios', None])
def test_columnas_de_ignora_lo_que_no_es_criterio(encabezado):
    assert columnas_de(encabezado) is None


# ---------- estados de higiene ----------

def test_estado_higiene_con_escala_uno_cumple():
    assert estado_higiene(1, '1=cumple') == 'cumple'
    assert estado_higiene(0, '1=cumple') == 'falla'


def test_estado_higiene_con_escala_cero_cumple():
    assert estado_higiene(0, '0=cumple') == 'cumple'
    assert estado_higiene(1, '0=cumple') == 'falla'
    assert estado_higiene('0´', '0=cumple') == 'cumple'


@pytest.mark.parametrize('v', ['NA', 'N/A', 'N/a', 'na', ' NA '])
def test_estado_higiene_no_aplica(v):
    assert estado_higiene(v, '0=cumple') == 'na'


def test_estado_higiene_guion_y_vacio():
    assert estado_higiene('-', '0=cumple') == '-'
    assert estado_higiene(None, '0=cumple') is None
    assert estado_higiene('  ', '0=cumple') is None


@pytest.mark.parametrize('v', [11, 'o', 'N/1', 2])
def test_estado_higiene_valor_no_interpretable(v):
    assert estado_higiene(v, '1=cumple') == 'ilegible'


def test_detectar_escala_por_mayoria():
    assert detectar_escala([1, 1, 1, 0, 1, 1]) == '1=cumple'
    assert detectar_escala([0, 0, 1, 0, 0, '-', None]) == '0=cumple'


def test_detectar_escala_sin_mayoria_clara_es_none():
    assert detectar_escala([0, 1, 0, 1]) is None
    assert detectar_escala([]) is None


# ---------- criterio combinado "Cabello, barba" ----------

def test_repartir_combinado_cumple_y_na_van_a_ambas():
    assert repartir_combinado('cumple', None) == {'cabello': 'cumple', 'barba': 'cumple'}
    assert repartir_combinado('na', None) == {'cabello': 'na', 'barba': 'na'}


def test_repartir_combinado_falla_segun_la_observacion():
    assert repartir_combinado('falla', 'Barba larga') == {'cabello': 'cumple', 'barba': 'falla'}
    assert repartir_combinado('falla', 'cabello fuera de la redecilla') == {'cabello': 'falla', 'barba': 'cumple'}
    assert repartir_combinado('falla', 'Uñas y barba larga, pelo suelto') == {'cabello': 'falla', 'barba': 'falla'}


def test_repartir_combinado_falla_sin_pista_va_a_cabello():
    assert repartir_combinado('falla', None) == {'cabello': 'falla'}
    assert repartir_combinado('falla', 'Mascarilla abajo') == {'cabello': 'falla'}


# ---------- fila de higiene ----------

COLS_VIEJAS = [('salud',), ('manos',), ('cabello', 'barba'), ('mascarilla',), ('uniforme',), ('delantal',),
               ('maquillaje',), ('accesorios',)]


NO_EVALUADO = {c: 'na' for c in ('salud', 'manos', 'cabello', 'barba', 'mascarilla', 'uniforme', 'zapatos', 'delantal',
                                  'maquillaje', 'accesorios')}


def test_evaluar_fila_formato_viejo_con_combinado_y_observacion():
    fila, ilegibles = evaluar_fila(list(zip(COLS_VIEJAS, [1, 0, 0, 1, 1, 1, 'N/A', 1])), '1=cumple', 'Uñas y barba larga')
    assert ilegibles == []
    # zapatos no existía en el formato viejo: no se evaluó → 'na'
    assert fila == {'salud': 'cumple', 'manos': 'falla', 'cabello': 'cumple', 'barba': 'falla', 'mascarilla': 'cumple',
                    'uniforme': 'cumple', 'zapatos': 'na', 'delantal': 'cumple', 'maquillaje': 'na',
                    'accesorios': 'cumple', '_obs': 'Uñas y barba larga'}


def test_evaluar_fila_todo_guiones_es_ausente():
    fila, _ = evaluar_fila([(('salud',), '-'), (('manos',), '-'), (('barba',), '-')], '0=cumple', None)
    assert fila == {'_ausente': 'si'}


def test_evaluar_fila_guion_parcial_es_no_aplica():
    fila, _ = evaluar_fila([(('salud',), 1), (('manos',), '-'), (('barba',), '-')], '0=cumple', None)
    assert fila == {**NO_EVALUADO, 'salud': 'falla', 'manos': 'na', 'barba': 'na'}


def test_evaluar_fila_celda_vacia_queda_no_aplica():
    # sin dato no es "cumple": el motor completaría 'cumple' si la celda no se enviara
    fila, _ = evaluar_fila([(('salud',), 0), (('manos',), None)], '0=cumple', None)
    assert fila == {**NO_EVALUADO, 'salud': 'cumple'}


def test_evaluar_fila_reporta_ilegibles_y_conserva_el_resto():
    fila, ilegibles = evaluar_fila([(('salud',), 1), (('manos',), 11)], '1=cumple', None)
    assert fila == {**NO_EVALUADO, 'salud': 'cumple'}
    assert ilegibles == [('manos', 11)]


def test_evaluar_fila_sin_ningun_valor_legible_es_none():
    fila, ilegibles = evaluar_fila([(('salud',), 'o'), (('manos',), 'o')], '0=cumple', None)
    assert fila is None
    assert len(ilegibles) == 2
    assert evaluar_fila([(('salud',), None)], '0=cumple', None) == (None, [])


# ---------- fechas de higiene ----------

def test_rellenar_fechas_hereda_solo_dentro_del_bloque():
    filas = [('02/02/2026', True), (None, True), (None, False), (None, True), ('05/02/2026', True)]
    assert rellenar_fechas(filas) == ['02/02/2026', '02/02/2026', None, None, '05/02/2026']


def test_corregir_arrastre_de_anio():
    entrada = [date(2025, 11, 14), date(2025, 11, 15), date(2026, 11, 15), date(2027, 11, 15), date(2025, 11, 17)]
    assert corregir_arrastre(entrada) == [date(2025, 11, 14), date(2025, 11, 15), date(2025, 11, 15),
                                          date(2025, 11, 15), date(2025, 11, 17)]


def test_corregir_arrastre_no_toca_dos_anios_sueltos_ni_vacios():
    entrada = [date(2025, 11, 15), date(2026, 11, 15), None, date(2026, 1, 2)]
    assert corregir_arrastre(entrada) == entrada


def test_fuera_de_secuencia_detecta_fechas_que_rompen_el_orden():
    f = [date(2025, 9, 15), date(2025, 9, 24), date(2025, 9, 24), date(2025, 9, 14), date(2025, 9, 15),
         date(2025, 10, 16)]
    assert fuera_de_secuencia(f) == {3, 4}


def test_fuera_de_secuencia_ignora_vacios_y_acepta_repetidas():
    f = [date(2026, 3, 2), None, date(2026, 3, 2), date(2026, 3, 3)]
    assert fuera_de_secuencia(f) == set()


def test_fuera_de_secuencia_cuenta_dias_no_filas_y_en_empate_conserva_las_primeras():
    # 15/09 y 24/09 (5 filas) contra un bloque arrastrado de 14/09 (5 filas) + 15/09: gana el orden original
    d = date
    f = [d(2025, 9, 15)] * 3 + [d(2025, 9, 24)] * 2 + [d(2025, 9, 14)] * 5 + [d(2025, 9, 15), d(2025, 10, 16)]
    assert fuera_de_secuencia(f) == set(range(5, 11))


def test_fuera_de_secuencia_descarta_un_salto_aislado():
    d = date
    f = [d(2025, 10, 1), d(2025, 10, 2), d(2026, 9, 14), d(2025, 10, 3), d(2025, 10, 4)]
    assert fuera_de_secuencia(f) == {2}


def test_bloques_repetidos_marca_el_bloque_que_repite_una_fecha():
    d27, d28 = date(2026, 2, 27), date(2026, 2, 28)
    assert bloques_repetidos([d27, d27, None, d27, d27, None, d28]) == {3, 4}


def test_bloques_repetidos_no_marca_un_dia_continuo():
    d15, d16 = date(2026, 6, 15), date(2026, 6, 16)
    assert bloques_repetidos([d15, d15, d15, d16, d16]) == set()


# ---------- lavado de manos ----------

def test_lunes_de_bloque_usa_el_inicio_si_es_lunes():
    assert lunes_de_bloque(date(2026, 6, 8), date(2026, 5, 13)) == date(2026, 6, 8)


def test_lunes_de_bloque_deduce_desde_el_fin_si_el_inicio_no_es_lunes():
    assert lunes_de_bloque(date(2026, 6, 9), date(2026, 6, 13)) == date(2026, 6, 8)
    assert lunes_de_bloque(None, date(2026, 6, 12)) == date(2026, 6, 8)


def test_lunes_de_bloque_sin_lunes_reconocible_es_none():
    assert lunes_de_bloque(date(2026, 6, 10), date(2026, 6, 17)) is None
    assert lunes_de_bloque(None, None) is None


def test_columnas_lavado_cuenta_los_dias_por_la_hora_0630():
    fila = ['N°', 'Nombre', time(6, 30), time(9, 30), time(12, 30), time(2, 30), time(6, 30), time(9, 30), None,
            time(6, 30), time(9, 30), time(12, 30)]
    assert columnas_lavado(fila) == [(2, 0, 'h0630'), (3, 0, 'h0930'), (4, 0, 'h1230'), (5, 0, 'h1430'),
                                     (6, 1, 'h0630'), (7, 1, 'h0930'), (9, 2, 'h0630'), (10, 2, 'h0930'),
                                     (11, 2, 'h1230')]


@pytest.mark.parametrize('v, estado', [
    (0, 'lavo'), (1, 'no'), ('0', 'lavo'), ('-', 'ausente'), ('v', 'ausente'), ('ENFER', 'ausente'), (None, None),
    ('  ', None), (2, 'ilegible'), ('.', 'ilegible'),
])
def test_estado_lavado(v, estado):
    assert estado_lavado(v) == estado


def test_dia_lavado_completo():
    assert dia_lavado({'h0630': 0, 'h0930': 1, 'h1230': 0, 'h1430': 0}) == (
        {'h0630': 'lavo', 'h0930': 'no', 'h1230': 'lavo', 'h1430': 'lavo'}, [])


def test_dia_lavado_todo_ausente():
    assert dia_lavado({'h0630': 'e', 'h0930': 's', 'h1230': None, 'h1430': None}) == ({'_ausente': 'si'}, [])


def test_dia_lavado_ausencia_parcial_queda_en_observacion():
    fila, _ = dia_lavado({'h0630': '-', 'h0930': '-', 'h1230': '-', 'h1430': 0})
    assert fila == {'h1430': 'lavo', '_obs': 'No estaba a las 06:30, 09:30 y 12:30'}


def test_dia_lavado_sin_datos_es_none():
    assert dia_lavado({'h0630': None, 'h0930': None}) == (None, [])


def test_dia_lavado_reporta_ilegibles():
    fila, ilegibles = dia_lavado({'h0630': 0, 'h0930': 2, 'h1230': 2})
    assert fila == {'h0630': 'lavo'}
    assert ilegibles == [('h0930', 2), ('h1230', 2)]


def test_area_cercana_usa_la_aparicion_mas_proxima():
    ap = [(date(2026, 3, 2), 'Gluten Free'), (date(2026, 4, 18), 'Gluten Free'), (date(2026, 1, 10), 'Planta Alta')]
    assert area_cercana(ap, date(2026, 4, 20)) == 'Gluten Free'
    assert area_cercana(ap, date(2026, 1, 12)) == 'Planta Alta'


def test_area_cercana_lejana_o_empatada_es_none():
    assert area_cercana([(date(2026, 1, 1), 'Planta Alta')], date(2026, 6, 1)) is None
    empate = [(date(2026, 5, 1), 'Planta Alta'), (date(2026, 5, 3), 'Gluten Free')]
    assert area_cercana(empate, date(2026, 5, 2)) is None
    assert area_cercana([], date(2026, 5, 2)) is None
