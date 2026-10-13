"""Recupera desde un respaldo las filas que ya no están en la base. Nunca modifica ni borra lo que existe.

Uso, desde tools/respaldo:
    python restaurar.py "<respaldo.zip>"                     muestra qué falta en la base (no escribe nada)
    python restaurar.py "<respaldo.zip>" --aplicar            vuelve a insertar lo que falta
    python restaurar.py "<respaldo.zip>" --tablas registros   solo esas tablas

El historial de cambios (registros_historial) queda en el ZIP como evidencia, pero no se reinserta: su id lo genera
la base. Para restaurar perfiles, las cuentas tienen que existir en Authentication (se crean desde Supabase).
"""
import argparse
import json
import sys
import zipfile
from pathlib import Path

from respaldo import TABLAS, exportar_tabla, faltantes, leer_env, pedir, verificar_zip

ORDEN = ['perfiles', 'operarios', 'productos', 'registros', 'cierres_dia']  # padres antes que hijos


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('respaldo', type=Path)
    ap.add_argument('--tablas', nargs='*', default=ORDEN, choices=ORDEN)
    ap.add_argument('--aplicar', action='store_true')
    args = ap.parse_args()

    conteos = verificar_zip(args.respaldo)
    print(f'Respaldo íntegro: {args.respaldo.name}  ({", ".join(f"{k}={v}" for k, v in conteos.items())})')
    base, llave = leer_env()
    with zipfile.ZipFile(args.respaldo) as z:
        for tabla in [t for t in ORDEN if t in args.tablas]:
            clave = TABLAS[tabla]
            filas = json.loads(z.read(f'tablas/{tabla}.json'))
            actuales = {str(f[clave]) for f in exportar_tabla(base, llave, f'{tabla}', clave)}
            faltan = faltantes(filas, actuales, clave)
            print(f'{tabla:12} en el respaldo {len(filas):5} | faltan en la base {len(faltan):5}')
            if args.aplicar and faltan:
                for i in range(0, len(faltan), 200):
                    pedir(base, llave, 'POST', f'rest/v1/{tabla}', faltan[i:i + 200])
                print(f'{"":12} reinsertadas {len(faltan)}')
    if not args.aplicar:
        print('\nNo se escribió nada. Para reinsertar lo que falta, repetir con --aplicar.')


if __name__ == '__main__':
    main()
