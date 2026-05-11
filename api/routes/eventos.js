// ============================================================
//  routes/eventos.js — Calendario de eventos
// ============================================================
const router = require('express').Router();
const { query } = require('../db');
const { authMiddleware } = require('../middleware/auth');

// ── GET /api/eventos?year=&month= ──────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  const { year, month } = req.query;
  const params = [req.user.id];
  let where = 'WHERE e.usuario_id = $1';

  if (year && month) {
    params.push(year, month);
    where += ` AND EXTRACT(YEAR FROM e.fecha_hora) = $2
               AND EXTRACT(MONTH FROM e.fecha_hora) = $3`;
  }

  try {
    const result = await query(
      `SELECT id, titulo, descripcion, fecha_hora, tipo, created_at
       FROM   eventos e
       ${where}
       ORDER  BY e.fecha_hora`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener eventos' });
  }
});

// ── POST /api/eventos — Crear ───────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
  const { titulo, descripcion, fecha_hora, tipo = 'Evento' } = req.body;
  if (!titulo || !fecha_hora)
    return res.status(400).json({ error: 'Título y fecha_hora son obligatorios' });

  const tiposValidos = ['Evento','Reunión','Tarea','Recordatorio'];
  if (!tiposValidos.includes(tipo))
    return res.status(400).json({ error: `Tipo inválido. Opciones: ${tiposValidos.join(', ')}` });

  try {
    const result = await query(
      `INSERT INTO eventos (usuario_id, titulo, descripcion, fecha_hora, tipo)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, titulo.trim(), descripcion || null, fecha_hora, tipo]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear evento' });
  }
});

// ── PUT /api/eventos/:id — Actualizar ───────────────────────
router.put('/:id', authMiddleware, async (req, res) => {
  const { titulo, descripcion, fecha_hora, tipo } = req.body;
  try {
    const result = await query(
      `UPDATE eventos SET
         titulo      = COALESCE($1, titulo),
         descripcion = COALESCE($2, descripcion),
         fecha_hora  = COALESCE($3, fecha_hora),
         tipo        = COALESCE($4, tipo)
       WHERE id = $5 AND usuario_id = $6
       RETURNING *`,
      [titulo, descripcion, fecha_hora, tipo, req.params.id, req.user.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Evento no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar evento' });
  }
});

// ── DELETE /api/eventos/:id ─────────────────────────────────
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM eventos WHERE id = $1 AND usuario_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Evento no encontrado' });
    res.json({ message: 'Evento eliminado', id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar evento' });
  }
});

module.exports = router;
