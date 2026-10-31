// Проксі для Rainbow Weather Tiles API (Cloudflare Worker).
// Ховає API-ключ, додає CORS і кешує плитки, щоб економити ліміт запитів.
//
// Змінні Worker:
//   RAINBOW_TOKEN  - ваш ключ Rainbow (додайте як секрет)
//   ALLOWED_ORIGIN - адреса вашого сайту без слеша в кінці,
//                    наприклад https://thei36616-sudo.github.io
export default {
  async fetch(request, env, ctx) {
    const allow = env.ALLOWED_ORIGIN || "*";
    const cors = {
      "Access-Control-Allow-Origin": allow,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: cors });

    // Проста перевірка джерела запиту. Її можна підробити, але вона відсікає випадкове використання.
    if (allow !== "*") {
      const origin = request.headers.get("Origin") || "";
      const referer = request.headers.get("Referer") || "";
      if (origin !== allow && !referer.startsWith(allow + "/")) {
        return new Response("Forbidden", { status: 403, headers: cors });
      }
    }

    const url = new URL(request.url);
    const isSnap = url.pathname === "/tiles/v1/snapshot";
    const isTile = /^\/tiles\/v1\/precip\/\d+\/\d+\/\d{1,2}\/\d+\/\d+$/.test(url.pathname);
    if (!isSnap && !isTile) return new Response("Not found", { status: 404, headers: cors });

    const color = url.searchParams.get("color");
    if (color && !/^[a-z0-9_]{1,12}$/.test(color)) return new Response("Bad request", { status: 400, headers: cors });

    const cache = caches.default;
    const key = new Request(url.origin + url.pathname + (color ? "?color=" + color : ""));
    let res = await cache.match(key);
    if (!res) {
      const up = new URL("https://api.rainbow.ai" + url.pathname);
      if (color) up.searchParams.set("color", color);
      up.searchParams.set("token", env.RAINBOW_TOKEN);
      const r = await fetch(up.toString());
      res = new Response(r.body, r);
      if (r.ok) {
        res.headers.set("Cache-Control", isSnap ? "public, max-age=60" : "public, max-age=3600");
        ctx.waitUntil(cache.put(key, res.clone()));
      }
    }
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
};
