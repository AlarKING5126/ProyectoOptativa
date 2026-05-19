// ============================================================
//  DEPORTES NEON — Dashboard Cliente (conectado a API)
// ============================================================

(function authGuard() {
  if (!Auth.isLoggedIn()) { window.location.href = 'index.html'; return; }
  const u = Auth.getUser();
  if (u?.rol === 'admin') { window.location.href = 'dashboard.html'; }
})();

const ui = {
  calendarYear: new Date().getFullYear(), calendarMonth: new Date().getMonth(),
  editandoPerfil: false,
  productos: [], carrito: { items: [], subtotal: 0, impuestos: 0, total: 0 },
  carritoLoaded: false,
  favoritos: [], pedidos: [], tickets: [], eventos: [], dashboard: null,
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
  setText('user-display-name', cached?.nombre || 'Usuario');
  renderTopbarAvatar(cached);
  try {
    const fresh = await API.Auth.me();
    if (fresh) {
      Auth.setUser(fresh);
      setText('user-display-name', fresh.nombre || 'Usuario');
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
function truncateText(value, length = 80) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > length ? trimmed.slice(0, length).trim() + '...' : trimmed;
}
async function loadCategorias() {
  try {
    const categorias = await API.Productos.categorias();
    if (!Array.isArray(categorias)) return;

    const buildOptions = () => [
      '<option value="">Todas las categorías</option>',
      ...categorias.map(c => `<option value="${c.slug}">${normalizeText(c.nombre)}</option>`)
    ].join('');

    const filterSelect = document.getElementById('cat-filter');
    if (filterSelect) filterSelect.innerHTML = buildOptions();
  } catch (err) {
    console.warn('No se pudieron cargar categorías:', err);
  }
}

const HOME_PAGE = 'inicio';

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
  if (window.innerWidth <= 640) {
    document.getElementById('sidebar')?.classList.remove('open');
    document.querySelector('.topbar-menu')?.classList.remove('open');
  }
  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');
  if (linkEl) linkEl.classList.add('active');

  const navTarget = document.querySelector(`.nav-item[data-page="${pageId}"]`);
  if (navTarget) navTarget.classList.add('active');

  const topbarTarget = document.querySelector(`.topbar-menu-item[data-page="${pageId}"]`);
  if (topbarTarget) topbarTarget.classList.add('active');

  if (pageId === 'inicio')    loadDashboard();
  if (pageId === 'tienda')    loadProductos();
  if (pageId === 'favoritos') loadFavoritos();
  if (pageId === 'carrito')   loadCarrito();
  if (pageId === 'pedidos')   loadPedidos();
  if (pageId === 'tickets')   loadTickets();
  if (pageId === 'calendario') loadEventos();
  if (pageId === 'perfil')    loadPerfil();
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

function toggleTopbarMenu() {
  const menu = document.querySelector('.topbar-menu');
  if (!menu) return;
  menu.classList.toggle('open');
}

window.addEventListener('resize', () => {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  if (window.innerWidth > 640) sidebar.classList.remove('open');
  if (window.innerWidth <= 640) document.body.classList.remove('sidebar-collapsed');
});

function searchHeaderProducts(value) {
  const query = typeof value === 'string'
    ? value.trim()
    : (document.getElementById('dashboard-search-input')?.value.trim() || '');

  window.clearTimeout(ui.searchDebounceTimer);
  ui.searchDebounceTimer = window.setTimeout(() => {
    const productPageId = 'page-tienda';
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

    navigate('tienda', document.querySelector('[data-page=tienda]'));
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

// ── Dashboard ──────────────────────────────────────────────
async function loadDashboard() {
  try {
    const data = await API.Dashboard.cliente(); ui.dashboard = data;
    const m = data.metricas;
    setText('stat-carrito', m.items_carrito || 0); setText('stat-favs', m.total_favoritos || 0);
    setText('stat-pedidos', m.total_pedidos || 0); setText('stat-gastado', '$' + parseFloat(m.total_gastado || 0).toFixed(2));
    setText('stat-tickets', m.tickets_abiertos || 0);
    const fg = document.getElementById('featured-grid');
    if (fg) fg.innerHTML = data.destacados.map(p => `
      <div class="featured-card" onclick="navigate('tienda',document.querySelector('[data-page=tienda]'))">
        <div class="featured-img"><img src="${getImageUrl(p.img_url)}" alt="${normalizeText(p.nombre)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${DEFAULT_IMAGE_URL}'"></div>
        <div class="featured-body"><p class="featured-name">${normalizeText(p.nombre)}</p><span class="featured-price">$${parseFloat(p.precio).toFixed(2)}</span><span class="featured-rating">★ ${p.rating}</span></div>
      </div>`).join('');
    const it = document.getElementById('inicio-tickets');
    if (it) it.innerHTML = data.tickets_abiertos.length === 0
      ? '<div class="empty-tickets"><i class="fa-regular fa-ticket-simple"></i><p>No tienes tickets abiertos</p></div>'
      : data.tickets_abiertos.map(t => ticketCardHtml(t)).join('');
    const cartQty = parseInt(m.items_carrito || 0);
    setText('cart-bar-count', cartQty);
    const cartBar = document.getElementById('cart-bar');
    if (cartBar) cartBar.style.display = cartQty > 0 ? 'flex' : 'none';
    setText('cart-bar-total', '$' + parseFloat(ui.carrito.total || 0).toFixed(2));

    const trl = document.getElementById('top-rated-list');
    if (trl) trl.innerHTML = (data.top_vendidos || []).map(p => `
      <div class="top-item">
        <div>
          <p class="top-name">${normalizeText(p.nombre)}</p>
          <p class="top-price">${p.unidades_vendidas} vendidos</p>
        </div>
        <span class="featured-rating" style="color:var(--green)">$${parseFloat(p.ingresos||0).toFixed(2)}</span>
      </div>`).join('') || '<p style="color:var(--text-muted);font-size:0.85rem">Sin datos de ventas aún</p>';

    const nl = document.getElementById('novedades-list');
    if (nl) nl.innerHTML = (data.pedidos_recientes || []).map(o => `
      <div class="top-item">
        <div>
          <p class="top-name">${o.codigo}</p>
          <p class="top-price">$${parseFloat(o.total).toFixed(2)}</p>
        </div>
        <span class="order-status status-${o.estado}" style="font-size:0.72rem">${estadoLabel(o.estado)}</span>
      </div>`).join('') || '<p style="color:var(--text-muted);font-size:0.85rem">Sin pedidos recientes</p>';

    updateBadgesFromCache();
  } catch (err) { console.error('loadDashboard:', err); }
}

// ── Tienda ─────────────────────────────────────────────────
async function loadProductos(filtros = {}) {
  const grid = document.getElementById('products-grid'); if (!grid) return;
  grid.innerHTML = '<p style="color:var(--text-muted);padding:20px"><i class="fa-solid fa-spinner fa-spin"></i> Cargando...</p>';
  const requestId = ++ui.lastProductosRequestId;
  try {
    const data = await API.Productos.listar(filtros);
    if (requestId !== ui.lastProductosRequestId) return;
    ui.productos = data.data || [];
    await loadCarritoSummary();
    renderProductos(ui.productos);
  } catch (err) { if (requestId === ui.lastProductosRequestId) grid.innerHTML = `<p style="color:#ff4060;padding:20px">Error: ${err.message}</p>`; }
}

function renderProductos(lista) {
  const grid = document.getElementById('products-grid'); if (!grid) return;
  if (!lista || lista.length === 0) { grid.innerHTML = '<p style="color:var(--text-muted);padding:20px">No se encontraron productos</p>'; return; }
  grid.innerHTML = lista.map(p => buildProductCard(p)).join('');
}

async function loadCarritoSummary() {
  if (!ui.carritoLoaded) {
    try {
      const data = await API.Carrito.obtener();
      ui.carrito = data;
      ui.carritoLoaded = true;
    } catch (err) {
      console.warn('No se pudo cargar el carrito para el resumen', err);
    }
  }
  renderTiendaSidebar();
}

function renderTiendaSidebar() {
  const sidebar = document.getElementById('tienda-sidebar');
  if (!sidebar) return;
  const items = ui.carrito.items || [];
  const totalItems = items.reduce((sum, item) => sum + item.cantidad, 0);
  const uniqueProducts = items.length;
  const subtotal = parseFloat(ui.carrito.subtotal || 0).toFixed(2);
  const impuestos = parseFloat(ui.carrito.impuestos || 0).toFixed(2);
  const total = parseFloat(ui.carrito.total || 0).toFixed(2);
  const lines = items.slice(0, 4).map(item => `
      <div class="sidebar-item"><span>${normalizeText(item.nombre)} ×${item.cantidad}</span><span>$${parseFloat(item.subtotal).toFixed(2)}</span></div>`).join('');

  sidebar.innerHTML = `
    <div class="sidebar-summary-card">
      <p class="sidebar-summary-title">Resumen del carrito</p>
      <p class="sidebar-summary-meta">${uniqueProducts} producto(s), ${totalItems} unidad(es)</p>
      ${uniqueProducts === 0 ? '<p class="sidebar-empty">Tu carrito está vacío.</p>' : `
        <div class="sidebar-items">${lines}</div>
        <div class="sidebar-summary-row"><span>Subtotal</span><span>$${subtotal}</span></div>
        <div class="sidebar-summary-row"><span>Impuestos</span><span>$${impuestos}</span></div>
        <div class="sidebar-summary-row sidebar-summary-total"><span>Total</span><span>$${total}</span></div>
        <button class="btn-seguir" onclick="navigate('carrito',document.querySelector('[data-page=carrito]'))">Ver detalle del carrito</button>
        <button class="btn-checkout" style="margin-top:10px;" onclick="navigate('carrito',document.querySelector('[data-page=carrito]'))">Ir al carrito</button>
      `}
    </div>
  `;
}

function buildProductCard(p) {
  const inFav    = ui.favoritos.some(f => f.id === p.id);
  const cartItem = ui.carrito.items?.find(i => i.producto_id === p.id);
  const currentQty = cartItem?.cantidad || 0;
  const stars    = '★'.repeat(Math.round(p.rating)) + '☆'.repeat(5 - Math.round(p.rating));
  const tipoTag  = p.tipo === 'alquiler' ? `<span class="product-tag tag-alquiler">Alquiler</span>` : `<span class="product-tag tag-compra">Compra</span>`;
  const estadoTag = p.estado === 'en-uso' ? `<span class="product-tag tag-en-uso">En uso</span>` : p.estado === 'desuso' ? `<span class="product-tag tag-desuso">Desuso</span>` : '';
  const canBuy = p.tipo !== 'alquiler';
  const canRent = p.tipo !== 'compra';
  const buyLabel = cartItem && p.tipo === 'compra' ? `En carrito (${currentQty})` : 'Comprar';
  const rentLabel = cartItem && p.tipo === 'alquiler' ? `En carrito (${currentQty})` : 'Alquilar';
  return `<div class="product-card">
    <div class="product-img-wrap">
      <img src="${getImageUrl(p.img_url)}" alt="${normalizeText(p.nombre)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${DEFAULT_IMAGE_URL}'">
      ${p.featured ? '<span class="tag-featured">DEST.</span>' : ''}
    </div>
    <div class="product-body">
      <div class="product-tags">${tipoTag}${estadoTag}</div>
      <p class="product-name">${normalizeText(p.nombre)}</p><p class="product-cat">${normalizeText(p.categoria)}</p>
      <p class="product-desc">${normalizeText(p.descripcion || '')}</p>
      ${p.tipo === 'alquiler' && p.fecha_inicio ? `<p class="ticket-meta" style="margin-bottom:4px"><i class="fa-regular fa-calendar" style="color:var(--yellow)"></i> ${p.fecha_inicio}${p.fecha_fin ? ' → ' + p.fecha_fin : ''}</p>` : ''}
      <div class="product-price-row"><span class="product-price">$${parseFloat(p.precio).toFixed(2)}</span><span class="product-rating">${stars}</span></div>
      <p class="product-stock">Stock: <strong>${p.stock}</strong> uds.</p>
      <div class="product-actions">
        <button class="btn-agregar ${cartItem?'in-cart':''}" id="btn-cart-${p.id}" onclick="toggleCarrito(${p.id})">
          <i class="fa-solid fa-cart-plus"></i> ${cartItem ? `En carrito (${currentQty})` : (p.tipo === 'alquiler' ? 'Alquilar' : 'Comprar')}
        </button>
        <div class="product-actions-right">
          <div class="product-qty">
            <button class="qty-btn" onclick="changeProductQty(${p.id}, ${Math.max(currentQty - 1, 0)})" ${currentQty === 0 ? 'disabled' : ''}>−</button>
            <span class="qty-val">${currentQty}</span>
            <button class="qty-btn" onclick="changeProductQty(${p.id}, ${currentQty + 1})">+</button>
          </div>
          <button class="btn-icon fav ${inFav?'fav-active':''}" id="btn-fav-${p.id}" onclick="toggleFavorito(${p.id})" title="Favorito">
            <i class="fa-${inFav?'solid':'regular'} fa-heart"></i>
          </button>
        </div>
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
    categoria: options.categoria != null ? options.categoria : document.getElementById('cat-filter')?.value.trim() || '',
    sort,
    order,
    tipo: options.tipo != null ? options.tipo : document.getElementById('tipo-filter')?.value.trim() || '',
    estado: options.estado != null ? options.estado : document.getElementById('estado-filter')?.value.trim() || '',
    fecha_desde: options.fecha_desde != null ? options.fecha_desde : document.getElementById('fecha-desde')?.value || '',
    fecha_hasta: options.fecha_hasta != null ? options.fecha_hasta : document.getElementById('fecha-hasta')?.value || '',
  });
}
function resetFiltros() {
  ['search-input','cat-filter','sort-filter','tipo-filter','estado-filter','fecha-desde','fecha-hasta']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = id === 'sort-filter' ? 'nombre' : ''; });
  filterProductos();
}

// ── Carrito ────────────────────────────────────────────────
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
      <p class="cart-items-count">${data.items.reduce((s,i) => s + i.cantidad, 0)} producto(s) en tu carrito</p>
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
      ${data.items.map(i => `<div class="summary-row"><span class="lbl">${i.nombre} ×${i.cantidad}</span><span class="val">$${parseFloat(i.subtotal).toFixed(2)}</span></div>`).join('')}
      <div class="summary-row" style="margin-top:8px"><span class="lbl">Subtotal</span><span class="val">$${parseFloat(data.subtotal).toFixed(2)}</span></div>
      <div class="summary-row"><span class="lbl">Envío</span><span class="val free">GRATIS</span></div>
      <div class="summary-row"><span class="lbl">Impuestos (19%)</span><span class="val">$${parseFloat(data.impuestos).toFixed(2)}</span></div>
      <div class="summary-total"><span class="lbl">Total</span><span class="val">$${parseFloat(data.total).toFixed(2)}</span></div>
      <button class="btn-checkout" onclick="checkout()"><i class="fa-solid fa-credit-card"></i> Proceder al Pago</button>
      <button class="btn-seguir" onclick="navigate('tienda',document.querySelector('[data-page=tienda]'))">← Seguir Comprando</button>
      <button class="btn-sm btn-danger" style="width:100%;margin-top:8px;justify-content:center" onclick="vaciarCarrito()"><i class="fa-solid fa-trash"></i> Vaciar Carrito</button>
    </div>`;
    renderTiendaSidebar();
    updateBadgesFromCache();
  } catch (err) { showNeonAlert('Error al cargar el carrito', 'error'); }
}

async function toggleCarrito(productoId) {
  const inCart = ui.carrito.items?.some(i => i.producto_id === productoId);
  const p = ui.productos.find(x => x.id === productoId);
  try {
    if (inCart) { await API.Carrito.quitar(productoId); showNeonAlert(`"${p?.nombre}" removido del carrito`, 'info'); }
    else { await API.Carrito.agregar(productoId, 1); showNeonAlert(`"${p?.nombre}" añadido al carrito`, 'success'); }
    await loadCarrito(); renderProductos(ui.productos); loadDashboard();
  } catch (err) { showNeonAlert(err.message, 'error'); }
}

async function changeProductQty(productoId, qty) {
  const p = ui.productos.find(x => x.id === productoId);
  if (!p) return;
  const maxQty = parseInt(p.stock, 10) || 999;
  if (qty < 1) { await quitarDelCarrito(productoId); return; }
  if (qty > maxQty) { showNeonAlert(`Sólo hay ${maxQty} unidades disponibles`, 'info'); qty = maxQty; }
  const currentItem = ui.carrito.items?.find(i => i.producto_id === productoId);
  try {
    if (currentItem) {
      await API.Carrito.actualizar(productoId, qty);
      showNeonAlert(`Cantidad actualizada a ${qty}`, 'success');
    } else {
      await API.Carrito.agregar(productoId, qty);
      showNeonAlert(`"${p?.nombre}" añadido al carrito (${qty})`, 'success');
    }
    await loadCarrito(); renderProductos(ui.productos); loadDashboard();
  } catch (err) { showNeonAlert(err.message, 'error'); }
}

async function cambiarCantidad(id, qty) {
  if (qty < 1) { await quitarDelCarrito(id); return; }
  try { await API.Carrito.actualizar(id, qty); await loadCarrito(); } catch (err) { showNeonAlert(err.message, 'error'); }
}
async function quitarDelCarrito(id) {
  try { await API.Carrito.quitar(id); showNeonAlert('Producto removido', 'info'); await loadCarrito(); loadDashboard(); }
  catch (err) { showNeonAlert(err.message, 'error'); }
}
async function vaciarCarrito() {
  if (!confirm('¿Vaciar el carrito?')) return;
  try { await API.Carrito.vaciar(); showNeonAlert('Carrito vaciado', 'info'); await loadCarrito(); loadDashboard(); }
  catch (err) { showNeonAlert(err.message, 'error'); }
}
function checkout() {
  if (!ui.carrito.items?.length) { showNeonAlert('El carrito está vacío', 'error'); return; }
  abrirModalPago();
}

function abrirModalPago() {
  const user = Auth.getUser();
  const dirEl = document.getElementById('pay-direccion');
  if (dirEl) dirEl.value = user?.direccion || '';
  ['pay-nombre','pay-numero','pay-expiry','pay-cvv'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const lbl = document.getElementById('card-type-label'); if (lbl) lbl.textContent = '';
  const resumen = document.getElementById('pago-resumen');
  if (resumen) {
    const items = ui.carrito.items || [];
    resumen.innerHTML = `<div class="pago-items">
      ${items.map(i => `<div class="pago-line-item"><span>${normalizeText(i.nombre)} ×${i.cantidad}</span><span>$${parseFloat(i.subtotal).toFixed(2)}</span></div>`).join('')}
      <div class="pago-line-item divider"><span>Subtotal</span><span>$${parseFloat(ui.carrito.subtotal||0).toFixed(2)}</span></div>
      <div class="pago-line-item"><span>Impuestos (19%)</span><span>$${parseFloat(ui.carrito.impuestos||0).toFixed(2)}</span></div>
      <div class="pago-line-item total-line"><span>TOTAL A PAGAR</span><span>$${parseFloat(ui.carrito.total||0).toFixed(2)}</span></div>
    </div>`;
  }
  setText('pay-total-amount', parseFloat(ui.carrito.total||0).toFixed(2));
  openModal('modal-pago');
}

function formatCardNumber(input) {
  let v = input.value.replace(/\D/g,'').substring(0,16);
  input.value = v.match(/.{1,4}/g)?.join(' ') || v;
  const lbl = document.getElementById('card-type-label');
  if (!lbl) return;
  if (v.startsWith('4'))       lbl.textContent = 'Visa';
  else if (/^5[1-5]/.test(v)) lbl.textContent = 'Mastercard';
  else if (/^3[47]/.test(v))  lbl.textContent = 'Amex';
  else                         lbl.textContent = '';
}

function formatExpiry(input) {
  let v = input.value.replace(/\D/g,'').substring(0,4);
  if (v.length >= 2) v = v.substring(0,2) + '/' + v.substring(2);
  input.value = v;
}

async function procesarPago() {
  const nombre = document.getElementById('pay-nombre')?.value.trim();
  const numero = document.getElementById('pay-numero')?.value.replace(/\s/g,'');
  const expiry = document.getElementById('pay-expiry')?.value;
  const cvv    = document.getElementById('pay-cvv')?.value.trim();
  const dir    = document.getElementById('pay-direccion')?.value.trim();

  if (!nombre)             { showNeonAlert('Ingresa el nombre en la tarjeta','error'); return; }
  if (numero.length < 16) { showNeonAlert('Número de tarjeta inválido (16 dígitos)','error'); return; }
  if (!/^\d{2}\/\d{2}$/.test(expiry)) { showNeonAlert('Vencimiento inválido — usa MM/AA','error'); return; }
  if (cvv.length < 3)     { showNeonAlert('CVV inválido (mínimo 3 dígitos)','error'); return; }
  if (!dir)               { showNeonAlert('Ingresa la dirección de envío','error'); return; }

  const btn = document.getElementById('pay-submit-btn');
  const orig = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando pago...'; }

  try {
    await new Promise(r => setTimeout(r, 1600));
    const result = await API.Pedidos.checkout(dir);
    closeModal('modal-pago');
    showNeonAlert(`¡Pago exitoso! Pedido ${result.pedido.codigo} · $${parseFloat(result.pedido.total).toFixed(2)}`, 'success');
    await Promise.all([loadCarrito(), loadPedidos(), loadDashboard()]);
    navigate('pedidos', document.querySelector('[data-page=pedidos]'));
  } catch (err) {
    showNeonAlert(err.message || 'Error al procesar el pago', 'error');
    if (btn && orig) { btn.disabled = false; btn.innerHTML = orig; }
  }
}

async function _checkout_unused() {
  const user = Auth.getUser();
  try {
    const result = await API.Pedidos.checkout(user?.direccion || '');
    showNeonAlert(`¡${result.message} Total: $${parseFloat(result.pedido.total).toFixed(2)}`, 'success');
    await Promise.all([loadCarrito(), loadPedidos(), loadDashboard()]);
    navigate('pedidos', document.querySelector('[data-page=pedidos]'));
  } catch (err) { showNeonAlert(err.message, 'error'); }
}

// ── Favoritos ──────────────────────────────────────────────
async function loadFavoritos() {
  const grid = document.getElementById('favorites-grid'); const empty = document.getElementById('empty-fav'); const bar = document.getElementById('favs-total-bar');
  try {
    const data = await API.Favoritos.obtener(); ui.favoritos = data.items || [];
    if (ui.favoritos.length === 0) { if (grid) grid.innerHTML = ''; if (empty) empty.style.display = 'block'; if (bar) bar.style.display = 'none'; return; }
    if (empty) empty.style.display = 'none';
    if (bar) { bar.style.display = 'flex'; setText('favs-count', ui.favoritos.length); setText('favs-valor', '$' + parseFloat(data.total_valor || 0).toFixed(2)); }
    if (grid) grid.innerHTML = ui.favoritos.map(p => buildProductCard(p)).join('');
  } catch (err) { if (grid) grid.innerHTML = `<p style="color:#ff4060;padding:20px">Error: ${err.message}</p>`; }
}

async function toggleFavorito(id) {
  const inFav = ui.favoritos.some(f => f.id === id); const p = ui.productos.find(x => x.id === id);
  try {
    if (inFav) { await API.Favoritos.quitar(id); ui.favoritos = ui.favoritos.filter(f => f.id !== id); showNeonAlert(`"${p?.nombre}" removido de favoritos`, 'info'); }
    else { await API.Favoritos.agregar(id); if (p) ui.favoritos.push(p); showNeonAlert(`"${p?.nombre}" añadido a favoritos`, 'success'); }
    const btn = document.getElementById('btn-fav-' + id);
    if (btn) { const nf = ui.favoritos.some(f => f.id === id); btn.className = `btn-icon fav ${nf?'fav-active':''}`; btn.innerHTML = `<i class="fa-${nf?'solid':'regular'} fa-heart"></i>`; }
    updateBadgesFromCache();
  } catch (err) { showNeonAlert(err.message, 'error'); }
}

// ── Pedidos ────────────────────────────────────────────────
async function loadPedidos() {
  const list = document.getElementById('orders-list'); if (!list) return;
  list.innerHTML = '<p style="color:var(--text-muted);padding:20px"><i class="fa-solid fa-spinner fa-spin"></i> Cargando pedidos...</p>';
  try {
    ui.pedidos = await API.Pedidos.listar();
    if (!ui.pedidos || ui.pedidos.length === 0) {
      list.innerHTML = `<div class="empty-state"><i class="fa-solid fa-clipboard-list" style="font-size:3rem;color:var(--yellow);margin-bottom:16px;"></i><p>No tienes pedidos aún</p><button class="btn-sm btn-cyan" style="margin-top:20px" onclick="navigate('tienda',document.querySelector('[data-page=tienda]'))">Ir a la Tienda</button></div>`;
      return;
    }
    list.innerHTML = ui.pedidos.map(o => buildOrderCard(o, false)).join('');
  } catch (err) { list.innerHTML = `<p style="color:#ff4060;padding:20px">Error: ${err.message}</p>`; }
}

function buildOrderCard(o, isAdmin) {
  const lineas = (o.lineas || []).map(l => `<div class="order-line-item"><div><p class="order-line-name">${l.nombre}</p><p class="order-line-qty">Cantidad: ${l.cantidad}</p></div><span class="order-line-price">$${parseFloat(l.subtotal||l.precio*l.cantidad).toFixed(2)}</span></div>`).join('');
  const sel = isAdmin ? `<select class="order-status-select" onchange="cambiarEstadoPedido(${o.id},this.value)"><option value="pending" ${o.estado==='pending'?'selected':''}>Pendiente</option><option value="transit" ${o.estado==='transit'?'selected':''}>En Camino</option><option value="delivered" ${o.estado==='delivered'?'selected':''}>Entregado</option><option value="cancelled" ${o.estado==='cancelled'?'selected':''}>Cancelado</option></select>` : `<span class="order-status status-${o.estado}">${estadoLabel(o.estado)}</span>`;
  return `<div class="order-card-v2"><div class="order-header-v2"><span class="order-id-v2">${o.codigo}</span><span class="order-status status-${o.estado}">${estadoLabel(o.estado)}</span><div style="flex:1"></div>${sel}</div><p class="order-date-v2">Creado: ${formatDate(o.created_at)}</p><div class="order-items-section" style="margin-top:14px"><p class="order-items-label">Artículos</p>${lineas}</div>${o.direccion_envio?`<div class="order-detail-row"><p class="order-detail-lbl"><i class="fa-solid fa-location-dot"></i> Dirección</p><p class="order-detail-val">${o.direccion_envio}</p></div>`:''} ${o.numero_seguimiento?`<div class="order-detail-row"><p class="order-detail-lbl"><i class="fa-solid fa-truck"></i> Seguimiento</p><p class="order-detail-val">${o.numero_seguimiento}</p></div>`:''}<div class="order-total-v2"><span>Total</span><span class="amt">$${parseFloat(o.total).toFixed(2)}</span></div><div style="margin-top:12px"><button class="btn-sm btn-cyan" style="font-size:0.78rem;padding:6px 12px" onclick="verDetallePedido(${o.id})"><i class="fa-solid fa-magnifying-glass"></i> Ver detalle</button></div></div>`;
}
function estadoLabel(e) { return {pending:'Pendiente',transit:'En Camino',delivered:'Entregado',cancelled:'Cancelado'}[e]||e; }

async function verDetallePedido(id) {
  let o = ui.pedidos.find(p => p.id === id);
  if (!o) return;
  _renderDetallePedido(o);
  openModal('modal-detalle-pedido');
  try {
    const fresh = await API.Pedidos.obtener(id);
    if (fresh) { o = fresh; _renderDetallePedido(o); ui._pedidoDetalle = o; }
  } catch (e) { /* usa el caché */ }
}

function _renderDetallePedido(o) {
  const estados = ['pending','transit','delivered'];
  const cancelado = o.estado === 'cancelled';
  const stepsLabels = ['Pedido recibido','En camino','Entregado'];
  const stepsIcons = ['fa-clipboard-check','fa-truck','fa-house-circle-check'];
  const currentStep = cancelado ? -1 : estados.indexOf(o.estado);

  const timelineHtml = cancelado
    ? `<div class="dp-timeline-cancelled"><i class="fa-solid fa-xmark-circle"></i> Pedido cancelado</div>`
    : stepsLabels.map((lbl,i) => {
        const done = i < currentStep;
        const active = i === currentStep;
        return `<div class="dp-step ${done?'done':''} ${active?'active':''}">
          <div class="dp-step-icon"><i class="fa-solid ${stepsIcons[i]}"></i></div>
          <span class="dp-step-label">${lbl}</span>
        </div><div class="dp-step-line ${done||active?'done':''}"></div>`;
      }).join('').replace(/<div class="dp-step-line[^"]*"><\/div>$/, '');

  const lineas = (o.lineas || []);
  const lineasHtml = lineas.length === 0
    ? '<p style="color:var(--text-muted);font-size:0.9rem">Sin artículos registrados.</p>'
    : lineas.map(l => {
        const sub = parseFloat(l.subtotal || l.precio * l.cantidad || 0);
        const img = l.imagen_url ? `<img src="${l.imagen_url}" alt="${l.nombre}" class="dp-line-img" onerror="this.style.display='none'">` : '';
        return `<div class="dp-line-item">${img}<div class="dp-line-info"><p class="dp-line-name">${l.nombre}</p><p class="dp-line-qty">Cantidad: ${l.cantidad} · $${parseFloat(l.precio||0).toFixed(2)} c/u</p></div><span class="dp-line-sub">$${sub.toFixed(2)}</span></div>`;
      }).join('');

  const subtotal = parseFloat(o.subtotal || o.total / 1.19 || 0);
  const impuestos = parseFloat(o.impuestos || (o.total - subtotal) || 0);
  const total = parseFloat(o.total || 0);
  const totalsHtml = `<div class="dp-total-row"><span>Subtotal</span><span>$${subtotal.toFixed(2)}</span></div><div class="dp-total-row"><span>IVA (19%)</span><span>$${impuestos.toFixed(2)}</span></div><div class="dp-total-row total"><span>Total</span><span>$${total.toFixed(2)}</span></div>`;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('dp-codigo', o.codigo || '#—');
  const badge = document.getElementById('dp-status-badge');
  if (badge) { badge.textContent = estadoLabel(o.estado); badge.className = `order-status status-${o.estado}`; }
  set('dp-fecha', formatDate(o.created_at));

  const updEl = document.getElementById('dp-updated-wrap');
  if (updEl) { updEl.style.display = o.updated_at ? 'flex' : 'none'; set('dp-updated', formatDate(o.updated_at)); }

  const trackEl = document.getElementById('dp-tracking-wrap');
  if (trackEl) { trackEl.style.display = o.numero_seguimiento ? 'flex' : 'none'; set('dp-tracking', o.numero_seguimiento || ''); }

  const tl = document.getElementById('dp-timeline'); if (tl) tl.innerHTML = timelineHtml;
  const linEl = document.getElementById('dp-lineas'); if (linEl) linEl.innerHTML = lineasHtml;
  const totEl = document.getElementById('dp-totals'); if (totEl) totEl.innerHTML = totalsHtml;

  const dirWrap = document.getElementById('dp-dir-wrap');
  if (dirWrap) { dirWrap.style.display = o.direccion_envio ? 'block' : 'none'; set('dp-direccion', o.direccion_envio || ''); }

  ui._pedidoDetalle = o;
  const recompraBtn = document.getElementById('dp-recomprar-btn');
  if (recompraBtn) recompraBtn.style.display = (o.estado === 'delivered' || o.estado === 'cancelled') ? 'inline-flex' : 'none';
}

async function recomprarPedido() {
  const o = ui._pedidoDetalle;
  if (!o || !o.lineas?.length) return;
  let added = 0;
  for (const l of o.lineas) {
    try { await API.Carrito.agregar(l.producto_id || l.id, 1); added++; } catch (e) { /* skip */ }
  }
  if (added > 0) { showNeonAlert(`${added} artículo(s) añadido(s) al carrito`, 'success'); closeModal('modal-detalle-pedido'); loadCarrito(); }
  else showNeonAlert('No se pudo añadir al carrito', 'error');
}

// ── Tickets ────────────────────────────────────────────────
async function loadTickets() {
  const list = document.getElementById('tickets-list'); if (!list) return;
  try {
    ui.tickets = await API.Tickets.listar();
    list.innerHTML = ui.tickets.length === 0
      ? '<div class="empty-tickets"><i class="fa-regular fa-ticket-simple"></i><p>No tienes tickets de soporte</p></div>'
      : ui.tickets.map(t => ticketCardHtml(t)).join('');
    updateBadgesFromCache();
  } catch (err) { list.innerHTML = `<p style="color:#ff4060;padding:20px">Error: ${err.message}</p>`; }
}
function ticketCardHtml(t) {
  const lbl = {pending:'Pendiente',open:'Abierto',closed:'Resuelto'};
  const preview = t.ultimo_mensaje ? `<p class="ticket-preview">${normalizeText(t.ultimo_mensaje.autor_nombre || 'Soporte')}: ${normalizeText(truncateText(t.ultimo_mensaje.mensaje || '', 80))}</p>` : '';
  return `<div class="ticket-card status-${t.estado}">
    <div style="flex:1;min-width:200px">
      <span class="ticket-id">${t.codigo}</span>
      <p class="ticket-asunto">${t.asunto}</p>
      <p class="ticket-desc">${t.descripcion||''}</p>
      ${preview}
      <p class="ticket-meta">${formatDate(t.created_at)}</p>
      <button type="button" class="btn-sm btn-cyan" style="font-size:0.78rem;padding:6px 10px;margin-top:10px" onclick="abrirTicketDetalle(${t.id})">
        <i class="fa-solid fa-eye"></i> Ver respuestas
      </button>
    </div>
    <span class="ticket-badge ${t.estado}"><i class="fa-solid fa-circle" style="font-size:6px"></i> ${lbl[t.estado]||t.estado}</span>
  </div>`;
}
async function abrirTicketDetalle(ticketId) {
  try {
    const ticket = await API.Tickets.obtener(ticketId);
    ui.ticketActual = ticket;
    renderTicketDetalle(ticket);
    openModal('modal-ticket-detalle');
  } catch (err) {
    showNeonAlert(err.message, 'error');
  }
}
function renderTicketDetalle(ticket) {
  const modal = document.getElementById('modal-ticket-detalle');
  if (!modal || !ticket) return;
  const messages = Array.isArray(ticket.mensajes) ? ticket.mensajes : [];
  const messagesHtml = messages.length === 0
    ? '<p style="color:var(--text-muted);font-size:0.9rem">Todavía no hay respuestas del soporte.</p>'
    : messages.map(m => `
        <div class="ticket-message ${m.es_interno ? 'message-admin' : 'message-user'}">
          <div class="ticket-message-header"><strong>${normalizeText(m.autor_nombre||'Soporte')}</strong><span>${formatDate(m.created_at)}</span></div>
          <div class="ticket-message-body">${normalizeText(m.mensaje)}</div>
        </div>
      `).join('');

  const titleEl = modal.querySelector('.modal-title');
  if (titleEl) titleEl.textContent = `Ticket ${ticket.codigo}`;
  const subEl = modal.querySelector('.modal-sub');
  if (subEl) subEl.textContent = `Estado: ${ticket.estado} · Asunto: ${normalizeText(ticket.asunto)}`;
  const body = modal.querySelector('.modal-body');
  if (body) {
    body.innerHTML = `
      <div class="ticket-detail-header">
        <p class="ticket-detail-subject">${normalizeText(ticket.asunto)}</p>
        <p class="ticket-detail-meta">Creado: ${formatDate(ticket.created_at)}</p>
      </div>
      <div class="ticket-messages">${messagesHtml}</div>
    `;
  }
}
function abrirNuevoTicket() { openModal('modal-nuevo-ticket'); }
async function crearTicket() {
  const asunto = document.getElementById('tk-asunto')?.value.trim(); const desc = document.getElementById('tk-desc')?.value.trim();
  if (!asunto || !desc) { showNeonAlert('Completa todos los campos', 'error'); return; }
  try {
    const t = await API.Tickets.crear(asunto, desc, 'media');
    showNeonAlert(`Ticket ${t.codigo} creado`, 'success');
    document.getElementById('tk-asunto').value = ''; document.getElementById('tk-desc').value = '';
    closeModal('modal-nuevo-ticket'); await loadTickets(); loadDashboard();
  } catch (err) { showNeonAlert(err.message, 'error'); }
}

// ── Calendario ─────────────────────────────────────────────
async function loadEventos() {
  try { ui.eventos = await API.Eventos.listar(ui.calendarYear, ui.calendarMonth + 1); } catch (err) { ui.eventos = []; }
  renderCalendar();
}
function normalizeEventType(type) {
  return String(type || 'Evento')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}
function renderCalendar() {
  const main = document.getElementById('calendar-main-wrap'); if (!main) return;
  const y = ui.calendarYear, m = ui.calendarMonth;
  const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const dayNames = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']; const today = new Date();
  const firstDay = new Date(y,m,1).getDay(); const daysInMonth = new Date(y,m+1,0).getDate(); const daysInPrev = new Date(y,m,0).getDate();
  const eventMap = ui.eventos.reduce((map, ev) => {
    const fecha = new Date(ev.fecha_hora);
    const key = '' + fecha.getFullYear() + '-' + String(fecha.getMonth()+1).padStart(2,'0') + '-' + String(fecha.getDate()).padStart(2,'0');
    if (!map.has(key)) map.set(key, normalizeEventType(ev.tipo || 'Evento'));
    return map;
  }, new Map());
  const headers = dayNames.map(d => '<div class="cal-day-header">' + d + '</div>').join('');
  let cells = '';
  for (let i = firstDay-1; i >= 0; i--) cells += '<div class="cal-day other-month">' + (daysInPrev-i) + '</div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const it = d===today.getDate() && m===today.getMonth() && y===today.getFullYear();
    const dateKey = '' + y + '-' + String(m+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    const eventType = eventMap.get(dateKey);
    cells += '<div class="cal-day' + (it ? ' today' : '') + (eventType ? ' has-event tipo-' + eventType : '') + '">' + d + '</div>';
  }
  const rem = 42 - firstDay - daysInMonth; for (let d = 1; d <= rem; d++) cells += '<div class="cal-day other-month">' + d + '</div>';
  main.innerHTML = '<div class="cal-header"><button class="cal-nav-btn" onclick="changeMonth(-1)">‹</button><span class="cal-title" style="color:var(--magenta)">' + monthNames[m] + ' ' + y + '</span><button class="cal-nav-btn" onclick="changeMonth(1)">›</button></div><div class="cal-grid">' + headers + cells + '</div>';
  renderEventPanel();
}
function changeMonth(delta) {
  ui.calendarMonth += delta;
  if (ui.calendarMonth > 11) { ui.calendarMonth = 0; ui.calendarYear++; }
  if (ui.calendarMonth < 0)  { ui.calendarMonth = 11; ui.calendarYear--; }
  loadEventos();
}
function renderEventPanel() {
  const panel = document.getElementById('eventos-list'); if (!panel) return;
  if (!ui.eventos || ui.eventos.length === 0) { panel.innerHTML = '<div class="no-events"><i class="fa-regular fa-calendar-xmark"></i><p>No hay eventos próximos</p></div>'; return; }
  panel.innerHTML = ui.eventos.map(ev => {
    const d = new Date(ev.fecha_hora);
    const type = String(ev.tipo || 'Evento');
    const typeClass = normalizeEventType(type);
    return `<div class="event-item tipo-${typeClass}">
      <p class="event-title">${ev.titulo}</p>
      <p class="event-meta">${d.toLocaleDateString('es-CO',{day:'2-digit',month:'short'})}, ${d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}</p>
      ${ev.descripcion ? `<p class="event-meta">${ev.descripcion}</p>` : ''}
      <span class="event-type-badge">${type}</span>
    </div>`;
  }).join('');
}
function abrirEventoDia() { return; }
async function crearEvento() {
  const titulo = document.getElementById('ev-titulo')?.value.trim(); const desc = document.getElementById('ev-desc')?.value.trim();
  const fecha = document.getElementById('ev-fecha')?.value; const tipo = document.getElementById('ev-tipo')?.value||'Evento';
  if (!titulo||!fecha) { showNeonAlert('Título y fecha son obligatorios','error'); return; }
  try {
    await API.Eventos.crear(titulo, desc, fecha, tipo);
    document.getElementById('ev-titulo').value=''; document.getElementById('ev-desc').value=''; document.getElementById('ev-fecha').value='';
    closeModal('modal-nuevo-evento'); showNeonAlert(`Evento "${titulo}" creado`,'success'); await loadEventos();
  } catch (err) { showNeonAlert(err.message, 'error'); }
}

// ── Perfil ─────────────────────────────────────────────────
async function loadPerfil() {
  const card = document.getElementById('perfil-card'); if (!card) return;
  try { const user = await API.Auth.me(); renderPerfilCard(user); } catch { renderPerfilCard(Auth.getUser()||{}); }
}
function renderPerfilCard(user) {
  window._perfilData = user;
  const card = document.getElementById('perfil-card'); if (!card) return;
  const editing = ui.editandoPerfil;
  const fields = ['nombre','email','telefono','direccion'];
  const icons  = {nombre:'fa-solid fa-user',email:'fa-regular fa-envelope',telefono:'fa-solid fa-phone',direccion:'fa-solid fa-location-dot'};
  const labels = {nombre:'Nombre completo',email:'Email',telefono:'Teléfono',direccion:'Dirección'};
  card.innerHTML = `
    <div class="profile-header-v2">
      <div class="profile-avatar avatar-wrap" onclick="openModal('modal-avatar')" style="cursor:pointer;position:relative">
        ${user.avatar_url ? `<img class="avatar-img" src="${user.avatar_url}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:2px solid rgba(0,245,255,0.4);">` : `<i class="fa-solid fa-user" style="font-size:2rem;color:var(--cyan);width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,rgba(0,245,255,0.15),rgba(255,0,200,0.15));border:2px solid rgba(0,245,255,0.3);display:flex;align-items:center;justify-content:center;"></i>`}
        <button class="avatar-edit-btn" onclick="openModal('modal-avatar')"><i class="fa-solid fa-camera"></i></button>
      </div>
      <div><p class="profile-name-v2">${user.nombre||''}</p><span class="profile-role-badge role-client">Cliente</span></div>
      <button class="btn-edit-profile" onclick="ui.editandoPerfil=!ui.editandoPerfil;renderPerfilCard(window._perfilData)">${editing?'Cancelar':"<i class='fa-solid fa-pen'></i> Editar Perfil"}</button>
    </div>
    ${fields.map(f => `<div class="profile-field ${editing?'editing':''}"><i class="${icons[f]}"></i><div class="profile-field-inner"><p class="profile-field-label">${labels[f]}</p>${editing?`<input id="pf-${f}" value="${user[f]||''}" class="modal-input" style="padding:0;background:none;border:none;font-size:0.9rem">`:`<p class="profile-field-val">${user[f]||'—'}</p>`}</div></div>`).join('')}
    ${editing ? `<div class="profile-edit-actions"><button class="btn-save-profile" onclick="guardarPerfil()"><i class="fa-solid fa-floppy-disk"></i> Guardar Cambios</button><button class="btn-cancel-edit" onclick="ui.editandoPerfil=false;renderPerfilCard(window._perfilData)">Cancelar</button></div>` : `<div class="profile-bottom-v2"><div class="profile-bottom-item"><p class="lbl">Favoritos guardados</p><p class="val">${ui.favoritos.length}</p></div><div class="profile-bottom-item"><p class="lbl">Pedidos realizados</p><p class="val">${ui.pedidos.length}</p></div><div class="profile-bottom-item"><p class="lbl">Rol de usuario</p><p class="val role-val">Cliente</p></div></div>`}`;
}
function renderPerfilSidePanel() {
  const aside = document.getElementById('perfil-aside'); if (!aside) return;
  const user = window._perfilData || {};
  const stats = getPerfilStats();
  const openTickets = ui.tickets?.filter(t => t.estado !== 'closed').length || 0;
  const lastTicket = ui.tickets?.[0];
  const profileComplete = user.nombre && user.email && user.telefono && user.direccion;
  aside.innerHTML = `
    <div class="profile-aside-card">
      <p class="sidebar-summary-title">Resumen rápido</p>
      <p class="sidebar-summary-meta">Tus datos más recientes</p>
      <div class="profile-metric-row"><span>Pedidos</span><strong>${stats.pedidos}</strong></div>
      <div class="profile-metric-row"><span>Favoritos</span><strong>${stats.favoritos}</strong></div>
      <div class="profile-metric-row"><span>Productos en carrito</span><strong>${stats.cartQty}</strong></div>
      <div class="profile-metric-row"><span>Total gastado</span><strong>$${parseFloat(stats.totalGastado).toFixed(2)}</strong></div>
    </div>
    <div class="profile-aside-card">
      <p class="sidebar-summary-title">Soporte</p>
      <p class="sidebar-summary-meta">Tickets y seguimiento</p>
      <div class="profile-metric-row"><span>Solicitudes abiertas</span><strong>${openTickets}</strong></div>
      ${lastTicket ? `<div class="profile-metric-row"><span>${normalizeText(lastTicket.asunto || 'Último ticket')}</span><strong>${lastTicket.estado || 'Pendiente'}</strong></div>` : '<p style="color:var(--text-muted);font-size:0.92rem;">No hay tickets recientes.</p>'}
      <button class="btn-sm btn-cyan" onclick="navigate('tickets',document.querySelector('[data-page=tickets]'))">Ver tickets</button>
    </div>
    <div class="profile-aside-card">
      <p class="sidebar-summary-title">Sugerencias</p>
      <p class="sidebar-summary-meta">Mejora tu experiencia</p>
      <div class="profile-metric-row"><span>Perfil completo</span><strong>${profileComplete ? 'Listo' : 'Pendiente'}</strong></div>
      <div class="profile-metric-row"><span>Editar información</span><strong>Actualiza tus datos</strong></div>
      <div class="sidebar-actions">
        <button class="btn-sm btn-magenta" onclick="ui.editandoPerfil=true;renderPerfilCard(window._perfilData)">Editar perfil</button>
        <button class="btn-sm btn-cyan" onclick="navigate('tienda', document.querySelector('[data-page=tienda]'))">Ir a tienda</button>
        <button class="btn-sm btn-cyan" onclick="navigate('pedidos', document.querySelector('[data-page=pedidos]'))">Mis pedidos</button>
        <button class="btn-sm btn-cyan" onclick="navigate('favoritos', document.querySelector('[data-page=favoritos]'))">Favoritos</button>
      </div>
    </div>
`;
}
function getPerfilStats() {
  const pedidos = ui.pedidos?.length || 0;
  const favoritos = ui.favoritos?.length || 0;
  const cartQty = ui.carrito.items?.reduce((s,i)=>s+i.cantidad,0) || 0;
  const totalGastado = ui.dashboard?.metricas?.total_gastado || 0;
  return { pedidos, favoritos, cartQty, totalGastado };
}

async function guardarPerfil() {
  try {
    const updated = await API.Auth.updatePerfil({
      nombre: document.getElementById('pf-nombre')?.value,
      telefono: document.getElementById('pf-telefono')?.value,
      direccion: document.getElementById('pf-direccion')?.value,
    });
    ui.editandoPerfil = false;
    renderPerfilCard(updated);
    setText('user-display-name', updated?.nombre || 'Usuario');
    renderTopbarAvatar(updated);
    showNeonAlert('Perfil actualizado','success');
  } catch (err) { showNeonAlert(err.message,'error'); }
}

// ── Avatar ─────────────────────────────────────────────────
function initAvatarModal() {
  document.querySelectorAll('.avatar-tab').forEach(tab => { tab.addEventListener('click', () => { document.querySelectorAll('.avatar-tab').forEach(t=>t.classList.remove('active')); document.querySelectorAll('.avatar-tab-content').forEach(c=>c.classList.remove('active')); tab.classList.add('active'); const tgt=document.getElementById('tab-'+tab.dataset.tab); if(tgt)tgt.classList.add('active'); }); });
  const dz=document.getElementById('avatar-drop-zone'); const fi=document.getElementById('avatar-file-input');
  if(dz){dz.addEventListener('click',()=>fi&&fi.click());dz.addEventListener('dragover',e=>{e.preventDefault();dz.style.borderColor='var(--cyan)';});dz.addEventListener('dragleave',()=>{dz.style.borderColor='';});dz.addEventListener('drop',e=>{e.preventDefault();dz.style.borderColor='';if(e.dataTransfer.files[0])processAvatarFile(e.dataTransfer.files[0]);});}
  if(fi)fi.addEventListener('change',e=>{if(e.target.files[0])processAvatarFile(e.target.files[0]);});
}
function processAvatarFile(file){if(!file.type.startsWith('image/')){showNeonAlert('Solo imágenes','error');return;}const r=new FileReader();r.onload=e=>{showAvatarPreview(e.target.result);window._pendingAvatar=e.target.result;};r.readAsDataURL(file);}
function previewAvatarUrl(){const url=document.getElementById('avatar-url-input')?.value.trim();if(!url){showNeonAlert('URL inválida','error');return;}showAvatarPreview(url);window._pendingAvatar=url;}
function showAvatarPreview(src){const w=document.getElementById('avatar-preview-wrap');if(!w)return;w.innerHTML=`<img src="${src}" alt="Vista previa">`;w.style.display='flex';}
async function guardarAvatar(){
  if(!window._pendingAvatar){showNeonAlert('Selecciona una imagen','error');return;}
  try {
    const updated = await API.Auth.updatePerfil({ avatar_url: window._pendingAvatar });
    window._pendingAvatar = null;
    closeModal('modal-avatar');
    showNeonAlert('Avatar actualizado','success');
    if (window._perfilData) {
      window._perfilData.avatar_url = updated.avatar_url;
      renderPerfilCard(window._perfilData);
    }
    renderTopbarAvatar(updated);
  } catch (err) { showNeonAlert(err.message,'error'); }
}

// ── Helpers globales ───────────────────────────────────────
function updateBadgesFromCache(){
  const cq=ui.carrito.items?.reduce((s,i)=>s+i.cantidad,0)||0;const fq=ui.favoritos.length;const tq=ui.tickets.filter(t=>t.estado!=='closed').length;
  const bc=document.getElementById('badge-cart');const bf=document.getElementById('badge-fav');const bt=document.getElementById('badge-tickets');
  if(bc){bc.textContent=cq;bc.style.display=cq?'':'none';}if(bf){bf.textContent=fq;bf.style.display=fq?'':'none';}if(bt){bt.textContent=tq;bt.style.display=tq?'':'none';}
}
function formatDate(iso){if(!iso)return'';return new Date(iso).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'});}
function setText(id,val){const el=document.getElementById(id);if(el)el.textContent=val;}
function openModal(id){const el=document.getElementById(id);if(el)el.classList.add('open');}
function closeModal(id){const el=document.getElementById(id);if(el)el.classList.remove('open');}
function closeModalOutside(e,id){if(e.target.id===id)closeModal(id);}
function showNeonAlert(msg,type='info'){const icons={success:'✓',error:'✕',info:'ℹ'};const el=document.getElementById('neonAlert');if(!el)return;el.className=`neon-alert ${type}`;el.innerHTML=`<span>${icons[type]||'•'}</span> ${msg}`;el.style.display='flex';el.offsetHeight;el.classList.add('show');clearTimeout(el._timer);el._timer=setTimeout(()=>{el.classList.remove('show');setTimeout(()=>{el.style.display='none';},400);},3500);}
