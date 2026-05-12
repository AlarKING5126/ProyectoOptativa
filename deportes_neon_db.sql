-- ============================================================
--  DEPORTES NEON — Base de Datos PostgreSQL
--  Versión: 1.0  |  Motor: PostgreSQL 15+
-- ============================================================
--
--  TABLAS PRINCIPALES
--  ─────────────────────────────────────────────────────────
--  1.  roles                  → tipos de usuario
--  2.  usuarios               → clientes y administradores
--  3.  categorias             → categorías de productos
--  4.  productos              → catálogo deportivo
--  5.  producto_imagenes      → imágenes adicionales por producto
--  6.  carritos               → carrito activo por usuario
--  7.  carrito_items          → líneas del carrito
--  8.  favoritos              → wishlist por usuario
--  9.  pedidos                → órdenes de compra/alquiler
--  10. pedido_lineas          → líneas de un pedido
--  11. tickets                → soporte al cliente
--  12. ticket_mensajes        → mensajes dentro de un ticket
--  13. eventos                → calendario de eventos
--  14. sesiones               → tokens de sesión activos
--  15. auditoría              → log de cambios críticos
--
--  VISTAS
--  ─────────────────────────────────────────────────────────
--  v_productos_completos      → producto + categoría + stock
--  v_pedidos_detallados       → pedido + cliente + líneas
--  v_dashboard_admin          → métricas para el panel
--  v_dashboard_cliente        → métricas por usuario
--
--  FUNCIONES & TRIGGERS
--  ─────────────────────────────────────────────────────────
--  fn_reducir_stock()         → descuenta stock al confirmar pedido
--  fn_actualizar_total()      → recalcula total del pedido
--  fn_log_auditoria()         → registra cambios en tablas clave
--
-- ============================================================

-- ── Extensiones ────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Limpiar si existe (útil para re-ejecución) ─────────────
DROP TABLE IF EXISTS auditoria          CASCADE;
DROP TABLE IF EXISTS sesiones           CASCADE;
DROP TABLE IF EXISTS eventos            CASCADE;
DROP TABLE IF EXISTS ticket_mensajes    CASCADE;
DROP TABLE IF EXISTS tickets            CASCADE;
DROP TABLE IF EXISTS favoritos          CASCADE;
DROP TABLE IF EXISTS pedido_lineas      CASCADE;
DROP TABLE IF EXISTS pedidos            CASCADE;
DROP TABLE IF EXISTS carrito_items      CASCADE;
DROP TABLE IF EXISTS carritos           CASCADE;
DROP TABLE IF EXISTS producto_imagenes  CASCADE;
DROP TABLE IF EXISTS productos          CASCADE;
DROP TABLE IF EXISTS categorias         CASCADE;
DROP TABLE IF EXISTS usuarios           CASCADE;
DROP TABLE IF EXISTS roles              CASCADE;

DROP VIEW IF EXISTS v_productos_completos  CASCADE;
DROP VIEW IF EXISTS v_pedidos_detallados   CASCADE;
DROP VIEW IF EXISTS v_dashboard_admin      CASCADE;
DROP VIEW IF EXISTS v_dashboard_cliente    CASCADE;

