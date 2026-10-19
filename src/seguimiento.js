import { supabase } from './supabase.js';
import { ESTADOS, TIPOS, fecha } from './etiquetas.js';
import {
  armarLinea,
  calcularPasos,
  codigoDeEnlace,
  copiar,
  enlaceDeSeguimiento,
  formatearCodigo,
  normalizarCodigo,
  textoEvento,
} from './ticket.js';

const $ = (id) => document.getElementById(id);
const mensaje = $('mensaje');
const panelEstado = $('estado');

let codigoActual = null;
let cierreActual = null;

function mostrarMensaje(texto) {
  mensaje.hidden = !texto;
  mensaje.textContent = texto ?? '';
  $('codigo').toggleAttribute('aria-invalid', Boolean(texto));
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

function textoDelPaso(paso) {
  if (paso.clave === 'descartado') return 'caso cerrado';
  if (paso.clave === 'atendido' && paso.estado === 'actual') return 'falta su confirmación';
  return { hecho: 'listo', actual: 'en curso', pendiente: 'pendiente' }[paso.estado];
}

function dibujarPasos(seguimiento) {
  const pasos = calcularPasos(seguimiento);
  $('e-pasos').replaceChildren(
    ...pasos.map((paso) => {
      const item = crear('li', `paso paso-${paso.estado} paso-${paso.clave}`);
      item.append(crear('span', 'paso-nombre', paso.nombre));
      // El estado también va escrito: el color no debe ser lo único que lo indica.
      item.append(crear('span', 'paso-detalle', textoDelPaso(paso)));
      if (paso.estado === 'actual') item.setAttribute('aria-current', 'step');
      return item;
    })
  );
}

function dibujarEvidencia(item, elemento) {
  item.append(crear('strong', 'linea-titulo', 'Evidencia de la Corporación'));
  item.append(crear('p', 'linea-texto', elemento.descripcion));

  const url = urlEvidencia(elemento.ruta);
  const enlace = crear('a', 'linea-foto');
  enlace.href = url;
  enlace.target = '_blank';
  enlace.rel = 'noopener noreferrer';

  const imagen = crear('img');
  imagen.src = url;
  imagen.alt = 'Foto de la acción';
  imagen.loading = 'lazy';
  // Si la foto no carga se avisa con texto, en vez de dejar una imagen rota.
  imagen.addEventListener('error', () => enlace.replaceWith(crear('p', 'ayuda', 'La foto no está disponible por ahora.')));

  enlace.append(imagen, crear('span', 'solo-lector', ' (se abre en una pestaña nueva)'));
  item.append(enlace);
}

function dibujarLinea(seguimiento) {
  const items = armarLinea(seguimiento.eventos, seguimiento.evidencias).map((elemento) => {
    const item = crear('li', `linea-item linea-${elemento.tipo}`);
    const hora = crear('time', 'linea-fecha', fecha(elemento.fecha));
    hora.dateTime = elemento.fecha;
    item.append(hora);

    if (elemento.tipo === 'evidencia') {
      dibujarEvidencia(item, elemento);
    } else if (elemento.clase === 'validacion') {
      item.append(crear('strong', 'linea-titulo', 'Su respuesta'));
      item.append(crear('p', 'linea-texto', textoEvento(elemento)));
    } else if (elemento.clase === 'nota') {
      item.append(crear('strong', 'linea-titulo', 'Actualización de la Corporación'));
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
  const hecha = $('validacion-hecha');
  $('validacion').hidden = !seguimiento.puede_validar;
  $('pendiente-validar').hidden = !seguimiento.puede_validar;
  hecha.hidden = true;
  hecha.classList.remove('aviso-ok');
  mostrarErrorValidacion('');

  if (seguimiento.puede_validar) return;

  const validacion = seguimiento.validacion;
  const comentario = validacion?.comentario ? ` Su comentario: «${validacion.comentario}».` : '';
  if (validacion?.veredicto === 'conforme') {
    hecha.textContent = `Usted confirmó el ${fecha(validacion.fecha)} que la acción se cumplió.${comentario} ¡Gracias por ayudarnos a verificarlo!`;
    hecha.classList.add('aviso-ok');
    hecha.hidden = false;
  } else if (validacion?.veredicto === 'no_conforme' && seguimiento.estado === 'en_revision') {
    hecha.textContent = `Usted indicó el ${fecha(validacion.fecha)} que el problema continúa.${comentario} El caso volvió a revisión; verá aquí la nueva respuesta.`;
    hecha.hidden = false;
  }
}

function dibujar(seguimiento) {
  codigoActual = seguimiento.codigo;
  cierreActual = seguimiento.cierre;
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

// Con { conservar: true } (por ejemplo, tras responder la validación) no se oculta el resultado: solo se
// redibuja, para que la persona no pierda su lugar en la página.
async function consultar(codigoEscrito, { conservar = false } = {}) {
  mostrarMensaje('');
  if (!conservar) panelEstado.hidden = true;

  const codigo = normalizarCodigo(codigoEscrito);
  if (codigo.length < 4) {
    mostrarMensaje('Escriba el código completo.');
    return null;
  }

  const { data, error } = await supabase.rpc('get_report_tracking', { p_code: codigo });
  if (error) {
    console.error(error);
    mostrarMensaje('No se pudo consultar. Inténtelo de nuevo en un momento.');
    return null;
  }
  if (!data) {
    mostrarMensaje('No encontramos ese código. Revise que esté bien escrito.');
    return null;
  }

  dibujar(data);
  // Deja el enlace listo para recargar o compartir. Va en el fragmento (#) porque el navegador no lo envía al servidor.
  history.replaceState(null, '', `${location.pathname}#codigo=${encodeURIComponent(data.codigo)}`);
  if (!conservar) $('titulo-estado').focus();
  return data;
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
$('btn-copiar-enlace').addEventListener('click', () => copiarYAvisar(enlaceDeSeguimiento(location.origin, codigoActual), 'Enlace'));

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
  if (boton.disabled) return;
  boton.disabled = true;
  const { error } = await supabase.rpc('validate_report', {
    p_code: codigoActual,
    p_verdict: veredicto,
    p_comment: $('v-comentario').value.trim() || null,
    p_cierre: cierreActual,
  });
  boton.disabled = false;

  if (error) {
    console.error(error);
    // Lo más probable es que el reporte haya cambiado (otra pestaña u otro dispositivo): se actualiza la página.
    const datos = await consultar(codigoActual, { conservar: true });
    if (datos?.puede_validar) {
      mostrarErrorValidacion('El reporte cambió mientras lo revisaba. Revise la información y responda de nuevo.');
    } else if (!datos) {
      mostrarErrorValidacion('No se pudo enviar su respuesta. Inténtelo de nuevo en un momento.');
    }
    return;
  }

  $('form-validacion').reset();
  await consultar(codigoActual, { conservar: true });
  // La confirmación se anuncia (role="status") y el foco queda en ella, sin saltar al inicio de la página.
  const hecha = $('validacion-hecha');
  if (!hecha.hidden) {
    hecha.focus();
    hecha.scrollIntoView({ block: 'center' });
  }
});

// ---------- Arranque: si el enlace trae el código, consulta de una vez ----------

const codigoEnEnlace = codigoDeEnlace(location.hash, location.search);
if (codigoEnEnlace) {
  $('codigo').value = formatearCodigo(codigoEnEnlace);
  consultar(codigoEnEnlace);
}
