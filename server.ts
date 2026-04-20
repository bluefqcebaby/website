// Static file server for local dev. Run with: bun server.ts
const PORT = 8765;

Bun.serve({
  port: PORT,
  async fetch(req) {
    const { pathname } = new URL(req.url);
    const path = "." + (pathname === "/" ? "/index.html" : pathname);
    const file = Bun.file(path);
    return (await file.exists())
      ? new Response(file)
      : new Response("Not found", { status: 404 });
  },
});

console.log(`→ http://localhost:${PORT}`);
