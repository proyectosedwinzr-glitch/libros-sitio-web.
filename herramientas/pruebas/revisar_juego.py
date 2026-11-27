#!/usr/bin/env python3
"""
Etapa 2 de «La historia del día»: que en el código del juego no se cuele ningún dato de la edición interactiva
del vol. 1 (es de pago y vive en privado/). Solo biblioteca estándar.

    python3 -I herramientas/pruebas/revisar_juego.py privado/referencia/letras_con_historia_interactiva.html [ARCHIVOS…] [--prueba]

Sin ARCHIVOS revisa hoy/juego.js y hoy/juego.css. Busca, del vol. 1 (sus 56 retos y su final):
  - títulos, relatos, frases, finales, notas, el final del libro, los nombres de las partes y la presentación:
    cualquier trozo de 5 palabras seguidas (los títulos cortos, enteros);
  - las cuadrículas: cada fila y cada columna, solo sus letras, aunque vayan entre comillas y comas;
  - las frases con sus huecos (la pista de cada reto), tal cual;
  - las listas de palabras: 3 o más palabras de un mismo reto.
Con --prueba, antes planta 6 defectos en una copia de juego.js (un trozo de relato, una fila de cuadrícula en
formato JSON, el final del libro, un título, una lista de palabras y un final de reto): tienen que saltar todos.
Sale con 0 si no encuentra nada; 1 si encuentra algo; 2 si un defecto plantado no salta.
"""
import json, re, sys, tempfile, unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]


def sin_tildes(s):
    s = unicodedata.normalize('NFD', s)
    s = re.sub(r'[̀-̂̄-ͯ]', '', s)   # conserva la virgulilla de la Ñ
    return unicodedata.normalize('NFC', s)


def texto_norm(s):
    """minúsculas, sin tildes, solo letras y cifras separadas por un espacio"""
    return ' '.join(re.findall(r'[a-zñ0-9]+', sin_tildes(s.lower())))


def letras_norm(s):
    """MAYÚSCULAS, sin tildes, solo letras, todo seguido"""
    return re.sub(r'[^A-ZÑ]', '', sin_tildes(s.upper()))


def leer_vol1(ruta):
    lineas = Path(ruta).read_text(encoding='utf-8').split('\n')
    retos = final = None
    for ln in lineas:
        if ln.startswith('const RETOS = '):
            retos = json.loads(ln[len('const RETOS = '):].rstrip().rstrip(';'))
        elif ln.startswith('const FINAL = '):
            final = json.loads(ln[len('const FINAL = '):].rstrip().rstrip(';'))
    if not retos or not final:
        raise SystemExit('No se pudieron leer los datos del vol. 1 (RETOS y FINAL): la comprobación no vale.')
    todo = '\n'.join(lineas)
    partes = re.findall(r'(?:clave|nombre):"([^"]+)"', todo)
    presentacion = re.findall(r'<p class="intro">([^<$]+)', todo)
    return retos, final, partes, presentacion


def agujas(retos, final, partes, presentacion):
    """Lo que no puede aparecer: (tipo, texto que se busca, de dónde sale)."""
    textos, filas, pistas, listas = [], [], [], []

    def trozos(s, origen):
        p = texto_norm(s).split()
        if len(p) >= 5:
            textos.extend((' '.join(p[i:i + 5]), origen) for i in range(len(p) - 4))
        elif len(' '.join(p)) >= 16:
            textos.append((' '.join(p), origen))

    for r in retos:
        o = f'reto {r["id"]}'
        for campo in ('titulo', 'relato', 'frase', 'mensaje', 'nota'):
            if r.get(campo):
                trozos(r[campo], f'{o} ({campo})')
        g = r['g']
        n = len(g)
        for i in range(n):
            filas.append((''.join(letras_norm(c) for c in g[i]), f'{o} (fila {i + 1})'))
            filas.append((''.join(letras_norm(g[j][i]) for j in range(n)), f'{o} (columna {i + 1})'))
        if r.get('pista'):
            pistas.append((r['pista'], f'{o} (frase con huecos)'))
        listas.append(([letras_norm(p['w']) for p in r['palabras']], f'{o} (lista de palabras)'))
    trozos(final['titulo'], 'final del libro (título)')
    trozos(final['texto'], 'final del libro')
    for p in partes:
        trozos(p, 'nombre de una parte')
    for p in presentacion:
        trozos(p, 'presentación del libro')
    return textos, filas, pistas, listas


