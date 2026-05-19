// ============================================================
//  routes/eventos.js — Calendario de eventos
// ============================================================
const router = require('express').Router();
const { query } = require('../config/db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const TIPOS_VALIDOS = ['Evento', 'Reunión', 'Tarea', 'Recordatorio'];

// ── GET /api/eventos?year=&month= ──────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  const { year, month } = req.query;
  const isAdmin = req.user.rol === 'admin';
  const params  = [];
  const conditions = [];

  if (!isAdmin) {
    conditions.push('(e.publico = 1 OR e.usuario_id = ?)');
    params.push(req.user.id);
  }
  if (year && month) {
    conditions.push('YEAR(e.fecha_hora) = ? AND MONTH(e.fecha_hora) = ?');
    params.push(parseInt(year), parseInt(month));
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const { rows } = await query(
      `SELECT id, usuario_id, titulo, descripcion, fecha_hora, tipo, publico, created_at
       FROM   eventos e
       ${where}
       ORDER  BY e.fecha_hora`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /eventos:', err);
    res.status(500).json({ error: 'Error al obtener eventos' });
  }
});

// ── POST /api/eventos — Crear ───────────────────────────────
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  const { titulo, descripcion, fecha_hora, tipo = 'Evento', publico = true } = req.body;
  if (!titulo || !fecha_hora)
    return res.status(400).json({ error: 'Título y fecha_hora son obligatorios' });
  if (!TIPOS_VALIDOS.includes(tipo))
    return res.status(400).json({ error: `Tipo inválido. Opciones: ${TIPOS_VALIDOS.join(', ')}` });

  const publicoVal = typeof publico === 'boolean' ? publico : String(publico) !== 'false';

  try {
    const { insertId } = await query(
      `INSERT INTO eventos (usuario_id, titulo, descripcion, fecha_hora, tipo, publico)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, titulo.trim(), descripcion || null, fecha_hora, tipo, publicoVal ? 1 : 0]
    );

    const { rows } = await query('SELECT * FROM eventos WHERE id = ?', [insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /eventos:', err);
    res.status(500).json({ error: 'Error al crear evento' });
  }
});

// ── PUT /api/eventos/:id — Actualizar ───────────────────────
router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  const { titulo, descripcion, fecha_hora, tipo, publico } = req.body;
  if (tipo && !TIPOS_VALIDOS.includes(tipo))
    return res.status(400).json({ error: `Tipo inválido. Opciones: ${TIPOS_VALIDOS.join(', ')}` });

  const publicoVal = publico === undefined
    ? null
    : (typeof publico === 'boolean' ? publico : String(publico) !== 'false');

  try {
    const { rows: check } = await query(
      'SELECT id FROM eventos WHERE id = ?', [req.params.id]
    );
    if (!check.length)
      return res.status(404).json({ error: 'Evento no encontrado' });

    await query(
      `UPDATE eventos SET
         titulo      = COALESCE(?, titulo),
         descripcion = COALESCE(?, descripcion),
         fecha_hora  = COALESCE(?, fecha_hora),
         tipo        = COALESCE(?, tipo),
         publico     = CASE WHEN ? IS NULL THEN publico ELSE ? END
       WHERE id = ?`,
      [titulo ?? null, descripcion ?? null, fecha_hora ?? null, tipo ?? null,
       publicoVal, publicoVal !== null ? (publicoVal ? 1 : 0) : null,
       req.params.id]
    );

    const { rows } = await query('SELECT * FROM eventos WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar evento' });
  }
});

// ── DELETE /api/eventos/:id ─────────────────────────────────
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { rows: check } = await query(
      'SELECT id FROM eventos WHERE id = ?', [req.params.id]
    );
    if (!check.length)
      return res.status(404).json({ error: 'Evento no encontrado' });

    await query('DELETE FROM eventos WHERE id = ?', [req.params.id]);
    res.json({ message: 'Evento eliminado', id: parseInt(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar evento' });
  }
});

module.exports = router;
