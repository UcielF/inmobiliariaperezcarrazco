/**********************
 * CONFIG
 **********************/
const WHATSAPP_NUM = "2233048966"; // sin + ni 0 ni 15
const EMAIL = "estudiouno@example.com";

import { PROXY } from "./config.js";


// SI USÁS JSON:
const DATA_URL = "data/propiedades.json"; // <-- ajustá ruta real si hace falta

/**********************
 * TOKKO (CONFIG + FETCH + MAP)
 **********************/
const TOKKO_API_KEY = "badb8dc018766247dae1fd1416a428b993ee1bc1"; // <— reemplazá
const TOKKO_BASE = "https://api.tokkobroker.com";



async function fetchTokkoById(id) {
  const url = `${PROXY}publication/${encodeURIComponent(id)}?ts=${Date.now()}`;
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) throw new Error(`Proxy ${resp.status}`);
  const data = await resp.json();
  return data?.data ?? data; // por si el Worker envuelve en {data: ...}
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
  const tipo = p.property_type?.name || p.type || p.category || "";
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
  $("#crumb-titulo").textContent = p.titulo || p.title || "Detalle";
  $("#meta").textContent = [
    p.tipo || p.category,
    p.barrio || p.zona,
    p.direccion || p.direc || p.address,
    p.superficie ? `${p.superficie} m²` : null
  ].filter(Boolean).join(" • ");

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
  $("#direccion").textContent = p.direccion || p.address || "-";

  // Galería
  renderGaleria(p.imagenes || p.images || []);

  // Acciones
  const msg = encodeURIComponent(`Hola, me interesa la propiedad ${p.titulo || p.title} (ID ${p.id ?? p.codigo ?? p.slug}). ¿Está disponible?`);
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
    principal.src = "img/placeholder.jpg";
    principal.alt = "Sin imagen disponible";
    return;
  }

  let idx = 0;
  const setIdx = (i)=>{
    idx = i;
    principal.src = imgs[idx];
    principal.alt = `Foto ${idx+1}`;
    [...thumbs.children].forEach((el,n)=>el.classList.toggle("active", n===idx));
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
    const img0 = (p.imagenes || p.images || [])[0] || "img/placeholder.jpg";
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
 * INIT ROBUSTO
 **********************/
(async function init(){
  $("#anio").textContent = new Date().getFullYear();

  const idParam = getParam("id");
  console.log("[propiedad] id de la URL:", idParam);

  // 1) Intento por sessionStorage (click desde la card)
  try{
    const cached = sessionStorage.getItem("propSel");
    if (cached) {
      const p = JSON.parse(cached);
      console.log("[propiedad] usando sessionStorage propSel con id:", p?.id || p?.codigo || p?.slug);
      renderProp(p);
      return;
    }
  }catch(e){
    console.warn("[propiedad] no se pudo leer sessionStorage:", e);
  }

  // 1.5) Intento directo a Tokko primero
  if (idParam) {
    try {
      console.log("[propiedad] buscando en Tokko id:", idParam);
      const rawTokko = await fetchTokkoById(idParam);
      const propTokko = mapTokkoToLocal(rawTokko);
      console.log("[propiedad] Tokko OK → render");
      renderProp(propTokko);
      return; // corto acá si Tokko resolvió
    } catch (e) {
      console.warn("[propiedad] Tokko falló o no encontró:", e);
      // sigue el flujo original de JSON local
    }
  }

  // 2) Fetch al JSON (si existe)
  try{
    console.log("[propiedad] intentando fetch:", DATA_URL);
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

    console.log("[propiedad] total propiedades cargadas:", all.length);
    if(all.length){
      console.log("[propiedad] ids disponibles (primeros 20):", all.slice(0,20).map(p=>p.id ?? p.codigo ?? p.slug));
    }

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
