# «La historia del día» · especificación (`/hoy/`)

## 1. Para qué sirve (y cómo se mide)

No se vende: **trae gente nueva y la lleva a los libros**. Tres trabajos:

1. Que vuelvan cada día (como Wordle: una al día, unos minutos, igual para todos).
2. Que dejen su correo para recibir las historias de la semana.
3. Que pasen a los libros (Amazon) y a las ediciones digitales (Hotmart).

**Medición, sin rastreadores:**
- **Visitas por día a `/hoy/`:** Cloudflare Web Analytics, que se activa en el panel del proyecto.
- **Correos:** los cuenta el servicio de correo.
- **Ventas que llegan desde la página:** los enlaces a Amazon llevan una etiqueta de Amazon Attribution, si el autor
  la crea. Va en `datos/hoy_enlaces.csv`.

**Revisión a las ocho semanas del lanzamiento.** La meta orientativa es unas 300 visitas al día y 500 correos. Si se
queda lejos, se deja la página como está y no se construye nada más.

## 2. La página

- **Arriba:**
  - enlace «← Libros de Edwin Zar»;
  - antetítulo «LA HISTORIA DEL DÍA · 1 DE ENERO»;
  - el título de la historia.
- **El relato:** 50–70 palabras.
- **La frase:** con sus letras a la vista y sus huecos, y la figura de su recorrido al lado.
- **La cuadrícula:** 9 × 9 o 10 × 10; en un móvil de 390 px, cada casilla mide entre 36 y 40 px.
- **La lista de palabras.**
- **El final escondido:** con todo encontrado, las letras que sobran laten y, al tocarlas, caen en su hueco. Al
  completarlo, el final aparece en limpio.
- **Al resolver:**
  - el final en limpio;
  - «Compartir»;
  - el formulario de correo;
  - de qué libro es la casa, con un botón a la ficha del libro en el catálogo, por ejemplo
    `/es/#letras-con-historia`. Ahí el visitante elige su país de Amazon, que ya funciona.
- **«Días anteriores»:** solo los 7 últimos. Los anteriores no se publican, para no regalar el archivo entero.
- **Pistas:** sin límite y escalonadas. Primero, la primera letra de una palabra; después, la palabra que parpadea;
  en la frase, la casilla siguiente. Se cuentan para compartir, no se cobran.
- **«Cómo se juega»:** desplegable, en cuatro líneas, con el orden aprobado por el autor:
  1. lee el relato y completa la frase;
  2. busca las palabras y la frase, que forma la figura que ves al lado;
  3. usa un color para las palabras y otro para la frase;
  4. las letras que sobran, bajando por columnas, forman el final del relato.

## 3. El juego por dentro

- **Reutilizar la edición interactiva del vol. 1.** Su lógica ya se probó con los 56 retos en escritorio, tableta y
  móvil:
  - la selección (arrastrar, o tocar la primera y la última letra);
  - la frase que se escribe sola en sus huecos;
  - el mensaje letra a letra;
  - el guardado.
- **La edición interactiva es de pago.** Su archivo va en `privado/` (fuera del repositorio). Se **extrae** a
  `hoy/juego.js` y `hoy/juego.css` solo el código del juego, nunca sus datos.
- **El progreso se guarda en el navegador**, en `localStorage`, con la clave `lch-hoy-v1`: por fecha, lo encontrado
  y si está resuelta.
- **Los días jugados se cuentan por semana**, del lunes al domingo, y el lunes vuelve a empezar: «Esta semana: 3 de
  7». Nada de rachas.
- **El día se decide por la fecha del dispositivo:** la historia del 1 de enero, el 1 de enero de cada persona. Si
  falta el archivo de ese día, se muestra el último publicado, con una nota amable.

## 4. Compartir (pensado para WhatsApp)

Al tocar «Compartir», el móvil abre su menú de compartir; en el ordenador, el texto se copia. Texto, sin una sola
letra de la cuadrícula:

```
La historia del día · 1 ene. 2027
«Título de la historia»
Resuelta con 1 pista
🟧🟧🟧⬜
⬜⬜🟧⬜
⬜⬜🟧🟧
ediciones-edwin-zar.pages.dev/hoy
```

El dibujo es la figura del recorrido de la frase, que la página ya enseña. Se recorta a su caja y se limita a 6 × 6.

**Prueba automática:** ninguna letra de la cuadrícula aparece en el texto (comparando letra a letra, salvo las del
título, la fecha y la dirección). Se prueba con un defecto plantado.

## 5. El correo (sin servidor)

- **Un formulario incrustado** del servicio de correo, que funciona sin servidor.
- **Doble confirmación:** el visitante recibe un correo y confirma. Así lo exige el RGPD para Europa y es lo correcto
  en Colombia (Ley 1581).
- **Texto del formulario:** «Recibe cada domingo las historias de la semana». Nada de «gratis», ni de regalos a
  cambio.
- **Servicio:** lo elige el autor (ver «Decisiones»). El código del formulario va en `datos/hoy_formulario.html`.
  `construir.py` lo inserta; si el archivo está vacío, la sección no se muestra.
