import { ESTADOS } from './etiquetas.js';

// Deja el código en mayúsculas y sin guiones ni espacios. Es lo mismo que hace norm_code() en la base.
export function normalizarCodigo(texto) {
  return String(texto ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

// Muestra el código en grupos de 4 para que sea fácil de leer y dictar: A65ED0991E33 -> A65E-D099-1E33.
export function formatearCodigo(texto) {
  return normalizarCodigo(texto).replace(/(.{4})(?=.)/g, '$1-');
}

// Pasos que ve el ciudadano. "Validado" solo se cumple cuando él mismo confirma la acción.
const PASOS = [
  ['recibido', ESTADOS.recibido],
  ['en_revision', ESTADOS.en_revision],
  ['atendido', ESTADOS.atendido],
  ['validado', 'Validado por usted'],
];

export function calcularPasos({ estado, validacion, eventos = [] }) {
  if (estado === 'descartado') {
    // "En revisión" solo cuenta si el caso realmente pasó por ahí.
    const reviso = eventos.some((e) => e.estado === 'en_revision');
    return [
      { clave: 'recibido', nombre: ESTADOS.recibido, estado: 'hecho' },
      ...(reviso ? [{ clave: 'en_revision', nombre: ESTADOS.en_revision, estado: 'hecho' }] : []),
      { clave: 'descartado', nombre: ESTADOS.descartado, estado: 'actual' },
    ];
  }

  const validado = estado === 'atendido' && validacion?.veredicto === 'conforme';
  const indice = validado ? 3 : { recibido: 0, en_revision: 1, atendido: 2 }[estado] ?? 0;

  return PASOS.map(([clave, nombre], i) => ({
    clave,
    nombre,
    estado: i < indice || (validado && i === indice) ? 'hecho' : i === indice ? 'actual' : 'pendiente',
  }));
}

// Mezcla los cambios de estado y las fotos de evidencia en una sola línea de tiempo, de más antigua a más reciente.
export function armarLinea(eventos = [], evidencias = []) {
  return [
    ...eventos.map((e) => ({ ...e, tipo: 'evento' })),
    ...evidencias.map((v) => ({ ...v, tipo: 'evidencia' })),
  ].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
}

const TEXTO_POR_ESTADO = {
  recibido: 'Reporte recibido',
  en_revision: 'La Corporación está revisando el caso',
  atendido: 'La Corporación marcó el caso como atendido',
  descartado: 'El caso fue descartado',
};

// Texto de un cambio de estado: el que escribió el funcionario o, si no escribió nada, uno por defecto.
export function textoEvento(evento) {
  return evento.nota || TEXTO_POR_ESTADO[evento.estado] || ESTADOS[evento.estado] || '';
}

// Lee el código del ticket del enlace. Se prefiere el fragmento (#codigo=...), que el navegador no envía al
// servidor; también se acepta ?codigo=... por si hay enlaces anteriores.
export function codigoDeEnlace(hash = '', search = '') {
  const desdeHash = new URLSearchParams(hash.replace(/^#/, '')).get('codigo');
  return desdeHash || new URLSearchParams(search).get('codigo') || '';
}

export function enlaceDeSeguimiento(origen, codigo) {
  return `${origen}/seguimiento.html#codigo=${encodeURIComponent(normalizarCodigo(codigo))}`;
}

export async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}
