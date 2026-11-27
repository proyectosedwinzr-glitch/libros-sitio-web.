# Dos sitios · registro de cambios

Cada etapa: qué se hizo, qué se comprobó y **qué no cubren las comprobaciones**.

## Etapas 0 a 3 · 25 y 26 de noviembre de 2026

### Etapa 0 · Línea base

- **Antes de tocar nada:** el sitio completo, construido con el código de la rama (commit `256d441`, sin cambios
  pendientes) y `--hoy-fecha 2026-12-04`: 76 archivos. Es la línea base de las comparaciones.
- Copiados del paquete, sin reemplazar nada: `docs/dos_sitios/` y `datos/sitios.csv`.
- **Respuesta del autor (26 de noviembre):** el proyecto antiguo `libros-edwin-zar` sigue en Cloudflare → **opción A**.
  El sitio Amazon es **`https://libros-edwin-zar.pages.dev`** (conectado a GitHub; sin `/hoy/`, porque en GitHub no está
  `privado/`). Puesto en `datos/sitios.csv`.

### Etapa 1 · `construir.py --sitio completo|amazon`

- **`datos/sitios.csv`** da, por sitio, la dirección (que sustituye a la constante `SITIO`), qué secciones lleva
  (`hotmart`, `colombia`, `hoy`), si se indexa y el destino de `/qr`. Si falta un sitio o una dirección no es válida,
  la construcción se detiene.
- **Marcas en `app.js` y `estilos.css`:** lo de Hotmart y lo de los pedidos de Colombia va entre marcas de comentario
  (`// @hotmart` … `// @fin-hotmart` para líneas enteras; `/*@hotmart*/ … /*@fin-hotmart*/` dentro de una línea; en CSS,
  `/* @hotmart */`). En `app.js`, 10 tramos de Hotmart y 17 de Colombia; en `estilos.css`, 3 y 4.
  - El **sitio completo** solo quita las marcas: `app.js` y `estilos.css` quedan **byte a byte como antes** (comprobado).
  - El **sitio Amazon** quita lo marcado. Su `app.js` es JavaScript válido (`node --check`) y funciona (capturas).
  - **Regla 7:** la construcción falla si una marca no se cierra, si no se conoce o si falta alguna sección.
  - En la carpeta del repositorio las marcas se quedan (son comentarios): una construcción dentro del repositorio sigue
    funcionando como el sitio completo.
- **Sitio Amazon, por lista blanca** (22 archivos): las páginas (`/` y `/es/`, `/en/`, `/fr/`, `/it/`), `estilos.css`,
  `app.js`, un `config.js` sin `URL_COLOMBIA` ni `WHATSAPP`, `datos/catalogo.csv`, `datos/idiomas.csv`, un
  `datos/textos.csv` sin las claves `hotmart_…`, `acceso_hotmart`, `sec_hotmart`, `colombia_…`, `aviso_colombia…` y
  `pais_co_pedido`, `imagenes/compartir.jpg`, las 8 portadas, `_redirects` (`/qr` → `/`) y `version.txt`.
  - Nunca: `datos/hotmart.csv`, `apps-script/`, `colombia.html`, `contraentrega.html`, `internacional.html`,
    `herramientas/`, `docs/`, `privado/`, ni los QR de `imagenes/qr/` (son para imprimir).
  - `noindex` en todas sus páginas (`indexar = no` en `sitios.csv`).
  - El selector de país mantiene «Colombia → Amazon.com», sin el enlace a los pedidos.
  - **La imagen para compartir** (`imagenes/compartir.jpg`) solo enseña libros de Amazon («Disponibles en Amazon»): sirve
    para los dos sitios.
- **Sitio completo:** lo de siempre, más `_redirects` (`/qr` y `/qr/` → sitio Amazon, 302; `/digital` y `/digital/` →
  `/`, 302) y `version.txt`. `datos/sitios.csv` no se publica. El `_redirects` del repositorio es el mismo que genera la
  construcción.
- **`version.txt`** en los dos: `sitio: amazon · construido: AAAA-MM-DD HH:MM · commit: abc1234` (con «(con cambios sin
  guardar)» si el repositorio tenía cambios sin guardar; en Cloudflare, el commit sale de `CF_PAGES_COMMIT_SHA`).
