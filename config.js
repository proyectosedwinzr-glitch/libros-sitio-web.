// =====================================================================
//  CONFIGURACIÓN DEL SITIO  (lo único que necesitas editar aquí)
// =====================================================================
window.CONFIG = {
  // Tu nombre como autor. Aparece en el título y en el pie de página.
  AUTOR: 'Edwin Zar',

  // Enlace (o solo el ID) de la hoja de Google Sheets PÚBLICA del catálogo.
  // Ejemplo: 'https://docs.google.com/spreadsheets/d/1AbC...xyz/edit'
  // Si lo dejas vacío, el sitio usa los archivos de la carpeta /datos.
  // ⚠️ Debe ser una hoja DISTINTA a la de pedidos (la de pedidos tiene datos privados).
  GOOGLE_SHEET: '',

  // URL de tu aplicación de Apps Script para Colombia (la que termina en /exec).
  URL_COLOMBIA: 'https://script.google.com/macros/s/AKfycbxQk3uZBOKCTLp0_ttCM9f5eb-_l0XVYucNbjB3XUEijzuzthAJA0DtGK2CvGszegHzsQ/exec',

  // Tu WhatsApp para la pestaña Colombia: 57 + número, sin + ni espacios. Vacío = no se muestra.
  WHATSAPP: '573015863708',

  // Pestaña que se abre si no se puede detectar el idioma del visitante.
  IDIOMA_POR_DEFECTO: 'es',

  // false = solo aparecen las pestañas de idiomas que ya tienen libros. true = aparecen todas.
  MOSTRAR_PESTANAS_VACIAS: false
};
