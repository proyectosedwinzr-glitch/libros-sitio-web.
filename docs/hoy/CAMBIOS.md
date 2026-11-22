# «La historia del día» · registro de cambios

Cada etapa: qué se hizo, qué se comprobó y **qué no cubren las comprobaciones**.

## Etapas 0, 1 y 1b · 22 de noviembre de 2026

### Etapa 0 · Preparar

- **Línea base** del sitio construida con el código de `main` antes de tocar nada (`/`, `/es/`, `/en/`, `/fr/`, `/it/`,
  `/colombia`, `/contraentrega`, `/internacional` y `_redirects` con `/qr`). Dos construcciones seguidas salen idénticas
  byte a byte, así que la comparación es fiable.
- Copiados del paquete, sin reemplazar nada: `CLAUDE.md`, `docs/hoy/`, `herramientas/hoy/` (validador), `hoy/fuentes/`
  (Lora y Work Sans con su licencia OFL) y `datos/hoy_enlaces.csv`, `datos/hoy_formulario.html`, `datos/LEEME_HOY.md`.
- `privado/` copiado al repositorio local y añadido a `.gitignore`. Comprobado con `git check-ignore`:
  `privado/x`, el JSON de diciembre, el motor y `privado/referencia/…` quedan fuera; las fuentes, el validador y los
  datos públicos sí se suben. `git status` no muestra nada de `privado/`.
- También ignorados: lo que el paso `hoy` escribe si se construye dentro del repositorio (`hoy/index.html`,
  `hoy/feed.xml`, `hoy/d/`) y `herramientas/pruebas/node_modules/`.
- **Herramientas de prueba** en `herramientas/pruebas/` (ver su `LEEME.md`):
  - `comparar_sitio.py` (Python): el resto del sitio, antes y después, byte a byte. Con `--prueba` planta 3 defectos
    (una letra en `/colombia`, la línea de `/qr` en `_redirects`, `/contraentrega` borrada): 3/3 detectados.
  - `capturas.js` (Playwright + axe-core por npm, fuera de la construcción): capturas a 390, 820 y 1280 px, axe WCAG A/AA
    y peticiones a terceros. Con `--prueba` planta 4 defectos (imagen sin alt, botón sin nombre, poco contraste,
    petición a un tercero): 4/4 detectados.
  - `probar_hoy.py` (Python): las pruebas de la etapa 1 (abajo).

### Etapa 1 · Validador y construcción

- **Validador** (`herramientas/hoy/validar_hoy.py`, sin tocar; es idéntico al `verificar_diciembre.py` del motor):
  - `python3 -I herramientas/hoy/validar_hoy.py privado/hoy/hoy_2026-12.json` → 31 historias, **0 fallos**;
  - con `--prueba`: **9/9 defectos plantados detectados**, cada uno por su propia regla.
- **`construir.py`, paso `hoy`** (sigue solo con la biblioteca estándar):
  - llama al validador para cada `privado/hoy/hoy_AAAA-MM.json`; si alguno falla (o una fecha está en dos meses), no
    publica nada de `/hoy/`, construye el resto del sitio y sale con código 1;
  - publica `hoy/d/AAAA-MM-DD.json` (el objeto de la historia tal cual, sin cambiar nada) de los 7 días anteriores, el
    de hoy y los próximos N (`--hoy-dias`, por defecto 40);
  - escribe `hoy/index.html` con la historia del día de la construcción escrita dentro, **sin el final ni las fuentes**
    (que lo destriparían); si hoy no hay, la última publicada con una nota amable; antes del lanzamiento, solo un aviso
    («La primera historia del día llega el martes 1 de diciembre de 2026…»);
  - escribe `hoy/feed.xml` (RSS) con los días publicados hasta hoy, con el relato y sin el final;
  - si no existe `privado/hoy/`, se salta con un aviso y el resto del sitio se construye igual (código 0);
  - opciones nuevas: `--hoy-fecha AAAA-MM-DD` (fecha simulada, solo para este paso), `--hoy-dias N`,
    `--hoy-datos CARPETA` (otra carpeta de meses, para las pruebas).
- **Seguridad (regla 1):** con el código anterior, `--salida` copiaba todo el repositorio, así que **`privado/` se habría
  colado en la carpeta para subir** (comprobado). Ahora `--salida` no copia `privado/` (nunca), `herramientas/`, `docs/`,
  `apps-script/`, `README.md` ni `CLAUDE.md`. Ya no hace falta borrar nada a mano antes de comprimir.
- **Regla 7:** las sustituciones de `pagina()` ahora fallan si no encuentran su cadena. Antes pasaban en silencio:
  construir dos veces dentro del repositorio generaba páginas equivocadas sin avisar; ahora se detiene con un mensaje.
- **La página de esta etapa** (`hoy/index.html`): marca de los libros (Lora y Work Sans incrustadas, colores de
  `CLAUDE.md`), antetítulo, título con filete doble, relato, la frase con sus letras a la vista y la figura de su
  recorrido (recortada a su caja), la cuadrícula, la lista, las ranuras del final y «Cómo se juega» en el orden aprobado.
  El juego interactivo llega en la etapa 2.

