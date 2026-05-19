// ============================================================
//  routes/carrito.js — Carrito de compras
// ============================================================
const router = require('express').Router();
const { query } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

async function getOrCreateCarrito(userId) {
  let { rows } = await query('SELECT id FROM carritos WHERE usuario_id = ?', [userId]);
  if (!rows.length) {
    const { insertId } = await query(
      'INSERT INTO carritos (usuario_id) VALUES (?)',
      [userId]
    );
    return insertId;
  }
  return rows[0].id;
}

// ── GET /api/carrito ────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const carritoId = await getOrCreateCarrito(req.user.id);
    const { rows: items } = await query(
      `SELECT ci.id, ci.cantidad,
              p.id AS producto_id, p.nombre, p.precio, p.img_url,
              p.stock, p.tipo,
              c.nombre AS categoria,
              (ci.cantidad * p.precio) AS subtotal
       FROM   carrito_items ci
       JOIN   productos  p ON p.id = ci.producto_id
       JOIN   categorias c ON c.id = p.categoria_id
       WHERE  ci.carrito_id = ?
       ORDER  BY ci.added_at`,
      [carritoId]
    );

    const subtotal = items.reduce((s, i) => s + parseFloat(i.subtotal), 0);
    const tax      = Math.round(subtotal * 0.19 * 100) / 100;

    res.json({
      items,
      subtotal,
      impuestos: tax,
      total: Math.round((subtotal + tax) * 100) / 100,
    });
  } catch (err) {
    console.error('GET /carrito:', err);
    res.status(500).json({ error: 'Error al obtener carrito' });
  }
});

// ── POST /api/carrito — Agregar / actualizar ítem ──────────
router.post('/', authMiddleware, async (req, res) => {
  const { producto_id, cantidad = 1 } = req.body;
  if (!producto_id)
    return res.status(400).json({ error: 'producto_id es requerido' });

  try {
    const { rows: prod } = await query(
      'SELECT stock, nombre FROM productos WHERE id = ? AND activo = 1',
      [producto_id]
    );
    if (!prod.length)
      return res.status(404).json({ error: 'Producto no encontrado' });
    if (prod[0].stock < cantidad)
      return res.status(400).json({ error: `Stock insuficiente. Disponible: ${prod[0].stock}` });

    const carritoId = await getOrCreateCarrito(req.user.id);

    // UPSERT: si ya existe suma cantidad respetando el stock máximo
    await query(
      `INSERT INTO carrito_items (carrito_id, producto_id, cantidad)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         cantidad = LEAST(cantidad + VALUES(cantidad), ?)`,
      [carritoId, producto_id, cantidad, prod[0].stock]
    );

    const { rows } = await query(
      'SELECT * FROM carrito_items WHERE carrito_id = ? AND producto_id = ?',
      [carritoId, producto_id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /carrito:', err);
    res.status(500).json({ error: 'Error al agregar al carrito' });
  }
});

// ── PUT /api/carrito/:productoId — Cambiar cantidad ─────────
router.put('/:productoId', authMiddleware, async (req, res) => {
  const { cantidad } = req.body;
  if (cantidad < 1)
    return res.status(400).json({ error: 'La cantidad mínima es 1' });

  try {
    const { rows: prod } = await query(
      'SELECT stock FROM productos WHERE id = ?',
      [req.params.productoId]
    );
    if (!prod.length)
      return res.status(404).json({ error: 'Producto no encontrado' });
    if (cantidad > prod[0].stock)
      return res.status(400).json({ error: `Stock máximo: ${prod[0].stock}` });

    const carritoId = await getOrCreateCarrito(req.user.id);
    const { affectedRows } = await query(
      'UPDATE carrito_items SET cantidad = ? WHERE carrito_id = ? AND producto_id = ?',
      [cantidad, carritoId, req.params.productoId]
    );
    if (!affectedRows)
      return res.status(404).json({ error: 'Ítem no encontrado en el carrito' });

    const { rows } = await query(
      'SELECT * FROM carrito_items WHERE carrito_id = ? AND producto_id = ?',
      [carritoId, req.params.productoId]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar cantidad' });
  }
});

// ── DELETE /api/carrito/:productoId — Quitar ítem ──────────
router.delete('/:productoId', authMiddleware, async (req, res) => {
  try {
    const carritoId = await getOrCreateCarrito(req.user.id);
    await query(
      'DELETE FROM carrito_items WHERE carrito_id = ? AND producto_id = ?',
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
    await query('DELETE FROM carrito_items WHERE carrito_id = ?', [carritoId]);
    res.json({ message: 'Carrito vaciado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al vaciar carrito' });
  }
});

module.exports = router;
