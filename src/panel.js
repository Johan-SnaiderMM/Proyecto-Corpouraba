import { supabase } from './supabase.js';
import { crearMapa, crearCapa, dibujarReportes, enfocar } from './mapa.js';
import { ESTADOS, TIPOS, fecha } from './etiquetas.js';
import { comprimirFoto } from './foto.js';
import { formatearCodigo } from './ticket.js';
import { filtrarReportes, mapaDeAtencion, nombreDelResponsable, puedeCambiarResponsable, textoDelMotivo } from './trabajo.js';

const $ = (id) => document.getElementById(id);

let mapa = null;
let capa = null;
let marcadores = new Map();
let reportes = [];
let visibles = [];
let activoId = null;

// Trabajo en equipo: quién es quién, quién soy yo y qué casos necesitan atención.
let personal = [];
let miId = null;
let soyCoordinador = false;
let atencion = new Map();
let soloAtencion = false;
// Si el SQL de asignación (supabase/asignacion.sql) aún no se ejecutó, el panel sigue funcionando sin esas partes.
let trabajoDisponible = false;

// ---------- Sesión ----------

// Borra todo lo de la sesión anterior (lista, detalle e historial con notas internas) al cerrar sesión.
function limpiarPanel() {
  activoId = null;
  reportes = [];
  visibles = [];
  atencion = new Map();
  soloAtencion = false;
  marcadores = new Map();
  capa?.clearLayers();
  $('detalle').hidden = true;
  for (const id of ['filas', 'd-foto', 'd-historial', 'd-evidencias']) $(id).replaceChildren();
  $('resumen').textContent = '';
}

function mostrarLogin(mensaje) {
  limpiarPanel();
  $('vista-login').hidden = false;
  $('vista-panel').hidden = true;
  $('btn-salir').hidden = true;
  $('usuario').textContent = '';
  if (mensaje) mostrarError('error-login', mensaje);
}

function mostrarError(id, texto) {
  const elemento = $(id);
  elemento.hidden = !texto;
  elemento.textContent = texto ?? '';
}

$('form-login').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  mostrarError('error-login', '');
  const { error } = await supabase.auth.signInWithPassword({
    email: $('correo').value.trim(),
    password: $('clave').value,
  });
  if (error) {
    mostrarError('error-login', 'Correo o contraseña incorrectos.');
    return;
  }
  $('clave').value = '';
  await entrar();
});

$('btn-salir').addEventListener('click', () => supabase.auth.signOut());

async function entrar() {
  // Cada funcionario puede leer su propia fila de "staff"; si no existe, no tiene permiso.
  const { data: perfil, error } = await supabase.from('staff').select('full_name').maybeSingle();
  if (error || !perfil) {
    await supabase.auth.signOut();
    mostrarLogin('Su usuario no tiene permiso de funcionario.');
    return;
  }

  $('vista-login').hidden = true;
  $('vista-panel').hidden = false;
  $('btn-salir').hidden = false;
  $('usuario').textContent = perfil.full_name;
  await cargarPersonal();

  // El mapa se crea ya visible, para que Leaflet calcule bien su tamaño.
  if (!mapa) {
    mapa = crearMapa('mapa');
    capa = crearCapa(mapa);
  }
  mapa.invalidateSize();
  await cargarReportes();
}

// ---------- Personal y casos que necesitan atención ----------

async function cargarPersonal() {
  const { data: sesion } = await supabase.auth.getSession();
  miId = sesion.session?.user?.id ?? null;

  const { data, error } = await supabase.rpc('list_staff');
  trabajoDisponible = !error && Array.isArray(data);
  personal = trabajoDisponible ? data : [];
  soyCoordinador = Boolean(personal.find((p) => p.user_id === miId)?.is_admin);

  // Sin el SQL de asignación no hay responsables: se esconden sus filtros, botones y columna en vez de mostrar datos falsos.
  $('vista-panel').classList.toggle('sin-trabajo', !trabajoDisponible);
  $('filtro-responsable').hidden = !trabajoDisponible;
  $('btn-atencion').hidden = !trabajoDisponible;
  $('bloque-asignacion').hidden = !trabajoDisponible;

  // Una opción por persona, además de "Todos", "Mis casos" y "Sin responsable".
  const selector = $('f-responsable');
  selector.querySelectorAll('option[data-persona]').forEach((o) => o.remove());
  const asignar = $('r-asignar');
  asignar.replaceChildren(new Option('Elija una persona', ''));
  for (const persona of personal) {
    const opcion = new Option(persona.user_id === miId ? `${persona.full_name} (usted)` : persona.full_name, persona.user_id);
    opcion.dataset.persona = 'si';
    selector.append(opcion.cloneNode(true));
    asignar.append(new Option(persona.user_id === miId ? `${persona.full_name} (usted)` : persona.full_name, persona.user_id));
  }
}

