/* ============================================================
   app.js  –  Perez Carrazco Inmobiliaria
   Datos: Tokko Broker vía Cloudflare Worker
   ============================================================ */

const PROXY = "https://tokko-proxy.tecno-serv00.workers.dev";
const WHATSAPP_NUM = "5492236239886";
const OP_LABEL = { 1: "Venta", 2: "Alquiler", 3: "Temporario" };
const OP_MAP = { venta: 1, alquiler: 2, temporario: 3 };
const ROOT = window.ROOT_PATH || "";

const state = {
  props: [],
  page: 1,
  limit: 50,
  loading: false,
  opType: null,
  totalProps: null
};

// ── Utilidades ────────────────────────────────────────────────────────────────

const $ = (sel, ctx = document) => ctx.querySelector(sel);


function portada(p) {
  const front = p?.photos?.find(ph => ph.is_front_cover);
  return front?.image
    || p?.photos?.[0]?.image
    || "https://placehold.co/800x450?text=Sin+imagen";
}

function fmtPrecio(p) {
  const price = p?.operations?.[0]?.prices?.[0];
  if (!price?.price) return "Consultar";
  return `${price.currency || "U$S"} ${Number(price.price).toLocaleString("es-AR")}`;
}

function metaTexto(p) {
  const sup = parseFloat(p?.roofed_surface) || parseFloat(p?.total_surface) || null;
  return [
    p?.room_amount && `${p.room_amount} amb.`,
    sup && `${sup} m²`,
    p?.bathroom_amount && `${p.bathroom_amount} baño${p.bathroom_amount > 1 ? "s" : ""}`
  ].filter(Boolean).join(" • ");
}

// FIX #1: opBadge usa OP_LABEL con operation_id en lugar del string crudo de la API
function opBadge(p) {
  const opId = p?.operations?.[0]?.operation_id;
  const label = OP_LABEL[opId];
  return label ? `<span class="badge">${label}</span>` : "";
}

function cardHtml(p) {
  const id = p.id ?? p.property_id;
  const title = escHtml(p.publication_title || p.address || "Propiedad");
  const img = portada(p);
  const waMsg = encodeURIComponent(`Hola, me interesa la propiedad ${p.direccion || p.address || ""}, ${p.titulo || p.publication_title || p.title || ""}. ¿Está disponible?`);

  return `
    <article class="card">
      <a href="${ROOT}propiedad.html?id=${id}" class="card-img-wrap">
        <img src="${img}" alt="${title}" class="card-img" loading="lazy">
        <div class="card-price-overlay">
          <span class="card-price">${fmtPrecio(p)}</span>
        </div>
        ${opBadge(p)}
      </a>
      <div class="card-body">
        <h3 class="card-title">${title}</h3>
        <p class="card-meta">${metaTexto(p) || "&nbsp;"}</p>
        <div class="card-actions">
          <a href="${ROOT}propiedad.html?id=${id}" class="btn-outline">Ver propiedad →</a>
          <a href="https://wa.me/${WHATSAPP_NUM}?text=${waMsg}" class="btn-wa" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> Consultar</a>
        </div>
      </div>
    </article>`;
}

// ── Fetch Tokko ───────────────────────────────────────────────────────────────

