// Modo demostración: imita la parte de Supabase que usa la aplicación (tablas, funciones y almacenamiento de
// supabase/schema.sql y supabase/seguimiento.sql) y lo guarda todo en el navegador (localStorage).
// Se activa solo cuando no hay VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Con las variables definidas la
// aplicación usa Supabase de verdad y este archivo no se usa.
//
// Los datos de ejemplo son los mismos 6 casos de supabase/demo.sql (con las mismas fotos de supabase/demo/fotos).
// Si cambia el SQL de la base, hay que reflejar el cambio aquí; src/demo-cliente.test.js protege el comportamiento.

import { normalizarCodigo } from './ticket.js';

export const CORREO_DEMO = 'funcionario@demo.co';
export const CLAVE_DEMO = 'demo1234';

// Tickets de ejemplo que la página de consulta ofrece como botones.
export const TICKETS_EJEMPLO = [
  { codigo: 'DEMO0002PORVALID', texto: 'Esperando su validación (úselo para validar en vivo)' },
  { codigo: 'DEMO0001VALIDADO', texto: 'Atendido y validado' },
  { codigo: 'DEMO0003REABIERT', texto: 'Reabierto por la persona' },
  { codigo: 'DEMO0006REVISION', texto: 'En revisión, con evidencia' },
  { codigo: 'DEMO0004RECIBIDO', texto: 'Recién recibido' },
  { codigo: 'DEMO0005DESCARTA', texto: 'Descartado' },
];

const CLAVE_DATOS = 'reporteAmbientalDemo2';
const CLAVE_FOTOS = 'reporteAmbientalDemoFotos2';
const CLAVE_SESION = 'reporteAmbientalDemoSesion2';
const PERFIL = { full_name: 'Funcionaria de prueba' };
const ID_FUNCIONARIO = 'funcionaria-demo';

// ---------- Almacenamiento (con respaldo en memoria si el navegador no deja usar localStorage) ----------

let datosMemoria = null;
let fotosMemoria = {};
let sesionMemoria = false;
const oyentes = [];

function datos() {
  try {
    const texto = localStorage.getItem(CLAVE_DATOS);
    if (texto) return JSON.parse(texto);
  } catch {
    if (datosMemoria) return datosMemoria;
  }
  const nuevos = sembrar();
  guardarDatos(nuevos);
  return nuevos;
}

function guardarDatos(d) {
  datosMemoria = d;
  try {
    localStorage.setItem(CLAVE_DATOS, JSON.stringify(d));
  } catch {
    // Sin localStorage la demo sigue funcionando mientras no se recargue la página.
  }
}

function leerFotos() {
  try {
    return { ...JSON.parse(localStorage.getItem(CLAVE_FOTOS) ?? '{}'), ...fotosMemoria };
  } catch {
    return { ...fotosMemoria };
  }
}

function guardarFoto(clave, urlDatos) {
  try {
    const todas = JSON.parse(localStorage.getItem(CLAVE_FOTOS) ?? '{}');
    todas[clave] = urlDatos;
    localStorage.setItem(CLAVE_FOTOS, JSON.stringify(todas));
  } catch {
    // Si ya no cabe, la foto queda solo en memoria hasta que se recargue la página.
    fotosMemoria[clave] = urlDatos;
  }
}

function borrarFoto(clave) {
  delete fotosMemoria[clave];
  try {
    const todas = JSON.parse(localStorage.getItem(CLAVE_FOTOS) ?? '{}');
    delete todas[clave];
    localStorage.setItem(CLAVE_FOTOS, JSON.stringify(todas));
  } catch {
    // Nada que borrar.
  }
}

function hayDemoSesion() {
  try {
    return localStorage.getItem(CLAVE_SESION) === '1';
  } catch {
    return sesionMemoria;
  }
}

function fijarSesion(valor) {
  sesionMemoria = valor;
  try {
    if (valor) localStorage.setItem(CLAVE_SESION, '1');
    else localStorage.removeItem(CLAVE_SESION);
  } catch {
    // Se usa solo la memoria.
  }
}

