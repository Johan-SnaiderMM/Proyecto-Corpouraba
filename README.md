# Reporte ambiental (prototipo)

Prototipo web para que cualquier persona reporte una afectación ambiental desde el celular, con foto y ubicación, y para que un funcionario la gestione en un mapa. Funciona solo con datos de prueba y herramientas gratuitas: Vite, Leaflet y Supabase.

Páginas:

| Página | Archivo | Quién la usa |
| --- | --- | --- |
| `/` | `index.html` | Ciudadano: enviar un reporte |
| `/seguimiento.html` | `seguimiento.html` | Ciudadano: consultar el estado con su código |
| `/panel/` | `panel/index.html` | Funcionario: lista, mapa, filtros, cambio de estado, CSV |

## Puesta en marcha

Requisitos: Node.js (versión LTS) y una cuenta gratuita en Supabase.

1. Instalar dependencias:

   ```bash
   npm install
   ```

2. Crear un proyecto en [Supabase](https://supabase.com). En **SQL Editor** pegar y ejecutar `supabase/schema.sql` y después `supabase/seed.sql`.
3. En **Authentication**:
   - Desactivar el registro público de usuarios (Providers > Email > desactivar "Allow new users to sign up").
   - Crear un usuario (Users > Add user) con correo y contraseña.
4. Registrar ese usuario como funcionario. En el SQL Editor, con el UUID que aparece en la lista de usuarios:

   ```sql
   insert into staff (user_id, full_name) values ('PEGAR-AQUI-EL-UUID', 'Funcionario de prueba');
   ```

5. Copiar `.env.example` a `.env` y pegar la URL del proyecto y la clave `anon` (Project Settings > API):

   ```bash
   cp .env.example .env
   ```

6. Arrancar:

   ```bash
   npm run dev
   ```

Otros comandos: `npm test` (pruebas de validación), `npm run build` (versión para publicar, en `dist/`).

## Seguridad en pocas líneas

- La clave `anon` es pública por diseño. **Nunca** uses la clave `service_role` en este código ni la subas a GitHub.
- Las tablas tienen RLS: solo los funcionarios (tabla `staff`) las leen. El ciudadano solo llama a `create_report` y `get_report_status` y sube fotos a un bucket privado.
- Todo texto escrito por ciudadanos se muestra con `textContent`, nunca con `innerHTML`.
- Las fotos se recomprimen en el celular, lo que borra su ubicación EXIF.
- El formulario no pide nombre ni cédula y avisa que se use solo con datos de prueba.

Para comprobarlo: con el cliente sin sesión, `supabase.from('reports').select()` debe devolver una lista vacía y `supabase.rpc('change_status', ...)` debe fallar.

## Publicar

1. Subir el código a GitHub (el archivo `.env` no se sube).
2. Importar el repositorio en Vercel o Netlify con el preset de Vite.
3. Definir `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en el hosting.
4. En Supabase, Authentication > URL Configuration, agregar la dirección que da el hosting.

El GPS y la cámara del celular exigen HTTPS, que el hosting incluye. Los proyectos gratuitos de Supabase se pausan tras un tiempo sin actividad: entrar unos días antes de una presentación.

## Qué falta (del plan)

- Estadísticas con gráficas (Chart.js).
- Instalación como app (manifest y service worker) y cola de reportes sin conexión.
- Aviso en pantalla cuando llega un reporte nuevo.
- Prueba de que Turnstile u otro CAPTCHA frena el spam, si hace falta.
