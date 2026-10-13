# Importador del histórico

Pasa los Excel que Calidad llenaba a mano a la base de la app. Corre en la PC de Hilan; nunca en la tablet.

## Pasos

```
cd tools/importar
python -m pip install -r requirements.txt      # una sola vez
python -m pytest -q                             # normalizadores y extractores
python importar.py --carpeta "C:\Users\Usuario\Dropbox\TEQUE CHEVERE INTERNACIONAL, S.A\DEPARTAMENTOS\Calidad e Inocuidad\Monitoreo de calidad en planta AUTOMATIZADO"
cd ../..
npx vite-node tools/importar/subir.ts -- --seco # prueba: evalúa y resume sin escribir
npx vite-node tools/importar/subir.ts           # sube lo que no exista todavía
```

`--reemplazar` borra todo lo importado (`origen = importado`) y lo vuelve a subir; lo cargado desde la app
no se toca.

## Cómo funciona

1. **`importar.py`** corre cada módulo de `extractores/` (uno por formato o familia; contrato en
   `extractores/__init__.py`). Normaliza con `normalizar.py` (fechas con día y mes invertidos, unidades,
   escalas de higiene, conforme/no conforme) y `operarios.py` (nombres al catálogo). Deja:
   - `salida/registros.jsonl`: registros listos para subir.
   - `salida/reporte.csv`: filas rechazadas con su motivo, para revisar a mano.
2. **`subir.ts`** evalúa cada registro con el motor de la app (`src/motor`): las desviaciones, los PCC y la
   clave única salen igual que si se hubieran cargado en la tablet. Crea como **inactivos** los operarios
   que ya no trabajan, para que el histórico conserve sus nombres. Deja `salida/subida.csv` con el
   resultado de cada registro.

Lo importado queda con `origen = importado`, firmado como "Importado de Excel" (o con el nombre que figure
en el Excel) y con la fuente exacta en observaciones (`archivo › hoja › fila`). No se aplican valores
sugeridos: lo que no se anotó en el Excel queda vacío. La Tienda no se importa.

`salida/` y los Excel nunca van al repositorio. La llave `service_role` se lee de `.env.local`.