// FIX #6: fetchProps ya no toca state.totalProps para evitar race condition con cargarDestacadas
async function fetchProps(page = 1, limit = 9, opType = null) {
  let url = `${PROXY}/property?page=${page}&limit=${limit}&order=-id`;
  if (opType) url += `&operation_types=${opType}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  return {
    items: data.objects || data.results || [],
    total: data.meta?.total_count ?? data.count ?? null
  };
}

// ── Propiedades destacadas ────────────────────────────────────────────────────

async function cargarDestacadas() {
  const grid = document.getElementById("grid-destacadas");
  if (!grid) return;

  grid.innerHTML = "<p>Cargando…</p>";
  try {
    const r = await fetch(`${PROXY}/property?featured=1&limit=6`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const items = data.objects || data.results || [];
    grid.innerHTML = items.length
      ? items.map(cardHtml).join("")
      : "<p>No hay propiedades destacadas en este momento.</p>";
  } catch (e) {
    grid.innerHTML = "";
  }
}

// ── Render grilla principal ───────────────────────────────────────────────────

async function cargarDisponibles(append = false) {
  if (state.loading) return;
  state.loading = true;

  const grid = document.getElementById("grid-disponibles");
  if (!grid) { state.loading = false; return; }

  if (!append) grid.innerHTML = "<p>Cargando propiedades…</p>";

  try {
    // FIX #6: desestructuramos items y total por separado
    const { items: rawItems, total } = await fetchProps(state.page, state.limit, state.opType);
    state.totalProps = total;

    let items = rawItems;

    // Ordenar por id descendente (más nuevas primero)
    items.sort((a, b) => (b.id ?? b.property_id ?? 0) - (a.id ?? a.property_id ?? 0));

    // FIX #2: filtro client-side con null safety
    if (state.opType) {
      items = items.filter(p => {
        const id = p?.operations?.[0]?.operation_id;
        return id != null && Number(id) === state.opType;
      });
    }

    state.props.push(...items);

    const preview = parseInt(grid.dataset.preview || "0", 10);
    const visible = preview > 0 ? items.slice(0, preview) : items;

    const html = visible.map(cardHtml).join("");
    if (append) {
      grid.insertAdjacentHTML("beforeend", html);
    } else {
      grid.innerHTML = html || "<p>No hay propiedades disponibles en este momento.</p>";
    }

    // Actualizar contador en botón toggle (solo si está cerrado)
    const toggleSpan = document.querySelector('#disponibles-toggle span');
    const toggleBtn = document.getElementById('disponibles-toggle');
    if (toggleSpan && toggleBtn?.getAttribute('aria-expanded') !== 'true') {
      const totalLabel = state.totalProps ?? state.props.length;
      toggleSpan.textContent = `Ver propiedades (${totalLabel})`;
    }

    // Mostrar "Ver más" si hay más de las visibles
    const verMas = document.getElementById("ver-mas");
    if (verMas) {
      const hayMas = preview > 0 ? items.length > preview : items.length >= state.limit;
      if (hayMas) {
        const totalLabel = state.totalProps ?? state.props.length;
        verMas.textContent = `Ver más propiedades (${totalLabel})`;
        verMas.style.display = "";
      } else {
        verMas.style.display = "none";
      }
    }
  } catch (e) {
    if (!append) grid.innerHTML = "<p>Error al cargar propiedades. Intentá de nuevo.</p>";
  } finally {
    state.loading = false;
  }
}

// ── Búsqueda (client-side sobre props ya cargadas) ────────────────────────────

function aplicarFiltros() {
  const q = ($('#q')?.value || "").trim().toLowerCase();
  const tipo = ($('#tipo')?.value || "").toLowerCase();
  const pMin = parseFloat($('#precioMin')?.value || "");
  const pMax = parseFloat($('#precioMax')?.value || "");
  const opStr = $('#operacion')?.value || "";
  const opId = OP_MAP[opStr] || null;
  const ambientes = parseInt($('#ambientes')?.value || "0", 10);

  return state.props.filter(p => {
    if (opId) {
      const pOpId = p?.operations?.[0]?.operation_id;
      // FIX CC-1: pOpId puede llegar como string de la API, opId es number
      if (Number(pOpId) !== opId) return false;
    }
    if (tipo) {
      const pTipo = [
        p.property_type?.name,
        p.property_type?.type,
        p.type?.name,
        p.type,
        p.publication_title,
        p.title
      ].filter(Boolean).join(" ").toLowerCase();
      if (!pTipo.includes(tipo)) return false;
    }
    if (ambientes > 0) {
      const rooms = parseInt(p?.room_amount, 10) || 0;
      if (ambientes === 5 ? rooms < 5 : rooms !== ambientes) return false;
    }
    const precio = parseFloat(p?.operations?.[0]?.prices?.[0]?.price) || 0;
    if (Number.isFinite(pMin) && pMin > 0 && precio < pMin) return false;
    if (Number.isFinite(pMax) && pMax > 0 && precio > pMax) return false;
    if (q) {
      const texto = [p.publication_title, p.address, p.neighborhood, p.description]
        .filter(Boolean).join(" ").toLowerCase();
      if (!texto.includes(q)) return false;
    }
    return true;
  });
}

function renderResultados(lista) {
  const grid = document.getElementById("gridResultados");
  const counter = document.getElementById("contadorResultados");
  if (!grid) return;

  if (counter) {
    counter.textContent = lista.length
      ? `${lista.length} resultado(s)`
      : "Sin resultados para los filtros aplicados.";
  }
  grid.innerHTML = lista.map(cardHtml).join("");
  document.getElementById("listado")?.scrollIntoView({ behavior: "smooth" });
}

// ── Navegación: header sticky con scroll ─────────────────────────────────────

function initStickyHeader() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  if (header.dataset.scrolledAlways !== undefined) { header.classList.add('scrolled'); return; }
  const update = () => header.classList.toggle('scrolled', window.scrollY > 60);
  window.addEventListener('scroll', update, { passive: true });
  update();
}

function initBtnTop() {
  const btn = document.getElementById('btn-top');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 300);
  }, { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// ── Navegación: subheader + submenús ─────────────────────────────────────────

function initNav() {
  const toggle = document.querySelector('.nav-toggle');
  const mobileNav = document.getElementById('nav-mobile');
  const overlay = document.getElementById('navOverlay');

  if (!toggle || !mobileNav) return;

  const breadcrumb = document.querySelector('.breadcrumb, .breadcrumb-back');

  toggle.addEventListener('click', () => {
    const open = mobileNav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    mobileNav.setAttribute('aria-hidden', open ? 'false' : 'true');
    toggle.querySelector('i').className = open ? 'fa-solid fa-xmark' : 'fa-solid fa-bars';
    overlay?.classList.toggle('is-open', open);
    if (breadcrumb) breadcrumb.style.visibility = open ? 'hidden' : '';
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.nav-toggle') && !e.target.closest('#nav-mobile')) {
      mobileNav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      mobileNav.setAttribute('aria-hidden', 'true');
      toggle.querySelector('i').className = 'fa-solid fa-bars';
      overlay?.classList.remove('is-open');
      if (breadcrumb) breadcrumb.style.visibility = '';
    }
  }, { passive: true });

  const closeNav = () => {
    mobileNav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    mobileNav.setAttribute('aria-hidden', 'true');
    toggle.querySelector('i').className = 'fa-solid fa-bars';
    overlay?.classList.remove('is-open');
    if (breadcrumb) breadcrumb.style.visibility = '';
  };

  mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', closeNav));
}

function initSubmenus() {
  document.querySelectorAll(".has-submenu").forEach(li => {
    const btn = li.querySelector(".submenu-toggle");
    if (!btn) return;
    btn.type = "button";

    btn.addEventListener("click", () => {
      const open = !li.classList.contains("open");
      li.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  });

  document.addEventListener("click", e => {
    const opened = document.querySelector(".has-submenu.open");
    if (opened && !opened.contains(e.target)) {
      opened.classList.remove("open");
      opened.querySelector(".submenu-toggle")?.setAttribute("aria-expanded", "false");
    }
  }, { passive: true });
}

// ── Init ──────────────────────────────────────────────────────────────────────

function initSlider() {
  const track = document.getElementById('grid-destacadas');
  const thumb = document.getElementById('slider-thumb');
  const btnPrev = document.getElementById('slider-prev');
  const btnNext = document.getElementById('slider-next');
  if (!track || !thumb) return;

  const SCROLL_STEP = 320;

  const updateThumb = () => {
    const denom = track.scrollWidth - track.clientWidth;
    const ratio = denom > 0 ? track.scrollLeft / denom : 0;
    const thumbW = Math.max(20, (track.clientWidth / track.scrollWidth) * 100);
    thumb.style.width = thumbW + '%';
    thumb.style.left = (ratio * (100 - thumbW)) + '%';
  };

  const updateBtns = () => {
    if (!btnPrev || !btnNext) return;
    btnPrev.disabled = track.scrollLeft <= 0;
    btnNext.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 1;
  };

  track.addEventListener('scroll', () => { updateThumb(); updateBtns(); }, { passive: true });

  btnPrev?.addEventListener('click', () => track.scrollBy({ left: -SCROLL_STEP, behavior: 'smooth' }));
  btnNext?.addEventListener('click', () => track.scrollBy({ left: SCROLL_STEP, behavior: 'smooth' }));

  updateThumb();
  updateBtns();
}

function initWaFloat() {
  const btn = document.createElement("a");
  btn.href = `https://wa.me/${WHATSAPP_NUM}?text=` + encodeURIComponent("Hola! Entré a su web y quiero consultar sobre una propiedad.");
  btn.target = "_blank";
  btn.rel = "noopener";
  btn.className = "wa-float";
  btn.setAttribute("aria-label", "Contactar por WhatsApp");
  btn.innerHTML = '<i class="fa-brands fa-whatsapp"></i>';
  document.body.appendChild(btn);
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 300);
  }, { passive: true });
}

