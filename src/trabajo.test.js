import { describe, expect, it } from 'vitest';
import { filtrarReportes, mapaDeAtencion, nombreDelResponsable, puedeCambiarResponsable, textoDelMotivo } from './trabajo.js';

const YO = 'aaaa';
const OTRA = 'bbbb';
const reportes = [
  { id: '1', type: 'tala', status: 'recibido', created_at: '2026-10-10T12:00:00', assigned_to: null },
  { id: '2', type: 'quema', status: 'en_revision', created_at: '2026-10-12T12:00:00', assigned_to: YO },
  { id: '3', type: 'tala', status: 'en_revision', created_at: '2026-10-14T12:00:00', assigned_to: OTRA },
  { id: '4', type: 'tala', status: 'atendido', created_at: '2026-10-16T12:00:00', assigned_to: YO },
];
const personal = [
  { user_id: YO, full_name: 'Ana', is_admin: false },
  { user_id: OTRA, full_name: 'Beto', is_admin: false },
];
const ids = (lista) => lista.map((r) => r.id);
const sinFiltros = { tipo: '', estado: '', desde: '', hasta: '', responsable: '', soloAtencion: false };
const filtrar = (f, ctx) => ids(filtrarReportes(reportes, { ...sinFiltros, ...f }, { miId: YO, ...ctx }));

describe('filtros del panel', () => {
  it('sin filtros devuelve todo, en el mismo orden', () => {
    expect(filtrar({})).toEqual(['1', '2', '3', '4']);
  });

  it('"mis casos" solo trae los de la persona', () => {
    expect(filtrar({ responsable: 'mios' })).toEqual(['2', '4']);
  });

  it('"sin responsable" trae los que nadie tiene', () => {
    expect(filtrar({ responsable: 'sin' })).toEqual(['1']);
  });

  it('se puede filtrar por una persona concreta', () => {
    expect(filtrar({ responsable: OTRA })).toEqual(['3']);
  });

  it('combina responsable con tipo y estado', () => {
    expect(filtrar({ responsable: 'mios', estado: 'en_revision' })).toEqual(['2']);
    expect(filtrar({ tipo: 'tala', responsable: 'mios' })).toEqual(['4']);
  });

  it('las fechas incluyen el día inicial y el final completos', () => {
    expect(filtrar({ desde: '2026-10-12', hasta: '2026-10-14' })).toEqual(['2', '3']);
  });
});

describe('casos que necesitan atención', () => {
  const atencion = mapaDeAtencion([
    { report_id: '1', motivos: ['sin_atender'], dias: 4 },
    { report_id: '3', motivos: ['estancado'], dias: 9 },
    { report_id: '2', motivos: ['reabierto'], dias: 1 },
  ]);

  it('el filtro deja solo los que necesitan atención', () => {
    expect(filtrar({ soloAtencion: true }, { atencion }).sort()).toEqual(['1', '2', '3']);
  });

  it('los ordena: reabiertos primero, luego sin atender, luego estancados', () => {
    expect(filtrar({ soloAtencion: true }, { atencion })).toEqual(['2', '1', '3']);
  });

  it('a igual importancia, primero el que lleva más días', () => {
    const dos = mapaDeAtencion([
      { report_id: '1', motivos: ['sin_atender'], dias: 3 },
      { report_id: '3', motivos: ['sin_atender'], dias: 8 },
    ]);
    expect(filtrar({ soloAtencion: true }, { atencion: dos })).toEqual(['3', '1']);
  });

  it('un caso con varios motivos cuenta por el más importante', () => {
    const varios = mapaDeAtencion([
      { report_id: '3', motivos: ['estancado', 'reabierto'], dias: 9 },
      { report_id: '1', motivos: ['sin_atender'], dias: 30 },
    ]);
    expect(filtrar({ soloAtencion: true }, { atencion: varios })).toEqual(['3', '1']);
  });

  it('se combina con "mis casos"', () => {
    expect(filtrar({ soloAtencion: true, responsable: 'mios' }, { atencion })).toEqual(['2']);
  });

  it('sin datos de atención no revienta', () => {
    expect(mapaDeAtencion(null).size).toBe(0);
    expect(filtrar({ soloAtencion: true })).toEqual([]);
  });

  it('describe los motivos en español claro', () => {
    expect(textoDelMotivo('reabierto', 1)).toBe('Reabierto por la persona');
    expect(textoDelMotivo('sin_atender', 1)).toBe('Sin atender hace 1 día');
    expect(textoDelMotivo('estancado', 9)).toBe('Sin movimiento hace 9 días');
    expect(textoDelMotivo('sin_atender', 0)).toBe('Sin atender');
  });
});

describe('responsables', () => {
  it('muestra "Sin responsable", "Usted" o el nombre', () => {
    expect(nombreDelResponsable(reportes[0], personal, YO)).toBe('Sin responsable');
    expect(nombreDelResponsable(reportes[1], personal, YO)).toBe('Usted');
    expect(nombreDelResponsable(reportes[2], personal, YO)).toBe('Beto');
    expect(nombreDelResponsable({ assigned_to: 'zzzz' }, personal, YO)).toBe('Otra persona');
  });

  it('solo el responsable o un coordinador cambian un caso que ya tiene dueño', () => {
    expect(puedeCambiarResponsable(reportes[0], YO, false)).toBe(true); // sin dueño: cualquiera
    expect(puedeCambiarResponsable(reportes[1], YO, false)).toBe(true); // es mío
    expect(puedeCambiarResponsable(reportes[2], YO, false)).toBe(false); // es de otra persona
    expect(puedeCambiarResponsable(reportes[2], YO, true)).toBe(true); // coordinador
  });
});

