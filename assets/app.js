// ============================================================
// Deportes Neon — Utilidades compartidas
// ============================================================

// Generador de partículas flotantes
(function initParticles() {
  const container = document.getElementById('particles');
  if (!container) return;

  const colors = ['#00f5ff', '#ff00c8', '#00ff88', '#ffe600'];
  const count = 30;

  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';

    const color = colors[Math.floor(Math.random() * colors.length)];
    const size = Math.random() * 3 + 1;
    const left = Math.random() * 100;
    const duration = Math.random() * 15 + 10;
    const delay = Math.random() * 15;

    p.style.cssText = `
      left: ${left}%;
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      box-shadow: 0 0 ${size * 3}px ${color};
      animation-duration: ${duration}s;
      animation-delay: ${delay}s;
    `;

    container.appendChild(p);
  }
})();

// ============================================================
// Alerta neon personalizada
// ============================================================
function showNeonAlert(message, type = 'info') {
  // Remover alerta existente
  const existing = document.getElementById('neonAlert');
  if (existing) existing.remove();

  const colors = {
    success: { bg: 'rgba(0,255,136,0.1)', border: '#00ff88', text: '#00ff88', icon: '✓' },
    error:   { bg: 'rgba(255,0,80,0.1)',  border: '#ff0050', text: '#ff0050', icon: '✕' },
    info:    { bg: 'rgba(0,245,255,0.1)', border: '#00f5ff', text: '#00f5ff', icon: 'ℹ' },
  };

  const c = colors[type] || colors.info;

  const alert = document.createElement('div');
  alert.id = 'neonAlert';
  alert.style.cssText = `
    position: fixed;
    top: 24px;
    left: 50%;
    transform: translateX(-50%) translateY(-20px);
    background: ${c.bg};
    border: 1px solid ${c.border};
    border-radius: 10px;
    padding: 14px 24px;
    color: ${c.text};
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: 1px;
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 10px;
    box-shadow: 0 0 20px ${c.border}40;
    backdrop-filter: blur(10px);
    opacity: 0;
    transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    white-space: nowrap;
  `;

  alert.innerHTML = `<span style="font-size:1.1rem;">${c.icon}</span> ${message}`;
  document.body.appendChild(alert);

  // Animar entrada
  requestAnimationFrame(() => {
    setTimeout(() => {
      alert.style.opacity = '1';
      alert.style.transform = 'translateX(-50%) translateY(0)';
    }, 10);
  });

  // Auto-remover
  setTimeout(() => {
    alert.style.opacity = '0';
    alert.style.transform = 'translateX(-50%) translateY(-20px)';
    setTimeout(() => alert.remove(), 400);
  }, 3500);
}