- **Privacidad:** una página `/privacidad/`, enlazada desde el formulario. Debe decir:
  - quién recoge los datos (Edwin Zar, con el correo de contacto que dé el autor);
  - para qué (el boletín de las historias);
  - con qué servicio;
  - cómo darse de baja (enlace en cada correo);
  - y que no se ceden a nadie.
  Claude redacta un borrador y **el autor lo revisa** (no es asesoría legal).

## 6. Datos y construcción

- **Formato:** cada historia llega como en `ESPEC_HISTORIAS_DIARIAS.md`.
- **Dónde se guardan:** en `privado/hoy/hoy_AAAA-MM.json`, un archivo por mes, fuera del repositorio. Diciembre de 2026 ya
  está (31 historias verificadas).
- **`construir.py --salida X`:** se le añade un paso `hoy`, que:
  1. valida cada historia (ver §7);
  2. escribe `X/hoy/index.html`: la página, con la historia **del día de la construcción** ya escrita dentro, para
     buscadores y para quien no tenga JavaScript. Al cargar, el JavaScript pasa a la del día del dispositivo;
  3. escribe `X/hoy/d/AAAA-MM-DD.json` para **los 7 días anteriores y los próximos N días** (`--hoy-dias N`,
     por defecto 40). Así basta una subida al mes.
     - **Ojo:** esos días futuros quedan en el servidor aunque la página no los enseñe; quien adivine la dirección
       puede leerlos (le pasa igual a Wordle).
     - Si eso molesta, se sube cada semana con `--hoy-dias 8`.
     - Lo que nunca se publica es lo que está más allá de N días;
  4. escribe `X/hoy/feed.xml` (RSS de los días publicados hasta hoy, por si el servicio de correo lo usa más
     adelante).
- **Si `privado/hoy/` no existe**, el paso `hoy` se salta con un aviso y el resto del sitio se construye igual.
- **Etiquetas para compartir:** `og:title` «La historia del día · Libros de Edwin Zar», `og:description` sin
  destripar el final, y una imagen fija `hoy/compartir.jpg`.
- **`_redirects`:** `/historia-del-dia /hoy/ 301` y, en `textos.csv`, un enlace a «La historia del día» en la
  cabecera del catálogo.

## 7. Comprobaciones

- **Validador de historias:** ya existe, en `herramientas/hoy/validar_hoy.py`. `construir.py` lo llama y no se
  reescribe. Comprueba:
  - el esquema;
  - que las palabras, la frase y las letras sobrantes cubren exactamente la cuadrícula;
  - que el recorrido de la frase es contiguo y la deletrea;
  - que las sobrantes, leídas bajando por columnas, dan el final;
  - que cada palabra de la lista sale una sola vez, en línea recta y en las direcciones de su nivel;
  - que el recorrido de la frase es único;
  - vetadas, familias repetidas en el mes, la frase a la vista y que no hay fechas repetidas ni huecos en el mes.
- **Defectos plantados**, nueve, que tienen que saltar, cada uno por su propia regla:
  - una letra cambiada;
  - un paso del recorrido roto;
  - un final con una letra de menos;
  - una fecha repetida;
  - un nivel mal puesto;
  - una frase que ya no es literal;
  - una vetada en el final;
  - una palabra repetida en el mes;
  - una familia repetida en el mes.
- **Playwright:** resuelve tres días de diciembre (de nivel 1 y de nivel 2, en 9 × 9 y en 10 × 10) tocando la
  pantalla en 390, 820 y 1280 px, y lee el final exacto.
  Además:
  - capturas en los tres tamaños;
  - axe sin errores graves;
  - casillas de 36 px o más medidas en la captura.
- **Red:** la página no llama a ningún dominio de terceros, salvo el del formulario de correo, y solo cuando se envía.
- **El resto del sitio:** `/`, `/es/`, `/colombia`, `/contraentrega` y `/qr` dan el mismo HTML que antes del
  cambio.

## 8. Decisiones del autor

1. **El servicio de correo:**
   - **Kit:** gratis hasta 10 000 suscriptores, envíos ilimitados. Las páginas de ayuda no coinciden sobre si el
     envío automático por RSS entra en el plan gratis. Hay que comprobarlo al abrir la cuenta; si no entra, el correo
     del domingo se envía a mano, en unos 10 minutos.
   - **Brevo:** gratis, pero con 300 correos al día como máximo.
   - Propuesta: Kit.
2. **El contenido:** decidido el 22 de noviembre.
   - Se lanza el **1 de diciembre de 2026**.
   - Historias nuevas: no se usan las del planificador ni datos de prueba.
   - Diciembre ya está hecho; enero tiene que estar antes del 15 de diciembre.
3. **El correo de contacto** que aparece en la página de privacidad.
4. **El catálogo en español completo**, con «Próximamente» donde haga falta (`PLAN.md`, etapa 1b). El autor confirma
   la lista.
5. **Amazon Attribution:** si quieres medir las ventas que llegan desde `/hoy/`, crea una etiqueta por libro en la
   consola de Amazon Ads y pega los enlaces en `datos/hoy_enlaces.csv`.
