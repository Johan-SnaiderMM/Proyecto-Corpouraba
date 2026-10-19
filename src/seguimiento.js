import { supabase } from './supabase.js';
import { ESTADOS, TIPOS, fecha } from './etiquetas.js';
import { armarLinea, calcularPasos, copiar, formatearCodigo, normalizarCodigo, textoEvento } from './ticket.js';

const $ = (id) => document.getElementById(id);
const mensaje = $('mensaje');
const panelEstado = $('estado');

let codigoActual = null;

function mostrarMensaje(texto) {
  mensaje.hidden = !texto;
  mensaje.textContent = texto ?? '';
}

function mostrarErrorValidacion(texto) {
  const aviso = $('error-validacion');
  aviso.hidden = !texto;
  aviso.textContent = texto ?? '';
}

// Crea un elemento con texto. Todo lo que viene de la base se escribe con textContent, nunca con innerHTML.
function crear(etiqueta, clase, texto) {
  const elemento = document.createElement(etiqueta);
  if (clase) elemento.className = clase;
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}

function urlEvidencia(ruta) {
  return supabase.storage.from('report-evidence').getPublicUrl(ruta).data.publicUrl;
}

// ---------- Dibujo del ticket ----------

function dibujarPasos(seguimiento) {
  const pasos = calcularPasos({ estado: seguimiento.estado, validacion: seguimiento.validacion });
  $('e-pasos').replaceChildren(
    ...pasos.map((paso) => {
      const item = crear('li', `paso paso-${paso.estado}`);
      item.append(crear('span', 'paso-nombre', paso.nombre));
      // El estado también va escrito: el color no debe ser lo único que lo indica.
      const detalle = { hecho: 'listo', actual: 'en curso', pendiente: 'pendiente' }[paso.estado];
      item.append(crear('span', 'paso-detalle', detalle));
      if (paso.estado === 'actual') item.setAttribute('aria-current', 'step');
      return item;
    })
  );
}

function dibujarLinea(seguimiento) {
  const items = armarLinea(seguimiento.eventos, seguimiento.evidencias).map((elemento) => {
    const item = crear('li', `linea-item linea-${elemento.tipo}`);
    item.append(crear('time', 'linea-fecha', fecha(elemento.fecha)));

    if (elemento.tipo === 'evidencia') {
      item.append(crear('strong', 'linea-titulo', 'Evidencia de la Corporación'));
      item.append(crear('p', 'linea-texto', elemento.descripcion));
      const url = urlEvidencia(elemento.ruta);
      const enlace = crear('a', 'linea-foto');
      enlace.href = url;
      enlace.target = '_blank';
      enlace.rel = 'noopener noreferrer';
      const imagen = crear('img');
      imagen.src = url;
      imagen.alt = `Evidencia: ${elemento.descripcion}`;
      imagen.loading = 'lazy';
      enlace.append(imagen);
      item.append(enlace);
    } else if (elemento.clase === 'validacion') {
      item.append(crear('strong', 'linea-titulo', 'Su respuesta'));
      item.append(crear('p', 'linea-texto', textoEvento(elemento)));
    } else {
      item.append(crear('strong', 'linea-titulo', ESTADOS[elemento.estado] ?? elemento.estado));
      item.append(crear('p', 'linea-texto', textoEvento(elemento)));
    }
    return item;
  });
  $('e-linea').replaceChildren(...items);
}

function dibujarValidacion(seguimiento) {
  const formulario = $('validacion');
  const hecha = $('validacion-hecha');
  formulario.hidden = !seguimiento.puede_validar;
  hecha.hidden = true;
  mostrarErrorValidacion('');

  if (seguimiento.puede_validar) return;

  const validacion = seguimiento.validacion;
  if (validacion?.veredicto === 'conforme') {
    hecha.textContent = `Usted confirmó el ${fecha(validacion.fecha)} que la acción se cumplió. ¡Gracias por ayudarnos a verificarlo!`;
    hecha.hidden = false;
  } else if (validacion?.veredicto === 'no_conforme' && seguimiento.estado === 'en_revision') {
    hecha.textContent = `Usted indicó el ${fecha(validacion.fecha)} que el problema continúa. El caso volvió a revisión; verá aquí la nueva respuesta.`;
    hecha.hidden = false;
  }
}