async function cargarAtencion() {
  if (!trabajoDisponible) {
    atencion = new Map();
    return;
  }
  const { data, error } = await supabase.rpc('report_attention');
  if (error) console.error(error);
  atencion = mapaDeAtencion(error ? [] : data);
}

// ---------- Lista, mapa y filtros ----------

async function cargarReportes() {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error(error);
    $('resumen').textContent = 'No se pudieron cargar los reportes.';
    return;
  }
  reportes = data;
  await cargarAtencion();
  aplicarFiltros();
}

function aplicarFiltros() {
  visibles = filtrarReportes(
    reportes,
    {
      tipo: $('f-tipo').value,
      estado: $('f-estado').value,
      desde: $('f-desde').value,
      hasta: $('f-hasta').value,
      responsable: trabajoDisponible ? $('f-responsable').value : '',
      soloAtencion,
    },
    { miId, atencion }
  );

  dibujarTabla();
  marcadores = dibujarReportes(capa, visibles, elegir);
  resumir();
}

function resumir() {
  const partes = Object.entries(ESTADOS).map(([clave, nombre]) => {
    const cantidad = visibles.filter((r) => r.status === clave).length;
    return `${nombre}: ${cantidad}`;
  });
  const pendientes = trabajoDisponible ? ` · ${atencion.size} requieren atención` : '';
  $('resumen').textContent = `${visibles.length} de ${reportes.length} reportes · ${partes.join(' · ')}${pendientes}`;

  const boton = $('btn-atencion');
  boton.textContent = `Requieren atención (${atencion.size})`;
  boton.setAttribute('aria-pressed', String(soloAtencion));
}

function dibujarTabla() {
  const cuerpo = $('filas');
  cuerpo.replaceChildren();
  $('vacio').hidden = visibles.length > 0;

  for (const r of visibles) {
    const fila = document.createElement('tr');
    fila.dataset.id = r.id;
    fila.tabIndex = 0;
    if (r.id === activoId) {
      fila.classList.add('activa');
      fila.setAttribute('aria-current', 'true');
    }

    const celdas = [fecha(r.created_at), TIPOS[r.type], ESTADOS[r.status], nombreDelResponsable(r, personal, miId), formatearCodigo(r.tracking_code)];
    celdas.forEach((texto, i) => {
      const celda = document.createElement('td');
      celda.textContent = texto;
      // Junto al estado se escribe, con palabras, por qué el caso necesita atención (el color solo no basta).
      const aviso = atencion.get(r.id);
      if (i === 2 && aviso) celda.append(etiquetaDeAtencion(aviso));
      fila.append(celda);
    });

    fila.addEventListener('click', () => elegir(r.id));
    fila.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        elegir(r.id);
      }
    });
    cuerpo.append(fila);
  }
}

// El motivo más importante del caso, como una etiqueta de texto.
function etiquetaDeAtencion(aviso) {
  const motivo = ['reabierto', 'sin_atender', 'estancado'].find((m) => aviso.motivos.includes(m)) ?? aviso.motivos[0];
  const etiqueta = document.createElement('span');
  etiqueta.className = `etiqueta-atencion etiqueta-${motivo}`;
  etiqueta.textContent = textoDelMotivo(motivo, aviso.dias);
  return etiqueta;
}

['f-tipo', 'f-estado', 'f-responsable', 'f-desde', 'f-hasta'].forEach((id) => $(id).addEventListener('change', aplicarFiltros));

$('btn-atencion').addEventListener('click', () => {
  soloAtencion = !soloAtencion;
  aplicarFiltros();
});

$('btn-limpiar').addEventListener('click', () => {
  ['f-tipo', 'f-estado', 'f-responsable', 'f-desde', 'f-hasta'].forEach((id) => ($(id).value = ''));
  soloAtencion = false;
  aplicarFiltros();
});