function initHeroAnimation() {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        hero.classList.remove('hero--animated');
        void hero.offsetWidth; // fuerza reflow para reiniciar animación
        hero.classList.add('hero--animated');
      } else {
        hero.classList.remove('hero--animated');
      }
    });
  }, { threshold: 0.1 });
  observer.observe(hero);
}

function initReveal() {
  const els = document.querySelectorAll('.section-head:not(.reveal-left):not(.reveal-right)');
  if (!els.length) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
  }, { threshold: 0.2 });
  els.forEach(el => { el.classList.add('reveal'); observer.observe(el); });
}

function initEquipoAnimation() {
  const els = document.querySelectorAll('.equipo .reveal-left, .equipo .reveal-right, .equipo .reveal');
  if (!els.length) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      e.target.classList.toggle('visible', e.isIntersecting);
    });
  }, { threshold: 0.15 });
  els.forEach(el => observer.observe(el));
}

document.addEventListener("DOMContentLoaded", async () => {
  const anioEl = document.getElementById("anio");
  if (anioEl) anioEl.textContent = new Date().getFullYear();

  initStickyHeader();
  initNav();
  initSubmenus();
  initBtnTop();
  initWaFloat();
  initReveal();
  initEquipoAnimation();
  initHeroAnimation();
  initSlider();

  // FIX #9: guardar posición de scroll al navegar a una propiedad
  document.addEventListener("click", e => {
    const link = e.target.closest('a[href*="propiedad.html"]');
    if (link) sessionStorage.setItem("scrollY", String(window.scrollY));
  });

  const toggleBtn = document.getElementById('disponibles-toggle');
  const collapse = document.getElementById('disponibles-collapse');
  if (toggleBtn && collapse) {
    toggleBtn.addEventListener('click', () => {
      const open = collapse.classList.toggle('open');
      toggleBtn.setAttribute('aria-expanded', String(open));
      toggleBtn.querySelector('span').textContent = open ? 'Ocultar propiedades' : 'Ver propiedades';
    });
  }

  cargarDestacadas();

  const grid = document.getElementById("grid-disponibles");
  if (grid) {
    const opAttr = grid.dataset.op;
    state.opType = opAttr ? parseInt(opAttr, 10) : null;

    await cargarDisponibles();

    // FIX #5: ver-mas con edge case cubierto
    const verMasBtn = document.getElementById("ver-mas");
    verMasBtn?.addEventListener("click", () => {
      const preview = parseInt(grid.dataset.preview || "0", 10);
      if (preview > 0 && state.props.length > preview) {
        // Mostrar el resto de lo ya cargado
        const restantes = state.props.slice(preview).map(cardHtml).join("");
        grid.insertAdjacentHTML("beforeend", restantes);
        verMasBtn.style.display = "none";
      } else if (preview > 0 && state.props.length <= preview) {
        // FIX CC-3: preview > 0 pero no hay más props → ocultar
        verMasBtn.style.display = "none";
      } else {
        // preview = 0 → pedir siguiente página a la API
        state.page++;
        cargarDisponibles(true);
      }
    });
  }

  document.getElementById("buscador")?.addEventListener("submit", async e => {
    e.preventDefault();
    if (!state.props.length) await cargarDisponibles();
    renderResultados(aplicarFiltros());
  });

  // FIX #3: form-tasacion usa la constante WHATSAPP_NUM
  document.getElementById('form-tasacion')?.addEventListener('submit', function (e) {
    e.preventDefault();
    const nombre = document.getElementById('wa-nombre').value.trim();
    const tipo = document.getElementById('wa-tipo').value;
    const direccion = document.getElementById('wa-direccion').value.trim();
    const ambientes = document.getElementById('wa-ambientes').value.trim();
    const superficie = document.getElementById('wa-superficie').value.trim();
    const operacion = document.getElementById('wa-operacion').value;
    const comentarios = document.getElementById('wa-comentarios').value.trim();

    const msg = [
      `Hola! Quiero solicitar una tasación.`,
      `*Nombre:* ${nombre}`,
      `*Tipo:* ${tipo}`,
      `*Dirección:* ${direccion}`,
      ambientes ? `*Ambientes:* ${ambientes}` : null,
      superficie ? `*Superficie:* ${superficie} m²` : null,
      operacion ? `*Operación:* ${operacion}` : null,
      comentarios ? `*Comentarios:* ${comentarios}` : null,
    ].filter(Boolean).join('\n');

    window.open(`https://wa.me/${WHATSAPP_NUM}?text=${encodeURIComponent(msg)}`, '_blank');
  });

});


