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
  *(Resuelto en la etapa 2: `hoy/juego.js` pasa a la historia del día del dispositivo.)*
- **Lo publicado por adelantado es legible:** los JSON de los próximos N días y el de hoy (con su final y sus fuentes)
  se pueden leer adivinando la dirección. Es lo previsto en la especificación (como Wordle); con `--hoy-dias 8` se reduce.
- **Cloudflare Pages sin `404.html`:** para una dirección que no existe (por ejemplo, el JSON de un día no publicado),
  Cloudflare devuelve la página principal con código 200, no un 404. El servidor de pruebas sí da 404. El JavaScript
  de la etapa 2 tendrá que comprobar que lo que recibe es un JSON de historia. *(Resuelto en la etapa 2: el juego lo
  comprueba, y el servidor de `probar_juego.js` imita a Cloudflare.)*
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

## Etapa 2 · La página y el juego · 22 de noviembre de 2026

### Lo que se sacó de la edición interactiva del vol. 1 (y lo que no)

- **Origen:** `privado/referencia/letras_con_historia_interactiva.html` (fuera de git). Sus datos van en dos líneas (los
  56 retos y el final del libro); todo lo demás es código.
- **A `hoy/juego.js`, solo el código del juego, adaptado al JSON diario:**
  - la selección por toques: letra a letra, o la primera y la última de una palabra de la lista;
  - la frase, que se escribe sola en sus huecos al recorrerla desde el principio («Vas bien con la frase: 5 de 24 letras.»);
  - el final: con todo encontrado, las letras que sobran laten y, al tocarlas, caen en su hueco; «Completar el final»
    las pone todas; al completarlo, el final aparece en limpio;
  - el guardado en el navegador.
- **A `hoy/juego.css`, sus estilos,** con la marca de los libros y las fuentes de `hoy/fuentes/` (ya no Google Fonts),
  y con la letra a 18 px o más (el vol. 1 usaba 12–17 px en muchos sitios).
- **Lo que no se trajo:** los 56 retos, el final del libro, las partes, la portada y el índice del libro, los glifos de la
  lista cifrada y las pistas de nivel 3 (no hay en las historias diarias) y «Ver solución» (con pistas sin límite no
  hace falta, y enseñaría el final de golpe).
- **Revisado** con `revisar_juego.py`: ni `juego.js`, ni `juego.css`, ni la página construida llevan nada del vol. 1
  (4519 trozos de 5 palabras de sus textos, 1654 filas y columnas de sus cuadrículas, 56 frases con huecos y 56 listas
  de palabras). 6/6 defectos plantados detectados. De paso: las 31 historias de diciembre no comparten ningún trozo de
  texto, fila de cuadrícula ni lista de palabras con el vol. 1.

### La página

- Arriba, «← Libros de Edwin Zar»; antetítulo «LA HISTORIA DEL DÍA · 4 DE DICIEMBRE»; título con filete doble; la fecha
  del hecho; el nivel («Nivel 1» o «Nivel 2», con su marca de cuadros), tomado de `tipo` sin recalcularlo.
- El relato; la frase con las letras de `pagina.frase_visible` (tal cual) y la figura de su recorrido; un campo para
  escribir la frase completa («Todavía no. Relee el relato: la frase está ahí, tal cual.», sin regañar).
- «Cómo se juega» (desplegable, el texto aprobado) entre la frase y la cuadrícula.
- La cuadrícula, con la cuenta («2 de 5 palabras · la frase: pendiente»), los botones «Pista», «Quitar selección» y
  «Empezar de nuevo» (se confirma en la propia página: el primer toque pregunta y el segundo borra), las
  `indicaciones` del JSON y la lista de palabras.
- **Colores:** como dice «Cómo se juega», un color para las palabras (verde claro) y otro para la frase (ámbar claro).
  La frase, además, va en negrita y con la línea de su recorrido encima; las que sobran llevan un aro; en la lista, las
  encontradas se tachan y llevan ✓. Nada depende solo del color.
- **Al resolver:** el final en limpio, «Resuelta con N pistas» (o «sin pistas») y las fuentes en un desplegable (solo
  entonces: destripan el final). «Compartir», el correo y el botón al libro llegan en la etapa 3.