- **`--zip`:** `sitio-amazon-AAAA-MM-DD.zip` o `sitio-completo-AAAA-MM-DD.zip`, al lado de la carpeta de salida, con el
  contenido en la raíz. Si la construcción falla (por ejemplo, el validador de `/hoy/`), no se crea.
- `.gitignore`: `version.txt`, `salida-*/` y `sitio-*.zip` (lo que escribe la construcción dentro del repositorio).
- `CLAUDE.md`: el bloque del §7, más una línea sobre las marcas de sección (para que lo nuevo de Hotmart o de los
  pedidos se marque igual).

### Etapa 2 · Comprobaciones

| Prueba | Resultado |
|---|---|
| `comprobar_sitios.py` · sitio Amazon | 22 archivos; ninguna palabra prohibida (`hotmart`, `pay.hotmart`, `script.google.com`, `contraentrega`, `colombia.html`, `/colombia`, `wa.me`, `api.whatsapp`, el número de WhatsApp con y sin el 57, `Bre-B`) en ningún archivo, tampoco en el JavaScript, el CSS o los CSV; todo dentro de la lista blanca; enlaces internos que existen; enlaces externos solo a tiendas de Amazon; canonical, hreflang, og: y twitter: con `https://libros-edwin-zar.pages.dev`; `noindex` en todas las páginas; `/qr` → `/` |
| `comprobar_sitios.py` · sitio completo | idéntico a la línea base byte a byte (76 archivos), salvo `_redirects`; nuevos, solo `version.txt` y el QR del sitio Amazon en `imagenes/qr/`; `/qr` y `/qr/` → `https://libros-edwin-zar.pages.dev/`; `/digital` → `/` |
| Defectos plantados (`--prueba`) | **11/11**, cada uno por su propia regla: los 6 de la especificación (enlace de Hotmart en `/es/`, `hotmart.csv` copiado, canonical con `ediciones-edwin-zar`, el número de WhatsApp en `config.js`, la línea de `/qr` borrada, una ficha del completo cambiada) y uno por cada regla que esos no prueban (enlace interno roto, enlace a otro dominio, página sin `noindex`, `version.txt` del otro sitio, `privado/` en el completo) |
| Capturas y axe del sitio Amazon (`capturas.js`) | `/`, `/es/` y `/en/` a 390, 820 y 1280 px: axe sin infracciones, ninguna petición a terceros. Revisadas a ojo: el catálogo sin la sección de Hotmart ni la pestaña de Colombia |
| `/hoy/` en el completo | `probar_hoy.py`: todo bien, 7/7 defectos (ahora admite `_redirects` como cambio previsto); `probar_juego.js`: las 9 partidas y el comportamiento, bien; `revisar_juego.py`: limpio |

### Etapa 3 · QR del sitio Amazon

- **`herramientas/qr/qr_sitio.py`** (fuera de la construcción; necesita `segno`, Pillow y OpenCV): `hacer` y `leer`.
- **El QR nuevo:** `imagenes/qr/qr-libros-edwin-zar.svg` y `imagenes/qr/qr-libros-edwin-zar-1200.png`.
  - Lleva a `https://libros-edwin-zar.pages.dev/qr`, que `_redirects` manda a la página principal: el destino se puede
    cambiar sin reimprimir.
  - Igual que el QR ya impreso: versión 4, corrección Q, 4 módulos de margen, negro sobre blanco; SVG de 410 px con
    `viewBox` y título; PNG de 1200 × 1200 px con módulos de 29 px exactos.
  - **Leído por programa:** el SVG y el PNG dan la dirección exacta. El mismo lector lee bien el QR antiguo, y los 3
    defectos plantados (un QR de otra dirección en SVG y en PNG, y un PNG en blanco) saltan.
- **Desde ahora, los productos nuevos de Amazon imprimen este QR** (2,5 cm como mínimo).
- Lo ya impreso con `ediciones-edwin-zar.pages.dev/qr` (Navidad con historia, el planificador, las ediciones de Hotmart)
  sigue funcionando y, en cuanto se suba el sitio completo nuevo, lleva al sitio Amazon.
- Para Hotmart, la dirección nueva es `ediciones-edwin-zar.pages.dev/digital`: conviene ponerla en sus PDF en la próxima
  subida a Hotmart (tarea de las conversaciones de esos productos).

### Etapa 4 · Publicar (pendiente, con el autor)

