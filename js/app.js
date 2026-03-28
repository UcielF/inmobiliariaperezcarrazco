/* ============================================================
   app.js  –  Perez Carrazco Inmobiliaria
   Datos: Tokko Broker vía Cloudflare Worker
   ============================================================ */

const PROXY         = "https://tokko-proxy.tecno-serv00.workers.dev";
const WHATSAPP_NUM  = "542235685409";
const OP_LABEL = { 1: "Venta", 2: "Alquiler", 3: "Temporario" };
const OP_MAP   = { venta: 1, alquiler: 2, temporario: 3 };
const ROOT     = window.ROOT_PATH || "";

const state = {
  props:      [],
  page:       1,
  limit:      50,
  loading:    false,
  opType:     null,
  totalProps: null
};

// ── Utilidades ────────────────────────────────────────────────────────────────

const $ = (sel, ctx = document) => ctx.querySelector(sel);

function escHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

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
    p?.room_amount     && `${p.room_amount} amb.`,
    sup                && `${sup} m²`,
    p?.bathroom_amount && `${p.bathroom_amount} baño${p.bathroom_amount > 1 ? "s" : ""}`
  ].filter(Boolean).join(" • ");
}

function opBadge(p) {
  const opType = p?.operations?.[0]?.operation_type;
  return opType ? `<span class="badge">${opType}</span>` : "";
}

