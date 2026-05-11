// ============================================================
//  db.js — Pool de conexiones PostgreSQL
// ============================================================
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'deportes_neon',
  user:     process.env.DB_USER     || 'Santiago',
  password: process.env.DB_PASSWORD || '1234567890',
  max: 10,                // máximo de conexiones simultáneas
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('❌ Error inesperado en el pool de PostgreSQL:', err.message);
});

// Helper: ejecutar query con manejo de errores
const query = (text, params) => pool.query(text, params);

// Verificar conexión al iniciar
pool.query('SELECT NOW() AS hora').then(res => {
  console.log(`✅ PostgreSQL conectado — ${res.rows[0].hora}`);
}).catch(err => {
  console.error('❌ No se pudo conectar a PostgreSQL:', err.message);
  console.error('   Verifica tu archivo .env y que el servidor PostgreSQL esté corriendo.');
});

module.exports = { query, pool };
