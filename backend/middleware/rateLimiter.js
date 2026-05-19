// ============================================================
//  middleware/rateLimiter.js — Límites de peticiones
// ============================================================
const rateLimit = require('express-rate-limit');

// Límite estricto para endpoints de autenticación (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera 15 minutos antes de volver a intentarlo.' },
});

// Límite general para toda la API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Límite de peticiones alcanzado. Intenta de nuevo en 15 minutos.' },
});

module.exports = { authLimiter, apiLimiter };