// ---------- Detalle y cambio de estado ----------

async function elegir(id) {
  activoId = id;
  const reporte = reportes.find((r) => r.id === id);
  if (!reporte) return;

  document.querySelectorAll('#filas tr').forEach((fila) => {
    const activa = fila.dataset.id === id;
    fila.classList.toggle('activa', activa);
    if (activa) fila.setAttribute('aria-current', 'true');
    else fila.removeAttribute('aria-current');
  });
  restablecerBotones();
  enfocar(mapa, reporte.lat, reporte.lng);
  marcadores.get(id)?.openPopup();

  $('d-codigo').textContent = formatearCodigo(reporte.tracking_code);
  $('d-tipo').textContent = TIPOS[reporte.type];
  $('d-estado').textContent = ESTADOS[reporte.status];
  $('d-creado').textContent = fecha(reporte.created_at);
  $('d-ubicacion').textContent = `${reporte.lat.toFixed(5)}, ${reporte.lng.toFixed(5)}`;
  $('d-descripcion').textContent = reporte.description;
  mostrarAsignacion(reporte);
  $('n-estado').value = reporte.status;
  $('n-nota').value = '';
  $('n-publica').value = '';
  mostrarError('error-estado', '');
  $('d-foto').replaceChildren();
  $('d-historial').replaceChildren();
  $('d-evidencias').replaceChildren();
  $('d-sin-evidencias').hidden = true;
  $('a-descripcion').value = '';
  $('a-foto').value = '';
  mostrarError('error-accion', '');
  $('detalle').hidden = false;
  const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('detalle').scrollIntoView({ behavior: sinMovimiento ? 'auto' : 'smooth', block: 'nearest' });

  const [foto, historial, evidencias] = await Promise.all([
    cargarFoto(reporte),
    cargarHistorial(reporte),
    cargarEvidencias(reporte),
  ]);
  if (activoId !== id) return; // el funcionario ya eligió otro reporte
  if (foto) $('d-foto').append(foto);

  // Si una consulta falla se avisa: nunca se muestra "sin evidencia" cuando en realidad no se pudo cargar.
  $('d-historial').replaceChildren(...(historial ?? [itemAviso('No se pudo cargar el historial.')]));
  $('d-evidencias').replaceChildren(...(evidencias ?? [itemAviso('No se pudo cargar la evidencia.')]));
  $('d-sin-evidencias').hidden = evidencias === null || evidencias.length > 0;
}

// ---------- Responsable del caso ----------

// Muestra quién tiene el caso, por qué necesita atención y qué botones puede usar esta persona.
// Las mismas reglas las impone la base de datos; aquí solo se evita ofrecer lo que va a fallar.
function mostrarAsignacion(reporte) {
  const aviso = atencion.get(reporte.id);
  $('d-atencion').hidden = !trabajoDisponible || !aviso;
  $('d-motivos').replaceChildren(
    ...(aviso?.motivos ?? []).map((motivo) => {
      const item = document.createElement('li');
      item.textContent = textoDelMotivo(motivo, aviso.dias);
      return item;
    })
  );
  if (!trabajoDisponible) return;

  const puede = puedeCambiarResponsable(reporte, miId, soyCoordinador);
  const mio = reporte.assigned_to === miId;
  $('d-responsable').textContent = nombreDelResponsable(reporte, personal, miId);
  $('btn-tomar').hidden = mio;
  $('btn-soltar').hidden = !reporte.assigned_to;
  for (const id of ['btn-tomar', 'btn-soltar', 'r-asignar', 'btn-asignar']) $(id).disabled = !puede;
  $('r-asignar').value = '';

  const aviso2 = $('aviso-asignacion');
  aviso2.hidden = puede;
  aviso2.textContent = puede ? '' : `Lo atiende ${nombreDelResponsable(reporte, personal, miId)}. Solo esa persona o un coordinador pueden cambiarlo.`;
  mostrarError('error-asignacion', '');
}

let asignando = false;

