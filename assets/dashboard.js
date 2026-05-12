// ============================================================
//  DEPORTES NEON — Dashboard Admin (conectado a API)
// ============================================================

(function authGuard() {
  if (!Auth.isLoggedIn()) { window.location.href = 'index.html'; return; }
  const u = Auth.getUser();
  if (u?.rol !== 'admin') { window.location.href = 'dashboard-cliente.html'; }
})();

const ui = {
  calendarYear: new Date().getFullYear(), calendarMonth: new Date().getMonth(),
  editandoPerfil: false,
  highlightProductId: null,
  productos: [], carrito: { items: [], subtotal: 0, impuestos: 0, total: 0 },
  favoritos: [], pedidos: [], tickets: [], eventos: [], usuarios: [], eventoEditandoId: null,
  lastProductosRequestId: 0,
  searchDebounceTimer: null,
};
const DEFAULT_IMAGE_URL = 'https://via.placeholder.com/400x300?text=Sin+imagen';

function getImageUrl(url) {
  if (!url || typeof url !== 'string') return DEFAULT_IMAGE_URL;
  const trimmed = url.trim();
  if (!trimmed) return DEFAULT_IMAGE_URL;
  return trimmed;
}

document.addEventListener('DOMContentLoaded', async () => {
  await syncCurrentUser();
  await Promise.allSettled([loadDashboard(), loadCategorias(), loadProductos()]);
  updateBadgesFromCache(); initAvatarModal();
});

async function syncCurrentUser() {
  const cached = Auth.getUser();
  setText('admin-display-name', cached?.nombre || 'Admin');
  renderTopbarAvatar(cached);
  try {
    const fresh = await API.Auth.me();
    if (fresh) {
      Auth.setUser(fresh);
      setText('admin-display-name', fresh.nombre || 'Admin');
      renderTopbarAvatar(fresh);
    }
  } catch (err) {
    // mantener el usuario cacheado si falla la petición
  }
}

function renderTopbarAvatar(user) {
  const container = document.getElementById('topbar-avatar');
  if (!container) return;
  if (user?.avatar_url) {
    container.innerHTML = `<img src="${user.avatar_url}" alt="${normalizeText(user?.nombre || 'Avatar')}">`;
  } else {
    container.innerHTML = '<i class="fa-solid fa-user"></i>';
  }
}

function normalizeText(value) {
  if (typeof value !== 'string') return value;
  let text = value;
  try {
    text = decodeURIComponent(escape(text));
  } catch (e) {
    // If the string is already valid UTF-8, keep the original text.
  }
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  if (window.innerWidth <= 640) {
    sidebar.classList.toggle('open');
    return;
  }
  document.body.classList.toggle('sidebar-collapsed');
}

window.addEventListener('resize', () => {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  if (window.innerWidth > 640) sidebar.classList.remove('open');
  if (window.innerWidth <= 640) document.body.classList.remove('sidebar-collapsed');
});

async function loadCategorias() {
  try {
    const categorias = await API.Productos.categorias();
    if (!Array.isArray(categorias)) return;

    const buildOptions = includeEmpty => [
      includeEmpty ? '<option value="">Seleccionar...</option>' : '<option value="">Todas las categorías</option>',
      ...categorias.map(c => `<option value="${c.slug}">${normalizeText(c.nombre)}</option>`)
    ].join('');

    const filterSelect = document.getElementById('cat-filter');
    if (filterSelect) filterSelect.innerHTML = buildOptions(false);

    ['np-cat', 'ep-cat'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = buildOptions(true);
    });
  } catch (err) {
    console.warn('No se pudieron cargar categorías:', err);
  }
}

// ── Navegación ──────────────────────────────────────────────
const HOME_PAGE = 'dashboard';

