#!/usr/bin/env python3
"""
Hace y comprueba el QR de un sitio (docs/dos_sitios/ESPEC.md §3). Fuera de la construcción: necesita
segno, Pillow y opencv-python-headless (pip install segno pillow opencv-python-headless).

    python3 herramientas/qr/qr_sitio.py hacer URL NOMBRE        → imagenes/qr/qr-NOMBRE.svg y qr-NOMBRE-1200.png
    python3 herramientas/qr/qr_sitio.py leer ARCHIVO URL [--prueba]

Normas (las del QR que ya está impreso): corrección Q (dentro de «M o Q»), 4 módulos de margen, negro sobre blanco;
SVG a escala 10 con su título y PNG de 1200 × 1200 px con módulos enteros (sin estirar). Impreso, 2,5 cm como mínimo.
«leer» descifra el archivo (el PNG con OpenCV; el SVG, dibujando sus módulos) y compara con la dirección exacta.
Con --prueba, antes planta un QR de otra dirección y un PNG en blanco: los dos tienen que fallar.
Sale con 0 si coincide, 1 si no, 2 si un defecto plantado no salta.
"""
import re, sys, tempfile
from pathlib import Path

import cv2
import numpy as np
import segno
from PIL import Image

RAIZ = Path(__file__).resolve().parents[2]
LADO_PNG = 1200


def hacer(url, nombre, carpeta=RAIZ / 'imagenes' / 'qr'):
    qr = segno.make(url, error='q', micro=False, boost_error=False)
    carpeta.mkdir(parents=True, exist_ok=True)
    svg, png = carpeta / f'qr-{nombre}.svg', carpeta / f'qr-{nombre}-{LADO_PNG}.png'
    qr.save(str(svg), kind='svg', scale=10, border=4, dark='#000', light='#fff', title='QR ' + re.sub(r'^https?://', '', url))
    # Con viewBox (como el QR ya impreso): así los programas de maquetación lo escalan sin recortarlo.
    t = svg.read_text(encoding='utf-8')
    m = re.search(r'<svg [^>]*?width="(\d+)" height="(\d+)"', t)
    if not m:
        raise SystemExit('El SVG de segno no tiene width y height: no se le puede poner el viewBox')
    if 'viewBox=' not in m.group(0):
        t = t.replace(m.group(0), m.group(0) + f' viewBox="0 0 {m.group(1)} {m.group(2)}"', 1)
        svg.write_text(t, encoding='utf-8')
    modulos = qr.symbol_size(scale=1, border=4)[0]
    escala = LADO_PNG // modulos                      # módulos enteros; el resto, margen blanco de más
    with tempfile.TemporaryDirectory() as tmp:
        p = Path(tmp) / 'qr.png'
        qr.save(str(p), kind='png', scale=escala, border=4, dark='#000', light='#fff')
        im = Image.open(p).convert('L')
    lienzo = Image.new('L', (LADO_PNG, LADO_PNG), 255)
    off = (LADO_PNG - im.size[0]) // 2
    lienzo.paste(im, (off, off))
    lienzo.save(png)
    nombre_ = lambda f: f.relative_to(RAIZ) if RAIZ in f.parents else f.name
    print(f'{nombre_(svg)} y {nombre_(png)}: versión {qr.version}, corrección {qr.error}, '
          f'{modulos} módulos con el margen, {escala} px por módulo en el PNG')
    return svg, png


def matriz_svg(ruta):
    """Los módulos negros del SVG de segno: un trazo por fila («M4 4.5h7m2 0h2…»)."""
    t = Path(ruta).read_text(encoding='utf-8')
    m = re.search(r'<path[^>]*class="qrline"[^>]*\sd="([^"]+)"', t) or re.search(r'<path[^>]*stroke="#000"[^>]*\sd="([^"]+)"', t)
    if not m:
        raise SystemExit(f'{ruta}: no tiene el trazo de módulos de segno')
    ancho = re.search(r'viewBox="0 0 (\d+) \d+"', t) or re.search(r'<svg [^>]*?width="(\d+)"', t)
    esc = re.search(r'scale\((\d+(?:\.\d+)?)\)', t)
    if not ancho:
        raise SystemExit(f'{ruta}: sin viewBox ni width, no se sabe su tamaño')
    lado = int(round(int(ancho.group(1)) / (float(esc.group(1)) if esc else 1)))
    mat = np.zeros((lado, lado), dtype=bool)
    x = y = 0.0
    for cmd, args in re.findall(r'([MmHhVv])([^MmHhVv]*)', m.group(1)):
        n = [float(v) for v in re.findall(r'-?\d+(?:\.\d+)?', args)]
        if cmd == 'M':
            x, y = n[0], n[1]
        elif cmd == 'm':
            x, y = x + n[0], y + n[1]
        elif cmd in 'hH':
            fin = x + n[0] if cmd == 'h' else n[0]
            mat[int(y), int(min(x, fin)):int(max(x, fin))] = True
            x = fin
    return mat


def descifrar(ruta):
    ruta = Path(ruta)
    if ruta.suffix == '.svg':
        mat = matriz_svg(ruta)
        img = np.where(np.kron(mat, np.ones((12, 12), dtype=bool)), 0, 255).astype(np.uint8)
    else:
        img = cv2.imread(str(ruta), cv2.IMREAD_GRAYSCALE)
        if img is None:
            return None
    texto, _, _ = cv2.QRCodeDetector().detectAndDecode(img)
    return texto or None


def comprobar(ruta, url):
    leido = descifrar(ruta)
    ok = leido == url
    print(f'  {Path(ruta).name}: {"lee exactamente " + url if ok else f"lee «{leido}» y debería leer «{url}»"}')
    return ok


def prueba(url):
    """Defectos plantados: un QR de otra dirección (SVG y PNG) y un PNG en blanco tienen que fallar."""
    otra = 'https://ediciones-edwin-zar.pages.dev/qr' if 'libros-edwin-zar' in url else 'https://libros-edwin-zar.pages.dev/qr'
    ok = 0
    with tempfile.TemporaryDirectory() as tmp:
        svg, png = hacer(otra, 'plantado', Path(tmp))
        blanco = Path(tmp) / 'blanco.png'
        Image.new('L', (LADO_PNG, LADO_PNG), 255).save(blanco)
        for nombre, f in [('un SVG de otra dirección', svg), ('un PNG de otra dirección', png), ('un PNG en blanco', blanco)]:
            salta = descifrar(f) != url
            ok += salta
            print(f'  defecto «{nombre}»: {"detectado" if salta else "NO DETECTADO"}')
    print(f'Defectos plantados detectados: {ok}/3')
    return ok == 3


def main():
    a = sys.argv[1:]
    if len(a) >= 3 and a[0] == 'hacer':
        svg, png = hacer(a[1], a[2])
        sys.exit(0 if comprobar(svg, a[1]) and comprobar(png, a[1]) else 1)
    if len(a) >= 3 and a[0] == 'leer':
        if '--prueba' in a and not prueba(a[2]):
            sys.exit(2)
        sys.exit(0 if comprobar(a[1], a[2]) else 1)
    raise SystemExit(__doc__)


if __name__ == '__main__':
    main()
