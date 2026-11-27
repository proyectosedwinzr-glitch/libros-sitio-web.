#!/usr/bin/env node
/*
 * Etapa 2 de «La historia del día»: el juego de /hoy/, probado en un navegador (Playwright + axe-core).
 *
 *   node herramientas/pruebas/probar_juego.js CARPETA_CONSTRUIDA MES.json [--salida DIR] [--prueba]
 *
 * CARPETA_CONSTRUIDA: construida con --hoy-fecha 2026-12-04 (su ventana tiene que incluir los días probados).
 * MES.json: el mes validado (privado/hoy/hoy_2026-12.json). Las soluciones salen de ahí, no de la página.
 *
 * 1. Tres días (1 dic.: nivel 1, 9 × 9; 3 y 4 dic.: nivel 2, 10 × 10) en 390, 820 y 1280 px, con la fecha del
 *    dispositivo en ese día: se resuelven tocando la pantalla (palabras por su primera y su última letra o letra a
 *    letra, la frase letra a letra desde el principio, las letras que sobran una a una) y se lee el final exacto.
 * 2. Medidas: casillas de 36 px o más (de 36 a 40 en 390 px); botones, campos y enlaces sueltos de 44 px o más en
 *    390 px; texto de 18 px o más; sin desborde horizontal.
 * 3. axe (WCAG A y AA) antes y después de resolver; ninguna petición a terceros; ningún error de JavaScript.
 * 4. Capturas antes y después de resolver, en los tres anchos (--salida).
 * 5. Comportamiento: guardado al recargar, «Esta semana», «Días anteriores», pistas escalonadas, escribir la frase,
 *    el día que falta (nota amable y el último publicado), la página HTML que da Cloudflare cuando falta un archivo,
 *    antes del lanzamiento, fechas en la dirección, la fecha según la hora del dispositivo y la página sin JavaScript.
 * Con --prueba, antes planta defectos que tienen que saltar (regla 7 de CLAUDE.md): 11 en la página (final distinto,
 * palabra en otras casillas, casillas chicas o grandes, texto y botón chicos, tercero, error de JavaScript, el final a la
 * vista, imagen sin texto alternativo, letras compartidas sin pintar) y 14 en una copia de juego.js servida en lugar de la buena (semana desde el domingo,
 * pistas sin escalonar, fecha en UTC, JSON de otro día aceptado, días futuros, sin guardado, sin aviso de lanzamiento,
 * toques sueltos que estropean la selección, «Empezar de nuevo» sin confirmar, una letra de la cuadrícula en el texto de
 * compartir, el botón del libro a otra parte, el formulario que no aparece y sin nota amable): cada uno lo tiene que detectar la comprobación que lo vigila.
 * Sale con 0 si todo va bien; 1 si algo falla; 2 si un defecto plantado no salta.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const AXE = require.resolve('axe-core/axe.min.js', { paths: [__dirname] });
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.xml': 'application/xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf',
  '.csv': 'text/csv; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

// Como Cloudflare Pages: /x → x.html, /dir/ → dir/index.html y, como el sitio no tiene 404.html, cualquier
// dirección que no exista devuelve la página principal con código 200 (lo que tiene que saber rechazar el juego).
function servir(raiz) {
  return new Promise(ok => {
    const srv = http.createServer((req, res) => {
      const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const candidatos = ruta.endsWith('/') ? [ruta + 'index.html'] : [ruta, ruta + '.html', ruta + '/index.html'];
      for (const c of candidatos) {
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

// Normalización propia de la prueba (independiente de la del juego): mayúsculas, sin tildes salvo la Ñ, solo letras.
const norm = s => s.toUpperCase().normalize('NFD').replace(/[̀-̂̄-ͯ]/g, '').normalize('NFC').replace(/[^A-ZÑ]/g, '');

// La solución de un día, calculada aquí desde el mes validado.
function solucion(h) {
  const N = h.cuadricula.lado, k = ([f, c]) => f * N + c;
  const palabras = h.pagina.lista.map(w => {
    const c = h.cuadricula.colocadas.find(x => x[0] === w && Array.isArray(x[3]));
    return { w, celdas: c[2].map(k) };
  });
  const frase = h.frase_recorrido.map(k);
  const ocupadas = new Set([...frase, ...palabras.flatMap(p => p.celdas)]);
  const sobran = [];
  for (let c = 0; c < N; c++) for (let f = 0; f < N; f++) if (!ocupadas.has(f * N + c)) sobran.push(f * N + c);
  const letra = x => h.cuadricula.filas[Math.floor(x / N)][x % N];
  if (sobran.map(letra).join('') !== norm(h.mensaje)) throw new Error(`El mes no cuadra en ${h.fecha}: revisa el validador`);
  return { N, palabras, frase, sobran, letra };
}

// Barajar con semilla (para tocar las letras que sobran en un orden distinto cada vez, pero repetible).
function barajar(lista, semilla) {
  const a = lista.slice();
  let s = semilla >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const instante = (fecha, hora = '10:00:00', zona = '-05:00') => new Date(`${fecha}T${hora}${zona}`);

async function contexto(nav, ancho, zona = 'America/Bogota', js = true) {
  const tactil = ancho < 1000;
  return nav.newContext({ viewport: { width: ancho, height: 900 }, isMobile: tactil, hasTouch: tactil, locale: 'es-CO',
    timezoneId: zona, javaScriptEnabled: js });
}

// Abre /hoy/ con la fecha del dispositivo fijada. Anota peticiones a terceros (y las corta) y errores de JavaScript.
let JUEGO_MUTADO = null;   // en los defectos plantados del comportamiento: un juego.js con un fallo a propósito
async function abrir(ctx, base, ruta, cuando, defecto) {
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const reg = { terceros: [], errores: [] };
  const local = new URL(base).host;
  await page.route('**/*', r => {
    const u = new URL(r.request().url());
    if (/^https?:$/.test(u.protocol) && u.host !== local) { reg.terceros.push(u.href); return r.abort(); }
    if (JUEGO_MUTADO && u.pathname === '/hoy/juego.js') return r.fulfill({ status: 200, contentType: 'text/javascript', body: JUEGO_MUTADO });
    return r.continue();
  });
  page.on('pageerror', e => reg.errores.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/net::ERR_FAILED/.test(m.text())) reg.errores.push('consola: ' + m.text()); });
  page.on('dialog', d => d.accept());
  try { await page.clock.setFixedTime(cuando); } catch (e) { /* sin JavaScript no hay reloj que fijar */ }
  if (defecto && defecto.antes) await defecto.antes(page);
  await page.goto(base + ruta, { waitUntil: 'networkidle' });
  if (defecto && defecto.despues) await defecto.despues(page);
  return { page, reg };
}