function navigate(pageId, linkEl, event) {
  event?.preventDefault();
  const currentPageId = document.querySelector('.page.active')?.id?.replace(/^page-/,'');
  if ((linkEl?.classList.contains('active') || pageId === currentPageId) && pageId !== HOME_PAGE) {
    pageId = HOME_PAGE;
    linkEl = document.querySelector(`.topbar-menu-item[data-page="${pageId}"]`) || document.querySelector(`.nav-item[data-page="${pageId}"]`);
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.topbar-menu-item').forEach(n => n.classList.remove('active'));

  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');

  if (linkEl) linkEl.classList.add('active');

  const navTarget = document.querySelector(`.nav-item[data-page="${pageId}"]`);
  if (navTarget) navTarget.classList.add('active');

  const topbarTarget = document.querySelector(`.topbar-menu-item[data-page="${pageId}"]`);
  if (topbarTarget) topbarTarget.classList.add('active');

  if (pageId === 'dashboard')  loadDashboard();
  if (pageId === 'productos')  loadProductos();
  if (pageId === 'favoritos')  loadFavoritos();
  if (pageId === 'carrito')    loadCarrito();
  if (pageId === 'pedidos')    loadPedidos();
  if (pageId === 'tickets')    loadTickets();
  if (pageId === 'calendario') loadEventos();
  if (pageId === 'perfil')     loadPerfil();
  if (pageId === 'usuarios')   loadUsuarios();
}

function searchHeaderProducts(value) {
  const query = typeof value === 'string'
    ? value.trim()
    : (document.getElementById('dashboard-search-input')?.value.trim() || '');

  window.clearTimeout(ui.searchDebounceTimer);
  ui.searchDebounceTimer = window.setTimeout(() => {
    const productPageId = 'page-productos';
    const currentPage = document.querySelector('.page.active')?.id;

    const applySearch = () => {
      const searchInput = document.getElementById('search-input');
      if (searchInput) searchInput.value = query;
      filterProductos({ q: query });
    };

    if (currentPage === productPageId) {
      applySearch();
      return;
    }

    navigate('productos', document.querySelector('[data-page=productos]'));
    const waitForSearch = () => {
      const searchInput = document.getElementById('search-input');
      if (searchInput) {
        applySearch();
        return;
      }
      window.requestAnimationFrame(waitForSearch);
    };
    waitForSearch();
  }, 180);
}

function openLowStockProduct(productId) {
  ui.highlightProductId = productId;
  navigate('productos', document.querySelector('[data-page=productos]'));
}

function scrollToProductCard(productId) {
  if (!productId) return;
  const card = document.getElementById('pcard-' + productId);
  if (!card) {
    setTimeout(() => scrollToProductCard(productId), 200);
    return;
  }
  ui.highlightProductId = null;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('product-highlight');
  setTimeout(() => card.classList.remove('product-highlight'), 3200);
}

// ── Dashboard ───────────────────────────────────────────────
async function loadDashboard() {
  try {
    const data = await API.Dashboard.admin();
    const m = data.metricas;

    setText('stat-total',    m.total_productos   || 0);
    setText('stat-usuarios', m.total_usuarios    || 0);
    setText('stat-clientes', m.total_clientes    || 0);
    setText('stat-carrito',  ui.carrito.items?.reduce((s,i)=>s+i.cantidad,0) || 0);
    setText('stat-pedidos',  m.total_pedidos      || 0);
    setText('stat-favs',     ui.favoritos.length  || 0);
    setText('stat-tickets',  m.tickets_abiertos   || 0);

    // Featured products
    const fg = document.getElementById('featured-grid');
    if (fg) fg.innerHTML = (data.top_vendidos || []).slice(0,3).map(p => `
      <div class="featured-card" onclick="navigate('productos',document.querySelector('[data-page=productos]'))">
        <div class="featured-img"><img src="${getImageUrl(p.img_url)}" alt="${normalizeText(p.nombre)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${DEFAULT_IMAGE_URL}'"></div>
        <div class="featured-body">
          <p class="featured-name">${normalizeText(p.nombre)}</p>
          <span class="featured-price">${p.unidades_vendidas} vendidos</span>
          <span class="featured-rating" style="color:var(--green)">$${parseFloat(p.ingresos||0).toFixed(2)}</span>
        </div>
      </div>`).join('') || '<p style="color:var(--text-muted);font-size:0.85rem">Sin ventas aún</p>';

    // Low stock
    const lowStock = Array.isArray(data.low_stock) ? [...data.low_stock].sort((a,b) => a.stock - b.stock) : [];
    const lowStockSummary = document.getElementById('low-stock-summary');
    if (lowStockSummary) lowStockSummary.innerHTML = lowStock.length > 0
      ? `<p class="low-stock-count">${lowStock.length} producto${lowStock.length === 1 ? '' : 's'} en stock crítico</p>`
      : '<p class="low-stock-count" style="color:var(--text-muted)">No hay productos con stock bajo</p>';

    const lsl = document.getElementById('low-stock-list');
    if (lsl) lsl.innerHTML = lowStock.length === 0
      ? '<p style="color:var(--text-muted);font-size:0.85rem">Sin alertas de stock bajo</p>'
      : lowStock.map(p => `
        <div class="low-stock-item" onclick="openLowStockProduct(${p.id})" role="button" title="Ir al producto" tabindex="0">
          <div>
            <p class="low-stock-name">${normalizeText(p.nombre)}</p>
            <p class="low-stock-cat">${normalizeText(p.categoria)}</p>
          </div>
          <div class="low-stock-right">
            <span class="stock-badge">${p.stock} uds.</span>
            <span class="low-stock-action"><i class="fa-solid fa-arrow-right-long"></i></span>
          </div>
        </div>`).join('');
    if (ui.highlightProductId) scrollToProductCard(ui.highlightProductId);

    // Top rated (pedidos recientes como sustituto de top-rated)
    const trl = document.getElementById('top-rated-list');
    if (trl) trl.innerHTML = (data.pedidos_recientes || []).map(o => `
      <div class="top-item">
        <div>
          <p class="top-name">${o.codigo}</p>
          <p class="top-meta" style="color:var(--text-muted)">${o.cliente_nombre}</p>
          <p class="top-price">$${parseFloat(o.total).toFixed(2)}</p>
        </div>
        <span class="order-status status-${o.estado}" style="font-size:0.72rem">${estadoLabel(o.estado)}</span>
      </div>`).join('') || '<p style="color:var(--text-muted);font-size:0.85rem">Sin pedidos aún</p>';

    // Tickets recientes
    renderTicketsDashboard(data.tickets_recientes || []);

    // Cart bar
    const cartQty = ui.carrito.items?.reduce((s,i) => s+i.cantidad, 0) || 0;
    setText('cart-bar-count', cartQty);
    const cartBar = document.getElementById('cart-bar');
    if (cartBar) cartBar.style.display = cartQty > 0 ? 'flex' : 'none';

    updateBadgesFromCache();
  } catch (err) { console.error('loadDashboard admin:', err); }
}

async function loadUsuarios() {
  const content = document.getElementById('usuarios-content'); if (!content) return;
  content.innerHTML = '<p style="color:var(--text-muted);padding:18px"><i class="fa-solid fa-spinner fa-spin"></i> Cargando cuentas...</p>';
  try {
    const data = await API.Auth.usuarios();
    ui.usuarios = data.usuarios || [];
    const totalUsuarios = ui.usuarios.length;
    const totalClientes = ui.usuarios.filter(u => u.rol === 'cliente').length;
    const totalAdmins = ui.usuarios.filter(u => u.rol === 'admin').length;
    content.innerHTML = renderUsuariosPage(ui.usuarios, { totalUsuarios, totalClientes, totalAdmins });
  } catch (err) {
    content.innerHTML = `<p style="color:#ff4060;padding:18px">Error al cargar cuentas: ${err.message}</p>`;
  }
}

function renderUsuariosPage(usuarios, totals) {
  if (!Array.isArray(usuarios) || usuarios.length === 0) {
    return `
      <div class="empty-state"><i class="fa-regular fa-user"></i><p>No hay cuentas registradas aún.</p></div>
    `;
  }

  return `
    <div class="users-summary-grid">
      <div class="stat-card"><div><p class="stat-label">Usuarios totales</p><p class="stat-value">${totals.totalUsuarios}</p></div><div class="stat-icon" style="color:var(--yellow)"><i class="fa-solid fa-users"></i></div></div>
      <div class="stat-card"><div><p class="stat-label">Clientes</p><p class="stat-value">${totals.totalClientes}</p></div><div class="stat-icon" style="color:var(--cyan)"><i class="fa-solid fa-user"></i></div></div>
      <div class="stat-card"><div><p class="stat-label">Admins</p><p class="stat-value">${totals.totalAdmins}</p></div><div class="stat-icon" style="color:var(--magenta)"><i class="fa-solid fa-user-shield"></i></div></div>
    </div>
    <div class="users-table-wrap">
      <table class="users-table">
        <thead>
          <tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Activo</th><th>Registrado</th></tr>
        </thead>
        <tbody>
          ${usuarios.map(u => `
            <tr>
              <td>${u.nombre || '-'}</td>
              <td>${u.email || '-'}</td>
              <td>${capitalize(u.rol)}</td>
              <td>${u.activo ? 'Sí' : 'No'}</td>
              <td>${formatDate(u.created_at)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function capitalize(text) {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ── Tickets dashboard ───────────────────────────────────────
function renderTicketsDashboard(tickets) {
  const w = document.getElementById('dashboard-tickets'); if (!w) return;
  w.innerHTML = tickets.length === 0
    ? '<div class="empty-tickets"><i class="fa-regular fa-ticket-simple"></i><p>No hay tickets activos</p></div>'
    : tickets.map(t => ticketCardHtml(t, true)).join('');
}

async function loadTickets() {
  const list = document.getElementById('tickets-list'); if (!list) return;
  try {
    ui.tickets = await API.Tickets.listar();
    list.innerHTML = ui.tickets.length === 0
      ? '<div class="empty-tickets"><i class="fa-regular fa-ticket-simple"></i><p>No hay tickets</p></div>'
      : ui.tickets.map(t => ticketCardHtml(t, true)).join('');
    updateBadgesFromCache();
  } catch (err) { list.innerHTML = `<p style="color:#ff4060;padding:20px">Error: ${err.message}</p>`; }
}

function ticketCardHtml(t, isAdmin) {
  const lbl = { pending:'Pendiente', open:'Abierto', closed:'Resuelto' };
  const ticketActions = isAdmin
    ? `<div class="ticket-actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
         <button type="button" class="btn-sm btn-cyan" style="font-size:0.75rem;padding:4px 10px" onclick="abrirTicketRespuestas(${t.id})">
           <i class="fa-solid fa-reply"></i> Responder
         </button>
         ${t.estado !== 'closed' ? `<button type="button" class="btn-sm btn-green" style="font-size:0.75rem;padding:4px 10px" onclick="resolverTicket(${t.id})">
           <i class="fa-solid fa-check"></i> Cerrar ticket
         </button>` : ''}
       </div>`
    : '';
  return `<div class="ticket-card status-${t.estado}">
    <div style="flex:1;min-width:200px">
      <span class="ticket-id">${t.codigo}</span>
      ${isAdmin && t.usuario_nombre ? ` <span style="color:var(--text-muted);font-size:0.78rem">· ${t.usuario_nombre}</span>` : ''}
      <p class="ticket-asunto">${t.asunto}</p>
      <p class="ticket-desc">${t.descripcion || ''}</p>
      <p class="ticket-meta">${formatDate(t.created_at)}</p>
      ${ticketActions}
    </div>
    <span class="ticket-badge ${t.estado}"><i class="fa-solid fa-circle" style="font-size:6px"></i> ${lbl[t.estado]||t.estado}</span>
  </div>`;
}

async function abrirTicketRespuestas(ticketId) {
  try {
    const ticket = await API.Tickets.obtener(ticketId);
    ui.ticketActual = ticket;
    renderTicketModal(ticket);
    openModal('modal-ticket-detalle');
  } catch (err) {
    showNeonAlert(err.message, 'error');
  }
}

function renderTicketModal(ticket) {
  const modal = document.getElementById('modal-ticket-detalle');
  if (!modal || !ticket) return;
  const messages = Array.isArray(ticket.mensajes) ? ticket.mensajes : [];
  const messagesHtml = messages.length === 0
    ? '<p style="color:var(--text-muted);font-size:0.9rem">Aún no hay mensajes en este ticket.</p>'
    : messages.map(m => `
        <div class="ticket-message ${m.es_interno ? 'message-admin' : 'message-user'}">
          <div class="ticket-message-header"><strong>${normalizeText(m.autor_nombre || 'Usuario')}</strong><span>${formatDate(m.created_at)}</span></div>
          <div class="ticket-message-body">${normalizeText(m.mensaje)}</div>
        </div>
      `).join('');

  const titleEl = modal.querySelector('.modal-title');
  if (titleEl) titleEl.textContent = 'Responder ticket';
  const subEl = modal.querySelector('.modal-sub');
  if (subEl) subEl.textContent = `Cliente: ${normalizeText(ticket.usuario_nombre || 'Desconocido')} · Estado: ${ticket.estado}`;
  const body = modal.querySelector('.modal-body');
  if (body) {
    body.innerHTML = `
      <div class="ticket-detail-header">
        <span class="ticket-detail-code">${ticket.codigo}</span>
        <p class="ticket-detail-subject">${normalizeText(ticket.asunto)}</p>
        <p class="ticket-detail-meta">${formatDate(ticket.created_at)} · ${normalizeText(ticket.usuario_email || '')}</p>
      </div>
      <div class="ticket-messages">${messagesHtml}</div>
      <div class="form-group"><label>Tu respuesta</label><textarea id="ticket-reply-text" class="modal-input" rows="4" placeholder="Escribe tu respuesta..."></textarea></div>
    `;
  }

  const submitBtn = modal.querySelector('#ticket-reply-submit');
  if (submitBtn) submitBtn.disabled = ticket.estado === 'closed';
  const closeBtn = modal.querySelector('#ticket-close-ticket');
  if (closeBtn) closeBtn.style.display = ticket.estado === 'closed' ? 'none' : 'inline-flex';
}

async function enviarRespuestaTicket() {
  if (!ui.ticketActual) return;
  const textarea = document.getElementById('ticket-reply-text');
  const mensaje = textarea?.value.trim();
  if (!mensaje) { showNeonAlert('Escribe una respuesta antes de enviar', 'error'); return; }
  try {
    await API.Tickets.responder(ui.ticketActual.id, mensaje, false);
    showNeonAlert('Respuesta enviada', 'success');
    if (textarea) textarea.value = '';
    const ticket = await API.Tickets.obtener(ui.ticketActual.id);
    ui.ticketActual = ticket;
    renderTicketModal(ticket);
    await loadTickets(); loadDashboard(); updateBadgesFromCache();
  } catch (err) {
    showNeonAlert(err.message, 'error');
  }
}

async function cerrarTicketDesdeModal() {
  if (!ui.ticketActual) return;
  try {
    await API.Tickets.cambiarEstado(ui.ticketActual.id, 'closed');
    showNeonAlert('Ticket cerrado', 'success');
    closeModal('modal-ticket-detalle');
    await loadTickets(); loadDashboard(); updateBadgesFromCache();
  } catch (err) {
    showNeonAlert(err.message, 'error');
  }
}

async function resolverTicket(id) {
  try {
    await API.Tickets.cambiarEstado(id, 'closed');
    showNeonAlert('Ticket resuelto', 'success');
    await loadTickets(); loadDashboard(); updateBadgesFromCache();
  } catch (err) { showNeonAlert(err.message, 'error'); }
}

// ── Productos ───────────────────────────────────────────────
async function loadProductos(filtros = {}) {
  const grid = document.getElementById('products-grid'); if (!grid) return;
  grid.innerHTML = '<p style="color:var(--text-muted);padding:20px"><i class="fa-solid fa-spinner fa-spin"></i> Cargando...</p>';
  const requestId = ++ui.lastProductosRequestId;
  try {
    const data = await API.Productos.listar(filtros);
    if (requestId !== ui.lastProductosRequestId) return;
    ui.productos = data.data || [];
    grid.innerHTML = ui.productos.length === 0
      ? '<p style="color:var(--text-muted);padding:20px">No se encontraron productos</p>'
      : ui.productos.map(p => buildProductCard(p)).join('');
    if (ui.highlightProductId) scrollToProductCard(ui.highlightProductId);
  } catch (err) { grid.innerHTML = `<p style="color:#ff4060;padding:20px">Error: ${err.message}</p>`; }
}

function buildProductCard(p) {
  const inCart = ui.carrito.items?.some(i => i.producto_id === p.id);
  const inFav  = ui.favoritos.some(f => f.id === p.id);
  const tipoTag  = p.tipo === 'alquiler' ? `<span class="product-tag tag-alquiler">Alquiler</span>` : `<span class="product-tag tag-compra">Compra</span>`;
  const estadoTag = p.estado === 'en-uso' ? `<span class="product-tag tag-en-uso">En uso</span>` : p.estado === 'desuso' ? `<span class="product-tag tag-desuso">Desuso</span>` : '';
  const canBuy = p.tipo !== 'alquiler';
  const canRent = p.tipo !== 'compra';
  const buyLabel = inCart && p.tipo === 'compra' ? 'En carrito' : 'Comprar';
  const rentLabel = inCart && p.tipo === 'alquiler' ? 'En carrito' : 'Alquilar';
  return `<div class="product-card" id="pcard-${p.id}">
    <div class="product-img-wrap">
      <img src="${getImageUrl(p.img_url)}" alt="${normalizeText(p.nombre)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${DEFAULT_IMAGE_URL}'">
      ${p.featured ? '<span class="tag-featured">DESTACADO</span>' : ''}
    </div>
    <div class="product-body">
      <div class="product-tags">${tipoTag}${estadoTag}</div>
      <p class="product-name">${normalizeText(p.nombre)}</p><p class="product-cat">${normalizeText(p.categoria)}</p>
      <p class="product-desc">${normalizeText(p.descripcion || '')}</p>
      ${p.tipo==='alquiler'&&p.fecha_inicio ? `<p class="ticket-meta" style="margin-bottom:4px"><i class="fa-regular fa-calendar" style="color:var(--yellow)"></i> ${p.fecha_inicio}${p.fecha_fin?' → '+p.fecha_fin:''}</p>` : ''}
      <div class="product-price-row"><span class="product-price">$${parseFloat(p.precio).toFixed(2)}</span><span class="product-rating">★ ${p.rating}</span></div>
      <p class="product-stock">Stock: <strong>${p.stock} uds.</strong></p>
      <div class="product-actions">
        <button class="btn-agregar ${inCart?'in-cart':''}" id="btn-cart-${p.id}" onclick="toggleCarritoAdmin(${p.id})">
          <i class="fa-solid fa-cart-shopping"></i> ${inCart ? 'En carrito' : (p.tipo==='alquiler'?'Alquilar':'Agregar')}
        </button>
        <button class="btn-icon fav ${inFav?'fav-active':''}" id="btn-fav-${p.id}" onclick="toggleFavorito(${p.id})" title="Favorito"><i class="fa-${inFav?'solid':'regular'} fa-heart"></i></button>
        <button class="btn-icon edit" onclick="abrirModalEditar(${p.id})" title="Editar"><i class="fa-solid fa-pen"></i></button>
        <button class="btn-icon del"  onclick="eliminarProducto(${p.id})" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>
  </div>`;
}

function filterProductos(options = {}) {
  const sortValue = options.sort || document.getElementById('sort-filter')?.value || 'nombre';
  let sort = sortValue || 'nombre';
  let order = 'asc';
  if (sortValue.includes('-')) {
    [sort, order] = sortValue.split('-');
  } else if (sortValue === 'rating' || sortValue === 'stock') {
    order = 'desc';
  }
  if (!sort) sort = 'nombre';

  const qInput = document.getElementById('search-input')?.value.trim() || '';
  const query = options.q != null ? options.q : qInput;
  const headerInput = document.getElementById('dashboard-search-input');
  const pageSearchInput = document.getElementById('search-input');
  if (headerInput) headerInput.value = query;
  if (pageSearchInput && pageSearchInput.value !== query) pageSearchInput.value = query;
  loadProductos({
    q: query,
    categoria:   options.categoria != null ? options.categoria : document.getElementById('cat-filter')?.value.trim() || '',
    sort,
    order,
    tipo:        options.tipo != null ? options.tipo : document.getElementById('tipo-filter')?.value.trim() || '',
    estado:      options.estado != null ? options.estado : document.getElementById('estado-filter')?.value.trim() || '',
    fecha_desde: options.fecha_desde != null ? options.fecha_desde : document.getElementById('fecha-desde')?.value || '',
    fecha_hasta: options.fecha_hasta != null ? options.fecha_hasta : document.getElementById('fecha-hasta')?.value || '',
  });
}
function resetFiltros() {
  ['search-input','cat-filter','sort-filter','tipo-filter','estado-filter','fecha-desde','fecha-hasta']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = id === 'sort-filter' ? 'nombre' : ''; });
  filterProductos();
}

// ── CRUD Productos ──────────────────────────────────────────
async function crearProducto() {
  const nombre = document.getElementById('np-nombre')?.value.trim();
  const cat    = document.getElementById('np-cat')?.value;
  const desc   = document.getElementById('np-desc')?.value.trim();
  const precio = document.getElementById('np-precio')?.value;
  const stock  = document.getElementById('np-stock')?.value;
  const rating = document.getElementById('np-rating')?.value;
  const img    = document.getElementById('np-img')?.value.trim();
  const feat   = document.getElementById('np-featured')?.value === 'true';
  const tipo   = document.getElementById('np-tipo')?.value || 'compra';
  const estado = document.getElementById('np-estado')?.value || 'activo';
  const fi     = document.getElementById('np-fecha-inicio')?.value;
  const ff     = document.getElementById('np-fecha-fin')?.value;

  if (!nombre || !cat || !precio || !stock)
    { showNeonAlert('Nombre, categoría, precio y stock son obligatorios', 'error'); return; }

  try {
    await API.Productos.crear({
      nombre, categoria_slug: cat, descripcion: desc, precio: parseFloat(precio),
      stock: parseInt(stock), rating: parseFloat(rating)||5, img_url: img,
      featured: feat, tipo, estado, fecha_inicio: fi||null, fecha_fin: ff||null
    });
    showNeonAlert(`"${nombre}" creado correctamente`, 'success');
    closeModal('modal-nuevo-producto');
    ['np-nombre','np-cat','np-desc','np-precio','np-stock','np-img','np-fecha-inicio','np-fecha-fin']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value=''; });
    if(document.getElementById('np-rating')) document.getElementById('np-rating').value = '5';
    if(document.getElementById('np-featured')) document.getElementById('np-featured').value = 'false';
    await loadProductos(); loadDashboard();
  } catch (err) { showNeonAlert(err.message, 'error'); }
}