export function reiniciarDemo() {
  datosMemoria = null;
  fotosMemoria = {};
  try {
    localStorage.removeItem(CLAVE_DATOS);
    localStorage.removeItem(CLAVE_FOTOS);
  } catch {
    // Nada que borrar.
  }
}

// ---------- Datos de ejemplo (los de supabase/demo.sql) ----------

const HORA = 3_600_000;
const DIA = 24 * HORA;
const COLOMBIA = -5 * HORA;

// Momento "hace n días a las h horas", contando los días desde la medianoche de Colombia (igual que demo.sql).
function dia(n, h) {
  const medianoche = Math.floor((Date.now() + COLOMBIA) / DIA) * DIA - COLOMBIA;
  return new Date(medianoche - n * DIA + h * HORA).toISOString();
}

function sembrar() {
  const d = { reportes: [], eventos: [], evidencias: [], validaciones: [] };
  let nEvento = 1;
  let nEvidencia = 1;
  let nValidacion = 1;

  const reporte = (n, codigo, tipo, descripcion, lat, lng, estado, notaPublica, creado, actualizado) => {
    const id = `de00000${n}-0000-4000-8000-000000000001`;
    d.reportes.push({
      id,
      tracking_code: codigo,
      type: tipo,
      description: descripcion,
      lat,
      lng,
      photo_path: null,
      status: estado,
      public_note: notaPublica,
      created_at: creado,
      updated_at: actualizado,
    });
    return id;
  };
  const evento = (reporteId, estado, nota, notaPublica, clase, funcionario, momento) => {
    const e = {
      id: nEvento++,
      report_id: reporteId,
      status: estado,
      note: nota,
      public_note: notaPublica,
      kind: clase,
      staff_id: funcionario ? ID_FUNCIONARIO : null,
      created_at: momento,
    };
    d.eventos.push(e);
    return e.id;
  };
  const evidencia = (reporteId, archivo, descripcion, momento) =>
    d.evidencias.push({
      id: nEvidencia++,
      report_id: reporteId,
      storage_path: `${reporteId}/${archivo}`,
      caption: descripcion,
      staff_id: ID_FUNCIONARIO,
      created_at: momento,
    });
  const validacion = (reporteId, eventoId, veredicto, comentario, momento) =>
    d.validaciones.push({
      id: nValidacion++,
      report_id: reporteId,
      event_id: eventoId,
      verdict: veredicto,
      comment: comentario,
      created_at: momento,
    });
  const foto = (reporteN, numero) => `ee0${reporteN}0${numero}00-0000-4000-8000-000000000000.jpg`;

  // DEMO0001VALIDADO: atendido y validado como conforme.
  let r = reporte(1, 'DEMO0001VALIDADO', 'vertimiento', 'DEMO · Salen aguas turbias y con espuma de un tubo hacia la quebrada, con mal olor desde hace una semana.', 7.8816, -76.6342, 'atendido', 'Se ordenó suspender el vertimiento y se instaló un sistema de tratamiento de aguas', dia(10, 9), dia(4, 18));
  evento(r, 'recibido', 'Reporte recibido', 'Reporte recibido', 'estado', false, dia(10, 9));
  evento(r, 'en_revision', 'Asignado a la Territorial Centro', 'Un técnico visitará el sitio en los próximos días', 'estado', true, dia(9, 10));
  evidencia(r, foto(1, 1), 'Toma de muestras de agua en la quebrada', dia(7, 11));
  evidencia(r, foto(1, 2), 'Inspección del punto de vertimiento', dia(6, 15));
  let cierre = evento(r, 'atendido', 'Se ordenó suspender el vertimiento', 'Se ordenó suspender el vertimiento y se instaló un sistema de tratamiento de aguas', 'estado', true, dia(5, 16));
  validacion(r, cierre, 'conforme', 'Ya no huele ni sale espuma. Gracias.', dia(4, 18));
  evento(r, 'atendido', 'Validación ciudadana: conforme — Ya no huele ni sale espuma. Gracias.', 'El ciudadano confirmó que la acción se cumplió.', 'validacion', false, dia(4, 18));

  // DEMO0002PORVALID: atendido, a la espera de que la persona valide.
  r = reporte(2, 'DEMO0002PORVALID', 'tala', 'DEMO · Están talando árboles grandes junto a la orilla del río en un predio sin letrero ni permiso visible.', 7.6671, -76.6819, 'atendido', 'Se impuso una medida de compensación y se verificó la siembra de los árboles', dia(8, 8), dia(3, 16));
  evento(r, 'recibido', 'Reporte recibido', 'Reporte recibido', 'estado', false, dia(8, 8));
  evento(r, 'en_revision', 'Asignado a la Territorial Urrao', 'Un técnico visitará el predio', 'estado', true, dia(7, 9));
  evidencia(r, foto(2, 1), 'Visita al predio y verificación de la tala', dia(6, 10));
  evidencia(r, foto(2, 2), 'Siembra de 30 árboles nativos como compensación', dia(4, 14));
  evento(r, 'atendido', 'Compensación verificada', 'Se impuso una medida de compensación y se verificó la siembra de los árboles', 'estado', true, dia(3, 16));

  // DEMO0003REABIERT: la persona dijo "no conforme", el caso volvió a revisión y hubo una segunda visita.
  r = reporte(3, 'DEMO0003REABIERT', 'quema', 'DEMO · Queman rastrojo y plástico detrás de una finca; el humo llega hasta las casas cercanas.', 7.7573, -76.6528, 'en_revision', 'Se programó una visita de control en los próximos días', dia(12, 9), dia(6, 13));
  evento(r, 'recibido', 'Reporte recibido', 'Reporte recibido', 'estado', false, dia(12, 9));
  evento(r, 'en_revision', 'Asignado a la Territorial Caribe', 'Un técnico visitará la zona', 'estado', true, dia(11, 10));
  evidencia(r, foto(3, 1), 'Visita a la finca y verificación del foco de quema', dia(10, 11));
  cierre = evento(r, 'atendido', 'Foco apagado', 'Se apagó el foco y se notificó al propietario sobre la prohibición de quemas', 'estado', true, dia(9, 15));
  validacion(r, cierre, 'no_conforme', 'Volvieron a quemar otra vez', dia(8, 17));
  evento(r, 'en_revision', 'Validación ciudadana: NO conforme — Volvieron a quemar otra vez', 'El ciudadano indicó que el problema continúa; el caso vuelve a revisión.', 'validacion', false, dia(8, 17));
  evento(r, 'en_revision', 'Programar visita de control', 'Se programó una visita de control en los próximos días', 'nota', true, dia(7, 9));
  evidencia(r, foto(3, 2), 'Segunda visita de control al predio', dia(6, 13));

  // DEMO0004RECIBIDO: recién recibido.
  const haceTres = new Date(Date.now() - 3 * HORA).toISOString();
  r = reporte(4, 'DEMO0004RECIBIDO', 'residuos', 'DEMO · Dejaron escombros y bolsas de basura al lado del camino que va a la escuela.', 8.0935, -76.7285, 'recibido', 'Reporte recibido', haceTres, haceTres);
  evento(r, 'recibido', 'Reporte recibido', 'Reporte recibido', 'estado', false, haceTres);

  // DEMO0005DESCARTA: descartado.
  r = reporte(5, 'DEMO0005DESCARTA', 'fauna', 'DEMO · Vi a unas personas con jaulas ofreciendo loros a la orilla de la carretera.', 8.4278, -76.7855, 'descartado', 'En la visita no se encontró la actividad reportada, por eso se cierra el caso', dia(6, 8), dia(4, 11));
  evento(r, 'recibido', 'Reporte recibido', 'Reporte recibido', 'estado', false, dia(6, 8));
  evento(r, 'en_revision', 'Asignado a la Territorial Caribe', 'Un técnico revisará el lugar', 'estado', true, dia(5, 9));
  evento(r, 'descartado', 'Sin hallazgos en la visita', 'En la visita no se encontró la actividad reportada, por eso se cierra el caso', 'estado', true, dia(4, 11));

  // DEMO0006REVISION: en revisión, con una evidencia.
  r = reporte(6, 'DEMO0006REVISION', 'tala', 'DEMO · Cortaron mangle cerca de la playa para hacer un potrero.', 8.0911, -76.7351, 'en_revision', 'El caso fue asignado a un técnico', dia(3, 8), dia(1, 10));
  evento(r, 'recibido', 'Reporte recibido', 'Reporte recibido', 'estado', false, dia(3, 8));
  evento(r, 'en_revision', 'Asignado a la Territorial Nutibara', 'El caso fue asignado a un técnico', 'estado', true, dia(2, 9));
  evidencia(r, foto(6, 1), 'Ubicación del punto afectado registrada con GPS', dia(1, 10));

  return d;
}

