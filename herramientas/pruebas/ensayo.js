#!/usr/bin/env node
/*
 * Ensayo general de «La historia del día» (docs/hoy/PLAN.md, etapa 4) sobre LA CONSTRUCCIÓN QUE SE VA A SUBIR.
 *
 *   node herramientas/pruebas/ensayo.js CARPETA_CONSTRUIDA MES.json [--salida DIR] [--prueba]
 *
 * Con la fecha del dispositivo en cada día clave (en Bogotá, a las 10 de la mañana), en un móvil de 390 px:
 *   - 30 de noviembre: solo el aviso («La primera historia del día llega el…»), sin cuadrícula;
 *   - 1, 15 y 31 de diciembre: la historia de ese día, sin nota;
 *   - 1 de enero, sin el archivo de enero: la del 31 de diciembre, con la nota amable.
 * En cada uno: ninguna petición a dominios de terceros y ningún error de JavaScript; captura en --salida.
 * Además: la cabecera del catálogo lleva a /hoy/; _redirects (/qr al sitio Amazon, /digital, /historia-del-dia) y
 * version.txt («sitio: completo»).
 * --prueba: antes planta 2 defectos (falta el archivo del 15 de diciembre y una petición a un tercero): tienen que saltar.
 * Sale con 0 si todo va bien, 1 si algo falla, 2 si un defecto plantado no salta.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.xml': 'application/xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf',
  '.csv': 'text/csv; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

function servir(raiz) {   // como Cloudflare Pages, sin 404.html: lo que no existe devuelve la página principal (200)
  return new Promise(ok => {
    const srv = http.createServer((req, res) => {
      const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      for (const c of (ruta.endsWith('/') ? [ruta + 'index.html'] : [ruta, ruta + '.html', ruta + '/index.html'])) {
        const f = path.join(raiz, path.normalize(c).replace(/^(\.\.[/\\])+/, ''));
        if (f.startsWith(raiz) && fs.existsSync(f) && fs.statSync(f).isFile()) {
          res.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' });
          return fs.createReadStream(f).pipe(res);
        }
      }
      res.writeHead(200, { 'Content-Type': TIPOS['.html'] });
      fs.createReadStream(path.join(raiz, 'index.html')).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => ok(srv));
  });
}

const DIAS = [   // [fecha del dispositivo, historia que tiene que salir (null = solo el aviso), principio de la nota]
  ['2026-11-30', null, 'La primera historia del día llega el martes 1 de diciembre de 2026.'],
  ['2026-12-01', '2026-12-01', ''],
  ['2026-12-15', '2026-12-15', ''],
  ['2026-12-31', '2026-12-31', ''],
  ['2027-01-01', '2026-12-31', 'La historia de hoy todavía no está lista. Mientras tanto, aquí tienes la del jueves 31 de diciembre.'],
];

async function unDia(nav, base, fecha, esperada, nota, salida, defecto) {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 850 }, isMobile: true, hasTouch: true, locale: 'es-CO', timezoneId: 'America/Bogota' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const terceros = [], errores = [], local = new URL(base).host;
  await page.route('**/*', r => {
    const u = new URL(r.request().url());
    if (/^https?:$/.test(u.protocol) && u.host !== local) { terceros.push(u.href); return r.abort(); }
    return r.continue();
  });
  page.on('pageerror', e => errores.push(e.message));
  await page.clock.setFixedTime(new Date(`${fecha}T10:00:00-05:00`));
  if (defecto) await defecto(page);
  await page.goto(base + '/hoy/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const estado = await page.evaluate(() => ({
    fecha: document.getElementById('hoy').dataset.fecha,
    rejilla: document.querySelectorAll('#rejilla > button').length,
    nota: ((document.querySelector('#vista .nota') || {}).textContent || '').trim(),
  }));
  const mal = [];
  if (esperada === null) {
    if (estado.rejilla) mal.push('hay cuadrícula antes del lanzamiento');
  } else {
    if (estado.fecha !== esperada) mal.push(`sale la historia del ${estado.fecha || '(ninguna)'} y debería salir la del ${esperada}`);
    if (!estado.rejilla) mal.push('no hay cuadrícula');
  }
  if (!estado.nota.startsWith(nota) || (!nota && estado.nota)) mal.push(`nota: «${estado.nota.slice(0, 80)}»`);
  terceros.forEach(u => mal.push('petición a un tercero: ' + u));
  errores.forEach(e => mal.push('error de JavaScript: ' + e));
  if (salida) await page.screenshot({ path: path.join(salida, `ensayo-${fecha}-390.png`), fullPage: true, animations: 'disabled' });
  await ctx.close();
  return mal;
}

