/**********************
 * CONFIG
 **********************/
const WHATSAPP_NUM = "2235685409"; // sin + ni 0 ni 15
const EMAIL = "contacto@perezcarrazco.com";

const PROXY = "https://tokko-proxy.tecno-serv00.workers.dev";


// SI USÁS JSON:
const DATA_URL = "data/propiedades.json"; // <-- ajustá ruta real si hace falta


async function fetchTokkoById(id) {
  const url = `${PROXY}/property?id=${encodeURIComponent(id)}&ts=${Date.now()}`;
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) throw new Error(`Proxy ${resp.status}`);
  return resp.json();
}


// Normalizador -> adapta la respuesta de Tokko al shape que tu renderProp ya entiende
function mapTokkoToLocal(raw) {
  // según endpoint, a veces viene en raw.publication / raw.property; contemplamos ambos
  const p = raw?.publication || raw?.property || raw || {};

  // ID
  const id =
    p.id ?? p.property_id ?? p.publication_id ?? p.codigo ?? p.code ?? p.slug;

  // Título / dirección
  const titulo =
    p.publication_title ||
    p.title ||
    p.address ||
    [p.street, p.street_number, p.city].filter(Boolean).join(" ") ||
    "Propiedad";

  // Operación y precio (estructura real Tokko: operations[0].prices[0])
  const operacion = p.operations?.[0]?.operation_type || "";

  const _price = p.operations?.[0]?.prices?.[0];
  const moneda = (_price?.currency || "U$S").trim();
  const precio = _price?.price ?? null;

  // Imágenes
  function extractFotos(pub){
  let imgs = [];

  // photos con image anidado
  if (Array.isArray(pub.photos)) {
    for (const ph of pub.photos) {
      if (!ph) continue;
      if (typeof ph === "string") { imgs.push(ph); continue; }
      if (ph.url) imgs.push(ph.url);
      if (ph.src) imgs.push(ph.src);
      if (ph.image) {
        if (typeof ph.image === "string") imgs.push(ph.image);
        else if (typeof ph.image === "object") {
          imgs.push(
            ph.image.url || ph.image.original || ph.image.large ||
            ph.image.big || ph.image.medium || ph.image.small
          );
        }
      }
    }
  }

  // media.photos
  if (!imgs.length && Array.isArray(pub.media?.photos)) {
    for (const x of pub.media.photos) {
      if (!x) continue;
      imgs.push(x.url || x.src || x.large || x.original || x?.image?.url);
    }
  }

  // images / pictures genérico
  if (!imgs.length && Array.isArray(pub.images || pub.pictures)) {
    for (const x of (pub.images || pub.pictures)) {
      if (!x) continue;
      if (typeof x === "string") imgs.push(x);
      else {
        imgs.push(x.url || x.src || x.image || x?.image?.url || x?.image?.large);
      }
    }
  }

  // cover
  if (!imgs.length && pub.cover?.url) imgs.push(pub.cover.url);

  // limpiar duplicados/falsy
  return [...new Set(imgs.filter(Boolean))];
}


  // Campos varios
  const _tipoRaw = p.property_type?.name || p.type || p.category || "";
  const tipo = typeof _tipoRaw === "object" ? (_tipoRaw?.name || "") : (_tipoRaw || "");
  const barrio = p.neighborhood || p.area || p.barrio || "";
  const direccion =
    p.address || [p.street, p.street_number].filter(Boolean).join(" ") || "";
  const superficie =
    parseFloat(p.roofed_surface) || parseFloat(p.total_surface) ||
    parseFloat(p.surface_covered) || null;

  const ambientes = p.room_amount ?? p.rooms ?? p.environment_quantity ?? null;
  const dormitorios = p.suite_amount ?? p.bedrooms ?? null;
  const banos = p.bathroom_amount ?? p.bathrooms ?? null;

  const amenities = []
    .concat(p.amenities || [])
    .concat(p.features || [])
    .filter(Boolean);

  const descripcion = p.description || p.descripcion || "";

  // Devolvemos en el formato que ya consume renderProp()
  return {
    id,
    titulo,
    tipo,
    barrio,
    direccion,
    superficie,
    operacion,
    moneda,
    precio,
    amenities,
    descripcion,
    ambientes,
    dormitorios,
    banos,
    imagenes: extractFotos(p)
  };
}


