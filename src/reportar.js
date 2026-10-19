import { supabase } from './supabase.js';
import { crearMapa, pedirUbicacion, selectorDePunto } from './mapa.js';
import { comprimirFoto } from './foto.js';
import { validarReporte } from './validar.js';

const ESPERA_ENTRE_ENVIOS_MS = 30_000;

// Sube la foto (si hay) y crea el reporte. Devuelve el código de seguimiento.
async function enviarReporte({ tipo, descripcion, lat, lng, archivoFoto }) {
  let rutaFoto = null;

  if (archivoFoto) {
    const blob = await comprimirFoto(archivoFoto);
    rutaFoto = `${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage
      .from('report-photos')
      .upload(rutaFoto, blob, { contentType: 'image/jpeg' });
    if (error) throw error;
  }

  const { data: codigo, error } = await supabase.rpc('create_report', {
    p_type: tipo,
    p_description: descripcion,
    p_lat: lat,
    p_lng: lng,
    p_photo_path: rutaFoto,
  });
  if (error) throw error;
  return codigo;
}

const $ = (id) => document.getElementById(id);
const formulario = $('formulario');
const bloqueErrores = $('errores');
const botonEnviar = $('btn-enviar');

let punto = null;

const mapa = crearMapa('mapa');
const selector = selectorDePunto(mapa, (p) => {
  punto = p;
  $('coordenadas').textContent = `Lugar marcado: ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
});

$('btn-ubicacion').addEventListener('click', async () => {
  try {
    const p = await pedirUbicacion();
    selector.fijar(p.lat, p.lng);
    mapa.setView([p.lat, p.lng], 16);
  } catch {
    mostrarErrores(['No pudimos obtener tu ubicación. Toca el mapa para marcar el lugar.']);
  }
});

function mostrarErrores(lista) {
  bloqueErrores.hidden = lista.length === 0;
  bloqueErrores.textContent = lista.join(' ');
}

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  mostrarErrores([]);

  const archivoFoto = $('foto').files[0] ?? null;
  const errores = validarReporte({
    tipo: $('tipo').value,
    descripcion: $('descripcion').value,
    lat: punto?.lat,
    lng: punto?.lng,
  });
  if (archivoFoto && !archivoFoto.type.startsWith('image/')) {
    errores.push('El archivo de la foto debe ser una imagen.');
  }
  if (errores.length > 0) {
    mostrarErrores(errores);
    return;
  }

  // Campo trampa: solo un bot lo llena. Se simula un éxito sin enviar nada.
  if ($('sitio_web').value !== '') {
    mostrarResultado('XXXXXXXX');
    return;
  }

  // Freno básico contra envíos repetidos desde el mismo dispositivo.
  const ultimoEnvio = Number(localStorage.getItem('ultimoEnvio') ?? 0);
  if (Date.now() - ultimoEnvio < ESPERA_ENTRE_ENVIOS_MS) {
    mostrarErrores(['Espera unos segundos antes de enviar otro reporte.']);
    return;
  }

  botonEnviar.disabled = true;
  botonEnviar.textContent = 'Enviando…';
  try {
    const codigo = await enviarReporte({
      tipo: $('tipo').value,
      descripcion: $('descripcion').value.trim(),
      lat: punto.lat,
      lng: punto.lng,
      archivoFoto,
    });
    localStorage.setItem('ultimoEnvio', String(Date.now()));
    mostrarResultado(codigo);
  } catch (error) {
    console.error(error);
    mostrarErrores(['No se pudo enviar el reporte. Revisa tu conexión e inténtalo de nuevo.']);
  } finally {
    botonEnviar.disabled = false;
    botonEnviar.textContent = 'Enviar reporte';
  }
});

function mostrarResultado(codigo) {
  $('codigo').textContent = codigo;
  formulario.hidden = true;
  $('resultado').hidden = false;
}

$('btn-otro').addEventListener('click', () => {
  formulario.reset();
  punto = null;
  $('coordenadas').textContent = 'Aún no has marcado un lugar.';
  $('resultado').hidden = true;
  formulario.hidden = false;
  mapa.invalidateSize();
});
