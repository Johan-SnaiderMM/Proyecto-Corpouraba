import { createClient } from '@supabase/supabase-js';
import { crearClienteDemo } from './demo.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const clave = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Sin las variables de Supabase la aplicación arranca en modo demostración: los 6 casos de ejemplo de
// supabase/demo.sql, guardados en el navegador, sin base de datos externa (ver src/demo.js).
export const MODO_DEMO = !url || !clave;

// La clave "anon" es pública por diseño: lo que protege los datos son las reglas RLS de la base.
// Nunca pongas aquí la clave "service_role".
export const supabase = MODO_DEMO ? crearClienteDemo() : createClient(url, clave);
