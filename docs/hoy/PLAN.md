# «La historia del día» · plan por etapas (lanzamiento: 1 de diciembre de 2026)

**El contenido de diciembre ya está hecho y verificado:** 31 historias nuevas, en
`privado/hoy/hoy_2026-12.json`. Este repositorio solo tiene que mostrarlas. No se usan
datos de prueba de otros productos: las pruebas se hacen con el propio diciembre, con
fechas simuladas.

Cada etapa termina con:
- una carpeta construida que se puede abrir en el navegador;
- una nota en `docs/hoy/CAMBIOS.md` (qué se hizo, qué se comprobó y **qué no cubren las comprobaciones**);
- el resto del sitio intacto.

## Calendario (justo, pero cabe)

| Día | Etapa |
|---|---|
| 23 nov. | 0 · Preparar, y 1 · Validador y construcción |
| 23–24 nov. | 1b · Catálogo completo en español |
| 24–26 nov. | 2 · La página y el juego |
| 27 nov. | 3 · Compartir, correo y privacidad |
| 28–29 nov. | 4 · Ensayo general: el autor juega en su móvil y su tableta |
| 30 nov. | Subida a Cloudflare: el 1 de diciembre ya está la primera historia |

**Si algo se retrasa,** lo mínimo para el 1 de diciembre son las etapas 0, 1, 1b y 2. El
formulario de correo y la página de privacidad pueden llegar unos días después: si
`datos/hoy_formulario.html` está vacío, la sección no aparece.

## Etapa 0 · Preparar (medio día)

1. Añadir `privado/` a `.gitignore` y comprobar con `git check-ignore privado/x` que funciona.
2. Herramientas de prueba **fuera de la construcción**, en `herramientas/pruebas/`
   (Playwright, axe): pueden usar npm. `construir.py` sigue con la biblioteca estándar.
3. Guardar, para comparar después, el HTML construido **antes** de tocar nada de:
   - `/`, `/es/`;
   - `/colombia`, `/contraentrega`;
   - `/internacional`.

## Etapa 1 · Validador y construcción (medio día)

1. **El validador ya existe**: `herramientas/hoy/validar_hoy.py` (con `vetadas.py`). Se usa
   tal cual; no se reescribe:
   - `python3 -I herramientas/hoy/validar_hoy.py privado/hoy/hoy_2026-12.json` → 0 fallos;
   - con `--prueba`, los 9 defectos plantados tienen que saltar.
2. Añadir el paso `hoy` a `construir.py`:
   - llama al validador y, si falla, no publica nada de `/hoy/`;
   - publica los 7 días anteriores y los próximos N;
   - escribe `index.html`, con la historia del día de la construcción dentro, y `feed.xml`;
   - si no hay `privado/hoy/`, se salta con un aviso.
3. **Comprobación:**
   - construir con la fecha simulada del 1, del 15 y del 31 de diciembre, y contar los JSON publicados;
   - el resto del sitio, idéntico al de la etapa 0.

## Etapa 1b · Catálogo completo en español (medio día; decisión del autor del 22 de noviembre)

Quien entre en el sitio tiene que ver **todo lo que ofrece la marca**, aunque no todas
las versiones estén publicadas, y al menos una versión de cada producto en español.

1. Revisar `datos/catalogo.csv` y `datos/hotmart.csv` contra esta lista. **El autor
   confirma títulos y estado** antes de publicar:
   - «Letras con historia», vol. 1: tapa blanda en Amazon y edición para tablet en Hotmart;
   - «Letras con historia 2 · Historia de los inventos»: en revisión, sale como **«Próximamente»**;
   - «Navidad con historia»:
     - tapa blanda en Amazon (si ya tiene ASIN);
     - edición para tablet en Hotmart;
   - «Planear y recordar» (planificador):
     - tapa blanda;
     - tapa dura (en preparación);
     - edición digital para tablet (Hotmart);
   - «La historia del día», enlazada desde la cabecera.
2. Si `construir.py` no admite fichas sin enlace de compra, añadirle una etiqueta
   **«Próximamente»**, sin botón de compra y sin precio.
3. Portadas: las que haya en `portadas/`. Si falta alguna, se usa una tarjeta tipográfica
   con el título, nunca una imagen inventada.

## Etapa 2 · La página y el juego (2–3 días)

1. Extraer de la edición interactiva el código del juego:
   - origen: el archivo en `privado/referencia/`;
   - destino: `hoy/juego.js` y `hoy/juego.css`, **sin datos**;
   - revisar con `grep` que no se cuela ningún relato ni ninguna cuadrícula del vol. 1.
2. Página completa según `ESPEC.md` §2:
   - la marca de los libros;
   - las fuentes de `hoy/fuentes/` (Lora y Work Sans, con su licencia OFL);
   - «Cómo se juega».
3. **Nivel del día:**
   - **lunes a miércoles, nivel 1**: las palabras van → ↓ ↘, nunca al revés; se ve más de la mitad de la frase;
   - **jueves a domingo, nivel 2**: las palabras van en cualquier dirección, también al revés; se ve un tercio de la frase.
   - El JSON trae `tipo`, `pagina.frase_visible` e `indicaciones`: no se recalculan.
4. Guardado en `localStorage`, días jugados de la semana y los 7 días anteriores.
5. **Comprobación:**
   - Playwright resuelve, tocando la pantalla, tres días distintos (uno de nivel 1 en 9 × 9 y dos de nivel 2 en 10 × 10), en 390, 820 y 1280 px, y lee el final exacto;
   - capturas;
   - axe;
   - casillas de 36 px o más medidas en la captura.

## Etapa 3 · Compartir, correo y privacidad (1 día)

1. **Compartir:** texto con la figura en cuadrados y su prueba con un defecto plantado (una letra de la cuadrícula metida en el texto).
2. **Correo:**
   - formulario desde `datos/hoy_formulario.html`;
   - si el archivo está vacío, no aparece.
3. **Privacidad:** página `/privacidad/` en borrador, para que la revise el autor.
4. **Botón «Más historias como esta»:**
   - lleva a la ficha del libro en el catálogo;
   - o, si existe, al enlace de Attribution de `datos/hoy_enlaces.csv`.
5. **`_redirects`** y el enlace en la cabecera del catálogo.

## Etapa 4 · Ensayo general (1–2 días)

1. Construir con varias fechas simuladas:
   - el 30 de noviembre: aún no hay historia de hoy y sale el aviso amable;
   - el 1, el 15 y el 31 de diciembre;
   - el 1 de enero sin el archivo de enero: se muestra el último publicado.
2. Prueba de red: ningún dominio de terceros, salvo el del formulario.
3. **El autor juega en su móvil y su tableta**, con la carpeta construida (servidor local o una subida de vista previa en Cloudflare), y anota lo que moleste.

## Lanzamiento (30 de noviembre)

1. Construir.
2. Comprimir la carpeta de salida.
3. Subirla a Cloudflare.
4. Activar Web Analytics en el panel.

**Cada mes:** copiar el archivo nuevo en `privado/hoy/`, construir y subir (unos 10 minutos). El de enero tiene que estar antes del 15 de diciembre.
