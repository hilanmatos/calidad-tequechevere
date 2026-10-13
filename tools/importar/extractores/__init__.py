"""Extractores: un módulo por formato (o familia) que lee sus Excel y devuelve registros normalizados.

Contrato de cada módulo `extractores/<nombre>.py`:

    FORMATOS = ['cq-l1-tequenos']                 # códigos de formato de la app que produce
    ARCHIVOS = ['CONTROL DE CALIDAD TEQUEÑOS.xlsx']  # nombres dentro de la carpeta de Calidad

    def extraer(carpeta: Path, hoy: date) -> tuple[list[dict], list[dict]]:
        '''Devuelve (registros, rechazos). No sube nada ni toca la base.'''

Registro (lo que importar.py escribe en salida/registros.jsonl):

    {
      'formato': 'cq-l1-tequenos',
      'fecha': 'YYYY-MM-DD',
      'hora': 'HH:MM' | None,
      'area': 'Planta Alta' | 'Gluten Free' | None,
      'producto': 'PT035' | 'Tequeño Full Queso' | None,   # código del catálogo, o su nombre exacto si no tiene
      'lote': str | None,
      'valores': {campo_id: valor},   # ids de src/formatos/*.ts; valores como los guarda la app.
                                      # Calculados: no se envían (los calcula el motor al subir).
                                      # Checklist: {nombre canónico del operario: {columna: estado} | {'_ausente': 'si'}}
      'observaciones': str | None,
      'accion_correctiva': str | None,
      'realizado_por': str | None,    # quien figura en el Excel; si no hay, se guarda 'Importado de Excel'
      'fuente': 'archivo › hoja › fila 12',
    }

Rechazo (va a salida/reporte.csv para revisión manual):

    {'fuente': 'archivo › hoja › fila 12', 'motivo': 'fecha ilegible', 'contenido': 'texto corto de la fila'}

Reglas comunes:
- Áreas: 'Tequeños', 'TEQUEÑOS' y 'Planta alta' → 'Planta Alta'; 'GF' → 'Gluten Free'. La Tienda se excluye
  (rechazo con motivo 'Tienda: excluida por decisión de Operaciones').
- Fechas fuera de 2025-01-01..hoy → rechazo. Usar normalizar.corregir_secuencia / fecha_con_mes.
- Operarios: operarios.canonico(nombre).
"""
