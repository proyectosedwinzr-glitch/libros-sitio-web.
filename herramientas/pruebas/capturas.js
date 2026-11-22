#!/usr/bin/env node
/*
 * Capturas y accesibilidad de una construcción del sitio (fuera de la construcción: usa npm).
 *
 *   node herramientas/pruebas/capturas.js CARPETA_CONSTRUIDA /hoy/ /es/ [--salida DIR] [--anchos 390,820,1280]
 *   node herramientas/pruebas/capturas.js --prueba     (defectos plantados: tienen que saltar)
 *
 * Para cada página y cada ancho:
 *   - captura de página completa (PNG) en --salida (por defecto: CARPETA_CONSTRUIDA/../capturas);
 *   - axe (WCAG 2.0/2.1 A y AA): cuenta las infracciones por gravedad y lista las graves y críticas;
 *   - red: anota cualquier petición a un dominio que no sea el servidor local (terceros).
 * Sale con 1 si hay infracciones graves/críticas o peticiones a terceros; con 2 si en --prueba
 * algún defecto plantado no salta.
 *
 * Requisitos: Playwright (con su navegador) y axe-core (npm install en esta carpeta).
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const AXE = require.resolve('axe-core/axe.min.js', { paths: [__dirname] });
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.csv': 'text/csv; charset=utf-8', '.xml': 'application/xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

// Servidor estático mínimo con las reglas de Cloudflare Pages que usa el sitio: /x → x.html, /dir/ → dir/index.html.
function servir(raiz) {
  return new Promise(ok => {
    const srv = http.createServer((req, res) => {
      let ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const candidatos = ruta.endsWith('/') ? [ruta + 'index.html'] : [ruta, ruta + '.html', ruta + '/index.html'];
      for (const c of candidatos) {
        const f = path.join(raiz, path.normalize(c).replace(/^(\.\.[/\\])+/, ''));
        if (f.startsWith(raiz) && fs.existsSync(f) && fs.statSync(f).isFile()) {
          res.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' });
          return fs.createReadStream(f).pipe(res);
        }
      }
      res.writeHead(404); res.end('404');
    });
    srv.listen(0, '127.0.0.1', () => ok(srv));
  });
}

async function revisar(navegador, base, ruta, ancho, salida) {
  const movil = ancho < 600;
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: 900 }, isMobile: movil, hasTouch: movil, locale: 'es-CO' });
  const pagina = await ctx.newPage();
  const terceros = [];
  const local = new URL(base).host;
  pagina.on('request', r => { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol) && u.host !== local) terceros.push(r.url()); });
  const errores = [];
  pagina.on('pageerror', e => errores.push(e.message));
  await pagina.goto(base + ruta, { waitUntil: 'networkidle' });
  await pagina.waitForTimeout(300);
  const nombre = (ruta.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'inicio') + `-${ancho}.png`;
  if (salida) await pagina.screenshot({ path: path.join(salida, nombre), fullPage: true });
  await pagina.addScriptTag({ path: AXE });
  const r = await pagina.evaluate(async () => await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
  await ctx.close();
  const graves = r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  return { ruta, ancho, nombre, violaciones: r.violations, graves, terceros, errores };
}

function informe(x) {
  const porImpacto = {};
  x.violaciones.forEach(v => { porImpacto[v.impact] = (porImpacto[v.impact] || 0) + 1; });
  console.log(`${x.ruta} @ ${x.ancho}px · captura ${x.nombre} · axe: ${x.violaciones.length ? JSON.stringify(porImpacto) : 'sin infracciones'}` +
    ` · terceros: ${x.terceros.length}` + (x.errores.length ? ` · errores JS: ${x.errores.length}` : ''));
  x.graves.forEach(v => console.log(`   ✗ [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} elemento/s) → ${v.nodes[0] && v.nodes[0].target.join(' ')}`));
  x.terceros.forEach(u => console.log('   ✗ petición a tercero:', u));
  x.errores.forEach(e => console.log('   ✗ error JS:', e));
}

async function prueba(navegador) {
  // Página con defectos plantados: imagen sin texto alternativo, botón sin nombre, texto con poco contraste
  // y una petición a un dominio de terceros. Cada uno tiene que salir.
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'plantado-'));
  fs.writeFileSync(path.join(dir, 'index.html'), `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Prueba</title></head>
<body><main><h1>Defectos plantados</h1><img src="x.png"><button></button>
<p style="color:#bbb;background:#fff">Texto con poco contraste</p>
<script>fetch('https://tercero.example/pixel').catch(()=>{})</script></main></body></html>`);
  const srv = await servir(dir);
  const base = `http://127.0.0.1:${srv.address().port}`;
  const x = await revisar(navegador, base, '/', 390, null);
  srv.close();
  const ids = new Set(x.violaciones.map(v => v.id));
  const casos = { 'imagen sin texto alternativo': ids.has('image-alt'), 'botón sin nombre': ids.has('button-name'),
    'contraste insuficiente': ids.has('color-contrast'), 'petición a un tercero': x.terceros.some(u => u.includes('tercero.example')) };
  let ok = 0;
  for (const [k, v] of Object.entries(casos)) { console.log(`  defecto «${k}»: ${v ? 'detectado' : 'NO DETECTADO'}`); ok += v; }
  console.log(`Defectos plantados detectados: ${ok}/${Object.keys(casos).length}`);
  return ok === Object.keys(casos).length;
}

(async () => {
  const args = process.argv.slice(2);
  const navegador = await chromium.launch();
  try {
    if (args.includes('--prueba')) { const ok = await prueba(navegador); process.exitCode = ok ? 0 : 2; return; }
    const val = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
    const carpeta = path.resolve(args[0] || '');
    if (!args[0] || !fs.existsSync(carpeta)) throw new Error('Uso: node capturas.js CARPETA_CONSTRUIDA /ruta/ [...]');
    const rutas = args.slice(1).filter((a, i, arr) => a.startsWith('/') && !['--salida', '--anchos'].includes(arr[i - 1]));
    const anchos = (val('--anchos') || '390,820,1280').split(',').map(Number);
    const salida = path.resolve(val('--salida') || path.join(carpeta, '..', 'capturas'));
    fs.mkdirSync(salida, { recursive: true });
    const srv = await servir(carpeta);
    const base = `http://127.0.0.1:${srv.address().port}`;
    let malos = 0;
    for (const ruta of (rutas.length ? rutas : ['/'])) for (const ancho of anchos) {
      const x = await revisar(navegador, base, ruta, ancho, salida);
      informe(x);
      malos += x.graves.length + x.terceros.length;
    }
    srv.close();
    console.log(`Capturas en ${salida}`);
    process.exitCode = malos ? 1 : 0;
  } finally { await navegador.close(); }
})().catch(e => { console.error(e.message); process.exitCode = 3; });
