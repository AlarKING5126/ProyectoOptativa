// ============================================================
//  routes/tickets.js — Soporte al cliente
// ============================================================
const router = require('express').Router();
const { query } = require('../db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

// ── GET /api/tickets ────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  const isAdmin = req.user.rol === 'admin';
  const { estado, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const params = [req.user.rol];
  const where  = [];
  if (!isAdmin) { params.push(req.user.id); where.push('t.usuario_id = $2'); }
  if (estado) { params.push(estado); where.push(`t.estado = $${params.length}`); }
  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  params.push(parseInt(limit), offset);

  try {
    const result = await query(
      `SELECT t.id, t.codigo, t.asunto, t.descripcion, t.estado,
              t.prioridad, t.created_at, t.updated_at, t.closed_at,
              u.nombre AS usuario_nombre, u.email AS usuario_email,
              (SELECT COUNT(*) FROM ticket_mensajes tm WHERE tm.ticket_id = t.id) AS total_mensajes,
              (SELECT json_build_object(
                  'mensaje', tm.mensaje,
                  'es_interno', tm.es_interno,
                  'autor_nombre', u2.nombre,
                  'autor_rol', r.nombre,
                  'created_at', tm.created_at
                )
               FROM ticket_mensajes tm
               JOIN usuarios u2 ON u2.id = tm.autor_id
               JOIN roles r ON r.id = u2.rol_id
               WHERE tm.ticket_id = t.id
                 AND (tm.es_interno = FALSE OR $1 = 'admin')
               ORDER BY tm.created_at DESC
               LIMIT 1
              ) AS ultimo_mensaje
       FROM   tickets t
       JOIN   usuarios u ON u.id = t.usuario_id
       ${whereClause}
       ORDER  BY t.created_at DESC
       LIMIT  $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener tickets' });
  }
});

// ── GET /api/tickets/:id — Con mensajes ─────────────────────
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const [ticketRes, msgsRes] = await Promise.all([
      query(
        `SELECT t.*, u.nombre AS usuario_nombre, u.email AS usuario_email
         FROM tickets t JOIN usuarios u ON u.id = t.usuario_id
         WHERE t.id = $1 AND (t.usuario_id = $2 OR $3 = 'admin')`,
        [req.params.id, req.user.id, req.user.rol]
      ),
      query(
        `SELECT tm.*, u.nombre AS autor_nombre, u.avatar_url AS autor_avatar,
                r.nombre AS autor_rol
         FROM   ticket_mensajes tm
         JOIN   usuarios u ON u.id = tm.autor_id
         JOIN   roles    r ON r.id = u.rol_id
         WHERE  tm.ticket_id = $1
           AND  (tm.es_interno = FALSE OR $2 = 'admin')
         ORDER  BY tm.created_at`,
        [req.params.id, req.user.rol]
      )
    ]);

    if (ticketRes.rows.length === 0)
      return res.status(404).json({ error: 'Ticket no encontrado' });

    res.json({ ...ticketRes.rows[0], mensajes: msgsRes.rows });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener ticket' });
  }
});

// ── POST /api/tickets — Crear ───────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
  const { asunto, descripcion, prioridad = 'media' } = req.body;
  if (!asunto || !descripcion)
    return res.status(400).json({ error: 'Asunto y descripción son obligatorios' });

  try {
    const result = await query(
      `INSERT INTO tickets (usuario_id, asunto, descripcion, prioridad)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, asunto.trim(), descripcion.trim(), prioridad]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al crear ticket' });
  }
});

// ── POST /api/tickets/:id/mensajes — Responder ──────────────
router.post('/:id/mensajes', authMiddleware, async (req, res) => {
  const { mensaje, es_interno = false } = req.body;
  if (!mensaje?.trim())
    return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
  if (es_interno && req.user.rol !== 'admin')
    return res.status(403).json({ error: 'Solo admins pueden crear notas internas' });

  try {
    // Verificar acceso al ticket
    const ticket = await query(
      'SELECT id, estado FROM tickets WHERE id = $1 AND (usuario_id = $2 OR $3 = \'admin\')',
      [req.params.id, req.user.id, req.user.rol]
    );
    if (ticket.rows.length === 0)
      return res.status(404).json({ error: 'Ticket no encontrado' });
    if (ticket.rows[0].estado === 'closed')
      return res.status(400).json({ error: 'El ticket está cerrado' });

    // Abrir ticket si estaba pendiente
    if (ticket.rows[0].estado === 'pending') {
      await query("UPDATE tickets SET estado = 'open' WHERE id = $1", [req.params.id]);
    }

    const result = await query(
      `INSERT INTO ticket_mensajes (ticket_id, autor_id, mensaje, es_interno)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.id, req.user.id, mensaje.trim(), es_interno]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al enviar mensaje' });
  }
});

// ── PUT /api/tickets/:id/estado — Cambiar estado (admin) ────
router.put('/:id/estado', authMiddleware, adminOnly, async (req, res) => {
  const { estado } = req.body;
  if (!['pending','open','closed'].includes(estado))
    return res.status(400).json({ error: 'Estado inválido: pending | open | closed' });

  try {
    const result = await query(
      `UPDATE tickets SET estado = $1 WHERE id = $2 RETURNING id, codigo, estado, closed_at`,
      [estado, req.params.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Ticket no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar ticket' });
  }
});

module.exports = router;