- **Días anteriores:** los 7 anteriores que estén publicados, con «✓ Resuelta» en los resueltos, y «Esta semana: N de 7».
- En el ordenador (desde 980 px), dos columnas: el texto a la izquierda y la cuadrícula a la derecha.

### El día, el guardado y la semana

- **El día lo decide la fecha del dispositivo** (su hora local). `#AAAA-MM-DD` en la dirección abre uno de los 7 días
  anteriores; una fecha futura o más antigua no se enseña: sale la de hoy, con la nota «Esa historia no está
  disponible. Esta es la de hoy.».
- **Si falta la de hoy,** la última publicada con la nota amable de la etapa 1. **Antes del lanzamiento,** el aviso.
- **Lo que llega se comprueba** antes de usarlo: que sea un JSON, de esa fecha, con la cuadrícula, las palabras, la frase
  y las letras del final que cuadran. Así, la página HTML que da Cloudflare cuando falta un archivo se rechaza.
- **Guardado** en `localStorage`, clave `lch-hoy-v1`, por fecha: palabras encontradas, frase encontrada o escrita,
  letras del final puestas, pistas pedidas y si está resuelta. «Empezar de nuevo» borra lo encontrado, pero no la
  cuenta de pistas ni que ya se resolvió (para la semana).
- **«Esta semana: N de 7»:** las historias resueltas de lunes a domingo; el lunes vuelve a empezar. Nada de rachas.
  La semana del lanzamiento cuenta 6 (el lunes 30 de noviembre no hay historia).

### Pistas

Sin límite y escalonadas, como dice la especificación: la primera pulsación hace parpadear la primera letra de la
primera palabra de la lista que falte; la segunda, la palabra entera; si se está recorriendo la frase, la casilla
siguiente; con todas las palabras encontradas, la primera casilla de la frase. Se cuentan y se guardan (para
compartir en la etapa 3); no se cobran.

### Accesibilidad

- Letra de 18 px o más en todo el texto (medida elemento por elemento en las pruebas).
- Botones, campos y enlaces sueltos de 44 px o más en 390 px. Las casillas, de 36 a 40 px en 390 px (40 en 9 × 9, 36 en
  10 × 10) y de 44 px en tableta y ordenador. Ver «Decisiones», punto 2.
- Contraste AA (axe sin infracciones); sin cronómetro; respeta «reducir movimiento» del sistema (sin latidos ni saltos).
- Con el teclado: la cuadrícula es una sola parada del tabulador; las flechas mueven; Intro o espacio tocan la letra.
- Con lector de pantalla: cada casilla dice su letra, su fila, su columna y su estado; la frase y el final tienen su
  versión en texto; los avisos se leen solos.

### Cambios en `construir.py`

- La página enlaza `hoy/juego.css` y `hoy/juego.js` (el CSS de la etapa 1 pasó de `construir.py` a `hoy/juego.css`).
- Lleva `#hoy-config`, **solo con fechas:** los días publicados, el primero de todos y, en una prueba, la fecha fijada.
- La historia escrita dentro sigue igual (para buscadores y sin JavaScript), sin el final.
- **`--hoy-prueba`:** la página queda fijada en `--hoy-fecha`, con el aviso «Versión de prueba… No es para publicar.» y
  `noindex`. Sirve para que el autor juegue antes de tiempo; esa carpeta **no se sube como sitio definitivo**.

### Comprobado

