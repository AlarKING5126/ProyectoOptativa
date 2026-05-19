// ============================================================
//  server.js — Servidor principal Express
//  Deportes Neon API REST v2 — MySQL
// ============================================================
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const { apiLimiter, authLimiter } = require('./middleware/rateLimiter');

if (!process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET no definido. Copia backend/.env.example a backend/.env y configura JWT_SECRET.');
  process.exit(1);
}

const app = express();

// ── CORS ────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGINS ||
  'http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://127.0.0.1:3000')
  .split(',').map(o => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS bloqueado para: ${origin}`));
  },
  credentials: true,
}));

// ── Body parsers ────────────────────────────────────────────
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting ────────────────────────────────────────────
app.use('/api/', apiLimiter);

// ── Servir frontend estático ─────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend')));

// ── Rutas API ────────────────────────────────────────────────
app.use('/api/auth',      authLimiter, require('./routes/auth'));
app.use('/api/productos',             require('./routes/productos'));
app.use('/api/carrito',               require('./routes/carrito'));
app.use('/api/favoritos',             require('./routes/favoritos'));
app.use('/api/pedidos',               require('./routes/pedidos'));
app.use('/api/tickets',               require('./routes/tickets'));
app.use('/api/eventos',               require('./routes/eventos'));
app.use('/api/dashboard',             require('./routes/dashboard'));

// ── Health check ─────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status:  'ok',
    service: 'Deportes Neon API',
    version: '2.0.0',
    db:      'MySQL',
    time:    new Date().toISOString(),
  });
});

// ── 404 para rutas /api/* desconocidas ───────────────────────
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
});

// ── SPA fallback ─────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

// ── Manejo global de errores ─────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Error no manejado:', err.message);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ── Arrancar servidor ────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000');
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║     DEPORTES NEON — API REST v2.0 (MySQL)    ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Servidor:  http://localhost:${PORT}             ║`);
  console.log(`║  Frontend:  http://localhost:${PORT}/index.html  ║`);
  console.log(`║  Health:    http://localhost:${PORT}/api/health  ║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
});

module.exports = app;
