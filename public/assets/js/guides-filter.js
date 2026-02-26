// ── Filtro de guías SEO ──────────────────────────────────────
// Archivo: /assets/js/guides-filter.js
// Usado en: index.html (sección de guías)
// ─────────────────────────────────────────────────────────────

(function () {
  const btns  = document.querySelectorAll('.filter-btn');
  const cards = document.querySelectorAll('.guide-card');
  const empty = document.getElementById('guides-empty');

  if (!btns.length) return; // no estamos en la home, salir

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;

      // Estado activo del botón
      btns.forEach(b => {
        b.classList.remove('active');
        b.removeAttribute('aria-pressed');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');

      // Mostrar / ocultar tarjetas con animación de reentrada
      let visible = 0;
      cards.forEach(card => {
        const match = filter === 'all' || card.dataset.category === filter;
        if (match) {
          card.hidden = false;
          // Reinicia la animación fadeUp para que las cards "entren"
          card.style.animation = 'none';
          card.offsetHeight; // fuerza reflow
          card.style.animation = '';
          visible++;
        } else {
          card.hidden = true;
        }
      });

      // Mensaje vacío por si una categoría aún no tiene guías
      if (empty) empty.hidden = visible > 0;
    });
  });
})();
