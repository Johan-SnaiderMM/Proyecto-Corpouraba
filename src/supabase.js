import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const clave = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !clave) {
  throw new Error('Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el archivo .env');
}

// La clave "anon" es pública por diseño: lo que protege los datos son las reglas RLS de la base.
// Nunca pongas aquí la clave "service_role".
export const supabase = createClient(url, clave);
