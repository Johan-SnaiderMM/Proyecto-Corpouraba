import { beforeEach, describe, expect, it } from 'vitest';
import { CLAVE_DEMO, CORREO_DEMO, TICKETS_EJEMPLO, crearClienteDemo, reiniciarDemo } from './demo.js';

// Pruebas del cliente falso del modo demostración: debe comportarse como las funciones de supabase/seguimiento.sql.
let db;

async function entrar() {
  await db.auth.signInWithPassword({ email: CORREO_DEMO, password: CLAVE_DEMO });
}

async function seguimiento(codigo) {
  return (await db.rpc('get_report_tracking', { p_code: codigo })).data;
}

beforeEach(async () => {
  reiniciarDemo();
  db = crearClienteDemo();
  await db.auth.signOut();
});

describe('sesión y permisos', () => {
  it('sin sesión no se lee ninguna tabla ni se puede cambiar un estado', async () => {
    expect((await db.from('reports').select('*')).data).toEqual([]);
    expect((await db.from('report_events').select('*')).data).toEqual([]);
    const { error } = await db.rpc('change_status', { p_report: 'de000001-0000-4000-8000-000000000001', p_status: 'atendido', p_note: null });
    expect(error?.message).toBe('no autorizado');
  });

  it('las credenciales equivocadas no entran', async () => {
    const { error } = await db.auth.signInWithPassword({ email: CORREO_DEMO, password: 'otra' });
    expect(error).not.toBeNull();
    expect((await db.auth.getSession()).data.session).toBeNull();
  });

  it('con sesión la funcionaria ve los 6 casos de ejemplo', async () => {
    await entrar();
    const { data } = await db.from('reports').select('*').order('created_at', { ascending: false });
    expect(data).toHaveLength(6);
    expect((await db.from('staff').select('full_name').maybeSingle()).data?.full_name).toBeTruthy();
  });
});

describe('casos de ejemplo', () => {
  it('todos los tickets de ejemplo existen', async () => {
    for (const { codigo } of TICKETS_EJEMPLO) expect((await seguimiento(codigo))?.codigo, codigo).toBe(codigo);
  });

  it('el ticket se busca con o sin guiones y en minúsculas', async () => {
    expect((await seguimiento('demo-0002-porv-alid'))?.codigo).toBe('DEMO0002PORVALID');
  });

  it('un código que no existe devuelve null', async () => {
    expect(await seguimiento('NOEXISTE')).toBeNull();
  });

  it('el ciudadano nunca recibe notas internas', async () => {
    const texto = JSON.stringify(await seguimiento('DEMO0003REABIERT'));
    expect(texto).not.toContain('Asignado a la Territorial');
    expect(texto).not.toContain('staff_id');
  });

  it('cada caso muestra lo que cuenta la historia', async () => {
    const validado = await seguimiento('DEMO0001VALIDADO');
    expect(validado.estado).toBe('atendido');
    expect(validado.validacion.veredicto).toBe('conforme');
    expect(validado.puede_validar).toBe(false);
    expect(validado.evidencias).toHaveLength(2);

    const pendiente = await seguimiento('DEMO0002PORVALID');
    expect(pendiente.puede_validar).toBe(true);
    expect(pendiente.cierre).not.toBeNull();

    const reabierto = await seguimiento('DEMO0003REABIERT');
    expect(reabierto.estado).toBe('en_revision');
    expect(reabierto.validacion.veredicto).toBe('no_conforme');
    expect(reabierto.puede_validar).toBe(false);

    expect((await seguimiento('DEMO0004RECIBIDO')).estado).toBe('recibido');
    expect((await seguimiento('DEMO0005DESCARTA')).estado).toBe('descartado');
  });
});

describe('crear un reporte', () => {
  it('crea un ticket de 16 caracteres que se puede consultar', async () => {
    const { data: codigo } = await db.rpc('create_report', { p_type: 'quema', p_description: ' Humo en el barrio ', p_lat: 7.88, p_lng: -76.63, p_photo_path: null });
    expect(codigo).toMatch(/^[0-9A-F]{16}$/);
    const t = await seguimiento(codigo);
    expect(t.estado).toBe('recibido');
    expect(t.eventos).toHaveLength(1);

    await entrar();
    const { data } = await db.from('reports').select('*');
    expect(data.find((r) => r.tracking_code === codigo).description).toBe('Humo en el barrio');
  });
});