// destino: el id de la persona, o null para soltar el caso.
async function cambiarResponsable(destino) {
  const id = activoId;
  if (!id || asignando) return;
  asignando = true;
  mostrarError('error-asignacion', '');
  const botones = ['btn-tomar', 'btn-soltar', 'btn-asignar'].map($);
  botones.forEach((b) => (b.disabled = true));
  try {
    const { error } = await supabase.rpc('assign_report', { p_report: id, p_to: destino });
    if (error) {
      console.error(error);
      const otra = /otra persona/.test(error.message ?? '');
      if (activoId === id) {
        mostrarError('error-asignacion', otra ? 'Ese caso lo atiende otra persona. Actualice la lista.' : 'No se pudo cambiar el responsable.');
      }
    }
    // Se recarga la lista (y con ella los casos pendientes) y se repinta el responsable y el historial sin perder lo
    // que la persona estaba escribiendo en los formularios del caso.
    await cargarReportes();
    const reporte = reportes.find((r) => r.id === id);
    if (activoId === id && reporte) {
      mostrarAsignacion(reporte);
      const historial = await cargarHistorial(reporte);
      if (activoId === id) $('d-historial').replaceChildren(...(historial ?? [itemAviso('No se pudo cargar el historial.')]));
    }
  } finally {
    asignando = false;
    const reporte = reportes.find((r) => r.id === activoId);
    if (reporte) mostrarAsignacion(reporte);
  }
}

$('btn-tomar').addEventListener('click', () => cambiarResponsable(miId));
$('btn-soltar').addEventListener('click', () => cambiarResponsable(null));
$('btn-asignar').addEventListener('click', () => {
  const destino = $('r-asignar').value;
  if (!destino) {
    mostrarError('error-asignacion', 'Elija a quién asignar el caso.');
    return;
  }
  cambiarResponsable(destino);
});

function itemAvisoTexto(texto) {
  const parrafo = document.createElement('p');
  parrafo.className = 'ayuda';
  parrafo.textContent = texto;
  return parrafo;
}

function itemAviso(texto) {
  const item = document.createElement('li');
  item.className = 'ayuda';
  item.textContent = texto;
  return item;
}

// Cada formulario bloquea su botón mientras guarda. Al cambiar de reporte se liberan los botones.
function restablecerBotones() {
  $('form-estado').querySelector('button[type="submit"]').disabled = false;
  const accion = $('btn-accion');
  accion.disabled = false;
  accion.textContent = 'Registrar acción';
}

async function cargarFoto(reporte) {
  if (!reporte.photo_path) return null;
  const { data, error } = await supabase.storage.from('report-photos').createSignedUrl(reporte.photo_path, 3600);
  if (error) {
    const aviso = document.createElement('p');
    aviso.className = 'ayuda';
    aviso.textContent = 'No se pudo cargar la foto.';
    return aviso;
  }
  const imagen = document.createElement('img');
  imagen.src = data.signedUrl;
  imagen.alt = 'Foto del reporte';
  return imagen;
}

async function cargarHistorial(reporte) {
  const { data, error } = await supabase
    .from('report_events')
    .select('status, note, kind, created_at')
    .eq('report_id', reporte.id)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) return null;
  return data.map((evento) => {
    const item = document.createElement('li');
    if (evento.kind === 'asignacion') {
      // Cambios de responsable: se muestran como tales, sin repetir el estado del caso.
      item.textContent = `${fecha(evento.created_at)} · Responsable — ${evento.note}`;
      return item;
    }
    const quien = evento.kind === 'validacion' ? 'Ciudadano · ' : '';
    item.textContent = `${fecha(evento.created_at)} · ${quien}${ESTADOS[evento.status]}${evento.note ? ` — ${evento.note}` : ''}`;
    return item;
  });
}

// Evidencia que la Corporación ya registró. El bucket es de lectura pública, así que basta la URL pública.
async function cargarEvidencias(reporte) {
  const { data, error } = await supabase
    .from('report_evidence')
    .select('storage_path, caption, created_at')
    .eq('report_id', reporte.id)
    .order('created_at', { ascending: true });
  if (error) return null;
  return data.map((evidencia) => {
    const item = document.createElement('li');
    const imagen = document.createElement('img');
    imagen.src = supabase.storage.from('report-evidence').getPublicUrl(evidencia.storage_path).data.publicUrl;
    imagen.alt = `Evidencia: ${evidencia.caption}`;
    imagen.loading = 'lazy';
    imagen.addEventListener('error', () => imagen.replaceWith(itemAvisoTexto('Foto no disponible.')));
    const texto = document.createElement('p');
    texto.textContent = `${fecha(evidencia.created_at)} · ${evidencia.caption}`;
    item.append(imagen, texto);
    return item;
  });
}

