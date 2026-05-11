# 🏋️ DEPORTES NEON — Full-Stack App

Sistema de gestión de artículos deportivos con autenticación JWT,
panel admin, panel cliente y base de datos PostgreSQL.

---

## 🗂️ Estructura del proyecto

```
deportes-neon-v3/
├── api/                    ← Backend Node.js + Express
│   ├── server.js           ← Servidor principal
│   ├── db.js               ← Pool de conexiones PostgreSQL
│   ├── .env.example        ← Variables de entorno (copiar a .env)
│   ├── middleware/
│   │   └── auth.js         ← Guard JWT + rol admin
│   └── routes/
│       ├── auth.js         ← Login, registro, perfil
│       ├── productos.js    ← CRUD catálogo + filtros
│       ├── carrito.js      ← Carrito de compra
│       ├── favoritos.js    ← Wishlist
│       ├── pedidos.js      ← Checkout y seguimiento
│       ├── tickets.js      ← Soporte al cliente
│       ├── eventos.js      ← Calendario
│       └── dashboard.js    ← Métricas admin/cliente
├── assets/
│   ├── api.js              ← Cliente API del frontend (nuevo)
│   ├── cliente.js          ← Lógica dashboard cliente
│   ├── dashboard.js        ← Lógica dashboard admin
│   ├── app.js              ← Partículas + alertas
│   ├── styles.css          ← Estilos base
│   └── styles-extra.css    ← Estilos adicionales
├── index.html              ← Login
├── registro.html           ← Registro
├── dashboard-cliente.html  ← Panel cliente
├── dashboard.html          ← Panel admin
└── deportes_neon_db.sql    ← Script de base de datos
```

---

## ⚡ Instalación rápida

### 1. Base de datos PostgreSQL

```sql
-- En psql como superusuario:
CREATE DATABASE deportes_neon;
\c deportes_neon
\i deportes_neon_db.sql
```

### 2. Configurar variables de entorno

```bash
cd api
cp .env.example .env
# Editar .env con tus datos de PostgreSQL
```

### 3. Instalar dependencias e iniciar

```bash
cd api
npm install
npm start
```

### 4. Abrir en el navegador

```
http://localhost:3000
```

---

## 🔑 Credenciales de prueba

| Rol     | Email                        | Contraseña  |
|---------|------------------------------|-------------|
| Admin   | admin@deportesneon.com       | admin123    |
| Cliente | cliente@deportesneon.com     | cliente123  |

---

## 🌐 Endpoints API

### Auth
| Método | Ruta                  | Descripción              |
|--------|-----------------------|--------------------------|
| POST   | /api/auth/login       | Iniciar sesión           |
| POST   | /api/auth/registro    | Crear cuenta             |
| GET    | /api/auth/me          | Perfil del usuario       |
| PUT    | /api/auth/me          | Actualizar perfil        |
| PUT    | /api/auth/password    | Cambiar contraseña       |

### Productos
| Método | Ruta                  | Descripción              |
|--------|-----------------------|--------------------------|
| GET    | /api/productos        | Listar con filtros       |
| GET    | /api/productos/:id    | Detalle de producto      |
| POST   | /api/productos        | Crear (admin)            |
| PUT    | /api/productos/:id    | Actualizar (admin)       |
| DELETE | /api/productos/:id    | Eliminar (admin)         |
| GET    | /api/productos/cat/lista | Listar categorías     |

### Carrito
| Método | Ruta                       | Descripción           |
|--------|----------------------------|-----------------------|
| GET    | /api/carrito               | Ver carrito           |
| POST   | /api/carrito               | Agregar producto      |
| PUT    | /api/carrito/:productoId   | Cambiar cantidad      |
| DELETE | /api/carrito/:productoId   | Quitar producto       |
| DELETE | /api/carrito               | Vaciar carrito        |

### Pedidos
| Método | Ruta                       | Descripción           |
|--------|----------------------------|-----------------------|
| GET    | /api/pedidos               | Mis pedidos / todos   |
| GET    | /api/pedidos/:id           | Detalle de pedido     |
| POST   | /api/pedidos/checkout      | Crear pedido          |
| PUT    | /api/pedidos/:id/estado    | Cambiar estado (admin)|

### Tickets
| Método | Ruta                          | Descripción          |
|--------|-------------------------------|----------------------|
| GET    | /api/tickets                  | Listar tickets       |
| POST   | /api/tickets                  | Crear ticket         |
| POST   | /api/tickets/:id/mensajes     | Responder            |
| PUT    | /api/tickets/:id/estado       | Cambiar estado       |

### Otras
| Método | Ruta                   | Descripción                |
|--------|------------------------|----------------------------|
| GET    | /api/favoritos         | Ver favoritos              |
| POST   | /api/favoritos/:id     | Agregar favorito           |
| DELETE | /api/favoritos/:id     | Quitar favorito            |
| GET    | /api/eventos           | Ver eventos del calendario |
| POST   | /api/eventos           | Crear evento               |
| GET    | /api/dashboard/admin   | Métricas admin             |
| GET    | /api/dashboard/cliente | Métricas cliente           |
| GET    | /api/health            | Estado del servidor        |

---

## 🛠️ Requisitos

- **Node.js** v18+
- **PostgreSQL** v14+
- Navegador moderno con soporte ES2020
