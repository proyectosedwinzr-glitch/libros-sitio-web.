# Dos sitios · especificación (pedido del autor, 25 de noviembre de 2026)

> «Voy a necesitar dos sitios web. Uno solo con los productos de Amazon, para poner en todos los productos de Amazon. Y
> otro como el actual, con ambas plataformas, Amazon y Hotmart.»

## 1. Los dos sitios

| | **Sitio completo** (el actual) | **Sitio Amazon** (nuevo) |
|---|---|---|
| Dirección | `https://ediciones-edwin-zar.pages.dev` (no cambia) | la que elija el autor (ver §6); en el código, `datos/sitios.csv` |
| Para qué | catálogo general, gente que ya conoce el proyecto, ediciones de Hotmart | **lo que se imprime en los productos de Amazon** (QR y dirección escrita) |
| Amazon (tapa blanda, por país) | sí | sí |
| Hotmart (ediciones digitales) | sí | **no, nada** |
| Pedidos en Colombia (`/colombia`, `/contraentrega`, WhatsApp, Apps Script) | sí | **no**: no son productos de Amazon. El selector de país sí mantiene «Colombia → Amazon.com» |
| «La historia del día» (`/hoy/`) | sí | según cómo se publique (ver §6) |
| Indexado en Google | sí | por defecto **no** (`noindex`): así las búsquedas llegan al completo, que tiene todo. El autor puede cambiarlo |

**Una sola fuente de datos.** Los dos sitios salen del mismo repositorio y de los mismos CSV. Nada se copia a mano de
un sitio a otro: un libro nuevo en `datos/catalogo.csv` aparece en los dos al construir.

## 2. Construcción

- `construir.py` recibe `--sitio completo|amazon` (por defecto `completo`, para no cambiar lo que ya se hace):
  - `python3 herramientas/construir.py --sitio completo --salida ../salida-completo`
  - `python3 herramientas/construir.py --sitio amazon --salida ../salida-amazon`
- **`datos/sitios.csv`** (borrador en este paquete) guarda, por sitio:
  - la dirección pública: se usa en canonical, hreflang, og: y en el QR;
  - qué secciones lleva: `hotmart`, `colombia`, `hoy`;
  - si se indexa;
  - el destino de `/qr`.
  - La constante `SITIO` de `construir.py` pasa a salir de ahí.
- **El sitio Amazon se construye por lista blanca**: solo copia lo que necesita:
  - las páginas;
  - `estilos.css` y `app.js`;
  - un `config.js` propio;
  - `datos/catalogo.csv`, `datos/idiomas.csv` y un `datos/textos.csv` filtrado;
  - `imagenes/` y `portadas/`;
  - `_redirects`;
  - `hoy/`, si lleva;
  - `version.txt`.

  Nunca copia `datos/hotmart.csv`, `apps-script/`, `contraentrega.html`, `colombia.html`, `README.md`,
  `herramientas/`, `docs/` ni `privado/`.
- **Nada de Hotmart ni de los pedidos de Colombia en ningún archivo servido del sitio Amazon**, tampoco en el
  JavaScript ni en los CSV:
  - `app.js` ya tiene `MOSTRAR_HOTMART` y `MOSTRAR_COLOMBIA`. Hay que **quitar** los bloques, no solo ocultarlos: el
    texto se ve al abrir el archivo.
  - Propuesta: marcar en `app.js` los bloques con comentarios (`// @hotmart …` / `// @fin-hotmart`, y lo mismo con
    `@colombia`) y que la construcción Amazon los recorte.
  - Las claves de `textos.csv` que empiezan por `hotmart_`, `acceso_hotmart`, `sec_hotmart`, `colombia_`,
    `aviso_colombia` y `pais_co_pedido` no van al sitio Amazon.
  - El sitio completo sigue sirviendo lo mismo de antes. Solo cambian `_redirects` y `version.txt`, y quizá los
    comentarios de marca de `app.js`.