const listo = (page, fecha) => page.waitForFunction(f => {
  const m = document.getElementById('hoy');
  return m && m.dataset.fecha === f && document.querySelectorAll('#rejilla > button').length > 0;
}, fecha, { timeout: 8000 });

// Medidas en la página tal como se ve (en estas capturas, 1 px de la captura = 1 px de CSS).
async function medir(page) {
  return page.evaluate(() => {
    const visible = el => {
      if (el.closest('.sr, [hidden], script, style, svg, template')) return false;
      const s = getComputedStyle(el), q = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && q.width > 0 && q.height > 0;
    };
    const desc = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '') +
      ` «${(el.textContent || el.value || '').trim().slice(0, 30)}»`;
    // Contra el ancho de la ventana de diseño (clientWidth): en un móvil, innerWidth crece si la página se encoge para caber.
    const r = { celdas: [], pequenos: [], textoChico: [],
      desborde: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth };
    document.querySelectorAll('#rejilla > button').forEach(b => { const q = b.getBoundingClientRect(); r.celdas.push([q.width, q.height]); });
    document.querySelectorAll('button, summary, input, a').forEach(el => {
      if (el.closest('#rejilla') || !visible(el)) return;
      // Un enlace dentro de una frase (con más texto alrededor) va con el texto; los demás, 44 × 44 px.
      if (el.tagName === 'A' && el.parentElement && el.parentElement.textContent.trim().length > el.textContent.trim().length + 2) return;
      const q = el.getBoundingClientRect();
      if (q.width < 44 - 0.5 || q.height < 44 - 0.5) r.pequenos.push(`${desc(el)}: ${q.width.toFixed(1)} × ${q.height.toFixed(1)} px`);
    });
    document.querySelectorAll('body *').forEach(el => {
      const conTexto = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
      if (!conTexto || !visible(el)) return;
      const t = parseFloat(getComputedStyle(el).fontSize);
      if (t < 18 - 0.05) r.textoChico.push(`${desc(el)}: ${t} px`);
    });
    return r;
  });
}

function revisarMedidas(m, ancho, problemas) {
  const chicas = m.celdas.filter(([w, h]) => w < 36 - 0.5 || h < 36 - 0.5);
  if (chicas.length) problemas.push(['casilla', `${chicas.length} casillas de menos de 36 px (p. ej. ${chicas[0].map(v => v.toFixed(1)).join(' × ')})`]);
  if (ancho <= 390) {
    const grandes = m.celdas.filter(([w, h]) => w > 40 + 0.5 || h > 40 + 0.5);
    if (grandes.length) problemas.push(['casilla', `${grandes.length} casillas de más de 40 px en ${ancho} px`]);
    m.pequenos.forEach(p => problemas.push(['boton', `menor de 44 px: ${p}`]));
  }
  m.textoChico.slice(0, 5).forEach(t => problemas.push(['texto', `texto de menos de 18 px: ${t}`]));
  if (m.desborde > 0) problemas.push(['desborde', `la página se sale ${m.desborde} px por la derecha`]);
}

