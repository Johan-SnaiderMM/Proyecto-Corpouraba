import { MODO_DEMO } from './supabase.js';
import { reiniciarDemo } from './demo.js';

// Franja de aviso arriba de cada página cuando la aplicación corre en modo demostración.
export function montarBannerDemo() {
  if (!MODO_DEMO) return;

  const franja = document.createElement('div');
  franja.className = 'franja-demo';

  const texto = document.createElement('span');
  texto.textContent = 'Modo demostración: los datos son de prueba y se guardan solo en este navegador.';

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'secundario';
  boton.textContent = 'Reiniciar datos de ejemplo';
  boton.addEventListener('click', () => {
    reiniciarDemo();
    location.reload();
  });

  franja.append(texto, boton);
  document.body.prepend(franja);
}
