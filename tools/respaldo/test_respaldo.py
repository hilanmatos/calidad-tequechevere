import json
import zipfile
from datetime import datetime

import pytest

from respaldo import a_borrar, armar_zip, faltantes, nombre_respaldo, verificar_zip


def test_nombre_respaldo_ordena_por_fecha():
    assert nombre_respaldo(datetime(2026, 10, 12, 15, 30)) == 'respaldo-calidad-2026-10-12_1530.zip'


def test_a_borrar_conserva_los_mas_recientes():
    nombres = [nombre_respaldo(datetime(2026, 10, d, 13, 0)) for d in range(1, 6)]
    assert a_borrar(nombres, conservar=3) == [nombre_respaldo(datetime(2026, 10, 1, 13, 0)),
                                              nombre_respaldo(datetime(2026, 10, 2, 13, 0))]


def test_a_borrar_ignora_archivos_que_no_son_respaldos():
    nombres = ['registro-respaldos.log', 'notas.txt', 'respaldo-calidad-2026-10-01_1300.zip']
    assert a_borrar(nombres, conservar=0) == ['respaldo-calidad-2026-10-01_1300.zip']


def test_a_borrar_nunca_borra_si_hay_menos_que_conservar():
    assert a_borrar(['respaldo-calidad-2026-10-01_1300.zip'], conservar=90) == []


def _tablas():
    return {'operarios': [{'id': 'a', 'nombre': 'Olga Palacios'}], 'registros': [{'id': '1'}, {'id': '2'}]}


def test_armar_y_verificar_zip(tmp_path):
    ruta = tmp_path / 'r.zip'
    armar_zip(ruta, _tablas(), {'fotos/x.jpg': b'\xff\xd8'}, {'proyecto': 'p'})
    assert verificar_zip(ruta) == {'operarios': 1, 'registros': 2, 'fotos': 1}


def test_verificar_zip_detecta_un_archivo_alterado(tmp_path):
    ruta = tmp_path / 'r.zip'
    armar_zip(ruta, _tablas(), {}, {'proyecto': 'p'})
    alterado = tmp_path / 'alterado.zip'
    with zipfile.ZipFile(ruta) as z, zipfile.ZipFile(alterado, 'w') as w:
        for n in z.namelist():
            datos = z.read(n)
            w.writestr(n, json.dumps([{'id': '1'}]) if n == 'tablas/registros.json' else datos)
    with pytest.raises(ValueError, match='registros'):
        verificar_zip(alterado)


def test_faltantes_devuelve_filas_que_ya_no_estan_en_la_base():
    respaldo = [{'id': '1'}, {'id': '2'}, {'id': '3'}]
    assert faltantes(respaldo, actuales={'1', '3'}, clave='id') == [{'id': '2'}]
