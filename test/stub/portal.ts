import { createServer, type Server } from "node:http";

export type PortalMode = "noslots" | "slots" | "login" | "challenge" | "blocked";

const CENTERS = ["Hungary Visa Application Center, Minsk", "Hungary Visa Application Center, Brest"];
const CATEGORIES = ["short term visa C", "long term visa D"];
const SUBS = ["Short-Term VISA 90 days", "Short-Term VISA 30 days"];

const page = (mode: PortalMode) => `<!doctype html><html><head><meta charset="utf-8"><title>VFS stub</title>
<style>mat-option{display:block;cursor:pointer;padding:4px} mat-select{display:block;border:1px solid #888;padding:6px;margin:8px 0;cursor:pointer}</style></head>
<body><h1>Информация о подаче документов</h1>
${[["Центр", CENTERS], ["Категория", CATEGORIES], ["Подкатегория", SUBS]]
  .map(
    ([label, opts], i) => `<div><label>Выберите ${label}*</label>
<mat-select data-i="${i}">${i === 0 ? CENTERS[0] : "Выбрать"}</mat-select>
<div class="panel" style="display:none">${(opts as string[]).map((o) => `<mat-option>${o}</mat-option>`).join("")}</div></div>`,
  )
  .join("")}
<div id="msg"></div>
<button id="go" disabled>Продолжить</button>
<script>
const mode = ${JSON.stringify(mode)};
const chosen = {0: true};
document.querySelectorAll("mat-select").forEach((sel) => {
  const panel = sel.nextElementSibling;
  sel.addEventListener("click", () => { panel.style.display = panel.style.display === "none" ? "block" : "none"; });
  panel.querySelectorAll("mat-option").forEach((opt) => opt.addEventListener("click", () => {
    sel.textContent = opt.textContent; panel.style.display = "none"; chosen[sel.dataset.i] = true;
    if (chosen[0] && chosen[1] && chosen[2]) setTimeout(() => {
      if (mode === "slots") document.getElementById("go").disabled = false;
      else document.getElementById("msg").textContent = "Приносим извинения, в настоящий момент нет доступных слотов для записи.";
    }, 300);
  }));
});
</script></body></html>`;

/** Local stand-in for the VFS page: same flow (3 selects -> message or enabled Continue). */
export function startPortal(): Promise<{ server: Server; url: string; setMode: (m: PortalMode) => void }> {
  let mode: PortalMode = "noslots";
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    if (path.endsWith("/login")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<html><body><h1>Войти</h1><p>Успешно. CLOUDFLARE</p></body></html>");
    } else if (mode === "login") {
      res.writeHead(302, { location: "/blr/ru/hun/login" });
      res.end();
    } else if (mode === "blocked") {
      res.writeHead(429, { "content-type": "text/html" });
      res.end("<html><body>Too many requests</body></html>");
    } else if (mode === "challenge") {
      res.writeHead(403, { "content-type": "text/html" });
      res.end("<html><head><title>Just a moment...</title></head><body>Verify you are human</body></html>");
    } else {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(page(mode));
    }
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      resolve({ server, url: `http://127.0.0.1:${port}/blr/ru/hun`, setMode: (m) => (mode = m) });
    }),
  );
}
