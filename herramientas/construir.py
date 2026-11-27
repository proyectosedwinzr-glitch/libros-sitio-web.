#!/usr/bin/env python3
"""
Construye el sitio con el catálogo YA ESCRITO dentro del HTML.

Lo ejecuta Cloudflare Pages cada vez que se aprueba un cambio (comando de
construcción: `python3 herramientas/construir.py`). Lee los datos de /datos y:

  • escribe /es/, /en/, /fr/, /it/ (una página por idioma de los libros), con su
    <title>, description, etiquetas og:, canonical y hreflang;
  • escribe el catálogo dentro de index.html (principal, sin pestaña Colombia), colombia.html
    (pedidos con pago Bre-B), contraentrega.html e internacional.html (destino del QR).

Así Google, WhatsApp, Facebook (y cualquiera que descargue la página sin
navegador) ven los libros. El JavaScript (app.js) sigue funcionando encima:
cambio de idioma, país de compra, pestaña Colombia…

Paso «hoy» («La historia del día», /hoy/): si existe privado/hoy/, valida cada mes con
herramientas/hoy/validar_hoy.py y, solo si no hay fallos, publica:
  • hoy/index.html con la historia del día de la construcción escrita dentro (sin el final);
    al cargar, hoy/juego.js pasa a la historia del día del dispositivo y la vuelve jugable;
  • hoy/d/AAAA-MM-DD.json de los 7 días anteriores, el de hoy y los próximos N (--hoy-dias, 40);
  • hoy/feed.xml con los días publicados hasta hoy.
Si privado/hoy/ no existe, el paso se salta con un aviso y el resto del sitio se construye igual.

Dos sitios desde el mismo repositorio (datos/sitios.csv; ver docs/dos_sitios/):
  • --sitio completo (por defecto): lo de siempre (Amazon, Hotmart, pedidos de Colombia y /hoy/). Su _redirects
    lleva /qr al sitio Amazon y /digital a la página principal (para las ediciones de Hotmart).
  • --sitio amazon: solo libros de Amazon, construido por lista blanca (páginas, estilos.css, app.js y config.js
    sin Hotmart ni pedidos de Colombia, catalogo.csv, idiomas.csv, textos.csv filtrado, imágenes, portadas,
    _redirects y version.txt). Necesita --salida. app.js y estilos.css llevan marcas «@hotmart» y «@colombia»:
    el sitio Amazon quita lo marcado; el completo solo quita las marcas (queda como antes).
  • Los dos escriben version.txt (sitio, fecha y commit). --zip crea sitio-<nombre>-AAAA-MM-DD.zip, al lado de la
    carpeta de salida, listo para arrastrar a Cloudflare.

Para probarlo en tu computador sin tocar los archivos originales:
    python3 herramientas/construir.py --salida /ruta/a/una/carpeta/vacia
Opciones del paso «hoy»: --hoy-fecha AAAA-MM-DD (fecha simulada), --hoy-dias N,
--hoy-datos CARPETA (otra carpeta de meses, para pruebas), --hoy-prueba (la página queda fijada en
--hoy-fecha, para jugar antes de tiempo; esa carpeta NO se sube como sitio definitivo), --hoy-formulario y
--hoy-privacidad RUTA (otro formulario y otro texto de privacidad, para pruebas).
Sin --salida, escribe en la carpeta del sitio (es lo que hace Cloudflare).
Con --salida, NO copia lo que no es del sitio: privado/ (nunca), herramientas/, docs/,
apps-script/, README.md, CLAUDE.md.

Solo usa la biblioteca estándar de Python.
"""
import csv, html, io, json, os, re, shutil, subprocess, sys, unicodedata, zipfile
from datetime import date, datetime, timedelta
from pathlib import Path

SITIO = 'https://ediciones-edwin-zar.pages.dev'          # dirección pública (canonical, hreflang, og:); la pone datos/sitios.csv
IMAGEN_COMPARTIR = SITIO + '/imagenes/compartir.jpg'
LOCALE_OG = {'es': 'es_ES', 'en': 'en_US', 'fr': 'fr_FR', 'it': 'it_IT', 'de': 'de_DE', 'ja': 'ja_JP'}
# Tienda que se muestra sin JavaScript (con JavaScript, el visitante elige su país).
TIENDA_INICIAL = {'es': 'US', 'en': 'US', 'fr': 'FR', 'it': 'IT', 'de': 'DE', 'ja': 'JP'}
TIENDAS = {'US': 'amazon.com', 'GB': 'amazon.co.uk', 'DE': 'amazon.de', 'FR': 'amazon.fr', 'ES': 'amazon.es',
           'IT': 'amazon.it', 'NL': 'amazon.nl', 'PL': 'amazon.pl', 'SE': 'amazon.se', 'BE': 'amazon.com.be',
           'IE': 'amazon.ie', 'JP': 'amazon.co.jp', 'CA': 'amazon.ca', 'AU': 'amazon.com.au',
           'MX': 'amazon.com.mx', 'BR': 'amazon.com.br', 'IN': 'amazon.in'}
TAPA_BLANDA = ['US', 'GB', 'DE', 'FR', 'ES', 'IT', 'NL', 'PL', 'SE', 'BE', 'IE', 'JP', 'CA', 'AU']

e = lambda s: html.escape(str(s or ''), quote=True)


def norm(s):
    s = unicodedata.normalize('NFD', str(s or '')).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '_', s).strip('_')


def leer_csv(ruta):
    if not ruta.exists():
        return []
    with ruta.open(encoding='utf-8-sig', newline='') as f:
        filas = [r for r in csv.reader(f) if any(c.strip() for c in r)]
    if not filas:
        return []
    cab = [h.strip().lower() if h.strip().lower().startswith('amazon.') else norm(h) for h in filas[0]]
    out = []
    for r in filas[1:]:
        o = {'tiendas_col': {}}
        for k, v in zip(cab, r + [''] * (len(cab) - len(r))):
            v = v.strip()
            if k.startswith('amazon.'):
                if v: o['tiendas_col'][k] = v
            elif k:
                o[k] = v
        out.append(o)
    return out


si = lambda v, defecto=True: defecto if not norm(v) else norm(v) not in ('no', 'n', 'false', '0', 'oculto')
lista = lambda s: [x.strip().lower() for x in re.split(r'[,;]', str(s or '')) if x.strip()]
slug = lambda s: norm(s).replace('_', '-') or 'x'


