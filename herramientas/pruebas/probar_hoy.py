#!/usr/bin/env python3
"""
Prueba de la etapa 1 de «La historia del día»: construye con fechas simuladas y comprueba
qué se publica (y qué NO se publica). Solo biblioteca estándar.

    python3 -I herramientas/pruebas/probar_hoy.py BASE_ANTES

BASE_ANTES: la construcción del sitio de antes del cambio (etapa 0), para comparar el resto del sitio.
(_redirects puede cambiar: desde los dos sitios, /qr lleva al sitio Amazon; lo vigila comprobar_sitios.py.)

Para cada fecha simulada se calcula aparte, desde el JSON del mes, lo que debería publicarse
(7 días anteriores, el de hoy y los próximos N) y se compara con lo construido:
  - los JSON de hoy/d/ son exactamente esos (ninguno de más allá de N días ni de antes de 7);
  - la portada (hoy/index.html) es la historia del día y no lleva ningún final ni títulos futuros;
  - el feed solo lleva los días publicados hasta hoy, sin finales;
  - privado/ no está en la salida;
  - el resto del sitio es idéntico a BASE_ANTES.
Además: un mes con un defecto → no se publica nada de /hoy/ (y la construcción sale con 1);
sin privado/hoy/ → se salta con un aviso y el resto se construye igual.
Antes de fiarse de los ceros, cada comprobación se prueba con un defecto plantado.
"""
import copy, json, re, shutil, subprocess, sys, tempfile
from datetime import date, timedelta
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
CONSTRUIR = RAIZ / 'herramientas' / 'construir.py'
MES = RAIZ / 'privado' / 'hoy' / 'hoy_2026-12.json'
sys.path.insert(0, str(Path(__file__).resolve().parent))
from comparar_sitio import comparar  # noqa: E402


# Lo único que /hoy/ cambia, a propósito, en el resto del sitio (etapa 3): el enlace de la cabecera del catálogo
# (en / y en las páginas de idioma, nunca en las de pedidos), su estilo en estilos.css y su texto en textos.csv.
ENLACE_HOY = re.compile(r'\n  <p class="enlace-hoy"><a href="(?:\.\./)?hoy/" hreflang="es">[^<]+</a></p>')
CSS_HOY = re.compile(r'/\* Enlace a «La historia del día» \(solo en los sitios que la llevan\) \*/\n(?:[^\n]*enlace-hoy[^\n]*\n)+')
TEXTO_HOY = re.compile(r'enlace_hoy,[^\n]*\n')
PAGINAS_CON_ENLACE = ('index.html', 'es/index.html', 'en/index.html', 'fr/index.html', 'it/index.html')
CAMBIAN_CON_HOY = PAGINAS_CON_ENLACE + ('estilos.css', 'datos/textos.csv')


def sin_lo_de_hoy(rel, t):
    if rel in PAGINAS_CON_ENLACE:
        return ENLACE_HOY.sub('', t, count=1)
    if rel == 'estilos.css':
        return CSS_HOY.sub('', t, count=1)
    if rel == 'datos/textos.csv':
        return TEXTO_HOY.sub('', t, count=1)
    return t


def resto_del_sitio(base, salida):
    """Lo que no es /hoy/ tiene que ser como en BASE, salvo _redirects y lo que /hoy/ añade a propósito (y nada más)."""
    fallos = comparar(base, salida, permitidas=('_redirects',) + CAMBIAN_CON_HOY, silencioso=True)
    for rel in CAMBIAN_CON_HOY:
        a, d = base / rel, salida / rel
        if a.exists() and d.exists() and sin_lo_de_hoy(rel, d.read_text(encoding='utf-8')) != a.read_text(encoding='utf-8'):
            fallos.append(f'DISTINTO: {rel} cambia en algo más que el enlace a «La historia del día»')
    return fallos