// ---------- Cliente falso con la misma forma que usa la aplicación ----------

const ok = (data) => ({ data, error: null });
const falla = (mensaje) => ({ data: null, error: { message: mensaje } });

function nuevoId() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nuevoCodigo() {
  return (nuevoId().replaceAll('-', '').slice(0, 8) + nuevoId().replaceAll('-', '').slice(0, 8)).toUpperCase();
}

function siguienteId(filas) {
  return filas.reduce((mayor, f) => Math.max(mayor, f.id), 0) + 1;
}

const porFechaEId = (a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id - b.id);

function consulta(tabla) {
  const filtros = [];
  const ordenes = [];
  let unico = false;

  const ejecutar = () => {
    const d = datos();
    const conSesion = hayDemoSesion();
    let filas;
    if (tabla === 'staff') filas = conSesion ? [PERFIL] : [];
    else if (!conSesion) filas = []; // igual que las reglas RLS: sin sesión no se lee nada
    else if (tabla === 'reports') filas = [...d.reportes];
    else if (tabla === 'report_events') filas = [...d.eventos];
    else if (tabla === 'report_evidence') filas = [...d.evidencias];
    else filas = [];

    for (const [columna, valor] of filtros) filas = filas.filter((f) => f[columna] === valor);
    filas.sort((a, b) => {
      for (const [columna, ascendente] of ordenes) {
        if (a[columna] === b[columna]) continue;
        return (a[columna] < b[columna] ? -1 : 1) * (ascendente ? 1 : -1);
      }
      return 0;
    });
    return ok(unico ? (filas[0] ?? null) : filas);
  };

  const q = {
    select: () => q,
    eq: (columna, valor) => (filtros.push([columna, valor]), q),
    order: (columna, { ascending = true } = {}) => (ordenes.push([columna, ascending]), q),
    maybeSingle: () => ((unico = true), q),
    then: (alCumplir, alFallar) => Promise.resolve(ejecutar()).then(alCumplir, alFallar),
  };
  return q;
}

