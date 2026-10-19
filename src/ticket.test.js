import { describe, expect, it } from 'vitest';
import { armarLinea, calcularPasos, formatearCodigo, normalizarCodigo, textoEvento } from './ticket.js';

describe('código del ticket', () => {
  it('lo normaliza sin guiones, espacios ni minúsculas', () => {
    expect(normalizarCodigo(' a65e-d099 1e33 ')).toBe('A65ED0991E33');
    expect(normalizarCodigo(null)).toBe('');
  });

  it('lo agrupa de 4 en 4, también el código antiguo de 8 caracteres', () => {
    expect(formatearCodigo('A65ED0991E33')).toBe('A65E-D099-1E33');
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

  it('descartado termina en su propio paso', () => {
    const pasos = calcularPasos({ estado: 'descartado' });
    expect(pasos.map((p) => p.clave)).toEqual(['recibido', 'en_revision', 'descartado']);
    expect(pasos.at(-1).estado).toBe('actual');
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
