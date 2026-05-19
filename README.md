# 🏋️ Deportes Neon

Proyecto full-stack de tienda de artículos deportivos con backend en Node.js + Express, base de datos MySQL y frontend estático.

---

## 📁 Estructura del proyecto

```
deportes-neon-v3/
├── backend/                  ← API REST Node.js + Express
│   ├── server.js             ← Servidor principal
│   ├── config/db.js          ← Conexión MySQL
│   ├── .env.example          ← Ejemplo de configuración
│   ├── middleware/           ← Middlewares de autenticación y rate limit
│   └── routes/               ← Endpoints de la API
├── database/                 ← Script MySQL de la base de datos
│   └── deportes_neon_mysql.sql
├── frontend/                 ← Frontend estático (HTML/CSS/JS)
│   ├── assets/
│   │   ├── css/
│   │   └── js/
│   ├── index.html
│   ├── registro.html
│   ├── dashboard.html
│   └── dashboard-cliente.html
├── INICIAR-SERVIDOR.bat      ← Atajo Windows para arrancar backend
└── README.md                ← Documentación del proyecto
```

---

## ⚡ Requisitos

- Node.js v18+ y npm
- MySQL
- Navegador moderno

---

## 🚀 Instalación rápida

1. Instala Node.js y MySQL.
2. Importa la base de datos desde `database/deportes_neon_mysql.sql`.
3. Copia el archivo de ejemplo de configuración:

```bash
cd backend
copy .env.example .env
```

4. Edita `backend/.env` con tus datos de conexión:

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=deportes_neon
DB_USER=root
DB_PASSWORD=tu_password_aqui
JWT_SECRET=una_clave_segura
JWT_EXPIRES_IN=7d
PORT=3000
NODE_ENV=development
CORS_ORIGINS=http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000
```

5. Instala dependencias del backend:

```bash
cd backend
npm install
```

6. Inicia el servidor:

```bash
npm start
```

7. Abre el frontend en el navegador:

```text
http://localhost:3000
```

> En Windows puedes usar `INICIAR-SERVIDOR.bat` desde la raíz del proyecto.

---

## 🔧 Archivos clave

- `backend/server.js` — servidor principal Express
- `backend/config/db.js` — conexión MySQL con `mysql2`
- `backend/routes/` — rutas de la API
- `frontend/` — frontend HTML, CSS y JavaScript
- `database/deportes_neon_mysql.sql` — script de base de datos

---

## 🧪 Rutas principales de la API

### Auth

| Método | Ruta                   | Descripción            |
|--------|------------------------|------------------------|
| POST   | /api/auth/login        | Iniciar sesión         |
| POST   | /api/auth/registro     | Crear cuenta           |
| GET    | /api/auth/me           | Perfil del usuario     |
| PUT    | /api/auth/me           | Actualizar perfil      |
| PUT    | /api/auth/password     | Cambiar contraseña     |

### Productos

| Método | Ruta                          | Descripción              |
|--------|-------------------------------|--------------------------|
| GET    | /api/productos                | Listar productos         |
| GET    | /api/productos/:id            | Detalle de producto      |
| POST   | /api/productos                | Crear producto (admin)   |
| PUT    | /api/productos/:id            | Actualizar producto      |
| DELETE | /api/productos/:id            | Eliminar producto        |

### Carrito

| Método | Ruta                              | Descripción           |
|--------|-----------------------------------|-----------------------|
| GET    | /api/carrito                      | Ver carrito           |
| POST   | /api/carrito                      | Agregar producto      |
| PUT    | /api/carrito/:productoId          | Cambiar cantidad      |
| DELETE | /api/carrito/:productoId          | Quitar producto       |
| DELETE | /api/carrito                      | Vaciar carrito        |

### Pedidos

| Método | Ruta                              | Descripción                 |
|--------|-----------------------------------|-----------------------------|
| GET    | /api/pedidos                      | Listar pedidos              |
| GET    | /api/pedidos/:id                  | Detalle de pedido           |
| POST   | /api/pedidos/checkout             | Crear pedido                |
| PUT    | /api/pedidos/:id/estado           | Actualizar estado (admin)   |

### Tickets

| Método | Ruta                              | Descripción                 |
|--------|-----------------------------------|-----------------------------|
| GET    | /api/tickets                      | Listar tickets              |
| POST   | /api/tickets                     | Crear ticket                |
| PUT    | /api/tickets/:id                 | Actualizar ticket           |

---

## ⚠️ Nota

No subas `backend/.env` al repositorio. Usa `backend/.env.example` como plantilla para tu configuración local.

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

---

## 🚀 Ejecución en producción

Para correr la aplicación en un entorno de producción en Linux:

1. Instala dependencias en `api`:

```bash
cd api
npm install
```

2. Asegúrate de tener el archivo `api/.env` configurado.

3. Ejecuta el servidor con `pm2` o `node`:

```bash
npm install -g pm2
pm start
# o
pm run start
```

4. Si usas `pm2`:

```bash
pm start
pm2 save
pm2 startup
```

5. Abre el navegador en:

```bash
http://localhost:3000
```

---

## 🧰 Resolución de problemas comunes

- `Error: connect ECONNREFUSED 127.0.0.1:5432`
  - Verifica que PostgreSQL esté en ejecución: `sudo systemctl status postgresql`.
  - Revisa `api/.env` y confirma `DB_HOST=localhost` y `DB_PORT=5432`.

- `Error: relation "..." does not exist`
  - Ejecuta de nuevo el script SQL: `sudo -u postgres psql -d deportes_neon -f deportes_neon_db.sql`.

- `npm install` falla con permisos
  - Usa `sudo npm install` solo si es necesario, preferible usar un entorno local sin sudo.

- `npm start` muestra `PORT already in use`
  - Cambia el puerto en el archivo de configuración o mata el proceso actual con `sudo lsof -i :3000` y `kill`.

---
