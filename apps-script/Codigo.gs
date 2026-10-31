// =====================================================================
//  APP DE PEDIDOS COLOMBIA — código (no necesitas editar este archivo).
//  Tus datos (clave, Bre-B, WhatsApp, envíos) están en Config.gs.
// =====================================================================

const LIB = ['ID','Título','Autor','Precio','Portada (URL)','Enlace Amazon'];
const COLS = ['ID','Fecha','Estado','Libro','Precio','Envío','Total','Nombre','Cédula','Email','Teléfono','Ciudad','Dirección','Barrio','Indicaciones','Entrega','Comprobante','Verificada',
              'Cantidad','Historial','Acepta novedades'];
const CLI = ['Cédula','Nombre','Email','Teléfono','Ciudad','Pedidos','Total comprado','Primer pedido','Último pedido','Acepta novedades','Fecha autorización','Código baja','Última novedad'];

const ESTADOS = ['Pago por verificar', 'Pago verificado', 'Pedido en Amazon', 'Recibido de Amazon', 'Listo para entrega', 'Entregado'];
const CANCELADO = 'Cancelado';
const ANTIGUOS = { 'Pendiente de activación': 'Pago por verificar', 'Activo': 'Pago verificado' };
const MENSAJES = {
  'Pago por verificar': 'Recibimos tu pedido. Vamos a verificar tu pago.',
  'Pago verificado': 'Confirmamos tu pago. Ahora compramos tu libro en Amazon.',
  'Pedido en Amazon': 'Ya compramos tu libro en Amazon. Te avisaremos cuando llegue.',
  'Recibido de Amazon': 'Tu libro llegó desde Amazon. Lo estamos preparando para la entrega.',
  'Listo para entrega': 'Tu pedido está listo y va en camino a la dirección que indicaste.',
  'Entregado': '¡Tu pedido fue entregado! Gracias por tu compra. Esperamos que lo disfrutes.',
  'Cancelado': 'Tu pedido fue cancelado. Si tienes preguntas, escríbenos por WhatsApp.'
};
const ENTREGA_MED = 'Medellín y área metropolitana';
const ENTREGA_FUERA = 'Resto de Colombia';
const TZ = 'America/Bogota';

// ---------- Páginas ----------
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.baja) return paginaBaja_(String(p.baja));
  const t = HtmlService.createTemplateFromFile('index');
  t.modo = p.admin ? 'admin' : (p.seguimiento !== undefined || p.pedido ? 'seguimiento' : 'tienda');
  t.libro = String(p.libro || '').replace(/[^\w-]/g, '').slice(0, 40);
  t.pedido = String(p.pedido || '').replace(/[^\w-]/g, '').slice(0, 30);
  return t.evaluate().setTitle(NOMBRE_TIENDA + ' · Pedidos Colombia')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// URL pública de la app (para el enlace de seguimiento).
function urlPublica() { return urlApp_(); }

function urlApp_() { try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; } }
const ahora_ = () => Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
const money_ = n => '$' + Number(n || 0).toLocaleString('es-CO');
const digitos_ = s => String(s || '').replace(/\D/g, '');

// Crea la pestaña si no existe y completa encabezados que falten (sin borrar datos).
function hoja_(n, cab) {
  const ss = SpreadsheetApp.getActive();
  let s = ss.getSheetByName(n);
  if (!s) {
    s = ss.insertSheet(n); s.appendRow(cab); s.setFrozenRows(1);
    if (n === 'Libros') s.appendRow(['ID', 'TÍTULO DEL LIBRO', 'Autor', 50000, '', 'https://www.amazon.com/dp/XXXXXXXXXX']);
    return s;
  }
  const h = s.getRange(1, 1, 1, cab.length).getValues()[0];
  if (cab.some((c, i) => h[i] !== c && !h[i])) s.getRange(1, 1, 1, cab.length).setValues([cab.map((c, i) => h[i] || c)]);
  return s;
}

function filaObj_(cab, r) {
  const o = {};
  cab.forEach((c, i) => o[c] = r[i] instanceof Date ? Utilities.formatDate(r[i], TZ, 'yyyy-MM-dd HH:mm') : r[i]);
  return o;
}

