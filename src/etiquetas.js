// Textos que ve la gente y colores de cada estado. Las claves son las mismas de la base de datos.
export const TIPOS = {
  tala: 'Tala de árboles',
  quema: 'Quema',
  vertimiento: 'Vertimiento o contaminación del agua',
  fauna: 'Fauna (caza o tráfico)',
  residuos: 'Residuos',
  otro: 'Otro',
};

export const ESTADOS = {
  recibido: 'Recibido',
  en_revision: 'En revisión',
  atendido: 'Atendido',
  descartado: 'Descartado',
};

export const COLOR_ESTADO = {
  recibido: '#b45309',
  en_revision: '#1d4ed8',
  atendido: '#15803d',
  descartado: '#4b5563',
};

export function fecha(iso) {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}
