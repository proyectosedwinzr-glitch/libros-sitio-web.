#!/usr/bin/env python3
"""
Dos sitios (docs/dos_sitios/ESPEC.md §5): construye el sitio completo y el sitio Amazon en carpetas temporales y
comprueba que el Amazon no lleva nada de Hotmart ni de los pedidos de Colombia, y que el completo sale como antes.

    python3 -I herramientas/pruebas/comprobar_sitios.py BASE [--hoy-fecha AAAA-MM-DD] [--prueba]

BASE: el sitio completo construido ANTES del cambio (la línea base), con la misma --hoy-fecha (por defecto, 2026-12-04).

Sitio Amazon:
  - palabras prohibidas (sin distinguir mayúsculas), en ningún archivo servido;
  - lista blanca: ningún archivo fuera de ella;
  - enlaces internos: todos llevan a un archivo que existe (o a una regla de _redirects);
  - enlaces externos: solo a tiendas de Amazon;
  - direcciones: canonical, hreflang, og: y twitter: con la dirección del sitio Amazon; nunca ediciones-edwin-zar;
  - noindex en todas las páginas, si datos/sitios.csv lo dice;
  - _redirects: /qr y /qr/ llevan a la página principal.
Sitio completo:
  - igual que BASE byte a byte, salvo _redirects y version.txt (lo único nuevo admitido: version.txt y los QR de
    imagenes/qr/); nada de lo que no se publica (privado/, herramientas/, docs/, apps-script/, datos/sitios.csv);
  - _redirects: /qr y /qr/ llevan al sitio Amazon; /digital y /digital/, a la página principal.
Los dos: version.txt dice qué sitio es.

--prueba: antes de fiarse de un cero, planta los 6 defectos de la especificación y 5 más (uno por cada regla que esos
no prueban), y cada uno tiene que saltar por su propia regla. Sale con 0 si todo va bien, 1 si hay fallos, 2 si un defecto plantado no salta. Solo biblioteca estándar.
"""
import csv, importlib.util, posixpath, re, shutil, subprocess, sys, tempfile
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

RAIZ = Path(__file__).resolve().parents[2]
CONSTRUIR = RAIZ / 'herramientas' / 'construir.py'
sys.path.insert(0, str(Path(__file__).resolve().parent))
from comparar_sitio import archivos, comparar  # noqa: E402

_spec = importlib.util.spec_from_file_location('construir', CONSTRUIR)
_c = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_c)
TIENDAS = _c.TIENDAS
HOSTS_AMAZON = set(TIENDAS.values()) | {'www.' + d for d in TIENDAS.values()}


def numero_whatsapp():
    m = re.search(r"WHATSAPP\s*:\s*'(\d+)'", (RAIZ / 'config.js').read_text(encoding='utf-8'))
    return m.group(1) if m else ''


def prohibidas():
    w = ['hotmart', 'pay.hotmart', 'script.google.com', 'contraentrega', 'colombia.html', '/colombia',
         'wa.me', 'api.whatsapp', 'bre-b']
    n = numero_whatsapp()
    if n:
        w += [n, n[-10:]]          # con y sin el 57 de Colombia
    return w


def leer_sitios():
    with (RAIZ / 'datos' / 'sitios.csv').open(encoding='utf-8-sig', newline='') as f:
        return {r['sitio'].strip(): {**r, 'url': r['url'].strip().rstrip('/')} for r in csv.DictReader(f) if r.get('sitio')}


def si(v):
    return str(v or '').strip().lower() not in ('', 'no', 'n', 'false', '0')


