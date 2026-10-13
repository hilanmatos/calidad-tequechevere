from datetime import date, datetime, time

import pytest

from normalizar import (conforme, corregir_secuencia, falla, fecha, fecha_con_mes, hora, lavado, numero, peso_kg,
                        texto, vacio)

HOY = date(2026, 10, 12)


@pytest.mark.parametrize('v', [None, '', '  ', '-', 'NA', 'N/A', 'na', 'n/a', '—'])
def test_vacio_reconoce_celdas_sin_dato(v):
    assert vacio(v)


def test_vacio_no_confunde_cero_con_vacio():
    assert not vacio(0)


def test_numero_quita_unidades():
    assert numero('33.6°C') == 33.6


def test_numero_acepta_coma_decimal():
    assert numero('172,8 °C') == 172.8


def test_numero_de_guion_es_none():
    assert numero('-') is None


def test_numero_de_texto_sin_cifras_es_none():
    assert numero('Equipo de freído dañado') is None


def test_numero_negativo():
    assert numero('-18.5') == -18.5


def test_numero_deja_pasar_numeros():
    assert numero(4) == 4.0


def test_peso_kg_con_gramos():
    assert peso_kg('484g') == 0.484


def test_peso_kg_gramos_sin_unidad_mayores_a_50():
    assert peso_kg(881) == 0.881


def test_peso_kg_ya_en_kg():
    assert peso_kg('0.912 kg') == 0.912
    assert peso_kg(0.45) == 0.45


def test_fecha_texto_dia_mes_anio():
    assert fecha('13/12/2025') == date(2025, 12, 13)


def test_fecha_texto_con_guiones_y_anio_corto():
    assert fecha('13-04-2026') == date(2026, 4, 13)
    assert fecha('15/09/25') == date(2025, 9, 15)


def test_fecha_desde_datetime():
    assert fecha(datetime(2026, 7, 21, 0, 0)) == date(2026, 7, 21)


def test_fecha_invalida_es_none():
    assert fecha('31/02/2026') is None
    assert fecha('Semana 3') is None


def test_fecha_con_mes_invierte_si_el_mes_lo_pide():
    # Excel leyó 01/08 como 8 de enero; la columna "Mes" dice agosto
    assert fecha_con_mes(datetime(2026, 1, 8), 'agosto') == date(2026, 8, 1)


def test_fecha_con_mes_respeta_la_fecha_correcta():
    assert fecha_con_mes('21/07/2026', 'julio') == date(2026, 7, 21)


def test_corregir_secuencia_invierte_dia_y_mes_fuera_de_orden():
    entrada = ['31/07/2026', datetime(2026, 1, 8), datetime(2026, 2, 8)]
    assert corregir_secuencia(entrada, HOY) == [date(2026, 7, 31), date(2026, 8, 1), date(2026, 8, 2)]


def test_corregir_secuencia_no_toca_dias_mayores_a_12():
    assert corregir_secuencia([datetime(2026, 9, 15), datetime(2026, 9, 16)], HOY) == [date(2026, 9, 15), date(2026, 9, 16)]


def test_corregir_secuencia_invierte_fechas_futuras():
    assert corregir_secuencia([datetime(2026, 11, 4)], HOY) == [date(2026, 4, 11)]


def test_corregir_secuencia_conserva_vacios():
    assert corregir_secuencia(['01/09/2026', None, '03/09/2026'], HOY) == [date(2026, 9, 1), None, date(2026, 9, 3)]


def test_conforme_por_defecto():
    assert conforme('Correcta') == 'Conforme'
    assert conforme('Bueno') == 'Conforme'
    assert conforme('Incorrecto') == 'No conforme'
    assert conforme('No conforme') == 'No conforme'


def test_conforme_con_las_opciones_del_campo():
    assert conforme('Correcto', ('Correcta', 'Incorrecta')) == 'Correcta'
    assert conforme('Malo', ('Correcta', 'Incorrecta')) == 'Incorrecta'


def test_conforme_sin_dato_o_desconocido_es_none():
    assert conforme('-') is None
    assert conforme('Equipo dañado') is None


def test_falla_con_escala_uno_cumple():
    assert falla(1, escala='1=cumple') is False
    assert falla(0, escala='1=cumple') is True


def test_falla_con_escala_cero_cumple():
    assert falla(0, escala='0=cumple') is False
    assert falla('1', escala='0=cumple') is True


def test_falla_sin_dato_es_none():
    assert falla('N/A', escala='1=cumple') is None


def test_lavado():
    assert lavado(0) == 'lavo'
    assert lavado('1') == 'no'
    assert lavado('-') == 'ausente'
    assert lavado('v') == 'ausente'  # "vacación" escrita letra por letra
    assert lavado(None) is None


def test_hora():
    assert hora(time(6, 30)) == '06:30'
    assert hora('14:05:00') == '14:05'
    assert hora('7:30') == '07:30'
    assert hora('-') is None


def test_hora_respeta_am_pm():
    assert hora('2:30 pm') == '14:30'
    assert hora('2:30 p. m.') == '14:30'
    assert hora('12:30 p.m.') == '12:30'
    assert hora('12:15 am') == '00:15'
    assert hora('9:30 a. m.') == '09:30'


def test_texto():
    assert texto('  Equipo de freído dañado ') == 'Equipo de freído dañado'
    assert texto('NA') is None
