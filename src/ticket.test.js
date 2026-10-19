import { describe, expect, it } from 'vitest';
import {
  armarLinea,
  calcularPasos,
  codigoDeEnlace,
  enlaceDeSeguimiento,
  formatearCodigo,
  normalizarCodigo,
  textoEvento,
} from './ticket.js';

describe('código del ticket', () => {
  it('lo normaliza sin guiones, espacios ni minúsculas', () => {
    expect(normalizarCodigo(' a65e-d099 1e33 ')).toBe('A65ED0991E33');
    expect(normalizarCodigo(null)).toBe('');
  });

  it('lo agrupa de 4 en 4, también el código antiguo de 8 caracteres', () => {
    expect(formatearCodigo('A65ED0991E33')).toBe('A65E-D099-1E33');
    expect(formatearCodigo('a65ed0991e33f00d')).toBe('A65E-D099-1E33-F00D');
    expect(formatearCodigo('a1b2c3d4')).toBe('A1B2-C3D4');
    expect(formatearCodigo('ABCDE')).toBe('ABCD-E');
    expect(formatearCodigo('')).toBe('');
  });
});

describe('pasos del avance', () => {
  const estados = (r) => r.map((p) => p.estado);

  it('recibido: el primer paso es el actual', () => {
    expect(estados(calcularPasos({ estado: 'recibido' }))).toEqual(['actual', 'pendiente', 'pendiente', 'pendiente']);
  });

  it('atendido sin validar: queda pendiente la validación del ciudadano', () => {
    expect(estados(calcularPasos({ estado: 'atendido', validacion: null }))).toEqual(['hecho', 'hecho', 'actual', 'pendiente']);
  });

  it('atendido y confirmado por el ciudadano: todo hecho', () => {
    const pasos = calcularPasos({ estado: 'atendido', validacion: { veredicto: 'conforme' } });
    expect(estados(pasos)).toEqual(['hecho', 'hecho', 'hecho', 'hecho']);
  });

  it('si el ciudadano no quedó conforme el caso vuelve a revisión', () => {
    const pasos = calcularPasos({ estado: 'en_revision', validacion: { veredicto: 'no_conforme' } });
    expect(estados(pasos)).toEqual(['hecho', 'actual', 'pendiente', 'pendiente']);
  });

  it('descartado sin haber pasado por revisión no muestra ese paso', () => {
    const pasos = calcularPasos({ estado: 'descartado', eventos: [{ estado: 'recibido' }, { estado: 'descartado' }] });
    expect(pasos.map((p) => p.clave)).toEqual(['recibido', 'descartado']);
    expect(pasos.at(-1).estado).toBe('actual');
  });

  it('descartado después de una revisión sí la muestra', () => {
    const pasos = calcularPasos({ estado: 'descartado', eventos: [{ estado: 'en_revision' }] });
    expect(pasos.map((p) => p.clave)).toEqual(['recibido', 'en_revision', 'descartado']);
  });
});

describe('línea de tiempo', () => {
  it('mezcla eventos y evidencias en orden cronológico', () => {
    const linea = armarLinea(
      [
        { estado: 'recibido', fecha: '2026-10-01T10:00:00Z' },
        { estado: 'atendido', fecha: '2026-10-03T10:00:00Z' },
      ],
      [{ ruta: 'a/b.jpg', descripcion: 'Visita', fecha: '2026-10-02T10:00:00Z' }]
    );
    expect(linea.map((i) => i.tipo)).toEqual(['evento', 'evidencia', 'evento']);
  });

  it('acepta listas vacías', () => {
    expect(armarLinea()).toEqual([]);
  });
});

describe('texto de un evento', () => {
  it('usa la nota pública si existe', () => {
    expect(textoEvento({ estado: 'atendido', nota: 'Se sembraron 20 árboles' })).toBe('Se sembraron 20 árboles');
  });

  it('usa un texto por defecto si no hay nota', () => {
    expect(textoEvento({ estado: 'en_revision', nota: null })).toMatch(/revisando/);
  });
});

describe('enlace del ticket', () => {
  it('lee el código del fragmento y, si no hay, de la consulta', () => {
    expect(codigoDeEnlace('#codigo=A65ED0991E330000', '')).toBe('A65ED0991E330000');
    expect(codigoDeEnlace('', '?codigo=A65E')).toBe('A65E');
    expect(codigoDeEnlace('', '')).toBe('');
  });

  it('arma un enlace con el código normalizado en el fragmento', () => {
    expect(enlaceDeSeguimiento('https://ejemplo.co', 'a65e-d099-1e33')).toBe('https://ejemplo.co/seguimiento.html#codigo=A65ED0991E33');
  });
});