function cardHtml(p) {
  const id    = p.id ?? p.property_id;
  const title = escHtml(p.publication_title || p.address || "Propiedad");
  const img   = portada(p);
  const waMsg = encodeURIComponent(`Hola! Me interesa la propiedad "${p.publication_title || p.address}". ¿Pueden darme más información?`);

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

async function fetchProps(page = 1, limit = 9, opType = null) {
  let url = `${PROXY}/property?page=${page}&limit=${limit}`;
  if (opType) url += `&operation_types=${opType}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  state.totalProps = data.meta?.total_count ?? data.count ?? null;
  return data.objects || data.results || [];
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
    console.error("[app] Error al cargar destacadas:", e);
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
    let items = await fetchProps(state.page, state.limit, state.opType);

    // Filtro client-side como respaldo si el Worker no filtra por operación
    if (state.opType) {
      items = items.filter(p => Number(p?.operations?.[0]?.operation_id) === state.opType);
    }

    state.props.push(...items);

    const html = items.map(cardHtml).join("");
    if (append) {
      grid.insertAdjacentHTML("beforeend", html);
    } else {
      grid.innerHTML = html || "<p>No hay propiedades disponibles en este momento.</p>";
    }

    // Actualizar contador en botón toggle
    const toggleSpan = document.querySelector('#disponibles-toggle span');
    if (toggleSpan && !toggleSpan.closest('[aria-expanded="true"]')) {
      const total = state.totalProps ?? state.props.length;
      toggleSpan.textContent = `Ver propiedades (${total})`;
    }

    // Ocultar "Ver más" si no hay más páginas
    if (items.length < state.limit) {
      document.getElementById("ver-mas")?.style.setProperty("display", "none");
    }
  } catch (e) {
    console.error("[app] Error al cargar propiedades:", e);
    if (!append) grid.innerHTML = "<p>Error al cargar propiedades. Intentá de nuevo.</p>";
  } finally {
    state.loading = false;
  }
}



// ── Búsqueda (client-side sobre props ya cargadas) ────────────────────────────

function aplicarFiltros() {
  const q     = ($('#q')?.value || "").trim().toLowerCase();
  const tipo  = ($('#tipo')?.value || "").toLowerCase();
  const pMin  = parseFloat($('#precioMin')?.value || "");
  const pMax  = parseFloat($('#precioMax')?.value || "");
  const opStr = $('#operacion')?.value || "";
  const opId  = OP_MAP[opStr] || null;

  return state.props.filter(p => {
    if (opId) {
      const pOpId = p?.operations?.[0]?.operation_id;
      if (pOpId !== opId) return false;
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
    if (Number.isFinite(pMin) && (p.web_price ?? 0) < pMin) return false;
    if (Number.isFinite(pMax) && p.web_price && p.web_price > pMax) return false;
    if (q) {
      const texto = [p.publication_title, p.address, p.neighborhood, p.description]
        .filter(Boolean).join(" ").toLowerCase();
      if (!texto.includes(q)) return false;
    }
    return true;
  });
}

function renderResultados(lista) {
  const grid    = document.getElementById("gridResultados");
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
  const toggle   = document.querySelector('.nav-toggle');
  const mobileNav = document.getElementById('nav-mobile');
  const overlay   = document.getElementById('navOverlay');

  if (!toggle || !mobileNav) return;

  toggle.addEventListener('click', () => {
    const open = mobileNav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    mobileNav.setAttribute('aria-hidden', open ? 'false' : 'true');
    toggle.querySelector('i').className = open ? 'fa-solid fa-xmark' : 'fa-solid fa-bars';
    overlay?.classList.toggle('is-open', open);
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.nav-toggle') && !e.target.closest('#nav-mobile')) {
      mobileNav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      mobileNav.setAttribute('aria-hidden', 'true');
      toggle.querySelector('i').className = 'fa-solid fa-bars';
      overlay?.classList.remove('is-open');
    }
  }, { passive: true });

  const closeNav = () => {
    mobileNav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    mobileNav.setAttribute('aria-hidden', 'true');
    toggle.querySelector('i').className = 'fa-solid fa-bars';
    overlay?.classList.remove('is-open');
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
  if (!track || !thumb) return;
  const update = () => {
    const ratio = track.scrollLeft / (track.scrollWidth - track.clientWidth);
    const thumbW = Math.max(20, (track.clientWidth / track.scrollWidth) * 100);
    thumb.style.width = thumbW + '%';
    thumb.style.left = (ratio * (100 - thumbW)) + '%';
  };
  track.addEventListener('scroll', update, { passive: true });
  track.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    track.scrollBy({ left: e.deltaY * 2, behavior: 'smooth' });
  }, { passive: false });
  update();
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
}

function initReveal() {
  const els = document.querySelectorAll('.section-head');
  if (!els.length) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); observer.unobserve(e.target); } });
  }, { threshold: 0.2 });
  els.forEach(el => { el.classList.add('reveal'); observer.observe(el); });
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
  initSlider();

  document.querySelector(".form-contacto")?.addEventListener("submit", async e => {
    e.preventDefault();
    const form   = e.target;
    const btn    = form.querySelector("[type=submit]");
    const nombre  = form.querySelector("#email-nombre")?.value.trim() || "";
    const email   = form.querySelector("#email-email")?.value.trim() || "";
    const tel     = form.querySelector("#email-tel")?.value.trim() || "";
    const asunto  = form.querySelector("#email-asunto")?.value.trim() || "";
    const mensaje = form.querySelector("#email-mensaje")?.value.trim() || "";

    if (btn) { btn.disabled = true; btn.textContent = "Enviando…"; }

    try {
      const res = await fetch("https://formsubmit.co/ajax/contacto@perezcarrazco.com", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ nombre, email, tel, asunto, mensaje,
          _subject: `Consulta web: ${asunto || "Sin asunto"}`,
          _captcha: "false"
        })
      });
      if (!res.ok) throw new Error();
      if (btn) { btn.textContent = "Mensaje enviado ✓"; }
      form.reset();
    } catch {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-regular fa-paper-plane"></i> Enviar mensaje';
      }
      alert("Hubo un error al enviar. Por favor, escribinos directamente a contacto@perezcarrazco.com");
    }
  });

  const toggleBtn = document.getElementById('disponibles-toggle');
  const collapse  = document.getElementById('disponibles-collapse');
  if (toggleBtn && collapse) {
    toggleBtn.addEventListener('click', () => {
      const open = collapse.classList.toggle('open');
      toggleBtn.setAttribute('aria-expanded', open);
      toggleBtn.querySelector('span').textContent = open ? 'Ocultar propiedades' : 'Ver propiedades';
    });
  }

  cargarDestacadas();

  const grid = document.getElementById("grid-disponibles");
  if (grid) {
    const opAttr = grid.dataset.op;
    state.opType = opAttr ? parseInt(opAttr, 10) : null;

    await cargarDisponibles();

    document.getElementById("ver-mas")?.addEventListener("click", () => {
      state.page++;
      cargarDisponibles(true);
    });
  }

  document.getElementById("buscador")?.addEventListener("submit", async e => {
    e.preventDefault();
    if (!state.props.length) await cargarDisponibles();
    renderResultados(aplicarFiltros());
  });
});
