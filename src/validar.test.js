import { describe, it, expect } from 'vitest';
import { validarReporte } from './validar.js';

const valido = {
  tipo: 'tala',
  descripcion: 'Están talando árboles junto al río',
  lat: 7.88,
  lng: -76.63,
};

describe('validarReporte', () => {
  it('acepta un reporte completo', () => {
    expect(validarReporte(valido)).toEqual([]);
  });

  it('rechaza un tipo desconocido', () => {
    expect(validarReporte({ ...valido, tipo: 'otra-cosa' })).toHaveLength(1);
  });

  it('rechaza una descripción corta', () => {
    expect(validarReporte({ ...valido, descripcion: 'poco' })).toHaveLength(1);
  });

  it('no cuenta los espacios de los extremos', () => {
    expect(validarReporte({ ...valido, descripcion: '     corta     ' })).toHaveLength(1);
  });

  it('rechaza una descripción de más de 1000 caracteres', () => {
    expect(validarReporte({ ...valido, descripcion: 'a'.repeat(1001) })).toHaveLength(1);
  });

  it('rechaza si no se marcó el lugar', () => {
    expect(validarReporte({ ...valido, lat: undefined, lng: undefined })).toHaveLength(1);
  });

  it('rechaza coordenadas fuera de rango', () => {
    expect(validarReporte({ ...valido, lat: 91 })).toHaveLength(1);
    expect(validarReporte({ ...valido, lng: -181 })).toHaveLength(1);
  });

  it('acumula varios problemas a la vez', () => {
    expect(validarReporte({})).toHaveLength(3);
  });

  it('rechaza un tipo que no es texto, aunque tenga forma de objeto', () => {
    for (const tipo of [['tala'], { toString: 1, valueOf: 1 }, 42, null, undefined]) {
      expect(validarReporte({ ...valido, tipo })).toHaveLength(1);
    }
  });

  it('cuenta caracteres y no unidades UTF-16 (un emoji es uno solo)', () => {
    expect(validarReporte({ ...valido, descripcion: '😀😀😀😀😀' })).toHaveLength(1); // 5 caracteres, aunque length sea 10
    expect(validarReporte({ ...valido, descripcion: '😀'.repeat(10) })).toEqual([]);
    expect(validarReporte({ ...valido, descripcion: 'a'.repeat(1000) })).toEqual([]);
    expect(validarReporte({ ...valido, descripcion: 'a'.repeat(1001) })).toHaveLength(1);
  });

  it('rechaza el carácter nulo, que la base de datos no puede guardar', () => {
    expect(validarReporte({ ...valido, descripcion: 'Talan árboles\u0000 en el río' })).toHaveLength(1);
  });

  it('rechaza una descripción que no es texto', () => {
    expect(validarReporte({ ...valido, descripcion: 12345678901234 })).toHaveLength(1);
    expect(validarReporte({ ...valido, descripcion: ['uno', 'dos'] })).toHaveLength(1);
  });
});
