# CLAUDE.md · sitio de Edwin Zar (`libros-sitio-web.`)

Lo lee Claude Code al empezar cada sesión en este repositorio. Léelo entero.

## El sitio, tal como está (no lo rompas)

- **Qué es:** un sitio estático en `https://ediciones-edwin-zar.pages.dev`, con:
  - el catálogo de libros (Amazon) y de ediciones digitales (Hotmart);
  - páginas por idioma (`/es/`, `/en/`, `/fr/`, `/it/`);
  - los pedidos de Colombia (`/colombia`, `/contraentrega`);
  - el destino del QR de los libros impresos (`/qr`, en `_redirects`).
- **Datos:** CSV en `datos/` (`catalogo.csv`, `hotmart.csv`, `textos.csv`, `idiomas.csv`).
- **Construcción:** `python3 herramientas/construir.py --salida <carpeta>` escribe el sitio con el catálogo dentro
  del HTML. Solo usa la biblioteca estándar de Python: **sigue así** (nada de pip ni npm para construir).
- **Publicación:** el autor comprime la carpeta de salida y la **arrastra al panel de Cloudflare Pages** (proyecto
  `ediciones-edwin-zar`). Esa subida **no admite Functions** (código de servidor): todo lo que se añada tiene que
  funcionar como archivos estáticos.
- **El README habla de GitHub Pages:** está desactualizado. El sitio vive en Cloudflare Pages.
- **Antes de dar por bueno cualquier cambio:** construir en una carpeta aparte y comprobar que `/`, `/es/`,
  `/colombia`, `/contraentrega` y `/qr` siguen igual (diferencia de su HTML antes y después).

## Lo que se añade: «La historia del día» en `/hoy/`

Una sopa de letras con una historia real cada día, gratis, sin registrarse. **Sale el 1 de diciembre de 2026**, con
las 31 historias de diciembre ya verificadas en `privado/hoy/hoy_2026-12.json`. El validador está en
`herramientas/hoy/validar_hoy.py`. Junto con `/hoy/`, el catálogo en español tiene que enseñar todos los productos de
la marca (etapa 1b del plan). Especificación:
`docs/hoy/ESPEC.md`; plan por etapas: `docs/hoy/PLAN.md`; formato del contenido: `docs/hoy/ESPEC_HISTORIAS_DIARIAS.md`.

## Reglas que no se negocian

1. **El repositorio es público.** Nunca se sube aquí contenido de pago ni contenido futuro:
   - ni la edición interactiva del vol. 1;
   - ni el JSON del planificador;
   - ni las historias de días que aún no han llegado;
   - ni claves.
   Todo eso va en `privado/` (en `.gitignore`), y `construir.py` publica solo los días que tocan.
2. **El contenido no se inventa ni se genera aquí.** Las historias diarias llegan escritas, verificadas con dos
   fuentes y con su cuadrícula comprobada, desde la conversación del motor (ver `ESPEC_HISTORIAS_DIARIAS.md`). Este
   repositorio solo las valida y las publica.
3. **Sin promesas de salud:** nada de «entrena tu cerebro», «mejora tu memoria», «edad mental». Como mucho, «un
   hábito de lectura, atención y concentración».
4. **Sin anuncios, sin rastreadores de terceros, sin cookies de seguimiento.** Para medir, solo Cloudflare Web
   Analytics (sin cookies), que se activa en el panel.
5. **Sin culpa:** no hay racha que se pierda ni avisos que regañen.
6. **Accesible:**
   - texto de 18 px o más;
   - casillas y botones de 44 px o más en un móvil de 390 px;
   - contraste AA;
   - sin depender solo del color;
   - sin cronómetro.
7. **Todo comprobador se prueba con un defecto plantado** antes de fiarse de un cero. Una sustitución que no
   encuentra su cadena falla. Lo visual se comprueba con capturas (390, 820 y 1280 px).
8. **Tono de la casa:** serio, riguroso, académico, respetuoso, ameno y jovial. Sin superlativos frágiles.

## Marca de `/hoy/` (la de los libros, no la azul del catálogo)

- Tipografías: Lora (títulos y relato) y Work Sans (interfaz), incrustadas en `hoy/fuentes/` con su licencia OFL.
- Variables: `--tinta:#29292e; --gris:#6b6b72; --linea:#d6d3cd; --fondo:#f6f3ec; --papel:#fffdf8;
  --ambar:#b8781f; --ambar-osc:#8a4f0f; --ambar-claro:#fbeed2; --oscuro:#21263a; --verde:#3c7a4a;`
- Antetítulo en versalitas espaciadas y ámbar; filete doble bajo el título. Un enlace arriba lleva al catálogo
  («Libros de Edwin Zar»).