// ---- Casos límite (revisión de corrección) ----

describe('"Mis casos" sin saber quién soy', () => {
  it('con miId nulo o ausente no trae nada (ni los casos sin responsable)', () => {
    expect(filtrar({ responsable: 'mios' }, { miId: null })).toEqual([]);
    expect(filtrar({ responsable: 'mios' }, { miId: undefined })).toEqual([]);
  });
});

describe('filtros de fecha en los bordes del día (hora local, como se muestran en la tabla)', () => {
  // created_at llega de la base como instante UTC; el filtro compara con el día LOCAL de quien mira el panel.
  const local = (a, m, d, h = 0, mi = 0, s = 0, ms = 0) => new Date(a, m - 1, d, h, mi, s, ms).toISOString();
  const bordes = [
    { id: 'antes', created_at: local(2026, 10, 11, 23, 59, 59, 999) },
    { id: 'abre', created_at: local(2026, 10, 12, 0, 0, 0, 0) },
    { id: 'medio', created_at: local(2026, 10, 13, 12) },
    { id: 'cierra', created_at: local(2026, 10, 14, 23, 59, 59, 999) },
    { id: 'despues', created_at: local(2026, 10, 15, 0, 0, 0, 0) },
  ];
  const f = (filtros) => ids(filtrarReportes(bordes, { ...sinFiltros, ...filtros }, { miId: YO }));

  it('"desde" incluye el primer milisegundo del día y deja fuera el último del día anterior', () => {
    expect(f({ desde: '2026-10-12' })).toEqual(['abre', 'medio', 'cierra', 'despues']);
  });

  it('"hasta" incluye el último milisegundo del día y deja fuera el primero del siguiente', () => {
    expect(f({ hasta: '2026-10-14' })).toEqual(['antes', 'abre', 'medio', 'cierra']);
  });

  it('un solo día', () => {
    expect(f({ desde: '2026-10-14', hasta: '2026-10-14' })).toEqual(['cierra']);
  });

  it('con desde posterior a hasta no sale nada', () => {
    expect(f({ desde: '2026-10-14', hasta: '2026-10-12' })).toEqual([]);
  });
});

describe('orden de los casos que necesitan atención: casos raros', () => {
  it('un motivo desconocido o sin motivos queda después de los conocidos', () => {
    // 'a' tiene un motivo que este código no conoce; 'b' una lista vacía; 'c' un motivo conocido de poca importancia.
    const lista = ['a', 'b', 'c'].map((id) => ({ id, created_at: '2026-10-10T12:00:00', assigned_to: null }));
    const orden = ids(filtrarReportes(lista, { ...sinFiltros, soloAtencion: true }, {
      miId: YO,
      atencion: mapaDeAtencion([
        { report_id: 'a', motivos: ['inventado'], dias: 99 },
        { report_id: 'b', motivos: [], dias: 99 },
        { report_id: 'c', motivos: ['estancado'], dias: 7 },
      ]),
    }));
    expect(orden[0]).toBe('c');
    expect(orden.slice(1).sort()).toEqual(['a', 'b']);
  });

  it('los empates completos conservan el orden original (la lista ya viene de más nuevo a más viejo)', () => {
    const lista = Array.from({ length: 40 }, (_, i) => ({ id: `r${i}`, created_at: '2026-10-10T12:00:00' }));
    const atencion = mapaDeAtencion(lista.map((r) => ({ report_id: r.id, motivos: ['sin_atender'], dias: 3 })));
    expect(ids(filtrarReportes(lista, { ...sinFiltros, soloAtencion: true }, { miId: YO, atencion }))).toEqual(lista.map((r) => r.id));
  });

  it('sin el botón activado el orden NO cambia aunque haya datos de atención', () => {
    const atencion = mapaDeAtencion([
      { report_id: '3', motivos: ['reabierto'], dias: 1 },
      { report_id: '1', motivos: ['estancado'], dias: 50 },
    ]);
    expect(filtrar({}, { atencion })).toEqual(['1', '2', '3', '4']);
  });

  it('un id que está en atención pero no en la lista (por ejemplo, fuera del límite de filas) no aparece ni rompe', () => {
    const atencion = mapaDeAtencion([{ report_id: 'fantasma', motivos: ['reabierto'], dias: 1 }]);
    expect(filtrar({ soloAtencion: true }, { atencion })).toEqual([]);
  });

  it('tolera filas incompletas de la base', () => {
    const atencion = mapaDeAtencion([{ report_id: '1', motivos: null, dias: null }]);
    expect(atencion.get('1')).toEqual({ motivos: [], dias: 0 });
  });

  it('un motivo que no existe se muestra tal cual, sin tropezar con propiedades de Object', () => {
    expect(textoDelMotivo('constructor', 0)).toBe('constructor');
    expect(textoDelMotivo('toString', 0)).toBe('toString');
  });
});