// Último evento "atendido" puesto por la Corporación: es el cierre que el ciudadano puede validar.
function cierreDe(d, reporteId) {
  return (
    d.eventos
      .filter((e) => e.report_id === reporteId && e.status === 'atendido' && e.kind === 'estado')
      .sort(porFechaEId)
      .at(-1) ?? null
  );
}

const funciones = {
  create_report({ p_type, p_description, p_lat, p_lng, p_photo_path }) {
    const d = datos();
    const ahora = new Date().toISOString();
    const r = {
      id: nuevoId(),
      tracking_code: nuevoCodigo(),
      type: p_type,
      description: String(p_description).trim(),
      lat: p_lat,
      lng: p_lng,
      photo_path: p_photo_path ?? null,
      status: 'recibido',
      public_note: null,
      created_at: ahora,
      updated_at: ahora,
    };
    d.reportes.push(r);
    d.eventos.push({
      id: siguienteId(d.eventos),
      report_id: r.id,
      status: 'recibido',
      note: 'Reporte recibido',
      public_note: 'Reporte recibido',
      kind: 'estado',
      staff_id: null,
      created_at: ahora,
    });
    guardarDatos(d);
    return ok(r.tracking_code);
  },

  get_report_status({ p_code }) {
    const r = datos().reportes.find((x) => x.tracking_code === normalizarCodigo(p_code));
    if (!r) return ok([]);
    return ok([{ tipo: r.type, estado: r.status, nota_publica: r.public_note, creado: r.created_at, actualizado: r.updated_at }]);
  },

  get_report_tracking({ p_code }) {
    const d = datos();
    const r = d.reportes.find((x) => x.tracking_code === normalizarCodigo(p_code));
    if (!r) return ok(null);

    const cierre = cierreDe(d, r.id);
    const validacion = cierre ? d.validaciones.find((v) => v.event_id === cierre.id) : null;
    return ok({
      codigo: r.tracking_code,
      tipo: r.type,
      estado: r.status,
      creado: r.created_at,
      actualizado: r.updated_at,
      nota_publica: r.public_note,
      cierre: cierre?.id ?? null,
      eventos: d.eventos
        .filter((e) => e.report_id === r.id && !(e.kind === 'nota' && e.public_note === null))
        .sort(porFechaEId)
        .map((e) => ({ estado: e.status, nota: e.public_note, fecha: e.created_at, clase: e.kind })),
      evidencias: d.evidencias
        .filter((v) => v.report_id === r.id)
        .sort(porFechaEId)
        .map((v) => ({ ruta: v.storage_path, descripcion: v.caption, fecha: v.created_at })),
      validacion: validacion ? { veredicto: validacion.verdict, comentario: validacion.comment, fecha: validacion.created_at } : null,
      puede_validar: r.status === 'atendido' && cierre !== null && !validacion,
    });
  },

  validate_report({ p_code, p_verdict, p_comment, p_cierre }) {
    if (!['conforme', 'no_conforme'].includes(p_verdict)) return falla('respuesta no válida');
    const comentario = String(p_comment ?? '').trim() || null;
    if ((comentario ?? '').length > 300) return falla('el comentario es demasiado largo');

    const d = datos();
    const r = d.reportes.find((x) => x.tracking_code === normalizarCodigo(p_code));
    if (!r) return falla('reporte no encontrado');
    if (r.status !== 'atendido') return falla('este reporte no está esperando validación');
    const cierre = cierreDe(d, r.id);
    if (!cierre) return falla('este reporte no está esperando validación');
    if (p_cierre !== cierre.id) return falla('el reporte cambió desde que lo consultó; recargue la página');
    if (d.validaciones.some((v) => v.event_id === cierre.id)) return falla('este reporte ya fue validado');

    const ahora = new Date().toISOString();
    d.validaciones.push({
      id: siguienteId(d.validaciones),
      report_id: r.id,
      event_id: cierre.id,
      verdict: p_verdict,
      comment: comentario,
      created_at: ahora,
    });

    const aviso = (texto) => ({
      id: siguienteId(d.eventos),
      report_id: r.id,
      kind: 'validacion',
      staff_id: null,
      created_at: ahora,
      ...texto,
    });
    if (p_verdict === 'conforme') {
      d.eventos.push(
        aviso({
          status: 'atendido',
          note: `Validación ciudadana: conforme${comentario ? ` — ${comentario}` : ''}`,
          public_note: 'El ciudadano confirmó que la acción se cumplió.',
        })
      );
    } else {
      const publica = 'El ciudadano indicó que el problema continúa; el caso vuelve a revisión.';
      r.status = 'en_revision';
      r.public_note = publica;
      r.updated_at = ahora;
      d.eventos.push(
        aviso({
          status: 'en_revision',
          note: `Validación ciudadana: NO conforme${comentario ? ` — ${comentario}` : ''}`,
          public_note: publica,
        })
      );
    }
    guardarDatos(d);
    return ok(null);
  },

  change_status({ p_report, p_status, p_note, p_public_note }) {
    if (!hayDemoSesion()) return falla('no autorizado');
    const d = datos();
    const r = d.reportes.find((x) => x.id === p_report);
    if (!r) return falla('reporte no encontrado');

    const publica = String(p_public_note ?? '').trim() || null;
    // Guardar el mismo estado solo agrega una nota: no crea un cierre nuevo ni borra la validación.
    const clase = r.status === p_status ? 'nota' : 'estado';
    const ahora = new Date().toISOString();

    r.status = p_status;
    if (!(clase === 'nota' && publica === null)) r.public_note = publica;
    r.updated_at = ahora;
    d.eventos.push({
      id: siguienteId(d.eventos),
      report_id: r.id,
      status: p_status,
      note: p_note ?? null,
      public_note: publica,
      kind: clase,
      staff_id: ID_FUNCIONARIO,
      created_at: ahora,
    });
    guardarDatos(d);
    return ok(null);
  },

  add_evidence({ p_report, p_path, p_caption }) {
    if (!hayDemoSesion()) return falla('no autorizado');
    const d = datos();
    if (!d.reportes.some((x) => x.id === p_report)) return falla('reporte no encontrado');
    if (!String(p_path ?? '').startsWith(`${p_report}/`)) return falla('ruta de evidencia no válida');

    const ahora = new Date().toISOString();
    d.evidencias.push({
      id: siguienteId(d.evidencias),
      report_id: p_report,
      storage_path: p_path,
      caption: String(p_caption).trim(),
      staff_id: ID_FUNCIONARIO,
      created_at: ahora,
    });
    d.reportes.find((x) => x.id === p_report).updated_at = ahora;
    guardarDatos(d);
    return ok(null);
  },
};

