"""Nombres de operarios: de cómo los escribe cada Excel al nombre del catálogo de la app.

VIGENTES es el catálogo cargado en Supabase (hoja de higiene al 28/09/2026). ALIAS cubre las formas
cortas o sin acento que aparecen en los Excel. Un nombre que no está en ninguno de los dos se conserva
limpio: es un operario que ya no trabaja y se crea inactivo al subir.
"""
import re

from normalizar import sin_acentos

VIGENTES = {
    'Planta Alta': ['Belbis Robles', 'Dayanna Reyes', 'Diego', 'Erick Chaverra', 'Franko Smith', 'Hermel',
                    'Javier Etienne', 'José Castillo', 'Magdiel Denis', 'Moisés Silva', 'Olga Palacios'],
    'Gluten Free': ['Carlos Martínez', 'Enrique Wigun', 'Gabriel', 'Ricardo Gallardo'],
}

# clave normalizada (minúsculas, sin acentos ni puntos) → nombre del catálogo
ALIAS = {
    'belbis': 'Belbis Robles',
    'dayanna': 'Dayanna Reyes',
    'erick': 'Erick Chaverra',
    'franko': 'Franko Smith',
    'javier': 'Javier Etienne',
    'jose c': 'José Castillo',
    'magdiel': 'Magdiel Denis',
    'moises': 'Moisés Silva',
    'olga': 'Olga Palacios',
    'carlos': 'Carlos Martínez',
    'ricardo': 'Ricardo Gallardo',
    # Lavado de manos e higiene histórica (misma área y época; ver extractores/personal.py).
    'enrique': 'Enrique Wigun',      # lavado abr–oct 2026, GF; único Enrique de GF en 2026
    'jose g': 'José González',       # lavado abr–jun 2026, GF; José Guevara solo estuvo del 17 al 20/03
    'emmanuel': 'Emmanuel V.',       # ya no está: se crea inactivo
    'lenny': 'Lenny Mejia',          # ya no está: se crea inactivo
    'lenny mejias': 'Lenny Mejia',
    'jose': 'José Castillo',         # lavado abr–jul 2026 ("José C." desde jul); confirmado por Operaciones 12/10/2026
}


def clave(nombre: str) -> str:
    s = sin_acentos(nombre).lower().replace('.', ' ')
    return re.sub(r'\s+', ' ', s).strip()


_CATALOGO = {clave(n): n for nombres in VIGENTES.values() for n in nombres}
_AREA = {n: a for a, nombres in VIGENTES.items() for n in nombres}


def canonico(nombre):
    if nombre is None or not str(nombre).strip():
        return None
    k = clave(str(nombre))
    if k in _CATALOGO:
        return _CATALOGO[k]
    if k in ALIAS:
        return ALIAS[k]
    limpio = re.sub(r'\s+', ' ', str(nombre)).strip()
    return ' '.join(p[:1].upper() + p[1:] for p in limpio.split(' '))


def area_de(nombre):
    """Área actual del operario si está en el catálogo vigente."""
    return _AREA.get(canonico(nombre))
