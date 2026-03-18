/* ============================================================
   app.js  –  Perez Carrazco Inmobiliaria
   Datos: Tokko Broker vía Cloudflare Worker
   ============================================================ */

const PROXY    = "https://tokko-proxy.tecno-serv00.workers.dev";
const OP_LABEL = { 1: "Venta", 2: "Alquiler", 3: "Temporario" };
const OP_MAP   = { venta: 1, alquiler: 2, temporario: 3 };
const ROOT     = window.ROOT_PATH || "";

const state = {
  props:   [],
  page:    1,
  limit:   9,
  loading: false,
  opType:  null   // null = todos | 1 = venta | 2 = alquiler | 3 = temporario
};

// ── Utilidades ────────────────────────────────────────────────────────────────

const $ = (sel, ctx = document) => ctx.querySelector(sel);

function escHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function portada(p) {
  return p?.cover_picture?.big
    || p?.cover_picture?.thumb
    || p?.photos?.[0]?.big
    || p?.photos?.[0]?.thumb
    || "https://placehold.co/800x450?text=Sin+imagen";
}

function fmtPrecio(p) {
  if (!p?.web_price) return "Consultar";
  return `${p.currency || "U$S"} ${Number(p.web_price).toLocaleString("es-AR")}`;
}

function metaTexto(p) {
  return [
    p?.room_amount     && `${p.room_amount} amb.`,
    p?.surface         && `${p.surface} m²`,
    p?.bathroom_amount && `${p.bathroom_amount} baño${p.bathroom_amount > 1 ? "s" : ""}`
  ].filter(Boolean).join(" • ");
}

function opBadge(p) {
  const op    = p?.operation_type ?? p?.operation_types?.[0];
  const label = OP_LABEL[op];
  return label ? `<span class="badge">${label}</span>` : "";
}

function cardHtml(p) {
  const id    = p.id ?? p.property_id;
  const title = escHtml(p.publication_title || p.address || "Propiedad");
  const img   = portada(p);

  return `
    <article class="card">
      <a href="${ROOT}propiedad.html?id=${id}">
        <img src="${img}" alt="${title}" class="thumb" loading="lazy">
      </a>
      <div class="body">
        <div class="mb-2">${opBadge(p)}</div>
        <h3 class="title">${title}</h3>
        <p class="meta">${metaTexto(p) || "&nbsp;"}</p>
        <p class="price">${fmtPrecio(p)}</p>
        <a href="${ROOT}propiedad.html?id=${id}" class="btn">Ver más</a>
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
  return data.objects || data.results || [];
}

// ── Render grilla principal ───────────────────────────────────────────────────

async function cargarDisponibles(append = false) {
  if (state.loading) return;
  state.loading = true;

  const grid = document.getElementById("grid-disponibles");
  if (!grid) { state.loading = false; return; }

  if (!append) grid.innerHTML = "<p>Cargando propiedades…</p>";

  try {
    const items = await fetchProps(state.page, state.limit, state.opType);
    state.props.push(...items);

    const html = items.map(cardHtml).join("");
    if (append) {
      grid.insertAdjacentHTML("beforeend", html);
    } else {
      grid.innerHTML = html || "<p>No hay propiedades disponibles en este momento.</p>";
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
      const pOp = p.operation_type ?? p.operation_types?.[0];
      if (pOp !== opId) return false;
    }
    if (tipo) {
      const pTipo = (p.property_type?.name || p.type || "").toLowerCase();
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

// ── Navegación: subheader + submenús ─────────────────────────────────────────

function initSubheader() {
  const panel  = document.getElementById("subheader");
  const toggle = document.querySelector(".subheader-toggle");
  const logo   = document.querySelector(".header-logo");
  if (!panel) return;

  function setOpen(open) {
    panel.classList.toggle("is-open", open);
    toggle?.setAttribute("aria-expanded", open ? "true" : "false");
  }

  toggle?.addEventListener("click", e => {
    e.preventDefault();
    setOpen(!panel.classList.contains("is-open"));
  });

  logo?.addEventListener("click", e => {
    e.preventDefault();
    setOpen(!panel.classList.contains("is-open"));
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") setOpen(false);
  });
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

document.addEventListener("DOMContentLoaded", async () => {
  const anioEl = document.getElementById("anio");
  if (anioEl) anioEl.textContent = new Date().getFullYear();

  initSubheader();
  initSubmenus();

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
