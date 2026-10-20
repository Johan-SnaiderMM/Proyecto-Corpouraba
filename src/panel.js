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

// Una consulta de PostgREST devuelve a lo sumo 1000 filas sin avisar: la lista se pide por páginas, con un tope.
const TAMANO_PAGINA = 1000;
const MAXIMO_REPORTES = 5000;
// La tabla y el mapa dibujan a lo sumo estas filas; el CSV y los conteos usan todas las filtradas.
const MAXIMO_FILAS = 300;
let listaIncompleta = false;
let atencionIncompleta = false;

// Trabajo en equipo: quién es quién, quién soy yo y qué casos necesitan atención.
let personal = [];
let miId = null;
let soyCoordinador = false;
let atencion = new Map();
let soloAtencion = false;
// Si el SQL de asignación (supabase/asignacion.sql) aún no se ejecutó, el panel sigue funcionando sin esas partes.
let trabajoDisponible = false;
// 'ok', 'no-instalado' (falta el SQL) o 'error' (falló la consulta: se puede reintentar).
let estadoTrabajo = 'no-instalado';
// null si report_attention falló: entonces el conteo es "?" y no se puede filtrar por atención.
let atencionDisponible = true;

// ---------- Sesión ----------

// Borra todo lo de la sesión anterior (lista, detalle e historial con notas internas) al cerrar sesión.
function limpiarPanel() {
  activoId = null;
  reportes = [];
  visibles = [];
  atencion = new Map();
  atencionDisponible = true;
  soloAtencion = false;
  listaIncompleta = false;
  atencionIncompleta = false;
  personal = [];
  miId = null;
  soyCoordinador = false;
  trabajoDisponible = false;
  estadoTrabajo = 'no-instalado';
  marcadores = new Map();
  capa?.clearLayers();
  $('detalle').hidden = true;
  for (const id of ['filas', 'd-foto', 'd-historial', 'd-evidencias', 'd-motivos']) $(id).replaceChildren();
  $('resumen').textContent = '';
  // Lo que ve la siguiente persona que inicie sesión no debe arrastrar nada de la anterior.
  $('f-responsable').querySelectorAll('option[data-persona]').forEach((o) => o.remove());
  $('r-asignar').replaceChildren();
  for (const id of ['f-tipo', 'f-estado', 'f-responsable', 'f-desde', 'f-hasta']) $(id).value = '';
  $('d-responsable').textContent = '';
  $('estado-asignacion').textContent = '';
  const boton = $('btn-atencion');
  boton.textContent = 'Requieren atención (0)';
  boton.setAttribute('aria-pressed', 'false');
  for (const id of ['error-asignacion', 'aviso-asignacion', 'aviso-lista']) mostrarError(id, '');
  // Este aviso lleva dentro su texto y un botón: se esconde sin vaciar el contenedor.
  $('aviso-trabajo').hidden = true;
  $('texto-aviso-trabajo').textContent = '';
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

// Que la función no exista (falta correr asignacion.sql) es distinto de que la consulta falle por un momento:
// lo primero esconde esas partes del panel; lo segundo avisa y deja reintentar.
function funcionNoExiste(error, status) {
  return status === 404 || ['PGRST202', '42883'].includes(error?.code);
}

async function cargarPersonal() {
  const { data: sesion } = await supabase.auth.getSession();
  miId = sesion.session?.user?.id ?? null;

  const { data, error, status } = await supabase.rpc('list_staff');
  if (error) {
    // Es lo esperado antes de correr asignacion.sql; en cualquier otro caso sí es un fallo que conviene ver.
    if (!funcionNoExiste(error, status)) console.error(error);
    estadoTrabajo = funcionNoExiste(error, status) ? 'no-instalado' : 'error';
  } else {
    estadoTrabajo = Array.isArray(data) ? 'ok' : 'error';
  }
  trabajoDisponible = estadoTrabajo === 'ok';
  personal = trabajoDisponible ? data : [];
  soyCoordinador = Boolean(personal.find((p) => p.user_id === miId)?.is_admin);

  // Sin el SQL de asignación no hay responsables: se esconden sus filtros, botones y columna en vez de mostrar datos falsos.
  $('vista-panel').classList.toggle('sin-trabajo', !trabajoDisponible);
  $('filtro-responsable').hidden = !trabajoDisponible;
  $('btn-atencion').hidden = !trabajoDisponible;
  $('bloque-asignacion').hidden = !trabajoDisponible;
  if (!trabajoDisponible) $('f-responsable').value = '';

  // Una opción por persona, además de "Todos", "Mis casos" y "Sin responsable".
  // "Asignar a otra persona" no ofrece a quien está usando el panel: para eso está "Tomar este caso".
  const selector = $('f-responsable');
  selector.querySelectorAll('option[data-persona]').forEach((o) => o.remove());
  const asignar = $('r-asignar');
  asignar.replaceChildren(new Option('Elija una persona', ''));
  for (const persona of personal) {
    const esYo = persona.user_id === miId;
    const nombre = esYo ? `${persona.full_name} (usted)` : persona.full_name;
    const opcion = new Option(nombre, persona.user_id);
    opcion.dataset.persona = 'si';
    selector.append(opcion);
    if (!esYo) asignar.append(new Option(nombre, persona.user_id));
  }
}

async function cargarAtencion() {
  atencionDisponible = true;
  atencionIncompleta = false;
  if (!trabajoDisponible) {
    atencion = new Map();
    return;
  }
  const { data, error } = await supabase.rpc('report_attention');
  if (error) {
    // No se muestra "0 requieren atención" cuando en realidad no se pudo calcular.
    console.error(error);
    atencionDisponible = false;
    atencion = new Map();
    return;
  }
  atencion = mapaDeAtencion(data);
  // La respuesta tiene el mismo tope de 1000 filas; si llega llena, puede faltar alguna.
  if ((data ?? []).length >= TAMANO_PAGINA) atencionIncompleta = true;
}

// ---------- Lista, mapa y filtros ----------

// Trae los reportes por páginas, de más nuevo a más antiguo (con el id como desempate para que ninguna fila se repita
// ni se salte entre páginas). Devuelve null si una página falla.
async function traerReportes() {
  const todos = [];
  while (todos.length < MAXIMO_REPORTES) {
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(todos.length, todos.length + TAMANO_PAGINA - 1);
    if (error) {
      console.error(error);
      return null;
    }
    todos.push(...data);
    if (data.length < TAMANO_PAGINA) return { lista: todos, incompleta: false };
  }
  return { lista: todos, incompleta: true };
}

// Un caso que requiere atención puede ser más antiguo que los reportes cargados: se piden aparte para que el conteo,
// el filtro y la lista digan lo mismo.
async function traerCasosDeAtencionFaltantes() {
  const conocidos = new Set(reportes.map((r) => r.id));
  const faltantes = [...atencion.keys()].filter((id) => !conocidos.has(id));
  for (let i = 0; i < faltantes.length; i += 100) {
    const { data, error } = await supabase.from('reports').select('*').in('id', faltantes.slice(i, i + 100));
    if (error) {
      console.error(error);
      listaIncompleta = true;
      return;
    }
    reportes.push(...data);
  }
  if (faltantes.length > 0) reportes.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async function cargarReportes() {
  const resultado = await traerReportes();
  if (!resultado) {
    $('resumen').textContent = 'No se pudieron cargar los reportes.';
    return;
  }
  reportes = resultado.lista;
  listaIncompleta = resultado.incompleta;
  await cargarAtencion();
  if (resultado.incompleta) await traerCasosDeAtencionFaltantes();
  aplicarFiltros();
}

// Vuelve a pedir el personal si había fallado (o si faltaba) y luego los reportes.
async function recargar() {
  if (estadoTrabajo === 'error') await cargarPersonal();
  await cargarReportes();
}

$('btn-reintentar').addEventListener('click', async () => {
  const boton = $('btn-reintentar');
  boton.disabled = true;
  try {
    await recargar();
  } finally {
    boton.disabled = false;
  }
});

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

  const mostradas = visibles.slice(0, MAXIMO_FILAS);
  dibujarTabla(mostradas);
  marcadores = dibujarReportes(capa, mostradas, elegir);
  resumir();
  avisarEstadoDeLaLista();
}

// Avisos sobre lo que el panel no pudo traer o no dibuja, para que nunca parezca que la lista está completa cuando no lo está.
function avisarEstadoDeLaLista() {
  const partes = [];
  if (listaIncompleta) {
    partes.push(`Solo se cargaron los ${MAXIMO_REPORTES} reportes más recientes (más los casos que requieren atención). Use los filtros por fecha para ver los demás.`);
  }
  if (atencionIncompleta) {
    partes.push('Hay más casos que requieren atención de los que se pueden listar; atienda estos y vuelva a actualizar.');
  }
  if (visibles.length > MAXIMO_FILAS) {
    partes.push(`Se muestran ${MAXIMO_FILAS} de ${visibles.length} reportes en la tabla y el mapa. Use los filtros para acotarlos; Exportar CSV incluye todos.`);
  }
  mostrarError('aviso-lista', partes.join(' '));

  const fallo = estadoTrabajo === 'error' || !atencionDisponible;
  $('aviso-trabajo').hidden = !fallo;
  $('texto-aviso-trabajo').textContent =
    estadoTrabajo === 'error'
      ? 'No se pudo cargar el equipo de trabajo, por eso no se muestran los responsables.'
      : fallo
        ? 'No se pudo calcular qué casos requieren atención.'
        : '';
}

function resumir() {
  const partes = Object.entries(ESTADOS).map(([clave, nombre]) => {
    const cantidad = visibles.filter((r) => r.status === clave).length;
    return `${nombre}: ${cantidad}`;
  });
  const cuantos = atencionDisponible ? String(atencion.size) : '?';
  const pendientes = trabajoDisponible ? ` · ${cuantos} requieren atención` : '';
  $('resumen').textContent = `${visibles.length} de ${reportes.length} reportes · ${partes.join(' · ')}${pendientes}`;

  const boton = $('btn-atencion');
  boton.textContent = `Requieren atención (${cuantos})`;
  boton.setAttribute('aria-pressed', String(soloAtencion));
}

function dibujarTabla(filas) {
  const cuerpo = $('filas');
  cuerpo.replaceChildren();
  $('vacio').hidden = filas.length > 0;

  for (const r of filas) {
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
      // En pantallas angostas la columna "Responsable" se oculta: su valor queda como segunda línea del estado.
      if (i === 2 && trabajoDisponible) {
        const linea = document.createElement('span');
        linea.className = 'responsable-linea';
        linea.textContent = `Responsable: ${nombreDelResponsable(r, personal, miId)}`;
        celda.append(linea);
      }
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
  // Sin el cálculo de atención el filtro mostraría una lista vacía como si no hubiera nada pendiente.
  if (!atencionDisponible) {
    recargar();
    return;
  }
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
  mostrarError('error-asignacion', '');
  $('estado-asignacion').textContent = '';
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
  // Mientras se guarda un cambio todo queda quieto: un segundo clic no debe lanzar otra petición.
  for (const id of ['btn-tomar', 'btn-soltar', 'r-asignar', 'btn-asignar']) $(id).disabled = !puede || asignando;
  $('r-asignar').value = '';
  for (const opcion of $('r-asignar').options) opcion.disabled = opcion.value !== '' && opcion.value === reporte.assigned_to;

  mostrarError(
    'aviso-asignacion',
    puede ? '' : `Lo atiende ${nombreDelResponsable(reporte, personal, miId)}. Solo esa persona o un coordinador pueden cambiarlo.`
  );
}

let asignando = false;

// Lo que se anuncia (role="status") cuando el cambio se guardó.
function mensajeDeAsignacion(destino) {
  if (destino === null) return 'El caso quedó sin responsable.';
  if (destino === miId) return 'Ahora usted es responsable del caso.';
  return `El caso quedó a cargo de ${personal.find((p) => p.user_id === destino)?.full_name ?? 'la persona elegida'}.`;
}

// destino: el id de la persona, o null para soltar el caso.
async function cambiarResponsable(destino) {
  const id = activoId;
  if (!id || asignando) return;
  asignando = true;
  mostrarError('error-asignacion', '');
  $('estado-asignacion').textContent = '';
  const actual = reportes.find((r) => r.id === id);
  if (actual) mostrarAsignacion(actual); // deshabilita los botones mientras se guarda
  let guardado = false;
  try {
    const { error } = await supabase.rpc('assign_report', { p_report: id, p_to: destino });
    if (error) {
      console.error(error);
      const otra = /otra persona/.test(error.message ?? '');
      if (activoId === id) {
        mostrarError('error-asignacion', otra ? 'Ese caso lo atiende otra persona. Actualice la lista.' : 'No se pudo cambiar el responsable.');
      }
    } else {
      guardado = true;
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
  // Al terminar bien, el foco pasa al responsable nuevo (los botones que se usaron pudieron quedar ocultos o deshabilitados).
  if (guardado && activoId === id) {
    $('estado-asignacion').textContent = mensajeDeAsignacion(destino);
    $('d-responsable').focus();
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
  const encabezado = ['codigo', 'tipo', 'estado', ...(trabajoDisponible ? ['responsable'] : []), 'fecha_hora_local', 'lat', 'lng', 'descripcion'];
  const filas = visibles.map((r) =>
    [
      r.tracking_code,
      TIPOS[r.type],
      ESTADOS[r.status],
      ...(trabajoDisponible ? [nombreDelResponsable(r, personal, miId)] : []),
      new Date(r.created_at).toLocaleString('sv-SE'),
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