function dibujar(seguimiento) {
  codigoActual = seguimiento.codigo;
  $('e-codigo').textContent = formatearCodigo(seguimiento.codigo);
  $('copiado').textContent = '';
  $('e-tipo').textContent = TIPOS[seguimiento.tipo] ?? seguimiento.tipo;
  $('e-estado').textContent = ESTADOS[seguimiento.estado] ?? seguimiento.estado;
  $('e-creado').textContent = fecha(seguimiento.creado);
  $('e-actualizado').textContent = fecha(seguimiento.actualizado);
  $('e-nota').textContent = seguimiento.nota_publica || 'Sin notas por ahora.';
  dibujarPasos(seguimiento);
  dibujarLinea(seguimiento);
  dibujarValidacion(seguimiento);
  panelEstado.hidden = false;
}

// ---------- Consulta ----------

async function consultar(codigoEscrito) {
  mostrarMensaje('');
  panelEstado.hidden = true;

  const codigo = normalizarCodigo(codigoEscrito);
  if (codigo.length < 4) {
    mostrarMensaje('Escriba el código completo.');
    return;
  }

  const { data, error } = await supabase.rpc('get_report_tracking', { p_code: codigo });
  if (error) {
    console.error(error);
    mostrarMensaje('No se pudo consultar. Inténtelo de nuevo en un momento.');
    return;
  }
  if (!data) {
    mostrarMensaje('No encontramos ese código. Revise que esté bien escrito.');
    return;
  }

  dibujar(data);
  // Deja el enlace listo para recargar o compartir la página con el mismo ticket.
  history.replaceState(null, '', `?codigo=${encodeURIComponent(data.codigo)}`);
}

$('formulario').addEventListener('submit', (evento) => {
  evento.preventDefault();
  consultar($('codigo').value);
});

// ---------- Copiar código y enlace ----------

async function copiarYAvisar(texto, descripcion) {
  const aviso = $('copiado');
  aviso.textContent = (await copiar(texto)) ? `${descripcion} copiado.` : 'No se pudo copiar. Selecciónelo y cópielo a mano.';
}

$('btn-copiar-codigo').addEventListener('click', () => copiarYAvisar(formatearCodigo(codigoActual), 'Código'));
$('btn-copiar-enlace').addEventListener('click', () => {
  const enlace = `${location.origin}/seguimiento.html?codigo=${encodeURIComponent(codigoActual)}`;
  copiarYAvisar(enlace, 'Enlace');
});

// ---------- Validación del ciudadano ----------

$('form-validacion').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  mostrarErrorValidacion('');

  const veredicto = document.querySelector('input[name="veredicto"]:checked')?.value;
  if (!veredicto) {
    mostrarErrorValidacion('Elija una de las dos respuestas.');
    return;
  }

  const boton = $('btn-validar');
  boton.disabled = true;
  const { error } = await supabase.rpc('validate_report', {
    p_code: codigoActual,
    p_verdict: veredicto,
    p_comment: $('v-comentario').value.trim() || null,
  });
  boton.disabled = false;

  if (error) {
    console.error(error);
    mostrarErrorValidacion('No se pudo enviar su respuesta. Actualice la página e inténtelo de nuevo.');
    return;
  }

  $('form-validacion').reset();
  await consultar(codigoActual);
});

// ---------- Arranque: si el enlace trae ?codigo=, consulta de una vez ----------

const codigoEnEnlace = new URLSearchParams(location.search).get('codigo');
if (codigoEnEnlace) {
  $('codigo').value = formatearCodigo(codigoEnEnlace);
  consultar(codigoEnEnlace);
}