1. Juntar la rama en `main` (una petición de cambios en GitHub; hace falta el visto bueno del autor).
2. En Cloudflare, proyecto `libros-edwin-zar` → Settings → Builds:
   - comando de construcción: `python3 herramientas/construir.py --sitio amazon --salida salida-amazon`;
   - carpeta de salida: `salida-amazon`;
   - rama de producción: `main`.
3. Volver a desplegar; mirar el registro y abrir `https://libros-edwin-zar.pages.dev/version.txt`: tiene que decir
   `sitio: amazon`.
4. Subir el sitio completo a `ediciones-edwin-zar` (el 30 de noviembre, con `/hoy/`) y abrir su `/version.txt`.
5. Escanear con dos móviles el QR impreso de un libro (`ediciones-edwin-zar.pages.dev/qr`, tiene que acabar en el sitio
   Amazon) y el QR nuevo, impreso a 2,5 cm.

### Etapa 4 · 27 de noviembre: en marcha

- **Juntado en `main`** (petición #15, con el visto bueno del autor; commit `fb0793c`).
- **Simulación de Cloudflare** antes de juntar: una copia limpia de la rama, sin `privado/`, con Python 3.11 y el comando
  `python3 herramientas/construir.py --sitio amazon --salida salida-amazon` da el sitio Amazon correcto; con el comando
  antiguo (dentro del repositorio), el sitio completo sin `/hoy/`.
- **Comprobado en la red** (entorno de la sesión con acceso a `libros-edwin-zar.pages.dev` y `ediciones-edwin-zar.pages.dev`):
  `https://libros-edwin-zar.pages.dev/qr` responde y redirige (302) a su página principal, así que **el QR nuevo ya
  funciona**. Pero 5 minutos después de juntar, el proyecto seguía sin `version.txt`: Cloudflare no había construido con el
  código nuevo (el proyecto puede haber perdido la conexión con GitHub o estar esperando los ajustes nuevos).
- **Pendiente del autor:** los ajustes de Settings → Builds (comando, carpeta de salida y rama `main`), volver a desplegar y
  avisar para comprobar `/version.txt` («sitio: amazon») y el QR.

### Lo que estas comprobaciones NO cubren

- **La construcción en Cloudflare:** no se ha probado allí (versión de Python, `git`, carpeta de salida). Aquí, con
  Python 3.13 y solo la biblioteca estándar. Hay que mirar el registro del primer despliegue y `/version.txt`.
- **Hasta los pasos 1 a 3,** `libros-edwin-zar.pages.dev` sigue sirviendo una copia antigua del sitio completo, **con
  Hotmart**. Y hasta subir el completo nuevo, `/qr` sigue llevando a su página principal y `/digital` no existe.
- **Lo que pinta el JavaScript:** `comprobar_sitios.py` lee el HTML escrito y todos los archivos; los enlaces que crea
  `app.js` al cargar solo se han visto en las capturas de 3 páginas.
- **Las palabras prohibidas** se buscan tal cual: una mención escrita de otra forma («Hot mart») o un logotipo dentro de
  una imagen no se detectarían.
- **Google Sheets:** si algún día se rellena `GOOGLE_SHEET` en `config.js`, el sitio Amazon leería las pestañas de la
  hoja (no la de Hotmart, porque ese código ya no está), con todos sus textos.
- **El `noindex`:** las páginas que Google ya tuviera de `libros-edwin-zar.pages.dev` tardan en salir de los resultados.
- **El QR** se ha leído por programa (OpenCV), no con dos móviles de verdad ni impreso a 2,5 cm: lo prueba el autor.

### Cómo repetir las comprobaciones

```
git worktree add /tmp/base 256d441 && python3 -I /tmp/base/herramientas/construir.py --salida /tmp/base-completo --hoy-fecha 2026-12-04
python3 -I herramientas/pruebas/comprobar_sitios.py /tmp/base-completo --hoy-fecha 2026-12-04 --prueba
python3 -I herramientas/construir.py --sitio amazon --salida /tmp/amazon && node herramientas/pruebas/capturas.js /tmp/amazon / /es/ /en/
python3 herramientas/qr/qr_sitio.py leer imagenes/qr/qr-libros-edwin-zar-1200.png https://libros-edwin-zar.pages.dev/qr --prueba
```
