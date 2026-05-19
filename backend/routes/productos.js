// ============================================================
//  routes/productos.js — CRUD de productos + filtros
// ============================================================
const router = require('express').Router();
const { query } = require('../config/db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

// ── GET /api/productos — Listar con filtros ─────────────────
router.get('/', async (req, res) => {
  const {
    q, categoria, tipo, estado,
    fecha_desde, fecha_hasta,
    sort = 'nombre', order = 'asc',
    page = 1, limit = 50,
  } = req.query;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  const where  = ['p.activo = 1'];

  if (q) {
    const like = `%${q}%`;
    // utf8mb4_unicode_ci ya es accent+case insensitive — no se necesita translate()
    where.push(
      '(p.nombre LIKE ? OR p.descripcion LIKE ? OR c.nombre LIKE ? OR c.slug LIKE ? OR p.tipo LIKE ? OR p.estado LIKE ?)'
    );
    params.push(like, like, like, like, like, like);
  }
  if (categoria) { params.push(categoria);   where.push('c.slug = ?'); }
  if (tipo)      { params.push(tipo);         where.push('p.tipo = ?'); }
  if (estado)    { params.push(estado);       where.push('p.estado = ?'); }
  if (fecha_desde) { params.push(fecha_desde); where.push('p.fecha_inicio >= ?'); }
  if (fecha_hasta) { params.push(fecha_hasta); where.push('(p.fecha_fin IS NULL OR p.fecha_fin <= ?)'); }

  const sortMap = {
    nombre: 'p.nombre', precio: 'p.precio',
    rating: 'p.rating', stock: 'p.stock', id: 'p.id',
  };
  const sortCol = sortMap[sort] || 'p.nombre';
  const sortDir = order === 'desc' ? 'DESC' : 'ASC';

  const whereClause = where.join(' AND ');

  try {
    const dataParams  = [...params, parseInt(limit), offset];
    const countParams = [...params];

    const sql = `
      SELECT p.id, p.nombre, p.descripcion,
             c.nombre AS categoria, c.slug AS categoria_slug,
             p.precio, p.stock, p.rating, p.img_url,
             p.featured, p.tipo, p.estado,
             p.fecha_inicio, p.fecha_fin,
             p.created_at, p.updated_at,
             (SELECT COUNT(*) FROM favoritos f WHERE f.producto_id = p.id) AS total_favoritos
      FROM   productos p
      JOIN   categorias c ON c.id = p.categoria_id
      WHERE  ${whereClause}
      ORDER  BY ${sortCol} ${sortDir}
      LIMIT  ? OFFSET ?
    `;

    const countSql = `
      SELECT COUNT(*) AS total
      FROM   productos p
      JOIN   categorias c ON c.id = p.categoria_id
      WHERE  ${whereClause}
    `;

    const [{ rows: data }, { rows: count }] = await Promise.all([
      query(sql, dataParams),
      query(countSql, countParams),
    ]);

    res.json({
      data,
      total: parseInt(count[0].total),
      page:  parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    console.error('GET /productos error:', err);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

// ── GET /api/productos/cat/lista — Listar categorías ────────
// IMPORTANTE: esta ruta debe ir ANTES de /:id para no ser captada por ese patrón
router.get('/cat/lista', async (_req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, nombre, slug, descripcion FROM categorias WHERE activa = 1 ORDER BY nombre'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener categorías' });
  }
});

// ── GET /api/productos/:id ──────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.*, c.nombre AS categoria, c.slug AS categoria_slug,
              (SELECT JSON_ARRAYAGG(
                 JSON_OBJECT('id', pi.id, 'url', pi.url, 'orden', pi.orden)
                 ORDER BY pi.orden
               )
               FROM producto_imagenes pi WHERE pi.producto_id = p.id) AS imagenes
       FROM   productos p
       JOIN   categorias c ON c.id = p.categoria_id
       WHERE  p.id = ? AND p.activo = 1`,
      [req.params.id]
    );
    if (!rows.length)
      return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener producto' });
  }
});

// ── POST /api/productos — Crear (solo admin) ────────────────
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  const {
    categoria_slug, nombre, descripcion, precio, stock,
    rating = 5, img_url, featured = false,
    tipo = 'compra', estado = 'activo', fecha_inicio, fecha_fin,
  } = req.body;

  if (!nombre || !categoria_slug || precio == null || stock == null)
    return res.status(400).json({ error: 'nombre, categoria_slug, precio y stock son obligatorios' });

  try {
    const { rows: cat } = await query(
      'SELECT id FROM categorias WHERE slug = ?',
      [categoria_slug]
    );
    if (!cat.length)
      return res.status(400).json({ error: 'Categoría no encontrada' });

    const { insertId } = await query(
      `INSERT INTO productos
         (categoria_id, nombre, descripcion, precio, stock, rating,
          img_url, featured, tipo, estado, fecha_inicio, fecha_fin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cat[0].id, nombre, descripcion || null, precio, stock, rating,
       img_url || null, featured ? 1 : 0, tipo, estado,
       fecha_inicio || null, fecha_fin || null]
    );

    const { rows } = await query('SELECT * FROM productos WHERE id = ?', [insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /productos error:', err);
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

// ── PUT /api/productos/:id — Actualizar (solo admin) ────────
router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  const {
    nombre, descripcion, precio, stock, rating,
    img_url, featured, tipo, estado, fecha_inicio, fecha_fin, categoria_slug,
  } = req.body;

  try {
    let catId = null;
    if (categoria_slug) {
      const { rows: cat } = await query(
        'SELECT id FROM categorias WHERE slug = ?', [categoria_slug]
      );
      catId = cat[0]?.id ?? null;
    }

    const { affectedRows } = await query(
      `UPDATE productos SET
         nombre       = COALESCE(?, nombre),
         descripcion  = COALESCE(?, descripcion),
         precio       = COALESCE(?, precio),
         stock        = COALESCE(?, stock),
         rating       = COALESCE(?, rating),
         img_url      = COALESCE(?, img_url),
         featured     = COALESCE(?, featured),
         tipo         = COALESCE(?, tipo),
         estado       = COALESCE(?, estado),
         fecha_inicio = COALESCE(?, fecha_inicio),
         fecha_fin    = COALESCE(?, fecha_fin),
         categoria_id = COALESCE(?, categoria_id)
       WHERE id = ?`,
      [nombre ?? null, descripcion ?? null, precio ?? null, stock ?? null,
       rating ?? null, img_url ?? null, featured != null ? (featured ? 1 : 0) : null,
       tipo ?? null, estado ?? null, fecha_inicio ?? null, fecha_fin ?? null,
       catId, req.params.id]
    );

    if (!affectedRows)
      return res.status(404).json({ error: 'Producto no encontrado' });

    const { rows } = await query('SELECT * FROM productos WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar producto' });
  }
});

// ── DELETE /api/productos/:id — Soft delete (solo admin) ────
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { rows: check } = await query(
      'SELECT id, nombre FROM productos WHERE id = ?',
      [req.params.id]
    );
    if (!check.length)
      return res.status(404).json({ error: 'Producto no encontrado' });

    await query('UPDATE productos SET activo = 0 WHERE id = ?', [req.params.id]);
    res.json({ message: `Producto "${check[0].nombre}" eliminado`, id: check[0].id });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
});

module.exports = router;