/**********************
 * UTILES
 **********************/
const $ = s => document.querySelector(s);

function fmtPrecio(n){ 
  if (n === null || n === undefined || n === "") return "Consultar";
  const num = Number(n);
  return Number.isFinite(num) ? num.toLocaleString("es-AR") : String(n);
}

function getParam(name){
  try {
    return new URL(location.href).searchParams.get(name);
  } catch {
    return null;
  }
}

function setMeta(name, content){
  let m = document.querySelector(`meta[name="${name}"]`);
  if(!m){ m = document.createElement("meta"); m.setAttribute("name", name); document.head.appendChild(m); }
  m.setAttribute("content", content || "");
}
function setOG(property, content){
  let m = document.querySelector(`meta[property="${property}"]`);
  if(!m){ m = document.createElement("meta"); m.setAttribute("property", property); document.head.appendChild(m); }
  m.setAttribute("content", content || "");
}

function renderNotFound(reason){
  console.warn("Propiedad no encontrada:", reason);
  document.querySelector("main").innerHTML = `
    <section class="container" style="padding:2rem 0">
      <h1>Propiedad no encontrada</h1>
      <p>${reason || "Revisá el enlace o volvé al listado."}</p>
      <p><a class="btn" href="index.html">Volver al inicio</a></p>
    </section>
  `;
}

/**********************
 * RENDER PRINCIPAL
 **********************/