async function axe(page) {
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
  const r = await page.evaluate(async () => await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
  return r.violations;
}

function revisarAxe(v, cuando, problemas, info) {
  v.forEach(x => {
    const t = `axe ${cuando}: [${x.impact}] ${x.id} (${x.nodes.length}) → ${x.nodes[0] && x.nodes[0].target.join(' ')}`;
    if (x.impact === 'serious' || x.impact === 'critical') problemas.push(['axe', t]); else info.push(t);
  });
}

const textos = (page, sel) => page.$$eval(sel, els => els.map(e => e.textContent));
const celda = (page, x) => page.locator('#rejilla > button').nth(x);
async function tocar(page, x, tactil) { const b = celda(page, x); if (tactil) await b.tap(); else await b.click(); }
async function pulsar(page, sel, tactil) { const b = page.locator(sel); if (tactil) await b.tap(); else await b.click(); }
const guardado = (page, fecha) => page.evaluate(f => { try { return (JSON.parse(localStorage.getItem('lch-hoy-v1')) || {})[f] || null; } catch (e) { return 'ilegible'; } }, fecha);

/* ---------- 1–4: resolver un día tocando la pantalla ---------- */
async function resolverDia(nav, base, h, ancho, opciones = {}) {
  const { salida, defecto, orden = 'palabras', completarBoton = false } = opciones;
  const S = solucion(h), tactil = ancho < 1000, problemas = [], info = [];
  const ctx = await contexto(nav, ancho);
  const { page, reg } = await abrir(ctx, base, '/hoy/', instante(h.fecha), defecto);
  try {
    await listo(page, h.fecha);
    await page.waitForTimeout(150);
    // La página tal como llega: la historia del día del dispositivo, con la frase y el nivel del JSON (sin recalcular).
    if ((await page.textContent('h1')).trim() !== h.titulo) problemas.push(['pagina', 'el título no es el de la historia del día']);
    const nivel = (await page.textContent('.nivel')).trim();
    if (nivel !== 'Nivel ' + h.tipo.replace('nivel', '')) problemas.push(['pagina', `nivel «${nivel}» y el JSON dice ${h.tipo}`]);
    const ind = (await page.textContent('.indicaciones')).trim();
    if (ind !== h.pagina.indicaciones) problemas.push(['pagina', 'las indicaciones no son las del JSON']);
    const visibles = Array.from(h.pagina.frase_visible.join('')).map(ch => (ch === '_' ? '' : ch));
    if ((await textos(page, '#patron .letra')).join('|') !== visibles.join('|')) problemas.push(['pagina', 'la frase a la vista no es la del JSON']);
    if ((await page.locator('#rejilla > button').count()) !== S.N * S.N) problemas.push(['pagina', 'la cuadrícula no tiene el tamaño del JSON']);
    if ((await textos(page, '#rejilla > button')).join('') !== h.cuadricula.filas.flat().join('')) problemas.push(['pagina', 'las letras de la cuadrícula no son las del JSON']);
    if (await page.evaluate(m => document.body.textContent.includes(m), h.mensaje)) problemas.push(['final', 'el final se ve antes de resolver']);

    revisarMedidas(await medir(page), ancho, problemas);
    revisarAxe(await axe(page), 'antes', problemas, info);
    if (salida) await page.screenshot({ path: path.join(salida, `${h.fecha}-${ancho}-antes.png`), fullPage: true, animations: 'disabled' });

    const palabras = async () => {
      for (const [i, p] of S.palabras.entries()) {
        const cuales = i % 2 === 0 ? [p.celdas[0], p.celdas[p.celdas.length - 1]] : p.celdas;   // atajo o letra a letra
        for (const x of cuales) await tocar(page, x, tactil);
        const hecha = await page.locator('#lista .pal').nth(i).getAttribute('class');
        if (!/\bhecha\b/.test(hecha)) { problemas.push(['palabra', `${p.w} no se marcó al tocarla`]); await pulsar(page, '#limpiar', tactil); }
        const sinPintar = await page.$$eval('#rejilla > button', (bs, cs) => cs.filter(x => !bs[x].classList.contains('on')).length, p.celdas);
        if (sinPintar) problemas.push(['pintado', `${p.w}: ${sinPintar} de sus letras no se pintan al encontrarla`]);
      }
    };
    const frase = async () => {
      const k = Math.min(5, S.frase.length - 1);
      for (const [j, x] of S.frase.entries()) {
        await tocar(page, x, tactil);
        if (j === k - 1) {   // se escribe sola en sus huecos al recorrerla desde el principio
          const vistas = (await textos(page, '#patron .letra')).slice(0, k).join('');
          const esperadas = S.frase.slice(0, k).map(S.letra).join('');
          if (vistas !== esperadas) problemas.push(['frase', `al recorrer la frase se ve «${vistas}» y debería verse «${esperadas}»`]);
        }
      }
      const todas = (await textos(page, '#patron .letra')).join('');
      if (todas !== S.frase.map(S.letra).join('')) problemas.push(['frase', 'la frase encontrada no se ve completa']);
      if (!(await page.textContent('#cuenta')).includes('encontrada')) problemas.push(['frase', 'la frase no cuenta como encontrada']);
      const sinPintarF = await page.$$eval('#rejilla > button', (bs, cs) => cs.filter(x => !bs[x].classList.contains('fr')).length, S.frase);
      if (sinPintarF) problemas.push(['pintado', `la frase: ${sinPintarF} de sus letras no se pintan al encontrarla`]);
    };
    if (orden === 'frase') { await frase(); await palabras(); } else { await palabras(); await frase(); }

    // Con todo encontrado, las que sobran laten; al tocarlas caen en su hueco.
    const laten = await page.locator('#rejilla > button.sobra.pulso').count();
    if (laten !== S.sobran.length) problemas.push(['final', `laten ${laten} letras y sobran ${S.sobran.length}`]);
    const orden2 = barajar(S.sobran, h.fecha.split('-').join('') * 1 + ancho);
    const hasta = completarBoton ? Math.floor(orden2.length / 2) : orden2.length;
    for (const x of orden2.slice(0, hasta)) await tocar(page, x, tactil);
    if (completarBoton) await pulsar(page, '#leer-todo', tactil);
    await page.waitForTimeout(250);
    const ranuras = (await textos(page, '#ranuras .letra')).join('');
    if (ranuras !== norm(h.mensaje)) problemas.push(['final', `en los huecos se lee «${ranuras}»`]);
    const fin = await page.locator('#resuelta .final-texto').textContent().catch(() => null);
    if (fin !== `«${h.mensaje}»`) problemas.push(['final', `el final en limpio es «${fin}» y debería ser «${h.mensaje}»`]);
    if (!(await page.locator('#resuelta').isVisible())) problemas.push(['final', 'el bloque del final no se ve']);
    const g = await guardado(page, h.fecha);
    if (!g || g.r !== true || g.w.length !== S.palabras.length || g.f !== true || g.m.length !== S.sobran.length) problemas.push(['guardado', `lo guardado no dice resuelta: ${JSON.stringify(g)}`]);

    revisarMedidas(await medir(page), ancho, problemas);
    revisarAxe(await axe(page), 'resuelta', problemas, info);
    if (salida) await page.screenshot({ path: path.join(salida, `${h.fecha}-${ancho}-resuelta.png`), fullPage: true, animations: 'disabled' });

    // Recargar: sigue resuelta (localStorage), con el final en limpio.
    await page.reload({ waitUntil: 'networkidle' });
    await listo(page, h.fecha);
    const fin2 = await page.locator('#resuelta .final-texto').textContent().catch(() => null);
    if (fin2 !== `«${h.mensaje}»` || (await page.locator('#lista .pal.hecha').count()) !== S.palabras.length) problemas.push(['guardado', 'al recargar no sigue resuelta']);
  } catch (err) {
    problemas.push(['error', 'la prueba no pudo seguir: ' + err.message.split('\n')[0]]);
  }
  reg.terceros.forEach(u => problemas.push(['tercero', 'petición a un tercero: ' + u]));
  reg.errores.forEach(e => problemas.push(['errorjs', 'error de JavaScript: ' + e]));
  await ctx.close();
  return { problemas, info };
}

/* ---------- 5: comportamiento ---------- */
async function comportamiento(nav, base, mes, raiz) {
  const H = Object.fromEntries(mes.historias.map(h => [h.fecha, h]));
  const mal = [];
  const comprobar = (ok, texto) => { console.log(`   ${ok ? '✓' : '✗'} ${texto}`); if (!ok) mal.push(texto); };
  const nota = async page => ((await page.locator('#vista .nota').first().textContent().catch(() => '')) || '').trim();
  const fecha = page => page.getAttribute('#hoy', 'data-fecha');
  // Si una comprobación se atasca, cuenta como fallo y se sigue con las demás.
  const bloque = async (nombre, fn) => {
    try { await fn(); } catch (e) { comprobar(false, `${nombre}: la prueba no pudo seguir (${e.message.split('\n')[0]})`); }
  };

  // Guardado, «Esta semana» y «Días anteriores», en un mismo navegador (como una persona de verdad).
  await bloque('Guardado, semana y días anteriores', async () => {
    const ctx = await contexto(nav, 390);
    let { page } = await abrir(ctx, base, '/hoy/', instante('2026-12-01'));
    await listo(page, '2026-12-01');
    const S = solucion(H['2026-12-01']);
    for (const p of S.palabras) { await tocar(page, p.celdas[0], true); await tocar(page, p.celdas[p.celdas.length - 1], true); }
    for (const x of S.frase) await tocar(page, x, true);
    await pulsar(page, '#leer-todo', true);
    comprobar((await page.locator('#resuelta .final-texto').textContent()) === `«${H['2026-12-01'].mensaje}»`, 'El 1 de diciembre se resuelve con «Completar el final»');
    await page.close();
    ({ page } = await abrir(ctx, base, '/hoy/', instante('2026-12-04')));
    await listo(page, '2026-12-04');
    const semana = (await page.textContent('.semana')).trim();
    comprobar(semana === 'Esta semana: 1 de 6', `El 4 de diciembre, con el 1 resuelto: «${semana}» (la semana del lanzamiento tiene 6 historias)`);
    const dias = await textos(page, '.dias-lista li');
    comprobar(dias.length === 3 && /Martes 1 de diciembre.*✓ Resuelta/.test(dias[2]) && !/Resuelta/.test(dias[0]),
      `«Días anteriores» el 4: ${dias.length} días (3, 2 y 1 de diciembre), el 1 marcado como resuelto`);
    await page.close();
    ({ page } = await abrir(ctx, base, '/hoy/', instante('2026-12-07')));
    await listo(page, '2026-12-07');
    const semana2 = (await page.textContent('.semana')).trim();
    comprobar(semana2 === 'Esta semana: 0 de 7', `El lunes 7 la semana vuelve a empezar, sin rachas: «${semana2}»`);
    const dias2 = await textos(page, '.dias-lista li');
    comprobar(dias2.length === 6 && dias2.some(d => /Martes 1 de diciembre.*Resuelta/.test(d)), `«Días anteriores» el 7: ${dias2.length} días (del 6 al 1; el 30 de noviembre no existe)`);
    await page.locator('.dias-lista a', { hasText: 'Miércoles 2 de diciembre' }).tap();
    await listo(page, '2026-12-02');
    comprobar((await nota(page)).startsWith('Es la historia del miércoles 2 de diciembre.'), 'Un día anterior se abre desde la lista, con una nota y el enlace a la de hoy');
    await page.locator('#vista .nota a').tap();
    await listo(page, '2026-12-07');
    comprobar(await fecha(page) === '2026-12-07', '«Ir a la de hoy» vuelve al día del dispositivo');
    await ctx.close();
  });

  // Pistas escalonadas, sin límite, contadas; y escribir la frase.
  await bloque('Pistas y escribir la frase', async () => {
    const ctx = await contexto(nav, 390);
    const { page } = await abrir(ctx, base, '/hoy/', instante('2026-12-03'));
    await listo(page, '2026-12-03');
    const h = H['2026-12-03'], S = solucion(h);
    const conPista = () => page.$$eval('#rejilla > button', bs => bs.map((b, i) => (b.classList.contains('pista') ? i : -1)).filter(i => i >= 0));
    await pulsar(page, '#pista', true);
    let p = await conPista();
    comprobar(p.length === 1 && p[0] === S.palabras[0].celdas[0], `1.ª pista: parpadea la primera letra de ${S.palabras[0].w}`);
    await pulsar(page, '#pista', true);
    p = await conPista();
    comprobar(p.length === S.palabras[0].celdas.length && S.palabras[0].celdas.every(x => p.includes(x)), `2.ª pista: parpadea ${S.palabras[0].w} entera`);
    await page.fill('#f-in', 'esto no es');
    await page.locator('#f-form button').tap();
    comprobar((await page.textContent('#f-msg')).startsWith('Todavía no.'), 'Una frase mal escrita: «Todavía no…», sin regañar');
    await page.fill('#f-in', h.frase.toLowerCase());
    await page.locator('#f-form button').tap();
    const patron = (await textos(page, '#patron .letra')).join('');
    comprobar(patron === S.frase.map(S.letra).join('') && !(await page.locator('#f-form').isVisible()), 'La frase escrita bien (en minúsculas y con tildes) se completa arriba');
    for (const q of S.palabras) { await tocar(page, q.celdas[0], true); await tocar(page, q.celdas[q.celdas.length - 1], true); }
    await pulsar(page, '#pista', true);
    p = await conPista();
    comprobar(p.length === 1 && p[0] === S.frase[0], '3.ª pista, con las palabras ya encontradas: la primera casilla de la frase');
    await tocar(page, S.frase[0], true); await tocar(page, S.frase[1], true);
    await pulsar(page, '#pista', true);
    p = await conPista();
    comprobar(p.length === 1 && p[0] === S.frase[2], '4.ª pista, con dos letras de la frase tocadas: la casilla siguiente');
    for (const x of S.frase.slice(2)) await tocar(page, x, true);
    for (const x of S.sobran) await tocar(page, x, true);
    const res = (await page.textContent('#resuelta .pistas-n')).trim();
    comprobar(res === 'Resuelta con 4 pistas.', `Las pistas se cuentan (para compartir): «${res}»`);
    comprobar(((await guardado(page, '2026-12-03')) || {}).p === 4, 'Y se guardan con la historia');
    await ctx.close();
  });

  // Un toque suelto no estropea la selección; uno de más en medio de la frase no borra lo recorrido.
  await bloque('Toques sueltos', async () => {
    const ctx = await contexto(nav, 390);
    const { page, reg } = await abrir(ctx, base, '/hoy/', instante('2026-12-01'));
    await listo(page, '2026-12-01');
    const S = solucion(H['2026-12-01']), w = S.palabras[0];
    await tocar(page, S.sobran[0], true);                     // un toque suelto (una letra que sobra)
    await tocar(page, w.celdas[0], true); await tocar(page, w.celdas[w.celdas.length - 1], true);
    comprobar((await page.locator('#lista .pal').nth(0).getAttribute('class')).includes('hecha'),
      `Un toque suelto antes no estropea la palabra: ${w.w} se encuentra con su primera y su última letra`);
    for (const x of S.frase.slice(0, 4)) await tocar(page, x, true);
    await tocar(page, S.sobran[1], true);                     // un toque de más en medio de la frase
    const aviso = (await page.textContent('#aviso')).trim();
    const vistas = (await textos(page, '#patron .letra')).slice(0, 4).join('');
    comprobar(aviso.startsWith('Esa letra no sigue tu selección') && vistas === S.frase.slice(0, 4).map(S.letra).join(''),
      'Un toque de más en medio de la frase se ignora, con un aviso, y no se pierde lo recorrido');
    for (const x of S.frase.slice(4)) await tocar(page, x, true);
    comprobar((await page.textContent('#cuenta')).includes('encontrada'), 'Y la frase se termina sin volver a empezar');
    await tocar(page, S.palabras[1].celdas[0], true); await tocar(page, S.palabras[1].celdas[1], true);
    await tocar(page, S.palabras[1].celdas[1], true);         // tocar otra vez la última letra elegida la quita
    comprobar((await page.locator('#rejilla > button.sel').count()) === 1 && !reg.errores.length, 'Tocar otra vez la última letra elegida la quita');
    await ctx.close();
  });

  // Al resolver (ESPEC §2 y §4): compartir sin ninguna letra de la cuadrícula, el botón al libro y el formulario.
  const figuraEsperada = rec => {   // calculada aquí, aparte del juego: recortada a su caja y de 6 × 6 como mucho
    const fs = rec.map(q => q[0]), cs = rec.map(q => q[1]);
    const f0 = Math.min(...fs), c0 = Math.min(...cs), alto = Math.max(...fs) - f0 + 1, ancho = Math.max(...cs) - c0 + 1;
    const A = Math.min(alto, 6), B = Math.min(ancho, 6);
    const m = Array.from({ length: A }, () => Array(B).fill('⬜'));
    rec.forEach(([f, c]) => { m[Math.floor((f - f0) * A / alto)][Math.floor((c - c0) * B / ancho)] = '🟧'; });
    return m.map(r => r.join(''));
  };
  const MES_CORTO = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sept.', 'oct.', 'nov.', 'dic.'];
  // Línea a línea: fuera del título, la fecha y la dirección, ninguna letra (y la figura, solo cuadrados).
  const revisarCompartido = (texto, h, pistas) => {
    const l = String(texto || '').split('\n'), [a, m, d] = h.fecha.split('-').map(Number), fig = figuraEsperada(h.frase_recorrido);
    const esperado = [`La historia del día · ${d} ${MES_CORTO[m - 1]} ${a}`, `«${h.titulo}»`,
      pistas ? `Resuelta con ${pistas} ${pistas === 1 ? 'pista' : 'pistas'}` : 'Resuelta sin pistas', ...fig, 'ediciones-edwin-zar.pages.dev/hoy'];
    const fallos = [];
    if (l.length !== esperado.length) fallos.push(`${l.length} líneas y deberían ser ${esperado.length}`);
    esperado.forEach((x, i) => { if (l[i] !== x) fallos.push(`línea ${i + 1}: «${l[i]}» y debería ser «${x}»`); });
    l.slice(3, 3 + fig.length).forEach((x, i) => { if (/[^🟧⬜]/u.test(x || '')) fallos.push(`la línea ${i + 4} de la figura no son solo cuadrados`); });
    return fallos;
  };
  const resolverAqui = async (page, h, tactil) => {
    const S = solucion(h);
    for (const q of S.palabras) { await tocar(page, q.celdas[0], tactil); await tocar(page, q.celdas[q.celdas.length - 1], tactil); }
    for (const x of S.frase) await tocar(page, x, tactil);
    await pulsar(page, '#leer-todo', tactil);
  };
  await bloque('Compartir en el móvil y el botón del libro', async () => {
    const ctx = await contexto(nav, 390);
    const { page, reg } = await abrir(ctx, base, '/hoy/', instante('2026-12-01'), { antes: async q => q.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: d => { window.__compartido = d.text; return Promise.resolve(); } });
    }) });
    await listo(page, '2026-12-01');
    const h = H['2026-12-01'];
    await pulsar(page, '#pista', true);      // una pista: el texto tiene que decir «Resuelta con 1 pista»
    await resolverAqui(page, h, true);
    await pulsar(page, '#compartir', true);
    await page.waitForTimeout(200);
    const fallos = revisarCompartido(await page.evaluate(() => window.__compartido), h, 1);
    comprobar(!fallos.length && !reg.errores.length, 'Compartir en el móvil abre su menú con el texto exacto, sin ninguna letra de la cuadrícula' + (fallos.length ? ': ' + fallos[0] : ''));
    const href = await page.getAttribute('.boton-libro', 'href');
    await page.locator('.boton-libro').tap();
    await page.waitForFunction(() => /\/es\/$/.test(location.pathname), null, { timeout: 8000 });
    await page.waitForTimeout(800);
    const ficha = await page.evaluate(() => ({ hash: location.hash, hay: !!document.getElementById('l-letras-con-historia') }));
    comprobar(href === '../es/#es/letras-con-historia' && ficha.hash === '#es/letras-con-historia' && ficha.hay,
      `«Más historias como esta» lleva a la ficha del libro en el catálogo (${href})`);
    await ctx.close();
  });
  await bloque('Compartir en el ordenador', async () => {
    const ctx = await contexto(nav, 1280);
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
    const { page, reg } = await abrir(ctx, base, '/hoy/', instante('2026-12-03'));
    await listo(page, '2026-12-03');
    const h = H['2026-12-03'];
    await resolverAqui(page, h, false);
    await pulsar(page, '#compartir', false);
    await page.waitForTimeout(300);
    const fallos = revisarCompartido(await page.evaluate(() => navigator.clipboard.readText()), h, 0);
    const aviso = (await page.textContent('#compartir-msg')).trim();
    comprobar(!fallos.length && aviso.startsWith('Copiado') && !reg.errores.length,
      'Compartir en el ordenador copia el texto exacto («Copiado»)' + (fallos.length ? ': ' + fallos[0] : ''));
    await ctx.close();
  });
  await bloque('El formulario de correo, al resolver', async () => {
    const ctx = await contexto(nav, 390);
    const original = fs.readFileSync(path.join(raiz, 'hoy', 'index.html'), 'utf8');
    const conForm = original.replace('<p class="pie">', '<section class="correo" id="correo" hidden aria-labelledby="t-correo">' +
      '<h2 id="t-correo">Recibe cada domingo las historias de la semana</h2><form method="post" action="https://correo.example/f">' +
      '<label for="em">Tu correo</label><input type="email" id="em" name="email"><button type="submit">Apuntarme</button></form>' +
      '<p class="correo-nota">Nota. <a href="../privacidad/">Cómo tratamos tus datos</a>.</p></section><p class="pie">');
    if (conForm === original) throw new Error('no se pudo poner el formulario de prueba en la página');
    const { page, reg } = await abrir(ctx, base, '/hoy/', instante('2026-12-02'),
      { antes: async q => q.route('**/hoy/', r => r.fulfill({ status: 200, contentType: 'text/html', body: conForm })) });
    await listo(page, '2026-12-02');
    const antes = await page.locator('#correo').isVisible().catch(() => false);
    await resolverAqui(page, H['2026-12-02'], true);
    const despues = await page.locator('#resuelta #correo').isVisible();
    comprobar(!antes && despues && !reg.terceros.length,
      'El formulario de correo aparece al resolver, dentro del final, y no llama a nadie hasta que se envía');
    await ctx.close();
  });

  // «Empezar de nuevo» se confirma en la página: el primer toque pregunta y el segundo borra (las pistas se quedan).
  await bloque('Empezar de nuevo', async () => {
    const ctx = await contexto(nav, 390);
    const { page, reg } = await abrir(ctx, base, '/hoy/', instante('2026-12-04'));
    await listo(page, '2026-12-04');
    const S = solucion(H['2026-12-04']);
    await tocar(page, S.palabras[0].celdas[0], true); await tocar(page, S.palabras[0].celdas[S.palabras[0].celdas.length - 1], true);
    await pulsar(page, '#pista', true);
    await pulsar(page, '#reiniciar', true);
    const etiqueta = (await page.textContent('#reiniciar')).trim();
    comprobar(etiqueta === 'Sí, empezar de nuevo' && (await page.locator('#lista .pal.hecha').count()) === 1 && !reg.errores.length,
      `«Empezar de nuevo»: el primer toque solo pregunta, en la página («${etiqueta}»), y no borra nada`);
    await pulsar(page, '#reiniciar', true);
    const g = (await guardado(page, '2026-12-04')) || {};
    comprobar((await page.locator('#lista .pal.hecha').count()) === 0 && Array.isArray(g.w) && g.w.length === 0 && g.p === 1 &&
      (await page.textContent('#reiniciar')).trim() === 'Empezar de nuevo', 'Al confirmar, se borra lo encontrado y se guardan las pistas pedidas');
    await ctx.close();
  });

  // El día que falta, la página HTML que da Cloudflare, antes del lanzamiento y fechas en la dirección.
  const casos = [
    ['1 de enero sin el archivo de enero: el último publicado, con una nota amable', '/hoy/', instante('2027-01-01'), '2026-12-31',
      'La historia de hoy todavía no está lista. Mientras tanto, aquí tienes la del jueves 31 de diciembre.'],
    ['Falta el archivo del día y Cloudflare da la página principal (HTML, 200): se rechaza y se enseña el anterior', '/hoy/',
      instante('2026-12-04'), '2026-12-03', 'La historia de hoy todavía no está lista. Mientras tanto, aquí tienes la del jueves 3 de diciembre.',
      async page => page.route('**/hoy/d/2026-12-04.json', r => r.fulfill({ status: 200, contentType: 'text/html', body: fs.readFileSync(path.join(raiz, 'index.html')) }))],
    ['Llega el JSON de otro día en la dirección de hoy: se rechaza y se enseña el anterior', '/hoy/', instante('2026-12-04'),
      '2026-12-03', 'La historia de hoy todavía no está lista. Mientras tanto, aquí tienes la del jueves 3 de diciembre.',
      async page => page.route('**/hoy/d/2026-12-04.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(path.join(raiz, 'hoy', 'd', '2026-12-03.json')) }))],
    ['Un día futuro en la dirección: no se enseña; sale la de hoy', '/hoy/#2026-12-20', instante('2026-12-04'), '2026-12-04',
      'Esa historia no está disponible. Esta es la de hoy.'],
    ['Un día de hace más de 7 días en la dirección: sale la de hoy', '/hoy/#2026-12-01', instante('2026-12-20'), '2026-12-20',
      'Esa historia no está disponible. Esta es la de hoy.'],
    ['La fecha es la del dispositivo: a las 00:30 del 2 de diciembre en Madrid ya es la del 2', '/hoy/',
      new Date('2026-12-01T23:30:00Z'), '2026-12-02', '', null, 'Europe/Madrid'],
    ['… y en Bogotá, en ese mismo instante (18:30 del 1), sigue siendo la del 1', '/hoy/', new Date('2026-12-01T23:30:00Z'), '2026-12-01', ''],
  ];
  for (const [texto, ruta, cuando, esperada, notaEsperada, antes, zona] of casos) await bloque(texto, async () => {
    const ctx = await contexto(nav, 390, zona || 'America/Bogota');
    const { page, reg } = await abrir(ctx, base, ruta, cuando, antes ? { antes } : null);
    let ok = true;
    try { await listo(page, esperada); await page.waitForTimeout(150); } catch (e) { ok = false; }
    const n = await nota(page);
    comprobar(ok && n === notaEsperada && !reg.errores.length, `${texto} (sale ${await fecha(page)}${n ? `; nota: «${n}»` : ''})`);
    await ctx.close();
  });
  await bloque('El 30 de noviembre, antes del lanzamiento', async () => {
    const ctx = await contexto(nav, 390);
    const { page } = await abrir(ctx, base, '/hoy/', instante('2026-11-30'));
    await page.waitForTimeout(500);
    const n = await nota(page);
    comprobar(n.startsWith('La primera historia del día llega el martes 1 de diciembre de 2026.') &&
      (await page.locator('#rejilla, .tabla').count()) === 0, `El 30 de noviembre, antes del lanzamiento: solo el aviso («${n.slice(0, 60)}…»)`);
    await ctx.close();
  });
  await bloque('Sin JavaScript', async () => {
    const ctx = await contexto(nav, 390, 'America/Bogota', false);
    const { page } = await abrir(ctx, base, '/hoy/', instante('2026-12-04'));
    const sinJs = await page.textContent('#vista');
    comprobar(sinJs.includes('hace falta JavaScript') && (await page.locator('.tabla td').count()) > 0 &&
      !mes.historias.some(h => sinJs.includes(h.mensaje)), 'Sin JavaScript: la historia escrita en la página, para resolverla en papel, sin el final');
    await ctx.close();
  });
  return mal;
}

/* ---------- defectos plantados ---------- */
function defectos(mes, raiz) {
  const h1 = mes.historias.find(h => h.fecha === '2026-12-01');
  const json = f => JSON.parse(fs.readFileSync(path.join(raiz, 'hoy', 'd', f + '.json'), 'utf8'));
  const servirJson = (obj) => async page => page.route('**/hoy/d/2026-12-01.json', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj) }));
  const css = regla => ({ despues: async page => { await listo(page, '2026-12-01'); await page.addStyleTag({ content: regla }); } });
  const finalCambiado = json('2026-12-01');
  finalCambiado.mensaje = finalCambiado.mensaje.replace(/[a-z]/, c => (c === 'x' ? 'y' : 'x'));
  // Las casillas de dos palabras intercambiadas en el JSON servido: la cuadrícula sigue cuadrando, pero al tocar
  // una palabra donde está de verdad, el juego marca la otra.
  const palabraMovida = json('2026-12-01');
  const [a, b] = [1, 2].map(i => palabraMovida.cuadricula.colocadas.find(x => x[0] === h1.pagina.lista[i]));
  [a[2], b[2]] = [b[2], a[2]];
  return [
    ['el final distinto (una letra del final cambiada en el JSON servido)', 'final', { antes: servirJson(finalCambiado) }],
    ['una palabra en otras casillas (el juego no la reconoce donde está)', 'palabra', { antes: servirJson(palabraMovida) }],
    ['casillas de 30 px', 'casilla', css('.lienzo{--celda:30px}')],
    ['casillas de 50 px en 390 px (y la página se sale)', 'desborde', css('.lienzo{--celda:50px}')],
    ['el relato en 15 px', 'texto', css('.relato{font-size:15px}')],
    ['el botón «Pista» de 30 px de alto', 'boton', css('#pista{min-height:0;height:30px;padding:0 4px}')],
    ['una petición a un dominio de terceros', 'tercero', { antes: async page => page.addInitScript(() => { window.addEventListener('load', () => { fetch('https://tercero.example/x').catch(() => {}); }); }) }],
    ['un error de JavaScript', 'errorjs', { antes: async page => page.addInitScript(() => { window.addEventListener('load', () => setTimeout(() => { throw new Error('error plantado'); }, 0)); }) }],
    ['el final a la vista antes de resolver', 'final', { despues: async page => { await listo(page, '2026-12-01'); await page.evaluate(m => { const p = document.createElement('p'); p.textContent = m; document.querySelector('.relato').after(p); }, h1.mensaje); } }],
    ['las letras compartidas, pintadas solo para una palabra (juego.js cambiado)', 'pintado', { antes: async page => {
      const juego = fs.readFileSync(path.join(raiz, 'hoy', 'juego.js'), 'utf8');
      const viejo = 'const suyas = (DUENOS.get(x) || []).filter(';
      if (juego.split(viejo).length !== 2) throw new Error('la sustitución del defecto plantado no encuentra su cadena');
      const malo = juego.replace(viejo, 'const suyas = (DUENOS.get(x) || []).slice(-1).filter(');
      await page.route('**/hoy/juego.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: malo }));
    } }],
    ['una imagen sin texto alternativo', 'axe', { despues: async page => { await listo(page, '2026-12-01'); await page.evaluate(() => { const i = document.createElement('img'); i.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='; i.width = 50; i.height = 50; document.querySelector('.relato').appendChild(i); }); } }],
  ];
}

// Cada mutación cambia una línea de juego.js; con ella, la comprobación que la vigila tiene que fallar.
// Una sustitución que no encuentra su cadena es un fallo de la prueba (regla 7).
const MUTACIONES = [
  ['la semana empieza en domingo', '(deIso(HOY).getDay() + 6) % 7', 'deIso(HOY).getDay()', 'Esta semana'],
  ['las pistas no van escalonadas', 'if (!etapa[p.i])', 'if (true)', '2.ª pista'],
  ['la fecha en UTC, no la del dispositivo', 'aIso(new Date())', 'new Date().toISOString().slice(0, 10)', 'Madrid'],
  ['acepta el JSON de otro día', 'H.fecha !== fecha', 'false', 'JSON de otro día'],
  ['enseña días futuros puestos en la dirección', 'h < HOY && h >= sumar(HOY, -7)', 'h >= sumar(HOY, -7)', 'día futuro'],
  ['no guarda nada', 'localStorage.setItem(GUARDA, JSON.stringify(PROG));', 'void 0;', 'Esta semana'],
  ['antes del lanzamiento deja la historia escrita', 'if (CFG.primera && HOY < CFG.primera)', 'if (false)', '30 de noviembre'],
  ['un toque suelto estropea la selección', 'sel = [x];', 'void 0;', 'toque suelto antes'],
  ['un toque de más borra el recorrido de la frase', 'if (antes.length >= 3) {', 'if (false) {', 'toque de más en medio de la frase'],
  ['«Empezar de nuevo» borra al primer toque', 'if (!b.dataset.seguro) {', 'if (false) {', 'primer toque solo pregunta'],
  ['una letra de la cuadrícula en el texto de compartir', '["La historia del día · " + d.getDate()',
    '["La historia del día · " + H.cuadricula.filas[0][0] + d.getDate()', 'texto exacto'],
  ['el botón del libro lleva a otra parte', `'<a class="b boton-libro" href="' + esc(lib.url) + '"'`, `'<a class="b boton-libro" href="../es/"'`,
    'lleva a la ficha del libro'],
  ['el formulario de correo no aparece al resolver', 'CORREO.hidden = false;', 'CORREO.hidden = true;', 'formulario de correo aparece'],
  ['sin nota amable el día que falta', '"La historia de hoy todavía no está lista. Mientras tanto, aquí tienes la del "', '"Aquí tienes la del "', '1 de enero'],
];

async function main() {
  const args = process.argv.slice(2);
  const opcion = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const libres = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1] === '--salida'));
  if (libres.length < 2) { console.log('Uso: node probar_juego.js CARPETA_CONSTRUIDA MES.json [--salida DIR] [--prueba]'); process.exit(1); }
  const raiz = path.resolve(libres[0]), mes = JSON.parse(fs.readFileSync(libres[1], 'utf8'));
  const salida = opcion('--salida') ? path.resolve(opcion('--salida')) : null;
  if (salida) fs.mkdirSync(salida, { recursive: true });
  const H = Object.fromEntries(mes.historias.map(h => [h.fecha, h]));
  const srv = await servir(raiz), base = `http://127.0.0.1:${srv.address().port}`;
  const nav = await chromium.launch();
  let fallos = 0;
  try {
    if (args.includes('--prueba')) {
      console.log('Defectos plantados (cada uno tiene que saltar):');
      let detectados = 0;
      const lista = defectos(mes, raiz);
      for (const [nombre, tipo, defecto] of lista) {
        const r = await resolverDia(nav, base, H['2026-12-01'], 390, { defecto });
        const salta = r.problemas.some(([t]) => t === tipo);
        detectados += salta;
        console.log(`   defecto «${nombre}»: ${salta ? 'detectado' : 'NO DETECTADO'}${salta ? '' : ' → ' + JSON.stringify(r.problemas.slice(0, 2))}`);
      }
      const juego = fs.readFileSync(path.join(raiz, 'hoy', 'juego.js'), 'utf8');
      for (const [nombre, viejo, nuevo, vigila] of MUTACIONES) {
        const veces = juego.split(viejo).length - 1;
        if (veces !== 1) { console.log(`   ✗ mutación «${nombre}»: su cadena sale ${veces} veces en juego.js (tiene que salir 1)`); continue; }
        JUEGO_MUTADO = juego.replace(viejo, nuevo);
        const log = console.log; console.log = () => {};
        let mal;
        try { mal = await comportamiento(nav, base, mes, raiz); } finally { console.log = log; JUEGO_MUTADO = null; }
        const salta = mal.some(m => m.includes(vigila));
        detectados += salta;
        console.log(`   defecto «${nombre}» (en juego.js): ${salta ? 'detectado' : 'NO DETECTADO'}${salta ? '' : ' → ' + JSON.stringify(mal.slice(0, 2))}`);
      }
      const total = lista.length + MUTACIONES.length;
      console.log(`Defectos plantados detectados: ${detectados}/${total}`);
      if (detectados !== total) { await nav.close(); srv.close(); process.exit(2); }
    }
    console.log('Resolver tocando la pantalla, en 390, 820 y 1280 px:');
    const variantes = { 390: { orden: 'palabras' }, 820: { orden: 'frase' }, 1280: { orden: 'palabras', completarBoton: true } };
    for (const f of ['2026-12-01', '2026-12-03', '2026-12-04']) {
      const h = H[f];
      for (const ancho of [390, 820, 1280]) {
        const r = await resolverDia(nav, base, h, ancho, Object.assign({ salida }, variantes[ancho]));
        console.log(`   ${f} (${h.tipo}, ${h.cuadricula.lado} × ${h.cuadricula.lado}) en ${ancho} px: ` +
          (r.problemas.length ? `${r.problemas.length} problema(s)` : 'resuelta tocando; final exacto; medidas, axe, red y guardado bien'));
        r.problemas.forEach(([t, x]) => console.log(`      ✗ [${t}] ${x}`));
        r.info.forEach(x => console.log(`      · ${x}`));
        fallos += r.problemas.length;
      }
    }
    console.log('Comportamiento (390 px):');
    fallos += (await comportamiento(nav, base, mes, raiz)).length;
  } finally {
    await nav.close();
    srv.close();
  }
  console.log('RESULTADO:', fallos ? `${fallos} problema(s)` : 'todo bien');
  process.exit(fallos ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