class Datos:
    def __init__(self, raiz):
        d = raiz / 'datos'
        self.idiomas = [i for i in leer_csv(d / 'idiomas.csv') if i.get('codigo') and si(i.get('activo'))]
        for i in self.idiomas:
            i['codigo'] = i['codigo'].lower()
        cods = {i['codigo'] for i in self.idiomas}
        nombre_a_cod = {norm(i.get('nombre')): i['codigo'] for i in self.idiomas}
        self.textos = {r['clave'].strip(): r for r in leer_csv(d / 'textos.csv') if r.get('clave')}
        self.libros = []
        for n, b in enumerate(leer_csv(d / 'catalogo.csv')):
            if not b.get('titulo') or not si(b.get('visible')):
                continue
            idi = b.get('idioma', '').strip().lower()
            b['idioma'] = idi if idi in cods else nombre_a_cod.get(norm(idi), idi)
            b['grupo'] = b.get('grupo') or f'_fila{n}'
            try: b['orden'] = float(b.get('orden'))
            except (TypeError, ValueError): b['orden'] = 9999
            b['n'] = n
            b['enlaces'] = self.enlaces(b)
            self.libros.append(b)
        hoy = date.today()
        self.hotmart = []
        for n, h in enumerate(leer_csv(d / 'hotmart.csv')):
            if not h.get('titulo') or not si(h.get('visible')) or not vigente(h, hoy):
                continue
            try: h['orden'] = float(h.get('orden'))
            except (TypeError, ValueError): h['orden'] = 9999
            h['n'] = n
            self.hotmart.append(h)
        self.hotmart.sort(key=lambda h: (h['orden'], h['n']))
        # Idiomas con libros = páginas /es/, /en/…
        self.paginas = [i['codigo'] for i in self.idiomas if self.libros_de(i['codigo'])]

    @staticmethod
    def enlaces(b):
        m = {}
        a = re.search(r'([A-Z0-9]{10})(?![A-Z0-9])', str(b.get('asin', '')), re.I)
        if a:
            asin = a.group(1).upper()
            pedidas = [{'UK': 'GB'}.get(c.upper(), c.upper()) for c in lista(b.get('tiendas'))]
            cods = [c for c in pedidas if c in TIENDAS] or list(TAPA_BLANDA)
            for c in cods:
                m[c] = f'https://www.{TIENDAS[c]}/dp/{asin}'
        for dom, url in b['tiendas_col'].items():
            for c, d in TIENDAS.items():
                if d == dom.replace('www.', ''):
                    m[c] = url
        return m

    def libros_de(self, cod):
        return sorted([b for b in self.libros if b['idioma'] == cod], key=lambda b: (b['orden'], b['n']))

    def t(self, k, lang, **v):
        fila = self.textos.get(k, {})
        s = fila.get(norm(lang)) or fila.get('es') or ''
        v.setdefault('autor', 'Edwin Zar')
        v.setdefault('anio', date.today().year)
        return re.sub(r'\{(\w+)\}', lambda m: str(v.get(m.group(1), m.group(0))), s)

    def nombre_idioma(self, cod):
        return next((i.get('nombre') or cod for i in self.idiomas if i['codigo'] == cod), cod)


def vigente(h, hoy):
    def f(s):
        m = re.match(r'(\d{4})-(\d{2})-(\d{2})', str(s or ''))
        return date(int(m[1]), int(m[2]), int(m[3])) if m else None
    desde, hasta = f(h.get('mostrar_desde')), f(h.get('mostrar_hasta'))
    return not (desde and hoy < desde) and not (hasta and hoy > hasta)


def parrafos(s):
    out, en_lista = [], False
    for p in [x.strip() for x in str(s or '').split('\n') if x.strip()]:
        m = re.match(r'^[•*\-–]\s*(.*)$', p)
        if m and not en_lista: out.append('<ul>'); en_lista = True
        if not m and en_lista: out.append('</ul>'); en_lista = False
        out.append(f'<li>{e(m[1])}</li>' if m else f'<p>{e(p)}</p>')
    if en_lista: out.append('</ul>')
    return ''.join(out)


def ruta_rel(u, pre):
    """Portadas e imágenes: rutas relativas → relativas a la página (pre = '' o '../')."""
    u = str(u or '').strip()
    if not u or re.match(r'^https?://', u, re.I):
        return u
    return pre + u


# ---------------------------------------------------------------- piezas de HTML
def html_cabecera(D, lang, pre, con_hoy=False):
    tit, sub = D.t('titulo_sitio', lang), D.t('subtitulo_sitio', lang)
    vit = ''.join(
        f'<a href="{pre}{b["idioma"]}/#{e(b["idioma"])}/{e(slug(b["grupo"]))}" title="{e(b["titulo"])}">'
        f'<img src="{e(ruta_rel(b.get("portada"), pre))}" alt="{e(b["titulo"])}" loading="lazy"></a>'
        for b in sorted(D.libros, key=lambda b: (b['orden'], b['n']))
        if b.get('portada') and b['idioma'] in D.paginas)
    return (f'<h1 id="titulo">{e(tit)}</h1>\n  <p id="subtitulo" class="subtit">{e(sub)}</p>\n'
            f'  <p id="destacado" class="destacado">{e(D.t("destacado", lang))}</p>\n'
            f'  <div id="vitrina" class="vitrina" aria-label="Libros">{vit}</div>\n'
            f'  <p id="lema">{e(D.t("lema", lang))}</p>'
            + (f'\n  <p class="enlace-hoy"><a href="{pre}hoy/" hreflang="es">{e(D.t("enlace_hoy", lang))}</a></p>' if con_hoy else ''))


def html_pestanas(D, lang, pre, con_colombia):
    activa = ' class="activa"'
    links = ''.join(f'<a href="{pre}{c}/" lang="{c}"{activa if c == lang else ""}>{e(D.nombre_idioma(c))}</a>'
                    for c in D.paginas)
    col = f'<a href="{pre}colombia" class="col">Colombia</a>' if con_colombia else ''
    return f'<span class="etq-pest">📚 {e(D.t("libros_idioma", lang))}</span>{links}{col}'


def html_tarjeta(D, b, lang, pre):
    m = b['enlaces']
    tienda = TIENDA_INICIAL.get(lang, 'US')
    principal = tienda if tienda in m else ('US' if 'US' in m else next(iter(m), None))
    compra = '<span class="prox">' + e(D.t('proximamente', lang)) + '</span>'
    if principal:
        otras = ''.join(f'<a href="{e(m[c])}" target="_blank" rel="noopener">{"UK" if c == "GB" else c}</a>'
                        for c in TAPA_BLANDA + [c for c in TIENDAS if c not in TAPA_BLANDA] if c in m and c != principal)
        compra = (f'<a class="btn amz" href="{e(m[principal])}" target="_blank" rel="noopener">'
                  f'{e(D.t("comprar", lang, tienda="Amazon" + TIENDAS[principal][6:]))}</a>'
                  + (f'<details><summary>{e(D.t("otras_tiendas", lang))}</summary><div class="chips">{otras}</div></details>' if otras else ''))
    otras_ed = [x for x in D.libros if x['grupo'] == b['grupo'] and x['idioma'] != b['idioma'] and x['idioma'] in D.paginas]
    tambien = ''
    if otras_ed:
        tambien = (f'<div class="tambien">{e(D.t("tambien_en", lang))} ' +
                   ''.join(f'<a href="{pre}{x["idioma"]}/" lang="{x["idioma"]}" title="{e(x["titulo"])}">{e(D.nombre_idioma(x["idioma"]))}</a>'
                           for x in otras_ed) + '</div>')
    portada = (f'<img class="portada" src="{e(ruta_rel(b.get("portada"), pre))}" alt="{e(b["titulo"])}" loading="lazy">'
               if b.get('portada') else f'<div class="portada">{e(b["titulo"])}</div>')
    return (f'<article class="card" id="l-{e(slug(b["grupo"]))}" lang="{e(b["idioma"])}">{portada}'
            f'<h3>{e(b["titulo"])}</h3>' + (f'<p class="sub">{e(b.get("subtitulo"))}</p>' if b.get('subtitulo') else '')
            + (f'<p class="autor">{e(b.get("autor"))}</p>' if b.get('autor') else '')
            + (f'<div class="desc">{parrafos(b.get("descripcion"))}</div>' if b.get('descripcion') else '')
            + tambien + f'<div class="compra">{compra}</div></article>')


