// ============================================================
//  routes/carrito.js — Carrito de compras
// ============================================================
const router = require('express').Router();
const { query, pool } = require('../db');
const { authMiddleware } = require('../middleware/auth');

// Helper: obtener o crear carrito del usuario
async function getOrCreateCarrito(userId) {
  let result = await query('SELECT id FROM carritos WHERE usuario_id = $1', [userId]);
  if (result.rows.length === 0) {
    result = await query(
      'INSERT INTO carritos (usuario_id) VALUES ($1) RETURNING id',
      [userId]
    );
  }
  return result.rows[0].id;
}

// ── GET /api/carrito — Ver carrito ──────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const carritoId = await getOrCreateCarrito(req.user.id);
    const result = await query(
      `SELECT ci.id, ci.cantidad,
              p.id AS producto_id, p.nombre, p.precio, p.img_url,
              p.stock, p.tipo,
              c.nombre AS categoria,
              (ci.cantidad * p.precio) AS subtotal
       FROM   carrito_items ci
       JOIN   productos p ON p.id = ci.producto_id
       JOIN   categorias c ON c.id = p.categoria_id
       WHERE  ci.carrito_id = $1
       ORDER  BY ci.added_at`,
      [carritoId]
    );

    const items    = result.rows;
    const subtotal = items.reduce((s, i) => s + parseFloat(i.subtotal), 0);
    const tax      = Math.round(subtotal * 0.19 * 100) / 100;

    res.json({ items, subtotal, impuestos: tax, total: Math.round((subtotal + tax) * 100) / 100 });
  } catch (err) {
    console.error('GET /carrito:', err);
    res.status(500).json({ error: 'Error al obtener carrito' });
  }
});

// ── POST /api/carrito — Agregar / actualizar ítem ──────────
router.post('/', authMiddleware, async (req, res) => {
  const { producto_id, cantidad = 1 } = req.body;
  if (!producto_id) return res.status(400).json({ error: 'producto_id es requerido' });

  try {
    // Verificar stock
    const prod = await query('SELECT stock, nombre FROM productos WHERE id = $1 AND activo = TRUE', [producto_id]);
    if (prod.rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    if (prod.rows[0].stock < cantidad)
      return res.status(400).json({ error: `Stock insuficiente. Disponible: ${prod.rows[0].stock}` });

    const carritoId = await getOrCreateCarrito(req.user.id);

    // UPSERT: si ya existe, sumar cantidad; si no, insertar
    const result = await query(
      `INSERT INTO carrito_items (carrito_id, producto_id, cantidad)
       VALUES ($1, $2, $3)
       ON CONFLICT (carrito_id, producto_id)
       DO UPDATE SET cantidad = LEAST(carrito_items.cantidad + EXCLUDED.cantidad, $4)
       RETURNING *`,
      [carritoId, producto_id, cantidad, prod.rows[0].stock]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /carrito:', err);
    res.status(500).json({ error: 'Error al agregar al carrito' });
  }
});

// ── PUT /api/carrito/:productoId — Cambiar cantidad ─────────
router.put('/:productoId', authMiddleware, async (req, res) => {
  const { cantidad } = req.body;
  if (cantidad < 1) return res.status(400).json({ error: 'La cantidad mínima es 1' });

  try {
    const prod = await query('SELECT stock FROM productos WHERE id = $1', [req.params.productoId]);
    if (prod.rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    if (cantidad > prod.rows[0].stock)
      return res.status(400).json({ error: `Stock máximo: ${prod.rows[0].stock}` });

    const carritoId = await getOrCreateCarrito(req.user.id);
    const result = await query(
      `UPDATE carrito_items SET cantidad = $1
       WHERE carrito_id = $2 AND producto_id = $3
       RETURNING *`,
      [cantidad, carritoId, req.params.productoId]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Ítem no encontrado en el carrito' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar cantidad' });
  }
});

// ── DELETE /api/carrito/:productoId — Quitar ítem ──────────
router.delete('/:productoId', authMiddleware, async (req, res) => {
  try {
    const carritoId = await getOrCreateCarrito(req.user.id);
    await query(
      'DELETE FROM carrito_items WHERE carrito_id = $1 AND producto_id = $2',
      [carritoId, req.params.productoId]
    );
    res.json({ message: 'Ítem eliminado del carrito' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar ítem' });
  }
});

// ── DELETE /api/carrito — Vaciar carrito ───────────────────
router.delete('/', authMiddleware, async (req, res) => {
  try {
    const carritoId = await getOrCreateCarrito(req.user.id);
    await query('DELETE FROM carrito_items WHERE carrito_id = $1', [carritoId]);
    res.json({ message: 'Carrito vaciado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al vaciar carrito' });
  }
});

module.exports = router;
