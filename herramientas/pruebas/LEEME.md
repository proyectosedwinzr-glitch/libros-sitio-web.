# Pruebas del sitio (fuera de la construcción)

`construir.py` solo usa la biblioteca estándar de Python. Estas pruebas son aparte y pueden usar npm.

| Prueba | Cómo | Qué dice |
|---|---|---|
| El resto del sitio, igual | `python3 -I herramientas/pruebas/comparar_sitio.py ANTES DESPUES --prueba` | Compara dos construcciones byte a byte (`/`, `/es/` y demás idiomas, `/colombia`, `/contraentrega`, `/internacional`, `_redirects` con `/qr`, y los archivos que usan). Con `--prueba`, antes planta 3 defectos que tienen que saltar. |
| Capturas, axe y red | `node herramientas/pruebas/capturas.js CARPETA /hoy/ /es/` | Capturas a 390, 820 y 1280 px; axe (WCAG A y AA); avisa de peticiones a dominios de terceros. `--prueba` planta 4 defectos. |

Preparación (una vez): `cd herramientas/pruebas && npm install`, y Playwright con su navegador
(`npm install playwright && npx playwright install chromium`). En la sesión de Claude Code ya está instalado.

Cómo se obtiene ANTES: construir con el código anterior al cambio (`git stash` o una copia) en una carpeta aparte.
