import { describe, expect, it } from 'vitest';
import { siguienteIndice } from './pestanas.js';

describe('siguienteIndice (teclado de las pestañas)', () => {
  it('las flechas avanzan y retroceden dando la vuelta', () => {
    expect(siguienteIndice(3, 0, 'ArrowRight')).toBe(1);
    expect(siguienteIndice(3, 2, 'ArrowRight')).toBe(0);
    expect(siguienteIndice(3, 0, 'ArrowLeft')).toBe(2);
    expect(siguienteIndice(3, 1, 'ArrowLeft')).toBe(0);
  });

  it('Inicio y Fin van a los extremos', () => {
    expect(siguienteIndice(4, 2, 'Home')).toBe(0);
    expect(siguienteIndice(4, 1, 'End')).toBe(3);
  });

  it('otras teclas no cambian de pestaña', () => {
    expect(siguienteIndice(3, 1, 'Enter')).toBeNull();
    expect(siguienteIndice(3, 1, 'a')).toBeNull();
  });

  it('sin pestañas visibles no hay a dónde ir', () => {
    expect(siguienteIndice(0, 0, 'ArrowRight')).toBeNull();
  });
});