async function abrirModalEditar(id) {
  const p = ui.productos.find(x => x.id === id); if (!p) return;
  const set = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val ?? ''; };
  set('ep-id', p.id);
  set('ep-nombre', normalizeText(p.nombre));
  set('ep-cat', p.categoria_slug || normalizeText(p.categoria));
  set('ep-desc', normalizeText(p.descripcion||''));
  set('ep-precio', p.precio);
  set('ep-stock', p.stock);
  set('ep-rating', p.rating);
  set('ep-img', p.img_url||'');
  set('ep-featured', p.featured ? 'true' : 'false');
  set('ep-tipo', p.tipo||'compra');
  set('ep-estado', p.estado||'activo');
  set('ep-fecha-inicio', p.fecha_inicio||'');
  set('ep-fecha-fin', p.fecha_fin||'');
  openModal('modal-editar-producto');
}

async function guardarEdicion() {
  const id = parseInt(document.getElementById('ep-id')?.value);
  const get = id => document.getElementById(id)?.value;
  try {
    await API.Productos.actualizar(id, {
      nombre:        get('ep-nombre'),
      categoria_slug:get('ep-cat'),
      descripcion:   get('ep-desc'),
      precio:        parseFloat(get('ep-precio')),
      stock:         parseInt(get('ep-stock')),
      rating:        parseFloat(get('ep-rating')),
      img_url:       get('ep-img'),
      featured:      get('ep-featured') === 'true',
      tipo:          get('ep-tipo'),
      estado:        get('ep-estado'),
      fecha_inicio:  get('ep-fecha-inicio') || null,
      fecha_fin:     get('ep-fecha-fin')    || null,
    });
    showNeonAlert('Producto actualizado', 'success');
    closeModal('modal-editar-producto');
    ui.highlightProductId = id;
    navigate('productos', document.querySelector('[data-page=productos]'));
    loadDashboard();
  } catch (err) { showNeonAlert(err.message, 'error'); }
}