// pageshow distingue bfcache de back_forward sin bfcache:
// - bfcache (event.persisted=true): DOM congelado, estado preservado → solo restaurar scroll
// - sin bfcache (event.persisted=false) + back_forward: DOMContentLoaded cargó solo preview=3 → recargar sin límite
window.addEventListener("pageshow", (event) => {
  const restoreScroll = () => {
    const savedY = sessionStorage.getItem("scrollY");
    if (savedY !== null) {
      window.scrollTo({ top: parseInt(savedY, 10), behavior: "instant" });
      sessionStorage.removeItem("scrollY");
    }
  };

  if (event.persisted) {
    // bfcache: página restaurada tal cual → solo volver al scroll
    restoreScroll();
    return;
  }

  const isBackForward = performance.getEntriesByType("navigation")[0]?.type === "back_forward";
  if (!isBackForward) return;

  // sin bfcache: DOMContentLoaded ya corrió con preview=3 → recargar todas
  state.props = [];
  state.page = 1;
  state.totalProps = null;

  const verMas = document.getElementById("ver-mas");
  if (verMas) verMas.style.display = "none";

  const grid = document.getElementById("grid-disponibles");
  if (grid) {
    grid.dataset.preview = "0";
    cargarDisponibles().then(restoreScroll);
  }
});
