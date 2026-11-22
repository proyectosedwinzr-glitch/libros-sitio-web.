# Pruebas del sitio (fuera de la construcción)

`construir.py` solo usa la biblioteca estándar de Python. Estas pruebas son aparte y pueden usar npm.

| Prueba | Cómo | Qué dice |
|---|---|---|
| El resto del sitio, igual | `python3 -I herramientas/pruebas/comparar_sitio.py ANTES DESPUES --prueba` | Compara dos construcciones byte a byte (`/`, `/es/` y demás idiomas, `/colombia`, `/contraentrega`, `/internacional`, `_redirects` con `/qr`, y los archivos que usan). Con `--prueba`, antes planta 3 defectos que tienen que saltar. |
| Capturas, axe y red | `node herramientas/pruebas/capturas.js CARPETA /hoy/ /es/` | Capturas a 390, 820 y 1280 px; axe (WCAG A y AA); avisa de peticiones a dominios de terceros. `--prueba` planta 4 defectos. |
| Lo que se publica de /hoy/ (etapa 1) | `python3 -I herramientas/pruebas/probar_hoy.py ANTES` | Construye con varias fechas simuladas y comprueba qué días se publican, que la portada y el feed no llevan finales ni títulos futuros, y que el resto del sitio no cambia. Planta 5 defectos. |
| El juego de /hoy/ (etapa 2) | `node herramientas/pruebas/probar_juego.js CARPETA privado/hoy/hoy_2026-12.json --salida DIR --prueba` | Resuelve el 1, el 3 y el 4 de diciembre tocando la pantalla en 390, 820 y 1280 px y lee el final exacto; mide casillas, botones y letra; axe, red y errores; guardado, semana, días anteriores, pistas, el día que falta, la página de Cloudflare cuando falta un archivo, fechas y zona horaria. `CARPETA` se construye con `--hoy-fecha 2026-12-04`. Planta 18 defectos. |
| Nada del vol. 1 en el juego (etapa 2) | `python3 -I herramientas/pruebas/revisar_juego.py privado/referencia/letras_con_historia_interactiva.html --prueba` | Busca en `hoy/juego.js` y `hoy/juego.css` títulos, relatos, frases, finales, cuadrículas y listas de palabras de la edición interactiva del vol. 1. Planta 6 defectos. |

Preparación (una vez): `cd herramientas/pruebas && npm install`, y Playwright con su navegador
(`npm install playwright && npx playwright install chromium`). En la sesión de Claude Code ya está instalado.

Cómo se obtiene ANTES: construir con el código anterior al cambio en una carpeta aparte, desde una copia de trabajo
de `main` que no toca la tuya: `git worktree add /tmp/base origin/main` y
`python3 -I /tmp/base/herramientas/construir.py --salida /tmp/antes`.
