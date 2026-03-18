interface Env {
  TOKKO_KEY?: string; // secret
}

function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "Content-Type",
      ...extra,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "Content-Type",
        },
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
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "Content-Type",
        },
      });
    }

    // Listado: /property?page=1&limit=12&order_by=price&order=desc
    if (path.startsWith("/property")) {
      const page = url.searchParams.get("page") || "1";
      const limit = url.searchParams.get("limit") || "12";
      const order_by = url.searchParams.get("order_by") || "price";
      const order = url.searchParams.get("order") || "desc";

      // operation_types: acepta "1", "2", "3" o "1,2" via query param
      const opParam = url.searchParams.get("operation_types");
      const operationTypes = opParam
        ? opParam.split(",").map(Number).filter(n => n > 0 && n <= 3)
        : [1, 2, 3];

      const data = {
        current_localization_id: 0,
        current_localization_type: "country",
        operation_types: operationTypes, // 1 venta, 2 alquiler, 3 temporal
        property_types: Array.from({ length: 25 }, (_, i) => i + 1),
        price_from: 0,
        price_to: 999999999,
        currency: "ANY",
        filters: [],
      };

      // ...mantené todo igual arriba (data, page, limit, etc.)
const base =
  `https://www.tokkobroker.com/api/v1/property/?format=json` +
  `&key=${env.TOKKO_KEY}&lang=${lang}` +
  `&limit=${limit}&page=${page}` +  // 👈 sin order_by/order
  `&data=${encodeURIComponent(JSON.stringify(data))}`;

const r = await fetch(base, { headers: { accept: "application/json" } });

      const body = await r.text();
      return new Response(body, {
        status: r.status,
        headers: {
          "content-type": "application/json",
          "cache-control": "max-age=120",
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "Content-Type",
        },
      });
    }

    return new Response("Not Found", { status: 404, headers: { "access-control-allow-origin": "*" } });
  },
} satisfies ExportedHandler<Env>;

