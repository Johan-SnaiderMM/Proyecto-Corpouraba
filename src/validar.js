import { TIPOS } from './etiquetas.js';

// Devuelve la lista de problemas del reporte; una lista vacía significa que se puede enviar.
export function validarReporte({ tipo, descripcion, lat, lng }) {
  const errores = [];

  if (!Object.hasOwn(TIPOS, tipo)) {
    errores.push('Elija qué ocurre.');
  }

  const texto = (descripcion ?? '').trim();
  if (texto.length < 10) {
    errores.push('Describa lo que vio en al menos 10 caracteres.');
  } else if (texto.length > 1000) {
    errores.push('La descripción no puede pasar de 1000 caracteres.');
  }

  const coordenadasValidas =
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  if (!coordenadasValidas) {
    errores.push('Marque el lugar en el mapa o use su ubicación.');
  }

  return errores;
}