async function eliminarProducto(id) {
  const p = ui.productos.find(x => x.id === id);
  if (!confirm(`¿Eliminar "${p?.nombre}"?`)) return;
  try {
    await API.Productos.eliminar(id);
    showNeonAlert(`"${p?.nombre}" eliminado`, 'info');
    await loadProductos(); loadDashboard();
  } catch (err) { showNeonAlert(err.message, 'error'); }
}

// ── Carrito Admin ───────────────────────────────────────────
async function loadCarrito() {
  const wrap = document.getElementById('carrito-wrap'); const empty = document.getElementById('empty-cart');
  try {
    const data = await API.Carrito.obtener(); ui.carrito = data;
    if (!data.items || data.items.length === 0) {
      if (wrap) wrap.style.display = 'none'; if (empty) empty.style.display = 'block'; return;
    }
    if (empty) empty.style.display = 'none'; if (wrap) wrap.style.display = 'grid';
    const cl = document.getElementById('cart-col-left'); const cr = document.getElementById('cart-col-right');
    if (cl) cl.innerHTML = `
      <p class="cart-items-count">${data.items.reduce((s,i)=>s+i.cantidad,0)} producto(s)</p>
      ${data.items.map(item => `<div class="cart-item-v2">
        <div class="cart-item-img"><img src="${getImageUrl(item.img_url)}" alt="${normalizeText(item.nombre)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${DEFAULT_IMAGE_URL}'"></div>
        <div class="cart-item-info" style="flex:1"><p class="cart-item-name">${normalizeText(item.nombre)}</p><p class="cart-item-cat">${normalizeText(item.categoria)}</p></div>
        <div class="qty-ctrl">
          <button class="qty-btn" onclick="cambiarCantidad(${item.producto_id},${item.cantidad-1})">−</button>
          <span class="qty-val">${item.cantidad}</span>
          <button class="qty-btn" onclick="cambiarCantidad(${item.producto_id},${item.cantidad+1})">+</button>
          <span class="cart-max-label">Máx ${item.stock}</span>
        </div>
        <div style="text-align:right;min-width:80px">
          <p class="cart-item-subtotal">$${parseFloat(item.subtotal).toFixed(2)}</p>
          <p class="cart-unit-price">$${parseFloat(item.precio).toFixed(2)} c/u</p>
        </div>
        <button class="btn-icon del" onclick="quitarDelCarrito(${item.producto_id})" style="margin-left:4px"><i class="fa-solid fa-trash"></i></button>
      </div>`).join('')}`;
    if (cr) cr.innerHTML = `<div class="cart-summary-v2">
      <p class="cart-summary-title">Resumen del Pedido</p>
      ${data.items.map(i=>`<div class="summary-row"><span class="lbl">${i.nombre} ×${i.cantidad}</span><span class="val">$${parseFloat(i.subtotal).toFixed(2)}</span></div>`).join('')}
      <div class="summary-row" style="margin-top:8px"><span class="lbl">Subtotal</span><span class="val">$${parseFloat(data.subtotal).toFixed(2)}</span></div>
      <div class="summary-row"><span class="lbl">Envío</span><span class="val free">GRATIS</span></div>
      <div class="summary-row"><span class="lbl">Impuestos (19%)</span><span class="val">$${parseFloat(data.impuestos).toFixed(2)}</span></div>
      <div class="summary-total"><span class="lbl">Total</span><span class="val">$${parseFloat(data.total).toFixed(2)}</span></div>
      <button class="btn-checkout" onclick="checkout()"><i class="fa-solid fa-credit-card"></i> Proceder al Pago</button>
      <button class="btn-seguir" onclick="navigate('productos',document.querySelector('[data-page=productos]'))">← Seguir Comprando</button>
      <button class="btn-sm btn-danger" style="width:100%;margin-top:8px;justify-content:center" onclick="vaciarCarrito()"><i class="fa-solid fa-trash"></i> Vaciar Carrito</button>
    </div>`;
    updateBadgesFromCache();
  } catch (err) { showNeonAlert('Error al cargar el carrito', 'error'); }
}

