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

Para probarlo en tu computador sin tocar los archivos originales:
    python3 herramientas/construir.py --salida /ruta/a/una/carpeta/vacia
Sin --salida, escribe en la carpeta del sitio (es lo que hace Cloudflare).

Solo usa la biblioteca estándar de Python.
"""
import csv, html, re, shutil, sys, unicodedata
from datetime import date
from pathlib import Path

SITIO = 'https://ediciones-edwin-zar.pages.dev'          # dirección pública (para canonical, hreflang y og:)
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
def html_cabecera(D, lang, pre):
    tit, sub = D.t('titulo_sitio', lang), D.t('subtitulo_sitio', lang)
    vit = ''.join(
        f'<a href="{pre}{b["idioma"]}/#{e(b["idioma"])}/{e(slug(b["grupo"]))}" title="{e(b["titulo"])}">'
        f'<img src="{e(ruta_rel(b.get("portada"), pre))}" alt="{e(b["titulo"])}" loading="lazy"></a>'
        for b in sorted(D.libros, key=lambda b: (b['orden'], b['n']))
        if b.get('portada') and b['idioma'] in D.paginas)
    return (f'<h1 id="titulo">{e(tit)}</h1>\n  <p id="subtitulo" class="subtit">{e(sub)}</p>\n'
            f'  <p id="destacado" class="destacado">{e(D.t("destacado", lang))}</p>\n'
            f'  <div id="vitrina" class="vitrina" aria-label="Libros">{vit}</div>\n'
            f'  <p id="lema">{e(D.t("lema", lang))}</p>')


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


def pagina(D, plantilla, lang, pre, url_pagina, canonical, ajustes, con_colombia=True, con_hotmart=True):
    h = plantilla.replace('<html lang="es">', f'<html lang="{lang}">', 1)
    h = reemplazar(h, 'META', html_meta(D, lang, url_pagina, canonical))
    h = reemplazar(h, 'CABECERA', html_cabecera(D, lang, pre))
    h = reemplazar(h, 'PESTANAS', html_pestanas(D, lang, pre, con_colombia))
    h = reemplazar(h, 'CATALOGO', html_catalogo(D, lang, pre, con_hotmart))
    h = reemplazar(h, 'PIE', e(D.t('pie', lang)))
    h = h.replace('<!--AJUSTES-PAGINA-->', f'<script>{ajustes}</script>' if ajustes else '', 1)
    if pre:   # páginas en subcarpeta: los archivos del sitio están un nivel arriba
        for f in ('estilos.css', 'config.js', 'app.js'):
            h = h.replace(f'"{f}"', f'"{pre}{f}"')
    return h


def main():
    raiz = Path(__file__).resolve().parent.parent
    salida = raiz
    if '--salida' in sys.argv:
        salida = Path(sys.argv[sys.argv.index('--salida') + 1]).resolve()
        if salida != raiz:
            if salida.exists(): shutil.rmtree(salida)
            shutil.copytree(raiz, salida, ignore=shutil.ignore_patterns('.git', '__pycache__'))
    plantilla = (raiz / 'index.html').read_text(encoding='utf-8')
    D = Datos(raiz)
    if not D.libros:
        raise SystemExit('No hay libros en datos/catalogo.csv')
    pags = repr(D.paginas).replace("'", '"')

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
                 con_colombia=False))
    # 2) Página principal: limpia (sin pestaña Colombia), con Amazon y Hotmart
    escribir('index.html', pagina(D, plantilla, 'es', '', f'{SITIO}/', f'{SITIO}/',
             'window.CONFIG.MOSTRAR_COLOMBIA = false;', con_colombia=False))
    # 3) Pedidos en Colombia (pago Bre-B): /colombia abre directo en la pestaña Colombia
    escribir('colombia.html', pagina(D, plantilla, 'es', '', f'{SITIO}/colombia', f'{SITIO}/colombia',
             "window.CONFIG.PESTANA_INICIAL = 'colombia';"))
    escribir('internacional.html', pagina(D, plantilla, 'es', '', f'{SITIO}/internacional', f'{SITIO}/',
             'window.CONFIG.MOSTRAR_COLOMBIA = false; window.CONFIG.MOSTRAR_HOTMART = false;',
             con_colombia=False, con_hotmart=False))
    escribir('contraentrega.html', pagina(D, plantilla, 'es', '', f'{SITIO}/contraentrega', f'{SITIO}/',
             "window.CONFIG.PAGO_COLOMBIA = 'contraentrega';"))
    print(f'Listo: {len(D.libros)} libros, {len(D.hotmart)} productos de Hotmart, páginas: {", ".join(escritas)}')


if __name__ == '__main__':
    main()
