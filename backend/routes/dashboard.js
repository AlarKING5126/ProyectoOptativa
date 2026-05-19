// ============================================================
//  routes/dashboard.js — Métricas para paneles admin/cliente
// ============================================================
const router  = require('express').Router();
const { query } = require('../config/db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

// ── GET /api/dashboard/admin ────────────────────────────────
router.get('/admin', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [
      { rows: metricasRows },
      { rows: totalUsuariosRows },
      { rows: lowStock },
      { rows: topVendidos },
      { rows: ticketsRecientes },
      { rows: pedidosRecientes },
    ] = await Promise.all([
      // Métricas globales desde la vista
      query('SELECT * FROM v_dashboard_admin'),

      // Total usuarios (calculado aparte para compatibilidad)
      query('SELECT COUNT(*) AS total_usuarios FROM usuarios'),

      // Productos con stock bajo (≤ 15)
      query(
        `SELECT p.id, p.nombre, p.stock,
                c.nombre AS categoria
         FROM   productos  p
         JOIN   categorias c ON c.id = p.categoria_id
         WHERE  p.stock <= 15 AND p.activo = 1
         ORDER  BY p.stock ASC
         LIMIT  8`
      ),

      // Top 5 productos más vendidos
      query(
        `SELECT p.id, p.nombre, p.img_url,
                SUM(pl.cantidad) AS unidades_vendidas,
                SUM(pl.subtotal) AS ingresos
         FROM   pedido_lineas pl
         JOIN   productos p ON p.id = pl.producto_id
         GROUP  BY p.id, p.nombre, p.img_url
         ORDER  BY unidades_vendidas DESC
         LIMIT  5`
      ),

      // Últimos tickets abiertos
      query(
        `SELECT t.id, t.codigo, t.asunto, t.prioridad, t.estado,
                t.created_at, u.nombre AS usuario_nombre
         FROM   tickets  t
         JOIN   usuarios u ON u.id = t.usuario_id
         WHERE  t.estado <> 'closed'
         ORDER  BY t.created_at DESC
         LIMIT  5`
      ),

      // Últimos pedidos
      query(
        `SELECT p.id, p.codigo, p.total, p.estado, p.created_at,
                u.nombre AS cliente_nombre
         FROM   pedidos  p
         JOIN   usuarios u ON u.id = p.usuario_id
         ORDER  BY p.created_at DESC
         LIMIT  5`
      ),
    ]);

    res.json({
      metricas: {
        ...metricasRows[0],
        total_usuarios: metricasRows[0]?.total_usuarios ?? totalUsuariosRows[0]?.total_usuarios ?? 0,
      },
      low_stock:         lowStock,
      top_vendidos:      topVendidos,
      tickets_recientes: ticketsRecientes,
      pedidos_recientes: pedidosRecientes,
    });
  } catch (err) {
    console.error('Dashboard admin error:', err);
    res.status(500).json({ error: 'Error al obtener métricas' });
  }
});

// ── GET /api/dashboard/cliente ──────────────────────────────
router.get('/cliente', authMiddleware, async (req, res) => {
  const uid = req.user.id;
  try {
    const [
      { rows: metricasRows },
      { rows: pedidosRecientes },
      { rows: ticketsAbiertos },
      { rows: destacados },
      { rows: topVendidos },
      { rows: ventasAnuales },
    ] = await Promise.all([
      // Métricas personales
      query(
        `SELECT
           (SELECT COUNT(*) FROM pedidos  WHERE usuario_id = ? AND estado <> 'cancelled') AS total_pedidos,
           (SELECT COALESCE(SUM(total), 0) FROM pedidos WHERE usuario_id = ? AND estado = 'delivered') AS total_gastado,
           (SELECT COUNT(*) FROM favoritos WHERE usuario_id = ?) AS total_favoritos,
           (SELECT COUNT(*) FROM tickets  WHERE usuario_id = ? AND estado <> 'closed')    AS tickets_abiertos,
           (SELECT COALESCE(SUM(ci.cantidad), 0)
            FROM carrito_items ci
            JOIN carritos c ON c.id = ci.carrito_id
            WHERE c.usuario_id = ?)                                                        AS items_carrito`,
        [uid, uid, uid, uid, uid]
      ),

      // Últimos 3 pedidos
      query(
        `SELECT id, codigo, total, estado, created_at
         FROM   pedidos
         WHERE  usuario_id = ?
         ORDER  BY created_at DESC
         LIMIT  3`,
        [uid]
      ),

      // Tickets sin cerrar
      query(
        `SELECT id, codigo, asunto, estado, prioridad, created_at
         FROM   tickets
         WHERE  usuario_id = ? AND estado <> 'closed'
         ORDER  BY created_at DESC
         LIMIT  3`,
        [uid]
      ),

      // Productos destacados (featured)
      query(
        `SELECT id, nombre, precio, img_url, rating, tipo
         FROM   productos
         WHERE  featured = 1 AND activo = 1
         ORDER  BY rating DESC
         LIMIT  3`
      ),

      // Productos más vendidos globales
      query(
        `SELECT p.id, p.nombre,
                CAST(SUM(pl.cantidad) AS UNSIGNED) AS unidades_vendidas,
                SUM(pl.subtotal) AS ingresos
         FROM   pedido_lineas pl
         JOIN   pedidos  o ON o.id  = pl.pedido_id
         JOIN   productos p ON p.id = pl.producto_id
         WHERE  o.estado = 'delivered'
         GROUP  BY p.id, p.nombre
         ORDER  BY unidades_vendidas DESC
         LIMIT  5`
      ),

      // Ventas por mes en el año actual
      query(
        `SELECT MONTH(p.created_at) AS mes,
                COALESCE(SUM(pl.subtotal), 0) AS ingresos
         FROM   pedidos p
         JOIN   pedido_lineas pl ON pl.pedido_id = p.id
         WHERE  p.estado = 'delivered'
           AND  p.created_at >= DATE_FORMAT(CURDATE(), '%Y-01-01')
         GROUP  BY mes
         ORDER  BY mes`
      ),
    ]);

    res.json({
      metricas:          metricasRows[0],
      pedidos_recientes: pedidosRecientes,
      tickets_abiertos:  ticketsAbiertos,
      destacados,
      top_vendidos:      topVendidos,
      ventas_anuales:    ventasAnuales,
    });
  } catch (err) {
    console.error('Dashboard cliente error:', err);
    res.status(500).json({ error: 'Error al obtener métricas' });
  }
});

module.exports = router;
