// ============================================================
//  assets/api.js — Cliente API del frontend
//  Todos los fetch hacia el backend pasan por aquí
// ============================================================

const API_BASE = window.location.port === '3000'
  ? '/api'
  : 'http://localhost:3000/api';

// ── Token JWT (guardado en localStorage) ───────────────────
const Token = {
  get:    ()      => localStorage.getItem('dn_token'),
  set:    (t)     => localStorage.setItem('dn_token', t),
  remove: ()      => localStorage.removeItem('dn_token'),
  headers:()      => ({
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    ...(Token.get() ? { Authorization: `Bearer ${Token.get()}` } : {})
  }),
};

// ── Usuario activo ──────────────────────────────────────────
const CurrentUser = {
  get:    ()  => { try { return JSON.parse(localStorage.getItem('dn_user') || 'null'); } catch { return null; } },
  set:    (u) => localStorage.setItem('dn_user', JSON.stringify(u)),
  remove: ()  => localStorage.removeItem('dn_user'),
};

// ── Fetch base con manejo de errores ───────────────────────
async function apiFetch(path, options = {}) {
  let res;
  try {
    res = await fetch(API_BASE + path, {
      ...options,
      headers: { ...Token.headers(), ...(options.headers || {}) },
    });
  } catch (err) {
    throw new Error('No se pudo conectar con el servidor. Inicia la API en http://localhost:3000 y vuelve a recargar.');
  }

  // 401 → si hay token guardado, la sesión expiró y redirigimos.
  if (res.status === 401 && Token.get()) {
    Token.remove(); CurrentUser.remove();
    window.location.href = 'index.html';
    return;
  }

  let data = null;
  try {
    data = await res.json();
  } catch (err) {
    // Si la respuesta no es JSON, conservar null para manejar errores genéricos.
  }

  if (!res.ok) throw new Error(data?.error || data?.message || `Error ${res.status}`);
  return data;
}

function apiGet(path)           { return apiFetch(path, { method: 'GET' }); }
function apiPost(path, body)    { return apiFetch(path, { method: 'POST',   body: JSON.stringify(body) }); }
function apiPut(path, body)     { return apiFetch(path, { method: 'PUT',    body: JSON.stringify(body) }); }
function apiDelete(path)        { return apiFetch(path, { method: 'DELETE' }); }

// ============================================================
//  AUTH
// ============================================================
const Auth = {
  async login(email, password) {
    const data = await apiPost('/auth/login', { email, password });
    Token.set(data.token);
    CurrentUser.set(data.usuario);
    return data.usuario;
  },

  async registro(nombre, email, password, telefono, direccion) {
    const data = await apiPost('/auth/registro', { nombre, email, password, telefono, direccion });
    Token.set(data.token);
    CurrentUser.set(data.usuario);
    return data.usuario;
  },

  logout() {
    Token.remove(); CurrentUser.remove();
    window.location.href = 'index.html';
  },

  async me()                     { return apiGet('/auth/me'); },
  async usuarios()               { return apiGet('/auth/usuarios'); },
  async updatePerfil(datos)      {
    const data = await apiPut('/auth/me', datos);
    CurrentUser.set(data);
    return data;
  },
  setUser(usuario) {
    CurrentUser.set(usuario);
  },
  async changePassword(actual, nuevo) {
    return apiPut('/auth/password', { password_actual: actual, password_nuevo: nuevo });
  },

  isLoggedIn() { return !!Token.get(); },
  getUser()    { return CurrentUser.get(); },
  isAdmin()    { return CurrentUser.get()?.rol === 'admin'; },
};

// ============================================================
//  PRODUCTOS
// ============================================================
const Productos = {
  listar(filtros = {}) {
    const params = new URLSearchParams(
      Object.fromEntries(Object.entries(filtros).filter(([,v]) => v != null && v !== ''))
    );
    return apiGet('/productos' + (params.toString() ? '?' + params : ''));
  },
  obtener(id)      { return apiGet(`/productos/${id}`); },
  crear(datos)     { return apiPost('/productos', datos); },
  actualizar(id, datos) { return apiPut(`/productos/${id}`, datos); },
  eliminar(id)     { return apiDelete(`/productos/${id}`); },
  categorias()     { return apiGet('/productos/cat/lista'); },
};

// ============================================================
//  CARRITO
// ============================================================
const Carrito = {
  obtener()              { return apiGet('/carrito'); },
  agregar(producto_id, cantidad = 1) { return apiPost('/carrito', { producto_id, cantidad }); },
  actualizar(producto_id, cantidad)  { return apiPut(`/carrito/${producto_id}`, { cantidad }); },
  quitar(producto_id)    { return apiDelete(`/carrito/${producto_id}`); },
  vaciar()               { return apiDelete('/carrito'); },
};

// ============================================================
//  FAVORITOS
// ============================================================
const Favoritos = {
  obtener()            { return apiGet('/favoritos'); },
  agregar(producto_id) { return apiPost(`/favoritos/${producto_id}`); },
  quitar(producto_id)  { return apiDelete(`/favoritos/${producto_id}`); },
};

// ============================================================
//  PEDIDOS
// ============================================================
const Pedidos = {
  listar(filtros = {}) {
    const params = new URLSearchParams(Object.fromEntries(Object.entries(filtros).filter(([,v]) => v)));
    return apiGet('/pedidos' + (params.toString() ? '?' + params : ''));
  },
  obtener(id)              { return apiGet(`/pedidos/${id}`); },
  checkout(direccion_envio){ return apiPost('/pedidos/checkout', { direccion_envio }); },
  cambiarEstado(id, estado){ return apiPut(`/pedidos/${id}/estado`, { estado }); },
};

// ============================================================
//  TICKETS
// ============================================================
const Tickets = {
  listar(filtros = {}) {
    const params = new URLSearchParams(Object.fromEntries(Object.entries(filtros).filter(([,v]) => v)));
    return apiGet('/tickets' + (params.toString() ? '?' + params : ''));
  },
  obtener(id)                    { return apiGet(`/tickets/${id}`); },
  crear(asunto, descripcion, prioridad) { return apiPost('/tickets', { asunto, descripcion, prioridad }); },
  responder(id, mensaje, es_interno = false) { return apiPost(`/tickets/${id}/mensajes`, { mensaje, es_interno }); },
  cambiarEstado(id, estado)      { return apiPut(`/tickets/${id}/estado`, { estado }); },
};

// ============================================================
//  EVENTOS
// ============================================================
const Eventos = {
  listar(year, month) {
    const params = year && month ? `?year=${year}&month=${month}` : '';
    return apiGet('/eventos' + params);
  },
  crear(titulo, descripcion, fecha_hora, tipo) {
    return apiPost('/eventos', { titulo, descripcion, fecha_hora, tipo });
  },
  actualizar(id, datos)  { return apiPut(`/eventos/${id}`, datos); },
  eliminar(id)           { return apiDelete(`/eventos/${id}`); },
};

// ============================================================
//  DASHBOARD
// ============================================================
const Dashboard = {
  admin()   { return apiGet('/dashboard/admin'); },
  cliente() { return apiGet('/dashboard/cliente'); },
};

// ============================================================
//  Exportar al scope global (usado desde los HTML)
// ============================================================
window.API    = { Auth, Productos, Carrito, Favoritos, Pedidos, Tickets, Eventos, Dashboard };
window.Auth   = Auth;     // acceso directo para login/registro
