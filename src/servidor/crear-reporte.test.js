import { describe, expect, it, vi } from 'vitest';
import { crearReporte } from './crear-reporte.js';
import handler from '../../api/crear-reporte.js';

const ENTORNO = {
  TURNSTILE_SECRET_KEY: 'secreto-turnstile',
  SUPABASE_URL: 'https://proyecto.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'clave-servicio',
};

const CUERPO = { tipo: 'tala', descripcion: '  Talan árboles junto al río  ', lat: 7.88, lng: -76.63, conFoto: false, token: 'token-bueno' };

// Servicios simulados: Turnstile (fetch) y Supabase.
function montar({ turnstile = { success: true }, rpc = { data: 'A65ED0991E33F00D', error: null }, firmada = { data: { token: 'permiso' }, error: null }, falloRed = false } = {}) {
  const verificar = falloRed
    ? vi.fn().mockRejectedValue(new Error('sin red'))
    : vi.fn().mockResolvedValue({ json: async () => turnstile });
  const crearUrlFirmada = vi.fn().mockResolvedValue(firmada);
  const llamarRpc = vi.fn().mockResolvedValue(rpc);
  const crearCliente = vi.fn(() => ({ rpc: llamarRpc, storage: { from: vi.fn(() => ({ createSignedUploadUrl: crearUrlFirmada })) } }));
  return { verificar, crearUrlFirmada, llamarRpc, crearCliente };
}

const ejecutar = (extra = {}, s = montar(), entorno = ENTORNO) =>
  crearReporte({ cuerpo: { ...CUERPO, ...extra }, ip: '203.0.113.9', entorno, verificar: s.verificar, crearCliente: s.crearCliente });