def construir(sitio, salida, fecha):
    r = subprocess.run([sys.executable, '-I', str(CONSTRUIR), '--sitio', sitio, '--salida', str(salida), '--hoy-fecha', fecha],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        raise SystemExit(f'La construcción del sitio {sitio} salió con {r.returncode}:\n{r.stdout}{r.stderr}')


class Etiquetas(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.lista = []

    def handle_starttag(self, tag, attrs):
        self.lista.append((tag, dict(attrs)))


def etiquetas(p):
    x = Etiquetas()
    x.feed(p.read_text(encoding='utf-8'))
    return x.lista


def reglas_redirects(p):
    reglas = {}
    if p.exists():
        for linea in p.read_text(encoding='utf-8').splitlines():
            partes = linea.split()
            if partes and not partes[0].startswith('#') and len(partes) >= 2:
                reglas[partes[0]] = (partes[1], partes[2] if len(partes) > 2 else '301')
    return reglas


def existe(carpeta, dir_rel, ruta, fuentes_redir):
    """¿Lleva la ruta (relativa a dir_rel, o absoluta desde la raíz) a un archivo del sitio, como en Cloudflare Pages?"""
    ruta = unquote(ruta)
    if not ruta:
        return True
    if ruta.startswith('/'):
        rel = ruta.lstrip('/')
    else:
        rel = posixpath.normpath(posixpath.join(dir_rel, ruta)) + ('/' if ruta.endswith('/') else '')
        if rel.startswith('./'):
            rel = rel[2:]
        if rel == './':
            rel = ''
    if rel.startswith('..'):
        return False
    if '/' + rel in fuentes_redir or '/' + rel.rstrip('/') in fuentes_redir:
        return True
    cand = [rel + 'index.html'] if (rel == '' or rel.endswith('/')) else [rel, rel + '.html', rel + '/index.html']
    return any((carpeta / c).is_file() for c in cand)


def revisar_amazon(carpeta, sitios):
    """Devuelve [(regla, mensaje)]."""
    cfg = sitios['amazon']
    url, host = cfg['url'], urlsplit(cfg['url']).hostname
    con_hoy = si(cfg.get('hoy'))
    fallos = []
    todos = {p.relative_to(carpeta).as_posix(): p for p in sorted(carpeta.rglob('*')) if p.is_file()}
    # 1) Palabras prohibidas, en cualquier archivo (también en los binarios: se busca el texto tal cual).
    for rel, p in todos.items():
        datos = p.read_bytes().lower()
        for w in prohibidas():
            if w.encode() in datos:
                fallos.append(('prohibidas', f'{rel} contiene «{w}»'))
    # 2) Lista blanca.
    fijos = {'index.html', 'estilos.css', 'app.js', 'config.js', 'datos/catalogo.csv', 'datos/idiomas.csv',
             'datos/textos.csv', '_redirects', 'version.txt'}
    for rel in todos:
        ok = (rel in fijos or re.match(r'^[a-z]{2}/index\.html$', rel)
              or (rel.startswith('imagenes/') and not rel.startswith('imagenes/qr/')) or rel.startswith('portadas/')
              or (con_hoy and rel.startswith('hoy/')))
        if not ok:
            fallos.append(('lista blanca', f'{rel} no está en la lista blanca del sitio Amazon'))
    # 3–5) Enlaces, direcciones y noindex, en cada página.
    fuentes = set(reglas_redirects(carpeta / '_redirects'))
    for rel, p in todos.items():
        if not rel.endswith('.html'):
            continue
        dir_rel = posixpath.dirname(rel)
        tags = etiquetas(p)
        for tag, at in tags:
            for attr in ('href', 'src'):
                v = (at.get(attr) or '').strip()
                if not v or v.startswith(('#', 'data:', 'mailto:', 'tel:', 'javascript:')):
                    continue
                u = urlsplit(v)
                if u.scheme in ('http', 'https'):
                    if u.hostname == host:
                        if not existe(carpeta, '', u.path or '/', fuentes):
                            fallos.append(('enlaces internos', f'{rel}: {v} no lleva a ningún archivo'))
                    elif u.hostname not in HOSTS_AMAZON and tag == 'a':
                        fallos.append(('enlaces externos', f'{rel}: enlace a {u.hostname} ({v[:60]})'))
                    elif u.hostname not in HOSTS_AMAZON:
                        fallos.append(('enlaces externos', f'{rel}: <{tag}> carga algo de {u.hostname}'))
                elif u.scheme:
                    fallos.append(('enlaces externos', f'{rel}: enlace raro {v[:60]}'))
                elif not existe(carpeta, dir_rel, u.path, fuentes):
                    fallos.append(('enlaces internos', f'{rel}: {v} no lleva a ningún archivo'))
        direcciones = [at.get('href', '') for tag, at in tags if tag == 'link' and at.get('rel') in ('canonical', 'alternate')
                       and (at.get('rel') == 'canonical' or at.get('hreflang'))]
        direcciones += [at.get('content', '') for tag, at in tags if tag == 'meta' and
                        (at.get('property') in ('og:url', 'og:image') or at.get('name') == 'twitter:image')]
        if not any(tag == 'link' and at.get('rel') == 'canonical' for tag, at in tags):
            fallos.append(('direcciones', f'{rel}: sin canonical'))
        for d in direcciones:
            if not (d == url or d.startswith(url + '/')):
                fallos.append(('direcciones', f'{rel}: «{d}» no es del sitio Amazon'))
        if not si(cfg.get('indexar')) and not any(tag == 'meta' and at.get('name') == 'robots' and
                                                  'noindex' in at.get('content', '') for tag, at in tags):
            fallos.append(('noindex', f'{rel}: sin noindex'))
    for rel, p in todos.items():
        if p.suffix in ('.html', '.js', '.css', '.csv', '.txt', '.xml', '.json') or rel == '_redirects':
            if 'ediciones-edwin-zar' in p.read_text(encoding='utf-8', errors='replace'):
                fallos.append(('direcciones', f'{rel} menciona ediciones-edwin-zar'))
    # 6) _redirects.
    r = reglas_redirects(carpeta / '_redirects')
    for fuente in ('/qr', '/qr/'):
        if r.get(fuente) != ('/', '302'):
            fallos.append(('_redirects', f'{fuente} del sitio Amazon lleva a {r.get(fuente)} (debería ser «/ 302»)'))
    v = carpeta / 'version.txt'
    if not (v.exists() and v.read_text(encoding='utf-8').startswith('sitio: amazon ·')):
        fallos.append(('version.txt', 'el version.txt del sitio Amazon no dice «sitio: amazon»'))
    return fallos


def revisar_completo(carpeta, base, sitios):
    fallos = []
    for d in comparar(base, carpeta, permitidas=('_redirects', 'version.txt'), silencioso=True):   # version.txt cambia siempre
        fallos.append(('línea base', d.split('\n')[0]))
    for n in sorted(set(archivos(carpeta)) - set(archivos(base))):
        if n != 'version.txt' and not re.match(r'^imagenes/qr/qr-[\w.-]+\.(png|svg)$', n):
            fallos.append(('línea base', f'archivo nuevo no previsto: {n}'))
    for n in ('privado', 'herramientas', 'docs', 'apps-script', 'datos/sitios.csv', 'datos/hoy_privacidad.md', 'README.md', 'CLAUDE.md'):
        if (carpeta / n).exists():
            fallos.append(('no se publica', f'{n} está en la carpeta del sitio completo'))
    r = reglas_redirects(carpeta / '_redirects')
    destino = sitios['amazon']['url'] + '/'
    for fuente in ('/qr', '/qr/'):
        if r.get(fuente) != (destino, '302'):
            fallos.append(('_redirects', f'{fuente} del completo lleva a {r.get(fuente)} (debería ser «{destino} 302»)'))
    for fuente in ('/digital', '/digital/'):
        if r.get(fuente) != ('/', '302'):
            fallos.append(('_redirects', f'{fuente} del completo lleva a {r.get(fuente)} (debería ser «/ 302»)'))
    v = carpeta / 'version.txt'
    if not (v.exists() and v.read_text(encoding='utf-8').startswith('sitio: completo ·')):
        fallos.append(('version.txt', 'el version.txt del sitio completo no dice «sitio: completo»'))
    return fallos


def plantar(nombre, amazon, completo):
    """Planta un defecto en las copias. Cada sustitución tiene que encontrar su cadena (regla 7)."""
    num = nombre.split('.')[0]
    def cambiar(p, viejo, nuevo):
        t = p.read_text(encoding='utf-8')
        if viejo not in t:
            raise SystemExit(f'No se pudo plantar «{nombre}»: no está «{viejo[:50]}» en {p.name}')
        p.write_text(t.replace(viejo, nuevo, 1), encoding='utf-8')
    if num == '1':
        cambiar(amazon / 'es' / 'index.html', '</main>', '<a href="https://pay.hotmart.com/X1">Edición digital</a></main>')
    elif num == '2':
        shutil.copyfile(RAIZ / 'datos' / 'hotmart.csv', amazon / 'datos' / 'hotmart.csv')
    elif num == '3':
        t = (amazon / 'index.html').read_text(encoding='utf-8')
        m = re.search(r'<link rel="canonical" href="([^"]+)">', t)
        if not m:
            raise SystemExit('No se pudo plantar el defecto 3: no hay canonical')
        cambiar(amazon / 'index.html', m.group(0), '<link rel="canonical" href="https://ediciones-edwin-zar.pages.dev/">')
    elif num == '4':
        cambiar(amazon / 'config.js', "IDIOMA_POR_DEFECTO:", f"CONTACTO: '{numero_whatsapp()}',\n  IDIOMA_POR_DEFECTO:")
    elif num == '5':
        lineas = (completo / '_redirects').read_text(encoding='utf-8').splitlines(keepends=True)
        qr = [x for x in lineas if x.split()[:1] == ['/qr']]
        if not qr:
            raise SystemExit('No se pudo plantar el defecto 5: no hay línea /qr')
        lineas.remove(qr[0])
        (completo / '_redirects').write_text(''.join(lineas), encoding='utf-8')
    elif num == '6':
        t = (completo / 'es' / 'index.html').read_text(encoding='utf-8')
        m = re.search(r'<h3>([^<]{3,})</h3>', t)
        if not m:
            raise SystemExit('No se pudo plantar el defecto 6: no hay ficha')
        cambiar(completo / 'es' / 'index.html', m.group(0), '<h3>' + m.group(1)[:-1] + 'x</h3>')
    elif num == '7':
        cambiar(amazon / 'en' / 'index.html', '</main>', '<a href="../no-existe/">Más</a></main>')
    elif num == '8':
        cambiar(amazon / 'fr' / 'index.html', '</main>', '<a href="https://tercero.example/x">Ailleurs</a></main>')
    elif num == '9':
        cambiar(amazon / 'it' / 'index.html', '<meta name="robots" content="noindex">\n', '')
    elif num == '10':
        shutil.copyfile(completo / 'version.txt', amazon / 'version.txt')
    elif num == '11':
        (completo / 'privado').mkdir()
        (completo / 'privado' / 'x.json').write_text('{}', encoding='utf-8')


DEFECTOS = [  # (nombre, regla que lo tiene que detectar)
    ('1. un enlace de Hotmart metido en /es/ del sitio Amazon', 'prohibidas'),
    ('2. datos/hotmart.csv copiado al sitio Amazon', 'lista blanca'),
    ('3. un canonical con ediciones-edwin-zar en el sitio Amazon', 'direcciones'),
    ('4. el número de WhatsApp en el config.js del sitio Amazon', 'prohibidas'),
    ('5. la línea de /qr borrada del _redirects del completo', '_redirects'),
    ('6. una ficha del completo cambiada', 'línea base'),
    # Además de los 6 de la especificación, uno por cada regla que esos no prueban (regla 7 de CLAUDE.md):
    ('7. un enlace interno roto en /en/ del sitio Amazon', 'enlaces internos'),
    ('8. un enlace a otro dominio en /fr/ del sitio Amazon', 'enlaces externos'),
    ('9. una página del sitio Amazon sin noindex', 'noindex'),
    ('10. el version.txt del completo en el sitio Amazon', 'version.txt'),
    ('11. privado/ copiado al sitio completo', 'no se publica'),
]


def main():
    args = sys.argv[1:]
    libres = [a for i, a in enumerate(args) if not a.startswith('--') and not (i and args[i - 1] == '--hoy-fecha')]
    if not libres:
        raise SystemExit(__doc__)
    base = Path(libres[0]).resolve()
    if not base.is_dir():
        raise SystemExit(f'No existe la línea base {base}')
    fecha = args[args.index('--hoy-fecha') + 1] if '--hoy-fecha' in args else '2026-12-04'
    sitios = leer_sitios()
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        amazon, completo = tmp / 'amazon', tmp / 'completo'
        construir('amazon', amazon, fecha)
        construir('completo', completo, fecha)
        if '--prueba' in args:
            print('Defectos plantados (cada uno tiene que saltar por su propia regla):')
            ok = 0
            for nombre, regla in DEFECTOS:
                a2, c2 = tmp / 'a2', tmp / 'c2'
                for x in (a2, c2):
                    if x.exists():
                        shutil.rmtree(x)
                shutil.copytree(amazon, a2)
                shutil.copytree(completo, c2)
                plantar(nombre, a2, c2)
                fallos = revisar_amazon(a2, sitios) + revisar_completo(c2, base, sitios)
                salta = any(r == regla for r, _ in fallos)
                ok += salta
                print(f'  {nombre}: {"detectado por «" + regla + "»" if salta else "NO DETECTADO por «" + regla + "»"}')
            print(f'Defectos plantados detectados: {ok}/{len(DEFECTOS)}')
            if ok != len(DEFECTOS):
                sys.exit(2)
        fa, fc = revisar_amazon(amazon, sitios), revisar_completo(completo, base, sitios)
        n_amazon = sum(1 for p in amazon.rglob('*') if p.is_file())
        print(f'Sitio Amazon ({sitios["amazon"]["url"]}): {n_amazon} archivos · ' +
              ('sin nada de Hotmart ni de los pedidos de Colombia; lista blanca, enlaces, direcciones, noindex y _redirects bien'
               if not fa else f'{len(fa)} fallo(s)'))
        for r, m in fa:
            print(f'   ✗ [{r}] {m}')
        print('Sitio completo: ' + ('igual que la línea base salvo _redirects y version.txt; /qr al sitio Amazon y /digital a la principal'
                                    if not fc else f'{len(fc)} fallo(s)'))
        for r, m in fc:
            print(f'   ✗ [{r}] {m}')
    print('RESULTADO:', 'todo bien' if not (fa or fc) else f'{len(fa) + len(fc)} fallo(s)')
    sys.exit(1 if (fa or fc) else 0)


if __name__ == '__main__':
    main()
