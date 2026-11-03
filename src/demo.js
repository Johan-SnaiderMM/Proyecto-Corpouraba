// Modo demostración: imita la parte de Supabase que usa la aplicación, guardando todo en el
// navegador (localStorage). Se activa solo cuando no hay VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
// Con las variables definidas, la aplicación usa Supabase de verdad y este archivo no se usa.

export const CORREO_DEMO = 'funcionario@demo.co';
export const CLAVE_DEMO = 'demo1234';
export const CODIGOS_EJEMPLO = [
  { codigo: 'DEMO0001', texto: 'Recibido' },
  { codigo: 'DEMO0005', texto: 'En revisión' },
  { codigo: 'DEMO0009', texto: 'Atendido' },
];

const CLAVE_DATOS = 'reporteAmbientalDemo';
const CLAVE_FOTOS = 'reporteAmbientalDemoFotos';
const CLAVE_SESION = 'reporteAmbientalDemoSesion';
const PERFIL = { full_name: 'Funcionario de prueba' };

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

function guardarFoto(ruta, urlDatos) {
  try {
    const todas = JSON.parse(localStorage.getItem(CLAVE_FOTOS) ?? '{}');
    todas[ruta] = urlDatos;
    localStorage.setItem(CLAVE_FOTOS, JSON.stringify(todas));
  } catch {
    // Si ya no cabe, la foto queda solo en memoria hasta que se recargue la página.
    fotosMemoria[ruta] = urlDatos;
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

// ---------- Datos de ejemplo ----------

const HORA = 3_600_000;

// [tipo, estado, horas atrás, lat, lng, descripción]
const SEMILLAS = [
  ['tala', 'recibido', 3, 7.8842, -76.6301, 'Están talando varios árboles grandes junto al camino. Se escucha la motosierra desde esta mañana.'],
  ['quema', 'recibido', 6, 7.7581, -76.6522, 'Quema de rastrojo en un lote al lado de la carretera. El humo llega hasta las casas cercanas.'],
  ['vertimiento', 'recibido', 20, 7.8702, -76.6088, 'El caño tiene el agua de color oscuro y mal olor desde hace dos días.'],
  ['residuos', 'recibido', 30, 7.6702, -76.6841, 'Montón de basura y escombros botados al lado de la quebrada.'],
  ['fauna', 'en_revision', 48, 7.9013, -76.6755, 'Una persona vende loros pequeños a la orilla de la vía. Parecen sacados del monte.'],
  ['tala', 'en_revision', 72, 7.8226, -76.5894, 'Tala de árboles en la ribera del río. Ya van varios días y se llevan la madera en camión.'],
  ['vertimiento', 'en_revision', 96, 8.0934, -76.7298, 'Sale un líquido espeso de un tubo hacia el caño, cerca de una finca.'],
  ['quema', 'en_revision', 120, 7.9355, -76.6412, 'Queman llantas en un lote baldío al final del barrio. El humo es negro y huele muy fuerte.'],
  ['residuos', 'atendido', 144, 7.8567, -76.6633, 'Llantas y bolsas de basura acumuladas en el puente. Ya taparon parte del caño.'],
  ['otro', 'atendido', 168, 7.7012, -76.6395, 'Ruido muy fuerte y constante de una planta eléctrica cerca de la ronda del río.'],
  ['tala', 'atendido', 216, 7.7893, -76.7021, 'Cortaron árboles nativos para abrir un potrero junto al nacimiento de agua.'],
  ['vertimiento', 'atendido', 240, 7.8431, -76.6177, 'Lavan vehículos y botan el agua con aceite directamente a la quebrada.'],
  ['fauna', 'atendido', 288, 7.9208, -76.5733, 'Cazadores con perros en la zona de monte. Dicen que buscan ñeques y armadillos.'],
  ['quema', 'descartado', 192, 7.8788, -76.6419, 'Humo en un patio. Resultó ser una cocina de leña, sin afectación al ambiente.'],
  ['residuos', 'descartado', 336, 7.8115, -76.6704, 'Bolsas de basura en una esquina. Ya habían sido recogidas por el camión cuando llegó la visita.'],
  ['tala', 'recibido', 26, 7.7345, -76.7120, 'Veo que aserran guadua y árboles de sombrío al fondo de la finca vecina.'],
  ['otro', 'en_revision', 60, 7.9650, -76.7008, 'Se está secando la ciénaga detrás del colegio y ya no hay peces ni aves como antes.'],
  ['residuos', 'recibido', 12, 7.8960, -76.6200, 'Botaron un colchón, muebles y escombros en el lote de la esquina.'],
];

const NOTAS = {
  recibido: { interna: 'Reporte recibido', publica: null },
  en_revision: {
    interna: 'Se asigna a un técnico para visita.',
    publica: 'Tu reporte está en revisión. Un técnico visitará el lugar.',
  },
  atendido: {
    interna: 'Visita realizada y medidas tomadas.',
    publica: 'Hicimos la visita y tomamos las medidas necesarias. Gracias por avisar.',
  },
  descartado: {
    interna: 'No corresponde a una afectación ambiental.',
    publica: 'Revisamos tu reporte y no encontramos una afectación. Gracias por avisar.',
  },
};

function sembrar() {
  const ahora = Date.now();
  const reportes = [];
  const eventos = [];
  let numeroEvento = 1;

  const agregarEvento = (reporteId, estado, nota, momento) =>
    eventos.push({ id: numeroEvento++, report_id: reporteId, status: estado, note: nota, created_at: new Date(momento).toISOString() });

  SEMILLAS.forEach(([tipo, estado, horas, lat, lng, descripcion], i) => {
    const creado = ahora - horas * HORA;
    const id = `demo-${i + 1}`;
    const ultimo = estado === 'recibido' ? creado : creado + Math.min(horas - 1, estado === 'en_revision' ? 3 : 30) * HORA;

    reportes.push({
      id,
      tracking_code: `DEMO${String(i + 1).padStart(4, '0')}`,
      type: tipo,
      description: descripcion,
      lat,
      lng,
      photo_path: null,
      status: estado,
      public_note: NOTAS[estado].publica,
      created_at: new Date(creado).toISOString(),
      updated_at: new Date(ultimo).toISOString(),
    });

    agregarEvento(id, 'recibido', NOTAS.recibido.interna, creado);
    if (estado !== 'recibido') {
      const pasoRevision = estado === 'en_revision' ? ultimo : creado + 3 * HORA;
      agregarEvento(id, 'en_revision', NOTAS.en_revision.interna, pasoRevision);
      if (estado === 'atendido' || estado === 'descartado') {
        agregarEvento(id, estado, NOTAS[estado].interna, ultimo);
      }
    }
  });

  return { reportes, eventos };
}

// ---------- Cliente falso con la misma forma que usa la aplicación ----------

const ok = (data) => ({ data, error: null });
const falla = (mensaje) => ({ data: null, error: { message: mensaje } });

function nuevoId() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nuevoCodigo() {
  return nuevoId().replaceAll('-', '').slice(0, 8).toUpperCase();
}

function consulta(tabla) {
  const filtros = [];
  let orden = null;
  let unico = false;

  const ejecutar = () => {
    const d = datos();
    let filas;
    if (tabla === 'staff') filas = hayDemoSesion() ? [PERFIL] : [];
    else if (!hayDemoSesion()) filas = []; // igual que las reglas RLS: sin sesión no se lee nada
    else if (tabla === 'reports') filas = [...d.reportes];
    else if (tabla === 'report_events') filas = [...d.eventos];
    else filas = [];

    for (const [columna, valor] of filtros) filas = filas.filter((f) => f[columna] === valor);
    if (orden) {
      const [columna, ascendente] = orden;
      filas.sort((a, b) => (a[columna] < b[columna] ? -1 : a[columna] > b[columna] ? 1 : 0) * (ascendente ? 1 : -1));
    }
    return ok(unico ? (filas[0] ?? null) : filas);
  };

  const q = {
    select: () => q,
    eq: (columna, valor) => (filtros.push([columna, valor]), q),
    order: (columna, { ascending = true } = {}) => ((orden = [columna, ascending]), q),
    maybeSingle: () => ((unico = true), q),
    then: (alCumplir, alFallar) => Promise.resolve(ejecutar()).then(alCumplir, alFallar),
  };
  return q;
}

const funciones = {
  create_report({ p_type, p_description, p_lat, p_lng, p_photo_path }) {
    const d = datos();
    const ahora = new Date().toISOString();
    const reporte = {
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
    d.reportes.push(reporte);
    d.eventos.push({
      id: d.eventos.length + 1,
      report_id: reporte.id,
      status: 'recibido',
      note: NOTAS.recibido.interna,
      created_at: ahora,
    });
    guardarDatos(d);
    return ok(reporte.tracking_code);
  },

  get_report_status({ p_code }) {
    const codigo = String(p_code).trim().toUpperCase();
    const r = datos().reportes.find((x) => x.tracking_code === codigo);
    if (!r) return ok([]);
    return ok([{ tipo: r.type, estado: r.status, nota_publica: r.public_note, creado: r.created_at, actualizado: r.updated_at }]);
  },

  change_status({ p_report, p_status, p_note, p_public_note }) {
    if (!hayDemoSesion()) return falla('no autorizado');
    const d = datos();
    const r = d.reportes.find((x) => x.id === p_report);
    if (!r) return falla('reporte no encontrado');
    const ahora = new Date().toISOString();
    r.status = p_status;
    r.public_note = p_public_note ?? r.public_note;
    r.updated_at = ahora;
    d.eventos.push({ id: d.eventos.length + 1, report_id: r.id, status: p_status, note: p_note ?? null, created_at: ahora });
    guardarDatos(d);
    return ok(null);
  },
};

function blobADataUrl(blob) {
  return new Promise((cumplir, fallar) => {
    const lector = new FileReader();
    lector.onload = () => cumplir(lector.result);
    lector.onerror = () => fallar(lector.error);
    lector.readAsDataURL(blob);
  });
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
    storage: {
      from: () => ({
        async upload(ruta, blob) {
          try {
            guardarFoto(ruta, await blobADataUrl(blob));
            return ok({ path: ruta });
          } catch {
            return falla('No se pudo guardar la foto');
          }
        },
        async createSignedUrl(ruta) {
          const urlDatos = leerFotos()[ruta];
          return urlDatos ? ok({ signedUrl: urlDatos }) : falla('Foto no encontrada');
        },
      }),
    },
  };
}