def buscar(contenido, ags):
    textos, filas, pistas, listas = ags
    t, l = ' ' + texto_norm(contenido) + ' ', letras_norm(contenido)
    fichas = set(re.findall(r'[A-ZÑ]+', sin_tildes(contenido.upper())))
    hallado = []
    hallado += [f'texto «{x}» ({o})' for x, o in textos if f' {x} ' in t]
    hallado += [f'cuadrícula «{x}» ({o})' for x, o in filas if len(x) >= 9 and x in l]
    hallado += [f'frase con huecos «{x}» ({o})' for x, o in pistas if x in contenido]
    for ws, o in listas:
        dentro = [w for w in ws if w in fichas]
        if len(dentro) >= 3:
            hallado.append(f'{len(dentro)} palabras de la lista ({o}): {", ".join(dentro)}')
    return hallado


def plantados(ags, retos, final, juego):
    r1, r2, r3, r4 = retos[9], retos[4], retos[19], retos[30]
    fila = json.dumps(r2['g'][3])
    casos = {
        'un trozo de relato en un comentario': '/* ' + ' '.join(r1['relato'].split()[3:11]) + ' */',
        'una fila de cuadrícula en formato JSON': f'const G = [{fila}];',
        'el final del libro en una cadena': 'const X = "' + ' '.join(final['texto'].split()[:9]) + '";',
        'un título en una cadena': 'const T = "' + r2['titulo'] + '";',
        'una lista de palabras': 'const L = ' + json.dumps([p['w'] for p in r4['palabras'][:4]]) + ';',
        'un final de reto': 'avisar("' + ' '.join(r3['mensaje'].split()[:7]) + '");',
    }
    ok = 0
    for nombre, linea in casos.items():
        salta = bool(buscar(juego + '\n' + linea + '\n', ags))
        ok += salta
        print(f'  defecto «{nombre}»: {"detectado" if salta else "NO DETECTADO"}')
    print(f'Defectos plantados detectados: {ok}/{len(casos)}')
    return ok == len(casos)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        raise SystemExit(__doc__)
    retos, final, partes, presentacion = leer_vol1(args[0])
    ags = agujas(retos, final, partes, presentacion)
    print(f'Vol. 1: {len(retos)} retos y su final → {len(ags[0])} trozos de texto, {len(ags[1])} filas y columnas, '
          f'{len(ags[2])} frases con huecos y {len(ags[3])} listas de palabras que no pueden aparecer.')
    archivos = [Path(a) for a in args[1:]] or [RAIZ / 'hoy' / 'juego.js', RAIZ / 'hoy' / 'juego.css']
    if '--prueba' in sys.argv:
        juego = (RAIZ / 'hoy' / 'juego.js').read_text(encoding='utf-8')
        print('Defectos plantados en una copia de hoy/juego.js:')
        if not plantados(ags, retos, final, juego):
            sys.exit(2)
    total = 0
    for a in archivos:
        hallado = buscar(a.read_text(encoding='utf-8'), ags)
        total += len(hallado)
        print(f'{a}: ' + ('nada del vol. 1' if not hallado else f'{len(hallado)} coincidencia(s)'))
        for h in hallado[:20]:
            print('   ✗', h)
    print('RESULTADO:', 'limpio' if not total else f'{total} coincidencia(s) con el vol. 1')
    sys.exit(1 if total else 0)


if __name__ == '__main__':
    main()
