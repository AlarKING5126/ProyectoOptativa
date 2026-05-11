// ============================================================
//  routes/dashboard.js — Métricas para paneles admin/cliente
// ============================================================
const router  = require('express').Router();
const { query } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

// ── GET /api/dashboard/admin ────────────────────────────────
router.get('/admin', authMiddleware, adminOnly, async (req, res) => {
  try {
    const [metricas, lowStock, topVendidos, ticketsRecientes, pedidosRecientes] = await Promise.all([
      // Métricas globales desde la vista
      query('SELECT * FROM v_dashboard_admin'),

      // Productos con stock bajo (≤ 15)
      query(
        `SELECT id, nombre, stock, categoria_id,
                (SELECT nombre FROM categorias WHERE id = categoria_id) AS categoria
         FROM   productos
         WHERE  stock <= 15 AND activo = TRUE
         ORDER  BY stock ASC LIMIT 8`
      ),

      // Productos más vendidos
      query(
        `SELECT p.id, p.nombre, p.img_url,
                SUM(pl.cantidad) AS unidades_vendidas,
                SUM(pl.subtotal) AS ingresos
         FROM   pedido_lineas pl
         JOIN   productos p ON p.id = pl.producto_id
         GROUP  BY p.id, p.nombre, p.img_url
         ORDER  BY unidades_vendidas DESC LIMIT 5`
      ),

      // Últimos tickets abiertos
      query(
        `SELECT t.id, t.codigo, t.asunto, t.prioridad, t.estado,
                t.created_at, u.nombre AS usuario_nombre
         FROM   tickets t
         JOIN   usuarios u ON u.id = t.usuario_id
         WHERE  t.estado <> 'closed'
         ORDER  BY t.created_at DESC LIMIT 5`
      ),

      // Últimos pedidos
      query(
        `SELECT p.id, p.codigo, p.total, p.estado, p.created_at,
                u.nombre AS cliente_nombre
         FROM   pedidos p
         JOIN   usuarios u ON u.id = p.usuario_id
         ORDER  BY p.created_at DESC LIMIT 5`
      ),
    ]);

    res.json({
      metricas:         metricas.rows[0],
      low_stock:        lowStock.rows,
      top_vendidos:     topVendidos.rows,
      tickets_recientes:ticketsRecientes.rows,
      pedidos_recientes:pedidosRecientes.rows,
    });
  } catch (err) {
    console.error('Dashboard admin error:', err);
    res.status(500).json({ error: 'Error al obtener métricas' });
  }
});

// ── GET /api/dashboard/cliente ──────────────────────────────
router.get('/cliente', authMiddleware, async (req, res) => {
  try {
    const [metricas, pedidosRecientes, ticketsAbiertos, favsTop, topVendidos, ventasAnuales] = await Promise.all([
      // Métricas personales
      query(
        `SELECT
           (SELECT COUNT(*) FROM pedidos   WHERE usuario_id=$1 AND estado<>'cancelled') AS total_pedidos,
           (SELECT COALESCE(SUM(total),0) FROM pedidos WHERE usuario_id=$1 AND estado='delivered') AS total_gastado,
           (SELECT COUNT(*) FROM favoritos WHERE usuario_id=$1) AS total_favoritos,
           (SELECT COUNT(*) FROM tickets   WHERE usuario_id=$1 AND estado<>'closed')    AS tickets_abiertos,
           (SELECT COALESCE(SUM(ci.cantidad),0)
            FROM carrito_items ci
            JOIN carritos c ON c.id=ci.carrito_id
            WHERE c.usuario_id=$1)                                                       AS items_carrito`,
        [req.user.id]
      ),

      // Últimos 3 pedidos
      query(
        `SELECT id, codigo, total, estado, created_at
         FROM   pedidos
         WHERE  usuario_id = $1
         ORDER  BY created_at DESC LIMIT 3`,
        [req.user.id]
      ),

      // Tickets sin cerrar
      query(
        `SELECT id, codigo, asunto, estado, prioridad, created_at
         FROM   tickets
         WHERE  usuario_id = $1 AND estado <> 'closed'
         ORDER  BY created_at DESC LIMIT 3`,
        [req.user.id]
      ),

      // Productos destacados (featured)
      query(
        `SELECT p.id, p.nombre, p.precio, p.img_url, p.rating, p.tipo
         FROM   productos p
         WHERE  p.featured = TRUE AND p.activo = TRUE
         ORDER  BY p.rating DESC LIMIT 3`
      ),

      // Productos más vendidos globales
      query(
        `SELECT p.id, p.nombre, SUM(pl.cantidad)::int AS unidades_vendidas,
                SUM(pl.subtotal) AS ingresos
         FROM   pedido_lineas pl
         JOIN   pedidos o ON o.id = pl.pedido_id
         JOIN   productos p ON p.id = pl.producto_id
         WHERE  o.estado = 'delivered'
         GROUP  BY p.id, p.nombre
         ORDER  BY unidades_vendidas DESC LIMIT 5`
      ),

      // Ventas por mes en el año actual
      query(
        `SELECT EXTRACT(MONTH FROM p.created_at)::int AS mes,
                COALESCE(SUM(pl.subtotal),0) AS ingresos
         FROM   pedidos p
         JOIN   pedido_lineas pl ON pl.pedido_id = p.id
         WHERE  p.estado = 'delivered' AND p.created_at >= date_trunc('year', current_date)
         GROUP  BY mes
         ORDER  BY mes`
      ),
    ]);

    res.json({
      metricas:         metricas.rows[0],
      pedidos_recientes:pedidosRecientes.rows,
      tickets_abiertos: ticketsAbiertos.rows,
      destacados:       favsTop.rows,
      top_vendidos:     topVendidos.rows,
      ventas_anuales:   ventasAnuales.rows,
    });
  } catch (err) {
    console.error('Dashboard cliente error:', err);
    res.status(500).json({ error: 'Error al obtener métricas' });
  }
});

module.exports = router;