async function toggleCarritoAdmin(productoId) {
  const inCart = ui.carrito.items?.some(i => i.producto_id === productoId);
  const p = ui.productos.find(x => x.id === productoId);
  try {
    if (inCart) { await API.Carrito.quitar(productoId); showNeonAlert(`"${p?.nombre}" removido`, 'info'); }
    else { await API.Carrito.agregar(productoId, 1); showNeonAlert(`"${p?.nombre}" agregado`, 'success'); }
    await loadCarrito();
    const btn = document.getElementById('btn-cart-' + productoId);
    if (btn) { const ic = ui.carrito.items?.some(i=>i.producto_id===productoId); btn.innerHTML=`<i class="fa-solid fa-cart-shopping"></i> ${ic?'En carrito':(p?.tipo==='alquiler'?'Alquilar':'Agregar')}`; }
    updateBadgesFromCache(); loadDashboard();
  } catch (err) { showNeonAlert(err.message, 'error'); }
}

async function cambiarCantidad(id, qty) {
  if (qty < 1) { await quitarDelCarrito(id); return; }
  try { await API.Carrito.actualizar(id, qty); await loadCarrito(); } catch (err) { showNeonAlert(err.message,'error'); }
}
async function quitarDelCarrito(id) {
  try { await API.Carrito.quitar(id); showNeonAlert('Removido','info'); await loadCarrito(); updateBadgesFromCache(); loadDashboard(); }
  catch (err) { showNeonAlert(err.message,'error'); }
}
async function vaciarCarrito() {
  if (!confirm('¿Vaciar el carrito?')) return;
  try { await API.Carrito.vaciar(); showNeonAlert('Carrito vaciado','info'); await loadCarrito(); loadDashboard(); }
  catch (err) { showNeonAlert(err.message,'error'); }
}
async function checkout() {
  const user = Auth.getUser();
  try {
    const result = await API.Pedidos.checkout(user?.direccion || '');
    showNeonAlert(`¡${result.message} Total: $${parseFloat(result.pedido.total).toFixed(2)}`, 'success');
    await Promise.all([loadCarrito(), loadPedidos(), loadDashboard()]);
    navigate('pedidos', document.querySelector('[data-page=pedidos]'));
  } catch (err) { showNeonAlert(err.message,'error'); }
}

