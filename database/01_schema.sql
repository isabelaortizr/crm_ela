CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(100),
  cost_price NUMERIC(10,2) NOT NULL CHECK (cost_price >= 0),
  sale_price NUMERIC(10,2) NOT NULL CHECK (sale_price >= 0),
  provider VARCHAR(150),
  entry_date DATE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_variants (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color VARCHAR(80) NOT NULL,
  size VARCHAR(80) NOT NULL DEFAULT 'Unica',
  stock INT NOT NULL DEFAULT 0 CHECK (stock >= 0)
);

CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  sale_date DATE NOT NULL,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id INT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
  payment_method VARCHAR(30) NOT NULL DEFAULT 'QR',
  customer_name VARCHAR(150),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id SERIAL PRIMARY KEY,
  movement_date TIMESTAMP NOT NULL DEFAULT NOW(),
  variant_id INT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  movement_type VARCHAR(30) NOT NULL,
  quantity_change INT NOT NULL,
  stock_before INT NOT NULL CHECK (stock_before >= 0),
  stock_after INT NOT NULL CHECK (stock_after >= 0),
  reference_type VARCHAR(30),
  reference_id INT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_product_id ON sales(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_variant_id ON sales(variant_id);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_variant_id ON inventory_movements(variant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_movement_date ON inventory_movements(movement_date DESC);