$('form-estado').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  mostrarError('error-estado', '');
  if (!activoId) return;

  // Se toma el reporte ANTES de esperar: si la persona cambia de reporte mientras se guarda, no se mezcla.
  const id = activoId;
  const boton = $('form-estado').querySelector('button[type="submit"]');
  if (boton.disabled) return; // evita el doble clic
  boton.disabled = true;
  try {
    const { error } = await supabase.rpc('change_status', {
      p_report: id,
      p_status: $('n-estado').value,
      p_note: $('n-nota').value.trim() || null,
      p_public_note: $('n-publica').value.trim() || null,
    });
    if (error) {
      console.error(error);
      if (activoId === id) mostrarError('error-estado', 'No se pudo guardar el cambio.');
      return;
    }

    await cargarReportes();
    if (activoId === id) await elegir(id);
  } finally {
    if (activoId === id) boton.disabled = false;
  }
});

$('form-accion').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  mostrarError('error-accion', '');
  if (!activoId) return;

  const descripcion = $('a-descripcion').value.trim();
  const archivo = $('a-foto').files[0] ?? null;
  if (descripcion.length < 3) {
    mostrarError('error-accion', 'Describa la acción (mínimo 3 caracteres).');
    return;
  }
  if (!archivo || !archivo.type.startsWith('image/')) {
    mostrarError('error-accion', 'Elija una foto de evidencia.');
    return;
  }

  const id = activoId;
  const boton = $('btn-accion');
  boton.disabled = true;
  boton.textContent = 'Registrando…';
  let ruta = null;
  try {
    // Al recomprimir la foto se borran sus datos EXIF (por ejemplo, la ubicación del celular).
    const blob = await comprimirFoto(archivo);
    ruta = `${id}/${crypto.randomUUID()}.jpg`;
    const { error: errorSubida } = await supabase.storage
      .from('report-evidence')
      .upload(ruta, blob, { contentType: 'image/jpeg' });
    if (errorSubida) {
      ruta = null; // no llegó a subirse
      throw errorSubida;
    }

    const { error } = await supabase.rpc('add_evidence', { p_report: id, p_path: ruta, p_caption: descripcion });
    if (error) throw error;
  } catch (error) {
    console.error(error);
    // Si la foto llegó a subirse pero no se pudo registrar, se borra para no dejar archivos sueltos.
    if (ruta) await supabase.storage.from('report-evidence').remove([ruta]).catch(() => {});
    if (activoId === id) mostrarError('error-accion', 'No se pudo registrar la acción. Inténtelo de nuevo.');
    return;
  } finally {
    if (activoId === id) {
      boton.disabled = false;
      boton.textContent = 'Registrar acción';
    }
  }

  if (activoId === id) await elegir(id);
});

// ---------- Exportar a CSV ----------

// Las celdas que empiezan con = + - @ se prefijan con una comilla para que Excel no las ejecute como fórmulas.
function celdaCsv(valor) {
  let texto = String(valor ?? '');
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return `"${texto.replaceAll('"', '""')}"`;
}

$('btn-csv').addEventListener('click', () => {
  const encabezado = ['codigo', 'tipo', 'estado', ...(trabajoDisponible ? ['responsable'] : []), 'fecha', 'lat', 'lng', 'descripcion'];
  const filas = visibles.map((r) =>
    [
      r.tracking_code,
      TIPOS[r.type],
      ESTADOS[r.status],
      ...(trabajoDisponible ? [nombreDelResponsable(r, personal, miId)] : []),
      r.created_at,
      r.lat,
      r.lng,
      r.description,
    ]
      .map(celdaCsv)
      .join(',')
  );
  const contenido = `﻿${[encabezado.join(','), ...filas].join('\r\n')}`;

  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
  enlace.download = 'reportes.csv';
  enlace.click();
  URL.revokeObjectURL(enlace.href);
});

// ---------- Arranque ----------

supabase.auth.onAuthStateChange((evento) => {
  if (evento === 'SIGNED_OUT') mostrarLogin();
});

async function arrancar() {
  const { data } = await supabase.auth.getSession();
  if (data.session) await entrar();
  else mostrarLogin();
}

arrancar();
