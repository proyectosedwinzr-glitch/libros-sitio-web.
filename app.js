/* Sitio público multilingüe de libros.
   Lee 3 pestañas de Google Sheets (Idiomas, Catalogo, Textos) o, si no hay hoja,
   los archivos CSV de la carpeta /datos. No necesitas editar este archivo. */
(function () {
  'use strict';
  const C = window.CONFIG || {};
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const slug = s => norm(s).replace(/_/g, '-') || 'x';
  const lista = s => String(s || '').split(/[,;]/).map(x => x.trim().toLowerCase()).filter(Boolean);
  const siNo = (v, porDefecto) => { const x = norm(v); if (!x) return porDefecto; return !['no', 'n', 'false', '0', 'oculto'].includes(x); };

  // Textos mínimos por si falla todo lo demás (la hoja "Textos" los reemplaza).
  const DEF = {
    titulo_sitio: 'Libros de {autor}', catalogo: 'Catálogo', comprar: 'Comprar en {tienda}',
    no_en_tienda: 'Aún no está en {tienda}.', proximamente: 'Próximamente', otras_tiendas: 'Otras tiendas Amazon',
    tambien_en: 'También en:', edicion_en: 'Edición en {idioma}', ver_mas: 'Ver más', ver_menos: 'Ver menos',
    sin_libros: 'Pronto habrá libros aquí.', pie: '© {anio} {autor}',
    colombia_titulo: 'Pedidos en Colombia', colombia_boton: 'Hacer mi pedido', colombia_pedir: 'Pedir en Colombia',
    colombia_whatsapp: 'Escribir por WhatsApp', colombia_no_disponible: 'El formulario de pedidos estará disponible muy pronto.',
    aviso_colombia: '¿Estás en Colombia? Pide aquí tus libros y paga por Bre-B.', colombia_seguimiento: 'Consultar mi pedido', aviso_colombia_boton: 'Ir a Colombia'
  };

  DEF.comprar_desde = 'Compro desde:'; DEF.libros_en = 'Libros en {idioma}'; DEF.pais_nota = '¿Tu país no está en la lista? Elige «{pais}» para comprar en Amazon.com, que envía a muchos países.'; DEF.pais_usar = 'Usar Amazon.com';

  // Tiendas de Amazon por país (código ISO). Las 14 primeras son las de libros de tapa blanda en KDP.
  const TIENDAS = {
    US: 'amazon.com', GB: 'amazon.co.uk', DE: 'amazon.de', FR: 'amazon.fr', ES: 'amazon.es', IT: 'amazon.it',
    NL: 'amazon.nl', PL: 'amazon.pl', SE: 'amazon.se', BE: 'amazon.com.be', IE: 'amazon.ie', JP: 'amazon.co.jp',
    CA: 'amazon.ca', AU: 'amazon.com.au', MX: 'amazon.com.mx', BR: 'amazon.com.br', IN: 'amazon.in'
  };
  const TAPA_BLANDA = ['US', 'GB', 'DE', 'FR', 'ES', 'IT', 'NL', 'PL', 'SE', 'BE', 'IE', 'JP', 'CA', 'AU'];
  // Países sin tienda propia → tienda más cercana.
  const CERCANA = { UK: 'GB', AT: 'DE', CH: 'DE', LI: 'DE', LU: 'FR', MC: 'FR', PT: 'ES', AD: 'ES', SM: 'IT', VA: 'IT', NZ: 'AU', DK: 'SE', NO: 'SE', FI: 'SE' };
  const codigoPais = c => { c = String(c || '').trim().toUpperCase(); c = CERCANA[c] || c; return TIENDAS[c] ? c : ''; };
  const codigoDeDominio = d => Object.keys(TIENDAS).find(k => TIENDAS[k] === String(d).replace(/^www\./, '')) || '';
  const etiquetaPais = c => (c === 'GB' ? 'UK' : c);
  const bandera = c => String.fromCodePoint(...[...c].map(x => 127397 + x.charCodeAt(0)));

  // actual = pestaña de libros (idioma en que está escrito el libro, o 'colombia')
  // UI = idioma en que se muestran los textos del sitio (selector 🌐, los 6 idiomas)
  let IDIOMAS = [], VISIBLES = [], LIBROS = [], TEXTOS = {}, actual = 'es', UI = 'es', PAIS = 'US';

  // ---------- Lectura de datos ----------
  function parseCSV(t) {
    t = String(t).replace(/^﻿/, '');
    const filas = []; let fila = [], f = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) {
        if (ch === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { fila.push(f); f = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && t[i + 1] === '\n') i++;
        fila.push(f); filas.push(fila); fila = []; f = '';
      } else f += ch;
    }
    if (f !== '' || fila.length) { fila.push(f); filas.push(fila); }
    return filas.filter(r => r.some(c => c.trim() !== ''));
  }

  function aObjetos(filas) {
    const [cab, ...resto] = filas;
    if (!cab) return [];
    const claves = cab.map(h => { const x = h.trim().toLowerCase(); return x.startsWith('amazon.') ? x : norm(x); });
    return resto.map(r => {
      const o = { tiendas_col: {} };
      claves.forEach((k, i) => {
        const v = (r[i] || '').trim();
        if (k.startsWith('amazon.')) { if (v) o.tiendas_col[k] = v; } else if (k) o[k] = v;
      });
      return o;
    });
  }

  function idHoja() {
    const s = String(C.GOOGLE_SHEET || '').trim();
    const m = s.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
    return m ? m[1] : (/^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : '');
  }

  // Lee una pestaña de Google Sheets; si falla, usa el CSV local. "campo" sirve para comprobar que es la pestaña correcta.
  async function leer(pestana, local, campo) {
    const id = idHoja();
    if (id) {
      try {
        const u = 'https://docs.google.com/spreadsheets/d/' + id + '/gviz/tq?tqx=out:csv&headers=1&sheet=' + encodeURIComponent(pestana);
        const r = await fetch(u, { cache: 'no-store' });
        const t = await r.text();
        if (r.ok && !/^\s*</.test(t)) {
          const o = aObjetos(parseCSV(t));
          if (o.length && campo in o[0]) return o;
        }
        console.warn('No pude leer la pestaña "' + pestana + '" de Google Sheets. Uso ' + local);
      } catch (e) { console.warn('Error leyendo Google Sheets (' + pestana + '):', e); }
    }
    try { const r = await fetch(local, { cache: 'no-cache' }); return aObjetos(parseCSV(await r.text())); }
    catch (e) { console.warn('No pude leer ' + local, e); return []; }
  }

  async function cargar() {
    const [idi, cat, tex] = await Promise.all([
      leer('Idiomas', 'datos/idiomas.csv', 'codigo'),
      leer('Catalogo', 'datos/catalogo.csv', 'titulo'),
      leer('Textos', 'datos/textos.csv', 'clave')
    ]);
    IDIOMAS = idi.filter(i => i.codigo && siNo(i.activo, true)).map(i => ({
      codigo: i.codigo.toLowerCase(),
      nombre: i.nombre || i.codigo,
      respaldoIdiomas: lista(i.mostrar_libros_de)
    }));
    if (!IDIOMAS.length) IDIOMAS = [{ codigo: 'es', nombre: 'Español', respaldoIdiomas: [] }];

    const codigoDe = v => {
      const x = String(v || '').trim().toLowerCase();
      const i = IDIOMAS.find(i => i.codigo === x || norm(i.nombre) === norm(x));
      return i ? i.codigo : x;
    };
    LIBROS = cat.filter(b => b.titulo && siNo(b.visible, true)).map((b, n) => ({
      ...b, n, idioma: codigoDe(b.idioma), grupo: b.grupo || ('_fila' + n),
      orden: isNaN(parseFloat(b.orden)) ? 9999 : parseFloat(b.orden),
      enlaces: enlacesLibro(b),
      asinLimpio: (String(b.asin || '').match(/([A-Z0-9]{10})(?![A-Z0-9])/i) || [])[1] || ''
    }));
    // Solo se muestran las pestañas de idiomas que tienen libros (salvo que config.js diga lo contrario).
    VISIBLES = C.MOSTRAR_PESTANAS_VACIAS ? IDIOMAS : IDIOMAS.filter(L => librosPara(L).length);
    if (!VISIBLES.length) VISIBLES = IDIOMAS.slice(0, 1);

    TEXTOS = {};
    tex.forEach(r => { if (r.clave) TEXTOS[r.clave.trim()] = r; });
  }

  // ---------- Utilidades de presentación ----------
  function t(k, vars, lang) {
    const fila = TEXTOS[k] || {};
    const s = fila[norm(lang || (actual === 'colombia' ? 'es' : UI))] || fila.es || DEF[k] || '';
    const v = Object.assign({ autor: C.AUTOR || '', anio: new Date().getFullYear() }, vars || {});
    return s.replace(/\{(\w+)\}/g, (m, x) => (x in v ? v[x] : m));
  }
  const nombreTienda = d => 'Amazon' + String(d).replace(/^amazon/i, '');
  function nombreIdioma(cod, en) {
    try { const n = new Intl.DisplayNames([en], { type: 'language' }).of(cod); if (n && n !== cod) return n; } catch (e) { /* navegador antiguo */ }
    const i = IDIOMAS.find(i => i.codigo === cod); return i ? i.nombre : cod;
  }
  function urlSegura(u) {
    u = String(u || '').trim();
    return /^https?:\/\//i.test(u) || /^[\w][\w./%-]*$/.test(u) ? u : '';
  }
  // Convierte enlaces de Google Drive en imágenes que sí se pueden mostrar.
  function urlPortada(u) {
    u = String(u || '').trim();
    const m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{20,})/);
    if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w800';
    return urlSegura(u);
  }
  // Convierte el texto en párrafos; las líneas que empiezan con •, * o - se muestran como lista.
  function parrafos(s) {
    let html = '', enLista = false;
    String(s || '').split(/\n+/).map(p => p.trim()).filter(Boolean).forEach(p => {
      const m = p.match(/^[•*\-–]\s*(.*)$/);
      if (m && !enLista) { html += '<ul>'; enLista = true; }
      if (!m && enLista) { html += '</ul>'; enLista = false; }
      html += m ? '<li>' + esc(m[1]) + '</li>' : '<p>' + esc(p) + '</p>';
    });
    return html + (enLista ? '</ul>' : '');
  }

  // ---------- Qué libro y qué enlace mostrar en cada idioma ----------
  function librosPara(L) {
    const grupos = new Map();
    LIBROS.forEach(b => { if (!grupos.has(b.grupo)) grupos.set(b.grupo, []); grupos.get(b.grupo).push(b); });
    const res = [];
    grupos.forEach(eds => {
      let ed = eds.find(e => e.idioma === L.codigo), traducido = true;
      if (!ed) {
        traducido = false;
        for (const r of L.respaldoIdiomas) { ed = eds.find(e => e.idioma === r); if (ed) break; }
      }
      if (ed) res.push({ ed, eds, traducido });
    });
    return res.sort((a, b) => a.ed.orden - b.ed.orden || a.ed.n - b.ed.n);
  }

  // Enlaces de un libro: { 'US': url, 'DE': url, ... }.
  // Con el ASIN se arman solos los de todas las tiendas (o solo las de la columna "Tiendas").
  // Una columna "amazon.xx" con un enlace pegado tiene prioridad sobre el enlace armado.
  function enlacesLibro(b) {
    const m = {};
    const am = String(b.asin || '').match(/(?:\/dp\/|\/gp\/product\/)?([A-Z0-9]{10})(?![A-Z0-9])/i);
    if (am) {
      const asin = am[1].toUpperCase();
      const lst = lista(b.tiendas).map(codigoPais).filter(Boolean);
      (lst.length ? lst : TAPA_BLANDA).forEach(c => { m[c] = 'https://www.' + TIENDAS[c] + '/dp/' + asin; });
    }
    Object.entries(b.tiendas_col || {}).forEach(([d, u]) => { const c = codigoDeDominio(d); if (c && urlSegura(u)) m[c] = u; });
    return m;
  }

  function enlaces(ed) {
    const m = ed.enlaces, codigos = Object.keys(m);
    if (!codigos.length) return { principal: null, todas: [] };
    const principal = m[PAIS] ? PAIS : (m.US ? 'US' : codigos[0]);
    const todas = TAPA_BLANDA.concat(Object.keys(TIENDAS).filter(c => !TAPA_BLANDA.includes(c))).filter(c => m[c]);
    return { principal, url: m[principal], todas, enSuPais: principal === PAIS };
  }

  function nombrePais(c, en) {
    try { const n = new Intl.DisplayNames([en], { type: 'region' }).of(c); if (n) return n; } catch (e) { /* nada */ }
    return etiquetaPais(c);
  }

  function detectarPais() {
    try { const g = codigoPais(localStorage.getItem('pais')); if (g) return g; } catch (e) { /* nada */ }
    for (const l of (navigator.languages || [navigator.language || ''])) {
      const r = codigoPais(String(l).split('-')[1]);
      if (r) return r;
    }
    let zona = ''; try { zona = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* nada */ }
    const porZona = { 'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Berlin': 'DE', 'Europe/Vienna': 'DE', 'Europe/Zurich': 'DE',
      'Europe/Paris': 'FR', 'Europe/Madrid': 'ES', 'Europe/Lisbon': 'ES', 'Europe/Rome': 'IT', 'Europe/Amsterdam': 'NL',
      'Europe/Brussels': 'BE', 'Europe/Warsaw': 'PL', 'Europe/Stockholm': 'SE', 'Asia/Tokyo': 'JP' };
    if (porZona[zona]) return porZona[zona];
    if (/^Australia\//.test(zona)) return 'AU';
    if (/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina)/.test(zona)) return 'CA';
    const base = String(navigator.language || '').split('-')[0];
    return { ja: 'JP', de: 'DE', fr: 'FR', it: 'IT', nl: 'NL', pl: 'PL', sv: 'SE' }[base] || 'US';
  }

  function selectorPais() {
    const usados = new Set(); LIBROS.forEach(b => Object.keys(b.enlaces).forEach(c => usados.add(c)));
    TAPA_BLANDA.forEach(c => usados.add(c)); usados.add(PAIS);
    const ops = [...usados].map(c => [c, nombrePais(c, UI)]).sort((a, b) => a[1].localeCompare(b[1], UI));
    return `<div class="pais"><label><span>🌍 ${esc(t('comprar_desde'))}</span>
      <select id="pais">${ops.map(([c, n]) => `<option value="${c}"${c === PAIS ? ' selected' : ''}>${bandera(c)} ${esc(n)}</option>`).join('')}</select></label>
      <p class="pais-nota">${esc(t('pais_nota', { pais: nombrePais('US', UI) }))}
      ${PAIS !== 'US' ? ` <button type="button" class="usar-us">${esc(t('pais_usar', { pais: nombrePais('US', UI) }))}</button>` : ''}</p></div>`;
  }

  // ---------- Dibujo ----------
  function portadaHTML(ed) {
    const p = urlPortada(ed.portada);
    return p ? `<img class="portada" src="${esc(p)}" alt="${esc(ed.titulo)}" loading="lazy">`
             : `<div class="portada">${esc(ed.titulo)}</div>`;
  }

  function tarjeta({ ed, eds, traducido }, L) {
    const e = enlaces(ed);
    const etq = [];
    if (ed.etiqueta) etq.push(`<span class="etq nuevo">${esc(ed.etiqueta)}</span>`);
    if (!traducido) etq.push(`<span class="etq">${esc(t('edicion_en', { idioma: nombreIdioma(ed.idioma, UI) }))}</span>`);
    const larga = (ed.descripcion || '').length > 260;
    let compra;
    if (e.principal) {
      compra = (e.enSuPais ? '' : `<p class="nota">${esc(t('no_en_tienda', { tienda: nombreTienda(TIENDAS[PAIS]) }))}</p>`) +
        `<a class="btn amz" href="${esc(urlSegura(e.url))}" target="_blank" rel="noopener">${esc(t('comprar', { tienda: nombreTienda(TIENDAS[e.principal]) }))}</a>` +
        (e.todas.length > 1 ? `<details><summary>${esc(t('otras_tiendas'))}</summary><div class="chips">${e.todas.map(c =>
          `<a href="${esc(urlSegura(ed.enlaces[c]))}" target="_blank" rel="noopener" title="${esc(nombrePais(c, UI))} · ${esc(nombreTienda(TIENDAS[c]))}"${c === e.principal ? ' class="on"' : ''}>${bandera(c)} ${etiquetaPais(c)}</a>`).join('')}</div></details>` : '');
    } else compra = `<span class="prox">${esc(t('proximamente'))}</span>`;
    const otras = eds.filter(x => x !== ed && x.idioma !== ed.idioma && VISIBLES.some(i => i.codigo === x.idioma));
    const tambien = otras.length ? `<div class="tambien">${esc(t('tambien_en'))} ${otras.map(x => {
      const i = VISIBLES.find(i => i.codigo === x.idioma);
      return `<a href="#${esc(x.idioma)}/${esc(slug(ed.grupo))}" title="${esc(x.titulo)}" lang="${esc(x.idioma)}">${esc(i.nombre)}</a>`;
    }).join('')}</div>` : '';
    return `<article class="card" id="l-${esc(slug(ed.grupo))}" lang="${esc(ed.idioma)}">
      ${portadaHTML(ed)}
      <h3>${esc(ed.titulo)}</h3>
      ${ed.subtitulo ? `<p class="sub">${esc(ed.subtitulo)}</p>` : ''}
      ${ed.autor ? `<p class="autor">${esc(ed.autor)}</p>` : ''}
      ${etq.length ? `<div class="etiquetas">${etq.join('')}</div>` : ''}
      ${ed.descripcion ? `<div class="desc${larga ? ' corta' : ''}">${parrafos(ed.descripcion)}</div>` +
        (larga ? `<button class="mas" type="button">${esc(t('ver_mas'))}</button>` : '') : ''}
      ${tambien}
      <div class="compra">${compra}</div>
    </article>`;
  }

  function cabecera() {
    document.documentElement.lang = actual === 'colombia' ? 'es-CO' : UI;
    const sel = $('#idioma'); if (sel) { sel.value = UI; sel.disabled = actual === 'colombia'; }
    $('#titulo').textContent = t('titulo_sitio');
    $('#subtitulo').textContent = t('subtitulo_sitio'); $('#subtitulo').hidden = !t('subtitulo_sitio');
    $('#lema').textContent = t('lema');
    document.title = t('titulo_sitio') + (actual === 'colombia' ? ' · Colombia' : '');
    const m = document.querySelector('meta[name=description]'); if (m && t('lema')) m.content = t('lema');
    $('#pie').textContent = t('pie');
    document.querySelectorAll('#pestanas a').forEach(a => {
      const on = a.dataset.p === actual;
      a.classList.toggle('activa', on); a.setAttribute('aria-current', on ? 'page' : 'false');
      if (on) a.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }

  function pintarIdioma(L) {
    const items = librosPara(L);
    $('#contenido').innerHTML = `${selectorPais()}<h2 class="titulo-libros">${esc(t('libros_en', { idioma: nombreIdioma(L.codigo, UI) }))}</h2>` + (items.length
      ? `<div class="grid">${items.map(x => tarjeta(x, L)).join('')}</div>`
      : `<p class="vacio">${esc(t('sin_libros'))}</p>`);
  }

  // Pestaña Colombia: muestra TODOS los libros (de todos los idiomas) con el botón "Pedir en Colombia".
  // El libro se identifica en la app de pedidos por su ASIN (o por "ID Colombia" si lo llenas).
  function pintarColombia() {
    const url = urlSegura(C.URL_COLOMBIA);
    const wa = String(C.WHATSAPP || '').replace(/\D/g, '');
    const pasos = t('colombia_pasos').split(/\n+/).map(s => s.trim()).filter(Boolean);
    const items = LIBROS.slice().sort((a, b) => a.orden - b.orden || a.n - b.n);
    const pedido = id => url + (url.includes('?') ? '&' : '?') + 'libro=' + encodeURIComponent(id);
    const boton = ed => {
      const id = ed.id_colombia || ed.asinLimpio;
      if (url && id) return `<a class="btn" style="width:100%" href="${esc(pedido(id))}" target="_blank" rel="noopener">${esc(t('colombia_pedir'))}</a>`;
      if (wa) return `<a class="btn wa" style="width:100%" href="https://wa.me/${wa}?text=${encodeURIComponent('Hola, quiero pedir en Colombia el libro "' + ed.titulo + '".')}" target="_blank" rel="noopener">💬 ${esc(t('colombia_pedir'))}</a>`;
      return `<span class="prox">${esc(t('proximamente'))}</span>`;
    };
    $('#contenido').innerHTML = `
      <section class="box colombia">
        <h2>🇨🇴 ${esc(t('colombia_titulo'))}</h2>
        ${parrafos(t('colombia_texto'))}
        ${pasos.length ? `<ol>${pasos.map(p => `<li>${esc(p)}</li>`).join('')}</ol>` : ''}
        <div class="acciones">
          ${url ? `<a class="btn grande" href="${esc(url)}" target="_blank" rel="noopener">${esc(t('colombia_boton'))}</a>`
                : `<p class="nota">${esc(t('colombia_no_disponible'))}</p>`}
          ${url ? `<a class="btn grande gr" href="${esc(url + (url.includes('?') ? '&' : '?') + 'seguimiento=1')}" target="_blank" rel="noopener">🔎 ${esc(t('colombia_seguimiento'))}</a>` : ''}
          ${wa ? `<a class="btn grande wa" href="https://wa.me/${wa}?text=${encodeURIComponent('Hola, quiero pedir un libro en Colombia.')}" target="_blank" rel="noopener">💬 ${esc(t('colombia_whatsapp'))}</a>` : ''}
        </div>
      </section>
      ${items.length ? `<h2>${esc(t('catalogo'))}</h2><div class="grid">${items.map(ed => `
        <article class="card" lang="${esc(ed.idioma)}">
          ${portadaHTML(ed)}<h3>${esc(ed.titulo)}</h3>
          ${ed.subtitulo ? `<p class="sub">${esc(ed.subtitulo)}</p>` : ''}
          ${ed.autor ? `<p class="autor">${esc(ed.autor)}</p>` : ''}
          <div class="etiquetas"><span class="etq">${esc(t('edicion_en', { idioma: nombreIdioma(ed.idioma, 'es') }, 'es'))}</span></div>
          <div class="compra">${boton(ed)}</div>
        </article>`).join('')}</div>` : ''}`;
  }

  function aviso() {
    const el = $('#aviso');
    if (!CON_COLOMBIA) { el.hidden = true; return; }
    let enCol = false;
    try { enCol = Intl.DateTimeFormat().resolvedOptions().timeZone === 'America/Bogota'; } catch (e) { /* nada */ }
    let cerrado = false; try { cerrado = sessionStorage.getItem('avisoCol') === '1'; } catch (e) { /* nada */ }
    if (!enCol || cerrado || actual === 'colombia') { el.hidden = true; return; }
    el.innerHTML = `${esc(t('aviso_colombia', null, 'es'))} <button type="button" data-ir>${esc(t('aviso_colombia_boton', null, 'es'))}</button><button type="button" class="x" aria-label="Cerrar">×</button>`;
    el.hidden = false;
  }

  // ---------- Navegación ----------
  const CON_COLOMBIA = C.MOSTRAR_COLOMBIA !== false;   // false = versión del sitio sin la pestaña Colombia
  const valida = p => (p === 'colombia' && CON_COLOMBIA) || VISIBLES.some(i => i.codigo === p);

  // Idioma de los textos: el que eligió el visitante, o el de su navegador (entre los 6 idiomas).
  function detectarUI() {
    const ok = c => IDIOMAS.some(i => i.codigo === c);
    try { const g = localStorage.getItem('idioma'); if (ok(g)) return g; } catch (e) { /* nada */ }
    for (const l of (navigator.languages || [navigator.language || ''])) {
      const x = String(l).toLowerCase();
      if (ok(x)) return x;
      if (ok(x.split('-')[0])) return x.split('-')[0];
    }
    return ok(C.IDIOMA_POR_DEFECTO) ? C.IDIOMA_POR_DEFECTO : IDIOMAS[0].codigo;
  }

  // Pestaña de libros al entrar: la del enlace, la última visitada, la del idioma del visitante, o inglés.
  function inicial() {
    const h = decodeURIComponent(location.hash.slice(1)).split('/')[0].toLowerCase();
    if (valida(h)) return h;
    try { const g = localStorage.getItem('pestana'); if (valida(g)) return g; } catch (e) { /* nada */ }
    for (const c of [UI, 'en', C.IDIOMA_POR_DEFECTO]) if (valida(c) && c !== 'colombia') return c;
    return VISIBLES[0].codigo;
  }

  function mostrar(p, libro) {
    actual = p;
    try { localStorage.setItem('pestana', p); } catch (e) { /* nada */ }
    if (p === 'colombia') pintarColombia(); else pintarIdioma(IDIOMAS.find(i => i.codigo === p));
    cabecera(); aviso();
    if (libro) {
      const c = document.getElementById('l-' + libro);
      if (c) { c.scrollIntoView({ behavior: 'smooth', block: 'start' }); c.classList.add('resalta'); }
    } else window.scrollTo(0, 0);
  }

  function ruta() {
    const [p, libro] = decodeURIComponent(location.hash.slice(1)).split('/');
    mostrar(valida((p || '').toLowerCase()) ? p.toLowerCase() : inicial(), libro);
  }

  document.addEventListener('change', ev => {
    if (ev.target.id === 'idioma') {
      UI = ev.target.value;
      try { localStorage.setItem('idioma', UI); } catch (e) { /* nada */ }
      // Si hay libros escritos en ese idioma, mostramos esa pestaña; si no, se queda en la actual.
      if (actual !== 'colombia' && valida(UI) && UI !== actual) { location.hash = UI; return; }
      const y = window.scrollY; mostrar(actual); window.scrollTo(0, y); return;
    }
    if (ev.target.id !== 'pais') return;
    PAIS = codigoPais(ev.target.value) || 'US';
    try { localStorage.setItem('pais', PAIS); } catch (e) { /* nada */ }
    const y = window.scrollY; mostrar(actual); window.scrollTo(0, y);
  });

  document.addEventListener('click', ev => {
    const mas = ev.target.closest('.mas');
    if (mas) {
      const d = mas.previousElementSibling, abierta = d.classList.toggle('corta');
      mas.textContent = t(abierta ? 'ver_mas' : 'ver_menos');
    }
    if (ev.target.closest('[data-ir]')) location.hash = 'colombia';
    if (ev.target.closest('.usar-us')) {
      PAIS = 'US'; try { localStorage.setItem('pais', PAIS); } catch (e) { /* nada */ }
      const y = window.scrollY; mostrar(actual); window.scrollTo(0, y);
    }
    if (ev.target.closest('.aviso .x')) { try { sessionStorage.setItem('avisoCol', '1'); } catch (e) { /* nada */ } $('#aviso').hidden = true; }
  });

  cargar().then(() => {
    PAIS = detectarPais();
    UI = detectarUI();
    $('#idioma').innerHTML = IDIOMAS.map(i => `<option value="${esc(i.codigo)}" lang="${esc(i.codigo)}">${esc(i.nombre)}</option>`).join('');
    $('#pestanas').innerHTML = VISIBLES.map(i =>
      `<a href="#${esc(i.codigo)}" data-p="${esc(i.codigo)}" lang="${esc(i.codigo)}">${esc(i.nombre)}</a>`).join('') +
      (CON_COLOMBIA ? `<a href="#colombia" data-p="colombia" class="col">🇨🇴 Colombia</a>` : '');
    window.addEventListener('hashchange', ruta);
    ruta();
  });
})();