| Prueba | Resultado |
|---|---|
| `probar_juego.js`: el 1 (nivel 1, 9 × 9), el 3 y el 4 de diciembre (nivel 2, 10 × 10), en 390, 820 y 1280 px | 9 de 9 resueltas tocando la pantalla (palabras por su primera y su última letra, y letra a letra; la frase antes y después de las palabras; las que sobran en desorden y con «Completar el final»); el final exacto, letra a letra y en limpio; al encontrar cada palabra y la frase, todas sus letras quedan pintadas, también las compartidas |
| Medidas en esas 9 | casillas de 40 px (9 × 9) y 36 px (10 × 10) en 390 px, de 44 px en 820 y 1280; botones y enlaces de 44 px o más; ningún texto de menos de 18 px; sin desborde |
| axe, red y errores, antes y después de resolver | sin infracciones; ninguna petición a terceros; ningún error de JavaScript |
| Guardado | al recargar, sigue resuelta |
| Comportamiento (30 comprobaciones) | semana (1 de 6 el 4 de diciembre; 0 de 7 el lunes 7), días anteriores, pistas escalonadas y contadas, la frase escrita, toques sueltos, «Empezar de nuevo» en dos toques, el 1 de enero sin enero, la página de Cloudflare cuando falta un archivo, el JSON de otro día, fechas en la dirección, Madrid y Bogotá en el mismo instante, el 30 de noviembre y sin JavaScript: todo bien |
| Defectos plantados (`--prueba`) | 22/22 detectados: 11 en la página y 11 en copias de `juego.js` con un fallo a propósito (entre ellos, el de las letras compartidas del 24 de noviembre) |
| `revisar_juego.py` | nada del vol. 1; 6/6 defectos plantados |
| `probar_hoy.py` (etapa 1, otra vez, con la página nueva) | todo bien; 7/7 defectos plantados (2 nuevos: una fecha de más en `#hoy-config` y una construcción de prueba subida); escenario nuevo con `--hoy-prueba` |
| El resto del sitio | idéntico byte a byte en todos los escenarios |

Las capturas (antes y después de resolver, en los tres anchos) se revisaron a ojo.

### Decisiones que tomé (y preguntas para el autor)

1. **Arrastrar el dedo.** La especificación dice que el vol. 1 se juega «arrastrando, o tocando la primera y la última
   letra», pero el código del vol. 1 no tiene arrastre: se toca letra a letra, o la primera y la última de una palabra.
   He dejado exactamente eso (lo probado con los 56 retos). Añadir el arrastre sería un cambio.
   En un móvil, arrastrar sobre una cuadrícula que ocupa todo el ancho choca con desplazar la página.
   **Decidido por el autor el 24 de noviembre: sin arrastre.**
2. **44 px y las casillas.** `CLAUDE.md` pide «casillas y botones de 44 px o más en un móvil de 390 px», y `ESPEC.md`,
   casillas de 36 a 40 px en 390 px. En 390 px no caben 10 casillas de 44 px (440 px). He aplicado 44 px a botones,
   campos y enlaces, y de 36 a 40 px a las casillas, como dice `ESPEC.md`.
3. **Las fuentes, al resolver.** No están en la lista de §2 de la especificación, pero el tono de la casa es riguroso y
   las historias llegan con dos fuentes. Van en un desplegable, solo al resolver.
   **Decidido por el autor el 24 de noviembre: se quedan.**
4. **Sin «Ver solución»**, por lo dicho arriba. «Empezar de nuevo» se confirma en la propia página, en dos toques
   (24 de noviembre): las ventanas de confirmación del navegador no funcionan en algunos navegadores que van dentro
   de otras aplicaciones, como el de WhatsApp, ni en la página de prueba de Claude.

### Correcciones tras la primera prueba del autor · 24 de noviembre

El autor jugó en su móvil y avisó: «No funcionan siempre a la primera. Tuve que seleccionar las palabras varias veces.
El mensaje final no se deja resolver».

- **El fallo (mío):** en 28 de los 31 días hay letras compartidas (28 entre dos palabras que se cruzan y 41 entre una
  palabra y la frase). El juego pintaba cada letra compartida para una sola de sus palabras, así que al encontrar la
  otra parecía que le faltaba una letra y que la selección no había funcionado. El vol. 1 sí las pintaba bien; el fallo
  entró al adaptarlo. **Corregido:** se pintan para todas sus palabras; si es de una palabra y de la frase, lleva los dos
  colores, partida en diagonal. Lo vigila una comprobación nueva en cada una de las 9 partidas, con su defecto plantado.
- **Selección más tolerante:** si un toque no encaja con lo elegido (no hay palabra ni frase que lleve todas esas
  letras), se empieza de nuevo desde esa letra: un toque suelto ya no estropea la palabra siguiente, y la primera y la
  última letra funcionan aunque antes se haya tocado otra. Con 3 letras o más ya elegidas (por ejemplo, a media frase),
  el toque que no encaja se ignora, con un aviso, para no perder lo recorrido. Tocar otra vez la última letra elegida la
  quita. Es una pequeña ayuda (al empezar de nuevo se sabe que esas letras no van juntas); con pistas sin límite, no
  cambia nada.