-- ============================================================
--  1. ROLES
-- ============================================================
CREATE TABLE roles (
    id          SERIAL       PRIMARY KEY,
    nombre      VARCHAR(30)  NOT NULL UNIQUE,
    descripcion TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  roles        IS 'Tipos de usuario del sistema';
COMMENT ON COLUMN roles.nombre IS 'admin | cliente';

-- ============================================================
--  2. USUARIOS
-- ============================================================
CREATE TABLE usuarios (
    id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    rol_id        INTEGER       NOT NULL REFERENCES roles(id),
    nombre        VARCHAR(120)  NOT NULL,
    email         VARCHAR(200)  NOT NULL UNIQUE,
    password_hash VARCHAR(255)  NOT NULL,
    telefono      VARCHAR(30),
    direccion     TEXT,
    avatar_url    TEXT,
    activo        BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  usuarios             IS 'Clientes y administradores del sistema';
COMMENT ON COLUMN usuarios.password_hash IS 'Hash bcrypt de la contraseña';
COMMENT ON COLUMN usuarios.activo       IS 'FALSE = cuenta suspendida';

CREATE INDEX idx_usuarios_email  ON usuarios(email);
CREATE INDEX idx_usuarios_rol_id ON usuarios(rol_id);

-- ============================================================
--  3. CATEGORIAS
-- ============================================================
CREATE TABLE categorias (
    id          SERIAL       PRIMARY KEY,
    nombre      VARCHAR(80)  NOT NULL UNIQUE,
    slug        VARCHAR(80)  NOT NULL UNIQUE,
    descripcion TEXT,
    activa      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE categorias IS 'Categorías del catálogo deportivo';

-- ============================================================
--  4. PRODUCTOS
-- ============================================================
CREATE TABLE productos (
    id             SERIAL           PRIMARY KEY,
    categoria_id   INTEGER          NOT NULL REFERENCES categorias(id),
    nombre         VARCHAR(200)     NOT NULL,
    descripcion    TEXT,
    precio         NUMERIC(10,2)    NOT NULL CHECK (precio >= 0),
    stock          INTEGER          NOT NULL DEFAULT 0 CHECK (stock >= 0),
    rating         NUMERIC(2,1)     NOT NULL DEFAULT 5.0 CHECK (rating BETWEEN 1 AND 5),
    img_url        TEXT,
    featured       BOOLEAN          NOT NULL DEFAULT FALSE,
    tipo           VARCHAR(10)      NOT NULL DEFAULT 'compra'
                       CHECK (tipo IN ('compra', 'alquiler')),
    estado         VARCHAR(10)      NOT NULL DEFAULT 'activo'
                       CHECK (estado IN ('activo', 'en-uso', 'desuso')),
    fecha_inicio   DATE,
    fecha_fin      DATE,
    activo         BOOLEAN          NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_fechas CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);

COMMENT ON TABLE  productos           IS 'Catálogo de artículos deportivos (compra y alquiler)';
COMMENT ON COLUMN productos.tipo      IS 'compra | alquiler';
COMMENT ON COLUMN productos.estado    IS 'activo | en-uso | desuso';
COMMENT ON COLUMN productos.featured  IS 'Aparece en sección Destacados';
COMMENT ON COLUMN productos.stock     IS 'Unidades disponibles — se reduce con cada pedido confirmado';

CREATE INDEX idx_productos_categoria ON productos(categoria_id);
CREATE INDEX idx_productos_tipo      ON productos(tipo);
CREATE INDEX idx_productos_estado    ON productos(estado);
CREATE INDEX idx_productos_featured  ON productos(featured) WHERE featured = TRUE;
CREATE INDEX idx_productos_activo    ON productos(activo)   WHERE activo   = TRUE;

-- ============================================================
--  5. PRODUCTO_IMAGENES
-- ============================================================
CREATE TABLE producto_imagenes (
    id          SERIAL      PRIMARY KEY,
    producto_id INTEGER     NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    url         TEXT        NOT NULL,
    alt_text    VARCHAR(200),
    orden       SMALLINT    NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE producto_imagenes IS 'Imágenes adicionales de un producto (galería)';
CREATE INDEX idx_prod_imgs_producto ON producto_imagenes(producto_id);

-- ============================================================
--  6. CARRITOS
-- ============================================================
CREATE TABLE carritos (
    id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id  UUID         NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_carrito_usuario UNIQUE (usuario_id)
);

COMMENT ON TABLE carritos IS 'Un carrito activo por usuario (relación 1-1)';

-- ============================================================
--  7. CARRITO_ITEMS
-- ============================================================
CREATE TABLE carrito_items (
    id          SERIAL       PRIMARY KEY,
    carrito_id  UUID         NOT NULL REFERENCES carritos(id) ON DELETE CASCADE,
    producto_id INTEGER      NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    cantidad    INTEGER      NOT NULL DEFAULT 1 CHECK (cantidad > 0),
    added_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_carrito_producto UNIQUE (carrito_id, producto_id)
);

COMMENT ON TABLE  carrito_items         IS 'Líneas del carrito de compra';
COMMENT ON COLUMN carrito_items.cantidad IS 'No puede exceder el stock del producto';

CREATE INDEX idx_cart_items_carrito  ON carrito_items(carrito_id);
CREATE INDEX idx_cart_items_producto ON carrito_items(producto_id);

-- ============================================================
--  8. FAVORITOS
-- ============================================================
CREATE TABLE favoritos (
    usuario_id  UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    producto_id INTEGER     NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (usuario_id, producto_id)
);

COMMENT ON TABLE favoritos IS 'Wishlist — relación muchos a muchos entre usuarios y productos';
CREATE INDEX idx_favoritos_usuario  ON favoritos(usuario_id);
CREATE INDEX idx_favoritos_producto ON favoritos(producto_id);

-- ============================================================
--  9. PEDIDOS
-- ============================================================
CREATE TABLE pedidos (
    id              SERIAL         PRIMARY KEY,
    codigo          VARCHAR(20)    NOT NULL UNIQUE,     -- #DN-0001
    usuario_id      UUID           NOT NULL REFERENCES usuarios(id),
    subtotal        NUMERIC(12,2)  NOT NULL DEFAULT 0,
    impuestos       NUMERIC(12,2)  NOT NULL DEFAULT 0,
    total           NUMERIC(12,2)  NOT NULL DEFAULT 0,
    estado          VARCHAR(15)    NOT NULL DEFAULT 'pending'
                        CHECK (estado IN ('pending','transit','delivered','cancelled')),
    direccion_envio TEXT,
    numero_seguimiento VARCHAR(50),
    notas           TEXT,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  pedidos               IS 'Órdenes de compra y alquiler';
COMMENT ON COLUMN pedidos.codigo        IS 'Código legible tipo #DN-0001';
COMMENT ON COLUMN pedidos.estado        IS 'pending | transit | delivered | cancelled';
COMMENT ON COLUMN pedidos.impuestos     IS 'IVA calculado (19% en Colombia)';

CREATE INDEX idx_pedidos_usuario ON pedidos(usuario_id);
CREATE INDEX idx_pedidos_estado  ON pedidos(estado);
CREATE INDEX idx_pedidos_codigo  ON pedidos(codigo);

-- Secuencia para el código DN
CREATE SEQUENCE seq_pedido_num START 1;

-- ============================================================
--  10. PEDIDO_LINEAS
-- ============================================================
CREATE TABLE pedido_lineas (
    id            SERIAL          PRIMARY KEY,
    pedido_id     INTEGER         NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    producto_id   INTEGER         REFERENCES productos(id) ON DELETE SET NULL,
    nombre_snap   VARCHAR(200)    NOT NULL,  -- snapshot del nombre al momento de compra
    precio_snap   NUMERIC(10,2)   NOT NULL,  -- snapshot del precio al momento de compra
    cantidad      INTEGER         NOT NULL CHECK (cantidad > 0),
    subtotal      NUMERIC(12,2)   GENERATED ALWAYS AS (precio_snap * cantidad) STORED
);

COMMENT ON TABLE  pedido_lineas            IS 'Líneas de cada pedido';
COMMENT ON COLUMN pedido_lineas.nombre_snap IS 'Nombre del producto al momento de la compra (inmutable)';
COMMENT ON COLUMN pedido_lineas.precio_snap IS 'Precio al momento de la compra (inmutable)';
COMMENT ON COLUMN pedido_lineas.subtotal    IS 'precio_snap × cantidad (calculado automáticamente)';

CREATE INDEX idx_pedido_lineas_pedido   ON pedido_lineas(pedido_id);
CREATE INDEX idx_pedido_lineas_producto ON pedido_lineas(producto_id);

-- ============================================================
--  11. TICKETS
-- ============================================================
CREATE TABLE tickets (
    id          SERIAL        PRIMARY KEY,
    codigo      VARCHAR(15)   NOT NULL UNIQUE,    -- #TK-0001
    usuario_id  UUID          NOT NULL REFERENCES usuarios(id),
    asunto      VARCHAR(200)  NOT NULL,
    descripcion TEXT          NOT NULL,
    estado      VARCHAR(10)   NOT NULL DEFAULT 'pending'
                    CHECK (estado IN ('pending','open','closed')),
    prioridad   VARCHAR(10)   NOT NULL DEFAULT 'media'
                    CHECK (prioridad IN ('baja','media','alta','urgente')),
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    closed_at   TIMESTAMPTZ
);

COMMENT ON TABLE  tickets         IS 'Solicitudes de soporte al cliente';
COMMENT ON COLUMN tickets.codigo  IS 'Código legible tipo #TK-0001';
COMMENT ON COLUMN tickets.estado  IS 'pending | open | closed';

CREATE INDEX idx_tickets_usuario ON tickets(usuario_id);
CREATE INDEX idx_tickets_estado  ON tickets(estado);

CREATE SEQUENCE seq_ticket_num START 1;

-- ============================================================
--  12. TICKET_MENSAJES
-- ============================================================
CREATE TABLE ticket_mensajes (
    id          SERIAL        PRIMARY KEY,
    ticket_id   INTEGER       NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    autor_id    UUID          NOT NULL REFERENCES usuarios(id),
    mensaje     TEXT          NOT NULL,
    es_interno  BOOLEAN       NOT NULL DEFAULT FALSE,  -- nota interna solo para admins
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  ticket_mensajes          IS 'Hilo de mensajes de un ticket';
COMMENT ON COLUMN ticket_mensajes.es_interno IS 'TRUE = nota interna, no visible para el cliente';

CREATE INDEX idx_tk_msg_ticket ON ticket_mensajes(ticket_id);

-- ============================================================
--  13. EVENTOS
-- ============================================================
CREATE TABLE eventos (
    id          SERIAL        PRIMARY KEY,
    usuario_id  UUID          NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    titulo      VARCHAR(200)  NOT NULL,
    descripcion TEXT,
    fecha_hora  TIMESTAMPTZ   NOT NULL,
    tipo        VARCHAR(20)   NOT NULL DEFAULT 'Evento'
                    CHECK (tipo IN ('Evento','Reunión','Tarea','Recordatorio')),
    publico     BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN eventos.publico IS 'Indica si el evento es visible para clientes (público) o solo para administradores (privado)';

COMMENT ON TABLE eventos IS 'Eventos del calendario por usuario';
COMMENT ON COLUMN eventos.tipo IS 'Evento | Reunión | Tarea | Recordatorio';

CREATE INDEX idx_eventos_usuario    ON eventos(usuario_id);
CREATE INDEX idx_eventos_fecha_hora ON eventos(fecha_hora);

-- ============================================================
--  14. SESIONES
-- ============================================================
CREATE TABLE sesiones (
    id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id  UUID         NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL UNIQUE,
    ip_address  INET,
    user_agent  TEXT,
    expires_at  TIMESTAMPTZ  NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE sesiones IS 'Tokens de sesión activos (JWT o cookie)';
CREATE INDEX idx_sesiones_usuario ON sesiones(usuario_id);
CREATE INDEX idx_sesiones_expires ON sesiones(expires_at);

-- ============================================================
--  15. AUDITORIA
-- ============================================================
CREATE TABLE auditoria (
    id          BIGSERIAL    PRIMARY KEY,
    tabla       VARCHAR(60)  NOT NULL,
    operacion   CHAR(1)      NOT NULL CHECK (operacion IN ('I','U','D')),
    registro_id TEXT         NOT NULL,
    datos_antes JSONB,
    datos_despues JSONB,
    usuario_id  UUID         REFERENCES usuarios(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE auditoria IS 'Log de auditoría de cambios críticos (INSERT/UPDATE/DELETE)';
COMMENT ON COLUMN auditoria.operacion IS 'I=Insert, U=Update, D=Delete';

CREATE INDEX idx_auditoria_tabla  ON auditoria(tabla);
CREATE INDEX idx_auditoria_fecha  ON auditoria(created_at DESC);

-- ============================================================
--  FUNCIONES Y TRIGGERS
-- ============================================================

-- ── Trigger: updated_at automático ─────────────────────────
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_usuarios_updated_at   BEFORE UPDATE ON usuarios   FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_productos_updated_at  BEFORE UPDATE ON productos   FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_pedidos_updated_at    BEFORE UPDATE ON pedidos     FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_tickets_updated_at    BEFORE UPDATE ON tickets     FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_eventos_updated_at    BEFORE UPDATE ON eventos     FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_carritos_updated_at   BEFORE UPDATE ON carritos    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ── Trigger: cerrar ticket ──────────────────────────────────
CREATE OR REPLACE FUNCTION fn_cerrar_ticket()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.estado = 'closed' AND OLD.estado <> 'closed' THEN
        NEW.closed_at = NOW();
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tickets_cerrar
    BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION fn_cerrar_ticket();

-- ── Función: reducir stock al confirmar pedido ──────────────
CREATE OR REPLACE FUNCTION fn_reducir_stock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_stock_actual INTEGER;
BEGIN
    -- Solo actuar cuando el pedido pasa a estado distinto de 'cancelled'
    IF NEW.estado NOT IN ('pending','cancelled') AND
       (OLD.estado = 'pending' OR TG_OP = 'INSERT') THEN
        -- ya fue procesado en la confirmación inicial
        NULL;
    END IF;
    RETURN NEW;
END;
$$;

-- La reducción real de stock se hace al insertar pedido_lineas
CREATE OR REPLACE FUNCTION fn_descontar_stock_linea()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_stock INTEGER;
    v_tipo  VARCHAR(10);
BEGIN
    SELECT stock, tipo INTO v_stock, v_tipo
    FROM   productos WHERE id = NEW.producto_id;

    IF v_stock < NEW.cantidad THEN
        RAISE EXCEPTION 'Stock insuficiente para el producto % (disponible: %, solicitado: %)',
            NEW.producto_id, v_stock, NEW.cantidad;
    END IF;

    -- Descontar stock
    UPDATE productos SET stock = stock - NEW.cantidad WHERE id = NEW.producto_id;

    -- Si es alquiler, marcar en uso
    IF v_tipo = 'alquiler' THEN
        UPDATE productos SET estado = 'en-uso' WHERE id = NEW.producto_id AND stock - NEW.cantidad = 0;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_descontar_stock
    AFTER INSERT ON pedido_lineas
    FOR EACH ROW EXECUTE FUNCTION fn_descontar_stock_linea();

-- ── Función: recalcular totales del pedido ──────────────────
CREATE OR REPLACE FUNCTION fn_actualizar_total_pedido()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_pedido_id INTEGER;
    v_subtotal  NUMERIC(12,2);
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_pedido_id := OLD.pedido_id;
    ELSE
        v_pedido_id := NEW.pedido_id;
    END IF;

    SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal
    FROM   pedido_lineas WHERE pedido_id = v_pedido_id;

    UPDATE pedidos
    SET    subtotal   = v_subtotal,
           impuestos  = ROUND(v_subtotal * 0.19, 2),
           total      = ROUND(v_subtotal * 1.19, 2)
    WHERE  id = v_pedido_id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_total_pedido
    AFTER INSERT OR UPDATE OR DELETE ON pedido_lineas
    FOR EACH ROW EXECUTE FUNCTION fn_actualizar_total_pedido();

-- ── Función: log de auditoría ───────────────────────────────
CREATE OR REPLACE FUNCTION fn_log_auditoria()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO auditoria(tabla, operacion, registro_id, datos_antes, datos_despues)
    VALUES (
        TG_TABLE_NAME,
        CASE TG_OP WHEN 'INSERT' THEN 'I' WHEN 'UPDATE' THEN 'U' ELSE 'D' END,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.id::TEXT ELSE NEW.id::TEXT END,
        CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
        CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
    );
    RETURN NULL;
END;
$$;

-- Activar auditoría en tablas críticas
CREATE TRIGGER trg_audit_productos
    AFTER INSERT OR UPDATE OR DELETE ON productos
    FOR EACH ROW EXECUTE FUNCTION fn_log_auditoria();

CREATE TRIGGER trg_audit_pedidos
    AFTER INSERT OR UPDATE OR DELETE ON pedidos
    FOR EACH ROW EXECUTE FUNCTION fn_log_auditoria();

CREATE TRIGGER trg_audit_usuarios
    AFTER INSERT OR UPDATE OR DELETE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION fn_log_auditoria();

-- ── Función: generar código de pedido ──────────────────────
CREATE OR REPLACE FUNCTION fn_generar_codigo_pedido()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.codigo := '#DN-' || LPAD(nextval('seq_pedido_num')::TEXT, 4, '0');
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_codigo_pedido
    BEFORE INSERT ON pedidos
    FOR EACH ROW EXECUTE FUNCTION fn_generar_codigo_pedido();

-- ── Función: generar código de ticket ──────────────────────
CREATE OR REPLACE FUNCTION fn_generar_codigo_ticket()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.codigo := '#TK-' || LPAD(nextval('seq_ticket_num')::TEXT, 4, '0');
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_codigo_ticket
    BEFORE INSERT ON tickets
    FOR EACH ROW EXECUTE FUNCTION fn_generar_codigo_ticket();

-- ── Función: validar cantidad carrito vs stock ──────────────
CREATE OR REPLACE FUNCTION fn_validar_carrito_stock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_stock INTEGER;
BEGIN
    SELECT stock INTO v_stock FROM productos WHERE id = NEW.producto_id;
    IF NEW.cantidad > v_stock THEN
        RAISE EXCEPTION 'La cantidad solicitada (%) supera el stock disponible (%) para el producto %',
            NEW.cantidad, v_stock, NEW.producto_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validar_carrito
    BEFORE INSERT OR UPDATE ON carrito_items
    FOR EACH ROW EXECUTE FUNCTION fn_validar_carrito_stock();

-- ── Función: limpiar sesiones expiradas ────────────────────
CREATE OR REPLACE FUNCTION fn_limpiar_sesiones()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
    eliminadas INTEGER;
BEGIN
    DELETE FROM sesiones WHERE expires_at < NOW();
    GET DIAGNOSTICS eliminadas = ROW_COUNT;
    RETURN eliminadas;
END;
$$;

COMMENT ON FUNCTION fn_limpiar_sesiones IS 'Limpia sesiones expiradas. Ejecutar periódicamente con pg_cron.';

-- ============================================================
--  VISTAS
-- ============================================================

-- ── Vista: productos con categoría ─────────────────────────
CREATE VIEW v_productos_completos AS
SELECT
    p.id,
    p.nombre,
    p.descripcion,
    c.nombre         AS categoria,
    c.slug           AS categoria_slug,
    p.precio,
    p.stock,
    p.rating,
    p.img_url,
    p.featured,
    p.tipo,
    p.estado,
    p.fecha_inicio,
    p.fecha_fin,
    p.activo,
    p.created_at,
    p.updated_at,
    (SELECT COUNT(*) FROM favoritos f WHERE f.producto_id = p.id) AS total_favoritos,
    (SELECT COUNT(*) FROM pedido_lineas pl WHERE pl.producto_id = p.id) AS total_vendido
FROM  productos p
JOIN  categorias c ON c.id = p.categoria_id
WHERE p.activo = TRUE;

COMMENT ON VIEW v_productos_completos IS 'Productos activos con datos de categoría y métricas';

-- ── Vista: pedidos detallados ───────────────────────────────
CREATE VIEW v_pedidos_detallados AS
SELECT
    p.id,
    p.codigo,
    u.nombre         AS cliente_nombre,
    u.email          AS cliente_email,
    p.subtotal,
    p.impuestos,
    p.total,
    p.estado,
    p.direccion_envio,
    p.numero_seguimiento,
    p.created_at,
    p.updated_at,
    json_agg(
        json_build_object(
            'producto_id',  pl.producto_id,
            'nombre',       pl.nombre_snap,
            'precio',       pl.precio_snap,
            'cantidad',     pl.cantidad,
            'subtotal',     pl.subtotal
        ) ORDER BY pl.id
    ) AS lineas
FROM   pedidos p
JOIN   usuarios u       ON u.id = p.usuario_id
JOIN   pedido_lineas pl ON pl.pedido_id = p.id
GROUP  BY p.id, p.codigo, u.nombre, u.email,
          p.subtotal, p.impuestos, p.total, p.estado,
          p.direccion_envio, p.numero_seguimiento,
          p.created_at, p.updated_at;

COMMENT ON VIEW v_pedidos_detallados IS 'Pedidos con datos del cliente y líneas agregadas como JSON';

-- ── Vista: dashboard admin ──────────────────────────────────
CREATE VIEW v_dashboard_admin AS
SELECT
    (SELECT COUNT(*)                         FROM productos  WHERE activo = TRUE)          AS total_productos,
    (SELECT COUNT(*)                         FROM productos  WHERE stock <= 10 AND activo = TRUE) AS productos_stock_bajo,
    (SELECT COUNT(*)                         FROM usuarios   WHERE activo = TRUE)           AS total_usuarios,
    (SELECT COUNT(*)                         FROM usuarios   u JOIN roles r ON r.id = u.rol_id WHERE r.nombre = 'cliente' AND u.activo = TRUE) AS total_clientes,
    (SELECT COUNT(*)                         FROM pedidos    WHERE estado NOT IN ('cancelled')) AS total_pedidos,
    (SELECT COUNT(*)                         FROM pedidos    WHERE estado = 'pending')      AS pedidos_pendientes,
    (SELECT COALESCE(SUM(total), 0)          FROM pedidos    WHERE estado = 'delivered')    AS ingresos_totales,
    (SELECT COUNT(*)                         FROM tickets    WHERE estado <> 'closed')      AS tickets_abiertos,
    (SELECT COUNT(*)                         FROM tickets    WHERE estado = 'pending')      AS tickets_pendientes,
    (SELECT COALESCE(AVG(rating), 0)         FROM productos  WHERE activo = TRUE)           AS rating_promedio,
    NOW() AS generado_en;

COMMENT ON VIEW v_dashboard_admin IS 'Métricas globales para el panel de administración';

-- ── Vista: dashboard por cliente ───────────────────────────
CREATE VIEW v_dashboard_cliente AS
SELECT
    u.id                                                   AS usuario_id,
    u.nombre,
    (SELECT COUNT(*)    FROM pedidos    p WHERE p.usuario_id = u.id AND p.estado <> 'cancelled') AS total_pedidos,
    (SELECT COALESCE(SUM(total),0) FROM pedidos p WHERE p.usuario_id = u.id AND p.estado = 'delivered') AS total_gastado,
    (SELECT COUNT(*)    FROM favoritos  f WHERE f.usuario_id = u.id) AS total_favoritos,
    (SELECT COUNT(*)    FROM tickets    t WHERE t.usuario_id = u.id AND t.estado <> 'closed') AS tickets_abiertos,
    (SELECT ci.cantidad FROM carrito_items ci JOIN carritos c ON c.id = ci.carrito_id WHERE c.usuario_id = u.id) AS items_carrito
FROM  usuarios u
JOIN  roles r ON r.id = u.rol_id AND r.nombre = 'cliente';

COMMENT ON VIEW v_dashboard_cliente IS 'Métricas por cliente para su panel personal';

-- ============================================================
--  DATOS DE PRUEBA
-- ============================================================

-- ── Roles ──────────────────────────────────────────────────
INSERT INTO roles (nombre, descripcion) VALUES
    ('admin',   'Administrador con acceso total al sistema'),
    ('cliente', 'Usuario cliente con acceso a tienda y panel personal');

-- ── Categorías ─────────────────────────────────────────────
INSERT INTO categorias (nombre, slug, descripcion) VALUES
    ('Fútbol',        'futbol',        'Balones, tacos, espinilleras y equipamiento de fútbol'),
    ('Baloncesto',    'baloncesto',    'Balones, canastas y accesorios de baloncesto'),
    ('Ciclismo',      'ciclismo',      'Cascos, guantes, ropa y accesorios para ciclismo'),
    ('Natación',      'natacion',      'Gafas, gorros, trajes de baño y accesorios'),
    ('Yoga y Fitness','yoga-fitness',  'Tapetes, bandas elásticas, pesas y más'),
    ('Calzado',       'calzado',       'Zapatillas deportivas para todas las disciplinas'),
    ('Tenis',         'tenis',         'Raquetas, pelotas y accesorios de tenis y pádel'),
    ('Gimnasio',      'gimnasio',      'Mancuernas, barras, máquinas y accesorios de gym');

-- ── Usuarios ───────────────────────────────────────────────
INSERT INTO usuarios (id, rol_id, nombre, email, password_hash, telefono, direccion) VALUES
    (
        'a0000000-0000-0000-0000-000000000001',
        (SELECT id FROM roles WHERE nombre = 'admin'),
        'Admin User',
        'admin@deportesneon.com',
        crypt('admin123', gen_salt('bf', 12)),
        '+34 123 456 789',
        'Calle Admin 123, Madrid, España'
    ),
    (
        'b0000000-0000-0000-0000-000000000002',
        (SELECT id FROM roles WHERE nombre = 'cliente'),
        'Carlos López',
        'cliente@deportesneon.com',
        crypt('cliente123', gen_salt('bf', 12)),
        '+57 300 123 4567',
        'Av. El Dorado 68B-31, Bogotá'
    ),
    (
        'c0000000-0000-0000-0000-000000000003',
        (SELECT id FROM roles WHERE nombre = 'cliente'),
        'María González',
        'maria@deportesneon.com',
        crypt('maria123', gen_salt('bf', 12)),
        '+57 311 987 6543',
        'Calle 93 #15-30, Bogotá'
    );

-- ── Productos ──────────────────────────────────────────────
INSERT INTO productos
    (categoria_id, nombre, descripcion, precio, stock, rating, img_url, featured, tipo, estado, fecha_inicio, fecha_fin)
VALUES
    (
        (SELECT id FROM categorias WHERE slug='baloncesto'),
        'Balón de Baloncesto',
        'Balón de baloncesto de cuero sintético, tamaño oficial para competición',
        69.99, 28, 4.7,
        'https://picsum.photos/seed/baloncesto/400/300',
        FALSE, 'compra', 'activo', '2026-01-01', NULL
    ),
    (
        (SELECT id FROM categorias WHERE slug='futbol'),
        'Balón de Fútbol Profesional',
        'Balón oficial de competición, cosido a mano con tecnología termosellada',
        89.99, 45, 4.8,
        'https://picsum.photos/seed/futbol/400/300',
        TRUE, 'compra', 'activo', '2026-01-01', NULL
    ),
    (
        (SELECT id FROM categorias WHERE slug='ciclismo'),
        'Casco de Ciclismo',
        'Casco aerodinámico con ventilación optimizada y sistema de ajuste rápido',
        129.99, 22, 4.8,
        'https://picsum.photos/seed/ciclismo/400/300',
        TRUE, 'alquiler', 'en-uso', '2026-03-01', '2026-06-30'
    ),
    (
        (SELECT id FROM categorias WHERE slug='natacion'),
        'Gafas de Natación',
        'Gafas profesionales con lentes antivaho y protección UV',
        34.99, 38, 4.4,
        'https://picsum.photos/seed/natacion/400/300',
        FALSE, 'compra', 'activo', '2026-01-01', NULL
    ),
    (
        (SELECT id FROM categorias WHERE slug='yoga-fitness'),
        'Tapete de Yoga Premium',
        'Tapete antideslizante de 6mm con material ecológico y correa de transporte',
        49.99, 52, 4.5,
        'https://picsum.photos/seed/yoga/400/300',
        FALSE, 'alquiler', 'desuso', '2025-10-01', '2026-01-31'
    ),
    (
        (SELECT id FROM categorias WHERE slug='calzado'),
        'Zapatillas Running Pro',
        'Zapatillas ligeras con suela amortiguada y tecnología de retorno de energía',
        159.99, 18, 4.9,
        'https://picsum.photos/seed/calzado/400/300',
        TRUE, 'compra', 'activo', '2026-01-01', NULL
    ),
    (
        (SELECT id FROM categorias WHERE slug='tenis'),
        'Raqueta de Tenis',
        'Raqueta de grafito con cordaje de alta tensión y mango ergonómico',
        249.99, 15, 4.6,
        'https://picsum.photos/seed/tenis/400/300',
        TRUE, 'alquiler', 'en-uso', '2026-02-15', '2026-08-15'
    ),
    (
        (SELECT id FROM categorias WHERE slug='gimnasio'),
        'Set de Mancuernas Ajustables',
        'Set completo de mancuernas de 2 a 24 kg con sistema de ajuste rápido',
        189.99, 12, 4.3,
        'https://picsum.photos/seed/mancuernas/400/300',
        FALSE, 'compra', 'activo', '2026-01-01', NULL
    ),
    (
        (SELECT id FROM categorias WHERE slug='calzado'),
        'Tacos de Fútbol Profesional',
        'Tacos de fútbol con amortiguación avanzada y suela para terrenos blandos y firmes',
        119.99, 30, 4.6,
        'https://picsum.photos/seed/tacos/400/300',
        FALSE, 'compra', 'activo', '2026-01-01', NULL
    ),
    (
        (SELECT id FROM categorias WHERE slug='tenis'),
        'Pelotas de Tenis Premium',
        'Pack de 3 pelotas de tenis de alta durabilidad y rebote uniforme para entrenar y competir',
        24.99, 80, 4.7,
        'https://picsum.photos/seed/pelotas-tenis/400/300',
        FALSE, 'compra', 'activo', '2026-01-01', NULL
    ),
    (
        (SELECT id FROM categorias WHERE slug='ciclismo'),
        'Guantes de Ciclismo',
        'Guantes ergonómicos con padding para mayor confort y agarre en manillar',
        39.99, 25, 4.5,
        'https://picsum.photos/seed/guantes/400/300',
        FALSE, 'compra', 'activo', '2026-01-01', NULL
    ),
    (
        (SELECT id FROM categorias WHERE slug='yoga-fitness'),
        'Set de Bloques de Yoga',
        'Set de 2 bloques de yoga antideslizantes para mejorar tu práctica y alineación',
        25.99, 20, 4.2,
        'https://picsum.photos/seed/bloques-yoga/400/300',
        FALSE, 'compra', 'activo', '2026-01-01', NULL
    ),
    (
        (SELECT id FROM categorias WHERE slug='natacion'),
        'Gorro de Natación y Tapones',
        'Set compuesto por gorro de silicona y tapones para una experiencia de nado más cómoda',
        19.99, 52, 4.3,
        'https://picsum.photos/seed/gorro-natacion/400/300',
        FALSE, 'compra', 'activo', '2026-01-01', NULL
    );

-- ── Pedidos (ajusta el seq manualmente para datos de prueba) ─
-- Pedido 1 — Carlos López
ALTER SEQUENCE seq_pedido_num RESTART WITH 38;
INSERT INTO pedidos (usuario_id, estado, direccion_envio, numero_seguimiento)
VALUES (
    'b0000000-0000-0000-0000-000000000002',
    'transit',
    'Avenida Siempre Viva 742, Medellín',
    'SPT-2026-DN0038'
);

INSERT INTO pedido_lineas (pedido_id, producto_id, nombre_snap, precio_snap, cantidad)
SELECT
    (SELECT id FROM pedidos WHERE codigo = '#DN-0038'),
    p.id,
    p.nombre,
    p.precio,
    1
FROM productos p WHERE p.nombre = 'Tapete de Yoga Premium';

-- Pedido 2 — Carlos López (entregado)
ALTER SEQUENCE seq_pedido_num RESTART WITH 41;
INSERT INTO pedidos (usuario_id, estado, direccion_envio, numero_seguimiento)
VALUES (
    'b0000000-0000-0000-0000-000000000002',
    'delivered',
    'Calle Principal 123, Bogotá, Colombia',
    'SPT-2026-DN0041'
);

INSERT INTO pedido_lineas (pedido_id, producto_id, nombre_snap, precio_snap, cantidad)
SELECT (SELECT id FROM pedidos WHERE codigo = '#DN-0041'), p.id, p.nombre, p.precio, 1
FROM productos p WHERE p.nombre = 'Balón de Fútbol Profesional';

INSERT INTO pedido_lineas (pedido_id, producto_id, nombre_snap, precio_snap, cantidad)
SELECT (SELECT id FROM pedidos WHERE codigo = '#DN-0041'), p.id, p.nombre, p.precio, 2
FROM productos p WHERE p.nombre = 'Gafas de Natación';

-- ============================================================
--  TEST CREDENTIALS — DEPORTES NEON
-- ============================================================
-- 
--  ADMIN USER
--  ───────────────────────────────────────────────────────────
--  Email:      admin@deportesneon.com
--  Password:   admin123
--  Rol:        admin
--
--  CLIENT USER
--  ───────────────────────────────────────────────────────────
--  Email:      cliente@deportesneon.com
--  Password:   cliente123
--  Rol:        cliente
--
--  DATABASE CONNECTION
--  ───────────────────────────────────────────────────────────
--  Host:       localhost
--  Port:       5432
--  Database:   deportes_neon
--  User:       postgres
--  Password:   password123
--
-- ============================================================

-- Dejar la secuencia lista para nuevos pedidos
ALTER SEQUENCE seq_pedido_num RESTART WITH 42;

-- ── Favoritos ──────────────────────────────────────────────
INSERT INTO favoritos (usuario_id, producto_id)
SELECT 'b0000000-0000-0000-0000-000000000002', p.id
FROM   productos p WHERE p.nombre IN ('Balón de Fútbol Profesional','Raqueta de Tenis');

INSERT INTO favoritos (usuario_id, producto_id)
SELECT 'c0000000-0000-0000-0000-000000000003', p.id
FROM   productos p WHERE p.nombre IN ('Casco de Ciclismo','Zapatillas Running Pro','Gafas de Natación');

-- ── Tickets ────────────────────────────────────────────────
ALTER SEQUENCE seq_ticket_num RESTART WITH 9;

INSERT INTO tickets (usuario_id, asunto, descripcion, estado, prioridad)
VALUES (
    'b0000000-0000-0000-0000-000000000002',
    'Consulta sobre garantía',
    '¿Cuánto tiempo cubre la garantía de las zapatillas Running Pro?',
    'closed', 'baja'
);

ALTER SEQUENCE seq_ticket_num RESTART WITH 10;
INSERT INTO tickets (usuario_id, asunto, descripcion, estado, prioridad)
VALUES (
    'c0000000-0000-0000-0000-000000000003',
    'Producto defectuoso',
    'El casco de ciclismo tiene un defecto en el sistema de cierre.',
    'open', 'alta'
);

ALTER SEQUENCE seq_ticket_num RESTART WITH 12;
INSERT INTO tickets (usuario_id, asunto, descripcion, estado, prioridad)
VALUES (
    'b0000000-0000-0000-0000-000000000002',
    'Error en pedido #DN-0038',
    'El pedido llegó incompleto, falta un artículo del envío.',
    'pending', 'media'
);

-- Dejar secuencia lista
ALTER SEQUENCE seq_ticket_num RESTART WITH 13;

-- ── Mensajes en tickets ────────────────────────────────────
INSERT INTO ticket_mensajes (ticket_id, autor_id, mensaje)
SELECT
    t.id,
    'b0000000-0000-0000-0000-000000000002',
    'Hola, quisiera saber más sobre la cobertura de garantía. ¿Aplica para defectos de fabricación?'
FROM tickets t WHERE t.asunto = 'Consulta sobre garantía';

INSERT INTO ticket_mensajes (ticket_id, autor_id, mensaje)
SELECT
    t.id,
    'a0000000-0000-0000-0000-000000000001',
    'Buenos días Carlos. La garantía cubre 1 año por defectos de fabricación. Para desgaste normal no aplica.'
FROM tickets t WHERE t.asunto = 'Consulta sobre garantía';

-- ── Eventos del calendario ─────────────────────────────────
INSERT INTO eventos (usuario_id, titulo, descripcion, fecha_hora, tipo)
VALUES
    ('a0000000-0000-0000-0000-000000000001', 'Revisión de inventario', 'Conteo mensual de stock en bodega',           '2026-05-10 09:00:00+00', 'Tarea'),
    ('a0000000-0000-0000-0000-000000000001', 'Reunión con proveedores', 'Negociación de precios para Q3',             '2026-05-15 14:00:00+00', 'Reunión'),
    ('b0000000-0000-0000-0000-000000000002', 'Maratón Bogotá 2026',    'Participación en maratón de la ciudad',      '2026-06-01 06:00:00+00', 'Evento'),
    ('b0000000-0000-0000-0000-000000000002', 'Renovar membresía gym',  'Vence membresía — renovar antes del día 15', '2026-05-12 08:00:00+00', 'Recordatorio');

-- ============================================================
--  CONSULTAS ÚTILES (comentadas como referencia)
-- ============================================================

/*
-- Verificar totales de pedido
SELECT codigo, subtotal, impuestos, total FROM pedidos ORDER BY id;

-- Ver productos con stock bajo
SELECT nombre, stock, categoria FROM v_productos_completos WHERE stock <= 15 ORDER BY stock;

-- Métricas del dashboard admin
SELECT * FROM v_dashboard_admin;

-- Pedidos de un cliente con todas sus líneas
SELECT * FROM v_pedidos_detallados WHERE cliente_email = 'cliente@deportesneon.com';

-- Métricas de un cliente específico
SELECT * FROM v_dashboard_cliente WHERE usuario_id = 'b0000000-0000-0000-0000-000000000002';

-- Autenticar usuario (comparar hash)
SELECT id, nombre, rol_id FROM usuarios
WHERE email = 'cliente@deportesneon.com'
  AND password_hash = crypt('cliente123', password_hash);

-- Productos más vendidos
SELECT p.nombre, SUM(pl.cantidad) AS unidades_vendidas
FROM   pedido_lineas pl
JOIN   productos p ON p.id = pl.producto_id
GROUP  BY p.nombre ORDER BY unidades_vendidas DESC;

-- Tickets abiertos con datos del cliente
SELECT t.codigo, t.asunto, t.prioridad, t.estado, u.nombre, u.email
FROM   tickets t
JOIN   usuarios u ON u.id = t.usuario_id
WHERE  t.estado <> 'closed'
ORDER  BY t.created_at DESC;

-- Limpiar sesiones expiradas
SELECT fn_limpiar_sesiones();
*/

--Contraseña PostgreSQL ES: password123

-- ============================================================
--  FIN DEL SCRIPT
-- ============================================================
