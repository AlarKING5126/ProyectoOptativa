// ============================================================
//  routes/auth.js — Login, Registro, Perfil
// ============================================================
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { query } = require('../config/db');
const { authMiddleware, adminOnly } = require('../middleware/auth');

// ── POST /api/auth/login ────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email y contraseña son obligatorios' });

  try {
    const { rows } = await query(
      `SELECT u.id, u.nombre, u.email, u.password_hash, u.avatar_url,
              u.telefono, u.direccion, u.activo, r.nombre AS rol
       FROM   usuarios u
       JOIN   roles    r ON r.id = u.rol_id
       WHERE  u.email = ?`,
      [email.toLowerCase().trim()]
    );

    if (!rows.length)
      return res.status(401).json({ error: 'Credenciales incorrectas' });

    const user = rows[0];

    if (!user.activo)
      return res.status(403).json({ error: 'Cuenta suspendida' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)
      return res.status(401).json({ error: 'Credenciales incorrectas' });

    const token = jwt.sign(
      { id: user.id, email: user.email, rol: user.rol, nombre: user.nombre },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      token,
      usuario: {
        id:        user.id,
        nombre:    user.nombre,
        email:     user.email,
        rol:       user.rol,
        avatar_url:user.avatar_url,
        telefono:  user.telefono,
        direccion: user.direccion,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ── POST /api/auth/registro ─────────────────────────────────
router.post('/registro', async (req, res) => {
  const { nombre, email, password, telefono, direccion } = req.body;
  if (!nombre || !email || !password)
    return res.status(400).json({ error: 'Nombre, email y contraseña son obligatorios' });
  if (password.length < 6)
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

  try {
    const { rows: existe } = await query(
      'SELECT id FROM usuarios WHERE email = ?',
      [email.toLowerCase().trim()]
    );
    if (existe.length)
      return res.status(409).json({ error: 'El email ya está registrado' });

    const hash = await bcrypt.hash(password, 12);

    const { rows: rolRows } = await query(
      "SELECT id FROM roles WHERE nombre = 'cliente'"
    );
    if (!rolRows.length)
      return res.status(500).json({ error: 'Rol cliente no encontrado' });

    const { insertId } = await query(
      `INSERT INTO usuarios (rol_id, nombre, email, password_hash, telefono, direccion)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [rolRows[0].id, nombre.trim(), email.toLowerCase().trim(),
       hash, telefono || null, direccion || null]
    );

    // Crear carrito vacío para el nuevo cliente
    await query('INSERT IGNORE INTO carritos (usuario_id) VALUES (?)', [insertId]);

    const { rows: userRows } = await query(
      'SELECT id, nombre, email FROM usuarios WHERE id = ?',
      [insertId]
    );
    const user = userRows[0];

    const token = jwt.sign(
      { id: user.id, email: user.email, rol: 'cliente', nombre: user.nombre },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({ token, usuario: { ...user, rol: 'cliente' } });
  } catch (err) {
    console.error('Registro error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ── GET /api/auth/me — Perfil del usuario autenticado ───────
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.nombre, u.email, u.telefono, u.direccion,
              u.avatar_url, u.activo, u.created_at, r.nombre AS rol
       FROM   usuarios u
       JOIN   roles    r ON r.id = u.rol_id
       WHERE  u.id = ?`,
      [req.user.id]
    );
    if (!rows.length)
      return res.status(404).json({ error: 'Usuario no encontrado' });

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// ── GET /api/auth/usuarios — Listado de usuarios (admin) ────
router.get('/usuarios', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.nombre, u.email, u.telefono, u.direccion,
              u.avatar_url, u.activo, u.created_at, r.nombre AS rol
       FROM   usuarios u
       JOIN   roles    r ON r.id = u.rol_id
       ORDER  BY u.created_at DESC`
    );
    res.json({ usuarios: rows });
  } catch (err) {
    console.error('Usuarios admin error:', err);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// ── PUT /api/auth/me — Actualizar perfil ────────────────────
router.put('/me', authMiddleware, async (req, res) => {
  const { nombre, telefono, direccion, avatar_url } = req.body;
  try {
    await query(
      `UPDATE usuarios
       SET nombre     = COALESCE(?, nombre),
           telefono   = COALESCE(?, telefono),
           direccion  = COALESCE(?, direccion),
           avatar_url = COALESCE(?, avatar_url)
       WHERE id = ?`,
      [nombre || null, telefono || null, direccion || null, avatar_url || null, req.user.id]
    );

    const { rows } = await query(
      'SELECT id, nombre, email, telefono, direccion, avatar_url FROM usuarios WHERE id = ?',
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

// ── PUT /api/auth/password — Cambiar contraseña ─────────────
router.put('/password', authMiddleware, async (req, res) => {
  const { password_actual, password_nuevo } = req.body;
  if (!password_actual || !password_nuevo)
    return res.status(400).json({ error: 'Ambas contraseñas son requeridas' });
  if (password_nuevo.length < 6)
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });

  try {
    const { rows } = await query(
      'SELECT password_hash FROM usuarios WHERE id = ?',
      [req.user.id]
    );
    const valid = await bcrypt.compare(password_actual, rows[0].password_hash);
    if (!valid)
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });

    const hash = await bcrypt.hash(password_nuevo, 12);
    await query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
});

module.exports = router;