async function main() {
  const args = process.argv.slice(2);
  const libres = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1] === '--salida'));
  if (libres.length < 2) { console.log('Uso: node ensayo.js CARPETA_CONSTRUIDA MES.json [--salida DIR] [--prueba]'); process.exit(1); }
  const raiz = path.resolve(libres[0]);
  const salida = args.includes('--salida') ? path.resolve(args[args.indexOf('--salida') + 1]) : null;
  if (salida) fs.mkdirSync(salida, { recursive: true });
  const srv = await servir(raiz), base = `http://127.0.0.1:${srv.address().port}`;
  const nav = await chromium.launch();
  let fallos = 0;
  try {
    if (args.includes('--prueba')) {
      console.log('Defectos plantados:');
      const plantados = [
        ['falta el archivo del 15 de diciembre (Cloudflare da la página principal)', '2026-12-15', '2026-12-15', '',
          async p => p.route('**/hoy/d/2026-12-15.json', r => r.fulfill({ status: 200, contentType: 'text/html', body: fs.readFileSync(path.join(raiz, 'index.html')) }))],
        ['una petición a un tercero', '2026-12-01', '2026-12-01', '',
          async p => p.addInitScript(() => window.addEventListener('load', () => { fetch('https://tercero.example/x').catch(() => {}); }))],
      ];
      let ok = 0;
      for (const [nombre, fecha, esperada, nota, defecto] of plantados) {
        const salta = (await unDia(nav, base, fecha, esperada, nota, null, defecto)).length > 0;
        ok += salta;
        console.log(`   defecto «${nombre}»: ${salta ? 'detectado' : 'NO DETECTADO'}`);
      }
      console.log(`Defectos plantados detectados: ${ok}/${plantados.length}`);
      if (ok !== plantados.length) { await nav.close(); srv.close(); process.exit(2); }
    }
    console.log('Días clave, con la fecha del dispositivo (390 px):');
    for (const [fecha, esperada, nota] of DIAS) {
      const mal = await unDia(nav, base, fecha, esperada, nota, salida);
      const desc = esperada ? `la historia del ${esperada}${nota ? ', con la nota amable' : ''}` : 'solo el aviso';
      console.log(`   ${fecha}: ${mal.length ? 'FALLO' : desc + '; sin terceros ni errores'}`);
      mal.forEach(m => console.log('      ✗ ' + m));
      fallos += mal.length;
    }
    // La cabecera del catálogo lleva a /hoy/.
    const ctx = await nav.newContext({ viewport: { width: 390, height: 850 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    await p.goto(base + '/', { waitUntil: 'networkidle' });
    const enlace = p.locator('.enlace-hoy a');
    const hay = await enlace.count();
    if (hay) { await enlace.tap(); await p.waitForURL(/\/hoy\/$/, { timeout: 8000 }).catch(() => {}); }
    const llega = /\/hoy\/$/.test(p.url());
    console.log(`   Cabecera del catálogo: ${hay && llega ? 'el enlace lleva a /hoy/' : 'FALLO (sin enlace o no lleva a /hoy/)'}`);
    fallos += !(hay && llega);
    await ctx.close();
  } finally {
    await nav.close();
    srv.close();
  }
  // _redirects y version.txt de la carpeta que se va a subir.
  const r = fs.readFileSync(path.join(raiz, '_redirects'), 'utf8');
  const reglas = Object.fromEntries(r.split('\n').map(l => l.trim().split(/\s+/)).filter(x => x.length >= 2 && !x[0].startsWith('#')).map(x => [x[0], x.slice(1).join(' ')]));
  const esperado = { '/qr': 'https://libros-edwin-zar.pages.dev/ 302', '/qr/': 'https://libros-edwin-zar.pages.dev/ 302',
    '/digital': '/ 302', '/digital/': '/ 302', '/historia-del-dia': '/hoy/ 301' };
  const malR = Object.entries(esperado).filter(([k, v]) => reglas[k] !== v).map(([k, v]) => `${k} → ${reglas[k]} (debería ser ${v})`);
  console.log(`   _redirects: ${malR.length ? 'FALLO ' + malR.join('; ') : '/qr al sitio Amazon, /digital a la principal y /historia-del-dia a /hoy/'}`);
  const v = fs.existsSync(path.join(raiz, 'version.txt')) ? fs.readFileSync(path.join(raiz, 'version.txt'), 'utf8').trim() : '';
  console.log(`   version.txt: ${v.startsWith('sitio: completo ·') ? v : 'FALLO: «' + v + '»'}`);
  fallos += malR.length + !v.startsWith('sitio: completo ·');
  console.log('RESULTADO:', fallos ? `${fallos} problema(s)` : 'todo bien');
  process.exit(fallos ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