// Evita que un texto escrito por el cliente se convierta en fórmula dentro de la hoja.
function limpio_(v, max) {
  const s = String(v == null ? '' : v).trim().slice(0, max || 300);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

// ---------- Tienda ----------
function datosInicio() {
  const v = hoja_('Libros', LIB).getDataRange().getValues().slice(1).filter(r => r[0] !== '' && r[1]);
  return {
    libros: v.map(r => ({ id: String(r[0]), titulo: r[1], autor: r[2], precio: Number(r[3]) || 0, portada: r[4], amazon: r[5] })),
    whatsapp: WHATSAPP, breb: BREB, envioMed: ENVIO_MEDELLIN, envioFuera: ENVIO_FUERA,
    entregaMed: ENTREGA_MED, entregaFuera: ENTREGA_FUERA, sitio: URL_SITIO, tienda: NOMBRE_TIENDA
  };
}

function crearPedido(d, f) {
  d = d || {};
  const libros = datosInicio().libros;
  let items = Array.isArray(d.items) ? d.items : (d.libroId ? [{ id: d.libroId, cant: 1 }] : []);
  items = items.slice(0, 15).map(it => {
    const l = libros.find(x => x.id === String(it.id));
    const cant = Math.floor(Number(it.cant));
    if (!l) throw new Error('Uno de los libros ya no está disponible. Recarga la página.');
    if (!(cant >= 1 && cant <= 20)) throw new Error('Cantidad no válida (de 1 a 20 por libro).');
    return { l: l, cant: cant };
  });
  if (!items.length) throw new Error('Agrega al menos un libro a tu pedido.');
  if (!f || !f.data || f.data.length > 7e6) throw new Error('Comprobante inválido o muy pesado (máx. 5 MB).');
  const c = k => limpio_(d[k]);
  if (!c('nombre') || !c('cedula') || !c('email') || !c('telefono') || !c('direccion') || !c('ciudad')) throw new Error('Faltan datos obligatorios.');
  if (!d.autorizaDatos) throw new Error('Debes autorizar el tratamiento de tus datos para hacer el pedido.');

  const med = d.entrega === ENTREGA_MED || d.entrega === 'Medellín';
  const envio = med ? ENVIO_MEDELLIN : ENVIO_FUERA;
  const subtotal = items.reduce((a, it) => a + it.l.precio * it.cant, 0);
  const cantidad = items.reduce((a, it) => a + it.cant, 0);
  const detalle = items.map(it => it.cant + ' × ' + it.l.titulo).join('; ');
  const acepta = !!d.novedades;

  // Control de duplicados: misma cédula + mismos libros en los últimos 30 minutos = el mismo pedido.
  const cache = CacheService.getScriptCache();
  const firma = items.map(it => it.l.id + 'x' + it.cant).sort().join(',');
  const llaveDup = 'dup_' + digitos_(d.cedula) + '_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, firma)).slice(0, 12);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let id, url;
  try {
    const previo = cache.get(llaveDup);
    if (previo) return { id: previo, repetido: true };

    const s = hoja_('Pedidos', COLS);
    id = 'P' + Utilities.formatDate(new Date(), TZ, 'yyMMddHHmmss');
    const ultimo = s.getLastRow() > 1 ? String(s.getRange(s.getLastRow(), 1).getValue()) : '';
    if (ultimo.indexOf(id) === 0) id += '-' + Math.floor(Math.random() * 90 + 10);

    const it = DriveApp.getFoldersByName('Comprobantes');
    const carpeta = it.hasNext() ? it.next() : DriveApp.createFolder('Comprobantes');
    url = carpeta.createFile(Utilities.newBlob(Utilities.base64Decode(f.data), f.type, id + '_' + String(f.name).slice(0, 80))).getUrl();

    const fecha = ahora_();
    s.appendRow([
      id, fecha, ESTADOS[0], detalle, subtotal, envio, subtotal + envio,
      c('nombre'), c('cedula'), c('email'), c('telefono'), c('ciudad'), c('direccion'), c('barrio'), c('indicaciones'),
      med ? ENTREGA_MED : ENTREGA_FUERA, url, false,
      cantidad, fecha + ' · ' + ESTADOS[0], acepta
    ]);
    guardarCliente_(d, subtotal + envio, fecha, acepta);
    SpreadsheetApp.flush();
    cache.put(llaveDup, id, 1800);
  } finally {
    lock.releaseLock();
  }

  const ped = { id: id, detalle: detalle, subtotal: subtotal, envio: envio, total: subtotal + envio, med: med, comprobante: url };
  try { avisarNuevo_(ped, d); } catch (err) { console.error('No se pudo enviar el aviso: ' + err); }
  try { if (AVISAR_CLIENTE) correoCliente_(String(d.email).trim(), d.nombre, id, ESTADOS[0], detalle, subtotal + envio); } catch (err) { console.error('No se pudo enviar el correo al cliente: ' + err); }
  return { id: id, repetido: false };
}

// Base de clientes: una fila por persona (por cédula), sin repetir.
function guardarCliente_(d, total, fecha, acepta) {
  const s = hoja_('Clientes', CLI);
  const v = s.getDataRange().getValues();
  const ced = digitos_(d.cedula);
  const i = v.findIndex((r, k) => k > 0 && digitos_(r[0]) === ced && ced);
  const c = k => limpio_(d[k]);
  if (i < 1) {
    s.appendRow([c('cedula'), c('nombre'), c('email'), c('telefono'), c('ciudad'), 1, total, fecha, fecha,
                 acepta, acepta ? fecha : '', Utilities.getUuid().slice(0, 13), '']);
  } else {
    const r = v[i];
    const yaAcepta = r[9] === true || String(r[9]).toUpperCase() === 'TRUE';
    s.getRange(i + 1, 2, 1, 8).setValues([[c('nombre'), c('email'), c('telefono'), c('ciudad'),
      Number(r[5] || 0) + 1, Number(r[6] || 0) + total, r[7] || fecha, fecha]]);
    if (acepta && !yaAcepta) s.getRange(i + 1, 10, 1, 2).setValues([[true, fecha]]);
    if (!r[11]) s.getRange(i + 1, 12).setValue(Utilities.getUuid().slice(0, 13));
  }
}

// ---------- Seguimiento (cliente) ----------
function seguimiento(id, cedula) {
  id = String(id || '').trim().toUpperCase(); const ced = digitos_(cedula);
  if (!id || !ced) throw new Error('Escribe tu número de pedido y tu cédula.');
  const cache = CacheService.getScriptCache(), k = 'seg_' + ced;
  const intentos = Number(cache.get(k) || 0);
  if (intentos > 15) throw new Error('Demasiados intentos. Espera unos minutos.');
  const v = hoja_('Pedidos', COLS).getDataRange().getValues();
  const r = v.find((x, i) => i > 0 && String(x[0]).toUpperCase() === id && digitos_(x[8]) === ced);
  if (!r) { cache.put(k, String(intentos + 1), 600); throw new Error('No encontramos un pedido con ese número y esa cédula.'); }
  const o = filaObj_(COLS, r), estado = ANTIGUOS[o.Estado] || o.Estado;
  return {
    id: o.ID, fecha: o.Fecha, estado: estado, paso: ESTADOS.indexOf(estado), estados: ESTADOS,
    mensaje: MENSAJES[estado] || '', detalle: o.Libro, total: o.Total, entrega: o['Entrega'],
    historial: String(o.Historial || '').split('\n').filter(String)
  };
}

// ---------- Correos ----------
function avisarNuevo_(p, d) {
  const email = String(d.email || '').trim();
  MailApp.sendEmail({
    to: CORREO_AVISOS || Session.getEffectiveUser().getEmail(),
    replyTo: /^\S+@\S+\.\S+$/.test(email) ? email : undefined,
    subject: 'Nuevo pedido ' + p.id + ' — ' + p.detalle.slice(0, 80),
    body: 'Llegó un pedido nuevo (pago por verificar).\n\n' +
      'Pedido: ' + p.id + '\nLibros: ' + p.detalle + '\nSubtotal: ' + money_(p.subtotal) +
      '\nEnvío: ' + (p.envio ? money_(p.envio) : 'gratis') + '\nTotal: ' + money_(p.total) + '\n\n' +
      'Cliente: ' + d.nombre + ' (CC ' + d.cedula + ')\nTeléfono: ' + d.telefono + '\nCorreo: ' + email + '\n' +
      'Entrega: ' + (p.med ? ENTREGA_MED : ENTREGA_FUERA) + ' — ' + d.direccion + ', ' + (d.barrio || '') + ', ' + d.ciudad + '\n' +
      (d.indicaciones ? 'Indicaciones: ' + d.indicaciones + '\n' : '') +
      'Acepta novedades: ' + (d.novedades ? 'sí' : 'no') + '\n\nComprobante: ' + p.comprobante +
      '\n\nRevisa el pago en tu banco y avanza el pedido en el panel: ' + urlApp_() + '?admin=1'
  });
}

function correoCliente_(email, nombre, id, estado, detalle, total) {
  if (!/^\S+@\S+\.\S+$/.test(email)) return;
  const url = urlApp_();
  MailApp.sendEmail({
    to: email, name: NOMBRE_TIENDA,
    subject: 'Tu pedido ' + id + ': ' + estado,
    body: 'Hola ' + nombre + ',\n\n' + (MENSAJES[estado] || ('Tu pedido ahora está en: ' + estado)) + '\n\n' +
      'Pedido: ' + id + '\nLibros: ' + detalle + '\nTotal: ' + money_(total) + '\n\n' +
      (url ? 'Consulta el estado de tu pedido aquí: ' + url + '?pedido=' + encodeURIComponent(id) + '\n\n' : '') +
      '¿Preguntas? Escríbenos por WhatsApp: https://wa.me/' + WHATSAPP + '\n\n' + NOMBRE_TIENDA
  });
}

// ---------- Panel: la contraseña se envía una vez y se cambia por una sesión temporal ----------
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
  const pedidos = hoja_('Pedidos', COLS).getDataRange().getValues().slice(1).filter(r => r[0]).map(r => {
    const o = filaObj_(COLS, r); o.Estado = ANTIGUOS[o.Estado] || o.Estado; return o;
  }).reverse();
  return { pedidos: pedidos, estados: ESTADOS, cancelado: CANCELADO, mensajes: MENSAJES, url: urlApp_(), tienda: NOMBRE_TIENDA };
}

