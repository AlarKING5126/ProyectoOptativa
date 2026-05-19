// ============================================================
//  routes/pedidos.js — Pedidos y checkout
// ============================================================
const router = require('express').Router();
const { query, pool } = require('../config/db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

// ── GET /api/pedidos — Mis pedidos (cliente) o todos (admin) ─
router.get('/', authMiddleware, async (req, res) => {
  const { estado, page = 1, limit = 20 } = req.query;
  const offset  = (parseInt(page) - 1) * parseInt(limit);
  const isAdmin = req.user.rol === 'admin';

  const params = [];
  const where  = [];

  if (!isAdmin) { params.push(req.user.id); where.push('p.usuario_id = ?'); }
  if (estado)   { params.push(estado);       where.push('p.estado = ?'); }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  params.push(parseInt(limit), offset);

  try {
    const { rows } = await query(
      `SELECT p.id, p.codigo, p.subtotal, p.impuestos, p.total,
              p.estado, p.direccion_envio, p.numero_seguimiento,
              p.created_at, p.updated_at,
              u.nombre AS cliente_nombre, u.email AS cliente_email,
              (SELECT JSON_ARRAYAGG(
                 JSON_OBJECT(
                   'id',          pl.id,
                   'producto_id', pl.producto_id,
                   'nombre',      pl.nombre_snap,
                   'cantidad',    pl.cantidad,
                   'precio',      pl.precio_snap,
                   'subtotal',    pl.subtotal
                 )
               )
               FROM pedido_lineas pl WHERE pl.pedido_id = p.id) AS lineas
       FROM   pedidos p
       JOIN   usuarios u ON u.id = p.usuario_id
       ${whereClause}
       ORDER  BY p.created_at DESC
       LIMIT  ? OFFSET ?`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /pedidos:', err);
    res.status(500).json({ error: 'Error al obtener pedidos' });
  }
});

// ── GET /api/pedidos/:id ────────────────────────────────────
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.id, p.codigo, p.subtotal, p.impuestos, p.total,
              p.estado, p.direccion_envio, p.numero_seguimiento,
              p.created_at, p.updated_at,
              u.nombre AS cliente_nombre, u.email AS cliente_email,
              JSON_ARRAYAGG(
                JSON_OBJECT(
                  'id',          pl.id,
                  'nombre',      pl.nombre_snap,
                  'cantidad',    pl.cantidad,
                  'precio',      pl.precio_snap,
                  'subtotal',    pl.subtotal,
                  'producto_id', pl.producto_id,
                  'imagen_url',  pr.img_url
                )
              ) AS lineas
       FROM   pedidos p
       JOIN   usuarios u    ON u.id  = p.usuario_id
       JOIN   pedido_lineas pl ON pl.pedido_id = p.id
       LEFT JOIN productos pr ON pr.id = pl.producto_id
       WHERE  p.id = ?
         AND  (p.usuario_id = ? OR ? = 'admin')
       GROUP  BY p.id, p.codigo, p.subtotal, p.impuestos, p.total,
                 p.estado, p.direccion_envio, p.numero_seguimiento,
                 p.created_at, p.updated_at, u.nombre, u.email`,
      [req.params.id, req.user.id, req.user.rol]
    );
    if (!rows.length)
      return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener pedido' });
  }
});

// ── POST /api/pedidos/checkout — Crear pedido desde carrito ─
router.post('/checkout', authMiddleware, async (req, res) => {
  const { direccion_envio } = req.body;
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // 1. Obtener ítems del carrito
    const [items] = await conn.execute(
      `SELECT ci.producto_id, ci.cantidad,
              p.nombre, p.precio, p.stock, p.tipo
       FROM   carrito_items ci
       JOIN   carritos  c ON c.id = ci.carrito_id
       JOIN   productos p ON p.id = ci.producto_id
       WHERE  c.usuario_id = ?`,
      [req.user.id]
    );

    if (!items.length) {
      await conn.rollback();
      return res.status(400).json({ error: 'El carrito está vacío' });
    }

    // 2. Verificar stock de cada ítem
    for (const item of items) {
      if (item.stock < item.cantidad) {
        await conn.rollback();
        return res.status(400).json({
          error: `Stock insuficiente para "${item.nombre}". Disponible: ${item.stock}`,
        });
      }
    }

    // 3. Crear pedido (el trigger genera el código #DN-XXXX)
    const [pedidoResult] = await conn.execute(
      'INSERT INTO pedidos (usuario_id, direccion_envio) VALUES (?, ?)',
      [req.user.id, direccion_envio || null]
    );
    const pedidoId = pedidoResult.insertId;

    // 4. Insertar líneas (el trigger descuenta stock y recalcula totales)
    for (const item of items) {
      await conn.execute(
        `INSERT INTO pedido_lineas (pedido_id, producto_id, nombre_snap, precio_snap, cantidad)
         VALUES (?, ?, ?, ?, ?)`,
        [pedidoId, item.producto_id, item.nombre, item.precio, item.cantidad]
      );
    }

    // 5. Vaciar el carrito
    await conn.execute(
      `DELETE FROM carrito_items
       WHERE carrito_id = (SELECT id FROM carritos WHERE usuario_id = ?)`,
      [req.user.id]
    );

    await conn.commit();

    // 6. Devolver el pedido con totales ya calculados por el trigger
    const { rows } = await query(
      'SELECT id, codigo, subtotal, impuestos, total, estado, created_at FROM pedidos WHERE id = ?',
      [pedidoId]
    );

    res.status(201).json({
      message: '¡Compra realizada con éxito!',
      pedido:  rows[0],
    });
  } catch (err) {
    await conn.rollback();
    console.error('Checkout error:', err);
    res.status(500).json({ error: err.message || 'Error al procesar el pedido' });
  } finally {
    conn.release();
  }
});

// ── PUT /api/pedidos/:id/estado — Cambiar estado (admin) ────
router.put('/:id/estado', authMiddleware, adminOnly, async (req, res) => {
  const { estado } = req.body;
  const allowed = ['pending', 'transit', 'delivered', 'cancelled'];
  if (!allowed.includes(estado))
    return res.status(400).json({ error: `Estado inválido. Valores: ${allowed.join(', ')}` });

  try {
    const { rows: check } = await query(
      'SELECT id FROM pedidos WHERE id = ?',
      [req.params.id]
    );
    if (!check.length)
      return res.status(404).json({ error: 'Pedido no encontrado' });

    await query('UPDATE pedidos SET estado = ? WHERE id = ?', [estado, req.params.id]);

    const { rows } = await query(
      'SELECT id, codigo, estado FROM pedidos WHERE id = ?',
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar estado' });
  }
});

module.exports = router;
