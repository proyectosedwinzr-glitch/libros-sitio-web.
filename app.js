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
    aviso_colombia: '¿Estás en Colombia? Pide tu libro aquí y paga por Bre-B.', aviso_colombia_boton: 'Ir a Colombia'
  };

  let IDIOMAS = [], LIBROS = [], TEXTOS = {}, actual = 'es';

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
      const o = { tiendas: {} };
      claves.forEach((k, i) => {
        const v = (r[i] || '').trim();
        if (k.startsWith('amazon.')) { if (v) o.tiendas[k] = v; } else if (k) o[k] = v;
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
      tienda: (i.tienda_principal || 'amazon.com').toLowerCase(),
      respaldoTiendas: lista(i.tiendas_de_respaldo),
      respaldoIdiomas: lista(i.mostrar_libros_de)
    }));
    if (!IDIOMAS.length) IDIOMAS = [{ codigo: 'es', nombre: 'Español', tienda: 'amazon.com', respaldoTiendas: [], respaldoIdiomas: [] }];

    const codigoDe = v => {
      const x = String(v || '').trim().toLowerCase();
      const i = IDIOMAS.find(i => i.codigo === x || norm(i.nombre) === norm(x));
      return i ? i.codigo : x;
    };
    LIBROS = cat.filter(b => b.titulo && siNo(b.visible, true)).map((b, n) => ({
      ...b, n, idioma: codigoDe(b.idioma), grupo: b.grupo || ('_fila' + n),
      orden: isNaN(parseFloat(b.orden)) ? 9999 : parseFloat(b.orden)
    }));

    TEXTOS = {};
    tex.forEach(r => { if (r.clave) TEXTOS[r.clave.trim()] = r; });
  }

  // ---------- Utilidades de presentación ----------
  function t(k, vars, lang) {
    const fila = TEXTOS[k] || {};
    const s = fila[norm(lang || actual)] || fila.es || DEF[k] || '';
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
  function parrafos(s) {
    return String(s || '').split(/\n+/).map(p => p.trim()).filter(Boolean).map(p => '<p>' + esc(p) + '</p>').join('');
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

  function enlaces(ed, L) {
    const todas = Object.entries(ed.tiendas).filter(([, u]) => urlSegura(u));
    const preferidas = [L.tienda, ...L.respaldoTiendas, 'amazon.com'];
    let principal = null;
    for (const d of preferidas) if (ed.tiendas[d] && urlSegura(ed.tiendas[d])) { principal = [d, ed.tiendas[d]]; break; }
    if (!principal && todas.length) principal = todas[0];
    return { principal, otras: todas.filter(x => !principal || x[0] !== principal[0]), enSuTienda: !!principal && principal[0] === L.tienda };
  }

  // ---------- Dibujo ----------
  function portadaHTML(ed) {
    const p = urlPortada(ed.portada);
    return p ? `<img class="portada" src="${esc(p)}" alt="${esc(ed.titulo)}" loading="lazy">`
             : `<div class="portada">${esc(ed.titulo)}</div>`;
  }

  function tarjeta({ ed, eds, traducido }, L) {
    const e = enlaces(ed, L);
    const etq = [];
    if (ed.etiqueta) etq.push(`<span class="etq nuevo">${esc(ed.etiqueta)}</span>`);
    if (!traducido) etq.push(`<span class="etq">${esc(t('edicion_en', { idioma: nombreIdioma(ed.idioma, L.codigo) }))}</span>`);
    const larga = (ed.descripcion || '').length > 260;
    let compra;
    if (e.principal) {
      compra = (e.enSuTienda ? '' : `<p class="nota">${esc(t('no_en_tienda', { tienda: nombreTienda(L.tienda) }))}</p>`) +
        `<a class="btn amz" href="${esc(urlSegura(e.principal[1]))}" target="_blank" rel="noopener">${esc(t('comprar', { tienda: nombreTienda(e.principal[0]) }))}</a>` +
        (e.otras.length ? `<details><summary>${esc(t('otras_tiendas'))}</summary><ul>${e.otras.map(([d, u]) =>
          `<li><a href="${esc(urlSegura(u))}" target="_blank" rel="noopener">${esc(nombreTienda(d))}</a></li>`).join('')}</ul></details>` : '');
    } else compra = `<span class="prox">${esc(t('proximamente'))}</span>`;
    const otras = eds.filter(x => x !== ed && x.idioma !== ed.idioma && IDIOMAS.some(i => i.codigo === x.idioma));
    const tambien = otras.length ? `<div class="tambien">${esc(t('tambien_en'))} ${otras.map(x => {
      const i = IDIOMAS.find(i => i.codigo === x.idioma);
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
    document.documentElement.lang = actual === 'colombia' ? 'es-CO' : actual;
    $('#titulo').textContent = t('titulo_sitio');
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
    $('#contenido').innerHTML = `<h2>${esc(t('catalogo'))}</h2>` + (items.length
      ? `<div class="grid">${items.map(x => tarjeta(x, L)).join('')}</div>`
      : `<p class="vacio">${esc(t('sin_libros'))}</p>`);
  }

  function pintarColombia() {
    const url = urlSegura(C.URL_COLOMBIA);
    const pasos = t('colombia_pasos').split(/\n+/).map(s => s.trim()).filter(Boolean);
    const L = IDIOMAS.find(i => i.codigo === 'es') || IDIOMAS[0];
    const items = librosPara(L).filter(x => x.ed.id_colombia || x.eds.some(e => e.id_colombia));
    const conId = x => x.ed.id_colombia || (x.eds.find(e => e.id_colombia) || {}).id_colombia;
    const pedido = id => url + (url.includes('?') ? '&' : '?') + 'libro=' + encodeURIComponent(id);
    $('#contenido').innerHTML = `
      <section class="box colombia">
        <h2>🇨🇴 ${esc(t('colombia_titulo'))}</h2>
        ${parrafos(t('colombia_texto'))}
        ${pasos.length ? `<ol>${pasos.map(p => `<li>${esc(p)}</li>`).join('')}</ol>` : ''}
        <div class="acciones">
          ${url ? `<a class="btn grande" href="${esc(url)}" target="_blank" rel="noopener">${esc(t('colombia_boton'))}</a>`
                : `<p class="nota">${esc(t('colombia_no_disponible'))}</p>`}
          ${C.WHATSAPP ? `<a class="btn grande wa" href="https://wa.me/${esc(String(C.WHATSAPP).replace(/\D/g, ''))}?text=${encodeURIComponent('Hola, quiero pedir un libro en Colombia.')}" target="_blank" rel="noopener">💬 ${esc(t('colombia_whatsapp'))}</a>` : ''}
        </div>
      </section>
      ${items.length ? `<h2>${esc(t('catalogo'))}</h2><div class="grid">${items.map(x => `
        <article class="card" lang="${esc(x.ed.idioma)}">
          ${portadaHTML(x.ed)}<h3>${esc(x.ed.titulo)}</h3>
          ${x.ed.autor ? `<p class="autor">${esc(x.ed.autor)}</p>` : ''}
          <div class="compra">${url ? `<a class="btn" style="width:100%" href="${esc(pedido(conId(x)))}" target="_blank" rel="noopener">${esc(t('colombia_pedir'))}</a>` : ''}</div>
        </article>`).join('')}</div>` : ''}`;
  }

  function aviso() {
    const el = $('#aviso');
    let enCol = false;
    try { enCol = Intl.DateTimeFormat().resolvedOptions().timeZone === 'America/Bogota'; } catch (e) { /* nada */ }
    let cerrado = false; try { cerrado = sessionStorage.getItem('avisoCol') === '1'; } catch (e) { /* nada */ }
    if (!enCol || cerrado || actual === 'colombia') { el.hidden = true; return; }
    el.innerHTML = `${esc(t('aviso_colombia', null, 'es'))} <button type="button" data-ir>${esc(t('aviso_colombia_boton', null, 'es'))}</button><button type="button" class="x" aria-label="Cerrar">×</button>`;
    el.hidden = false;
  }

  // ---------- Navegación ----------
  const valida = p => p === 'colombia' || IDIOMAS.some(i => i.codigo === p);

  function inicial() {
    const h = decodeURIComponent(location.hash.slice(1)).split('/')[0].toLowerCase();
    if (valida(h)) return h;
    try { const g = localStorage.getItem('pestana'); if (valida(g)) return g; } catch (e) { /* nada */ }
    for (const l of (navigator.languages || [navigator.language || ''])) {
      const x = String(l).toLowerCase();
      const i = IDIOMAS.find(i => i.codigo === x) || IDIOMAS.find(i => i.codigo === x.split('-')[0]);
      if (i) return i.codigo;
    }
    return valida(C.IDIOMA_POR_DEFECTO) ? C.IDIOMA_POR_DEFECTO : IDIOMAS[0].codigo;
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

  document.addEventListener('click', ev => {
    const mas = ev.target.closest('.mas');
    if (mas) {
      const d = mas.previousElementSibling, abierta = d.classList.toggle('corta');
      mas.textContent = t(abierta ? 'ver_mas' : 'ver_menos');
    }
    if (ev.target.closest('[data-ir]')) location.hash = 'colombia';
    if (ev.target.closest('.aviso .x')) { try { sessionStorage.setItem('avisoCol', '1'); } catch (e) { /* nada */ } $('#aviso').hidden = true; }
  });

  cargar().then(() => {
    $('#pestanas').innerHTML = IDIOMAS.map(i =>
      `<a href="#${esc(i.codigo)}" data-p="${esc(i.codigo)}" lang="${esc(i.codigo)}">${esc(i.nombre)}</a>`).join('') +
      `<a href="#colombia" data-p="colombia" class="col">🇨🇴 Colombia</a>`;
    window.addEventListener('hashchange', ruta);
    ruta();
  });
})();
