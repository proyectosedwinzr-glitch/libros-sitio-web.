// ====== CAMBIA ESTOS DATOS ======
const CLAVE = 'CAMBIA-ESTA-CLAVE';           // ⚠️ Ponla SOLO en el editor de Apps Script, nunca en GitHub
const WHATSAPP = '573000000000';            // 57 + tu número, sin + ni espacios
const BREB = { llave: '@TU-LLAVE-BREB', titular: 'NOMBRE DEL TITULAR' };
const ENVIO_MEDELLIN = 8000;                // envío fijo en Medellín
const CORREO_AVISOS = '';                   // a dónde llegan los avisos de pedidos ('' = tu correo de Google)
const COPIA_AL_CLIENTE = true;              // true = el cliente recibe un correo confirmando que llegó su pedido
const URL_SITIO = '';                       // tu sitio público (GitHub Pages), para el enlace "Ver todos mis libros"
// =================================

const LIB = ['ID','Título','Autor','Precio','Portada (URL)','Enlace Amazon'];
const COLS = ['ID','Fecha','Estado','Libro','Precio','Envío','Total','Nombre','Cédula','Email','Teléfono','Ciudad','Dirección','Barrio','Indicaciones','Entrega','Comprobante','Verificada'];

function doGet(e) {
  const p = (e && e.parameter) || {};
  const t = HtmlService.createTemplateFromFile('index');
  t.admin = !!p.admin;
  t.libro = String(p.libro || '').replace(/[^\w-]/g, '').slice(0, 40);   // libro preseleccionado (?libro=ID)
  return t.evaluate().setTitle('Libros bajo pedido · Colombia')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);     // permite incrustarla en un Google Site
}

function hoja_(n, cab) {
  const ss = SpreadsheetApp.getActive();
  let s = ss.getSheetByName(n);
  if (!s) {
    s = ss.insertSheet(n); s.appendRow(cab);
    if (n === 'Libros') s.appendRow([1, 'TÍTULO DEL LIBRO', 'Autor', 35000, '', 'https://www.amazon.com/dp/XXXXXXXXXX']);
  }
  return s;
}

function datosInicio() {
  const v = hoja_('Libros', LIB).getDataRange().getValues().slice(1).filter(r => r[1]);
  return {
    libros: v.map(r => ({ id: r[0], titulo: r[1], autor: r[2], precio: r[3], portada: r[4], amazon: r[5] })),
    whatsapp: WHATSAPP, breb: BREB, envioMed: ENVIO_MEDELLIN, sitio: URL_SITIO
  };
}

