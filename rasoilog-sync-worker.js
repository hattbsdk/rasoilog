/* RasoiLog sync + app-loader worker.
   Bindings required:
     - KV namespace binding named  SYNC  -> namespace "rasoilog-sync"
     - D1 database binding named   DB    -> database  "rasoilog"        */

export default {
  async fetch(req, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,PUT,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(req.url);

    // always-current app code: redirects to whichever build is latest
    if (url.pathname === "/app.js") {
      const row = await env.DB.prepare("SELECT v FROM config WHERE k='core_url'").first();
      return new Response(null, {
        status: 302,
        headers: { ...cors, Location: row.v, "Cache-Control": "no-store" },
      });
    }

    // sync storage: GET/PUT per sync code
    const m = url.pathname.match(/^\/sync\/([a-z0-9-]{6,64})$/);
    if (!m) return new Response("RasoiLog sync server OK", { headers: cors });
    const key = m[1];

    if (req.method === "GET") {
      const v = await env.SYNC.get(key);
      return new Response(v || "null", {
        headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    if (req.method === "PUT") {
      const body = await req.text();
      if (body.length > 1000000) return new Response("too big", { status: 413, headers: cors });
      await env.SYNC.put(key, body);
      return new Response("ok", { headers: cors });
    }
    return new Response("method not allowed", { status: 405, headers: cors });
  },
};