- **El final, explicado:** mientras falte algo por encontrar, bajo los huecos del final se lee «Cuando encuentres en la
  cuadrícula las N palabras y la frase, las letras que sobran latirán: tócalas y caerán aquí»; si la frase solo se ha
  escrito, se avisa de que falta encontrarla en la cuadrícula.
- **Pendiente en la conversación del motor (contenido, regla 2):** el autor pide finales un poco más cortos y unas tres
  palabras más en la lista. Propuesta enviada al autor para el motor: final de 15 a 25 letras (unas 3 a 5 palabras),
  lista de 7 a 9 palabras, cuadrícula de 9 × 9 o 10 × 10 como ahora (más grande no cabe en un móvil con casillas de
  36 px). **Ojo:** el validador de aquí exige listas de 4 a 6 palabras; con el mes nuevo tiene que llegar también el
  verificador nuevo del motor (`validar_hoy.py`), o el paso `hoy` no publicará nada. Mientras tanto, diciembre tal como
  está funciona con el juego corregido.

### Lo que estas comprobaciones NO cubren

- **Dispositivos de verdad:** todo se probó en Chromium (Playwright) imitando 390, 820 y 1280 px. No en un iPhone ni un
  iPad de verdad (Safari), ni en Android. Por eso el autor juega en su móvil y su tableta (etapa 4).
- **Navegadores antiguos:** el juego usa JavaScript de 2017 en adelante. En uno más viejo no se carga y se queda la
  página escrita (se puede resolver en papel); no se ha probado en ninguno.
- **Un lector de pantalla de verdad:** axe y las etiquetas se comprueban; no se ha usado VoiceOver ni TalkBack.
- **El reloj del dispositivo:** si está mal, la persona ve otro día. Es lo que pide la especificación.
- **Navegadores que bloquean `localStorage`:** se juega igual, pero no se guarda nada.
- **Los días de más de una semana:** la página solo enlaza los 7 anteriores, pero con una subida al mes los JSON de los
  días más antiguos de esa ventana siguen en el servidor hasta la siguiente subida (con `--hoy-dias 8` y una subida
  por semana, apenas).
- **Cloudflare de verdad:** el servidor de las pruebas imita sus reglas (direcciones sin `.html` y la página principal
  cuando falta un archivo), pero no se ha probado allí.
- **Rendimiento:** no se ha medido el tiempo de carga en un móvil real (las fuentes van en TTF).
- **`revisar_juego.py` en textos largos:** la regla de «3 palabras de una misma lista» puede dar falsos avisos con
  palabras corrientes. Pasado sobre este mismo `CAMBIOS.md`, avisa de ANCHO, COLOR y ESPACIO (están en una lista del
  vol. 1 y aquí en frases normales). En `juego.js` y `juego.css`, que es lo que se revisa, no hay ninguna.

### Cómo repetir las comprobaciones

```
python3 -I herramientas/construir.py --salida /tmp/hoy4 --hoy-fecha 2026-12-04
node herramientas/pruebas/probar_juego.js /tmp/hoy4 privado/hoy/hoy_2026-12.json --salida /tmp/capturas --prueba
python3 -I herramientas/pruebas/revisar_juego.py privado/referencia/letras_con_historia_interactiva.html --prueba
git worktree add /tmp/base origin/main && python3 -I /tmp/base/herramientas/construir.py --salida /tmp/antes
python3 -I herramientas/pruebas/probar_hoy.py /tmp/antes
```

Para jugar antes de tiempo (carpeta de prueba, fijada en el lunes 7 de diciembre, con los días 1 a 7). El 24 de
noviembre se puso también, para el autor, en una página privada de Claude, que solo se abre con su cuenta: la misma construcción,
con el estilo, el código y las fuentes dentro de la página y los 7 días aparte. Se probó antes en local con una
política de seguridad parecida y dentro de un marco aislado (allí no se puede guardar, pero se juega igual).

```
python3 herramientas/construir.py --salida /tmp/prueba-hoy --hoy-fecha 2026-12-07 --hoy-dias 0 --hoy-prueba
```
