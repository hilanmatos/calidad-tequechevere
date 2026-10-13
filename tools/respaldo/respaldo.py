"""Respaldo de la base de Calidad Chévere: exporta todas las tablas y las fotos a un ZIP verificado.

Uso (lo corre la tarea programada de Windows; ver instalar_tarea.ps1):
    python respaldo.py --destino "<carpeta en Dropbox>" [--conservar 90]

Cada ZIP lleva tablas/<tabla>.json, fotos/<ruta> y manifest.json con los conteos y el sha256 de cada archivo.
Se verifica al terminar; se conservan los últimos `--conservar` y se anota cada corrida en registro-respaldos.log.
Solo lee VITE_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY de .env.local (raíz del repo).
"""
import argparse
import hashlib
import json
import re
import sys
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
# tabla → columna para ordenar al paginar (su clave primaria)
TABLAS = {'perfiles': 'id', 'operarios': 'id', 'productos': 'id', 'registros': 'id', 'registros_historial': 'id',
          'cierres_dia': 'fecha'}
BUCKET = 'fotos'
PATRON = re.compile(r'^respaldo-calidad-\d{4}-\d{2}-\d{2}_\d{4}\.zip$')
REGISTRO = 'registro-respaldos.log'


def nombre_respaldo(momento: datetime) -> str:
    return f'respaldo-calidad-{momento:%Y-%m-%d_%H%M}.zip'


def a_borrar(nombres, conservar: int):
    """Respaldos a borrar: los más viejos que exceden `conservar`. Otros archivos de la carpeta no se tocan."""
    respaldos = sorted(n for n in nombres if PATRON.match(n))
    return respaldos[:max(len(respaldos) - conservar, 0)]


def faltantes(filas, actuales, clave: str):
    """Filas del respaldo cuya clave ya no está en la base."""
    return [f for f in filas if str(f[clave]) not in actuales]


def armar_zip(ruta: Path, tablas: dict, fotos: dict, meta: dict):
    hashes = {}
    with zipfile.ZipFile(ruta, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        for tabla, filas in tablas.items():
            datos = json.dumps(filas, ensure_ascii=False, default=str).encode('utf-8')
            nombre = f'tablas/{tabla}.json'
            z.writestr(nombre, datos)
            hashes[nombre] = hashlib.sha256(datos).hexdigest()
        for nombre, datos in fotos.items():
            z.writestr(nombre, datos)
            hashes[nombre] = hashlib.sha256(datos).hexdigest()
        manifest = {**meta, 'creado': datetime.now().isoformat(timespec='seconds'),
                    'tablas': {t: len(f) for t, f in tablas.items()}, 'fotos': len(fotos), 'sha256': hashes}
        z.writestr('manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2))


def verificar_zip(ruta: Path) -> dict:
    """Comprueba el sha256 de cada archivo y los conteos del manifest. Devuelve los conteos; si algo no cuadra, ValueError."""
    with zipfile.ZipFile(ruta) as z:
        manifest = json.loads(z.read('manifest.json'))
        for nombre, esperado in manifest['sha256'].items():
            if hashlib.sha256(z.read(nombre)).hexdigest() != esperado:
                raise ValueError(f'{nombre}: el contenido no coincide con el manifest')
        conteos = {}
        for tabla, n in manifest['tablas'].items():
            filas = json.loads(z.read(f'tablas/{tabla}.json'))
            if len(filas) != n:
                raise ValueError(f'tablas/{tabla}.json: {len(filas)} filas, el manifest dice {n}')
            conteos[tabla] = n
        conteos['fotos'] = manifest['fotos']
    return conteos


# ───────────── acceso a Supabase ─────────────

def leer_env():
    v = {}
    for linea in open(RAIZ / '.env.local', encoding='utf-8'):
        k, _, x = linea.strip().partition('=')
        if k in ('VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'):
            v[k] = x.strip().strip('"')
    return v['VITE_SUPABASE_URL'].rstrip('/'), v['SUPABASE_SERVICE_ROLE_KEY']


def pedir(base, llave, metodo, ruta, cuerpo=None, crudo=False):
    req = urllib.request.Request(
        f'{base}/{ruta}', method=metodo, data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
        headers={'apikey': llave, 'Authorization': f'Bearer {llave}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        datos = r.read()
    return datos if crudo else json.loads(datos or b'null')


def exportar_tabla(base, llave, tabla, orden):
    filas = []
    while True:
        pagina = pedir(base, llave, 'GET', f'rest/v1/{tabla}?select=*&order={orden}&limit=1000&offset={len(filas)}')
        filas += pagina
        if len(pagina) < 1000:
            return filas


def listar_fotos(base, llave, prefijo=''):
    rutas = []
    items = pedir(base, llave, 'POST', f'storage/v1/object/list/{BUCKET}',
                  {'prefix': prefijo, 'limit': 1000, 'offset': 0, 'sortBy': {'column': 'name', 'order': 'asc'}})
    for it in items:
        if it.get('id') is None:  # carpeta
            rutas += listar_fotos(base, llave, f'{prefijo}{it["name"]}/')
        else:
            rutas.append(f'{prefijo}{it["name"]}')
    return rutas


def exportar_todo():
    base, llave = leer_env()
    tablas = {t: exportar_tabla(base, llave, t, orden) for t, orden in TABLAS.items()}
    fotos = {f'fotos/{r}': pedir(base, llave, 'GET', f'storage/v1/object/{BUCKET}/{urllib.parse.quote(r)}', crudo=True)
             for r in listar_fotos(base, llave)}
    return tablas, fotos, {'proyecto': base.split('//')[-1].split('.')[0]}


def anotar(destino: Path, texto: str):
    with open(destino / REGISTRO, 'a', encoding='utf-8') as f:
        f.write(f'{datetime.now():%Y-%m-%d %H:%M}  {texto}\n')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--destino', required=True, type=Path)
    ap.add_argument('--conservar', type=int, default=90)
    args = ap.parse_args()
    args.destino.mkdir(parents=True, exist_ok=True)
    try:
        tablas, fotos, meta = exportar_todo()
        final = args.destino / nombre_respaldo(datetime.now())
        temporal = final.with_suffix('.tmp')
        armar_zip(temporal, tablas, fotos, meta)
        conteos = verificar_zip(temporal)
        temporal.replace(final)
        for viejo in a_borrar([p.name for p in args.destino.iterdir()], args.conservar):
            (args.destino / viejo).unlink()
        resumen = ' '.join(f'{k}={v}' for k, v in conteos.items())
        anotar(args.destino, f'OK     {final.name}  {resumen}  {final.stat().st_size // 1024} KB')
        print(f'Respaldo listo: {final}\n{resumen}')
    except Exception as e:  # se anota para que una falla no pase desapercibida
        anotar(args.destino, f'ERROR  {type(e).__name__}: {e}')
        raise


if __name__ == '__main__':
    main()
