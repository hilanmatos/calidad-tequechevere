from datetime import date, datetime

import pytest

from extractores.temp_cuartos import campo_cuarto, registros_de_filas

HOY = date(2026, 10, 12)

ENCABEZADO = ('Fecha', 'Cuarto Frío PB Pistola', 'Cuarto Frío PB Cuarto Frío', 'Cuarto de Congelación Planta Baja Pistola',
              'Cuarto de Congelación PB Cuarto ', 'Cuarto Frío PA Pistola', 'Cuarto Frío PA Cuarto',
              'Cuarto de CongelaciónPA Pistola', 'Cuarto de CongelaciónPA  Cuarto')
TITULO = ('Registro de temperatura Cuartos de Almacenamiento en Frío',) + (None,) * 8


@pytest.mark.parametrize('encabezado, campo', [
    ('Cuarto Frío PB Pistola', 'frioPBPistola'),
    ('Cuarto Frío PB Cuarto Frío', 'frioPBDisplay'),
    ('Cuarto de Congelación Planta Baja Pistola', 'congPBPistola'),
    ('Cuarto de Congelación PB Cuarto ', 'congPBDisplay'),
    ('Cuarto Frío PA Pistola', 'frioPAPistola'),
    ('Cuarto Frío PA Cuarto', 'frioPADisplay'),
    ('Cuarto de CongelaciónPA Pistola', 'congPAPistola'),
    ('Cuarto de CongelaciónPA  Cuarto', 'congPADisplay'),
])
def test_campo_cuarto_reconoce_las_ocho_columnas(encabezado, campo):
    assert campo_cuarto(encabezado) == campo


@pytest.mark.parametrize('encabezado', ['Fecha', 'Observaciones', None, 'Cuarto Frío Pistola', 'Temperatura PB'])
def test_campo_cuarto_sin_destino(encabezado):
    assert campo_cuarto(encabezado) is None


def _extraer(*filas):
    return registros_de_filas([TITULO, ENCABEZADO, *filas], HOY, 'temp.xlsx', 'Hoja1')


def test_fila_completa_produce_un_registro_por_dia():
    registros, rechazos, sin_destino = _extraer(('13/09/2026', -1.4, 3.3, -26.7, -17.9, -0.4, 3.1, -13.8, -4.9))
    assert rechazos == [] and sin_destino == []
    (r,) = registros
    assert r['formato'] == 'temp-cuartos'
    assert r['fecha'] == '2026-09-13'
    assert r['hora'] is None and r['area'] is None and r['producto'] is None and r['lote'] is None
    assert r['valores'] == {
        'frioPBPistola': -1.4, 'frioPBDisplay': 3.3, 'congPBPistola': -26.7, 'congPBDisplay': -17.9,
        'frioPAPistola': -0.4, 'frioPADisplay': 3.1, 'congPAPistola': -13.8, 'congPADisplay': -4.9,
    }
    assert r['observaciones'] is None and r['realizado_por'] is None
    assert r['fuente'] == 'temp.xlsx › Hoja1 › fila 3'


def test_no_envia_diferencias_calculadas():
    registros, _, _ = _extraer(('13/09/2026', -1.4, 3.3, -26.7, -17.9, -0.4, 3.1, -13.8, -4.9))
    assert not any(k.endswith('Diferencia') for k in registros[0]['valores'])


def test_corrige_fechas_de_excel_con_dia_y_mes_invertidos():
    registros, _, _ = _extraer(
        (datetime(2026, 5, 9), 1, 1, 1, 1, 1, 1, 1, 1),
        (datetime(2026, 10, 9), 1, 1, 1, 1, 1, 1, 1, 1),
        ('13/09/2026', 1, 1, 1, 1, 1, 1, 1, 1),
        ('30/09/2026', 1, 1, 1, 1, 1, 1, 1, 1),
        (datetime(2026, 1, 10), 1, 1, 1, 1, 1, 1, 1, 1),
    )
    assert [r['fecha'] for r in registros] == ['2026-09-05', '2026-09-10', '2026-09-13', '2026-09-30', '2026-10-01']


def test_ignora_filas_vacias_sin_rechazarlas():
    registros, rechazos, _ = _extraer((None,) * 9, ('13/09/2026', 1, 1, 1, 1, 1, 1, 1, 1))
    assert len(registros) == 1 and rechazos == []
    assert registros[0]['fuente'].endswith('fila 4')


def test_rechaza_fila_sin_fecha():
    _, rechazos, _ = _extraer((None, 1, 1, 1, 1, 1, 1, 1, 1))
    assert rechazos[0]['motivo'] == 'sin fecha'
    assert rechazos[0]['fuente'] == 'temp.xlsx › Hoja1 › fila 3'


def test_rechaza_fecha_ilegible():
    _, rechazos, _ = _extraer(('ayer', 1, 1, 1, 1, 1, 1, 1, 1))
    assert rechazos[0]['motivo'] == 'fecha ilegible'
    assert 'ayer' in rechazos[0]['contenido']


def test_rechaza_fecha_fuera_de_rango():
    registros, rechazos, _ = _extraer(('15/12/2024', 1, 1, 1, 1, 1, 1, 1, 1), ('20/10/2026', 1, 1, 1, 1, 1, 1, 1, 1))
    assert registros == []
    assert [r['motivo'] for r in rechazos] == ['fecha fuera de rango (2025-01-01 a hoy)'] * 2


def test_rechaza_dia_repetido_y_conserva_el_primero():
    registros, rechazos, _ = _extraer(('13/09/2026', 1, 1, 1, 1, 1, 1, 1, 1), ('13/09/2026', 2, 2, 2, 2, 2, 2, 2, 2))
    assert len(registros) == 1 and registros[0]['valores']['frioPBPistola'] == 1
    assert rechazos[0]['motivo'] == 'día repetido: ya hay un registro de 2026-09-13 (fila 3)'
    assert rechazos[0]['fuente'].endswith('fila 4')


def test_rechaza_fila_con_fecha_pero_sin_lecturas():
    _, rechazos, _ = _extraer(('13/09/2026',) + (None,) * 8)
    assert rechazos[0]['motivo'] == 'sin lecturas de temperatura'


def test_texto_en_celda_de_temperatura_va_a_observaciones():
    registros, _, _ = _extraer(('13/09/2026', 1, 1, 1, 1, 1, 1, 'dañado', '3,5 °C'))
    r = registros[0]
    assert 'congPAPistola' not in r['valores']
    assert r['valores']['congPADisplay'] == 3.5
    assert r['observaciones'] == "Congelación PA: pistola sin número en el Excel: 'dañado'"


def test_reporta_columnas_sin_destino_y_lleva_observaciones():
    filas = [TITULO, ENCABEZADO + ('Observaciones', 'Revisado'),
             ('13/09/2026', 1, 1, 1, 1, 1, 1, 1, 1, 'Puerta abierta', 'JC')]
    registros, _, sin_destino = registros_de_filas(filas, HOY, 'temp.xlsx', 'Hoja1')
    assert registros[0]['observaciones'] == 'Puerta abierta'
    assert sin_destino == ['Revisado']


def test_hoja_sin_encabezado_se_rechaza():
    registros, rechazos, _ = registros_de_filas([('hola',), ('mundo',)], HOY, 'temp.xlsx', 'Hoja2')
    assert registros == []
    assert rechazos == [{'fuente': 'temp.xlsx › Hoja2', 'motivo': 'hoja sin encabezado reconocible', 'contenido': 'hola'}]
