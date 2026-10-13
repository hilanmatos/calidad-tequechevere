from operarios import area_de, canonico


def test_canonico_agrega_acentos_del_catalogo():
    assert canonico('Moises Silva') == 'Moisés Silva'
    assert canonico('Carlos Martinez') == 'Carlos Martínez'


def test_canonico_resuelve_nombres_cortos_del_lavado():
    assert canonico('Magdiel') == 'Magdiel Denis'
    assert canonico('José C.') == 'José Castillo'
    assert canonico('  belbis ') == 'Belbis Robles'


def test_canonico_conserva_operarios_que_ya_no_estan():
    assert canonico('Allan Carrión') == 'Allan Carrión'
    assert canonico('mauricio s.') == 'Mauricio S.'


def test_canonico_de_vacio_es_none():
    assert canonico('  ') is None
    assert canonico(None) is None


def test_canonico_alias_del_lavado_y_la_higiene_historica():
    assert canonico('Enrique ') == 'Enrique Wigun'
    assert canonico('José G') == 'José González'
    assert canonico('Emmanuel ') == 'Emmanuel V.'
    assert canonico('Lenny') == 'Lenny Mejia'
    assert canonico('Lenny Mejias') == 'Lenny Mejia'


def test_canonico_no_une_nombres_dudosos():
    assert canonico('Enrique F.') == 'Enrique F.'
    assert canonico('José Guevara') == 'José Guevara'
    assert canonico('Diego Arce') == 'Diego Arce'
    assert canonico('Moises Hurtado') == 'Moises Hurtado'


def test_canonico_jose_del_lavado_es_jose_castillo():
    # Operaciones (12/10/2026): "José" (lavado abr–jul) y "José C." (desde jul) son la misma persona
    assert canonico('José') == 'José Castillo'


def test_area_de_operario_vigente():
    assert area_de('Ricardo Gallardo') == 'Gluten Free'
    assert area_de('Olga Palacios') == 'Planta Alta'
    assert area_de('Allan Carrión') is None