def html_hotmart(D, lang, pre):
    if not D.hotmart:
        return ''
    tarjetas = []
    for h in D.hotmart:
        url = h.get('enlace_hotmart', '').strip()
        boton = (f'<a class="btn hot" href="{e(url)}" target="_blank" rel="noopener">{e(D.t("hotmart_comprar", lang))}</a>'
                 if re.match(r'^https?://', url) else f'<span class="prox">{e(D.t("hotmart_proximamente", lang))}</span>')
        portada = (f'<img class="portada" src="{e(ruta_rel(h.get("portada"), pre))}" alt="{e(h["titulo"])}" loading="lazy">'
                   if h.get('portada') else f'<div class="portada">{e(h["titulo"])}</div>')
        etq = f'<div class="etiquetas"><span class="etq nuevo">{e(h["etiqueta"])}</span></div>' if h.get('etiqueta') else ''
        tarjetas.append(f'<article class="card" lang="{e(h.get("idioma") or "es")}">{portada}<h3>{e(h["titulo"])}</h3>'
                        + (f'<p class="sub">{e(h.get("subtitulo"))}</p>' if h.get('subtitulo') else '')
                        + (f'<p class="autor">{e(h.get("autor"))}</p>' if h.get('autor') else '') + etq
                        + (f'<div class="desc">{parrafos(h.get("descripcion"))}</div>' if h.get('descripcion') else '')
                        + f'<div class="compra">{boton}</div></article>')
    return (f'<section class="seccion hotmart" id="hotmart"><h2 class="sec-titulo">{e(D.t("sec_hotmart", lang))}</h2>'
            f'<p class="sec-nota">{e(D.t("hotmart_nota", lang))}</p><div class="grid">{"".join(tarjetas)}</div></section>')


def html_catalogo(D, lang, pre, con_hotmart):
    libros = D.libros_de(lang)
    nombre = D.nombre_idioma(lang)
    accesos = ''
    if con_hotmart and D.hotmart:
        accesos = (f'<nav class="accesos" aria-label="Secciones"><a href="#amazon">{e(D.t("acceso_amazon", lang))}</a>'
                   f'<a href="#hotmart" class="a-hot">{e(D.t("acceso_hotmart", lang))}</a></nav>')
    return (accesos + f'<section class="seccion" id="amazon"><h2 class="sec-titulo">{e(D.t("sec_amazon", lang))}</h2>'
            f'<p class="pais-info">🛒 {e(D.t("pais_info", lang))}</p>'
            f'<h3 class="titulo-libros">{e(nombre)}</h3>'
            f'<div class="grid">{"".join(html_tarjeta(D, b, lang, pre) for b in libros)}</div></section>'
            + (html_hotmart(D, lang, pre) if con_hotmart else ''))


def html_meta(D, lang, url_pagina, canonical):
    tit = f'{D.t("titulo_sitio", lang)} · {D.t("subtitulo_sitio", lang)}'
    desc = D.t('destacado', lang) or D.t('lema', lang)
    alternos = ''.join(f'<link rel="alternate" hreflang="{c}" href="{SITIO}/{c}/">\n' for c in D.paginas)
    alternos += f'<link rel="alternate" hreflang="x-default" href="{SITIO}/">\n'
    return (f'<title>{e(tit)}</title>\n<meta name="description" content="{e(desc)}">\n'
            f'<link rel="canonical" href="{e(canonical)}">\n{alternos}'
            '<!-- Vista previa al compartir el enlace (WhatsApp, Facebook, X, LinkedIn…) -->\n'
            f'<meta property="og:type" content="website">\n<meta property="og:site_name" content="{e(D.t("titulo_sitio", lang))}">\n'
            f'<meta property="og:locale" content="{LOCALE_OG.get(lang, "es_ES")}">\n'
            f'<meta property="og:url" content="{e(url_pagina)}">\n<meta property="og:title" content="{e(tit)}">\n'
            f'<meta property="og:description" content="{e(desc)}">\n<meta property="og:image" content="{IMAGEN_COMPARTIR}">\n'
            '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n'
            f'<meta property="og:image:alt" content="{e(tit)}">\n<meta name="twitter:card" content="summary_large_image">\n'
            f'<meta name="twitter:image" content="{IMAGEN_COMPARTIR}">\n')


def reemplazar(h, nombre, contenido):
    a, b = f'<!--INICIO-{nombre}-->', f'<!--FIN-{nombre}-->'
    if a not in h or b not in h:
        raise SystemExit(f'Falta la marca {a} en index.html')
    i, j = h.index(a) + len(a), h.index(b)
    return h[:i] + contenido + h[j:]


def sustituir(h, viejo, nuevo, todas=False):
    """Sustitución estricta: si no encuentra su cadena, la construcción falla (no sigue en silencio)."""
    if viejo not in h:
        raise SystemExit(f'Sustitución fallida: no se encontró «{viejo[:70]}»')
    return h.replace(viejo, nuevo) if todas else h.replace(viejo, nuevo, 1)


def pagina(D, plantilla, lang, pre, url_pagina, canonical, ajustes, con_colombia=True, con_hotmart=True, con_hoy=False):
    h = sustituir(plantilla, '<html lang="es">', f'<html lang="{lang}">')
    h = reemplazar(h, 'META', html_meta(D, lang, url_pagina, canonical))
    h = reemplazar(h, 'CABECERA', html_cabecera(D, lang, pre, con_hoy))
    h = reemplazar(h, 'PESTANAS', html_pestanas(D, lang, pre, con_colombia))
    h = reemplazar(h, 'CATALOGO', html_catalogo(D, lang, pre, con_hotmart))
    h = reemplazar(h, 'PIE', e(D.t('pie', lang)))
    h = sustituir(h, '<!--AJUSTES-PAGINA-->', f'<script>{ajustes}</script>' if ajustes else '')
    if pre:   # páginas en subcarpeta: los archivos del sitio están un nivel arriba
        for f in ('estilos.css', 'config.js', 'app.js'):
            h = sustituir(h, f'"{f}"', f'"{pre}{f}"', todas=True)
    return h


# ---------------------------------------------------------------- «La historia del día» (/hoy/)
HOY_DIAS_ATRAS = 7            # «Días anteriores»: solo los 7 últimos (los demás no se publican)
HOY_DIAS_ADELANTE = 40        # por defecto, --hoy-dias: así basta una subida al mes
MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre',
            'octubre', 'noviembre', 'diciembre']
DIAS_ES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
COMO_SE_JUEGA = [   # orden aprobado por el autor (ESPEC §2)
    'Lee el relato y completa la frase.',
    'Busca las palabras y la frase, que forma la figura que ves al lado.',
    'Usa un color para las palabras y otro para la frase.',
    'Las letras que sobran, bajando por columnas, forman el final del relato.',
]


def fecha_larga(iso, con_dia=False, con_anio=False):
    d = date.fromisoformat(iso)
    s = f'{d.day} de {MESES_ES[d.month - 1]}' + (f' de {d.year}' if con_anio else '')
    return (DIAS_ES[d.weekday()] + ' ' + s) if con_dia else s


def fecha_rfc822(iso):
    """Fecha para RSS (en inglés, como manda el formato): medianoche de Colombia."""
    d = date.fromisoformat(iso)
    dias = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    meses = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return f'{dias[d.weekday()]}, {d.day:02d} {meses[d.month - 1]} {d.year} 00:00:00 -0500'


def svg_figura(recorrido):
    """La figura del recorrido de la frase, recortada a su caja (como en la página del libro)."""
    filas = [p[0] for p in recorrido]
    cols = [p[1] for p in recorrido]
    f0, c0 = min(filas), min(cols)
    alto, ancho = max(filas) - f0 + 1, max(cols) - c0 + 1
    t = 16
    puntos = ' '.join(f'{(c - c0) * t + t / 2:g},{(f - f0) * t + t / 2:g}' for f, c in recorrido)
    ini = recorrido[0]
    return (f'<svg class="figura" viewBox="0 0 {ancho * t} {alto * t}" width="{ancho * t * 2}" height="{alto * t * 2}" '
            f'role="img" aria-label="Figura que dibuja el recorrido de la frase">'
            f'<polyline points="{puntos}" fill="none" stroke="currentColor" stroke-width="5" '
            f'stroke-linecap="round" stroke-linejoin="round"/>'
            f'<circle cx="{(ini[1] - c0) * t + t / 2:g}" cy="{(ini[0] - f0) * t + t / 2:g}" r="4.5" fill="currentColor"/></svg>')


