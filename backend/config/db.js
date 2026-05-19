// ============================================================
//  db.js — Pool de conexiones MySQL (mysql2)
// ============================================================
const mysql = require('mysql2/promise');

// dotenv ya fue cargado por server.js — no se vuelve a cargar aquí

const pool = mysql.createPool({
  host:             process.env.DB_HOST     || 'localhost',
  port:             parseInt(process.env.DB_PORT || '3306'),
  database:         process.env.DB_NAME     || 'deportes_neon',
  user:             process.env.DB_USER     || 'root',
  password:         process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit:  10,
  queueLimit:       0,
  timezone:         '+00:00',
  charset:          'utf8mb4',
});

/**
 * Ejecuta una consulta SQL con parámetros posicionales (?).
 * Retorna { rows, insertId, affectedRows }
 */
const query = async (sql, params = []) => {
  const [result] = await pool.query(sql, params);
  if (Array.isArray(result)) {
    return { rows: result };
  }
  return {
    rows:         [],
    insertId:     result.insertId,
    affectedRows: result.affectedRows,
  };
};

// Verificar conexión al iniciar
pool.getConnection()
  .then(conn => {
    console.log('✅ MySQL conectado correctamente');
    conn.release();
  })
  .catch(err => {
    console.error('❌ No se pudo conectar a MySQL:', err.message);
    console.error('   Verifica tu archivo .env y que MySQL esté corriendo.');
  });

module.exports = { query, pool };
