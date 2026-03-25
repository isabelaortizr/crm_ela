INSERT INTO products (id, code, name, category, cost_price, sale_price, provider, entry_date)
VALUES
  (1, 'C1', 'Chaleco Tejido Bicolor', 'Chaleco', 120.00, 180.00, 'Bethy Mamani', '2026-03-21'),
  (2, 'C2', 'Chaleco Tejido Plano', 'Chaleco', 120.00, 180.00, 'Bethy Mamani', '2026-03-21'),
  (3, 'CH1', 'Chompa Tejida Plana', 'Chompa', 135.00, 200.00, 'Proveedor Hombre', '2026-03-21')
ON CONFLICT (id) DO NOTHING;

INSERT INTO product_variants (id, product_id, color, size, stock)
VALUES
  (1, 1, 'Café', 'Unica', 0),
  (2, 1, 'Negro', 'Unica', 1),
  (3, 2, 'Arena', 'Unica', 1),
  (4, 2, 'Blanco', 'Unica', 1),
  (5, 3, 'Arena', 'Unica', 1),
  (6, 3, 'Blanco', 'Unica', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO sales (id, sale_date, product_id, variant_id, quantity, unit_price, payment_method, customer_name, notes)
VALUES
  (1, '2026-03-22', 1, 1, 1, 180.00, 'QR', 'Athina Cochamadinis', NULL),
  (2, '2026-03-24', 2, 3, 1, 175.00, 'QR', 'Mariel Handal', NULL),
  (3, '2026-03-24', 2, 4, 1, 175.00, 'QR', 'Mariel Handal', NULL)
ON CONFLICT (id) DO NOTHING;

SELECT setval('products_id_seq', COALESCE((SELECT MAX(id) FROM products), 1), true);
SELECT setval('product_variants_id_seq', COALESCE((SELECT MAX(id) FROM product_variants), 1), true);
SELECT setval('sales_id_seq', COALESCE((SELECT MAX(id) FROM sales), 1), true);
