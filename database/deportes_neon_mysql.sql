-- ============================================================
--  DEPORTES NEON — Esquema MySQL 8.0+ Normalizado
--  Motor: InnoDB | Charset: utf8mb4 | Collation: utf8mb4_unicode_ci
--  Ejecutar: mysql -u root -p < deportes_neon_mysql.sql
-- ============================================================

SET SQL_MODE = 'STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO';
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS deportes_neon
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE deportes_neon;

-- ────────────────────────────────────────────────────────────
--  1. ROLES
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id     TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(20) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO roles (nombre) VALUES ('admin'), ('cliente');

-- ────────────────────────────────────────────────────────────
--  2. USUARIOS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rol_id        TINYINT UNSIGNED NOT NULL,
  nombre        VARCHAR(120) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(60)  NOT NULL,
  telefono      VARCHAR(20)  DEFAULT NULL,
  direccion     VARCHAR(255) DEFAULT NULL,
  avatar_url    TEXT         DEFAULT NULL,
  activo        TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_usuarios_email (email),
  CONSTRAINT fk_usuarios_rol FOREIGN KEY (rol_id) REFERENCES roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────
--  3. CATEGORÍAS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categorias (
  id          SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(80)  NOT NULL,
  slug        VARCHAR(80)  NOT NULL,
  descripcion TEXT         DEFAULT NULL,
  activa      TINYINT(1)   NOT NULL DEFAULT 1,
  UNIQUE KEY uq_categorias_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────
--  4. PRODUCTOS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS productos (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  categoria_id SMALLINT UNSIGNED NOT NULL,
  nombre       VARCHAR(200) NOT NULL,
  descripcion  TEXT         DEFAULT NULL,
  precio       DECIMAL(12,2) NOT NULL,
  stock        INT          NOT NULL DEFAULT 0,
  rating       DECIMAL(3,1) NOT NULL DEFAULT 5.0,
  img_url      TEXT         DEFAULT NULL,
  featured     TINYINT(1)   NOT NULL DEFAULT 0,
  tipo         ENUM('compra','alquiler') NOT NULL DEFAULT 'compra',
  estado       ENUM('activo','en-uso','desuso') NOT NULL DEFAULT 'activo',
  fecha_inicio DATE         DEFAULT NULL,
  fecha_fin    DATE         DEFAULT NULL,
  activo       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_precio  CHECK (precio >= 0),
  CONSTRAINT chk_stock   CHECK (stock  >= 0),
  CONSTRAINT chk_rating  CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT fk_productos_cat FOREIGN KEY (categoria_id) REFERENCES categorias(id),
  INDEX idx_productos_categoria (categoria_id),
  INDEX idx_productos_tipo      (tipo),
  INDEX idx_productos_estado    (estado),
  INDEX idx_productos_featured  (featured)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────
--  5. IMÁGENES DE PRODUCTO
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS producto_imagenes (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  producto_id INT UNSIGNED NOT NULL,
  url         TEXT         NOT NULL,
  orden       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_pimg_producto FOREIGN KEY (producto_id)
    REFERENCES productos(id) ON DELETE CASCADE,
  INDEX idx_pimg_producto (producto_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────
--  6. CARRITOS  (1:1 con usuario)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS carritos (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_carritos_usuario (usuario_id),
  CONSTRAINT fk_carritos_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────
--  7. ÍTEMS DEL CARRITO
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS carrito_items (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  carrito_id  INT UNSIGNED NOT NULL,
  producto_id INT UNSIGNED NOT NULL,
  cantidad    SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  added_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_carrito_producto (carrito_id, producto_id),
  CONSTRAINT fk_ci_carrito  FOREIGN KEY (carrito_id)
    REFERENCES carritos(id) ON DELETE CASCADE,
  CONSTRAINT fk_ci_producto FOREIGN KEY (producto_id)
    REFERENCES productos(id) ON DELETE CASCADE,
  CONSTRAINT chk_ci_cantidad CHECK (cantidad >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────
--  8. PEDIDOS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pedidos (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id         INT UNSIGNED NOT NULL,
  codigo             VARCHAR(15)  NOT NULL,
  subtotal           DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  impuestos          DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total              DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  estado             ENUM('pending','transit','delivered','cancelled') NOT NULL DEFAULT 'pending',
  direccion_envio    VARCHAR(255) DEFAULT NULL,
  numero_seguimiento VARCHAR(50)  DEFAULT NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pedidos_codigo (codigo),
  CONSTRAINT fk_pedidos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  INDEX idx_pedidos_usuario (usuario_id),
  INDEX idx_pedidos_estado  (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Trigger: auto-generar código #DN-XXXX al crear pedido
DELIMITER //
CREATE TRIGGER trg_pedido_codigo
BEFORE INSERT ON pedidos
FOR EACH ROW
BEGIN
  DECLARE total_pedidos INT;
  SELECT COUNT(*) + 1 INTO total_pedidos FROM pedidos;
  SET NEW.codigo = CONCAT('#DN-', LPAD(total_pedidos, 4, '0'));
END //
DELIMITER ;

-- ────────────────────────────────────────────────────────────
--  9. LÍNEAS DE PEDIDO
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pedido_lineas (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pedido_id   INT UNSIGNED NOT NULL,
  producto_id INT UNSIGNED DEFAULT NULL,
  nombre_snap VARCHAR(200)  NOT NULL,
  precio_snap DECIMAL(12,2) NOT NULL,
  cantidad    SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  subtotal    DECIMAL(14,2) GENERATED ALWAYS AS (precio_snap * cantidad) STORED,
  CONSTRAINT fk_pl_pedido   FOREIGN KEY (pedido_id)
    REFERENCES pedidos(id) ON DELETE CASCADE,
  CONSTRAINT fk_pl_producto FOREIGN KEY (producto_id)
    REFERENCES productos(id) ON DELETE SET NULL,
  INDEX idx_pl_pedido (pedido_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Trigger: actualizar totales del pedido y descontar stock al insertar línea
DELIMITER //
CREATE TRIGGER trg_pedido_linea_insert
AFTER INSERT ON pedido_lineas
FOR EACH ROW
BEGIN
  UPDATE pedidos
  SET
    subtotal  = (SELECT COALESCE(SUM(subtotal), 0)
                 FROM pedido_lineas WHERE pedido_id = NEW.pedido_id),
    impuestos = ROUND(
                  (SELECT COALESCE(SUM(subtotal), 0)
                   FROM pedido_lineas WHERE pedido_id = NEW.pedido_id) * 0.19, 2),
    total     = ROUND(
                  (SELECT COALESCE(SUM(subtotal), 0)
                   FROM pedido_lineas WHERE pedido_id = NEW.pedido_id) * 1.19, 2)
  WHERE id = NEW.pedido_id;

  -- Descontar stock del producto
  UPDATE productos
  SET stock = stock - NEW.cantidad
  WHERE id = NEW.producto_id;
END //
DELIMITER ;

-- ────────────────────────────────────────────────────────────
--  10. FAVORITOS  (M:N usuarios ↔ productos)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS favoritos (
  usuario_id  INT UNSIGNED NOT NULL,
  producto_id INT UNSIGNED NOT NULL,
  added_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, producto_id),
  CONSTRAINT fk_fav_usuario  FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_fav_producto FOREIGN KEY (producto_id)
    REFERENCES productos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────
--  11. TICKETS DE SOPORTE
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT UNSIGNED NOT NULL,
  codigo      VARCHAR(15)  NOT NULL,
  asunto      VARCHAR(200) NOT NULL,
  descripcion TEXT         NOT NULL,
  prioridad   ENUM('baja','media','alta','urgente') NOT NULL DEFAULT 'media',
  estado      ENUM('pending','open','closed')       NOT NULL DEFAULT 'pending',
  closed_at   DATETIME     DEFAULT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tickets_codigo (codigo),
  CONSTRAINT fk_tickets_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  INDEX idx_tickets_usuario (usuario_id),
  INDEX idx_tickets_estado  (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Trigger: auto-generar código #TK-XXXX al crear ticket
DELIMITER //
CREATE TRIGGER trg_ticket_codigo
BEFORE INSERT ON tickets
FOR EACH ROW
BEGIN
  DECLARE total_tickets INT;
  SELECT COUNT(*) + 1 INTO total_tickets FROM tickets;
  SET NEW.codigo = CONCAT('#TK-', LPAD(total_tickets, 4, '0'));
END //
DELIMITER ;

-- Trigger: gestionar closed_at al cambiar estado
DELIMITER //
CREATE TRIGGER trg_ticket_closed_at
BEFORE UPDATE ON tickets
FOR EACH ROW
BEGIN
  IF NEW.estado = 'closed' AND OLD.estado <> 'closed' THEN
    SET NEW.closed_at = NOW();
  ELSEIF NEW.estado <> 'closed' THEN
    SET NEW.closed_at = NULL;
  END IF;
END //
DELIMITER ;

-- ────────────────────────────────────────────────────────────
--  12. MENSAJES DE TICKET
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_mensajes (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id  INT UNSIGNED NOT NULL,
  autor_id   INT UNSIGNED NOT NULL,
  mensaje    TEXT         NOT NULL,
  es_interno TINYINT(1)   NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tm_ticket FOREIGN KEY (ticket_id)
    REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_tm_autor  FOREIGN KEY (autor_id)
    REFERENCES usuarios(id),
  INDEX idx_tm_ticket (ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────
--  13. EVENTOS / CALENDARIO
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS eventos (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT UNSIGNED NOT NULL,
  titulo      VARCHAR(200) NOT NULL,
  descripcion TEXT         DEFAULT NULL,
  fecha_hora  DATETIME     NOT NULL,
  tipo        ENUM('Evento','Reunión','Tarea','Recordatorio') NOT NULL DEFAULT 'Evento',
  publico     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_eventos_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE,
  INDEX idx_eventos_fecha (fecha_hora)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────
--  14. SESIONES ACTIVAS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sesiones (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64)     NOT NULL,
  ip_address VARCHAR(45)  DEFAULT NULL,
  user_agent TEXT         DEFAULT NULL,
  expires_at DATETIME     NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sesiones_token (token_hash),
  CONSTRAINT fk_sesiones_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE,
  INDEX idx_sesiones_usuario (usuario_id),
  INDEX idx_sesiones_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────
--  VISTAS
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_productos_completos AS
SELECT
  p.id, p.nombre, p.descripcion,
  c.nombre       AS categoria,
  c.slug         AS categoria_slug,
  p.precio, p.stock, p.rating, p.img_url,
  p.featured, p.tipo, p.estado,
  p.fecha_inicio, p.fecha_fin,
  p.activo, p.created_at, p.updated_at,
  (SELECT COUNT(*) FROM favoritos f WHERE f.producto_id = p.id) AS total_favoritos
FROM productos p
JOIN categorias c ON c.id = p.categoria_id;

CREATE OR REPLACE VIEW v_pedidos_detallados AS
SELECT
  p.id, p.codigo, p.subtotal, p.impuestos, p.total,
  p.estado, p.direccion_envio, p.numero_seguimiento,
  p.created_at, p.updated_at,
  u.nombre AS cliente_nombre,
  u.email  AS cliente_email
FROM pedidos p
JOIN usuarios u ON u.id = p.usuario_id;

CREATE OR REPLACE VIEW v_dashboard_admin AS
SELECT
  (SELECT COUNT(*) FROM productos WHERE activo = 1)                                             AS total_productos,
  (SELECT COUNT(*) FROM productos WHERE stock <= 15 AND activo = 1)                             AS productos_bajo_stock,
  (SELECT COUNT(*) FROM usuarios)                                                                AS total_usuarios,
  (SELECT COUNT(*) FROM usuarios WHERE rol_id = (SELECT id FROM roles WHERE nombre = 'cliente')) AS total_clientes,
  (SELECT COUNT(*) FROM pedidos  WHERE estado = 'pending')                                      AS pedidos_pendientes,
  (SELECT COUNT(*) FROM pedidos)                                                                 AS total_pedidos,
  (SELECT COALESCE(SUM(total), 0) FROM pedidos WHERE estado = 'delivered')                      AS ingresos_totales,
  (SELECT COUNT(*) FROM tickets WHERE estado <> 'closed')                                        AS tickets_abiertos,
  (SELECT ROUND(AVG(rating), 2) FROM productos WHERE activo = 1)                                AS rating_promedio;

SET FOREIGN_KEY_CHECKS = 1;

-- ────────────────────────────────────────────────────────────
--  DATOS DE PRUEBA
-- ────────────────────────────────────────────────────────────

-- Categorías
INSERT IGNORE INTO categorias (nombre, slug, descripcion) VALUES
  ('Fútbol',       'futbol',       'Equipos y balones de fútbol'),
  ('Baloncesto',   'baloncesto',   'Equipos de baloncesto'),
  ('Tenis',        'tenis',        'Raquetas y accesorios de tenis'),
  ('Natación',     'natacion',     'Equipos de natación'),
  ('Ciclismo',     'ciclismo',     'Bicicletas y accesorios'),
  ('Running',      'running',      'Calzado y ropa para correr'),
  ('Gimnasio',     'gimnasio',     'Equipos de fitness'),
  ('Deportes de montaña', 'montana', 'Senderismo y escalada');

-- Usuarios (contraseñas: admin123 / cliente123)
INSERT IGNORE INTO usuarios (rol_id, nombre, email, password_hash) VALUES
  (1, 'Administrador', 'admin@deportesneon.com',
   '$2a$12$dIhUb6GOcg6F0r34sNJBKuL1dOfWOrSnBucF.uKlOITQfsaTKI7He'),
  (2, 'Cliente Demo',  'cliente@deportesneon.com',
   '$2a$12$4xpihgUyZjd6KSlDzU60FeYzEiFJJQozlXThgWVe24zujTG3Um2Yq'),
  (2, 'María López',   'maria@deportesneon.com',
   '$2a$12$4xpihgUyZjd6KSlDzU60FeYzEiFJJQozlXThgWVe24zujTG3Um2Yq');

-- Productos de ejemplo
INSERT IGNORE INTO productos (categoria_id, nombre, descripcion, precio, stock, rating, featured, tipo, estado) VALUES
  (1, 'Balón de Fútbol Pro',      'Balón profesional FIFA Quality',    89900, 50, 4.8, 1, 'compra', 'activo'),
  (1, 'Guayos Adidas Predator',   'Tallas 36-46, suela FG',           249900, 30, 4.7, 1, 'compra', 'activo'),
  (2, 'Balón de Baloncesto NBA',  'Talla 7, cuero compuesto',         129900, 25, 4.6, 0, 'compra', 'activo'),
  (2, 'Canasta Portátil',         'Altura ajustable 2.3m-3.05m',      599900, 10, 4.5, 1, 'alquiler','activo'),
  (3, 'Raqueta Wilson Pro Staff', 'Grafito 100% profesional',         429900, 15, 4.9, 1, 'compra', 'activo'),
  (4, 'Gafas de Natación Speedo', 'Anti-UV, silicona',                 59900, 60, 4.7, 0, 'compra', 'activo'),
  (5, 'Bicicleta de Montaña Trek','Shimano 21 velocidades',          1899900, 8,  4.8, 1, 'alquiler','activo'),
  (6, 'Zapatillas Nike Air Max',  'Running amortiguación máxima',     389900, 40, 4.6, 0, 'compra', 'activo'),
  (7, 'Mancuernas 20kg par',      'Hierro fundido recubierto',        159900, 20, 4.5, 0, 'compra', 'activo'),
  (8, 'Kit Escalada Completo',    'Arnés, casco y mosquetones',       349900, 12, 4.7, 0, 'alquiler','activo'),
  (1, 'Arco de Fútbol Portátil',  'Acero galvanizado 5x2m',          299900,  5, 4.4, 0, 'alquiler','activo'),
  (7, 'Cinta Caminadora Pro',     'Velocidad máx 20km/h, inclinación',2499900, 3, 4.9, 1, 'alquiler','activo');

-- Carritos iniciales para los clientes
INSERT IGNORE INTO carritos (usuario_id)
SELECT id FROM usuarios WHERE rol_id = (SELECT id FROM roles WHERE nombre = 'cliente');