function renderProp(p){
  // Título / meta
  $("#titulo").textContent = p.titulo || p.title || "(Sin título)";

  // Breadcrumb
  const crumb = $("#breadcrumb-titulo");
  if (crumb) crumb.textContent = p.titulo || p.title || "Detalle";
  const crumbOper = $("#breadcrumb-operacion");
  if (crumbOper) crumbOper.textContent = p.operacion || p.oper || "Propiedades";

  // Meta texto (solo el span, para no borrar el ícono)
  const metaTexto = [
    p.tipo || p.category,
    p.barrio || p.zona,
    p.direccion || p.direc || p.address,
    p.superficie ? `${p.superficie} m²` : null
  ].filter(Boolean).join(" • ");
  const metaSpan = $("#meta-texto");
  if (metaSpan) metaSpan.textContent = metaTexto;

  // Hero section
  const heroTitulo = $("#hero-titulo");
  if (heroTitulo) heroTitulo.textContent = p.titulo || p.title || "(Sin título)";
  const heroDireccion = $("#hero-direccion");
  if (heroDireccion) heroDireccion.textContent = p.direccion || p.address || "—";
  const heroPrecio = $("#hero-precio");
  if (heroPrecio) heroPrecio.textContent = p.precio ? `${(p.moneda || "U$S").trim()} ${fmtPrecio(p.precio)}` : "Consultar";
  const heroImg = $("#hero-img");
  if (heroImg) {
    const primera = (p.imagenes || p.images || [])[0];
    if (primera) { heroImg.src = primera; heroImg.alt = p.titulo || p.title || ""; }
  }

  // Operación / precio
  const oper = p.operacion || p.oper || p.operation || "";
  const moneda = (p.moneda || p.currency || "U$S").trim();
  const precioTxt = p.precio ? `${moneda} ${fmtPrecio(p.precio)}` : "Consultar";
  $("#operacion").textContent = oper;
  $("#precio").textContent = precioTxt;
  $("#precio-lg").textContent = precioTxt;

  // Amenities
  const am = $("#amenities"); am.innerHTML = "";
  (p.amenities || p.features || []).forEach(a=>{
    const li = document.createElement("li");
    li.textContent = a;
    am.appendChild(li);
  });

  // Descripción
  $("#descripcion").textContent = p.descripcion || p.description || "";

  // Características
  const car = $("#caracteristicas-list"); car.innerHTML = "";
  const pairs = [
    ["Tipo", p.tipo],
    ["Barrio", p.barrio || p.zona],
    ["Dirección", p.direccion || p.address],
    ["Ambientes", p.ambientes],
    ["Dormitorios", p.dormitorios],
    ["Baños", p.banos || p.baños],
    ["Superficie", p.superficie ? `${p.superficie} m²` : null]
  ];
  pairs.forEach(([k,v])=>{
    if(v || v === 0){
      const li = document.createElement("li");
      li.innerHTML = `<strong>${k}:</strong> ${v}`;
      car.appendChild(li);
    }
  });

  // Aside rápido
  const dr = $("#datos-rapidos"); dr.innerHTML = "";
  [
    ["Superficie", p.superficie ? `${p.superficie} m²` : "-"],
    ["Ambientes", p.ambientes ?? "-"],
    ["Dormitorios", p.dormitorios ?? "-"],
    ["Baños", (p.banos ?? p.baños) ?? "-"]
  ].forEach(([k,v])=>{
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `<strong>${v}</strong>${k}`;
    dr.appendChild(div);
  });

  $("#id-ref").textContent = p.id ?? p.codigo ?? p.slug ?? "-";
  const dirValue = p.direccion || p.address || "";
  $("#direccion").textContent = dirValue || "—";
  const mapaIframe = document.getElementById("prop-mapa");
  if (mapaIframe && dirValue) {
    const dirLimpia = dirValue.replace(/\s+al\s+/i, " ");
    const q = encodeURIComponent(dirLimpia + ", Mar del Plata, Argentina");
    mapaIframe.src = `https://maps.google.com/maps?q=${q}&output=embed`;
    mapaIframe.style.display = "block";
  }

  // Galería
  renderGaleria(p.imagenes || p.images || []);

  // Acciones
  const msg = encodeURIComponent(`Hola, me interesa la propiedad ${p.direccion || p.address || ""}, ${p.titulo || p.title}. ¿Está disponible?`);
  const waLink = `https://api.whatsapp.com/send?phone=54${WHATSAPP_NUM}&text=${msg}`;
  $("#btn-whatsapp").href = waLink;
  $("#btn-whatsapp-side").href = waLink;
  $("#btn-email").href = `mailto:${EMAIL}?subject=${encodeURIComponent("Consulta propiedad " + (p.id ?? p.codigo ?? p.slug ?? ""))}&body=${msg}`;

  $("#btn-compartir").addEventListener("click", async ()=>{
    const shareData = { title: p.titulo || p.title, text: (p.descripcion || p.description || "").slice(0,120), url: location.href };
    if(navigator.share){ try{ await navigator.share(shareData); }catch{} }
    else { await navigator.clipboard.writeText(location.href); alert("Enlace copiado al portapapeles"); }
  });

  // SEO dinámico
  document.title = `${p.titulo || p.title || "Propiedad"} | Inmobiliaria`;
  setMeta("description", (p.descripcion || p.description || "").slice(0,160));
  setOG("og:title", p.titulo || p.title || "Propiedad");
  setOG("og:description", (p.descripcion || p.description || "").slice(0,160));
  if ((p.imagenes || p.images || [])[0]) setOG("og:image", (p.imagenes || p.images)[0]);

  // Relacionadas
  renderRelacionadas(p);
}

