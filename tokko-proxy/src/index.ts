interface Env {
  TOKKO_KEY?: string; // secret
}

const ALLOWED_ORIGINS = [
  "https://perezcarrazco.com.ar",
  "https://ucielf.github.io", // temporal — quitar cuando el dominio esté activo
];

function corsHeaders(origin: string | null): Record<string, string> {
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "Content-Type",
    };
  }
  return {};
}

function json(data: unknown, status = 200, origin: string | null = null, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      ...corsHeaders(origin),
      ...extra,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get("origin");

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: origin !== null && ALLOWED_ORIGINS.includes(origin) ? 204 : 403,
        headers: corsHeaders(origin),
      });
    }
    if (path === "/") {
      const html = `
<!doctype html>
<html lang="es">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tokko Proxy</title>
<body style="font-family:system-ui,Arial,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;line-height:1.45">
  <h1>Tokko Proxy</h1>
  <p>Service OK. Usá los endpoints:</p>
  <ul>
    <li><a href="/health">/health</a></li>
    <li><a href="/property?page=1&limit=24">/property?page=1&limit=24</a> (listado)</li>
    <li><a href="/property?id=12345">/property?id=12345</a> (detalle)</li>
  </ul>
  <hr>
  <p>Consumilo desde tu web con <code>fetch()</code> para mostrar cards.</p>
</body>
</html>`;
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    // Rutas de ejemplo que tenías
    if (path === "/message") return new Response("Hello, World!");
    if (path === "/random") return new Response(crypto.randomUUID());

    // Validación de secret
    if (!env.TOKKO_KEY) {
      return json({ error: "Falta TOKKO_KEY (cargá el secret en Cloudflare)" }, 500);
    }

    const lang = url.searchParams.get("lang") || "es_ar";

    // Detalle por ID: /property?id=123
    if (path.startsWith("/property") && url.searchParams.get("id")) {
      const id = url.searchParams.get("id")!;
      const apiUrl =
        `https://www.tokkobroker.com/api/v1/property/${id}/?format=json` +
        `&key=${env.TOKKO_KEY}&lang=${lang}`;

      const r = await fetch(apiUrl, { headers: { accept: "application/json" } });
      const body = await r.text(); // pasamos tal cual
      return new Response(body, {
        status: r.status,
        headers: {
          "content-type": "application/json",
          "cache-control": "max-age=300",
          ...corsHeaders(origin),
        },
      });
    }

    // Listado: /property?page=1&limit=50
    // Destacadas: /property?featured=1&limit=6  (filtra server-side por is_starred_on_web)
    if (path.startsWith("/property")) {
      const featured = url.searchParams.get("featured") === "1";
      const page = url.searchParams.get("page") || "1";
      const limit = parseInt(url.searchParams.get("limit") || "12", 10);

      // operation_types: acepta "1", "2", "3" o "1,2" via query param
      const opParam = url.searchParams.get("operation_types");
      const operationTypes = opParam
        ? opParam.split(",").map(Number).filter(n => n > 0 && n <= 3)
        : [1, 2, 3];

      const data = {
        current_localization_id: 0,
        current_localization_type: "country",
        operation_types: operationTypes,
        property_types: Array.from({ length: 25 }, (_, i) => i + 1),
        price_from: 0,
        price_to: 999999999,
        currency: "ANY",
        filters: [],
      };

      // Para destacadas traemos todas y filtramos server-side
      const fetchLimit = featured ? 100 : limit;
      const base =
        `https://www.tokkobroker.com/api/v1/property/?format=json` +
        `&key=${env.TOKKO_KEY}&lang=${lang}` +
        `&limit=${fetchLimit}&page=${page}` +
        `&data=${encodeURIComponent(JSON.stringify(data))}`;

      const r = await fetch(base, { headers: { accept: "application/json" } });

      if (featured) {
        const payload = await r.json() as { objects?: unknown[]; results?: unknown[] };
        const all: unknown[] = payload.objects || payload.results || [];
        const starred = (all as Array<Record<string, unknown>>)
          .filter(p => p.is_starred_on_web === true)
          .slice(0, limit);
        return json({ objects: starred }, r.status, origin, { "cache-control": "max-age=120" });
      }

      const body = await r.text();
      return new Response(body, {
        status: r.status,
        headers: {
          "content-type": "application/json",
          "cache-control": "max-age=120",
          ...corsHeaders(origin),
        },
      });
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders(origin) });
  },
} satisfies ExportedHandler<Env>;

