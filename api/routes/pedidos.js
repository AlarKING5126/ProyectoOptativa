// ============================================================
//  routes/pedidos.js — Pedidos y checkout
// ============================================================
const router = require('express').Router();
const { query, pool } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

// ── GET /api/pedidos — Mis pedidos (cliente) o todos (admin) ─
router.get('/', authMiddleware, async (req, res) => {
  const { estado, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const isAdmin = req.user.rol === 'admin';

  const params  = isAdmin ? [] : [req.user.id];
  const where   = isAdmin ? [] : ['p.usuario_id = $1'];
  if (estado) {
    params.push(estado);
    where.push(`p.estado = $${params.length}`);
  }
  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  params.push(parseInt(limit), offset);

  try {
    const sql = `
      SELECT p.id, p.codigo, p.subtotal, p.impuestos, p.total,
             p.estado, p.direccion_envio, p.numero_seguimiento,
             p.created_at, p.updated_at,
             u.nombre AS cliente_nombre, u.email AS cliente_email,
             (SELECT json_agg(json_build_object(
                'nombre',   pl.nombre_snap,
                'cantidad', pl.cantidad,
                'precio',   pl.precio_snap,
                'subtotal', pl.subtotal
             ) ORDER BY pl.id)
              FROM pedido_lineas pl WHERE pl.pedido_id = p.id) AS lineas
      FROM   pedidos p
      JOIN   usuarios u ON u.id = p.usuario_id
      ${whereClause}
      ORDER  BY p.created_at DESC
      LIMIT  $${params.length - 1} OFFSET $${params.length}
    `;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /pedidos:', err);
    res.status(500).json({ error: 'Error al obtener pedidos' });
  }
});

// ── GET /api/pedidos/:id ────────────────────────────────────
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*, u.nombre AS cliente_nombre, u.email AS cliente_email,
              json_agg(json_build_object(
                'id',        pl.id,
                'nombre',    pl.nombre_snap,
                'cantidad',  pl.cantidad,
                'precio',    pl.precio_snap,
                'subtotal',  pl.subtotal,
                'producto_id', pl.producto_id
              ) ORDER BY pl.id) AS lineas
       FROM   pedidos p
       JOIN   usuarios u ON u.id = p.usuario_id
       JOIN   pedido_lineas pl ON pl.pedido_id = p.id
       WHERE  p.id = $1
         AND  (p.usuario_id = $2 OR $3 = 'admin')
       GROUP  BY p.id, u.nombre, u.email`,
      [req.params.id, req.user.id, req.user.rol]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener pedido' });
  }
});

// ── POST /api/pedidos/checkout — Crear pedido desde carrito ─
router.post('/checkout', authMiddleware, async (req, res) => {
  const { direccion_envio } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Obtener items del carrito
    const carritoResult = await client.query(
      `SELECT ci.producto_id, ci.cantidad,
              p.nombre, p.precio, p.stock, p.tipo
       FROM   carrito_items ci
       JOIN   carritos c ON c.id = ci.carrito_id
       JOIN   productos p ON p.id = ci.producto_id
       WHERE  c.usuario_id = $1`,
      [req.user.id]
    );

    if (carritoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'El carrito está vacío' });
    }

    const items = carritoResult.rows;

    // 2. Verificar stock de cada ítem
    for (const item of items) {
      if (item.stock < item.cantidad) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Stock insuficiente para "${item.nombre}". Disponible: ${item.stock}`
        });
      }
    }

    // 3. Crear pedido (el trigger auto-genera el código #DN-XXXX)
    const pedidoResult = await client.query(
      `INSERT INTO pedidos (usuario_id, direccion_envio)
       VALUES ($1, $2) RETURNING id, codigo`,
      [req.user.id, direccion_envio || null]
    );
    const pedidoId = pedidoResult.rows[0].id;

    // 4. Insertar líneas (el trigger descuenta stock automáticamente)
    for (const item of items) {
      await client.query(
        `INSERT INTO pedido_lineas (pedido_id, producto_id, nombre_snap, precio_snap, cantidad)
         VALUES ($1, $2, $3, $4, $5)`,
        [pedidoId, item.producto_id, item.nombre, item.precio, item.cantidad]
      );
    }

    // 5. Vaciar el carrito
    await client.query(
      `DELETE FROM carrito_items
       WHERE carrito_id = (SELECT id FROM carritos WHERE usuario_id = $1)`,
      [req.user.id]
    );

    await client.query('COMMIT');

    // 6. Devolver el pedido completo con totales calculados
    const finalPedido = await query(
      `SELECT p.id, p.codigo, p.subtotal, p.impuestos, p.total,
              p.estado, p.created_at
       FROM   pedidos p WHERE p.id = $1`,
      [pedidoId]
    );

    res.status(201).json({
      message: '¡Compra realizada con éxito!',
      pedido:  finalPedido.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Checkout error:', err);
    res.status(500).json({ error: err.message || 'Error al procesar el pedido' });
  } finally {
    client.release();
  }
});

// ── PUT /api/pedidos/:id/estado — Cambiar estado (admin) ────
router.put('/:id/estado', authMiddleware, adminOnly, async (req, res) => {
  const { estado } = req.body;
  const allowed = ['pending','transit','delivered','cancelled'];
  if (!allowed.includes(estado))
    return res.status(400).json({ error: `Estado inválido. Valores: ${allowed.join(', ')}` });

  try {
    const result = await query(
      `UPDATE pedidos SET estado = $1
       WHERE id = $2 RETURNING id, codigo, estado`,
      [estado, req.params.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar estado' });
  }
});

module.exports = router;
