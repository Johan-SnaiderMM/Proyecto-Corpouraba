// Función de Vercel: POST /api/crear-reporte. Toda la lógica está en src/servidor/crear-reporte.js.
import { createClient } from '@supabase/supabase-js';
import { crearReporte } from '../src/servidor/crear-reporte.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'metodo_no_permitido' });
  }

  let cuerpo = req.body;
  if (typeof cuerpo === 'string') {
    try {
      cuerpo = JSON.parse(cuerpo);
    } catch {
      return res.status(400).json({ error: 'datos_invalidos' });
    }
  }

  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || undefined;
  const { estado, cuerpo: salida } = await crearReporte({ cuerpo, ip, entorno: process.env, crearCliente: createClient });
  return res.status(estado).json(salida);
}
