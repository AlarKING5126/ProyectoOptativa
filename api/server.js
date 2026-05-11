// ============================================================
//  server.js — Servidor principal Express
//  Deportes Neon API REST
// ============================================================
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app = express();

// ── CORS ────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://127.0.0.1:3000')
  .split(',').map(o => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    // Permitir requests sin origin (Postman, curl) en desarrollo
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS bloqueado para: ${origin}`));
  },
  credentials: true,
}));

// ── Body parsers ────────────────────────────────────────────
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
// ── Validar variables de entorno necesarias ───────────────────
if (!process.env.JWT_SECRET) {
  console.error('❌ Variable de entorno JWT_SECRET no definida. Copia api/.env.example a api/.env y configura JWT_SECRET.');
  process.exit(1);
}
// ── Servir frontend estático ─────────────────────────────────
// Los archivos HTML/CSS/JS del frontend están en la carpeta padre
app.use(express.static(path.join(__dirname, '..')));

// ── Rutas API ────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/productos',  require('./routes/productos'));
app.use('/api/carrito',    require('./routes/carrito'));
app.use('/api/favoritos',  require('./routes/favoritos'));
app.use('/api/pedidos',    require('./routes/pedidos'));
app.use('/api/tickets',    require('./routes/tickets'));
app.use('/api/eventos',    require('./routes/eventos'));
app.use('/api/dashboard',  require('./routes/dashboard'));

// ── Health check ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status:  'ok',
    service: 'Deportes Neon API',
    version: '1.0.0',
    time:    new Date().toISOString(),
  });
});

// ── 404 para rutas /api/* desconocidas ───────────────────────
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
});

// ── SPA fallback: todas las demás rutas sirven index.html ────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// ── Manejo global de errores ─────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Error no manejado:', err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ── Arrancar servidor ────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000');
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║        DEPORTES NEON — API REST v1.0         ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Servidor:  http://localhost:${PORT}             ║`);
  console.log(`║  Frontend:  http://localhost:${PORT}/index.html  ║`);
  console.log(`║  Health:    http://localhost:${PORT}/api/health  ║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
});

module.exports = app;
