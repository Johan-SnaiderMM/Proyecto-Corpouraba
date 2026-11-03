import { supabase, MODO_DEMO } from './supabase.js';
import { montarBannerDemo } from './banner.js';
import { CORREO_DEMO, CLAVE_DEMO } from './demo.js';
import { crearMapa, crearCapa, dibujarReportes, enfocar, ajustar } from './mapa.js';
import { ESTADOS, TIPOS, fecha } from './etiquetas.js';
import { comprimirFoto } from './foto.js';
import { formatearCodigo } from './ticket.js';
import { crearPestanas } from './pestanas.js';

montarBannerDemo();

const $ = (id) => document.getElementById(id);

let mapa = null;
let capa = null;
let marcadores = new Map();
let reportes = [];
let visibles = [];
let activoId = null;
let mapaEncuadrado = false;

// ---------- Secciones ----------

// Reportes (lista) y Mapa comparten el resumen y los filtros. "Detalle" aparece al elegir un reporte y tiene
// sus propias pestañas: Resumen, Evidencia y Cambiar estado.
const secciones = crearPestanas($('pestanas'), (id) => {
  $('bloque-filtros').hidden = id === 't-detalle';
  if (id === 't-mapa') mostrarMapa();
});
const subsecciones = crearPestanas($('subpestanas'));
secciones.mostrar('t-lista');
subsecciones.mostrar('st-resumen');

// El mapa se crea la primera vez que se abre la sección: Leaflet necesita medir un contenedor visible.
function mostrarMapa() {
  if (!mapa) {
    mapa = crearMapa('mapa');
    capa = crearCapa(mapa);
  }
  mapa.invalidateSize();
  marcadores = dibujarReportes(capa, visibles, elegir);
  if (!mapaEncuadrado && reportes.length > 0) {
    ajustar(mapa, reportes);
    mapaEncuadrado = true;
  }
}

$('btn-volver').addEventListener('click', () => secciones.mostrar('t-lista', { foco: true }));

// ---------- Tarjetas por estado (también sirven de filtro) ----------

for (const [clave, nombre] of Object.entries(ESTADOS)) {
  const tarjeta = document.createElement('button');
  tarjeta.type = 'button';
  tarjeta.dataset.estado = clave;
  tarjeta.setAttribute('aria-pressed', 'false');

  const cifra = document.createElement('span');
  cifra.className = 'cifra';
  cifra.textContent = '0';
  const etiqueta = document.createElement('span');
  etiqueta.className = 'nombre';
  etiqueta.textContent = nombre;
  tarjeta.append(cifra, etiqueta);

  tarjeta.addEventListener('click', () => {
    $('f-estado').value = $('f-estado').value === clave ? '' : clave;
    aplicarFiltros();
  });
  $('tarjetas-estado').append(tarjeta);
}

function actualizarTarjetas() {
  for (const tarjeta of $('tarjetas-estado').children) {
    const clave = tarjeta.dataset.estado;
    tarjeta.querySelector('.cifra').textContent = String(reportes.filter((r) => r.status === clave).length);
    tarjeta.setAttribute('aria-pressed', String($('f-estado').value === clave));
  }
}

// ---------- Sesión ----------

// Borra todo lo de la sesión anterior (lista, detalle e historial con notas internas) al cerrar sesión.
function limpiarPanel() {
  activoId = null;
  reportes = [];
  visibles = [];
  marcadores = new Map();
  capa?.clearLayers();
  $('detalle').hidden = true;
  for (const id of ['filas', 'd-foto', 'd-historial', 'd-evidencias']) $(id).replaceChildren();
  $('resumen').textContent = '';
  mapaEncuadrado = false;
  actualizarTarjetas();
  secciones.mostrarPestana('t-detalle', false);
  secciones.mostrar('t-lista');
  subsecciones.mostrar('st-resumen');
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

// En la demostración el formulario ya viene lleno y hay un botón para entrar sin escribir nada.
if (MODO_DEMO) {
  $('correo').value = CORREO_DEMO;
  $('clave').value = CLAVE_DEMO;
  $('pista-demo').hidden = false;
  $('btn-demo').addEventListener('click', () => $('form-login').requestSubmit());

  // Si se envía un reporte o una validación desde otra pestaña, la lista se actualiza sola.
  window.addEventListener('storage', () => {
    if (!$('vista-panel').hidden) cargarReportes();
  });
}

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

  await cargarReportes();
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
  aplicarFiltros();
}

