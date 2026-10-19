import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { COLOR_ESTADO, ESTADOS, TIPOS } from './etiquetas.js';

// Apartadó (Antioquia), usado como centro inicial del mapa.
export const CENTRO_INICIAL = [7.88, -76.63];

export function crearMapa(idElemento, zoom = 11) {
  const mapa = L.map(idElemento).setView(CENTRO_INICIAL, zoom);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap',
  }).addTo(mapa);
  return mapa;
}

export function pedirUbicacion() {
  return new Promise((ok, fallo) => {
    if (!('geolocation' in navigator)) {
      fallo(new Error('Este dispositivo no permite obtener la ubicación.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude }),
      fallo,
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

// Deja marcar un punto tocando el mapa. Se usan círculos y no los pines por defecto de Leaflet,
// porque esos pines suelen salir rotos al empaquetar con Vite.
export function selectorDePunto(mapa, alCambiar) {
  let marcador = null;

  function fijar(lat, lng) {
    if (marcador) {
      marcador.setLatLng([lat, lng]);
    } else {
      marcador = L.circleMarker([lat, lng], {
        radius: 10,
        color: '#2d2f6e',
        weight: 3,
        fillOpacity: 0.4,
      }).addTo(mapa);
    }
    alCambiar({ lat, lng });
  }

  mapa.on('click', (e) => fijar(e.latlng.lat, e.latlng.lng));
  return { fijar };
}

export function crearCapa(mapa) {
  return L.layerGroup().addTo(mapa);
}

// Dibuja los reportes como círculos coloreados por estado. El estado también va escrito en el
// texto del marcador, para que el color no sea lo único que lo indica.
export function dibujarReportes(capa, reportes, alElegir) {
  capa.clearLayers();
  const marcadores = new Map();

  for (const r of reportes) {
    const texto = document.createElement('div');
    texto.textContent = `${TIPOS[r.type]} · ${ESTADOS[r.status]}`;

    const marcador = L.circleMarker([r.lat, r.lng], {
      radius: 9,
      color: COLOR_ESTADO[r.status],
      weight: 3,
      fillOpacity: 0.5,
    }).bindPopup(texto);

    marcador.on('click', () => alElegir(r.id));
    marcador.addTo(capa);
    marcadores.set(r.id, marcador);
  }
  return marcadores;
}

export function enfocar(mapa, lat, lng) {
  mapa.setView([lat, lng], Math.max(mapa.getZoom(), 14));
}
