# Respaldo diario de la base

Copia toda la base de la app (Supabase) a Dropbox una vez al día, con una tarea programada de Windows en la PC de
Hilan. El plan gratuito de Supabase no guarda respaldos descargables: esta es la copia independiente.

- **Destino:** `Dropbox\TEQUE CHEVERE INTERNACIONAL, S.A\DEPARTAMENTOS\Calidad e Inocuidad\Respaldos app Calidad Chévere`
- **Cuándo:** todos los días a las 13:00. Si la PC está apagada a esa hora, corre apenas se enciende.
- **Qué guarda:** un ZIP por día con todas las tablas (registros, historial de cambios, cierres del día, productos,
  operarios, usuarios) y las fotos, más un `manifest.json` con conteos y sha256. Se verifica al terminar.
- **Cuántos:** los últimos 90. Dropbox además guarda su propio historial de versiones.
- **Control:** cada corrida deja una línea `OK` o `ERROR` en `registro-respaldos.log`, en la misma carpeta.

No incluye las contraseñas de las cuentas (Supabase no las entrega); en un proyecto nuevo, las cuentas se vuelven a
crear. Los ZIP tienen nombres del personal: no compartir esa carpeta.

## Instalar o cambiar la hora

```
powershell -ExecutionPolicy Bypass -File tools\respaldo\instalar_tarea.ps1 -Hora 13:00
```

La tarea se llama **Respaldo Calidad Chevere** (Programador de tareas de Windows). Para correrla a mano:
`python tools\respaldo\respaldo.py --destino "<carpeta>"`.

## Recuperar datos

```
cd tools\respaldo
python restaurar.py "<carpeta>\respaldo-calidad-AAAA-MM-DD_HHMM.zip"            # muestra qué falta, no escribe
python restaurar.py "<carpeta>\respaldo-calidad-AAAA-MM-DD_HHMM.zip" --aplicar  # reinserta lo que falta
```

Solo agrega filas que ya no están en la base; nunca modifica ni borra lo que existe. El historial de cambios queda en
el ZIP como evidencia. Pruebas: `python -m pytest tools\respaldo`.