**Comprobado** (`python3 -I herramientas/pruebas/probar_hoy.py BASE_ANTES`):

| Fecha simulada | JSON publicados | Feed | Portada | Resto del sitio |
|---|---|---|---|---|
| 1 dic. (N = 40) | 31 (1–31 dic.) | 1 día | 1 dic. | idéntico |
| 15 dic. (N = 40) | 24 (8–31 dic.) | 8 días | 15 dic. | idéntico |
| 31 dic. (N = 40) | 8 (24–31 dic.) | 8 días | 31 dic. | idéntico |
| 30 nov. (N = 40) | 31 (1–31 dic.) | 0 días | aviso amable | idéntico |
| 1 dic. (N = 8) | 9 (1–9 dic.) | 1 día | 1 dic. | idéntico |

- Mes con una letra cambiada → código 1, `/hoy/` no publicado, resto del sitio construido.
- Sin `privado/hoy/` → aviso, código 0, `/hoy/` no publicado, resto idéntico.
- Defectos plantados en una construcción buena (15 dic.): un JSON más allá de N días, un JSON que falta, el final
  metido en la portada, un título futuro en el feed y `privado/` en la salida → **5/5 detectados**.
- En cada caso, los JSON publicados son idénticos a los del mes; ni la portada ni el feed llevan ningún final, ni
  títulos de días futuros.
- `feed.xml` es XML bien formado (15 dic.: 8 días; 30 nov.: 0).
- Capturas de `/hoy/` (1 dic.) a 390, 820 y 1280 px: axe sin infracciones, sin peticiones a terceros. Casillas medidas
  en el navegador: 40 × 40 px en 9 × 9 y 36 × 36 px en 10 × 10 a 390 px; sin desborde horizontal.
- Construir dentro del repositorio (como el proyecto antiguo de Cloudflare, sin `privado/`): aviso, código 0; con
  `privado/`, lo generado queda ignorado por git.

### Etapa 1b · Catálogo completo en español

**Pendiente de la confirmación del autor.** No se ha cambiado ningún dato del catálogo. La lista propuesta y las
preguntas están en la conversación del 22 de noviembre. El código ya admite fichas sin enlace de compra
(«Próximamente», sin botón ni precio) y tarjetas tipográficas cuando falta la portada.

### Lo que estas comprobaciones NO cubren

- **La verdad de las historias:** el validador comprueba la forma, la cuadrícula, la frase, el final, las vetadas y las
  repeticiones **dentro del mes**. No comprueba los datos, las fechas ni las fuentes, ni repeticiones entre meses o con
  los libros (vol. 1 y 2, «Navidad con historia», el planificador): eso lo garantiza la conversación del motor.
- **El cambio de día en el dispositivo:** aún no hay JavaScript (etapa 2). La página enseña la historia del día de la
  construcción; si se subiera así una vez al mes, se quedaría en ese día. **No se lanza sin la etapa 2.**
- **Lo publicado por adelantado es legible:** los JSON de los próximos N días y el de hoy (con su final y sus fuentes)
  se pueden leer adivinando la dirección. Es lo previsto en la especificación (como Wordle); con `--hoy-dias 8` se reduce.
- **Cloudflare Pages sin `404.html`:** para una dirección que no existe (por ejemplo, el JSON de un día no publicado),
  Cloudflare devuelve la página principal con código 200, no un 404. El servidor de pruebas sí da 404. El JavaScript
  de la etapa 2 tendrá que comprobar que lo que recibe es un JSON de historia.
- **La construcción real en Cloudflare** (proyecto antiguo, conectado a GitHub) no se ha probado allí; solo aquí, con
  Python 3.13 (el script también se analiza sin errores con Python 3.8 y 3.11).
- **El zip que sube el autor:** se comprueba que la carpeta de salida no lleva `privado/`; no que el autor comprima esa
  carpeta y no la del repositorio.
- **Accesibilidad:** axe automatiza una parte de WCAG; no se ha probado con un lector de pantalla real. La frase y las
  ranuras se dibujan para la vista; para los lectores de pantalla hay una línea con las letras a la vista.
- **Rendimiento:** las fuentes van en TTF (unos 150–190 KB cada una; la página carga 3 o 4). No se ha medido el tiempo
  de carga en un móvil real.
- **El feed** está bien formado, pero no se ha pasado por un validador de RSS ni se ha probado con el servicio de correo.
- **El color del antetítulo:** el ámbar `#b8781f` sobre el fondo no llega al contraste AA para texto, así que el
  antetítulo usa el ámbar oscuro `#8a4f0f`; el ámbar claro queda para filetes y bordes.

### Cómo repetir las comprobaciones

```
python3 -I herramientas/hoy/validar_hoy.py privado/hoy/hoy_2026-12.json --prueba
git worktree add /tmp/base origin/main && python3 -I /tmp/base/herramientas/construir.py --salida /tmp/antes
python3 -I herramientas/pruebas/probar_hoy.py /tmp/antes
python3 -I herramientas/construir.py --salida /tmp/despues --hoy-fecha 2026-12-01
python3 -I herramientas/pruebas/comparar_sitio.py /tmp/antes /tmp/despues --prueba
node herramientas/pruebas/capturas.js /tmp/despues /hoy/
```
