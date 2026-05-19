// ============================================================
//  routes/tickets.js — Soporte al cliente
// ============================================================
const router = require('express').Router();
const { query } = require('../config/db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

// ── GET /api/tickets ────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  const isAdmin = req.user.rol === 'admin';
  const { estado, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const params = [req.user.rol];   // $1 / ? para filtrar notas internas
  const where  = [];
  if (!isAdmin) { params.push(req.user.id); where.push('t.usuario_id = ?'); }
  if (estado)   { params.push(estado);       where.push('t.estado = ?'); }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  params.push(parseInt(limit), offset);

  try {
    const { rows } = await query(
      `SELECT t.id, t.codigo, t.asunto, t.descripcion, t.estado,
              t.prioridad, t.created_at, t.updated_at, t.closed_at,
              u.nombre AS usuario_nombre, u.email AS usuario_email,
              (SELECT COUNT(*) FROM ticket_mensajes tm WHERE tm.ticket_id = t.id
              ) AS total_mensajes,
              (SELECT JSON_OBJECT(
                 'mensaje',      tm2.mensaje,
                 'es_interno',   tm2.es_interno,
                 'autor_nombre', u2.nombre,
                 'autor_rol',    r2.nombre,
                 'created_at',   tm2.created_at
               )
               FROM ticket_mensajes tm2
               JOIN usuarios u2 ON u2.id = tm2.autor_id
               JOIN roles    r2 ON r2.id = u2.rol_id
               WHERE tm2.ticket_id = t.id
                 AND (tm2.es_interno = 0 OR ? = 'admin')
               ORDER BY tm2.created_at DESC
               LIMIT 1
              ) AS ultimo_mensaje
       FROM   tickets  t
       JOIN   usuarios u ON u.id = t.usuario_id
       ${whereClause}
       ORDER  BY t.created_at DESC
       LIMIT  ? OFFSET ?`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /tickets:', err);
    res.status(500).json({ error: 'Error al obtener tickets' });
  }
});

// ── GET /api/tickets/:id — Con mensajes ─────────────────────
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const [{ rows: ticketRows }, { rows: msgsRows }] = await Promise.all([
      query(
        `SELECT t.*, u.nombre AS usuario_nombre, u.email AS usuario_email
         FROM   tickets  t
         JOIN   usuarios u ON u.id = t.usuario_id
         WHERE  t.id = ? AND (t.usuario_id = ? OR ? = 'admin')`,
        [req.params.id, req.user.id, req.user.rol]
      ),
      query(
        `SELECT tm.*, u.nombre AS autor_nombre, u.avatar_url AS autor_avatar,
                r.nombre AS autor_rol
         FROM   ticket_mensajes tm
         JOIN   usuarios u ON u.id = tm.autor_id
         JOIN   roles    r ON r.id = u.rol_id
         WHERE  tm.ticket_id = ?
           AND  (tm.es_interno = 0 OR ? = 'admin')
         ORDER  BY tm.created_at`,
        [req.params.id, req.user.rol]
      ),
    ]);

    if (!ticketRows.length)
      return res.status(404).json({ error: 'Ticket no encontrado' });

    res.json({ ...ticketRows[0], mensajes: msgsRows });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener ticket' });
  }
});

// ── POST /api/tickets — Crear ───────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
  const { asunto, descripcion, prioridad = 'media' } = req.body;
  if (!asunto || !descripcion)
    return res.status(400).json({ error: 'Asunto y descripción son obligatorios' });

  const prioridadesValidas = ['baja', 'media', 'alta', 'urgente'];
  if (!prioridadesValidas.includes(prioridad))
    return res.status(400).json({ error: `Prioridad inválida. Opciones: ${prioridadesValidas.join(', ')}` });

  try {
    const { insertId } = await query(
      `INSERT INTO tickets (usuario_id, asunto, descripcion, prioridad)
       VALUES (?, ?, ?, ?)`,
      [req.user.id, asunto.trim(), descripcion.trim(), prioridad]
    );

    const { rows } = await query('SELECT * FROM tickets WHERE id = ?', [insertId]);
    res.status(201).json(rows[0]);
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
    const { rows: ticket } = await query(
      "SELECT id, estado FROM tickets WHERE id = ? AND (usuario_id = ? OR ? = 'admin')",
      [req.params.id, req.user.id, req.user.rol]
    );
    if (!ticket.length)
      return res.status(404).json({ error: 'Ticket no encontrado' });
    if (ticket[0].estado === 'closed')
      return res.status(400).json({ error: 'El ticket está cerrado' });

    // Abrir ticket si estaba pendiente
    if (ticket[0].estado === 'pending') {
      await query("UPDATE tickets SET estado = 'open' WHERE id = ?", [req.params.id]);
    }

    const { insertId } = await query(
      `INSERT INTO ticket_mensajes (ticket_id, autor_id, mensaje, es_interno)
       VALUES (?, ?, ?, ?)`,
      [req.params.id, req.user.id, mensaje.trim(), es_interno ? 1 : 0]
    );

    const { rows } = await query(
      'SELECT * FROM ticket_mensajes WHERE id = ?', [insertId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al enviar mensaje' });
  }
});

// ── PUT /api/tickets/:id/estado — Cambiar estado (admin) ────
router.put('/:id/estado', authMiddleware, adminOnly, async (req, res) => {
  const { estado } = req.body;
  if (!['pending', 'open', 'closed'].includes(estado))
    return res.status(400).json({ error: 'Estado inválido: pending | open | closed' });

  try {
    const { rows: check } = await query(
      'SELECT id FROM tickets WHERE id = ?', [req.params.id]
    );
    if (!check.length)
      return res.status(404).json({ error: 'Ticket no encontrado' });

    // El trigger trg_ticket_closed_at gestiona closed_at automáticamente
    await query('UPDATE tickets SET estado = ? WHERE id = ?', [estado, req.params.id]);

    const { rows } = await query(
      'SELECT id, codigo, estado, closed_at FROM tickets WHERE id = ?',
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar ticket' });
  }
});

module.exports = router;