def construir(salida, *opciones):
    r = subprocess.run([sys.executable, '-I', str(CONSTRUIR), '--salida', str(salida), *opciones],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    return r.returncode, r.stdout + r.stderr


def esperado(historias, fecha, dias):
    d = date.fromisoformat(fecha)
    return sorted(f for f in historias if d - timedelta(days=7) <= date.fromisoformat(f) <= d + timedelta(days=dias))


def revisar(salida, historias, fecha, dias, portada_esperada, prueba=False):
    """Devuelve la lista de problemas encontrados en una construcción."""
    mal = []
    d = date.fromisoformat(fecha)
    publicadas = sorted(p.stem for p in (salida / 'hoy' / 'd').glob('*.json')) if (salida / 'hoy' / 'd').exists() else []
    esp = esperado(historias, fecha, dias)
    if publicadas != esp:
        de_mas, de_menos = sorted(set(publicadas) - set(esp)), sorted(set(esp) - set(publicadas))
        mal.append(f'JSON publicados ≠ esperados (de más: {de_mas}; faltan: {de_menos})')
    for f in publicadas:
        x = date.fromisoformat(f)
        if x > d + timedelta(days=dias) or x < d - timedelta(days=7):
            mal.append(f'JSON fuera de la ventana: {f}')
        if f in historias and json.loads((salida / 'hoy' / 'd' / f'{f}.json').read_text(encoding='utf-8')) != historias[f]:
            mal.append(f'el JSON publicado de {f} no es idéntico al del mes')
    indice = (salida / 'hoy' / 'index.html').read_text(encoding='utf-8') if (salida / 'hoy' / 'index.html').exists() else ''
    feed = (salida / 'hoy' / 'feed.xml').read_text(encoding='utf-8') if (salida / 'hoy' / 'feed.xml').exists() else ''
    if not indice:
        mal.append('falta hoy/index.html')
    for f, h in historias.items():
        if h['mensaje'] in indice:
            mal.append(f'la portada lleva el final del {f}')
        if h['mensaje'] in feed:
            mal.append(f'el feed lleva el final del {f}')
        if date.fromisoformat(f) > d:
            if h['titulo'] in indice:
                mal.append(f'la portada lleva el título futuro del {f}')
            if h['titulo'] in feed:
                mal.append(f'el feed lleva el título futuro del {f}')
    if portada_esperada and f'data-fecha="{portada_esperada}"' not in indice:
        mal.append(f'la portada no es la historia del {portada_esperada}')
    if portada_esperada is None and indice and 'data-fecha=""' not in indice:
        mal.append('antes del lanzamiento, la portada debería ser solo un aviso')
    items = feed.count('<item>')
    hasta_hoy = [f for f in esp if date.fromisoformat(f) <= d]
    if items != len(hasta_hoy):
        mal.append(f'el feed tiene {items} días y deberían ser {len(hasta_hoy)}')
    if (salida / 'privado').exists():
        mal.append('privado/ está en la carpeta de salida')
    # #hoy-config (para juego.js): solo fechas; los días publicados, el primero de todos y, en prueba, la fecha fijada.
    m = re.search(r'<script type="application/json" id="hoy-config">(.*?)</script>', indice, re.S)
    if indice and not m:
        mal.append('falta #hoy-config en la portada')
    elif m:
        cfg = json.loads(m.group(1).replace('<\\/', '</'))
        if set(cfg) != {'dias', 'primera', 'fijo', 'libros'}:
            mal.append(f'#hoy-config lleva otras cosas: {sorted(cfg)}')
        lib = (cfg.get('libros') or {}).get('letras-con-historia') or {}
        if lib.get('url') != '../es/#es/letras-con-historia' or 'id="l-letras-con-historia"' not in (salida / 'es' / 'index.html').read_text(encoding='utf-8'):
            mal.append(f'«Más historias como esta» no lleva a la ficha del libro: {lib.get("url")}')
        if cfg.get('dias') != esp:
            mal.append('#hoy-config no lista exactamente los días publicados')
        if cfg.get('primera') != min(historias):
            mal.append('#hoy-config no trae el primer día de todos')
        if cfg.get('fijo') != (fecha if prueba else ''):
            mal.append('la página está fijada en una fecha' if not prueba else 'la construcción de prueba no fija la fecha')
        if prueba and ('noindex' not in indice or 'Versión de prueba' not in indice):
            mal.append('la construcción de prueba no lleva su aviso ni noindex')
        if not prueba and ('noindex' in indice or 'Versión de prueba' in indice):
            mal.append('una construcción normal lleva el aviso de prueba o noindex')
    # Etapa 3: el enlace a /hoy/ en la cabecera del catálogo (no en las páginas de pedidos), /historia-del-dia y, con el
    # formulario vacío, ni formulario ni /privacidad/.
    for rel in PAGINAS_CON_ENLACE:
        if (salida / rel).exists() and not ENLACE_HOY.search((salida / rel).read_text(encoding='utf-8')):
            mal.append(f'{rel} no lleva el enlace a «La historia del día»')
    for rel in ('colombia.html', 'contraentrega.html', 'internacional.html'):
        if (salida / rel).exists() and 'enlace-hoy' in (salida / rel).read_text(encoding='utf-8'):
            mal.append(f'{rel} lleva el enlace a «La historia del día» (las páginas de pedidos no cambian)')
    if '/historia-del-dia  /hoy/  301' not in (salida / '_redirects').read_text(encoding='utf-8'):
        mal.append('_redirects no lleva /historia-del-dia → /hoy/')
    if 'id="correo"' in indice or (salida / 'privacidad').exists():
        mal.append('con el formulario vacío, la página lleva formulario o hay /privacidad/')
    return mal


def plantados(salida, historias, fecha, dias, portada):
    """Cada defecto plantado en una copia de una construcción buena tiene que saltar."""
    futuro = (date.fromisoformat(fecha) + timedelta(days=dias + 1)).isoformat()
    otra = next(f for f in historias if date.fromisoformat(f) > date.fromisoformat(fecha))
    casos = {
        'un JSON de más allá de N días': lambda s: shutil.copy(s / 'hoy' / 'd' / f'{portada}.json', s / 'hoy' / 'd' / f'{futuro}.json'),
        'un JSON que falta': lambda s: (s / 'hoy' / 'd' / f'{portada}.json').unlink(),
        'el final metido en la portada': lambda s: (s / 'hoy' / 'index.html').write_text(
            (s / 'hoy' / 'index.html').read_text(encoding='utf-8') + historias[portada]['mensaje'], encoding='utf-8'),
        'un título futuro en el feed': lambda s: (s / 'hoy' / 'feed.xml').write_text(
            (s / 'hoy' / 'feed.xml').read_text(encoding='utf-8').replace('</channel>', f'<item>{historias[otra]["titulo"]}</item></channel>'),
            encoding='utf-8'),
        'privado/ copiado en la salida': lambda s: (s / 'privado').mkdir(),
        'una fecha de más en #hoy-config': lambda s: (s / 'hoy' / 'index.html').write_text(
            (s / 'hoy' / 'index.html').read_text(encoding='utf-8').replace('"dias":[', '"dias":["2027-02-01",', 1), encoding='utf-8'),
        'la página fijada en una fecha (construcción de prueba subida)': lambda s: (s / 'hoy' / 'index.html').write_text(
            (s / 'hoy' / 'index.html').read_text(encoding='utf-8').replace('"fijo":""', f'"fijo":"{fecha}"', 1), encoding='utf-8'),
        'el botón del libro a otra parte': lambda s: (s / 'hoy' / 'index.html').write_text(
            (s / 'hoy' / 'index.html').read_text(encoding='utf-8').replace('#es/letras-con-historia', '#es/otro', 1), encoding='utf-8'),
        'sin el enlace a /hoy/ en la principal': lambda s: (s / 'index.html').write_text(
            ENLACE_HOY.sub('', (s / 'index.html').read_text(encoding='utf-8'), count=1), encoding='utf-8'),
        'el enlace a /hoy/ metido en /colombia': lambda s: (s / 'colombia.html').write_text(
            (s / 'colombia.html').read_text(encoding='utf-8').replace('</h1>', '</h1><p class="enlace-hoy"><a href="hoy/">x</a></p>', 1),
            encoding='utf-8'),
    }
    ok = 0
    for nombre, plantar in casos.items():
        with tempfile.TemporaryDirectory() as tmp:
            copia = Path(tmp) / 'sitio'
            shutil.copytree(salida, copia)
            plantar(copia)
            salta = bool(revisar(copia, historias, fecha, dias, portada))
            ok += salta
            print(f'  defecto «{nombre}»: {"detectado" if salta else "NO DETECTADO"}')
    print(f'Defectos plantados detectados: {ok}/{len(casos)}')
    return ok == len(casos)


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    base = Path(sys.argv[1]).resolve()
    historias = {h['fecha']: h for h in json.loads(MES.read_text(encoding='utf-8'))['historias']}
    escenarios = [  # (fecha simulada, --hoy-dias, portada esperada, construcción de prueba)
        ('2026-12-01', 40, '2026-12-01', False),
        ('2026-12-15', 40, '2026-12-15', False),
        ('2026-12-31', 40, '2026-12-31', False),
        ('2026-11-30', 40, None, False),            # víspera del lanzamiento: aviso amable, ninguna historia en la portada
        ('2026-12-01', 8, '2026-12-01', False),     # subida semanal
        ('2026-12-07', 0, '2026-12-07', True),      # construcción de prueba (--hoy-prueba): fijada en el 7, días 1 a 7
    ]
    fallos = 0
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        for i, (fecha, dias, portada, prueba) in enumerate(escenarios):
            salida = tmp / f'e{i}'
            cod, texto = construir(salida, '--hoy-fecha', fecha, '--hoy-dias', str(dias), *(['--hoy-prueba'] if prueba else []))
            mal = revisar(salida, historias, fecha, dias, portada, prueba) if cod == 0 else [f'la construcción salió con {cod}']
            resto = resto_del_sitio(base, salida)
            n = len(list((salida / 'hoy' / 'd').glob('*.json'))) if (salida / 'hoy' / 'd').exists() else 0
            feed = (salida / 'hoy' / 'feed.xml').read_text(encoding='utf-8').count('<item>') if (salida / 'hoy' / 'feed.xml').exists() else 0
            estado = 'OK' if not mal and not resto else 'FALLO'
            print(f'{fecha} (--hoy-dias {dias}{", --hoy-prueba" if prueba else ""}): {n} JSON publicados (esperados {len(esperado(historias, fecha, dias))}), '
                  f'feed {feed} días, portada {portada or "aviso"} · resto del sitio '
                  f'{"igual" if not resto else "DISTINTO"} → {estado}')
            for m in mal + resto:
                print('   ✗', m)
            fallos += bool(mal or resto)
            if i == 1 and not mal:
                print('Defectos plantados en la construcción del 15 de diciembre:')
                if not plantados(salida, historias, fecha, dias, portada):
                    fallos += 1
        # Un mes con un defecto: no se publica nada de /hoy/ y la construcción avisa con código 1.
        malo = tmp / 'malo'
        malo.mkdir()
        datos = json.loads(MES.read_text(encoding='utf-8'))
        d2 = copy.deepcopy(datos)
        h = d2['historias'][4]
        w = h['pagina']['lista'][0]
        cs = next(x[2] for x in h['cuadricula']['colocadas'] if x[1] == w)
        a, b = cs[1]
        h['cuadricula']['filas'][a][b] = 'Q' if h['cuadricula']['filas'][a][b] != 'Q' else 'X'
        (malo / 'hoy_2026-12.json').write_text(json.dumps(d2, ensure_ascii=False), encoding='utf-8')
        cod, texto = construir(tmp / 'f', '--hoy-fecha', '2026-12-15', '--hoy-datos', str(malo))
        bien = cod == 1 and not (tmp / 'f' / 'hoy').exists() and (tmp / 'f' / 'index.html').exists()
        print(f'Mes con una letra cambiada: código {cod}, /hoy/ {"no publicado" if not (tmp / "f" / "hoy").exists() else "PUBLICADO"}, '
              f'resto del sitio {"construido" if (tmp / "f" / "index.html").exists() else "NO construido"} → {"OK" if bien else "FALLO"}')
        fallos += not bien
        # Sin privado/hoy/: se salta con un aviso.
        cod, texto = construir(tmp / 'g', '--hoy-datos', str(tmp / 'no-existe'))
        sin_enlace = not any('enlace-hoy' in (tmp / 'g' / r).read_text(encoding='utf-8') for r in PAGINAS_CON_ENLACE)
        bien = (cod == 0 and 'Aviso' in texto and not (tmp / 'g' / 'hoy').exists() and sin_enlace
                and not resto_del_sitio(base, tmp / 'g'))
        print(f'Sin privado/hoy/: código {cod}, aviso {"sí" if "Aviso" in texto else "NO"}, /hoy/ '
              f'{"no publicado" if not (tmp / "g" / "hoy").exists() else "PUBLICADO"} → {"OK" if bien else "FALLO"}')
        fallos += not bien
        # Etapa 3: el formulario de correo y la página de privacidad.
        form_bueno = tmp / 'form.html'
        form_bueno.write_text('<form method="post" action="https://correo.example/f"><label for="e">Tu correo</label>'
                              '<input type="email" id="e" name="email"><button type="submit">Apuntarme</button></form>', encoding='utf-8')
        form_malo = tmp / 'form_malo.html'
        form_malo.write_text(form_bueno.read_text(encoding='utf-8') + '<script src="https://correo.example/x.js"></script>', encoding='utf-8')
        priv = tmp / 'privacidad.md'
        priv.write_text('# Privacidad\n\nEdwin Zar recoge tu correo para el boletín. Contacto: [escribir](mailto:x@example.org).\n\n'
                        '- No se cede a nadie.\n', encoding='utf-8')
        casos_form = [
            ('formulario y privacidad revisada', form_bueno, priv, 0, True),
            ('formulario con un script', form_malo, priv, 1, False),
            ('formulario con la privacidad en borrador (la de datos/)', form_bueno, RAIZ / 'datos' / 'hoy_privacidad.md', 1, False),
        ]
        for nombre, f, pr, cod_esperado, publicado in casos_form:
            sal = tmp / ('form-' + str(casos_form.index((nombre, f, pr, cod_esperado, publicado))))
            cod, texto = construir(sal, '--hoy-fecha', '2026-12-04', '--hoy-formulario', str(f), '--hoy-privacidad', str(pr))
            pag = (sal / 'hoy' / 'index.html').read_text(encoding='utf-8') if (sal / 'hoy' / 'index.html').exists() else ''
            hay_form = 'id="correo"' in pag and '<section class="correo" id="correo" hidden' in pag
            hay_priv = (sal / 'privacidad' / 'index.html').exists()
            bien = cod == cod_esperado and hay_form == publicado and hay_priv == publicado and (publicado or 'ERROR' in texto)
            if publicado and bien:
                pv = (sal / 'privacidad' / 'index.html').read_text(encoding='utf-8')
                bien = ('<h1>Privacidad</h1>' in pv and '<a href="mailto:x@example.org">escribir</a>' in pv
                        and 'href="../privacidad/"' in pag and 'Recibe cada domingo las historias de la semana' in pag)
            print(f'Correo · {nombre}: código {cod}, formulario {"sí" if hay_form else "no"}, /privacidad/ {"sí" if hay_priv else "no"}'
                  f' → {"OK" if bien else "FALLO"}')
            fallos += not bien
    print('RESULTADO:', 'todo bien' if not fallos else f'{fallos} prueba(s) con fallos')
    sys.exit(1 if fallos else 0)


if __name__ == '__main__':
    main()
