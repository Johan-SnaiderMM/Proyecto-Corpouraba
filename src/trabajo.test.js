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
