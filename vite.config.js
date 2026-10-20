import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const ruta = (archivo) => fileURLToPath(new URL(archivo, import.meta.url));

// Tres páginas de entrada: ciudadano, seguimiento y panel del funcionario.
export default defineConfig({
  // Las pruebas corren en la hora de Colombia (UTC-5) y no en la de quien las lance: los filtros de fecha del panel
  // comparan con el día LOCAL, y en UTC un error de huso horario pasaría inadvertido.
  test: { globalSetup: ['./scripts/zona-horaria.mjs'] },
  build: {
    rollupOptions: {
      input: {
        main: ruta('./index.html'),
        seguimiento: ruta('./seguimiento.html'),
        panel: ruta('./panel/index.html'),
      },
    },
  },
});