function buscarPedido_(id) {
  const s = hoja_('Pedidos', COLS), v = s.getDataRange().getValues();
  const i = v.findIndex((r, k) => k > 0 && String(r[0]) === String(id));
  if (i < 1) throw new Error('Pedido no encontrado');
  return { s: s, fila: i + 1, r: v[i] };
}

function actualizar(tk, id, campo, val) {
  ok_(tk);
  if (!['Envío', 'Verificada'].includes(campo)) throw new Error('No permitido');
  if (campo === 'Envío' && val !== '' && isNaN(Number(val))) throw new Error('El envío debe ser un número (sin puntos ni $).');
  const p = buscarPedido_(id);
  if (campo === 'Verificada') val = val === true || val === 'true';
  if (campo === 'Envío') { val = Number(val || 0); p.s.getRange(p.fila, 7).setValue(Number(p.r[4]) + val); }
  p.s.getRange(p.fila, COLS.indexOf(campo) + 1).setValue(val);
}

// Avanza (o cambia) el estado, guarda la fecha en el historial y avisa al cliente por correo.
function cambiarEstado(tk, id, estado, avisar) {
  ok_(tk);
  if (ESTADOS.indexOf(estado) < 0 && estado !== CANCELADO) throw new Error('Estado no válido');
  const p = buscarPedido_(id);
  const fecha = ahora_();
  const col = n => COLS.indexOf(n) + 1;
  p.s.getRange(p.fila, col('Estado')).setValue(estado);
  const hist = String(p.r[COLS.indexOf('Historial')] || '');
  p.s.getRange(p.fila, col('Historial')).setValue((hist ? hist + '\n' : '') + fecha + ' · ' + estado);
  if (ESTADOS.indexOf(estado) >= 1) p.s.getRange(p.fila, col('Verificada')).setValue(true);
  let correo = false;
  if (avisar && AVISAR_CLIENTE) {
    try { correoCliente_(String(p.r[9]).trim(), p.r[7], id, estado, p.r[3], p.r[6]); correo = true; }
    catch (err) { console.error(err); }
  }
  return { correo: correo };
}

