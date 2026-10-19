import { supabase } from './supabase.js';
import { ESTADOS, TIPOS, fecha } from './etiquetas.js';

const $ = (id) => document.getElementById(id);
const mensaje = $('mensaje');
const panelEstado = $('estado');

function mostrarMensaje(texto) {
  mensaje.hidden = !texto;
  mensaje.textContent = texto ?? '';
}

$('formulario').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  mostrarMensaje('');
  panelEstado.hidden = true;

  const codigo = $('codigo').value.trim();
  if (codigo.length < 4) {
    mostrarMensaje('Escribe el código completo.');
    return;
  }

  const { data, error } = await supabase.rpc('get_report_status', { p_code: codigo });
  if (error) {
    console.error(error);
    mostrarMensaje('No se pudo consultar. Inténtalo de nuevo en un momento.');
    return;
  }
  if (!data || data.length === 0) {
    mostrarMensaje('No encontramos ese código. Revisa que esté bien escrito.');
    return;
  }

  const r = data[0];
  $('e-tipo').textContent = TIPOS[r.tipo] ?? r.tipo;
  $('e-estado').textContent = ESTADOS[r.estado] ?? r.estado;
  $('e-creado').textContent = fecha(r.creado);
  $('e-actualizado').textContent = fecha(r.actualizado);
  $('e-nota').textContent = r.nota_publica || 'Sin notas por ahora.';
  panelEstado.hidden = false;
});
