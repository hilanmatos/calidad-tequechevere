"""Lee los Excel de Calidad con todos los extractores y deja los registros listos para subir.

Uso (desde tools/importar):
    python importar.py --carpeta "<carpeta de Calidad>"

Escribe en salida/ (ignorada por git):
    registros.jsonl   un registro normalizado por línea, para subir.ts
    reporte.csv       filas rechazadas y su motivo, para revisión manual
No sube nada: la subida (con evaluación de desviaciones por el motor de la app) la hace subir.ts.
"""
import argparse
import csv
import importlib
import json
import pkgutil
import sys
from collections import Counter
from datetime import date
from pathlib import Path

import extractores

AQUI = Path(__file__).parent
SALIDA = AQUI / 'salida'
DESDE = date(2025, 1, 1)
AREAS = {'Planta Alta', 'Gluten Free'}
CLAVES = {'formato', 'fecha', 'hora', 'area', 'producto', 'lote', 'valores', 'observaciones', 'accion_correctiva',
          'realizado_por', 'fuente'}


def validar(r: dict, hoy: date) -> str | None:
    """Motivo de rechazo si el registro no cumple el contrato; None si está bien."""
    faltan = CLAVES - r.keys()
    if faltan:
        return f'faltan claves: {", ".join(sorted(faltan))}'
    try:
        f = date.fromisoformat(r['fecha'])
    except (TypeError, ValueError):
        return f'fecha inválida: {r["fecha"]!r}'
    if not DESDE <= f <= hoy:
        return f'fecha fuera de rango: {r["fecha"]}'
    if r['area'] is not None and r['area'] not in AREAS:
        return f'área desconocida: {r["area"]!r}'
    if not r['valores']:
        return 'registro sin valores'
    return None


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--carpeta', required=True, type=Path)
    ap.add_argument('--hoy', type=date.fromisoformat, default=date.today())
    ap.add_argument('--solo', nargs='*', help='nombres de módulos de extractores a correr (por defecto, todos)')
    args = ap.parse_args()

    modulos = [m.name for m in pkgutil.iter_modules(extractores.__path__) if not m.name.startswith('_')]
    if args.solo:
        modulos = [m for m in modulos if m in args.solo]
    registros, rechazos = [], []
    for nombre in sorted(modulos):
        mod = importlib.import_module(f'extractores.{nombre}')
        regs, rech = mod.extraer(args.carpeta, args.hoy)
        for r in regs:
            motivo = validar(r, args.hoy)
            if motivo:
                rechazos.append({'fuente': r.get('fuente', nombre), 'motivo': motivo, 'contenido': ''})
            else:
                registros.append(r)
        rechazos.extend(rech)
        print(f'{nombre}: {len(regs)} registros, {len(rech)} rechazos')

    SALIDA.mkdir(exist_ok=True)
    with open(SALIDA / 'registros.jsonl', 'w', encoding='utf-8', newline='\n') as f:
        for r in registros:
            f.write(json.dumps(r, ensure_ascii=False, default=str) + '\n')
    with open(SALIDA / 'reporte.csv', 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['fuente', 'motivo', 'contenido'], extrasaction='ignore')
        w.writeheader()
        w.writerows(rechazos)

    print('\nRegistros listos por formato:')
    for formato, n in sorted(Counter(r['formato'] for r in registros).items()):
        fechas = sorted(r['fecha'] for r in registros if r['formato'] == formato)
        print(f'  {formato:24} {n:5}  ({fechas[0]} a {fechas[-1]})')
    print(f'Total: {len(registros)} registros; {len(rechazos)} filas rechazadas (ver salida/reporte.csv)')
    for motivo, n in Counter(r['motivo'] for r in rechazos).most_common(12):
        print(f'  {n:5}  {motivo}')


if __name__ == '__main__':
    main()
