// Lógica del panel de trabajo: responsables, filtros y casos que necesitan atención.
// Son funciones puras (no tocan la página) para poder probarlas.

// Motivos por los que un caso necesita atención. Los calcula la base de datos (report_attention).
export const MOTIVOS = {
  reabierto: 'Reabierto por la persona',
  sin_atender: 'Sin atender',
  estancado: 'Sin movimiento',
};

// Orden de importancia: primero lo que la persona rechazó, después lo que nadie ha mirado, después lo que se enfrió.
const PRIORIDAD = ['reabierto', 'sin_atender', 'estancado'];

// Convierte las filas de report_attention en un mapa  id del reporte -> { motivos, dias }.
export function mapaDeAtencion(filas) {
  return new Map((filas ?? []).map((f) => [f.report_id, { motivos: f.motivos ?? [], dias: f.dias ?? 0 }]));
}

// "Reabierto por la persona", "Sin atender hace 3 días", ...
export function textoDelMotivo(motivo, dias) {
  const base = MOTIVOS[motivo] ?? motivo;
  if ((motivo === 'sin_atender' || motivo === 'estancado') && dias > 0) {
    return `${base} hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
  }
  return base;
}

function prioridadDe(atencion, id) {
  const motivos = atencion.get(id)?.motivos ?? [];
  const mejor = Math.min(...motivos.map((m) => PRIORIDAD.indexOf(m)).filter((i) => i >= 0), PRIORIDAD.length);
  return mejor;
}

// Quién tiene el caso, para mostrarlo: "Sin responsable", "Usted" o el nombre.
export function nombreDelResponsable(reporte, personal, miId) {
  if (!reporte.assigned_to) return 'Sin responsable';
  if (reporte.assigned_to === miId) return 'Usted';
  return personal.find((p) => p.user_id === reporte.assigned_to)?.full_name ?? 'Otra persona';
}

// Las mismas reglas que impone la base: sin responsable, cualquiera; con responsable, solo él o un coordinador.
export function puedeCambiarResponsable(reporte, miId, soyCoordinador) {
  return !reporte.assigned_to || reporte.assigned_to === miId || Boolean(soyCoordinador);
}

// filtros: { tipo, estado, desde, hasta, responsable, soloAtencion }
//   responsable: '' (todos), 'mios', 'sin' (sin responsable) o el id de una persona.
//   desde y hasta: 'AAAA-MM-DD'.
export function filtrarReportes(reportes, filtros, { miId, atencion = new Map() } = {}) {
  const { tipo, estado, responsable, soloAtencion } = filtros;
  const desde = filtros.desde ? new Date(`${filtros.desde}T00:00:00`) : null;
  const hasta = filtros.hasta ? new Date(`${filtros.hasta}T23:59:59.999`) : null;

  const lista = reportes.filter((r) => {
    const creado = new Date(r.created_at);
    return (
      (!tipo || r.type === tipo) &&
      (!estado || r.status === estado) &&
      (!desde || creado >= desde) &&
      (!hasta || creado <= hasta) &&
      (!responsable ||
        (responsable === 'mios' && r.assigned_to === miId) ||
        (responsable === 'sin' && !r.assigned_to) ||
        r.assigned_to === responsable) &&
      (!soloAtencion || atencion.has(r.id))
    );
  });

  if (!soloAtencion) return lista;
  // Con "requieren atención" se ordena por importancia y, a igual importancia, por los días que llevan esperando.
  return [...lista].sort(
    (a, b) => prioridadDe(atencion, a.id) - prioridadDe(atencion, b.id) || (atencion.get(b.id)?.dias ?? 0) - (atencion.get(a.id)?.dias ?? 0)
  );
}
