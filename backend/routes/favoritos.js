// ============================================================
//  routes/favoritos.js — Wishlist del usuario
// ============================================================
const router = require('express').Router();
const { query } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

// ── GET /api/favoritos ─────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.id, p.nombre, p.precio, p.img_url, p.stock,
              p.rating, p.tipo, p.estado,
              c.nombre AS categoria,
              f.added_at
       FROM   favoritos  f
       JOIN   productos  p ON p.id = f.producto_id
       JOIN   categorias c ON c.id = p.categoria_id
       WHERE  f.usuario_id = ? AND p.activo = 1
       ORDER  BY f.added_at DESC`,
      [req.user.id]
    );

    const total_valor = rows.reduce((s, p) => s + parseFloat(p.precio), 0);
    res.json({ items: rows, total: rows.length, total_valor });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener favoritos' });
  }
});

// ── POST /api/favoritos/:productoId — Agregar ──────────────
router.post('/:productoId', authMiddleware, async (req, res) => {
  try {
    // INSERT IGNORE respeta la PRIMARY KEY (usuario_id, producto_id)
    await query(
      'INSERT IGNORE INTO favoritos (usuario_id, producto_id) VALUES (?, ?)',
      [req.user.id, req.params.productoId]
    );
    res.status(201).json({ message: 'Producto añadido a favoritos' });
  } catch (err) {
    res.status(500).json({ error: 'Error al añadir favorito' });
  }
});

// ── DELETE /api/favoritos/:productoId — Quitar ─────────────
router.delete('/:productoId', authMiddleware, async (req, res) => {
  try {
    await query(
      'DELETE FROM favoritos WHERE usuario_id = ? AND producto_id = ?',
      [req.user.id, req.params.productoId]
    );
    res.json({ message: 'Producto eliminado de favoritos' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar favorito' });
  }
});

module.exports = router;