// ── Favoritos ───────────────────────────────────────────────
async function loadFavoritos() {
  const grid=document.getElementById('favorites-grid'); const empty=document.getElementById('empty-fav'); const bar=document.getElementById('favs-total-bar');
  try {
    const data = await API.Favoritos.obtener(); ui.favoritos = data.items || [];
    if (ui.favoritos.length === 0) { if(grid)grid.innerHTML=''; if(empty)empty.style.display='block'; if(bar)bar.style.display='none'; return; }
    if(empty)empty.style.display='none';
    if(bar){bar.style.display='flex';setText('favs-count',ui.favoritos.length);setText('favs-valor','$'+parseFloat(data.total_valor||0).toFixed(2));}
    if(grid)grid.innerHTML=ui.favoritos.map(p=>buildProductCard(p)).join('');
  } catch(err){if(grid)grid.innerHTML=`<p style="color:#ff4060;padding:20px">Error: ${err.message}</p>`;}
}
async function toggleFavorito(id) {
  const inFav=ui.favoritos.some(f=>f.id===id); const p=ui.productos.find(x=>x.id===id);
  try {
    if(inFav){await API.Favoritos.quitar(id);ui.favoritos=ui.favoritos.filter(f=>f.id!==id);showNeonAlert(`"${p?.nombre}" removido de favoritos`,'info');}
    else{await API.Favoritos.agregar(id);if(p)ui.favoritos.push(p);showNeonAlert(`"${p?.nombre}" añadido a favoritos`,'success');}
    const btn=document.getElementById('btn-fav-'+id);
    if(btn){const nf=ui.favoritos.some(f=>f.id===id);btn.className=`btn-icon fav ${nf?'fav-active':''}`;btn.innerHTML=`<i class="fa-${nf?'solid':'regular'} fa-heart"></i>`;}
    updateBadgesFromCache();
  } catch(err){showNeonAlert(err.message,'error');}
}

// ── Pedidos Admin ───────────────────────────────────────────
async function loadPedidos() {
  const list=document.getElementById('orders-list'); if(!list) return;
  list.innerHTML='<p style="color:var(--text-muted);padding:20px"><i class="fa-solid fa-spinner fa-spin"></i> Cargando pedidos...</p>';
  try {
    ui.pedidos = await API.Pedidos.listar();
    if(!ui.pedidos||ui.pedidos.length===0){list.innerHTML='<div class="empty-state"><i class="fa-solid fa-clipboard-list" style="font-size:3rem;color:var(--yellow);margin-bottom:16px;"></i><p>No hay pedidos</p></div>';return;}
    list.innerHTML=ui.pedidos.map(o=>buildOrderCard(o,true)).join('');
  } catch(err){list.innerHTML=`<p style="color:#ff4060;padding:20px">Error: ${err.message}</p>`;}
}

function buildOrderCard(o, isAdmin) {
  const lineas=(o.lineas||[]).map(l=>`<div class="order-line-item"><div><p class="order-line-name">${l.nombre}</p><p class="order-line-qty">Cantidad: ${l.cantidad}</p></div><span class="order-line-price">$${parseFloat(l.subtotal||l.precio*l.cantidad).toFixed(2)}</span></div>`).join('');
  const sel=isAdmin?`<select class="order-status-select" onchange="cambiarEstadoPedido(${o.id},this.value)"><option value="pending" ${o.estado==='pending'?'selected':''}>Pendiente</option><option value="transit" ${o.estado==='transit'?'selected':''}>En Camino</option><option value="delivered" ${o.estado==='delivered'?'selected':''}>Entregado</option><option value="cancelled" ${o.estado==='cancelled'?'selected':''}>Cancelado</option></select>`:`<span class="order-status status-${o.estado}">${estadoLabel(o.estado)}</span>`;
  return `<div class="order-card-v2"><div class="order-header-v2"><span class="order-id-v2">${o.codigo}</span><span class="order-status status-${o.estado}">${estadoLabel(o.estado)}</span>${o.cliente_nombre?`<span class="order-client" style="margin-left:8px">· ${o.cliente_nombre}</span>`:''}<div style="flex:1"></div>${sel}</div><p class="order-date-v2">Creado: ${formatDate(o.created_at)}</p>${o.updated_at?`<p class="order-updated">Última actualización: ${formatDate(o.updated_at)}</p>`:''}<div class="order-items-section" style="margin-top:14px"><p class="order-items-label">Artículos</p>${lineas}</div>${o.direccion_envio?`<div class="order-detail-row"><p class="order-detail-lbl"><i class="fa-solid fa-location-dot"></i> Dirección</p><p class="order-detail-val">${o.direccion_envio}</p></div>`:''} ${o.numero_seguimiento?`<div class="order-detail-row"><p class="order-detail-lbl"><i class="fa-solid fa-truck"></i> Seguimiento</p><p class="order-detail-val">${o.numero_seguimiento}</p></div>`:''}<div class="order-total-v2"><span>Total</span><span class="amt">$${parseFloat(o.total).toFixed(2)}</span></div></div>`;
}

async function cambiarEstadoPedido(id, estado) {
  try { await API.Pedidos.cambiarEstado(id, estado); showNeonAlert(`Pedido → ${estadoLabel(estado)}`, 'success'); }
  catch (err) { showNeonAlert(err.message, 'error'); }
}