function renderGaleria(imgs){
  const principal = $("#img-principal");
  const thumbs = $("#thumbs");
  thumbs.innerHTML = "";

  if(!imgs || !imgs.length){
    principal.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='500'%3E%3Crect width='800' height='500' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' font-family='sans-serif' font-size='24' fill='%23aaa' text-anchor='middle' dy='.3em'%3ESin imagen disponible%3C/text%3E%3C/svg%3E";
    principal.alt = "Sin imagen disponible";
    return;
  }

  let idx = 0;
  const contador = document.querySelector("#galeria-contador");
  const setIdx = (i)=>{
    idx = i;
    principal.src = imgs[idx];
    principal.alt = `Foto ${idx+1}`;
    const children = [...thumbs.children];
    children.forEach((el,n)=>el.classList.toggle("active", n===idx));
    if (contador) contador.textContent = `${idx + 1} / ${imgs.length}`;
    // Auto-scroll para centrar la miniatura activa
    const activeThumb = children[idx];
    if(activeThumb){
      const thumbsRect = thumbs.getBoundingClientRect();
      const activeRect = activeThumb.getBoundingClientRect();
      const offset = activeRect.left - thumbsRect.left - (thumbsRect.width / 2) + (activeRect.width / 2);
      thumbs.scrollBy({ left: offset, behavior: "smooth" });
    }
  };

  imgs.forEach((src,i)=>{
    const t = document.createElement("img");
    t.loading = "lazy";
    t.src = src;
    t.alt = `Miniatura ${i+1}`;
    t.addEventListener("click", ()=> setIdx(i));
    thumbs.appendChild(t);
  });

  document.querySelector(".ctrl.prev").onclick = ()=> setIdx((idx - 1 + imgs.length) % imgs.length);
  document.querySelector(".ctrl.next").onclick = ()=> setIdx((idx + 1) % imgs.length);
  setIdx(0);

  // Drag-to-scroll en desktop
  let isDown = false, startX, scrollLeft;
  thumbs.addEventListener("mousedown", e=>{
    isDown = true;
    thumbs.classList.add("dragging");
    startX = e.pageX - thumbs.offsetLeft;
    scrollLeft = thumbs.scrollLeft;
  });
  thumbs.addEventListener("mouseleave", ()=>{ isDown = false; thumbs.classList.remove("dragging"); });
  thumbs.addEventListener("mouseup", ()=>{ isDown = false; thumbs.classList.remove("dragging"); });
  thumbs.addEventListener("mousemove", e=>{
    if(!isDown) return;
    e.preventDefault();
    const x = e.pageX - thumbs.offsetLeft;
    const walk = (x - startX) * 1.5;
    thumbs.scrollLeft = scrollLeft - walk;
  });

  // Swipe táctil nativo ya funciona con overflow-x: auto
  // Pero agregamos snap para mejor UX táctil
}

function renderRelacionadas(actual){
  // Si cargamos por fetch, guardamos la lista en window.__ALL_PROPS
  const all = window.__ALL_PROPS || [];
  const relacionadas = all
    .filter(p => (String(p.id ?? p.codigo ?? p.slug) !== String(actual.id ?? actual.codigo ?? actual.slug))
      && ( (p.tipo && actual.tipo && p.tipo===actual.tipo) || (p.barrio && actual.barrio && p.barrio===actual.barrio) ))
    .slice(0,3);

  const grid = document.querySelector("#relacionadas-grid");
  grid.innerHTML = "";
  relacionadas.forEach(p=>{
    const img0 = (p.imagenes || p.images || [])[0] || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='500'%3E%3Crect width='800' height='500' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' font-family='sans-serif' font-size='24' fill='%23aaa' text-anchor='middle' dy='.3em'%3ESin imagen disponible%3C/text%3E%3C/svg%3E";
    const id = encodeURIComponent(String(p.id ?? p.codigo ?? p.slug));
    const a = document.createElement("article");
    a.className = "card";
    a.innerHTML = `
      <a href="propiedad.html?id=${id}">
        <img src="${img0}" class="thumb" alt="${p.titulo || p.title}" loading="lazy">
      </a>
      <div class="body">
        <div class="mb-2"><span class="op-badge">${p.operacion || ""}</span></div>
        <h3 class="title">${p.titulo || p.title}</h3>
        <p class="meta">${[p.tipo, p.barrio, p.superficie ? (p.superficie + " m²") : null].filter(Boolean).join(" • ")}</p>
        <p class="precio">${p.precio ? `${(p.moneda || "U$S")} ${fmtPrecio(p.precio)}` : "Consultar"}</p>
        <a href="propiedad.html?id=${id}" class="btn">Ver más</a>
      </div>
    `;
    grid.appendChild(a);
  });
}