describe('crear reporte con captcha', () => {
  it('con un token válido crea el reporte con los datos limpios y devuelve el ticket', async () => {
    const s = montar();
    const r = await ejecutar({}, s);
    expect(r).toEqual({ estado: 200, cuerpo: { codigo: 'A65ED0991E33F00D', subida: null } });
    expect(s.llamarRpc).toHaveBeenCalledWith('create_report', {
      p_type: 'tala',
      p_description: 'Talan árboles junto al río',
      p_lat: 7.88,
      p_lng: -76.63,
      p_photo_path: null,
    });
    expect(s.crearUrlFirmada).not.toHaveBeenCalled();
  });

  it('manda a Cloudflare el secreto, el token y la IP', async () => {
    const s = montar();
    await ejecutar({}, s);
    const [url, opciones] = s.verificar.mock.calls[0];
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(opciones.method).toBe('POST');
    expect(opciones.body.get('secret')).toBe('secreto-turnstile');
    expect(opciones.body.get('response')).toBe('token-bueno');
    expect(opciones.body.get('remoteip')).toBe('203.0.113.9');
  });

  it('con foto pide un permiso de subida de un solo uso y lo devuelve', async () => {
    const s = montar();
    const r = await ejecutar({ conFoto: true }, s);
    expect(r.estado).toBe(200);
    expect(r.cuerpo.subida.token).toBe('permiso');
    expect(r.cuerpo.subida.ruta).toMatch(/^[0-9a-f-]{36}\.jpg$/);
    expect(s.llamarRpc.mock.calls[0][1].p_photo_path).toBe(r.cuerpo.subida.ruta);
  });

  it('un token rechazado por Cloudflare no toca la base de datos', async () => {
    const s = montar({ turnstile: { success: false, 'error-codes': ['timeout-or-duplicate'] } });
    const r = await ejecutar({}, s);
    expect(r).toEqual({ estado: 403, cuerpo: { error: 'captcha_invalido' } });
    expect(s.crearCliente).not.toHaveBeenCalled();
    expect(s.llamarRpc).not.toHaveBeenCalled();
  });

  it('sin token no llama ni a Cloudflare ni a la base de datos', async () => {
    const s = montar();
    for (const token of [undefined, '', 123, 'x'.repeat(2049)]) {
      expect((await ejecutar({ token }, s)).estado).toBe(400);
    }
    expect(s.verificar).not.toHaveBeenCalled();
    expect(s.llamarRpc).not.toHaveBeenCalled();
  });

  it('datos inválidos se rechazan antes de gastar el token', async () => {
    const s = montar();
    const r = await ejecutar({ descripcion: 'corta', tipo: 'nada', lat: 999 }, s);
    expect(r.estado).toBe(400);
    expect(r.cuerpo.error).toBe('datos_invalidos');
    expect(r.cuerpo.errores.length).toBeGreaterThanOrEqual(3);
    expect(s.verificar).not.toHaveBeenCalled();
  });

  it('rechaza cuerpos que no son objetos', async () => {
    const s = montar();
    for (const cuerpo of [null, undefined, 'texto', 42, []]) {
      const r = await crearReporte({ cuerpo, entorno: ENTORNO, verificar: s.verificar, crearCliente: s.crearCliente });
      expect(r.estado).toBe(400);
    }
  });

  it('si Cloudflare no responde, avisa sin crear nada', async () => {
    const s = montar({ falloRed: true });
    const r = await ejecutar({}, s);
    expect(r).toEqual({ estado: 502, cuerpo: { error: 'captcha_no_disponible' } });
    expect(s.llamarRpc).not.toHaveBeenCalled();
  });

  it('si Supabase falla, no filtra detalles internos', async () => {
    const s = montar({ rpc: { data: null, error: { message: 'detalle interno secreto de la base' } } });
    const r = await ejecutar({}, s);
    expect(r).toEqual({ estado: 500, cuerpo: { error: 'no_se_pudo_crear' } });
    expect(JSON.stringify(r)).not.toContain('secreto');
  });

  it('exige el sitio correcto si se configura TURNSTILE_HOSTNAME', async () => {
    const entorno = { ...ENTORNO, TURNSTILE_HOSTNAME: 'proyecto.vercel.app' };
    expect((await ejecutar({}, montar({ turnstile: { success: true, hostname: 'otro-sitio.com' } }), entorno)).estado).toBe(403);
    expect((await ejecutar({}, montar({ turnstile: { success: true, hostname: 'proyecto.vercel.app' } }), entorno)).estado).toBe(200);
  });

  it('sin configuración avisa en el servidor y no depende de nada más', async () => {
    const s = montar();
    for (const falta of ['TURNSTILE_SECRET_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
      const entorno = { ...ENTORNO, [falta]: undefined };
      expect((await ejecutar({}, s, entorno)).estado).toBe(500);
    }
    expect(s.verificar).not.toHaveBeenCalled();
  });

  it('acepta VITE_SUPABASE_URL como respaldo de SUPABASE_URL', async () => {
    const s = montar();
    const entorno = { ...ENTORNO, SUPABASE_URL: undefined, VITE_SUPABASE_URL: 'https://otra.supabase.co' };
    expect((await ejecutar({}, s, entorno)).estado).toBe(200);
    expect(s.crearCliente.mock.calls[0][0]).toBe('https://otra.supabase.co');
  });
});

describe('función de Vercel', () => {
  const respuestaFalsa = () => {
    const r = { cabeceras: {}, setHeader: (k, v) => (r.cabeceras[k] = v), status: (c) => ((r.codigo = c), r), json: (c) => ((r.cuerpo = c), r) };
    return r;
  };

  it('solo acepta POST', async () => {
    const res = respuestaFalsa();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.codigo).toBe(405);
    expect(res.cabeceras.Allow).toBe('POST');
    expect(res.cabeceras['Cache-Control']).toBe('no-store');
  });

  it('rechaza un cuerpo de texto que no es JSON', async () => {
    const res = respuestaFalsa();
    await handler({ method: 'POST', headers: {}, body: '{no es json' }, res);
    expect(res.codigo).toBe(400);
  });
});