async function blobADataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(binario)}`;
}

function almacen(bucket) {
  const clave = (ruta) => `${bucket}/${ruta}`;
  const subir = async (ruta, blob) => {
    try {
      guardarFoto(clave(ruta), await blobADataUrl(blob));
      return ok({ path: ruta });
    } catch {
      return falla('No se pudo guardar la foto');
    }
  };

  return {
    upload: subir,
    uploadToSignedUrl: (ruta, _token, blob) => subir(ruta, blob),
    async createSignedUrl(ruta) {
      const url = leerFotos()[clave(ruta)];
      return url ? ok({ signedUrl: url }) : falla('Foto no encontrada');
    },
    getPublicUrl(ruta) {
      // Las fotos de los casos de ejemplo viajan con el sitio (public/demo-fotos); las que se suben en la demo
      // viven en el navegador.
      const url = leerFotos()[clave(ruta)] ?? `/demo-fotos/${ruta.replace('/', '__')}`;
      return { data: { publicUrl: url } };
    },
    async remove(rutas) {
      rutas.forEach((ruta) => borrarFoto(clave(ruta)));
      return ok([]);
    },
  };
}

export function crearClienteDemo() {
  return {
    auth: {
      async signInWithPassword({ email, password }) {
        if (email !== CORREO_DEMO || password !== CLAVE_DEMO) return falla('Credenciales inválidas');
        fijarSesion(true);
        return ok({ session: {} });
      },
      async getSession() {
        return ok({ session: hayDemoSesion() ? {} : null });
      },
      async signOut() {
        fijarSesion(false);
        oyentes.forEach((oyente) => oyente('SIGNED_OUT'));
        return { error: null };
      },
      onAuthStateChange(oyente) {
        oyentes.push(oyente);
        return { data: { subscription: { unsubscribe: () => oyentes.splice(oyentes.indexOf(oyente), 1) } } };
      },
    },
    from: consulta,
    async rpc(nombre, argumentos) {
      const funcion = funciones[nombre];
      return funcion ? funcion(argumentos) : falla(`función desconocida: ${nombre}`);
    },
    storage: { from: almacen },
  };
}