// ---------- Clientes y novedades ----------
function listarClientes(tk) {
  ok_(tk);
  return hoja_('Clientes', CLI).getDataRange().getValues().slice(1).filter(r => r[0] || r[2]).map(r => filaObj_(CLI, r));
}

// Envía una novedad por correo SOLO a quienes aceptaron. Si se acaba el cupo diario de Gmail,
// vuelve a pulsar "Enviar" otro día con el mismo asunto y mensaje: no se repite a quien ya lo recibió.
function enviarNovedad(tk, asunto, mensaje, soloPrueba) {
  ok_(tk);
  asunto = String(asunto || '').trim().slice(0, 150); mensaje = String(mensaje || '').trim().slice(0, 5000);
  if (!asunto || !mensaje) throw new Error('Escribe el asunto y el mensaje.');
  const url = urlApp_();
  const pie = c => '\n\n—\n' + NOMBRE_TIENDA + '\nVer todos los libros: ' + URL_SITIO +
    '\n\nRecibes este correo porque aceptaste recibir novedades. Para no recibir más: ' + url + '?baja=' + c;
  if (soloPrueba) {
    MailApp.sendEmail({ to: CORREO_AVISOS || Session.getEffectiveUser().getEmail(), name: NOMBRE_TIENDA, subject: '[PRUEBA] ' + asunto, body: mensaje + pie('CODIGO-DE-PRUEBA') });
    return { enviados: 1, pendientes: 0, prueba: true };
  }
  const campana = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, asunto + '|' + mensaje)).slice(0, 10);
  const s = hoja_('Clientes', CLI), v = s.getDataRange().getValues();
  const acepta = r => r[9] === true || String(r[9]).toUpperCase() === 'TRUE';
  const lista = [];
  v.forEach((r, i) => { if (i > 0 && acepta(r) && /^\S+@\S+\.\S+$/.test(String(r[2]).trim()) && r[12] !== campana) lista.push(i); });
  let cupo = MailApp.getRemainingDailyQuota() - 5, enviados = 0;
  for (const i of lista) {
    if (cupo <= 0) break;
    let codigo = v[i][11];
    if (!codigo) { codigo = Utilities.getUuid().slice(0, 13); s.getRange(i + 1, 12).setValue(codigo); }
    MailApp.sendEmail({ to: String(v[i][2]).trim(), name: NOMBRE_TIENDA, subject: asunto,
      body: 'Hola ' + String(v[i][1]).split(' ')[0] + ',\n\n' + mensaje + pie(codigo) });
    s.getRange(i + 1, 13).setValue(campana);
    enviados++; cupo--;
  }
  return { enviados: enviados, pendientes: lista.length - enviados, prueba: false };
}

function contarSuscritos(tk) {
  ok_(tk);
  return hoja_('Clientes', CLI).getDataRange().getValues().slice(1)
    .filter(r => (r[9] === true || String(r[9]).toUpperCase() === 'TRUE') && /^\S+@\S+\.\S+$/.test(String(r[2]).trim())).length;
}

function paginaBaja_(codigo) {
  const s = hoja_('Clientes', CLI), v = s.getDataRange().getValues();
  const i = v.findIndex((r, k) => k > 0 && codigo && String(r[11]) === codigo);
  if (i > 0) s.getRange(i + 1, 10, 1, 2).setValues([[false, 'Baja ' + ahora_()]]);
  const msg = i > 0 ? 'Listo: ya no recibirás más correos de novedades.' : 'Este enlace no es válido o ya fue usado.';
  return HtmlService.createHtmlOutput('<meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:Arial;max-width:520px;margin:60px auto;padding:20px;text-align:center"><h2>' +
    NOMBRE_TIENDA + '</h2><p>' + msg + '</p><p>Tus pedidos y su seguimiento no se ven afectados.</p></div>').setTitle(NOMBRE_TIENDA);
}
