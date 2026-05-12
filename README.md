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

## ⚡ Instalación

### 1. Requisitos del sistema

- Node.js v18+
- npm
- PostgreSQL v14+
- Navegador moderno

### 2. Instalación en Linux

Para distribuciones basadas en Debian/Ubuntu:

```bash
sudo apt update
sudo apt install -y nodejs npm postgresql postgresql-contrib
```

Para otras distribuciones, usa el gestor equivalente y asegúrate de tener Node.js, npm y PostgreSQL instalados.

### 3. Instalación en Windows

1. Descarga e instala Node.js desde https://nodejs.org/
2. Descarga e instala PostgreSQL desde https://www.postgresql.org/
3. Si usas PowerShell, abre una terminal con permisos de administrador.
4. Abre `psql` con el usuario `postgres`:

```powershell
psql -U postgres
```

5. En el prompt de PostgreSQL, crea la base de datos y el usuario:

```sql
CREATE DATABASE deportes_neon;
CREATE USER deportes_user WITH PASSWORD 'tu_password';
GRANT ALL PRIVILEGES ON DATABASE deportes_neon TO deportes_user;
\q
```

### 4. Configurar PostgreSQL y la base de datos

```bash
sudo -u postgres psql
```

En el prompt de PostgreSQL:

```sql
CREATE DATABASE deportes_neon;
CREATE USER deportes_user WITH PASSWORD 'tu_password';
GRANT ALL PRIVILEGES ON DATABASE deportes_neon TO deportes_user;
\q
```

Cargar el script inicial de la base de datos:

```bash
sudo -u postgres psql -d deportes_neon -f deportes_neon_db.sql
```

### 5. Configurar variables de entorno

```bash
cd api
cp .env.example .env
```

Editar `api/.env` con los datos de tu instalación.

#### Variables de entorno necesarias

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=deportes_neon
DB_USER=deportes_user
DB_PASSWORD=tu_password
JWT_SECRET=una_clave_segura
PORT=3000
```

- `DB_HOST`: host de PostgreSQL.
- `DB_PORT`: puerto de PostgreSQL.
- `DB_NAME`: nombre de la base de datos.
- `DB_USER`: usuario de PostgreSQL.
- `DB_PASSWORD`: contraseña del usuario.
- `JWT_SECRET`: clave secreta para tokens JWT.
- `PORT`: puerto donde corre el backend.

> Guarda este archivo en `api/.env` y no lo subas a git.

### 5. Instalar dependencias e iniciar el servidor

```bash
cd api
npm install
npm start
```

### 6. Abrir el proyecto en el navegador

```
http://localhost:3000
```

> Si deseas ejecutar el backend en segundo plano, usa `npm run start` dentro de `api` o una herramienta como `pm2`.

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
