"""Catálogo de productos cargado en Supabase (12/10/2026, especificaciones SQF vigentes).

Para el campo `producto` de un registro: usar el código si tiene; si no, el nombre exacto."""

PRODUCTOS = [
    ('cq-l1-tequenos', '', 'Tequeño Full Queso', 'Full 12, 20, 24 y 50'),
    ('cq-l1-tequenos', '', 'Tequeño Full Queso precocido', 'Precocido'),
    ('cq-l1-tequenos', '', 'Tequeño Chela', 'Chela 50'),
    ('cq-l1-tequenos', '', 'Tequeño Full de Guayaba (5 cm)', 'Bolsa de 10 y Guayaba 40'),
    ('cq-l1-tequenos', '', 'Tequeño de Chocolate', 'Bolsa de 10 y Chocolate 50'),
    ('cq-l1-tequenos', 'PT035', 'Tequeños Salmón con Queso Crema', '10 unidades'),
    ('cq-l1-tequenos', 'PT036', 'Tequeños Salmón con Queso Crema', '50 unidades'),
    ('cq-l1-tequenos', 'PT039', 'Tequeños Salmón con Queso Crema', '40 unidades'),
    ('cq-l1-tequenos', '', 'Tequeño Boquita', 'Boquita 60 y 48'),
    ('cq-l1-tequenos', '', 'Tequeño Premium', 'Caja plástica 10 × 3'),
    ('cq-l1-tequenos', '', 'Tequeñón', 'Caja blanca de 50'),
    ('cq-l1-tequenos', '', 'Tequeño Salchi Queso', '10 × 3'),
    ('cq-l1-tequenos', '', 'Tequeño Zaatar', '16 × 3'),
    ('cq-l2-empanadas-trigo', 'PP001', 'Pastelito de Queso', '30 unidades'),
    ('cq-l2-empanadas-trigo', 'PP002', 'Pastelito de Carne', '30 unidades'),
    ('cq-l2-empanadas-trigo', 'PP003', 'Pastelito de Pollo', '30 unidades'),
    ('cq-l2-empanadas-trigo', 'PP004', 'Pastelito Pizza', '30 unidades'),
    ('cq-l2-empanadas-trigo', 'PE001', 'Empanada Premium de Queso', '15 unidades'),
    ('cq-l2-empanadas-trigo', 'PE002', 'Empanada Premium de Carne', '15 unidades'),
    ('cq-l2-empanadas-trigo', 'PE003', 'Empanada Premium de Pollo', '15 unidades'),
    ('cq-l2-empanadas-trigo', 'PE005', 'Empanada Dulce de Queso', '60 unidades'),
    ('cq-l2-empanadas-trigo', 'PD001', 'Masa fácil / Tapas para hacer Empanadas', '12 unidades, Ø 12 cm'),
    ('cq-l2-empanadas-trigo', 'PD002', 'Masa fácil / Tapas para Empanadas 17 cm', '25 unidades'),
    ('cq-l3-empanadas-maiz', 'PE006', 'Empanadita de Maíz de Queso', '30 unidades'),
    ('cq-l3-empanadas-maiz', 'PE007', 'Empanadita de Maíz de Carne', '30 unidades'),
    ('cq-l3-empanadas-maiz', 'PE008', 'Empanadita de Maíz de Pollo', '30 unidades'),
    ('cq-l3-empanadas-maiz', 'PE016', 'Empanadita de Maíz Queso con Espinaca', '30 unidades'),
    ('cq-l3-empanadas-maiz', 'PE020', 'Empanadita de Maíz Queso con Bacon', '30 unidades'),
    ('cq-l3-empanadas-maiz', 'PE009', 'Empanada de Maíz de Queso', '12 unidades'),
    ('cq-l3-empanadas-maiz', 'PE010', 'Empanada de Maíz de Carne', '12 unidades'),
    ('cq-l3-empanadas-maiz', 'PE011', 'Empanada de Maíz de Pollo', '12 unidades'),
    ('cq-l3-empanadas-maiz', 'PE013', 'Empanadita de Yuca de Pollo', '30 unidades'),
    ('cq-l3-empanadas-maiz', 'PE014', 'Empanadita de Yuca de Carne', '30 unidades'),
    ('cq-l4-almond', '', 'Almond Bite de Queso', 'x20 y x50'),
    ('cq-l4-almond', '', 'Almond Bite de Chocolate', 'x20 y x50'),
    ('cq-l5-yuca', '', 'Yuca Bite de Queso', 'x16, x32 y x50'),
    ('cq-l5-yuca', '', 'Yuca Bite de Pollo', 'x16, x32 y x50'),
    ('cq-l5-yuca', '', 'Yuca Bite de Carne', 'x16 y x50'),
    ('cq-l5-yuca', '', 'Mini Carimañola', 'x50'),
    ('cq-salsa-tartara', 'PS001', 'Salsa Tártara Galón', '4,000 g'),
    ('cq-salsa-tartara', 'PS002', 'Salsa Tártara Teque Chévere 600 g', '600 g'),
]


def clave_producto(codigo: str, nombre: str) -> str:
    return codigo or nombre
