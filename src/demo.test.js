import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Cada foto de evidencia de supabase/demo.sql debe tener su archivo en supabase/demo/fotos (y al revés):
// si se desalinean, la demostración muestra "La foto no está disponible".
const RAIZ = new URL('../supabase/', import.meta.url);
const sql = readFileSync(new URL('demo.sql', RAIZ), 'utf-8');
const rutas = [...sql.matchAll(/'([0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg)'/g)].map((m) => m[1]);
const archivos = readdirSync(new URL('demo/fotos/', RAIZ)).filter((n) => n.endsWith('.jpg'));

describe('fotos de la demostración', () => {
  it('demo.sql cita al menos una foto', () => {
    expect(rutas.length).toBeGreaterThan(0);
  });

  it('cada ruta de evidencia de demo.sql tiene su archivo', () => {
    for (const ruta of rutas) {
      expect(existsSync(new URL(`demo/fotos/${ruta.replace('/', '__')}`, RAIZ)), ruta).toBe(true);
    }
  });

  it('cada archivo de la carpeta lo usa demo.sql', () => {
    const esperados = new Set(rutas.map((r) => r.replace('/', '__')));
    for (const nombre of archivos) {
      expect(esperados.has(nombre), nombre).toBe(true);
    }
  });

  it('el nombre del archivo trae la carpeta del reporte y no hay rutas repetidas', () => {
    expect(new Set(rutas).size).toBe(rutas.length);
    for (const nombre of archivos) expect(nombre).toMatch(/^[0-9a-f-]{36}__[0-9a-f-]{36}\.jpg$/);
  });
});