describe('validación del ciudadano', () => {
  it('conforme: queda validado y no se puede responder dos veces', async () => {
    const antes = await seguimiento('DEMO0002PORVALID');
    const { error } = await db.rpc('validate_report', { p_code: 'DEMO0002PORVALID', p_verdict: 'conforme', p_comment: ' Todo bien ', p_cierre: antes.cierre });
    expect(error).toBeNull();

    const despues = await seguimiento('DEMO0002PORVALID');
    expect(despues.estado).toBe('atendido');
    expect(despues.validacion.comentario).toBe('Todo bien');
    expect(despues.puede_validar).toBe(false);

    const otra = await db.rpc('validate_report', { p_code: 'DEMO0002PORVALID', p_verdict: 'conforme', p_comment: null, p_cierre: antes.cierre });
    expect(otra.error?.message).toBe('este reporte ya fue validado');
  });

  it('no conforme: el caso vuelve a revisión y queda en el historial', async () => {
    const antes = await seguimiento('DEMO0002PORVALID');
    await db.rpc('validate_report', { p_code: 'DEMO0002PORVALID', p_verdict: 'no_conforme', p_comment: 'Siguen talando', p_cierre: antes.cierre });

    const despues = await seguimiento('DEMO0002PORVALID');
    expect(despues.estado).toBe('en_revision');
    expect(despues.eventos.at(-1).clase).toBe('validacion');

    await entrar();
    const { data: eventos } = await db.from('report_events').select('*').eq('report_id', 'de000002-0000-4000-8000-000000000001').order('created_at', { ascending: true }).order('id', { ascending: true });
    expect(eventos.at(-1).note).toBe('Validación ciudadana: NO conforme — Siguen talando');
  });

  it('rechaza una respuesta sobre un cierre que ya cambió, o un caso que no espera validación', async () => {
    const viejo = await db.rpc('validate_report', { p_code: 'DEMO0002PORVALID', p_verdict: 'conforme', p_comment: null, p_cierre: 999 });
    expect(viejo.error?.message).toMatch(/cambió/);
    const recibido = await db.rpc('validate_report', { p_code: 'DEMO0004RECIBIDO', p_verdict: 'conforme', p_comment: null, p_cierre: 1 });
    expect(recibido.error?.message).toBe('este reporte no está esperando validación');
    const mala = await db.rpc('validate_report', { p_code: 'DEMO0002PORVALID', p_verdict: 'tal vez', p_comment: null, p_cierre: 1 });
    expect(mala.error?.message).toBe('respuesta no válida');
  });
});

describe('cambios de la funcionaria', () => {
  const ID = 'de000002-0000-4000-8000-000000000001';

  it('guardar el mismo estado solo agrega una nota y no crea un cierre nuevo', async () => {
    await entrar();
    const antes = await seguimiento('DEMO0002PORVALID');
    await db.rpc('change_status', { p_report: ID, p_status: 'atendido', p_note: 'Nota interna', p_public_note: 'Gracias por esperar' });

    const despues = await seguimiento('DEMO0002PORVALID');
    expect(despues.cierre).toBe(antes.cierre);
    expect(despues.puede_validar).toBe(true);
    expect(despues.nota_publica).toBe('Gracias por esperar');
    expect(despues.eventos.at(-1).clase).toBe('nota');
  });

  it('una nota sin texto público no se muestra al ciudadano ni borra la nota anterior', async () => {
    await entrar();
    const antes = await seguimiento('DEMO0002PORVALID');
    await db.rpc('change_status', { p_report: ID, p_status: 'atendido', p_note: 'Solo interna', p_public_note: '' });
    const despues = await seguimiento('DEMO0002PORVALID');
    expect(despues.nota_publica).toBe(antes.nota_publica);
    expect(despues.eventos).toHaveLength(antes.eventos.length);
  });

  it('un cambio de estado crea un cierre nuevo cuando pasa a atendido', async () => {
    await entrar();
    await db.rpc('change_status', { p_report: 'de000006-0000-4000-8000-000000000001', p_status: 'atendido', p_note: 'Listo', p_public_note: 'Atendido' });
    const t = await seguimiento('DEMO0006REVISION');
    expect(t.estado).toBe('atendido');
    expect(t.puede_validar).toBe(true);
  });

  it('registrar evidencia la hace visible con el ticket', async () => {
    await entrar();
    const ruta = `${ID}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`;
    const { error } = await db.rpc('add_evidence', { p_report: ID, p_path: ruta, p_caption: ' Nueva visita ' });
    expect(error).toBeNull();
    const t = await seguimiento('DEMO0002PORVALID');
    expect(t.evidencias.at(-1)).toMatchObject({ ruta, descripcion: 'Nueva visita' });
  });

  it('rechaza una ruta de evidencia de otro reporte', async () => {
    await entrar();
    const { error } = await db.rpc('add_evidence', { p_report: ID, p_path: 'otro/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg', p_caption: 'x' });
    expect(error?.message).toBe('ruta de evidencia no válida');
  });
});

describe('fotos', () => {
  it('las de ejemplo apuntan a public/demo-fotos y las subidas se leen de vuelta', async () => {
    const bucket = db.storage.from('report-evidence');
    const ejemplo = 'de000001-0000-4000-8000-000000000001/ee010100-0000-4000-8000-000000000000.jpg';
    expect(bucket.getPublicUrl(ejemplo).data.publicUrl).toBe('/demo-fotos/de000001-0000-4000-8000-000000000001__ee010100-0000-4000-8000-000000000000.jpg');

    const subida = 'de000002-0000-4000-8000-000000000001/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg';
    await bucket.upload(subida, new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }));
    expect(bucket.getPublicUrl(subida).data.publicUrl).toMatch(/^data:image\/jpeg;base64,/);
    await bucket.remove([subida]);
    expect(bucket.getPublicUrl(subida).data.publicUrl).toMatch(/^\/demo-fotos\//);
  });
});
