# Reporte ambiental (prototipo)

Prototipo web para que cualquier persona reporte una afectación ambiental desde el celular, con foto y ubicación, y para que un funcionario la gestione en un mapa. Funciona solo con datos de prueba y herramientas gratuitas: Vite, Leaflet y Supabase.

Páginas:

| Página | Archivo | Quién la usa |
| --- | --- | --- |
| `/` | `index.html` | Ciudadano: enviar un reporte |
| `/seguimiento.html` | `seguimiento.html` | Ciudadano: ver su ticket (avance, evidencia de la Corporación) y validar si la acción se cumplió |
| `/panel/` | `panel/index.html` | Funcionario: lista, mapa, filtros, cambio de estado, evidencia con foto, CSV |

## Ticket, evidencia y validación

Al enviar un reporte, la persona recibe un **ticket** (por ejemplo `A65E-D099-1E33-F00D`) y un enlace directo. Con él puede ver:

- **El avance** en cuatro pasos: Recibido, En revisión, Atendido y Validado por la persona.
- **La evidencia** que sube la Corporación: cada acción registrada en el panel con su foto y su descripción.
- **Solo lo público.** Las notas internas del funcionario nunca salen de la base; el ciudadano ve únicamente la "nota para el ciudadano".

Cuando el caso queda en *Atendido*, la persona puede responder si la acción se cumplió:

- **Sí, se cumplió**: el caso queda como validado.
- **No, el problema continúa**: el caso vuelve a *En revisión* y el funcionario lo ve en el historial como "Ciudadano · …".

Solo se puede responder una vez por cada vez que el caso se marca como atendido. Si el funcionario vuelve a guardar el mismo estado con una nota, no se crea un cierre nuevo ni se pierde la respuesta de la persona.

## Puesta en marcha

Requisitos: Node.js (versión LTS) y una cuenta gratuita en Supabase.

1. Instalar dependencias:

   ```bash
   npm install
   ```

2. Crear un proyecto en [Supabase](https://supabase.com). En **SQL Editor** pegar y ejecutar, en este orden, `supabase/schema.sql`, `supabase/seed.sql` y `supabase/seguimiento.sql` (esta última agrega el ticket, la evidencia y la validación; se puede ejecutar más de una vez sin problema).
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

Otros comandos: `npm test` (pruebas de validación y del ticket), `npm run build` (versión para publicar, en `dist/`).

## Identidad visual

El diseño sigue el **Manual de Identidad Corporativa de CORPOURABA**:

- **Colores del manual:** azul `#2D2F6E`, verde `#2D522D` y los degradados `#4078B0 → #2D2F6E` y `#8DAC3D → #2D522D`. Todos están definidos como variables al inicio de `src/estilos.css`.
- **Tipografía:** el manual pide Gotham Rounded, que es una fuente comercial. Mientras no se tenga la licencia se usa Montserrat (gratuita, empaquetada con `@fontsource-variable/montserrat`, sin pedir nada a servidores externos). Para cambiarla basta con editar `--fuente`.
- **Logo** (`public/img/`): se tomó del manual, sin deformarlo ni recolorearlo. Va sobre fondo blanco en el encabezado, en su versión blanca sobre el verde del pie (abajo a la derecha, como indica el manual) y con 50 px de alto como mínimo en pantalla. `curvas.svg` es un dibujo propio que imita las "curvas en degradé azul y verde" del manual.
- **Pendiente de confirmar con CORPOURABA:** que se pueda usar su nombre y su logo en este prototipo. Mientras tanto, todas las páginas dicen que es un prototipo de práctica y no un canal oficial, y el pie remite a los canales reales (PBX, correo y sitio web del manual).

## Seguridad en pocas líneas

- La clave `anon` es pública por diseño. **Nunca** uses la clave `service_role` en este código ni la subas a GitHub.
- Las tablas tienen RLS: solo los funcionarios (tabla `staff`) las leen. El ciudadano solo llama a `create_report`, `get_report_tracking` y `validate_report`, y sube fotos de su reporte a un bucket privado.
- El ticket es la única llave para ver un reporte y responder su validación, por eso los códigos nuevos tienen 16 caracteres al azar (64 bits). Supabase no limita por sí solo los intentos a las funciones: si el sistema llegara a usarse de verdad, hay que agregar un límite de peticiones (por ejemplo, en Vercel Firewall).
- **`seed.sql` es solo para proyectos de prueba.** Si el proyecto llega a tener reportes reales, no lo ejecute. Los tickets de 8 caracteres de versiones anteriores se pueden calcular: bórrelos o regenérelos.
- El enlace del ticket lleva el código después del `#` (no se envía al servidor ni queda en sus registros) y la página de seguimiento pide no ser indexada y no manda el `Referer`.
- Las fotos de evidencia de la Corporación están en el bucket `report-evidence`, de lectura pública pero sin listado y con nombres aleatorios: solo se llega a una foto con su enlace exacto. No subas fotos con rostros ni datos personales.
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