// ── Calendario ──────────────────────────────────────────────
async function loadEventos() {
  try { ui.eventos = await API.Eventos.listar(ui.calendarYear, ui.calendarMonth + 1); }
  catch (err) { ui.eventos = []; }
  renderCalendar();
}
function renderCalendar() {
  const main=document.getElementById('calendar-main-wrap'); if(!main) return;
  const y=ui.calendarYear, m=ui.calendarMonth;
  const monthNames=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const dayNames=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']; const today=new Date();
  const firstDay=new Date(y,m,1).getDay(); const daysInMonth=new Date(y,m+1,0).getDate(); const daysInPrev=new Date(y,m,0).getDate();
  const eventDays=ui.eventos.map(ev=>new Date(ev.fecha_hora).getDate());
  const headers=dayNames.map(d=>`<div class="cal-day-header">${d}</div>`).join('');
  let cells='';
  for(let i=firstDay-1;i>=0;i--) cells+=`<div class="cal-day other-month">${daysInPrev-i}</div>`;
  for(let d=1;d<=daysInMonth;d++){const it=d===today.getDate()&&m===today.getMonth()&&y===today.getFullYear();const he=eventDays.includes(d);cells+=`<div class="cal-day${it?' today':''}${he?' has-event':''}" onclick="abrirEventoDia(${y},${m+1},${d})">${d}</div>`;}
  const rem=42-firstDay-daysInMonth; for(let d=1;d<=rem;d++) cells+=`<div class="cal-day other-month">${d}</div>`;
  main.innerHTML=`<div class="cal-header"><button class="cal-nav-btn" onclick="changeMonth(-1)">‹</button><span class="cal-title" style="color:var(--green)">${monthNames[m]} ${y}</span><button class="cal-nav-btn" onclick="changeMonth(1)">›</button></div><div class="cal-grid">${headers}${cells}</div>`;
  renderEventPanel();
}
function changeMonth(delta){ui.calendarMonth+=delta;if(ui.calendarMonth>11){ui.calendarMonth=0;ui.calendarYear++;}if(ui.calendarMonth<0){ui.calendarMonth=11;ui.calendarYear--;}loadEventos();}
function abrirNuevoEvento(){
  ui.eventoEditandoId = null;
  const titulo = document.getElementById('ev-titulo');
  const desc = document.getElementById('ev-desc');
  const tipo = document.getElementById('ev-tipo');
  const fecha = document.getElementById('ev-fecha');
  if (titulo) titulo.value = '';
  if (desc) desc.value = '';
  if (tipo) tipo.value = 'Evento';
  const publicoSelect = document.getElementById('ev-publico');
  if (publicoSelect) publicoSelect.value = 'true';
  if (fecha) {
    const now = new Date();
    fecha.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}T${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  }
  setModalEventoState('Nuevo Evento','Crear',false);
  openModal('modal-nuevo-evento');
}
function renderEventPanel(){
  const panel=document.getElementById('eventos-list'); if(!panel) return;
  if(!ui.eventos||ui.eventos.length===0){panel.innerHTML='<div class="no-events"><i class="fa-regular fa-calendar-xmark"></i><p>No hay eventos próximos</p></div>';return;}
  panel.innerHTML=ui.eventos.map(ev=>{const d=new Date(ev.fecha_hora);return`<div class="event-item tipo-${ev.tipo.toLowerCase()}" onclick="editarEvento(${ev.id})" style="cursor:pointer"><p class="event-title">${ev.titulo}</p><p class="event-meta">${d.toLocaleDateString('es-CO',{day:'2-digit',month:'short'})}, ${d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}</p>${ev.descripcion?`<p class="event-meta">${ev.descripcion}</p>`:''}<span class="event-type-badge">${ev.tipo}</span><span class="event-visibility-badge ${ev.publico ? 'public' : 'private'}">${ev.publico ? 'Público' : 'Privado'}</span></div>`;}).join('');
}
function abrirEventoDia(y,m,d){
  ui.eventoEditandoId = null;
  setModalEventoState('Nuevo Evento','Crear',false);
  const titulo = document.getElementById('ev-titulo');
  const desc = document.getElementById('ev-desc');
  const tipo = document.getElementById('ev-tipo');
  const fi = document.getElementById('ev-fecha');
  if (titulo) titulo.value = '';
  if (desc) desc.value = '';
  if (tipo) tipo.value = 'Evento';
  const publicoSelect = document.getElementById('ev-publico');
  if (publicoSelect) publicoSelect.value = 'true';
  if (fi) fi.value = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T10:00`;
  openModal('modal-nuevo-evento');
}
async function guardarEvento(){
  if (ui.eventoEditandoId) return actualizarEvento();
  return crearEvento();
}
async function crearEvento(){
  const titulo=document.getElementById('ev-titulo')?.value.trim();const desc=document.getElementById('ev-desc')?.value.trim();
  const fecha=document.getElementById('ev-fecha')?.value;const tipo=document.getElementById('ev-tipo')?.value||'Evento';
  const publico = document.getElementById('ev-publico')?.value === 'true';
  if(!titulo||!fecha){showNeonAlert('Título y fecha son obligatorios','error');return;}
  try{await API.Eventos.crear(titulo,desc,fecha,tipo,publico);document.getElementById('ev-titulo').value='';document.getElementById('ev-desc').value='';document.getElementById('ev-fecha').value='';closeModal('modal-nuevo-evento');showNeonAlert(`Evento "${titulo}" creado`,'success');await loadEventos();}
  catch(err){showNeonAlert(err.message,'error');}
}
async function editarEvento(id){
  const event = ui.eventos.find(ev => ev.id === id);
  if (!event) return showNeonAlert('Evento no encontrado','error');
  ui.eventoEditandoId = id;
  document.getElementById('ev-titulo').value = event.titulo || '';
  document.getElementById('ev-desc').value = event.descripcion || '';
  document.getElementById('ev-fecha').value = event.fecha_hora ? event.fecha_hora.slice(0,16) : '';
  document.getElementById('ev-tipo').value = event.tipo || 'Evento';
  document.getElementById('ev-publico').value = event.publico ? 'true' : 'false';
  setModalEventoState('Editar Evento','Guardar',true);
  openModal('modal-nuevo-evento');
}
async function actualizarEvento(){
  const id = ui.eventoEditandoId;
  if (!id) return crearEvento();
  const titulo=document.getElementById('ev-titulo')?.value.trim();const desc=document.getElementById('ev-desc')?.value.trim();
  const fecha=document.getElementById('ev-fecha')?.value;const tipo=document.getElementById('ev-tipo')?.value||'Evento';
  const publico = document.getElementById('ev-publico')?.value === 'true';
  if(!titulo||!fecha){showNeonAlert('Título y fecha son obligatorios','error');return;}
  try{await API.Eventos.actualizar(id,{titulo,descripcion:desc,fecha_hora:fecha,tipo,publico});closeModal('modal-nuevo-evento');showNeonAlert(`Evento "${titulo}" actualizado`,'success');ui.eventoEditandoId = null;await loadEventos();}
  catch(err){showNeonAlert(err.message,'error');}
}
async function eliminarEvento(){
  const id = ui.eventoEditandoId;
  if (!id) return;
  try{await API.Eventos.eliminar(id);closeModal('modal-nuevo-evento');showNeonAlert('Evento eliminado','success');ui.eventoEditandoId = null;await loadEventos();}
  catch(err){showNeonAlert(err.message,'error');}
}
function setModalEventoState(title, buttonLabel, showDelete){
  const modalTitle = document.getElementById('ev-modal-title');
  const submitBtn = document.getElementById('ev-submit-btn');
  const deleteBtn = document.getElementById('ev-delete-btn');
  if (modalTitle) modalTitle.textContent = title;
  if (submitBtn) {
    submitBtn.innerHTML = `<i class="fa-solid ${buttonLabel === 'Crear' ? 'fa-calendar-plus' : 'fa-floppy-disk'}"></i> ${buttonLabel}`;
    submitBtn.className = `btn-sm ${buttonLabel === 'Crear' ? 'btn-yellow' : 'btn-cyan'}`;
  }
  if (deleteBtn) deleteBtn.style.display = showDelete ? 'inline-flex' : 'none';
}

// ── Perfil Admin ────────────────────────────────────────────
async function loadPerfil() {
  const card=document.getElementById('perfil-card'); if(!card) return;
  try{const user=await API.Auth.me();renderPerfilCard(user);}catch{renderPerfilCard(Auth.getUser()||{});}
}
function renderPerfilCard(user) {
  window._perfilData=user;
  const card=document.getElementById('perfil-card'); if(!card) return;
  const editing=ui.editandoPerfil;
  const fields=['nombre','email','telefono','direccion'];
  const icons={nombre:'fa-solid fa-user',email:'fa-regular fa-envelope',telefono:'fa-solid fa-phone',direccion:'fa-solid fa-location-dot'};
  const labels={nombre:'Nombre completo',email:'Email',telefono:'Teléfono',direccion:'Dirección'};
  card.innerHTML=`
    <div class="profile-header-v2">
      <div class="profile-avatar avatar-wrap" onclick="openModal('modal-avatar')" style="cursor:pointer;position:relative">
        ${user.avatar_url?`<img class="avatar-img" src="${user.avatar_url}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:2px solid rgba(0,245,255,0.4);">`:`<i class="fa-solid fa-user" style="font-size:2rem;color:var(--cyan);width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,rgba(0,245,255,0.15),rgba(255,0,200,0.15));border:2px solid rgba(0,245,255,0.3);display:flex;align-items:center;justify-content:center;"></i>`}
        <button class="avatar-edit-btn" onclick="openModal('modal-avatar')"><i class="fa-solid fa-camera"></i></button>
      </div>
      <div><p class="profile-name-v2">${user.nombre||''}</p><span class="profile-role-badge role-admin">Administrador</span></div>
      <button class="btn-edit-profile" onclick="ui.editandoPerfil=!ui.editandoPerfil;renderPerfilCard(window._perfilData)">${editing?'Cancelar':"<i class='fa-solid fa-pen'></i> Editar Perfil"}</button>
    </div>
    ${fields.map(f=>`<div class="profile-field ${editing?'editing':''}"><i class="${icons[f]}"></i><div class="profile-field-inner"><p class="profile-field-label">${labels[f]}</p>${editing?`<input id="pf-${f}" value="${user[f]||''}" class="modal-input" style="padding:0;background:none;border:none;font-size:0.9rem">`:`<p class="profile-field-val">${user[f]||'—'}</p>`}</div></div>`).join('')}
    ${editing?`<div class="profile-edit-actions"><button class="btn-save-profile" onclick="guardarPerfil()"><i class="fa-solid fa-floppy-disk"></i> Guardar Cambios</button><button class="btn-cancel-edit" onclick="ui.editandoPerfil=false;renderPerfilCard(window._perfilData)">Cancelar</button></div>`:`<div class="profile-bottom-v2"><div class="profile-bottom-item"><p class="lbl">Total Productos</p><p class="val">${ui.productos.length}</p></div><div class="profile-bottom-item"><p class="lbl">Favoritos</p><p class="val">${ui.favoritos.length}</p></div><div class="profile-bottom-item"><p class="lbl">Rol de usuario</p><p class="val role-val">Admin</p></div></div>`}`;
}
function getPerfilStats() {
  const pedidos = ui.pedidos?.length || 0;
  const favoritos = ui.favoritos?.length || 0;
  const cartQty = ui.carrito.items?.reduce((s,i)=>s+i.cantidad,0) || 0;
  const totalGastado = ui.dashboard?.metricas?.total_gastado || 0;
  return { pedidos, favoritos, cartQty, totalGastado };
}

async function guardarPerfil(){
  try{
    const updated = await API.Auth.updatePerfil({
      nombre: document.getElementById('pf-nombre')?.value,
      telefono: document.getElementById('pf-telefono')?.value,
      direccion: document.getElementById('pf-direccion')?.value
    });
    ui.editandoPerfil = false;
    renderPerfilCard(updated);
    setText('admin-display-name', updated?.nombre || 'Admin');
    renderTopbarAvatar(updated);
    showNeonAlert('Perfil actualizado','success');
  } catch(err) { showNeonAlert(err.message,'error'); }
}

// ── Avatar ──────────────────────────────────────────────────
function initAvatarModal(){
  document.querySelectorAll('.avatar-tab').forEach(tab=>{tab.addEventListener('click',()=>{document.querySelectorAll('.avatar-tab').forEach(t=>t.classList.remove('active'));document.querySelectorAll('.avatar-tab-content').forEach(c=>c.classList.remove('active'));tab.classList.add('active');const tgt=document.getElementById('tab-'+tab.dataset.tab);if(tgt)tgt.classList.add('active');});});
  const dz=document.getElementById('avatar-drop-zone');const fi=document.getElementById('avatar-file-input');
  if(dz){dz.addEventListener('click',()=>fi&&fi.click());dz.addEventListener('dragover',e=>{e.preventDefault();dz.style.borderColor='var(--cyan)';});dz.addEventListener('dragleave',()=>{dz.style.borderColor='';});dz.addEventListener('drop',e=>{e.preventDefault();dz.style.borderColor='';if(e.dataTransfer.files[0])processAvatarFile(e.dataTransfer.files[0]);});}
  if(fi)fi.addEventListener('change',e=>{if(e.target.files[0])processAvatarFile(e.target.files[0]);});
}
function processAvatarFile(file){if(!file.type.startsWith('image/')){showNeonAlert('Solo imágenes','error');return;}const r=new FileReader();r.onload=e=>{showAvatarPreview(e.target.result);window._pendingAvatar=e.target.result;};r.readAsDataURL(file);}
function previewAvatarUrl(){const url=document.getElementById('avatar-url-input')?.value.trim();if(!url){showNeonAlert('URL inválida','error');return;}showAvatarPreview(url);window._pendingAvatar=url;}
function showAvatarPreview(src){const w=document.getElementById('avatar-preview-wrap');if(!w)return;w.innerHTML=`<img src="${src}" alt="Vista previa">`;w.style.display='flex';}
async function guardarAvatar(){
  if(!window._pendingAvatar){showNeonAlert('Selecciona una imagen','error');return;}
  try{
    const updated = await API.Auth.updatePerfil({ avatar_url: window._pendingAvatar });
    window._pendingAvatar = null;
    closeModal('modal-avatar');
    showNeonAlert('Avatar actualizado','success');
    if (window._perfilData) {
      window._perfilData.avatar_url = updated.avatar_url;
      renderPerfilCard(window._perfilData);
    }
    renderTopbarAvatar(updated);
  } catch(err) { showNeonAlert(err.message,'error'); }
}

// ── Helpers ─────────────────────────────────────────────────
function estadoLabel(e){return{pending:'Pendiente',transit:'En Camino',delivered:'Entregado',cancelled:'Cancelado'}[e]||e;}
function formatDate(iso){if(!iso)return'';return new Date(iso).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'});}
function updateBadgesFromCache(){
  const cq=ui.carrito.items?.reduce((s,i)=>s+i.cantidad,0)||0;const fq=ui.favoritos.length;const tq=ui.tickets.filter(t=>t.estado!=='closed').length;
  const bc=document.getElementById('badge-cart');const bf=document.getElementById('badge-fav');const bt=document.getElementById('badge-tickets');
  if(bc){bc.textContent=cq;bc.style.display=cq?'':'none';}if(bf){bf.textContent=fq;bf.style.display=fq?'':'none';}if(bt){bt.textContent=tq;bt.style.display=tq?'':'none';}
  setText('stat-carrito',cq); setText('stat-favs',fq);
}
function setText(id,val){const el=document.getElementById(id);if(el)el.textContent=val;}
function openModal(id){const el=document.getElementById(id);if(el)el.classList.add('open');}
function closeModal(id){const el=document.getElementById(id);if(el)el.classList.remove('open');}
function closeModalOutside(e,id){if(e.target.id===id)closeModal(id);}
function showNeonAlert(msg,type='info'){const icons={success:'✓',error:'✕',info:'ℹ'};const el=document.getElementById('neonAlert');if(!el)return;el.className=`neon-alert ${type}`;el.innerHTML=`<span>${icons[type]||'•'}</span> ${msg}`;el.style.display='flex';el.offsetHeight;el.classList.add('show');clearTimeout(el._timer);el._timer=setTimeout(()=>{el.classList.remove('show');setTimeout(()=>{el.style.display='none';},400);},3500);}