- **`version.txt`** en los dos: `sitio: amazon · construido: AAAA-MM-DD HH:MM · commit: abc1234`. Tras subir un zip, el
  autor abre `/version.txt` y comprueba que subió el sitio correcto al proyecto correcto.
- **`--zip`** (opcional): comprime el **contenido** de la salida en `sitio-amazon-AAAA-MM-DD.zip` o
  `sitio-completo-AAAA-MM-DD.zip`, listo para arrastrar. El nombre dice a qué proyecto va.

## 3. Direcciones y QR

**Ya hay productos con `ediciones-edwin-zar.pages.dev/qr` impreso**, y no se pueden cambiar sin volver a subir el
interior:
- el crédito de la tapa blanda de «Navidad con historia»;
- el planificador;
- las ediciones de Hotmart.

Por eso:

1. **En el sitio completo, `/qr` lleva al sitio Amazon:**
   - `/qr  https://<sitio-amazon>/  302` (y la misma línea con `/qr/`);
   - Cloudflare Pages admite destinos externos en `_redirects`;
   - así, todo lo que ya está impreso en libros de Amazon termina en el sitio solo de Amazon.
2. **El sitio Amazon tiene su propio `/qr`** (`/qr  /  302`).
   - **Desde ahora, los productos nuevos de Amazon imprimen esta dirección**: el dominio impreso es entonces solo de
     Amazon.
   - Hay que generar el QR nuevo (SVG y PNG de 1200 px) con las normas de `kdp/WEB_QR.md`:
     - corrección de errores M o Q;
     - margen de 4 módulos;
     - negro sobre blanco;
     - 2,5 cm como mínimo;
     - probado con dos móviles.
   - El QR se guarda en `imagenes/qr/`.
3. **Para Hotmart, una dirección nueva en el sitio completo:** `/digital  /  302`.
   - Las ediciones de Hotmart que llevan `/qr` (la edición para tablet del vol. 1 y el planificador digital) seguirán
     funcionando, pero desde ahora llevan al sitio Amazon.
   - Conviene rehacer sus PDF con `ediciones-edwin-zar.pages.dev/digital` en la próxima subida a Hotmart. Es una tarea
     de las conversaciones de esos productos, no de este repositorio.
4. `internacional.html` sigue en el sitio completo como está: puede estar compartida.

## 4. «La historia del día» en los dos sitios

- **En el completo:** como está en `docs/hoy/`.
- **En el Amazon:**
  - solo si se publica por subida directa (§6, opción B), porque necesita `privado/hoy/`;
  - el botón «Más historias como esta» lleva al catálogo del mismo sitio;
  - el formulario de correo puede ir en los dos (no vende nada).
- **Cabecera:** el enlace a `/hoy/` solo aparece si ese sitio lleva `/hoy/`.

## 5. Comprobaciones (`herramientas/pruebas/comprobar_sitios.py`)

Construye los dos sitios en carpetas temporales y comprueba:

**Sitio Amazon:**
- **Palabras prohibidas:** ni un archivo servido contiene, sin distinguir mayúsculas:
  - `hotmart`, `pay.hotmart`;
  - `script.google.com`;
  - `contraentrega`, `colombia.html`, `/colombia`;
  - `wa.me`, `api.whatsapp` y el número de WhatsApp;
  - `Bre-B`.
- **Lista blanca:** ningún archivo fuera de ella.
- **Enlaces internos:** todos llevan a un archivo que existe.
- **Enlaces externos:** solo a dominios de Amazon (`TIENDAS`) y, si hay `/hoy/`, al del formulario.
- **Direcciones:** canonical, hreflang y og: con la dirección del sitio Amazon, nunca con `ediciones-edwin-zar`.
- **Indexado:** `noindex` si `sitios.csv` lo dice.
- **`_redirects`:** `/qr` lleva a `/`.

**Sitio completo:**
- **Igual que antes, byte a byte**, salvo `_redirects` y `version.txt` (se reutiliza `comparar_sitio.py`, con la línea
  base tomada antes del cambio).
