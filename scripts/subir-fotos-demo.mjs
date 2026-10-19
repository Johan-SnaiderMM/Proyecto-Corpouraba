// Sube a Supabase las fotos de evidencia de los datos de demostración (carpeta supabase/demo/fotos).
//
// Entra con el correo y la contraseña de una funcionaria (la misma del panel) y la clave "anon":
// no hace falta la clave service_role. Cada archivo se llama "<id del reporte>__<id de la foto>.jpg" y se
// sube a la ruta "<id del reporte>/<id de la foto>.jpg" del bucket "report-evidence", que es la que
// supabase/demo.sql ya dejó registrada.
//
// Uso:   npm run demo:fotos
//        (pide el correo y la contraseña; también se pueden pasar con DEMO_CORREO y DEMO_CLAVE)
import { readdir, readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';

const CARPETA = new URL('../supabase/demo/fotos/', import.meta.url);

const url = process.env.VITE_SUPABASE_URL;
const claveAnon = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !claveAnon) {
  console.error('Falta VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. Copie .env.example a .env y complételo.');
  process.exit(1);
}

// Pregunta un dato; con { oculto: true } no muestra lo que se escribe (para la contraseña).
async function preguntar(texto, { oculto = false } = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (oculto) {
    rl._writeToOutput = (cadena) => {
      if (cadena.includes(texto)) process.stdout.write(cadena);
    };
  }
  const respuesta = await rl.question(texto);
  rl.close();
  if (oculto) process.stdout.write('\n');
  return respuesta.trim();
}

const correo = process.env.DEMO_CORREO || (await preguntar('Correo de la funcionaria: '));
const clave = process.env.DEMO_CLAVE || (await preguntar('Contraseña: ', { oculto: true }));

const supabase = createClient(url, claveAnon, { auth: { persistSession: false } });

const { error: errorEntrada } = await supabase.auth.signInWithPassword({ email: correo, password: clave });
if (errorEntrada) {
  console.error('No se pudo iniciar sesión: correo o contraseña incorrectos.');
  process.exit(1);
}

// Solo un funcionario (tabla staff) puede subir evidencia.
const { data: perfil } = await supabase.from('staff').select('full_name').maybeSingle();
if (!perfil) {
  console.error('Ese usuario no está registrado como funcionario en la tabla staff (ver README, paso 4).');
  process.exit(1);
}

const { data: demo } = await supabase.from('reports').select('id').like('tracking_code', 'DEMO%').limit(1);
if (!demo?.length) {
  console.error('No hay reportes DEMO. Ejecute primero supabase/demo.sql en el SQL Editor de Supabase.');
  process.exit(1);
}

const archivos = (await readdir(CARPETA)).filter((nombre) => nombre.endsWith('.jpg') && nombre.includes('__')).sort();
let subidas = 0;
let yaEstaban = 0;
let fallas = 0;

for (const nombre of archivos) {
  const ruta = nombre.replace('__', '/');
  const contenido = await readFile(new URL(nombre, CARPETA));
  const { error } = await supabase.storage.from('report-evidence').upload(ruta, contenido, { contentType: 'image/jpeg' });

  if (!error) {
    subidas += 1;
    console.log(`  subida    ${ruta}`);
  } else if (error.statusCode === '409' || error.status === 409 || /already exists|duplicate/i.test(error.message ?? '')) {
    yaEstaban += 1;
    console.log(`  ya estaba ${ruta}`);
  } else {
    fallas += 1;
    console.error(`  FALLÓ     ${ruta}: ${error.message}`);
  }
}

await supabase.auth.signOut();
console.log(`\n${subidas} subidas, ${yaEstaban} que ya estaban, ${fallas} con error.`);
process.exit(fallas > 0 ? 1 : 0);
