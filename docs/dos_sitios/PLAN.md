# Dos sitios · plan por etapas

**Se trabaja sobre la rama de «La historia del día»** (`claude/bold-hamilton-dxdop3`, etapas 0 a 2 hechas). Así
`/hoy/` y los dos sitios llegan juntos y no hay que resolver choques en `construir.py`.

Cada etapa termina con una nota en `docs/dos_sitios/CAMBIOS.md`: qué se hizo, qué se comprobó y **qué no cubren las
comprobaciones**.

## Orden con el lanzamiento del 1 de diciembre

| Día | Trabajo |
|---|---|
| 26 nov. | Etapas 0–2 de este plan (medio día o un día) |
| 27 nov. | Etapa 3 de `/hoy/` (compartir, correo, privacidad) |
| 28–29 nov. | Ensayo general de `/hoy/` y del sitio Amazon; el autor da de alta el proyecto de Cloudflare |
| 30 nov. | Se suben los dos sitios |

**Si hay que recortar,** lo mínimo para el 1 de diciembre es:
- el sitio completo con `/hoy/`;
- el `/qr` del completo llevando al sitio Amazon.

## Etapa 0 · Línea base (una hora)

1. **Antes de tocar nada:** construir el sitio completo con el código actual de la rama y guardar la salida como línea
   base (`comparar_sitio.py`).
2. **Copiar en el repositorio**, desde este paquete:
   - `docs/dos_sitios/`;
   - `datos/sitios.csv`.
3. **Preguntar al autor** la dirección del sitio Amazon (opción A o B, `ESPEC.md` §6). Mientras no conteste, se usa
   `DIRECCION-DEL-SITIO-AMAZON` y nada se publica.

## Etapa 1 · `construir.py --sitio` (medio día)

1. **Leer `datos/sitios.csv`:**
   - la dirección pública de cada sitio sustituye a la constante `SITIO`;
   - sus columnas dicen qué secciones lleva y si se indexa.
2. **`--sitio completo`** (por defecto): todo igual que antes, más:
   - `_redirects` con `/qr` → sitio Amazon y `/digital` → `/`;
   - `version.txt`.
3. **`--sitio amazon`:**
   - páginas sin Hotmart ni Colombia (`con_hotmart=False`, `con_colombia=False`, ya existen);
   - lista blanca de archivos;
   - `config.js` propio (sin `URL_COLOMBIA` ni `WHATSAPP`);
   - `app.js` recortado por marcas;
   - `textos.csv` filtrado;
   - `noindex` si toca;
   - `_redirects` con `/qr` → `/`;
   - `version.txt`;
   - `/hoy/` solo si `hoy=sí`.
4. **`--zip`:** comprime el contenido de la salida con el nombre del sitio y la fecha.
5. **Regla 7:** cada recorte por marcas falla si no encuentra su marca.

## Etapa 2 · Comprobaciones (medio día)

1. **`herramientas/pruebas/comprobar_sitios.py`**, según `ESPEC.md` §5:
   - 0 fallos en los dos sitios;
   - 6 de 6 defectos plantados detectados, cada uno por su propia regla.
2. **`comparar_sitio.py`:** el completo, idéntico a la línea base salvo `_redirects` y `version.txt`. Si la comprobación
   de `/hoy/` plantaba un defecto en la línea de `/qr`, actualizarla: esa línea cambia a propósito.
3. **`capturas.js`** del sitio Amazon (390, 820 y 1280 px; axe). Mirar las capturas y `imagenes/compartir.jpg`.
4. **Probar el juego de `/hoy/`** otra vez en el completo: `probar_juego.js` y `revisar_juego.py` siguen a 0.

## Etapa 3 · QR del sitio Amazon (cuando el autor fije la dirección)

1. **Generar el QR** de `https://<sitio-amazon>/qr`:
   - en SVG y en PNG de 1200 px;
   - corrección M o Q, 4 módulos de margen, negro sobre blanco;
   - guardarlo en `imagenes/qr/qr-<nombre>.svg` y `.png`.
2. **Leerlo con un lector de QR** (por ejemplo, con `zbarimg` o con una biblioteca de npm) y comprobar que da la
   dirección exacta. Plantar un QR de otra dirección y comprobar que la prueba falla.
3. **Avisar en `docs/dos_sitios/CAMBIOS.md`:** desde ahora, los productos nuevos de Amazon llevan este QR.

## Etapa 4 · Publicar (con el autor)

**Opción A (proyecto antiguo conectado a GitHub):**
1. El autor pone en Cloudflare el comando y la carpeta de salida de `ESPEC.md` §6.
2. Se junta la rama en `main`.
3. Mirar el registro del despliegue y abrir `https://<sitio-amazon>/version.txt`.

**Opción B (proyecto nuevo de subida directa):**
1. El autor crea el proyecto: Workers & Pages → Create → Pages → Upload assets.
2. Sube el zip `sitio-amazon-…zip`.
3. Abrir `/version.txt`.

**En los dos casos:**
1. Subir el zip `sitio-completo-…zip` a `ediciones-edwin-zar`.
2. Escanear con dos móviles:
   - el QR impreso de un libro (`ediciones-edwin-zar.pages.dev/qr`): tiene que acabar en el sitio Amazon;
   - el QR nuevo del sitio Amazon.
3. Actualizar el `README.md`: cómo se construye y se sube cada sitio.