- **`_redirects`:** `/qr` y `/qr/` llevan a la dirección del sitio Amazon; `/digital` lleva a `/`.

**Defectos plantados (`--prueba`)**, cada uno detectado por su propia regla:
1. un enlace de Hotmart metido en `/es/` del sitio Amazon;
2. `datos/hotmart.csv` copiado al sitio Amazon;
3. un canonical con `ediciones-edwin-zar` en el sitio Amazon;
4. el número de WhatsApp en el `config.js` del sitio Amazon;
5. la línea de `/qr` borrada del `_redirects` del completo;
6. una ficha del completo cambiada (la línea base tiene que detectarla).

**Capturas** (`capturas.js`) del sitio Amazon a 390, 820 y 1280 px, y axe. Revisar a ojo
`imagenes/compartir.jpg`: si enseña ediciones de Hotmart, el sitio Amazon necesita su propia imagen para compartir.

## 6. Publicación en Cloudflare (decide el autor)

Al dar de alta un proyecto, la dirección (`nombre.pages.dev`) es para siempre: **un proyecto de Pages no se renombra**.
Si se borra o cambia de nombre, los QR impresos con esa dirección dejan de funcionar. Con dominio propio (unos 10–15 USD
al año), los dos sitios pueden ser `edwinzar.com` y `libros.edwinzar.com`, sin depender de los nombres de los
proyectos.

**Opción A · Reutilizar el proyecto antiguo `libros-edwin-zar`** (si sigue en la cuenta de Cloudflare; está conectado a
GitHub):
- **Configuración**, en Settings → Builds:
  - comando de construcción: `python3 herramientas/construir.py --sitio amazon --salida salida-amazon`;
  - carpeta de salida: `salida-amazon`;
  - rama de producción: `main`.
- **A favor:**
  - no hay que subir nada a mano: se actualiza solo al juntar cambios en `main`;
  - la dirección ya existe;
  - si algún QR antiguo apuntaba a `libros-edwin-zar.pages.dev/qr`, ahora lleva al sitio Amazon.
- **En contra:**
  - **sin `/hoy/`** (en GitHub no está `privado/`);
  - la construcción en Cloudflare no se ha probado nunca: hay que mirar el registro del primer despliegue y
    `/version.txt`.

**Opción B · Proyecto nuevo de subida directa** (por ejemplo, `libros-edwinzar`; el nombre tiene que estar libre):
- **Cómo:** se publica como el actual, con su propio zip.
- **A favor:** puede llevar `/hoy/`.
- **En contra:**
  - dos zips que subir cada vez;
  - el riesgo de subir uno al proyecto equivocado; para eso están `version.txt` y el nombre del zip.
- **Y el proyecto antiguo:** si se elige la opción B y existe `libros-edwin-zar`, hay que decidir qué hacer con él:
  - borrarlo, si su dirección nunca se imprimió;
  - o ponerle el comando de la opción A, para que no siga sirviendo una copia vieja del sitio con Hotmart.

**Recomendación:** opción A si el proyecto antiguo existe. El sitio Amazon es para quien escanea un libro, y no necesita
`/hoy/` para cumplir su función. Así queda un solo zip que subir, el del sitio completo.

## 7. Bloque para `CLAUDE.md` (añadirlo en «El sitio, tal como está»)

```
- **Dos sitios desde el mismo repositorio** (desde el 25 de noviembre de 2026):
  - completo (`ediciones-edwin-zar.pages.dev`): Amazon, Hotmart, pedidos de Colombia y /hoy/;
  - Amazon (dirección en `datos/sitios.csv`): solo libros de Amazon. Es lo que se imprime en los productos de Amazon.
  - `construir.py --sitio completo|amazon`.
  - En el sitio Amazon no puede aparecer nada de Hotmart ni de los pedidos de Colombia, en ningún archivo:
    lo comprueba `herramientas/pruebas/comprobar_sitios.py`.
  - `/qr` del completo lleva al sitio Amazon; `/digital` es la dirección para las ediciones de Hotmart.
```