/**********************
 * NAV
 **********************/
function initNav() {
  // Header siempre con clase scrolled en propiedad.html
  const header = document.querySelector('.site-header');
  if (header) header.classList.add('scrolled');

  const toggle = document.querySelector('.nav-toggle');
  const mobileNav = document.getElementById('nav-mobile');
  if (!toggle || !mobileNav) return;
  toggle.addEventListener('click', () => {
    const open = mobileNav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    mobileNav.setAttribute('aria-hidden', open ? 'false' : 'true');
    toggle.querySelector('i').className = open ? 'fa-solid fa-xmark' : 'fa-solid fa-bars';
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.nav-toggle') && !e.target.closest('#nav-mobile')) {
      mobileNav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      mobileNav.setAttribute('aria-hidden', 'true');
      toggle.querySelector('i').className = 'fa-solid fa-bars';
    }
  }, { passive: true });

  const closeNav = () => {
    mobileNav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    mobileNav.setAttribute('aria-hidden', 'true');
    toggle.querySelector('i').className = 'fa-solid fa-bars';
  };

  mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', closeNav));
}

function initSubmenus() {
  document.querySelectorAll('.has-submenu').forEach(li => {
    const btn = li.querySelector('.submenu-toggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const open = !li.classList.contains('open');
      li.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });
  document.addEventListener('click', e => {
    const opened = document.querySelector('.has-submenu.open');
    if (opened && !opened.contains(e.target)) {
      opened.classList.remove('open');
      opened.querySelector('.submenu-toggle')?.setAttribute('aria-expanded', 'false');
    }
  }, { passive: true });
}

function initBtnTop() {
  const btn = document.getElementById('btn-top');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 300);
  }, { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

/**********************
 * INIT ROBUSTO
 **********************/
(async function init(){
  $("#anio").textContent = new Date().getFullYear();
  initNav();
  initSubmenus();
  initBtnTop();

  const idParam = getParam("id");

  // 1) Intento directo a Tokko primero
  if (idParam) {
    try {
      const rawTokko = await fetchTokkoById(idParam);
      const propTokko = mapTokkoToLocal(rawTokko);
      renderProp(propTokko);
      return; // corto acá si Tokko resolvió
    } catch (e) {
      console.warn("[propiedad] Tokko falló o no encontró:", e);
      // sigue el flujo original de JSON local
    }
  }

  // 2) Fetch al JSON (si existe)
  try{
    const resp = await fetch(DATA_URL, { cache: "no-store" });
    if(!resp.ok) {
      console.error("[propiedad] error HTTP al cargar JSON:", resp.status, resp.statusText);
      if (!idParam) return renderNotFound("No se encontró el parámetro ?id y falló la carga de datos.");
      return renderNotFound("No se pudo cargar la base de propiedades.");
    }
    const data = await resp.json();

    // Permitir que el JSON tenga { propiedades: [...] } o directamente [...]
    const all = Array.isArray(data) ? data : (Array.isArray(data?.propiedades) ? data.propiedades : []);
    window.__ALL_PROPS = all; // guardar para relacionadas

    if(!idParam){
      return renderNotFound("Falta el parámetro ?id en la URL.");
    }

    // Match flexible: id | codigo | slug (string vs number)
    const prop = all.find(p => String(p.id ?? p.codigo ?? p.slug) === String(idParam));

    if(!prop){
      return renderNotFound(`No se encontró la propiedad con id "${idParam}". Verificá que el id del link coincida con el del JSON.`);
    }

    renderProp(prop);
    return;
  }catch(e){
    console.error("[propiedad] error en fetch/parsing:", e);
    // Si llegamos acá y no hay prop, mostrar not found
    return renderNotFound("Error al cargar los datos. Revisá la consola (F12) → Console/Network.");
  }
})();