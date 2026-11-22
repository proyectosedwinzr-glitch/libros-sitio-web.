#!/usr/bin/env python3
"""
Compara dos construcciones del sitio («antes» y «después») y dice si el resto del sitio
quedó igual, byte a byte.

    python3 -I herramientas/pruebas/comparar_sitio.py ANTES DESPUES
    python3 -I herramientas/pruebas/comparar_sitio.py ANTES DESPUES --prueba
    python3 -I herramientas/pruebas/comparar_sitio.py ANTES DESPUES --permitir es/index.html --permitir index.html

- Cada archivo publicable de ANTES tiene que estar en DESPUES con el mismo contenido.
  Las páginas que se vigilan expresamente: /, /es/ (y los demás idiomas), /colombia,
  /contraentrega, /internacional y /qr (la regla está en _redirects).
- Lo nuevo de DESPUES (por ejemplo hoy/) se lista como «nuevo», no como fallo.
- No se comparan los archivos que no forman parte del sitio publicado (herramientas/, docs/,
  apps-script/, README.md, CLAUDE.md…): construir.py ya no los copia a la salida.
- --permitir RUTA: diferencia esperada (por ejemplo, el catálogo de la etapa 1b). Se informa,
  pero no cuenta como fallo.
- --prueba: antes de fiarse de un cero, planta tres defectos en una copia de DESPUES
  (una letra cambiada en /colombia, una línea de menos en _redirects y una página borrada)
  y comprueba que cada uno salta.

Sale con 0 si todo está igual, 1 si hay diferencias no permitidas, 2 si un defecto plantado
no se detecta. Solo usa la biblioteca estándar.
"""
import difflib, shutil, sys, tempfile
from pathlib import Path

# Lo que no es parte del sitio publicado (no se compara).
NO_SITIO = {'herramientas', 'docs', 'apps-script', 'privado', 'node_modules', '.git', '__pycache__',
            'README.md', 'CLAUDE.md', '.gitignore', '.nojekyll'}
VIGILADAS = ['index.html', 'es/index.html', 'en/index.html', 'fr/index.html', 'it/index.html',
             'colombia.html', 'contraentrega.html', 'internacional.html', '_redirects']


def archivos(raiz):
    out = {}
    for p in sorted(raiz.rglob('*')):
        if p.is_file():
            rel = p.relative_to(raiz)
            if rel.parts[0] in NO_SITIO:
                continue
            out[rel.as_posix()] = p
    return out


def comparar(antes, despues, permitidas=(), silencioso=False):
    a, d = archivos(antes), archivos(despues)
    fallos, permitidos, iguales = [], [], 0
    for rel, pa in a.items():
        pd = d.get(rel)
        if pd is None:
            fallos.append(f'FALTA en «después»: {rel}')
            continue
        ba, bd = pa.read_bytes(), pd.read_bytes()
        if ba == bd:
            iguales += 1
            continue
        detalle = ''
        if rel.endswith(('.html', '.js', '.css', '.csv', '.xml', '.json')) or rel == '_redirects':
            dif = list(difflib.unified_diff(ba.decode('utf-8', 'replace').splitlines(),
                                            bd.decode('utf-8', 'replace').splitlines(),
                                            'antes/' + rel, 'despues/' + rel, n=0, lineterm=''))
            detalle = '\n'.join('      ' + x[:160] for x in dif[:12])
        msg = f'DISTINTO: {rel}' + (f'\n{detalle}' if detalle else '')
        (permitidos if rel in permitidas else fallos).append(msg)
    nuevos = sorted(set(d) - set(a))
    if not silencioso:
        print(f'Archivos del sitio en «antes»: {len(a)} · idénticos: {iguales} · distintos o ausentes: '
              f'{len(fallos) + len(permitidos)} ({len(permitidos)} permitidos) · nuevos en «después»: {len(nuevos)}')
        for rel in VIGILADAS:
            if rel in a:
                estado = 'igual' if (rel in d and a[rel].read_bytes() == d[rel].read_bytes()) else (
                    'DISTINTO (permitido)' if rel in permitidas else 'DISTINTO')
                print(f'  /{rel:<22} {estado}')
        for f in fallos:
            print('  ✗', f)
        for f in permitidos:
            print('  ~ (permitido)', f)
        if nuevos:
            grupos = {}
            for n in nuevos:
                grupos.setdefault(n.split('/')[0], []).append(n)
            print('  Nuevos: ' + ', '.join(f'{k}/ ({len(v)})' if len(v) > 1 else v[0] for k, v in grupos.items()))
    return fallos


def prueba(antes, despues):
    """Defectos plantados: cada uno tiene que hacer saltar el comparador."""
    ok = 0
    defectos = {
        'una letra cambiada en /colombia': ('colombia.html', 'cambiar'),
        'una línea de menos en _redirects (/qr)': ('_redirects', 'linea'),
        'una página borrada (/contraentrega)': ('contraentrega.html', 'borrar'),
    }
    for nombre, (rel, modo) in defectos.items():
        with tempfile.TemporaryDirectory() as tmp:
            copia = Path(tmp) / 'despues'
            shutil.copytree(despues, copia)
            p = copia / rel
            if not p.exists():
                print(f'  defecto «{nombre}»: NO SE PUDO PLANTAR ({rel} no existe)')
                continue
            if modo == 'cambiar':
                t = p.read_text(encoding='utf-8')
                i = t.index('Colombia')            # si no la encuentra, falla (no se planta a ciegas)
                p.write_text(t[:i] + 'K' + t[i + 1:], encoding='utf-8')
            elif modo == 'linea':
                lineas = p.read_text(encoding='utf-8').splitlines(keepends=True)
                qr = [x for x in lineas if x.startswith('/qr')]
                if not qr:
                    raise SystemExit('No hay ninguna línea /qr en _redirects: no se puede plantar el defecto')
                lineas.remove(qr[0])
                p.write_text(''.join(lineas), encoding='utf-8')
            else:
                p.unlink()
            fx = comparar(antes, copia, silencioso=True)
            salta = any(rel in f for f in fx)
            ok += salta
            print(f'  defecto «{nombre}»: {"detectado" if salta else "NO DETECTADO"}')
    print(f'Defectos plantados detectados: {ok}/{len(defectos)}')
    return ok == len(defectos)


def main():
    args = sys.argv[1:]
    if len(args) < 2:
        raise SystemExit(__doc__)
    antes, despues = Path(args[0]), Path(args[1])
    permitidas = [args[i + 1] for i, x in enumerate(args) if x == '--permitir']
    for p in (antes, despues):
        if not p.is_dir():
            raise SystemExit(f'No existe la carpeta {p}')
    if '--prueba' in args and not prueba(antes, despues):
        sys.exit(2)
    fallos = comparar(antes, despues, permitidas)
    print('RESULTADO:', 'el resto del sitio está igual' if not fallos else f'{len(fallos)} diferencia(s) no permitida(s)')
    sys.exit(1 if fallos else 0)


if __name__ == '__main__':
    main()
