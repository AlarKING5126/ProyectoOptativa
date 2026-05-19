// ============================================================
//  middleware/auth.js — Verificación de JWT
// ============================================================
const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // Asegurar que el id sea siempre un entero (protección ante tokens con UUID de versiones anteriores)
    const numId = parseInt(payload.id, 10);
    if (!numId || isNaN(numId)) {
      return res.status(401).json({ error: 'Token inválido: sesión expirada, vuelve a iniciar sesión' });
    }
    req.user = { ...payload, id: numId };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso restringido a administradores' });
  }
  next();
}

module.exports = { authMiddleware, adminOnly };