function aplicarFiltros() {
  const tipo = $('f-tipo').value;
  const estado = $('f-estado').value;
  const desde = $('f-desde').value ? new Date(`${$('f-desde').value}T00:00:00`) : null;
  const hasta = $('f-hasta').value ? new Date(`${$('f-hasta').value}T23:59:59.999`) : null;

  visibles = reportes.filter((r) => {
    const creado = new Date(r.created_at);
    return (
      (!tipo || r.type === tipo) &&
      (!estado || r.status === estado) &&
      (!desde || creado >= desde) &&
      (!hasta || creado <= hasta)
    );
  });

  dibujarTabla();
  if (capa) marcadores = dibujarReportes(capa, visibles, elegir);
  resumir();
}

function resumir() {
  actualizarTarjetas();
  $('resumen').textContent =
    visibles.length === reportes.length
      ? `${reportes.length} reportes. Toque uno en la lista o en el mapa para ver su detalle.`
      : `Mostrando ${visibles.length} de ${reportes.length} reportes.`;
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

    for (const texto of [fecha(r.created_at), TIPOS[r.type], ESTADOS[r.status], formatearCodigo(r.tracking_code)]) {
      const celda = document.createElement('td');
      celda.textContent = texto;
      fila.append(celda);
    }

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

['f-tipo', 'f-estado', 'f-desde', 'f-hasta'].forEach((id) => $(id).addEventListener('change', aplicarFiltros));

$('btn-limpiar').addEventListener('click', () => {
  ['f-tipo', 'f-estado', 'f-desde', 'f-hasta'].forEach((id) => ($(id).value = ''));
  aplicarFiltros();
});

// ---------- Detalle y cambio de estado ----------

// Abre el detalle de un reporte. Con { mantener: true } (después de guardar un cambio o una acción) se queda en la
// misma pestaña del detalle, para que la persona vea el aviso de que se guardó.
async function elegir(id, { mantener = false } = {}) {
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
  if (mapa) {
    enfocar(mapa, reporte.lat, reporte.lng);
    marcadores.get(id)?.openPopup();
  }

  $('d-titulo').textContent = `Reporte ${formatearCodigo(reporte.tracking_code)}`;
  $('d-codigo').textContent = formatearCodigo(reporte.tracking_code);
  $('d-tipo').textContent = TIPOS[reporte.type];
  $('d-estado').textContent = ESTADOS[reporte.status];
  $('d-creado').textContent = fecha(reporte.created_at);
  $('d-ubicacion').textContent = `${reporte.lat.toFixed(5)}, ${reporte.lng.toFixed(5)}`;
  $('d-descripcion').textContent = reporte.description;
  $('n-estado').value = reporte.status;
  $('n-nota').value = '';
  $('n-publica').value = '';
  mostrarError('error-estado', '');
  $('ok-estado').hidden = true;
  $('d-foto').replaceChildren();
  $('d-historial').replaceChildren();
  $('d-evidencias').replaceChildren();
  $('d-sin-evidencias').hidden = true;
  $('n-evidencias').textContent = '';
  $('a-descripcion').value = '';
  $('a-foto').value = '';
  mostrarError('error-accion', '');
  $('detalle').hidden = false;
  secciones.mostrarPestana('t-detalle', true);
  if (!mantener) {
    subsecciones.mostrar('st-resumen');
    secciones.mostrar('t-detalle');
    const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;
    $('pestanas').scrollIntoView({ behavior: sinMovimiento ? 'auto' : 'smooth', block: 'start' });
  }

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
  $('n-evidencias').textContent = evidencias?.length ? ` (${evidencias.length})` : '';
}

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
    if (activoId === id) {
      await elegir(id, { mantener: true });
      $('ok-estado').textContent = 'Cambio guardado. Quien tenga el ticket ya lo ve en su seguimiento.';
      $('ok-estado').hidden = false;
    }
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

  if (activoId === id) await elegir(id, { mantener: true });
});

// ---------- Exportar a CSV ----------

// Las celdas que empiezan con = + - @ se prefijan con una comilla para que Excel no las ejecute como fórmulas.
function celdaCsv(valor) {
  let texto = String(valor ?? '');
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return `"${texto.replaceAll('"', '""')}"`;
}

$('btn-csv').addEventListener('click', () => {
  const encabezado = ['codigo', 'tipo', 'estado', 'fecha', 'lat', 'lng', 'descripcion'];
  const filas = visibles.map((r) =>
    [r.tracking_code, TIPOS[r.type], ESTADOS[r.status], r.created_at, r.lat, r.lng, r.description]
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