FORMULARIO_PROHIBIDO = re.compile(r'<\s*(script|iframe|link|img|style|object|embed)\b|\son\w+\s*=|\bsrc\s*=|javascript:', re.I)


def leer_formulario(ruta):
    """El formulario incrustado del servicio de correo (datos/hoy_formulario.html). Vacío = no hay formulario.
    Solo HTML: sin scripts ni nada que se cargue de otro dominio (la página no llama a terceros hasta que se envía).
    Si no cumple, ValueError con el motivo."""
    f = ruta.read_text(encoding='utf-8').strip() if ruta.exists() else ''
    if not f:
        return ''
    m = FORMULARIO_PROHIBIDO.search(f)
    if m:
        raise ValueError(f'el formulario lleva «{m.group(0).strip()}»: tiene que ser solo HTML, sin scripts, imágenes ni nada '
                         'que se cargue de otro dominio (pide al servicio de correo la versión «HTML» del formulario)')
    if not (re.search(r'<form\b[^>]*\baction\s*=\s*["\']https://', f, re.I)
            and re.search(r'<form\b[^>]*\bmethod\s*=\s*["\']post["\']', f, re.I)):
        raise ValueError('el formulario tiene que ser un <form method="post" action="https://…"> del servicio de correo')
    return f


def leer_privacidad(ruta):
    """El texto de /privacidad/ (datos/hoy_privacidad.md). ValueError si falta, si es un borrador o si le faltan datos."""
    t = ruta.read_text(encoding='utf-8').strip() if ruta.exists() else ''
    if not t:
        raise ValueError(f'falta el texto de la página de privacidad ({ruta.name})')
    if t.upper().startswith('BORRADOR'):
        raise ValueError(f'la página de privacidad ({ruta.name}) sigue siendo un borrador: el autor tiene que revisarla')
    if '[[' in t:
        faltan = ', '.join(sorted(set(re.findall(r'\[\[[^]]*\]\]', t))))
        raise ValueError(f'a la página de privacidad ({ruta.name}) le faltan datos: {faltan}')
    return t


def enlaces_md(s):
    """Texto con enlaces [así](https://…) o [así](mailto:…): se escapa todo y luego se crean los enlaces."""
    return re.sub(r'\[([^\]]+)\]\(((?:https://|mailto:)[^)\s]+)\)', lambda m: f'<a href="{m.group(2)}">{m.group(1)}</a>', e(s))


def html_privacidad(D, texto):
    partes = []
    for b in [x.strip() for x in re.split(r'\n\s*\n', texto) if x.strip()]:
        lineas = [x.strip() for x in b.splitlines()]
        if b.startswith('## '):
            partes.append(f'<h2>{e(b[3:].strip())}</h2>')
        elif b.startswith('# '):
            partes.append(f'<h1>{e(b[2:].strip())}</h1>')
        elif all(x.startswith('- ') for x in lineas):
            partes.append('<ul>' + ''.join(f'<li>{enlaces_md(x[2:])}</li>' for x in lineas) + '</ul>')
        else:
            partes.append(f'<p>{enlaces_md(" ".join(lineas))}</p>')
    return ('<!DOCTYPE html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
            '<title>Privacidad · La historia del día · Libros de Edwin Zar</title>\n'
            f'<link rel="canonical" href="{SITIO}/privacidad/">\n'
            '<link rel="stylesheet" href="../hoy/juego.css">\n</head>\n<body>\n<main class="pagina privacidad">\n'
            '<a class="volver" href="../hoy/">← La historia del día</a>\n' + '\n'.join(partes) +
            f'\n<p class="pie">{e(D.t("pie", "es"))}</p>\n</main>\n</body>\n</html>\n')


def libros_hoy(D, raiz, historias):
    """A dónde lleva «Más historias como esta» en cada libro de las historias: al enlace de Amazon Attribution de
    datos/hoy_enlaces.csv, si lo hay; si no, a la ficha del libro en el catálogo (en español, si existe)."""
    enlaces = {}
    for r in leer_csv(raiz / 'datos' / 'hoy_enlaces.csv'):
        u = (r.get('enlace') or '').strip()
        if r.get('libro') and u:
            if not re.match(r'^https://(www\.)?amazon\.[a-z.]+/', u):
                raise SystemExit(f'datos/hoy_enlaces.csv: el enlace de «{r["libro"]}» tiene que ser de Amazon: «{u}»')
            enlaces[r['libro'].strip()] = u
    out = {}
    for lib in sorted({h.get('libro') for h in historias.values() if h.get('libro')}):
        ed = (next((b for b in D.libros if slug(b['grupo']) == lib and b['idioma'] == 'es'), None)
              or next((b for b in D.libros if slug(b['grupo']) == lib and b['idioma'] in D.paginas), None))
        if not ed:
            print(f'Aviso: el libro «{lib}» de las historias no está en el catálogo: «Más historias como esta» lleva al catálogo.')
            out[lib] = {'titulo': '', 'autor': '', 'url': enlaces.get(lib) or '../'}
            continue
        out[lib] = {'titulo': ed['titulo'], 'autor': ed.get('autor', ''),
                    'url': enlaces.get(lib) or f'../{ed["idioma"]}/#{ed["idioma"]}/{slug(ed["grupo"])}'}
    return out


