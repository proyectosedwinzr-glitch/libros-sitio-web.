/*
 * «La historia del día» (/hoy/) · el juego.
 *
 * Adaptado de la edición interactiva de «Letras con historia» (vol. 1), sin ninguno de sus datos:
 *   - la selección por toques: letra a letra, o la primera y la última de una palabra de la lista;
 *   - la frase, que se escribe sola en sus huecos al recorrerla desde el principio;
 *   - el final, letra a letra: con todo encontrado, las letras que sobran laten y caen en su hueco;
 *   - el guardado en el navegador.
 *
 * Cada historia llega de d/AAAA-MM-DD.json. La página trae en #hoy-config los días publicados.
 * El día lo decide la fecha del dispositivo. Nada sale del navegador: sin cookies ni terceros.
 */
(function () {
  "use strict";

  const main = document.getElementById("hoy");
  const vista = document.getElementById("vista");
  const cfgEl = document.getElementById("hoy-config");
  if (!main || !vista || !cfgEl || !window.fetch || !window.Promise) return;   // se queda la página escrita
  let CFG;
  try { CFG = JSON.parse(cfgEl.textContent); } catch (e) { return; }
  const DIAS = new Set(Array.isArray(CFG.dias) ? CFG.dias : []);
  const COMO = document.getElementById("como");   // «Cómo se juega» (texto aprobado, viene escrito en la página)

  /* ---------- fechas: las del dispositivo, en su hora local ---------- */
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre",
    "octubre", "noviembre", "diciembre"];
  const SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
  const dos = n => (n < 10 ? "0" : "") + n;
  const aIso = d => d.getFullYear() + "-" + dos(d.getMonth() + 1) + "-" + dos(d.getDate());
  const deIso = s => { const p = s.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2], 12); };
  const sumar = (s, n) => { const d = deIso(s); d.setDate(d.getDate() + n); return aIso(d); };
  const larga = (s, conDia, conAnio) => {
    const d = deIso(s);
    return (conDia ? SEMANA[d.getDay()] + " " : "") + d.getDate() + " de " + MESES[d.getMonth()] +
      (conAnio ? " de " + d.getFullYear() : "");
  };
  const mayus = s => s.charAt(0).toUpperCase() + s.slice(1);
  // En una construcción de prueba (--hoy-prueba) la fecha viene fijada; en la de verdad, nunca.
  const HOY = ES_FECHA.test(CFG.fijo || "") ? CFG.fijo : aIso(new Date());

  /* ---------- texto ---------- */
  const esc = s => String(s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
  const norm = s => String(s).toUpperCase().normalize("NFD").replace(/(?!̃)[̀-ͯ]/g, "")
    .normalize("NFC").replace(/[^A-ZÑ]/g, "");
  const suave = () => (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

  /* ---------- progreso: localStorage «lch-hoy-v1»; por fecha, lo encontrado y si está resuelta ---------- */
  const GUARDA = "lch-hoy-v1";
  let PROG = {};
  try { PROG = JSON.parse(localStorage.getItem(GUARDA) || "{}") || {}; } catch (e) { PROG = {}; }
  if (typeof PROG !== "object" || Array.isArray(PROG)) PROG = {};
  const guardar = () => { try { localStorage.setItem(GUARDA, JSON.stringify(PROG)); } catch (e) { /* se juega igual */ } };
  const prog = f => {
    const p = PROG[f] && typeof PROG[f] === "object" ? PROG[f] : {};
    // w: palabras encontradas · f: frase encontrada · e: frase escrita · m: letras del final puestas
    // p: pistas pedidas · r: resuelta (se queda aunque se empiece de nuevo)
    PROG[f] = {w: Array.isArray(p.w) ? p.w : [], f: !!p.f, e: !!p.e, m: Array.isArray(p.m) ? p.m : [],
      p: Number.isInteger(p.p) && p.p > 0 ? p.p : 0, r: !!p.r};
    return PROG[f];
  };
  const resuelta = f => !!(PROG[f] && PROG[f].r);

  /* ---------- lo que llega del servidor ----------
     Si falta un archivo, Cloudflare Pages devuelve la página principal (HTML) con código 200:
     por eso se comprueba que lo recibido sea una historia de esa fecha y que su cuadrícula cuadre. */
  function modelo(H, fecha) {
    const mal = () => { throw new Error("historia mal formada"); };
    if (!H || typeof H !== "object" || H.fecha !== fecha) mal();
    const C = H.cuadricula || {}, N = C.lado, G = C.filas, pg = H.pagina || {}, pc = H.pagina_cuadricula || {};
    if (!Number.isInteger(N) || N < 5 || N > 16 || !Array.isArray(G) || G.length !== N) mal();
    G.forEach(f => { if (!Array.isArray(f) || f.length !== N || !f.every(ch => typeof ch === "string" && ch.length === 1)) mal(); });
    ["titulo", "relato", "frase", "mensaje"].forEach(k => { if (typeof H[k] !== "string" || !H[k]) mal(); });
    const dentro = x => Array.isArray(x) && x.length === 2 && x.every(v => Number.isInteger(v) && v >= 0 && v < N);
    const k = x => x[0] * N + x[1];
    if (!Array.isArray(H.frase_recorrido) || H.frase_recorrido.length < 2 || !H.frase_recorrido.every(dentro)) mal();
    if (!Array.isArray(pg.lista) || !Array.isArray(pg.frase_visible) || !Array.isArray(C.colocadas)) mal();
    const FRK = H.frase_recorrido.map(k);
    const PAL = pg.lista.map((w, i) => {
      const c = C.colocadas.find(x => Array.isArray(x) && x[0] === w && Array.isArray(x[3]));
      if (!c || !Array.isArray(c[2]) || c[2].length < 2 || !c[2].every(dentro)) mal();
      return {w: String(w), i: i, cs: c[2].map(k), set: new Set(c[2].map(k))};
    });
    const ocup = new Set(FRK);
    PAL.forEach(p => p.cs.forEach(x => ocup.add(x)));
    const LIBRES = [];   // las que sobran, bajando por columnas
    for (let c = 0; c < N; c++) for (let r = 0; r < N; r++) if (!ocup.has(r * N + c)) LIBRES.push(r * N + c);
    const RAN = pc.ranuras;
    if (!Array.isArray(RAN) || !RAN.every(n => Number.isInteger(n) && n > 0) ||
        RAN.reduce((a, b) => a + b, 0) !== LIBRES.length) mal();
    let q = 0;
    const PATRON = pg.frase_visible.map(t => Array.from(String(t)).map(ch => ({ch: ch, i: q++, dada: ch !== "_"})));
    if (q !== FRK.length) mal();
    return {N: N, G: G, PAL: PAL, FRK: FRK, FR: new Set(FRK), LIBRES: LIBRES, RAN: RAN, PATRON: PATRON,
      letra: x => G[Math.floor(x / N)][x % N]};
  }

  function cargar(f) {
    return fetch("d/" + f + ".json", {cache: "no-cache"})
      .then(r => { if (!r.ok) throw new Error("sin archivo"); return r.json(); })
      .then(H => ({H: H, M: modelo(H, f)}));
  }

  /* ---------- qué historia se enseña ---------- */
  const publicadasHasta = f => Array.from(DIAS).filter(x => ES_FECHA.test(x) && x <= f).sort().reverse();

  function elegir() {
    let h = "";
    try { h = decodeURIComponent(location.hash.slice(1)); } catch (e) { /* dirección mal escrita: la de hoy */ }
    if (ES_FECHA.test(h) && h !== HOY) {
      if (h < HOY && h >= sumar(HOY, -7) && DIAS.has(h)) return {fechas: [h], anterior: true};
      return {fechas: publicadasHasta(HOY), nota: "Esa historia no está disponible. "};
    }
    return {fechas: publicadasHasta(HOY), nota: ""};
  }

  let turno = 0;   // si se navega deprisa, solo cuenta la última carga
  function mostrar(navegando) {
    const yo = ++turno;
    const el = elegir();
    if (!el.fechas.length) {
      if (CFG.primera && HOY < CFG.primera) {
        pintarNota("La primera historia del día llega el " + larga(CFG.primera, true, true) + ". " +
          "Cada día, una historia real y una sopa de letras para descubrir su final.", true);
      }
      return Promise.resolve();   // sin historias publicadas: se queda lo que trae la página
    }
    vista.setAttribute("aria-busy", "true");
    const intentar = n => {
      if (n >= el.fechas.length) return Promise.reject(new Error("ninguna"));
      return cargar(el.fechas[n]).then(x => { x.fecha = el.fechas[n]; return x; }, () => intentar(n + 1));
    };
    return intentar(0).then(x => {
      if (yo !== turno) return;
      let nota = el.nota || "";
      if (el.anterior) {
        nota = "Es la historia del " + larga(x.fecha, true) + "." +
          (DIAS.has(HOY) ? ' <a class="ir-hoy" href="#">Ir a la de hoy</a>' : "");
      } else if (x.fecha !== HOY) {
        nota += "La historia de hoy todavía no está lista. Mientras tanto, aquí tienes la del " + larga(x.fecha, true) + ".";
      } else if (nota) {
        nota += "Esta es la de hoy.";
      }
      verHistoria(x.H, x.M, nota, navegando);
    }, () => {
      if (yo !== turno) return;
      pintarNota('No se ha podido cargar la historia. Comprueba la conexión y vuelve a intentarlo. ' +
        '<button class="b" type="button" id="reintentar">Volver a intentarlo</button>', false, true);
      const b = document.getElementById("reintentar");
      if (b) b.onclick = () => mostrar(true);
    }).then(() => { if (yo === turno) vista.removeAttribute("aria-busy"); });
  }

  // Una nota arriba. Con «sola», la nota sustituye a lo que hubiera; si no, se pone encima.
  function pintarNota(html, sola, conHtml) {
    if (COMO && COMO.parentNode !== main) main.insertBefore(COMO, main.querySelector(".pie"));
    const p = document.createElement("p");
    p.className = "nota"; p.setAttribute("role", "status");
    if (conHtml) p.innerHTML = html; else p.textContent = html;
    if (sola) { vista.innerHTML = ""; main.classList.remove("con-juego"); }
    const vieja = vista.querySelector(":scope > .nota");
    if (vieja) vieja.remove();
    vista.insertBefore(p, vista.firstChild);
  }

  /* ---------- la figura del recorrido de la frase (recortada a su caja) ---------- */
  function svgFigura(rec) {
    const fs = rec.map(p => p[0]), cs = rec.map(p => p[1]);
    const f0 = Math.min.apply(null, fs), c0 = Math.min.apply(null, cs);
    const alto = Math.max.apply(null, fs) - f0 + 1, ancho = Math.max.apply(null, cs) - c0 + 1, t = 16;
    const pts = rec.map(p => ((p[1] - c0) * t + t / 2) + "," + ((p[0] - f0) * t + t / 2)).join(" ");
    return '<svg class="figura" viewBox="0 0 ' + ancho * t + " " + alto * t + '" width="' + ancho * t * 2 +
      '" height="' + alto * t * 2 + '" role="img" aria-label="Figura que dibuja el recorrido de la frase">' +
      '<polyline points="' + pts + '" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" ' +
      'stroke-linejoin="round"/><circle cx="' + ((rec[0][1] - c0) * t + t / 2) + '" cy="' + ((rec[0][0] - f0) * t + t / 2) +
      '" r="4.5" fill="currentColor"/></svg>';
  }

  /* ---------- una historia ---------- */
  let OBS = null;
  function verHistoria(H, M, nota, navegando) {
    const N = M.N, PAL = M.PAL, FRK = M.FRK, FR = M.FR, LIBRES = M.LIBRES, RAN = M.RAN, PATRON = M.PATRON, letra = M.letra;
    const pg = H.pagina, P = prog(H.fecha);
    // Lo guardado, saneado (solo posiciones que existen en esta historia).
    P.w = P.w.filter((x, j, a) => Number.isInteger(x) && x >= 0 && x < PAL.length && a.indexOf(x) === j);
    P.m = P.m.filter((x, j, a) => Number.isInteger(x) && x >= 0 && x < LIBRES.length && a.indexOf(x) === j);
    const DUENO = new Map(), LIBRE = new Map();
    PAL.forEach(p => p.cs.forEach(x => DUENO.set(x, p)));
    LIBRES.forEach((x, n) => LIBRE.set(x, n));
    const LARGO = Math.max.apply(null, [FR.size].concat(PAL.map(p => p.set.size)));
    const nv = /^nivel(\d)$/.exec(H.tipo || "");
    let sel = [], etapa = {}, ultima = -1, primeraVez = true, prevK = 0, prevVer = false, tDestello = 0;
    const todoEncontrado = () => P.f && P.w.length === PAL.length;
    const completo = () => todoEncontrado() && P.m.length === LIBRES.length;
    let avisado = todoEncontrado();

    if (COMO && COMO.parentNode) COMO.remove();
    if (OBS) { OBS.disconnect(); OBS = null; }
    main.classList.add("con-juego");
    document.title = H.titulo + " · La historia del día · Libros de Edwin Zar";
    main.setAttribute("data-fecha", H.fecha);

    vista.innerHTML =
      (nota ? '<p class="nota" role="status">' + nota + "</p>" : "") +
      '<div class="reto"><section class="a-texto">' +
        '<p class="antetitulo">' + esc(H.antetitulo || "La historia del día") + " · " + esc(larga(H.fecha)) + "</p>" +
        '<h1 id="titulo" tabindex="-1">' + esc(H.titulo) + "</h1>" +
        (H.fecha_del_hecho ? '<p class="hecho">' + esc(H.fecha_del_hecho) + "</p>" : "") +
        (nv ? '<p class="nivel"><span class="cuadros" aria-hidden="true"><i class="l"></i><i class="' +
          (+nv[1] >= 2 ? "l" : "") + '"></i></span>Nivel ' + nv[1] + "</p>" : "") +
        '<p class="relato">' + esc(H.relato) + "</p>" +
        "<h2>" + esc(pg.rotulo_frase || "La frase") + "</h2>" +
        '<div class="frase-caja"><div class="frase" id="patron" aria-hidden="true"></div>' +
          (pg.figura_visible ? svgFigura(H.frase_recorrido) : "") + "</div>" +
        '<p class="sr" id="patron-sr"></p>' +
        '<form class="escribir" id="f-form" autocomplete="off">' +
          '<label for="f-in">Escribe aquí la frase completa</label>' +
          '<div class="fila"><input id="f-in" type="text" autocapitalize="characters" autocorrect="off" spellcheck="false">' +
          '<button class="b" type="submit">Comprobar</button></div>' +
          '<p class="msg" id="f-msg" role="status"></p></form>' +
        '<div id="sitio-como"></div>' +
      "</section>" +
      '<section class="a-tablero" aria-labelledby="t-cuadricula">' +
        '<h2 class="sr" id="t-cuadricula">La cuadrícula</h2>' +
        '<p class="cuenta" id="cuenta"></p>' +
        '<div class="lienzo" style="--lado:' + N + '">' +
          '<div class="rejilla" id="rejilla" role="group" aria-label="Cuadrícula de ' + N + " por " + N + ' letras" ' +
          'aria-describedby="rejilla-ayuda"></div><svg class="trazo" id="trazo" aria-hidden="true"></svg></div>' +
        '<p class="sr" id="rejilla-ayuda">Muévete por la cuadrícula con las flechas; Intro o la barra espaciadora tocan la letra.</p>' +
        '<p class="aviso" id="aviso" role="status"></p>' +
        '<div class="botones"><button class="b" type="button" id="pista">Pista</button>' +
          '<button class="b" type="button" id="limpiar">Quitar selección</button>' +
          '<button class="b" type="button" id="reiniciar">Empezar de nuevo</button></div>' +
        (pg.indicaciones ? '<p class="indicaciones">' + esc(pg.indicaciones) + "</p>" : "") +
        "<h2>" + esc(pg.rotulo_lista || "Las palabras") + "</h2>" +
        '<ul class="lista" id="lista"></ul>' +
        '<div class="bloque-final" id="bloque-final">' +
          "<h2>" + esc((H.pagina_cuadricula || {}).rotulo_final || "El final del relato") + "</h2>" +
          '<div class="ranuras" id="ranuras" aria-hidden="true"></div><p class="sr" id="ranuras-sr"></p>' +
          '<div class="acc-msg" id="acc-msg" hidden><p>Toca las letras con aro: cada una cae en su hueco.</p>' +
            '<button class="b" type="button" id="leer-todo">Completar el final</button></div>' +
          '<div class="resuelta" id="resuelta" hidden></div>' +
        "</div>" +
      "</section></div>" +
      '<section class="dias" id="dias" aria-labelledby="t-dias"></section>';

    const $ = id => document.getElementById(id);
    if (COMO) $("sitio-como").appendChild(COMO);
    const rej = $("rejilla"), celdas = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const b = document.createElement("button"), x = r * N + c;
      b.type = "button"; b.className = "c"; b.textContent = M.G[r][c]; b.tabIndex = x === 0 ? 0 : -1;
      b.addEventListener("click", () => { foco(x, false); tocar(x); });
      rej.appendChild(b); celdas.push(b);
    }
    let actual = 0;   // la casilla a la que se llega con el tabulador (las flechas mueven dentro)
    function foco(x, mover) {
      if (celdas[actual]) celdas[actual].tabIndex = -1;
      actual = x; celdas[x].tabIndex = 0;
      if (mover) celdas[x].focus();
    }
    rej.addEventListener("keydown", e => {
      const i = celdas.indexOf(document.activeElement);
      if (i < 0) return;
      const r = Math.floor(i / N), c = i % N;
      let j = -1;
      if (e.key === "ArrowRight" && c < N - 1) j = i + 1;
      else if (e.key === "ArrowLeft" && c > 0) j = i - 1;
      else if (e.key === "ArrowDown" && r < N - 1) j = i + N;
      else if (e.key === "ArrowUp" && r > 0) j = i - N;
      else if (e.key === "Home") j = r * N;
      else if (e.key === "End") j = r * N + N - 1;
      if (j >= 0) { e.preventDefault(); foco(j, true); }
    });

    // La frase: el recorrido elegido hasta ahora es un principio correcto de la frase.
    const prefijo = () => {
      let k = 0;
      while (k < sel.length && k < FRK.length && sel[k] === FRK[k]) k++;
      return k === sel.length ? k : 0;
    };

    function pintarPatron() {
      const ver = P.f || P.e, k = ver ? FRK.length : prefijo();
      const yaVisible = x => x.dada || prevVer || x.i < prevK;
      $("patron").innerHTML = PATRON.map(w => '<span class="palabra">' + w.map(x => {
        const puesta = !x.dada && (ver || x.i < k);
        const nueva = puesta && !primeraVez && !yaVisible(x);
        return '<span class="letra' + (x.dada ? "" : " hueco") + (puesta ? " puesta" : "") + (nueva ? " nueva" : "") + '">' +
          (x.dada ? esc(x.ch) : puesta ? esc(letra(FRK[x.i])) : "") + "</span>";
      }).join("") + "</span>").join("");
      $("patron-sr").textContent = "La frase: " + PATRON.map(w => w.map(x =>
        x.dada ? x.ch : (ver || x.i < k) ? letra(FRK[x.i]) : "·").join("")).join(" ") +
        (ver ? "." : " (los puntos son huecos).");
      prevK = k; prevVer = ver;
      $("f-form").hidden = ver;
    }

    function pintarLista() {
      $("lista").innerHTML = PAL.map(p => {
        const ok = P.w.indexOf(p.i) >= 0;
        return '<li class="pal' + (ok ? " hecha" : "") + '"><span class="marca" aria-hidden="true">' + (ok ? "✓" : "") +
          '</span><span class="w">' + esc(p.w) + "</span>" + (ok ? '<span class="sr"> (encontrada)</span>' : "") + "</li>";
      }).join("");
    }

    function pintarRejilla() {
      const todo = todoEncontrado(), leidas = new Set(P.m), S = new Set(sel);
      celdas.forEach((b, x) => {
        let cls = "c", estado = "";
        const p = DUENO.get(x), n = LIBRE.get(x);
        if (p && P.w.indexOf(p.i) >= 0) { cls += " on"; estado = ", de " + p.w; }
        else if (FR.has(x) && P.f) { cls += " fr"; estado = ", de la frase"; }
        else if (todo && n !== undefined) {
          if (leidas.has(n)) { cls += " sobra leida"; estado = ", ya está en el final"; }
          else { cls += " sobra pulso"; estado = ", letra que sobra"; }
        }
        if (S.has(x)) cls += " sel";
        if (b.className !== cls) b.className = cls;
        b.setAttribute("aria-pressed", S.has(x) ? "true" : "false");
        b.setAttribute("aria-label", letra(x) + ", fila " + (Math.floor(x / N) + 1) + ", columna " + (x % N + 1) + estado);
      });
      $("cuenta").innerHTML = "<b>" + P.w.length + "</b> de " + PAL.length + " palabras · la frase: " +
        (P.f ? "<b>✓ encontrada</b>" : "pendiente");
      trazo();
    }

    function trazo() {
      const svg = $("trazo");
      if (!svg || !celdas[0].isConnected) return;
      if (!P.f) { svg.innerHTML = ""; return; }
      const base = rej.getBoundingClientRect();
      const pts = FRK.map(x => {
        const b = celdas[x].getBoundingClientRect();
        return (b.left + b.width / 2 - base.left).toFixed(1) + "," + (b.top + b.height / 2 - base.top).toFixed(1);
      }).join(" ");
      svg.innerHTML = '<polyline points="' + pts + '" stroke-width="' + (celdas[0].getBoundingClientRect().width * 0.22).toFixed(1) + '"/>';
    }

    function pintarFinal() {
      const todo = todoEncontrado(), leidas = new Set(P.m);
      let n = 0;
      $("ranuras").innerHTML = RAN.map(len => {
        let h = '<span class="palabra">';
        for (let j = 0; j < len; j++, n++) {
          const puesta = todo && leidas.has(n), nueva = puesta && (n === ultima || ultima === -2);
          h += '<span class="letra hueco' + (puesta ? " puesta" : "") + (nueva ? " nueva" : "") + '"' +
            (nueva && ultima === -2 ? ' style="animation-delay:' + (n * 0.03).toFixed(2) + 's"' : "") + ">" +
            (puesta ? esc(letra(LIBRES[n])) : "") + "</span>";
        }
        return h + "</span>";
      }).join("");
      ultima = -1;
      const lleno = completo();
      $("ranuras-sr").textContent = lleno ? "" : "El final: " + (todo ? P.m.length : 0) + " de " + LIBRES.length + " letras en su sitio.";
      $("acc-msg").hidden = !(todo && !lleno);
      if (lleno && !P.r) { P.r = true; guardar(); }
      const res = $("resuelta");
      if (lleno && res.hidden) {
        const fuentes = Array.isArray(H.fuentes) ? H.fuentes.filter(f => typeof f === "string" && f) : [];
        res.innerHTML = '<p class="final-texto">«' + esc(H.mensaje) + "»</p>" +
          '<p class="pistas-n">' + (P.p ? "Resuelta con " + P.p + (P.p === 1 ? " pista." : " pistas.") : "Resuelta sin pistas.") + "</p>" +
          (fuentes.length ? '<details class="fuentes"><summary>Fuentes</summary><ul>' +
            fuentes.map(f => "<li>" + esc(f) + "</li>").join("") + "</ul></details>" : "");
      }
      res.hidden = !lleno;
    }

    function pintarDias() {
      const previos = [];
      for (let i = 1; i <= 7; i++) { const f = sumar(HOY, -i); if (DIAS.has(f)) previos.push(f); }
      const lunes = sumar(HOY, -((deIso(HOY).getDay() + 6) % 7));
      const semana = [0, 1, 2, 3, 4, 5, 6].map(i => sumar(lunes, i));
      const total = semana.filter(f => !CFG.primera || f >= CFG.primera).length;
      const hechas = semana.filter(f => f <= HOY && resuelta(f)).length;
      $("dias").innerHTML = '<h2 id="t-dias">Días anteriores</h2>' +
        '<p class="semana">Esta semana: <b>' + hechas + " de " + total + "</b></p>" +
        (H.fecha !== HOY && DIAS.has(HOY) ? '<p><a class="ir-hoy" href="#">Ir a la historia de hoy</a></p>' : "") +
        (previos.length ? '<ul class="dias-lista">' + previos.map(f => "<li>" +
          '<a href="#' + f + '"' + (f === H.fecha ? ' aria-current="page"' : "") + ">" + esc(mayus(larga(f, true))) + "</a>" +
          (resuelta(f) ? '<span class="ok">✓ Resuelta</span>' : "") + "</li>").join("") + "</ul>"
          : "<p>Todavía no hay días anteriores.</p>");
    }

    const avisar = t => { $("aviso").textContent = t; };
    function pintarTodo() { pintarLista(); pintarRejilla(); pintarPatron(); pintarFinal(); pintarDias(); primeraVez = false; }

    function terminado() {
      if (!todoEncontrado()) return false;
      if (completo()) avisar("¡Final completo! Así termina la historia.");
      else {
        avisar("¡Todo encontrado! Ahora toca las letras con aro: cada una cae en su hueco del final.");
        if (!P.m.length && !avisado) {
          avisado = true;
          setTimeout(() => { if ($("bloque-final")) $("bloque-final").scrollIntoView({behavior: suave(), block: "nearest"}); }, 450);
        }
      }
      return true;
    }

    function tocar(x) {
      if (todoEncontrado()) {
        const n = LIBRE.get(x);
        if (n === undefined) { avisar("Esa letra ya es de una palabra o de la frase. Toca las que tienen aro."); return; }
        if (P.m.indexOf(n) >= 0) return;
        P.m.push(n); ultima = n; guardar(); pintarTodo(); terminado();
        return;
      }
      const i = sel.indexOf(x);
      if (i >= 0) sel.splice(i, 1); else sel.push(x);
      const S = new Set(sel);
      const igual = set => S.size === set.size && sel.every(y => set.has(y));
      if (!P.f && igual(FR)) {
        P.f = true; sel = []; guardar(); pintarTodo();
        if (!terminado()) avisar("¡La frase! Mira el dibujo que traza.");
        return;
      }
      const hit = PAL.find(p => P.w.indexOf(p.i) < 0 && (igual(p.set) ||
        (S.size === 2 && S.has(p.cs[0]) && S.has(p.cs[p.cs.length - 1]))));
      if (hit) {
        P.w.push(hit.i); sel = []; guardar(); pintarTodo();
        if (!terminado()) avisar("¡" + hit.w + "!");
        return;
      }
      if (sel.length > LARGO) {
        sel.forEach(y => celdas[y].classList.add("no"));
        setTimeout(() => { sel = []; pintarRejilla(); pintarPatron(); }, 350);
        avisar("Esa selección no forma ninguna palabra ni la frase.");
        return;
      }
      const k = prefijo();
      avisar(!P.f && k > 0 ? "Vas bien con la frase: " + k + " de " + FR.size + " letras." : "");
      pintarRejilla(); pintarPatron();
    }

    // Pistas sin límite y escalonadas: la primera letra de una palabra; después, la palabra entera;
    // en la frase, la casilla siguiente. Se cuentan (para compartir), no se cobran.
    function destello(xs) {
      xs.forEach(x => { const b = celdas[x]; b.classList.remove("pista"); void b.offsetWidth; b.classList.add("pista"); });
      clearTimeout(tDestello);
      tDestello = setTimeout(() => xs.forEach(x => celdas[x].classList.remove("pista")), 2600);
    }
    $("pista").onclick = () => {
      if (todoEncontrado()) {
        if (!completo()) avisar("Toca las letras con aro: cada una cae en su hueco del final.");
        return;
      }
      let k = P.f ? 0 : prefijo(), xs, t;
      const p = PAL.find(q => P.w.indexOf(q.i) < 0);
      if (!P.f && k > 0) { xs = [FRK[k]]; t = "La frase sigue por aquí."; }
      else if (p) {
        if (!etapa[p.i]) { xs = [p.cs[0]]; t = "Por aquí empieza " + p.w + "."; etapa[p.i] = 1; }
        else { xs = p.cs.slice(); t = "Aquí está " + p.w + ": toca su primera y su última letra."; etapa[p.i] = 2; }
      } else {
        if (sel.length) { sel = []; pintarRejilla(); pintarPatron(); }
        k = 0; xs = [FRK[0]]; t = "Aquí empieza la frase: tócala letra a letra desde ahí.";
      }
      P.p += 1; guardar();
      destello(xs); avisar(t);
    };
    $("limpiar").onclick = () => { sel = []; avisar(""); pintarRejilla(); pintarPatron(); };
    // Se confirma en la propia página (el primer toque pregunta, el segundo borra): las ventanas del navegador
    // (confirm) no funcionan en algunos navegadores dentro de otras aplicaciones, como el de WhatsApp.
    let tReinicio = 0;
    const PREGUNTA = "¿Seguro? Se borra lo encontrado en esta historia. Para confirmarlo, toca «Sí, empezar de nuevo».";
    $("reiniciar").onclick = () => {
      const b = $("reiniciar");
      clearTimeout(tReinicio);
      if (!b.dataset.seguro) {
        b.dataset.seguro = "1"; b.textContent = "Sí, empezar de nuevo"; b.classList.add("osc"); avisar(PREGUNTA);
        tReinicio = setTimeout(() => {
          delete b.dataset.seguro; b.textContent = "Empezar de nuevo"; b.classList.remove("osc");
          if ($("aviso").textContent === PREGUNTA) avisar("");
        }, 6000);
        return;
      }
      PROG[H.fecha] = {w: [], f: false, e: false, m: [], p: P.p, r: P.r}; guardar();
      verHistoria(H, M, "", false);
    };
    $("leer-todo").onclick = () => {
      P.m = LIBRES.map((_, n) => n); ultima = -2; guardar(); pintarTodo(); terminado();
    };
    $("f-form").addEventListener("submit", e => {
      e.preventDefault();
      const v = norm($("f-in").value);
      if (!v) return;
      if (v === norm(H.frase)) { P.e = true; guardar(); $("f-msg").textContent = ""; pintarTodo(); avisar("¡Exacto! Ahora búscala en la cuadrícula."); }
      else $("f-msg").textContent = "Todavía no. Relee el relato: la frase está ahí, tal cual.";
    });

    if (window.ResizeObserver) { OBS = new ResizeObserver(trazo); OBS.observe(rej); }
    else window.addEventListener("resize", trazo);
    pintarTodo();
    terminado();
    if (navegando) { window.scrollTo(0, 0); $("titulo").focus(); }
  }

  window.addEventListener("hashchange", () => { mostrar(true); });
  mostrar(false);
})();
