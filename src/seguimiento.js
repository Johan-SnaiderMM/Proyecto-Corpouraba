import { supabase, MODO_DEMO } from './supabase.js';
import { montarBannerDemo } from './banner.js';
import { CODIGOS_EJEMPLO } from './demo.js';
import { ESTADOS, TIPOS, fecha } from './etiquetas.js';

montarBannerDemo();

const $ = (id) => document.getElementById(id);
const mensaje = $('mensaje');
const panelEstado = $('estado');

// Pasos que se muestran al ciudadano. "Descartado" no es un paso: reemplaza al último.
const PASOS = ['recibido', 'en_revision', 'atendido'];

function mostrarMensaje(texto) {
  mensaje.hidden = !texto;
  mensaje.textContent = texto ?? '';
}

function dibujarPasos(estado) {
  const pasos = estado === 'descartado' ? ['recibido', 'en_revision', 'descartado'] : PASOS;
  const actual = pasos.indexOf(estado);
  $('e-pasos').replaceChildren(
    ...pasos.map((paso, i) => {
      const item = document.createElement('li');
      item.textContent = ESTADOS[paso];
      if (i < actual) item.classList.add('hecho');
      if (i === actual) {
        item.classList.add('actual');
        item.setAttribute('aria-current', 'step');
      }
      return item;
    })
  );
}

async function consultar(codigo) {
  mostrarMensaje('');
  panelEstado.hidden = true;

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
  dibujarPasos(r.estado);
  $('e-tipo').textContent = TIPOS[r.tipo] ?? r.tipo;
  $('e-estado').textContent = ESTADOS[r.estado] ?? r.estado;
  $('e-estado').dataset.estado = r.estado;
  $('e-creado').textContent = fecha(r.creado);
  $('e-actualizado').textContent = fecha(r.actualizado);
  $('e-nota').textContent = r.nota_publica || 'Sin notas por ahora.';
  panelEstado.hidden = false;
}

$('formulario').addEventListener('submit', (evento) => {
  evento.preventDefault();
  consultar($('codigo').value.trim());
});

// Si llegan con ?codigo=XXXX (por ejemplo, desde el aviso de "reporte enviado"), se consulta de una vez.
const codigoEnEnlace = new URLSearchParams(location.search).get('codigo');
if (codigoEnEnlace) {
  $('codigo').value = codigoEnEnlace;
  consultar(codigoEnEnlace.trim());
}

if (MODO_DEMO) {
  $('pista-demo').hidden = false;
  for (const { codigo, texto } of CODIGOS_EJEMPLO) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'secundario';
    boton.textContent = `${codigo} · ${texto}`;
    boton.addEventListener('click', () => {
      $('codigo').value = codigo;
      consultar(codigo);
    });
    $('codigos-ejemplo').append(boton);
  }
}