def html_hoy(D, h, nota, imagen, config, formulario=''):
    """La página /hoy/ con la historia escrita dentro (para buscadores y sin JavaScript). NUNCA lleva el final.
    Con JavaScript, hoy/juego.js pasa a la historia del día del dispositivo. config (#hoy-config) solo lleva
    fechas: los días publicados, el primero de todos y, en una construcción de prueba, la fecha fijada."""
    url = f'{SITIO}/hoy/'
    tit_og = 'La historia del día · Libros de Edwin Zar'
    desc = ('Una historia real cada día, con una sopa de letras para descubrir su final escondido. '
            'Gratis y sin registrarse.')
    cuerpo = ''
    if nota:
        cuerpo += f'<p class="nota" role="status">{e(nota)}</p>'
    if h:
        pg, cu = h['pagina'], h['cuadricula']
        frase = ''.join(
            '<span class="palabra">' + ''.join(
                f'<span class="letra{" hueco" if ch == "_" else ""}">{"" if ch == "_" else e(ch)}</span>' for ch in tok)
            + '</span>' for tok in pg['frase_visible'])
        visible_lector = ' '.join(''.join(ch if ch != '_' else '·' for ch in tok) for tok in pg['frase_visible'])
        filas = ''.join('<tr>' + ''.join(f'<td>{e(ch)}</td>' for ch in fila) + '</tr>' for fila in cu['filas'])
        ranuras = ''.join('<span class="palabra">' + '<span class="letra hueco"></span>' * n + '</span>'
                          for n in h['pagina_cuadricula']['ranuras'])
        cuerpo += (
            f'<p class="antetitulo">{e(h.get("antetitulo") or "La historia del día")} · {e(fecha_larga(h["fecha"]))}</p>'
            f'<h1>{e(h["titulo"])}</h1>'
            f'<p class="hecho">{e(h.get("fecha_del_hecho"))}</p>'
            f'<p class="relato">{e(h["relato"])}</p>'
            f'<h2>{e(pg.get("rotulo_frase") or "La frase")}</h2>'
            f'<div class="frase-caja"><div class="frase" aria-hidden="true">{frase}</div>'
            + (svg_figura(h['frase_recorrido']) if pg.get('figura_visible') else '') + '</div>'
            f'<p class="sr">La frase, con las letras que ya se ven (los puntos son huecos): {e(visible_lector)}</p>'
            f'<h2>La cuadrícula</h2>'
            f'<table class="tabla" style="--lado:{int(cu["lado"])}"><caption class="sr">Cuadrícula de '
            f'{int(cu["lado"])} por {int(cu["lado"])} letras</caption><tbody>{filas}</tbody></table>'
            f'<p>{e(pg.get("indicaciones"))}</p>'
            f'<h2>{e(pg.get("rotulo_lista") or "Las palabras")}</h2>'
            '<ul class="lista-papel">' + ''.join(f'<li>{e(w)}</li>' for w in pg['lista']) + '</ul>'
            f'<h2>{e(h["pagina_cuadricula"].get("rotulo_final") or "El final del relato")}</h2>'
            f'<div class="ranuras" aria-hidden="true">{ranuras}</div>'
            '<p class="sin-js">Para jugar en la pantalla hace falta JavaScript. También puedes resolverla en papel.</p>')
    como = ('<details id="como"><summary>Cómo se juega</summary><ol>' + ''.join(f'<li>{e(x)}</li>' for x in COMO_SE_JUEGA)
            + '</ol></details>')
    correo = ''
    if formulario:   # se enseña al resolver (juego.js lo pone en el bloque del final)
        correo = ('<section class="correo" id="correo" hidden aria-labelledby="t-correo">'
                  '<h2 id="t-correo">Recibe cada domingo las historias de la semana</h2>\n'
                  f'{formulario}\n<p class="correo-nota">Te llegará un correo para confirmar la suscripción. Puedes darte de baja '
                  'cuando quieras, con el enlace de cada correo. <a href="../privacidad/">Cómo tratamos tus datos</a>.</p></section>\n')
    prueba = ''
    if config.get('fijo'):
        prueba = (f'<p class="prueba">Versión de prueba: la fecha está fijada en el '
                  f'{e(fecha_larga(config["fijo"], con_dia=True, con_anio=True))}. No es para publicar.</p>\n')
    datos = json.dumps(config, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    return (
        '<!DOCTYPE html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f'<title>{e((h["titulo"] + " · ") if h else "")}La historia del día · Libros de Edwin Zar</title>\n'
        f'<meta name="description" content="{e(desc)}">\n<link rel="canonical" href="{url}">\n'
        + ('<meta name="robots" content="noindex">\n' if config.get('fijo') else '') +
        f'<link rel="alternate" type="application/rss+xml" title="La historia del día" href="feed.xml">\n'
        f'<meta property="og:type" content="website">\n<meta property="og:site_name" content="Libros de Edwin Zar">\n'
        f'<meta property="og:locale" content="es_ES">\n<meta property="og:url" content="{url}">\n'
        f'<meta property="og:title" content="{e(tit_og)}">\n<meta property="og:description" content="{e(desc)}">\n'
        f'<meta property="og:image" content="{imagen}">\n<meta name="twitter:card" content="summary_large_image">\n'
        f'<meta name="twitter:image" content="{imagen}">\n'
        "<link rel=\"icon\" href=\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E"
        "%3Ctext y='.9em' font-size='90'%3E📚%3C/text%3E%3C/svg%3E\">\n"
        '<link rel="stylesheet" href="juego.css">\n</head>\n<body>\n'
        f'<main class="pagina" id="hoy" data-fecha="{e(h["fecha"]) if h else ""}">\n'
        '<a class="volver" href="../">← Libros de Edwin Zar</a>\n'
        f'{prueba}<div id="vista">{cuerpo}</div>\n{como}\n{correo}<p class="pie">{e(D.t("pie", "es"))}</p>\n</main>\n'
        f'<script type="application/json" id="hoy-config">{datos}</script>\n'
        '<script src="juego.js" defer></script>\n</body>\n</html>\n')


def xml_feed(dias, historias):
    items = ''.join(
        '<item>'
        f'<title>{e(fecha_larga(f, con_anio=True))} · {e(historias[f]["titulo"])}</title>'
        f'<link>{SITIO}/hoy/#{f}</link><guid isPermaLink="false">hoy-{f}</guid>'
        f'<pubDate>{fecha_rfc822(f)}</pubDate>'
        f'<description>{e(historias[f]["relato"])}</description>'
        '</item>' for f in sorted(dias, reverse=True))
    return ('<?xml version="1.0" encoding="utf-8"?>\n<rss version="2.0"><channel>'
            '<title>La historia del día · Libros de Edwin Zar</title>'
            f'<link>{SITIO}/hoy/</link>'
            '<description>Una historia real cada día, con una sopa de letras para descubrir su final escondido.'
            '</description><language>es</language>' + items + '</channel></rss>\n')


def paso_hoy(D, raiz, salida, fecha, dias, carpeta, prueba=False, ruta_formulario=None, ruta_privacidad=None):
    """Devuelve 0 si se publicó o se saltó con aviso; 1 si el validador falló (y entonces no se publica nada de /hoy/).
    Con prueba=True (--hoy-prueba), la página queda fijada en la fecha de la construcción, para jugar antes de tiempo:
    esa carpeta no se sube como sitio definitivo."""
    destino = salida / 'hoy'

    def limpiar_generados():
        for g in (destino / 'index.html', destino / 'feed.xml', salida / 'privacidad' / 'index.html'):
            if g.exists(): g.unlink()
        for c in (destino / 'd', salida / 'privacidad'):
            if c.exists(): shutil.rmtree(c)

    def no_publicar():
        if salida != raiz:
            if destino.exists(): shutil.rmtree(destino)      # carpeta de salida: nada de /hoy/
        else:
            limpiar_generados()                               # dentro del repositorio: nunca se borra hoy/fuentes

    if not carpeta.is_dir():
        print(f'Aviso: no existe {carpeta}: se salta «La historia del día» (/hoy/). El resto del sitio se construye igual.')
        no_publicar()
        return 0
    meses = sorted(carpeta.glob('hoy_*.json'))
    if not meses:
        print(f'Aviso: no hay ningún hoy_AAAA-MM.json en {carpeta}: se salta «La historia del día» (/hoy/).')
        no_publicar()
        return 0
    validador = raiz / 'herramientas' / 'hoy' / 'validar_hoy.py'
    historias, fallo = {}, False
    for m in meses:
        r = subprocess.run([sys.executable, '-I', str(validador), str(m)], capture_output=True, text=True,
                           encoding='utf-8', errors='replace')
        print('  Validador: ' + (r.stdout.strip() or '(sin salida)').replace('\n', '\n  '))
        if r.returncode != 0:
            fallo = True
            if r.stderr.strip():
                print('  ' + r.stderr.strip().replace('\n', '\n  '))
            continue
        for h in json.loads(m.read_text(encoding='utf-8'))['historias']:
            if h['fecha'] in historias:
                fallo = True
                print(f'  ✗ La fecha {h["fecha"]} está en dos archivos de mes.')
            historias[h['fecha']] = h
    if fallo:
        print('ERROR: el validador encontró fallos. NO se publica nada de «La historia del día» (/hoy/).')
        no_publicar()
        return 1

    desde, hasta = fecha - timedelta(days=HOY_DIAS_ATRAS), fecha + timedelta(days=dias)
    publicadas = sorted(f for f in historias if desde <= date.fromisoformat(f) <= hasta)
    hasta_hoy = [f for f in publicadas if date.fromisoformat(f) <= fecha]
    # Portada: la de hoy; si no hay, la última publicada (con una nota amable); si aún no ha empezado, un aviso.
    pasadas = sorted(f for f in historias if date.fromisoformat(f) <= fecha)
    hoy_iso = fecha.isoformat()
    if hoy_iso in historias:
        portada, nota = historias[hoy_iso], ''
    elif pasadas:
        portada = historias[pasadas[-1]]
        nota = (f'La historia de hoy todavía no está lista. Mientras tanto, aquí tienes la del '
                f'{fecha_larga(pasadas[-1], con_dia=True)}.')
    else:
        portada = None
        nota = (f'La primera historia del día llega el {fecha_larga(min(historias), con_dia=True, con_anio=True)}. '
                'Cada día, una historia real y una sopa de letras para descubrir su final.')

    limpiar_generados()
    (destino / 'd').mkdir(parents=True, exist_ok=True)
    for f in publicadas:
        (destino / 'd' / f'{f}.json').write_text(json.dumps(historias[f], ensure_ascii=False, separators=(',', ':')),
                                                 encoding='utf-8')
    imagen = f'{SITIO}/hoy/compartir.jpg' if (raiz / 'hoy' / 'compartir.jpg').exists() else IMAGEN_COMPARTIR
    config = {'dias': publicadas, 'primera': min(historias), 'fijo': hoy_iso if prueba else '',
              'libros': libros_hoy(D, raiz, historias)}
    # El formulario de correo solo se publica con su página de privacidad, ya revisada por el autor.
    codigo, formulario = 0, ''
    try:
        formulario = leer_formulario(ruta_formulario or raiz / 'datos' / 'hoy_formulario.html')
        if formulario:
            privacidad = leer_privacidad(ruta_privacidad or raiz / 'datos' / 'hoy_privacidad.md')
            escribir_tal_cual(salida / 'privacidad' / 'index.html', html_privacidad(D, privacidad))
    except ValueError as err:
        print(f'ERROR: no se publica el formulario de correo: {err}.')
        formulario, codigo = '', 1
    (destino / 'index.html').write_text(html_hoy(D, portada, nota, imagen, config, formulario), encoding='utf-8')
    (destino / 'feed.xml').write_text(xml_feed(hasta_hoy, historias), encoding='utf-8')
    rango = f'{publicadas[0]} … {publicadas[-1]}' if publicadas else 'ninguno'
    print(f'La historia del día (fecha {hoy_iso}, --hoy-dias {dias}): {len(publicadas)} días publicados ({rango}); '
          f'portada: {portada["fecha"] if portada else "aviso, aún no hay historias"}; feed: {len(hasta_hoy)} días; '
          f'formulario de correo: {"sí, con /privacidad/" if formulario else "no"}.')
    if prueba:
        print(f'AVISO: construcción DE PRUEBA (--hoy-prueba): /hoy/ queda fijada en el {hoy_iso}. '
              'Sirve para jugar antes de tiempo; NO la subas como sitio definitivo.')
    return codigo


# Lo que no es del sitio y no se copia a la carpeta de salida (privado/ NUNCA).
NO_PUBLICAR = {'privado', 'herramientas', 'docs', 'apps-script', 'README.md', 'CLAUDE.md', '.gitignore', '.nojekyll',
               'version.txt'}
NO_PUBLICAR_DENTRO = {'datos': {'sitios.csv', 'hoy_privacidad.md'}}   # de la construcción (la privacidad sale de ahí, revisada)


def ignorar_al_copiar(raiz, salida=None):
    def f(carpeta, nombres):
        fuera = {n for n in nombres if n in ('.git', '__pycache__', 'node_modules')}
        c = Path(carpeta).resolve()
        if c == raiz:
            fuera |= {n for n in nombres if n in NO_PUBLICAR or n.startswith('salida-')
                      or (n.startswith('sitio-') and n.endswith('.zip'))}
        elif c.parent == raiz and c.name in NO_PUBLICAR_DENTRO:
            fuera |= {n for n in nombres if n in NO_PUBLICAR_DENTRO[c.name]}
        if salida is not None:
            fuera |= {n for n in nombres if (c / n).resolve() == salida}   # la carpeta de salida, si está dentro
        return fuera
    return f


# ---------------------------------------------------------------- dos sitios: completo y Amazon (datos/sitios.csv)
SECCIONES = ('hotmart', 'colombia')
# Claves de datos/textos.csv que no van a un sitio sin esa sección.
TEXTOS_DE = {'hotmart': ('hotmart_', 'acceso_hotmart', 'sec_hotmart'),
             'colombia': ('colombia_', 'aviso_colombia', 'pais_co_pedido'),
             'hoy': ('enlace_hoy',)}
MARCA_LINEA = re.compile(r'^[ \t]*(?://[ \t]*@(fin-)?([a-z]+)|/\*[ \t]*@(fin-)?([a-z]+)[ \t]*\*/)[ \t]*\r?$')
MARCA_EN_LINEA = re.compile(r'/\*@(fin-)?([a-z]+)\*/')


def leer_sitios(raiz):
    filas = {}
    with (raiz / 'datos' / 'sitios.csv').open(encoding='utf-8-sig', newline='') as f:
        for r in csv.DictReader(f):
            nombre = (r.get('sitio') or '').strip()
            if not nombre:
                continue
            url = (r.get('url') or '').strip().rstrip('/')
            if not re.match(r'^https://[a-z0-9.-]+$', url, re.I):
                raise SystemExit(f'datos/sitios.csv: la dirección del sitio «{nombre}» no es válida: «{url}»')
            filas[nombre] = {'url': url, 'qr_destino': (r.get('qr_destino') or '').strip(),
                             **{k: si(r.get(k), False) for k in ('hotmart', 'colombia', 'hoy', 'indexar')}}
            if not filas[nombre]['qr_destino']:
                raise SystemExit(f'datos/sitios.csv: falta el destino de /qr del sitio «{nombre}»')
    for n in ('completo', 'amazon'):
        if n not in filas:
            raise SystemExit(f'datos/sitios.csv: falta el sitio «{n}»')
    return filas


def recortar(texto, quitar, nombre, exigir=SECCIONES):
    """Marcas de sección de app.js y estilos.css. Una línea «// @hotmart» … «// @fin-hotmart» (en CSS,
    «/* @hotmart */» … «/* @fin-hotmart */») encierra líneas enteras; «/*@hotmart*/ … /*@fin-hotmart*/», un trozo
    de una línea. Siempre se quitan las marcas; lo marcado, solo si su sección está en «quitar». Sin nada que quitar,
    el archivo queda byte a byte como era antes de marcarlo. Falla (regla 7) si una marca no se cierra, si no se
    conoce o si falta alguna sección de «exigir»."""
    vistas, salida, abierta = set(), [], None
    for n, linea in enumerate(texto.split('\n'), 1):
        m = MARCA_LINEA.match(linea)
        if m:
            fin, tipo = (m.group(1), m.group(2)) if m.group(2) else (m.group(3), m.group(4))
            if tipo not in SECCIONES:
                raise SystemExit(f'{nombre}, línea {n}: marca desconocida «@{tipo}»')
            if fin:
                if abierta != tipo:
                    raise SystemExit(f'{nombre}, línea {n}: «@fin-{tipo}» sin su «@{tipo}»')
                abierta = None
            else:
                if abierta:
                    raise SystemExit(f'{nombre}, línea {n}: «@{tipo}» dentro de «@{abierta}»')
                abierta = tipo
                vistas.add(tipo)
            continue
        if abierta in quitar:
            continue
        partes, pos, dentro, inicio = [], 0, None, 0
        for mm in MARCA_EN_LINEA.finditer(linea):
            fin, tipo = mm.group(1), mm.group(2)
            if tipo not in SECCIONES:
                raise SystemExit(f'{nombre}, línea {n}: marca desconocida «@{tipo}»')
            if not fin:
                if dentro:
                    raise SystemExit(f'{nombre}, línea {n}: «/*@{tipo}*/» dentro de «/*@{dentro}*/»')
                partes.append(linea[pos:mm.start()])
                dentro, inicio = tipo, mm.end()
                vistas.add(tipo)
            else:
                if dentro != tipo:
                    raise SystemExit(f'{nombre}, línea {n}: «/*@fin-{tipo}*/» sin su «/*@{tipo}*/»')
                if tipo not in quitar:
                    partes.append(linea[inicio:mm.start()])
                dentro = None
            pos = mm.end()
        if dentro:
            raise SystemExit(f'{nombre}, línea {n}: «/*@{dentro}*/» sin cerrar en la misma línea')
        partes.append(linea[pos:])
        salida.append(''.join(partes))
    if abierta:
        raise SystemExit(f'{nombre}: «@{abierta}» sin cerrar')
    faltan = [t for t in exigir if t not in vistas]
    if faltan:
        raise SystemExit(f'{nombre}: no se encontró ninguna marca «@{faltan[0]}» (¿se borraron?)')
    return '\n'.join(salida)


def sin_pedidos(config):
    """config.js de un sitio sin pedidos de Colombia: sin la dirección de la app de pedidos ni el WhatsApp."""
    for clave in ('URL_COLOMBIA', 'WHATSAPP'):
        config, n = re.subn(rf'\n[ \t]*//[^\n]*\n[ \t]*{clave}[ \t]*:[^\n]*\n(?:[ \t]*\n)?', '\n', config, count=1)
        if n != 1 or re.search(rf'\b{clave}\b', config):
            raise SystemExit(f'config.js: no se pudo quitar «{clave}» (con su comentario encima) para el sitio sin pedidos')
    return config


def textos_sin(ruta, quitar):
    """datos/textos.csv sin las claves de las secciones de «quitar». Falla si alguna sección no tenía ninguna."""
    with ruta.open(encoding='utf-8-sig', newline='') as f:
        filas = list(csv.reader(f))
    quedan, quitadas = [filas[0]], {s: 0 for s in quitar}
    for r in filas[1:]:
        clave = (r[0] if r else '').strip()
        de = next((s for s in quitar if clave.startswith(TEXTOS_DE[s])), None)
        if de:
            quitadas[de] += 1
        else:
            quedan.append(r)
    for sec, n in quitadas.items():
        if not n:
            raise SystemExit(f'datos/textos.csv: no hay ningún texto de «{sec}» que quitar (¿cambiaron las claves?)')
    out = io.StringIO()
    csv.writer(out, lineterminator='\n').writerows(quedan)
    return out.getvalue()


def texto_redirects(nombre, cfg, con_hoy=False):
    destino = cfg['qr_destino']
    if nombre == 'completo':
        return ('# Dirección del QR impreso en los libros de Amazon (ediciones-edwin-zar.pages.dev/qr): lleva al sitio Amazon.\n'
                '# El destino sale de datos/sitios.csv. 302 = temporal: se puede cambiar sin cambiar el QR.\n'
                f'/qr   {destino}  302\n/qr/  {destino}  302\n'
                '# Dirección para las ediciones digitales de Hotmart: la página principal (Amazon y Hotmart).\n'
                '/digital   /  302\n/digital/  /  302\n'
                + ('# Dirección fácil de «La historia del día».\n/historia-del-dia  /hoy/  301\n' if con_hoy else ''))
    return ('# Dirección del QR impreso en los productos de Amazon: la página principal de este sitio.\n'
            f'/qr   {destino}  302\n/qr/  {destino}  302\n'
            + ('# Dirección fácil de «La historia del día».\n/historia-del-dia  /hoy/  301\n' if con_hoy else ''))


def texto_version(raiz, nombre):
    """Para comprobar, tras subir un zip, que se subió el sitio correcto al proyecto correcto (/version.txt)."""
    commit, sucio = os.environ.get('CF_PAGES_COMMIT_SHA', '')[:7], False
    if not commit:
        try:
            git = lambda *a: subprocess.run(['git', '-C', str(raiz), *a], capture_output=True, text=True, timeout=20).stdout.strip()
            commit = git('rev-parse', '--short', 'HEAD')
            sucio = bool(commit and git('status', '--porcelain', '--untracked-files=no'))
        except (OSError, subprocess.SubprocessError):
            commit = ''
    commit = (commit or 'desconocido') + (' (con cambios sin guardar)' if sucio else '')
    return f'sitio: {nombre} · construido: {datetime.now().strftime("%Y-%m-%d %H:%M")} · commit: {commit}\n'


def leer_tal_cual(ruta):
    with open(ruta, encoding='utf-8', newline='') as f:
        return f.read()


def escribir_tal_cual(ruta, texto):
    ruta.parent.mkdir(parents=True, exist_ok=True)
    with open(ruta, 'w', encoding='utf-8', newline='') as f:
        f.write(texto)


def comprimir(salida, nombre):
    """El contenido de la carpeta de salida en sitio-<nombre>-AAAA-MM-DD.zip, al lado de la carpeta: listo para arrastrar."""
    destino = salida.parent / f'sitio-{nombre}-{date.today().isoformat()}.zip'
    with zipfile.ZipFile(destino, 'w', zipfile.ZIP_DEFLATED) as z:
        for p in sorted(salida.rglob('*')):
            if p.is_file():
                z.write(p, p.relative_to(salida).as_posix())
    return destino


def construir_lista_blanca(D, raiz, salida, plantilla, pags, cfg, nombre, con_hoy=False):
    """Un sitio sin alguna sección (el Amazon): solo lleva lo que necesita y, de app.js, estilos.css, config.js y
    textos.csv, quita lo de las secciones que no lleva. Nunca copia hotmart.csv, apps-script/, colombia.html,
    contraentrega.html, internacional.html, herramientas/, docs/ ni privado/."""
    if salida == raiz:
        raise SystemExit(f'El sitio «{nombre}» solo se construye en una carpeta aparte: añade --salida CARPETA.')
    quitar = {s for s in SECCIONES if not cfg[s]}
    if salida.exists():
        shutil.rmtree(salida)
    salida.mkdir(parents=True)
    escritas = []

    def escribir(rel, contenido):
        escribir_tal_cual(salida / rel, contenido)
        escritas.append(rel)

    def copiar(rel):
        (salida / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(raiz / rel, salida / rel)

    def robots(h):
        return h if cfg['indexar'] else sustituir(h, '<meta charset="utf-8">',
                                                  '<meta charset="utf-8">\n<meta name="robots" content="noindex">')

    secciones = dict(con_colombia=cfg['colombia'], con_hotmart=cfg['hotmart'], con_hoy=con_hoy)
    for lang in D.paginas:
        escribir(f'{lang}/index.html', robots(pagina(D, plantilla, lang, '../', f'{SITIO}/{lang}/', f'{SITIO}/{lang}/',
                 f'window.CONFIG.IDIOMA_PAGINA = "{lang}"; window.CONFIG.PAGINAS_IDIOMA = {pags};', **secciones)))
    escribir('index.html', robots(pagina(D, plantilla, 'es', '', f'{SITIO}/', f'{SITIO}/', '', **secciones)))
    escribir('app.js', recortar(leer_tal_cual(raiz / 'app.js'), quitar, 'app.js'))
    escribir('estilos.css', recortar(leer_tal_cual(raiz / 'estilos.css'), quitar, 'estilos.css'))
    config = leer_tal_cual(raiz / 'config.js')
    escribir('config.js', sin_pedidos(config) if 'colombia' in quitar else config)
    escribir('datos/textos.csv', textos_sin(raiz / 'datos' / 'textos.csv', quitar | (set() if con_hoy else {'hoy'})))
    for rel in ('datos/catalogo.csv', 'datos/idiomas.csv'):
        copiar(rel)
    for carpeta in ('imagenes', 'portadas'):
        for f in sorted((raiz / carpeta).rglob('*')):
            rel = f.relative_to(raiz)
            if f.is_file() and not f.name.startswith('.') and not (carpeta == 'imagenes' and len(rel.parts) > 2 and rel.parts[1] == 'qr'):
                copiar(rel.as_posix())   # los QR son para imprimir: no hace falta servirlos
    escribir('_redirects', texto_redirects(nombre, cfg, con_hoy))
    if cfg['hoy']:   # /hoy/ (solo con subida directa: necesita privado/hoy/): los archivos fijos; el paso «hoy» hace el resto
        for f in sorted((raiz / 'hoy').rglob('*')):
            rel = f.relative_to(raiz)
            if f.is_file() and rel.parts[1] not in ('index.html', 'feed.xml', 'd'):
                copiar(rel.as_posix())
    print(f'Listo (sitio {nombre}): {len(D.libros)} libros; sin {" ni ".join(sorted(quitar)) or "nada quitado"}; '
          f'{"se indexa" if cfg["indexar"] else "noindex"}; páginas: {", ".join(escritas[:len(D.paginas) + 1])}')


def opcion(nombre, defecto=None):
    if nombre not in sys.argv:
        return defecto
    i = sys.argv.index(nombre)
    if i + 1 >= len(sys.argv):
        raise SystemExit(f'Falta el valor de {nombre}')
    return sys.argv[i + 1]


def main():
    global SITIO, IMAGEN_COMPARTIR
    raiz = Path(__file__).resolve().parent.parent
    try:
        fecha_hoy = date.fromisoformat(opcion('--hoy-fecha', date.today().isoformat()))
        dias_hoy = int(opcion('--hoy-dias', HOY_DIAS_ADELANTE))
    except ValueError as err:
        raise SystemExit(f'Opción no válida: {err}')
    if dias_hoy < 0:
        raise SystemExit('--hoy-dias no puede ser negativo')
    datos_hoy = Path(opcion('--hoy-datos', str(raiz / 'privado' / 'hoy'))).resolve()
    sitios = leer_sitios(raiz)
    nombre = opcion('--sitio', 'completo')
    if nombre not in sitios:
        raise SystemExit(f'--sitio: «{nombre}» no está en datos/sitios.csv (hay: {", ".join(sitios)})')
    cfg = sitios[nombre]
    SITIO = cfg['url']
    IMAGEN_COMPARTIR = SITIO + '/imagenes/compartir.jpg'
    salida = Path(opcion('--salida')).resolve() if '--salida' in sys.argv else raiz
    plantilla = (raiz / 'index.html').read_text(encoding='utf-8')
    D = Datos(raiz)
    if not D.libros:
        raise SystemExit('No hay libros en datos/catalogo.csv')
    pags = repr(D.paginas).replace("'", '"')

    # ¿Se publicará /hoy/? (para el enlace de la cabecera del catálogo)
    hay_hoy = cfg['hoy'] and datos_hoy.is_dir() and any(datos_hoy.glob('hoy_*.json'))
    if nombre != 'completo':
        construir_lista_blanca(D, raiz, salida, plantilla, pags, cfg, nombre, hay_hoy)
    else:
        if salida != raiz:
            if salida.exists(): shutil.rmtree(salida)
            shutil.copytree(raiz, salida, ignore=ignorar_al_copiar(raiz, salida))
            # Las marcas de sección se quitan (en la carpeta del repositorio se quedan: son comentarios).
            for f in ('app.js', 'estilos.css'):
                escribir_tal_cual(salida / f, recortar(leer_tal_cual(raiz / f), set(), f))
        escritas = []
        def escribir(rel, contenido):
            p = salida / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(contenido, encoding='utf-8')
            escritas.append(rel)

        # 1) Páginas por idioma de los libros
        for lang in D.paginas:
            escribir(f'{lang}/index.html', pagina(D, plantilla, lang, '../', f'{SITIO}/{lang}/', f'{SITIO}/{lang}/',
                     f'window.CONFIG.IDIOMA_PAGINA = "{lang}"; window.CONFIG.PAGINAS_IDIOMA = {pags}; window.CONFIG.MOSTRAR_COLOMBIA = false;',
                     con_colombia=False, con_hoy=hay_hoy))
        # 2) Página principal: limpia (sin pestaña Colombia), con Amazon y Hotmart
        escribir('index.html', pagina(D, plantilla, 'es', '', f'{SITIO}/', f'{SITIO}/',
                 'window.CONFIG.MOSTRAR_COLOMBIA = false;', con_colombia=False, con_hoy=hay_hoy))
        # 3) Pedidos en Colombia (pago Bre-B): /colombia abre directo en la pestaña Colombia
        escribir('colombia.html', pagina(D, plantilla, 'es', '', f'{SITIO}/colombia', f'{SITIO}/colombia',
                 "window.CONFIG.PESTANA_INICIAL = 'colombia';"))
        escribir('internacional.html', pagina(D, plantilla, 'es', '', f'{SITIO}/internacional', f'{SITIO}/',
                 'window.CONFIG.MOSTRAR_COLOMBIA = false; window.CONFIG.MOSTRAR_HOTMART = false;',
                 con_colombia=False, con_hotmart=False))
        escribir('contraentrega.html', pagina(D, plantilla, 'es', '', f'{SITIO}/contraentrega', f'{SITIO}/',
                 "window.CONFIG.PAGO_COLOMBIA = 'contraentrega';"))
        # /qr del completo → sitio Amazon; /digital → página principal (para las ediciones de Hotmart)
        escribir('_redirects', texto_redirects(nombre, cfg, hay_hoy))
        print(f'Listo (sitio completo): {len(D.libros)} libros, {len(D.hotmart)} productos de Hotmart, páginas: {", ".join(escritas)}')
    # «La historia del día» (/hoy/): al final, para que un fallo suyo no impida construir el resto
    if cfg['hoy']:
        formulario = opcion('--hoy-formulario')
        privacidad = opcion('--hoy-privacidad')
        codigo = paso_hoy(D, raiz, salida, fecha_hoy, dias_hoy, datos_hoy, prueba='--hoy-prueba' in sys.argv,
                          ruta_formulario=Path(formulario).resolve() if formulario else None,
                          ruta_privacidad=Path(privacidad).resolve() if privacidad else None)
        if not cfg['indexar'] and (salida / 'hoy' / 'index.html').exists():
            pag = salida / 'hoy' / 'index.html'
            h = pag.read_text(encoding='utf-8')
            if 'name="robots"' not in h:
                pag.write_text(sustituir(h, '<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="robots" content="noindex">'),
                               encoding='utf-8')
    else:
        codigo = 0
        if salida != raiz and (salida / 'hoy').exists():
            shutil.rmtree(salida / 'hoy')
    escribir_tal_cual(salida / 'version.txt', texto_version(raiz, nombre))
    if '--zip' in sys.argv:
        if salida == raiz:
            raise SystemExit('--zip necesita --salida (una carpeta aparte)')
        if codigo:
            print('No se crea el zip: la construcción tuvo un fallo (mira arriba).')
        else:
            print(f'Zip para subir: {comprimir(salida, nombre)}')
    return codigo


if __name__ == '__main__':
    sys.exit(main())
