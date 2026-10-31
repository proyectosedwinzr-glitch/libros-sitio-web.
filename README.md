# libros-sitio-web.
Libros KDP de aprendizaje y entrenamiento cognitivo.

El sitio tiene **dos partes**:

| Parte | Dónde vive | Qué hace |
|---|---|---|
| **Sitio público** (pestañas Español, English, 日本語, Français, Deutsch, Italiano) | GitHub Pages (gratis) — archivos `index.html`, `app.js`, `estilos.css`, `config.js` | Muestra los libros y lleva al Amazon de cada país. Los textos y libros se editan en Google Sheets. |
| **Pedidos Colombia** (pestaña 🇨🇴 Colombia) | Google Apps Script — carpeta `apps-script/` | Formulario, pago Bre-B, comprobantes en Drive y panel con contraseña. |

---

## 1. La hoja de Google Sheets del catálogo (pública)

> ⚠️ Usa una hoja **NUEVA y distinta** a la de pedidos. La del catálogo será visible para cualquiera; la de pedidos tiene datos personales de tus clientes y **nunca** debe compartirse.

Crea una hoja con **3 pestañas** con estos nombres exactos (puedes importar los archivos de la carpeta `datos/` con *Archivo → Importar → Subir → "Insertar hojas nuevas"* y luego renombrarlas):

### Pestaña `Idiomas` (una fila por pestaña del sitio)
| Código | Nombre | Tienda principal | Tiendas de respaldo | Mostrar libros de | Activo |
|---|---|---|---|---|---|
| es | Español | amazon.com | amazon.com.mx, amazon.es | en | sí |
| ja | 日本語 | amazon.co.jp | amazon.com | en, es | sí |

- **Tienda principal**: el Amazon al que lleva el botón en esa pestaña.
- **Tiendas de respaldo**: si el libro no está en la principal, se usa la primera de estas que tenga enlace (y se muestra el aviso "Aún no está en Amazon.co.jp").
- **Mostrar libros de**: si un libro no tiene versión en ese idioma, se muestra la versión en estos idiomas (con la etiqueta "Edición en inglés"). Déjalo vacío si solo quieres libros traducidos.
- **Agregar un idioma nuevo** (ej. portugués): agrega una fila `pt, Português, amazon.com.br, amazon.com, en, sí` y una columna `pt` en la pestaña Textos. No se toca el código.

### Pestaña `Catalogo` (una fila por cada versión/idioma de cada libro)
| Grupo | Idioma | Título | Subtítulo | Autor | Descripción | Portada | Etiqueta | Orden | Visible | ID Colombia | amazon.com | amazon.com.mx | amazon.es | amazon.co.uk | amazon.ca | amazon.co.jp | amazon.fr | amazon.de | amazon.it |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

- **Grupo**: un nombre corto igual para todas las versiones del mismo libro (ej. `letras`). Así se vinculan "Letras con historia" (es) con su versión en inglés.
- **Idioma**: el código (`es`, `en`, `ja`, `fr`, `de`, `it`).
- **Portada**: enlace a la imagen. Sirve un enlace de Google Drive (compartido como "Cualquier persona con el enlace"), un enlace de imagen de Amazon, o un archivo subido a la carpeta `portadas/` (escribe `portadas/nombre.jpg`).
- **Etiqueta**: opcional, ej. `Nuevo` o `Volumen 2`.
- **Orden**: número para ordenar (1 primero).
- **Visible**: `sí` o `no` (sirve para preparar libros antes de publicarlos).
- **ID Colombia**: el ID del libro en la pestaña "Libros" de tu app de pedidos. Si lo llenas, el libro aparece en la pestaña Colombia con el botón "Pedir en Colombia".
- **amazon.xxx**: pega el enlace de ese libro en cada tienda. Deja vacías las tiendas donde no está. Puedes agregar más columnas de tiendas (ej. `amazon.com.br`): cualquier columna que empiece por `amazon.` se reconoce sola.

### Pestaña `Textos` (todos los textos del sitio)
| Clave | es | en | ja | fr | de | it |
|---|---|---|---|---|---|---|

Cambia cualquier texto en su celda. `{autor}`, `{tienda}`, `{idioma}` y `{anio}` se reemplazan solos. Si una celda está vacía, se usa el texto en español.

### Hacer pública la hoja
1. En la hoja, botón **Compartir** → Acceso general → **Cualquier persona con el enlace** → **Lector**.
2. Copia el enlace de la hoja y pégalo en `config.js`, en `GOOGLE_SHEET`.

Los cambios en la hoja aparecen en el sitio al recargar la página (a veces tarda 1–5 minutos).

---

## 2. Publicar el sitio público en GitHub Pages
1. En GitHub, abre este repositorio → **Settings** → **Pages**.
2. En *Source* elige **Deploy from a branch**, rama `main`, carpeta `/ (root)` → **Save**.
3. Espera 1–2 minutos. La dirección aparece arriba en esa misma página.

> GitHub Pages gratis requiere que el repositorio sea **público**. Es seguro: aquí no hay contraseñas ni datos de clientes (la contraseña real solo se escribe en el editor de Apps Script). Si prefieres un repositorio privado, Cloudflare Pages también es gratis y funciona igual.

---

## 3. Actualizar la app de pedidos de Colombia (Apps Script)
1. Abre tu hoja de **pedidos** → **Extensiones → Apps Script**.
2. Reemplaza todo el contenido de `Código.gs` por el de `apps-script/Codigo.gs`, y el de `index.html` por `apps-script/index.html`.
3. Arriba de `Código.gs`, vuelve a poner tu **CLAVE**, **WHATSAPP**, **BREB** y **ENVIO_MEDELLIN** reales. Opcional: `CORREO_AVISOS` y `URL_SITIO` (la dirección de GitHub Pages).
4. Guarda (💾). Elige la función `entrar` en el menú de arriba y pulsa **Ejecutar** una vez: Google te pedirá permiso para **enviar correos** (es nuevo). Acepta. (El error "Contraseña incorrecta" en ese momento es normal.)
5. **Implementar → Gestionar implementaciones → ✏️ (editar) → Versión: Nueva versión → Implementar.** Así la URL `/exec` no cambia.
6. Copia esa URL `/exec` en `config.js` → `URL_COLOMBIA`.

### Qué mejoró en la app de pedidos
- **Panel más seguro**: la contraseña se envía una sola vez; después se usa una sesión temporal de 6 horas. Tras 5 intentos fallidos se bloquea 15 minutos.
- **Aviso por correo** cuando llega un pedido (y copia opcional al cliente).
- **Control de duplicados**: si la misma cédula pide el mismo libro dentro de 30 minutos, no se crea otro pedido (evita doble clic o reenvíos).
- **Libro preseleccionado** cuando el cliente llega desde el sitio público (`?libro=ID`).
- **Protección**: los textos que escribe el cliente no se pueden convertir en fórmulas en la hoja ni en el CSV.
- Corregido: el panel podía quedar en blanco porque la hoja convierte la fecha en formato fecha.
