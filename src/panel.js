import { supabase } from './supabase.js';
import { crearMapa, crearCapa, dibujarReportes, enfocar } from './mapa.js';
import { ESTADOS, TIPOS, fecha } from './etiquetas.js';

const $ = (id) => document.getElementById(id);

let mapa = null;
let capa = null;
let marcadores = new Map();
let reportes = [];
let visibles = [];
let activoId = null;

// ---------- Sesión ----------

function mostrarLogin(mensaje) {
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
    mostrarLogin('Tu usuario no tiene permiso de funcionario.');
    return;
  }

  $('vista-login').hidden = true;
  $('vista-panel').hidden = false;
  $('btn-salir').hidden = false;
  $('usuario').textContent = perfil.full_name;

  // El mapa se crea ya visible, para que Leaflet calcule bien su tamaño.
  if (!mapa) {
    mapa = crearMapa('mapa');
    capa = crearCapa(mapa);
  }
  mapa.invalidateSize();
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
  marcadores = dibujarReportes(capa, visibles, elegir);
  resumir();
}

function resumir() {
  const partes = Object.entries(ESTADOS).map(([clave, nombre]) => {
    const cantidad = visibles.filter((r) => r.status === clave).length;
    return `${nombre}: ${cantidad}`;
  });
  $('resumen').textContent = `${visibles.length} de ${reportes.length} reportes · ${partes.join(' · ')}`;
}

function dibujarTabla() {
  const cuerpo = $('filas');
  cuerpo.replaceChildren();
  $('vacio').hidden = visibles.length > 0;

  for (const r of visibles) {
    const fila = document.createElement('tr');
    fila.dataset.id = r.id;
    fila.tabIndex = 0;
    if (r.id === activoId) fila.classList.add('activa');

    for (const texto of [fecha(r.created_at), TIPOS[r.type], ESTADOS[r.status], r.tracking_code]) {
      const celda = document.createElement('td');
      celda.textContent = texto;
      fila.append(celda);
    }

    fila.addEventListener('click', () => elegir(r.id));
    fila.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') elegir(r.id);
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

async function elegir(id) {
  activoId = id;
  const reporte = reportes.find((r) => r.id === id);
  if (!reporte) return;

  document.querySelectorAll('#filas tr').forEach((fila) => {
    fila.classList.toggle('activa', fila.dataset.id === id);
  });
  enfocar(mapa, reporte.lat, reporte.lng);
  marcadores.get(id)?.openPopup();

  $('d-codigo').textContent = reporte.tracking_code;
  $('d-tipo').textContent = TIPOS[reporte.type];
  $('d-estado').textContent = ESTADOS[reporte.status];
  $('d-creado').textContent = fecha(reporte.created_at);
  $('d-ubicacion').textContent = `${reporte.lat.toFixed(5)}, ${reporte.lng.toFixed(5)}`;
  $('d-descripcion').textContent = reporte.description;
  $('n-estado').value = reporte.status;
  $('n-nota').value = '';
  $('n-publica').value = '';
  mostrarError('error-estado', '');
  $('d-foto').replaceChildren();
  $('d-historial').replaceChildren();
  $('detalle').hidden = false;
  $('detalle').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const [foto, historial] = await Promise.all([cargarFoto(reporte), cargarHistorial(reporte)]);
  if (activoId !== id) return; // el funcionario ya eligió otro reporte
  if (foto) $('d-foto').append(foto);
  $('d-historial').replaceChildren(...historial);
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
    .select('status, note, created_at')
    .eq('report_id', reporte.id)
    .order('created_at', { ascending: true });
  if (error) return [];
  return data.map((evento) => {
    const item = document.createElement('li');
    item.textContent = `${fecha(evento.created_at)} · ${ESTADOS[evento.status]}${evento.note ? ` — ${evento.note}` : ''}`;
    return item;
  });
}

$('form-estado').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  mostrarError('error-estado', '');
  if (!activoId) return;

  const { error } = await supabase.rpc('change_status', {
    p_report: activoId,
    p_status: $('n-estado').value,
    p_note: $('n-nota').value.trim() || null,
    p_public_note: $('n-publica').value.trim() || null,
  });
  if (error) {
    console.error(error);
    mostrarError('error-estado', 'No se pudo guardar el cambio.');
    return;
  }

  const id = activoId;
  await cargarReportes();
  await elegir(id);
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
