import express from 'express';
import cors from 'cors';
import { query, pool } from './db.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

async function ensureInventoryMovementsTable() {
  await query(`
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
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_variant_id
    ON inventory_movements(variant_id)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_inventory_movements_movement_date
    ON inventory_movements(movement_date DESC)
  `);
}

async function logInventoryMovement(client, movement) {
  await client.query(`
    INSERT INTO inventory_movements (
      variant_id,
      movement_type,
      quantity_change,
      stock_before,
      stock_after,
      reference_type,
      reference_id,
      notes
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [
    movement.variant_id,
    movement.movement_type,
    movement.quantity_change,
    movement.stock_before,
    movement.stock_after,
    movement.reference_type || null,
    movement.reference_id || null,
    movement.notes || null,
  ]);
}

app.get('/api/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/products', async (_req, res) => {
  try {
    const productsResult = await query(`
      SELECT id, code, name, category, cost_price, sale_price, provider, entry_date
      FROM products
      ORDER BY id ASC
    `);

    const variantsResult = await query(`
      SELECT id, product_id, color, size, stock
      FROM product_variants
      ORDER BY product_id ASC, id ASC
    `);

    const variantsByProduct = variantsResult.rows.reduce((acc, row) => {
      if (!acc[row.product_id]) acc[row.product_id] = [];
      acc[row.product_id].push(row);
      return acc;
    }, {});

    const products = productsResult.rows.map((product) => ({
      ...product,
      variants: variantsByProduct[product.id] || [],
    }));

    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/products', async (req, res) => {
  const { code, name, category, cost_price, sale_price, provider, entry_date, variants = [] } = req.body;

  if (!code || !name || !cost_price || !sale_price || variants.length === 0) {
    return res.status(400).json({ error: 'Faltan campos obligatorios del producto.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const productResult = await client.query(`
      INSERT INTO products (code, name, category, cost_price, sale_price, provider, entry_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [code, name, category || null, cost_price, sale_price, provider || null, entry_date || null]);

    for (const variant of variants) {
      await client.query(`
        INSERT INTO product_variants (product_id, color, size, stock)
        VALUES ($1, $2, $3, $4)
      `, [productResult.rows[0].id, variant.color, variant.size || 'Unica', variant.stock || 0]);
    }

    await client.query('COMMIT');
    res.status(201).json(productResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.put('/api/products/:id', async (req, res) => {
  const productId = Number(req.params.id);
  const { code, name, category, cost_price, sale_price, provider, entry_date, variants = [] } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      UPDATE products
      SET code = $1, name = $2, category = $3, cost_price = $4, sale_price = $5, provider = $6, entry_date = $7
      WHERE id = $8
    `, [code, name, category || null, cost_price, sale_price, provider || null, entry_date || null, productId]);

    const existingResult = await client.query(`
      SELECT id FROM product_variants WHERE product_id = $1
    `, [productId]);
    const existingIds = existingResult.rows.map((row) => row.id);
    const incomingIds = variants.filter((variant) => variant.id).map((variant) => Number(variant.id));
    const toDelete = existingIds.filter((id) => !incomingIds.includes(id));

    if (toDelete.length > 0) {
      await client.query(`DELETE FROM product_variants WHERE id = ANY($1::int[])`, [toDelete]);
    }

    for (const variant of variants) {
      if (variant.id) {
        await client.query(`
          UPDATE product_variants
          SET color = $1, size = $2, stock = $3
          WHERE id = $4 AND product_id = $5
        `, [variant.color, variant.size || 'Unica', variant.stock || 0, variant.id, productId]);
      } else {
        await client.query(`
          INSERT INTO product_variants (product_id, color, size, stock)
          VALUES ($1, $2, $3, $4)
        `, [productId, variant.color, variant.size || 'Unica', variant.stock || 0]);
      }
    }

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    await query(`DELETE FROM products WHERE id = $1`, [Number(req.params.id)]);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/variants/:id/stock', async (req, res) => {
  const variantId = Number(req.params.id);
  try {
    const stock = Number(req.body.stock);
    if (Number.isNaN(stock) || stock < 0) {
      return res.status(400).json({ error: 'El stock debe ser 0 o mayor.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const variantResult = await client.query(`
        SELECT stock FROM product_variants WHERE id = $1 FOR UPDATE
      `, [variantId]);

      if (variantResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'La variante no existe.' });
      }

      const currentStock = Number(variantResult.rows[0].stock);
      await client.query(`
        UPDATE product_variants SET stock = $1 WHERE id = $2
      `, [stock, variantId]);

      if (currentStock !== stock) {
        await logInventoryMovement(client, {
          variant_id: variantId,
          movement_type: 'manual_adjustment',
          quantity_change: stock - currentStock,
          stock_before: currentStock,
          stock_after: stock,
          reference_type: 'variant',
          reference_id: variantId,
          notes: 'Ajuste manual de stock',
        });
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/variants/:id', async (req, res) => {
  try {
    await query(`DELETE FROM product_variants WHERE id = $1`, [Number(req.params.id)]);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sales', async (_req, res) => {
  try {
    const result = await query(`
      SELECT
        s.id,
        s.sale_date,
        s.quantity,
        s.unit_price,
        (s.quantity * s.unit_price) AS total_amount,
        (s.quantity * (s.unit_price - p.cost_price)) AS profit_amount,
        s.payment_method,
        s.customer_name,
        s.notes,
        p.name AS product_name,
        CONCAT(v.color, ' / ', v.size) AS variant_label
      FROM sales s
      INNER JOIN products p ON p.id = s.product_id
      INNER JOIN product_variants v ON v.id = s.variant_id
      ORDER BY s.sale_date DESC, s.id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sales', async (req, res) => {
  const { sale_date, product_id, variant_id, quantity, unit_price, payment_method, customer_name, notes } = req.body;

  if (!sale_date || !product_id || !variant_id || !quantity || !unit_price) {
    return res.status(400).json({ error: 'Faltan campos obligatorios de la venta.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const variantResult = await client.query(`
      SELECT stock FROM product_variants WHERE id = $1 FOR UPDATE
    `, [variant_id]);

    if (variantResult.rows.length === 0) {
      throw new Error('La variante no existe.');
    }

    const currentStock = Number(variantResult.rows[0].stock);
    if (quantity > currentStock) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Stock insuficiente. Disponible: ${currentStock}` });
    }

    const saleInsertResult = await client.query(`
      INSERT INTO sales (sale_date, product_id, variant_id, quantity, unit_price, payment_method, customer_name, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [sale_date, product_id, variant_id, quantity, unit_price, payment_method || 'QR', customer_name || null, notes || null]);

    await client.query(`
      UPDATE product_variants
      SET stock = stock - $1
      WHERE id = $2
    `, [quantity, variant_id]);

    await logInventoryMovement(client, {
      variant_id,
      movement_type: 'sale',
      quantity_change: -quantity,
      stock_before: currentStock,
      stock_after: currentStock - quantity,
      reference_type: 'sale',
      reference_id: saleInsertResult.rows[0].id,
      notes: `Venta registrada (${payment_method || 'QR'})`,
    });

    await client.query('COMMIT');
    res.status(201).json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.delete('/api/sales/:id', async (req, res) => {
  const saleId = Number(req.params.id);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const saleResult = await client.query(`
      SELECT variant_id, quantity FROM sales WHERE id = $1 FOR UPDATE
    `, [saleId]);

    if (saleResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'La venta no existe.' });
    }

    const sale = saleResult.rows[0];

    await client.query(`DELETE FROM sales WHERE id = $1`, [saleId]);
    const stockResult = await client.query(`
      SELECT stock FROM product_variants WHERE id = $1 FOR UPDATE
    `, [sale.variant_id]);
    const stockBefore = Number(stockResult.rows[0].stock);
    await client.query(`
      UPDATE product_variants
      SET stock = stock + $1
      WHERE id = $2
    `, [sale.quantity, sale.variant_id]);

    await logInventoryMovement(client, {
      variant_id: sale.variant_id,
      movement_type: 'sale_reversal',
      quantity_change: Number(sale.quantity),
      stock_before: stockBefore,
      stock_after: stockBefore + Number(sale.quantity),
      reference_type: 'sale',
      reference_id: saleId,
      notes: 'Eliminacion de venta y devolucion de stock',
    });

    await client.query('COMMIT');
    res.status(204).send();
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.get('/api/dashboard', async (_req, res) => {
  try {
    const totals = await query(`
      SELECT
        COALESCE(SUM(s.quantity * s.unit_price), 0) AS total_sales_amount,
        COALESCE(SUM(s.quantity * (s.unit_price - p.cost_price)), 0) AS total_profit,
        COALESCE(SUM(s.quantity), 0) AS total_units_sold
      FROM sales s
      INNER JOIN products p ON p.id = s.product_id
    `);

    const inventory = await query(`
      SELECT
        COUNT(DISTINCT p.id) AS total_products,
        COALESCE(SUM(v.stock), 0) AS total_stock,
        COALESCE(SUM(v.stock * p.cost_price), 0) AS inventory_cost_value
      FROM products p
      LEFT JOIN product_variants v ON v.product_id = p.id
    `);

    const recentSales = await query(`
      SELECT
        s.sale_date,
        p.name AS product_name,
        CONCAT(v.color, ' / ', v.size) AS variant_label,
        (s.quantity * s.unit_price) AS total_amount
      FROM sales s
      INNER JOIN products p ON p.id = s.product_id
      INNER JOIN product_variants v ON v.id = s.variant_id
      ORDER BY s.sale_date DESC, s.id DESC
      LIMIT 6
    `);

    const lowStock = await query(`
      SELECT
        p.name AS product_name,
        CONCAT(v.color, ' / ', v.size) AS variant_label,
        v.stock
      FROM product_variants v
      INNER JOIN products p ON p.id = v.product_id
      WHERE v.stock <= 1
      ORDER BY v.stock ASC, p.name ASC
      LIMIT 8
    `);

    res.json({
      totalSalesAmount: Number(totals.rows[0].total_sales_amount),
      totalProfit: Number(totals.rows[0].total_profit),
      totalUnitsSold: Number(totals.rows[0].total_units_sold),
      totalProducts: Number(inventory.rows[0].total_products),
      totalStock: Number(inventory.rows[0].total_stock),
      inventoryCostValue: Number(inventory.rows[0].inventory_cost_value),
      recentSales: recentSales.rows,
      lowStock: lowStock.rows,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/inventory-movements', async (_req, res) => {
  try {
    const result = await query(`
      SELECT
        m.id,
        m.movement_date,
        m.movement_type,
        m.quantity_change,
        m.stock_before,
        m.stock_after,
        m.reference_type,
        m.reference_id,
        m.notes,
        p.name AS product_name,
        CONCAT(v.color, ' / ', v.size) AS variant_label
      FROM inventory_movements m
      INNER JOIN product_variants v ON v.id = m.variant_id
      INNER JOIN products p ON p.id = v.product_id
      ORDER BY m.movement_date DESC, m.id DESC
      LIMIT 250
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/inventory-movements/:id', async (req, res) => {
  try {
    const movementId = Number(req.params.id);
    const result = await query(`
      DELETE FROM inventory_movements
      WHERE id = $1
      RETURNING id
    `, [movementId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'El movimiento no existe.' });
    }

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

ensureInventoryMovementsTable()
  .then(() => {
    console.log('PORT:', process.env.PORT);
    console.log('DATABASE_URL:', process.env.DATABASE_URL);
    app.listen(PORT, () => {
      console.log(`Backend corriendo en http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('No se pudo inicializar inventory_movements:', error);
    process.exit(1);
  });
