// ============================================================
//  routes/eventos.js — Calendario de eventos
// ============================================================
const router = require('express').Router();
const { query } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

// ── GET /api/eventos?year=&month= ──────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  const { year, month } = req.query;
  const isAdmin = req.user?.rol === 'admin';
  const params = [];
  const conditions = [];

  if (!isAdmin) {
    conditions.push('(e.publico IS TRUE OR e.usuario_id = $1)');
    params.push(req.user.id);
  }

  if (year && month) {
    const yearIndex = params.length + 1;
    const monthIndex = params.length + 2;
    conditions.push(`EXTRACT(YEAR FROM e.fecha_hora) = $${yearIndex}`);
    conditions.push(`EXTRACT(MONTH FROM e.fecha_hora) = $${monthIndex}`);
    params.push(year, month);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const result = await query(
      `SELECT id, usuario_id, titulo, descripcion, fecha_hora, tipo, publico, created_at
       FROM   eventos e
       ${where}
       ORDER  BY e.fecha_hora`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    if (err.message && err.message.includes('column "publico" does not exist')) {
      try {
        const result = await query(
          `SELECT id, usuario_id, titulo, descripcion, fecha_hora, tipo, created_at
           FROM   eventos e
           ${where}
           ORDER  BY e.fecha_hora`,
          params
        );
        res.json(result.rows.map(row => ({ ...row, publico: true })));
        return;
      } catch (_inner) {
        // deja pasar al error general
      }
    }
    res.status(500).json({ error: 'Error al obtener eventos' });
  }
});

// ── POST /api/eventos — Crear ───────────────────────────────
router.post('/', authMiddleware, adminOnly, async (req, res) => {
  const { titulo, descripcion, fecha_hora, tipo = 'Evento', publico = true } = req.body;
  if (!titulo || !fecha_hora)
    return res.status(400).json({ error: 'Título y fecha_hora son obligatorios' });

  const tiposValidos = ['Evento','Reunión','Tarea','Recordatorio'];
  if (!tiposValidos.includes(tipo))
    return res.status(400).json({ error: `Tipo inválido. Opciones: ${tiposValidos.join(', ')}` });

  const publicoValue = typeof publico === 'boolean' ? publico : String(publico) !== 'false';

  try {
    const result = await query(
      `INSERT INTO eventos (usuario_id, titulo, descripcion, fecha_hora, tipo, publico)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.id, titulo.trim(), descripcion || null, fecha_hora, tipo, publicoValue]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.message && err.message.includes('column "publico" does not exist')) {
      try {
        const result = await query(
          `INSERT INTO eventos (usuario_id, titulo, descripcion, fecha_hora, tipo)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [req.user.id, titulo.trim(), descripcion || null, fecha_hora, tipo]
        );
        res.status(201).json({ ...result.rows[0], publico: true });
        return;
      } catch (_inner) {
        // deja pasar al error general
      }
    }
    res.status(500).json({ error: 'Error al crear evento' });
  }
});

// ── PUT /api/eventos/:id — Actualizar ───────────────────────
router.put('/:id', authMiddleware, adminOnly, async (req, res) => {
  const { titulo, descripcion, fecha_hora, tipo, publico } = req.body;
  if (tipo) {
    const tiposValidos = ['Evento','Reunión','Tarea','Recordatorio'];
    if (!tiposValidos.includes(tipo))
      return res.status(400).json({ error: `Tipo inválido. Opciones: ${tiposValidos.join(', ')}` });
  }

  const publicoValue = publico === undefined ? null : (typeof publico === 'boolean' ? publico : String(publico) !== 'false');

  try {
    const result = await query(
      `UPDATE eventos SET
         titulo      = COALESCE($1, titulo),
         descripcion = COALESCE($2, descripcion),
         fecha_hora  = COALESCE($3, fecha_hora),
         tipo        = COALESCE($4, tipo),
         publico     = CASE WHEN $5 IS NULL THEN publico ELSE $5 END
       WHERE id = $6
       RETURNING *`,
      [titulo, descripcion, fecha_hora, tipo, publicoValue, req.params.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Evento no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    if (err.message && err.message.includes('column "publico" does not exist')) {
      try {
        const result = await query(
          `UPDATE eventos SET
             titulo      = COALESCE($1, titulo),
             descripcion = COALESCE($2, descripcion),
             fecha_hora  = COALESCE($3, fecha_hora),
             tipo        = COALESCE($4, tipo)
           WHERE id = $5
           RETURNING *`,
          [titulo, descripcion, fecha_hora, tipo, req.params.id]
        );
        if (result.rows.length === 0)
          return res.status(404).json({ error: 'Evento no encontrado' });
        res.json({ ...result.rows[0], publico: true });
        return;
      } catch (_inner) {
        // deja pasar al error general
      }
    }
    res.status(500).json({ error: 'Error al actualizar evento' });
  }
});

// ── DELETE /api/eventos/:id ─────────────────────────────────
router.delete('/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM eventos WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Evento no encontrado' });
    res.json({ message: 'Evento eliminado', id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar evento' });
  }
});

module.exports = router;
