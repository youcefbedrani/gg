const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const DATABASE_URL = process.env.DATABASE_URL;

let pool = null;
let dbAvailable = false;

async function initDatabase() {
  if (!DATABASE_URL) {
    console.log("No DATABASE_URL set — using JSON file storage.");
    return false;
  }
  try {
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes("render.com") ? { rejectUnauthorized: false } : false,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    await pool.query("SELECT 1");
    await createTables();
    await migrateFromJson();
    dbAvailable = true;
    console.log("PostgreSQL connected successfully.");
    return true;
  } catch (err) {
    console.error("PostgreSQL connection failed, using JSON fallback:", err.message);
    pool = null;
    dbAvailable = false;
    return false;
  }
}

async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      order_id VARCHAR(50) UNIQUE NOT NULL,
      data JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key VARCHAR(100) PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);
  `);
}

async function migrateFromJson() {
  const ordersPath = path.join(__dirname, "../data/orders.json");
  const settingsPath = path.join(__dirname, "../data/settings.json");

  if (fs.existsSync(ordersPath)) {
    const count = await pool.query("SELECT COUNT(*) FROM orders");
    if (parseInt(count.rows[0].count) === 0) {
      try {
        const orders = JSON.parse(fs.readFileSync(ordersPath, "utf8"));
        if (orders.length > 0) {
          for (const order of orders) {
            await pool.query(
              "INSERT INTO orders (order_id, data) VALUES ($1, $2) ON CONFLICT (order_id) DO NOTHING",
              [order.order_id, JSON.stringify(order)]
            );
          }
          console.log(`Migrated ${orders.length} orders from JSON to PostgreSQL.`);
        }
      } catch (e) { /* empty file */ }
    }
  }

  if (fs.existsSync(settingsPath)) {
    try {
      const existing = await pool.query("SELECT value FROM settings WHERE key = 'zr'");
      if (existing.rows.length === 0) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
        await pool.query(
          "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING",
          ["zr", JSON.stringify(settings)]
        );
        console.log("Migrated settings from JSON to PostgreSQL.");
      }
    } catch (e) { /* ignore */ }
  }
}

// ── Orders CRUD ──────────────────────────────────────────────

async function getAllOrders() {
  if (!dbAvailable) return fallbackRead("orders");
  const result = await pool.query("SELECT data FROM orders ORDER BY data->>'timestamp' DESC");
  return result.rows.map(r => r.data);
}

async function getOrderByOrderId(orderId) {
  if (!dbAvailable) {
    const orders = fallbackRead("orders");
    return orders.find(o => o.order_id === orderId) || null;
  }
  const result = await pool.query("SELECT data FROM orders WHERE order_id = $1", [orderId]);
  return result.rows.length > 0 ? result.rows[0].data : null;
}

async function saveOrder(order) {
  if (!dbAvailable) {
    const orders = fallbackRead("orders");
    const idx = orders.findIndex(o => o.order_id === order.order_id);
    if (idx >= 0) orders[idx] = order;
    else orders.push(order);
    fallbackWrite("orders", orders);
    return;
  }
  await pool.query(
    `INSERT INTO orders (order_id, data, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (order_id)
     DO UPDATE SET data = $2, updated_at = NOW()`,
    [order.order_id, JSON.stringify(order)]
  );
}

async function saveOrdersBulk(orders) {
  if (!dbAvailable) {
    fallbackWrite("orders", orders);
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const order of orders) {
      await client.query(
        `INSERT INTO orders (order_id, data, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (order_id)
         DO UPDATE SET data = $2, updated_at = NOW()`,
        [order.order_id, JSON.stringify(order)]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// ── Settings CRUD ────────────────────────────────────────────

async function getSettings() {
  if (!dbAvailable) {
    const sPath = path.join(__dirname, "../data/settings.json");
    try {
      return JSON.parse(fs.readFileSync(sPath, "utf8"));
    } catch { return { zr_enabled: false, zr_secret_key: "", zr_tenant_id: "" }; }
  }
  const result = await pool.query("SELECT value FROM settings WHERE key = 'zr'");
  return result.rows.length > 0 ? result.rows[0].value : { zr_enabled: false, zr_secret_key: "", zr_tenant_id: "" };
}

async function saveSettings(settings) {
  if (!dbAvailable) {
    const sPath = path.join(__dirname, "../data/settings.json");
    fs.writeFileSync(sPath, JSON.stringify(settings, null, 2), "utf8");
    return;
  }
  await pool.query(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ('zr', $1, NOW())
     ON CONFLICT (key)
     DO UPDATE SET value = $1, updated_at = NOW()`,
    [JSON.stringify(settings)]
  );
  // Also write JSON fallback
  const sPath = path.join(__dirname, "../data/settings.json");
  fs.writeFileSync(sPath, JSON.stringify(settings, null, 2), "utf8");
}

// ── JSON fallback helpers ────────────────────────────────────

function fallbackRead(name) {
  const fp = path.join(__dirname, `../data/${name}.json`);
  try { return JSON.parse(fs.readFileSync(fp, "utf8")); } catch { return name === "orders" ? [] : {}; }
}

function fallbackWrite(name, data) {
  const fp = path.join(__dirname, `../data/${name}.json`);
  fs.writeFileSync(fp, JSON.stringify(data, null, 2), "utf8");
}

function isAvailable() {
  return dbAvailable;
}

async function closePool() {
  if (pool) await pool.end();
}

module.exports = {
  initDatabase,
  isAvailable,
  getAllOrders,
  getOrderByOrderId,
  saveOrder,
  saveOrdersBulk,
  getSettings,
  saveSettings,
  closePool,
};
