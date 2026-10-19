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

// El cliente de Supabase necesita WebSocket nativo, que trae Node 22 o más nuevo.
const [mayor] = process.versions.node.split('.').map(Number);
if (mayor < 22) {
  console.error(`Este script necesita Node 22 o más nuevo (tiene ${process.versions.node}). Descargue la versión LTS en nodejs.org.`);
  process.exit(1);
}

// Lee el .env del proyecto si existe (si no, se revisa más abajo qué falta).
try {
  process.loadEnvFile('.env');
} catch {
  // sin .env: puede que las variables ya estén definidas en el entorno
}

const url = process.env.VITE_SUPABASE_URL;
const claveAnon = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !claveAnon || url.includes('TU-PROYECTO')) {
  console.error('Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. Copie .env.example a .env y complételo (ver README).');
  process.exit(1);
}

async function preguntar(texto) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  const respuesta = await rl.question(texto);
  rl.close();
  return respuesta.trim();
}

// Pide la contraseña sin mostrarla en pantalla (importante si se comparte la pantalla en la presentación).
function preguntarOculto(texto) {
  if (!process.stdin.isTTY) return preguntar(texto); // entrada redirigida: no hay pantalla que cuidar
  return new Promise((ok) => {
    let escrito = '';
    const terminar = () => {
      process.stdin.off('data', alDato);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      ok(escrito.trim());
    };
    const alDato = (bloque) => {
      for (const letra of bloque.toString('utf8')) {
        if (letra === '\r' || letra === '\n') return terminar();
        if (letra === '\u0003') {
          terminar();
          process.exit(130); // Ctrl+C
        }
        if (letra === '\u007f' || letra === '\b') escrito = escrito.slice(0, -1);
        else if (letra >= ' ') escrito += letra;
      }
    };
    process.stdout.write(texto);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', alDato);
  });
}

const correo = process.env.DEMO_CORREO || (await preguntar('Correo de la funcionaria: '));
const clave = process.env.DEMO_CLAVE || (await preguntarOculto('Contraseña: '));

const supabase = createClient(url, claveAnon, { auth: { persistSession: false } });

const { error: errorEntrada } = await supabase.auth.signInWithPassword({ email: correo, password: clave });
if (errorEntrada) {
  if (errorEntrada.status === 400 || errorEntrada.code === 'invalid_credentials') {
    console.error('No se pudo iniciar sesión: correo o contraseña incorrectos.');
  } else {
    console.error(`No se pudo conectar con Supabase (${errorEntrada.message}). Revise VITE_SUPABASE_URL, su conexión y que el proyecto no esté pausado.`);
  }
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
