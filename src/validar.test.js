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
});