// Evita que un texto escrito por el cliente se convierta en fórmula dentro de la hoja.
function limpio_(v) {
  const s = String(v == null ? '' : v).trim().slice(0, 300);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function crearPedido(d, f) {
  d = d || {};
  const l = datosInicio().libros.find(x => x.id == d.libroId);
  if (!l) throw new Error('Libro no encontrado');
  if (!f || !f.data || f.data.length > 7e6) throw new Error('Comprobante inválido o muy pesado (máx. 5 MB)');
  const c = k => limpio_(d[k]);
  if (!c('nombre') || !c('cedula') || !c('email') || !c('telefono')) throw new Error('Faltan datos obligatorios.');

  // Control de duplicados: misma cédula + mismo libro en los últimos 30 minutos = el mismo pedido.
  const cache = CacheService.getScriptCache();
  const llaveDup = 'dup_' + String(d.cedula).replace(/\D/g, '') + '_' + l.id;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let id, med, envio, url;
  try {
    const previo = cache.get(llaveDup);
    if (previo) return { id: previo, repetido: true };

    med = d.entrega === 'Medellín';
    envio = med ? ENVIO_MEDELLIN : '';
    const s = hoja_('Pedidos', COLS);
    id = 'P' + Utilities.formatDate(new Date(), 'America/Bogota', 'yyMMddHHmmss');
    const ultimo = s.getLastRow() > 1 ? String(s.getRange(s.getLastRow(), 1).getValue()) : '';
    if (ultimo.indexOf(id) === 0) id += '-' + Math.floor(Math.random() * 90 + 10);   // dos pedidos en el mismo segundo

    const it = DriveApp.getFoldersByName('Comprobantes');
    const carpeta = it.hasNext() ? it.next() : DriveApp.createFolder('Comprobantes');
    url = carpeta.createFile(Utilities.newBlob(Utilities.base64Decode(f.data), f.type, id + '_' + String(f.name).slice(0, 80))).getUrl();

    s.appendRow([
      id, Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy-MM-dd HH:mm'), 'Pendiente de activación',
      l.titulo, l.precio, envio, Number(l.precio) + Number(envio || 0),
      c('nombre'), c('cedula'), c('email'), c('telefono'), c('ciudad'), c('direccion'), c('barrio'), c('indicaciones'),
      med ? 'Medellín' : 'Fuera de Medellín', url, false
    ]);
    SpreadsheetApp.flush();
    cache.put(llaveDup, id, 1800);
  } finally {
    lock.releaseLock();
  }

  try { avisar_(id, l, d, med, envio, url); } catch (err) { console.error('No se pudo enviar el correo: ' + err); }
  return { id: id, repetido: false };
}

// Correo para ti (y opcionalmente para el cliente) cuando llega un pedido.
function avisar_(id, l, d, med, envio, url) {
  const money = n => '$' + Number(n).toLocaleString('es-CO');
  const total = med ? money(Number(l.precio) + Number(envio)) : money(l.precio) + ' + envío por confirmar';
  const para = CORREO_AVISOS || Session.getEffectiveUser().getEmail();
  const email = String(d.email || '').trim();
  MailApp.sendEmail({
    to: para,
    replyTo: /^\S+@\S+\.\S+$/.test(email) ? email : undefined,
    subject: 'Nuevo pedido ' + id + ' — ' + l.titulo,
    body: 'Llegó un pedido nuevo (pendiente de activación).\n\n' +
      'Pedido: ' + id + '\nLibro: ' + l.titulo + '\nTotal: ' + total + '\n\n' +
      'Cliente: ' + d.nombre + ' (CC ' + d.cedula + ')\nTeléfono: ' + d.telefono + '\nCorreo: ' + email + '\n' +
      'Entrega: ' + (med ? 'Medellín' : 'Fuera de Medellín') + ' — ' + d.direccion + ', ' + d.barrio + ', ' + d.ciudad + '\n' +
      (d.indicaciones ? 'Indicaciones: ' + d.indicaciones + '\n' : '') +
      '\nComprobante: ' + url + '\n\nRevisa el pago en tu banco antes de activar el pedido en el panel (?admin=1).'
  });
  if (COPIA_AL_CLIENTE && /^\S+@\S+\.\S+$/.test(email)) {
    MailApp.sendEmail({
      to: email, name: 'Libros bajo pedido',
      subject: 'Recibimos tu pedido ' + id,
      body: 'Hola ' + d.nombre + ',\n\nRecibimos tu pedido de "' + l.titulo + '".\nNúmero de pedido: ' + id +
        '\nTotal: ' + total + '\n\nQuedó pendiente de activación: revisaremos tu pago y te confirmaremos por WhatsApp.\n\n¡Gracias!'
    });
  }
}

// ---------- Panel: la contraseña se envía una sola vez y se cambia por una sesión temporal ----------
function entrar(p) {
  const cache = CacheService.getScriptCache();
  const fallos = Number(cache.get('fallos') || 0);
  if (fallos >= 5) throw new Error('Demasiados intentos fallidos. Espera 15 minutos.');
  if (p !== CLAVE) { cache.put('fallos', String(fallos + 1), 900); throw new Error('Contraseña incorrecta'); }
  cache.remove('fallos');
  const tk = Utilities.getUuid();
  cache.put('tk_' + tk, '1', 21600);   // la sesión dura 6 horas
  return tk;
}

function salir(tk) { if (tk) CacheService.getScriptCache().remove('tk_' + tk); }

function ok_(tk) {
  if (!tk || !CacheService.getScriptCache().get('tk_' + tk)) throw new Error('SESION: Tu sesión venció. Vuelve a entrar.');
}

function listar(tk) {
  ok_(tk);
  return hoja_('Pedidos', COLS).getDataRange().getValues().slice(1).map(r => {
    const o = {}; COLS.forEach((c, i) => o[c] = r[i] instanceof Date ? Utilities.formatDate(r[i], 'America/Bogota', 'yyyy-MM-dd HH:mm') : r[i]); return o;
  }).reverse();
}

function actualizar(tk, id, campo, val) {
  ok_(tk);
  if (!['Estado', 'Envío', 'Verificada'].includes(campo)) throw new Error('No permitido');
  if (campo === 'Envío' && val !== '' && isNaN(Number(val))) throw new Error('El envío debe ser un número (sin puntos ni $).');
  if (campo === 'Verificada') val = val === true || val === 'true';
  const s = hoja_('Pedidos', COLS), v = s.getDataRange().getValues();
  const i = v.findIndex(r => String(r[0]) === String(id));
  if (i < 1) throw new Error('Pedido no encontrado');
  s.getRange(i + 1, COLS.indexOf(campo) + 1).setValue(campo === 'Envío' && val !== '' ? Number(val) : val);
  if (campo === 'Envío') s.getRange(i + 1, 7).setValue(Number(v[i][4]) + Number(val || 0));
}
