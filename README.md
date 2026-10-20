# Reporte ambiental (prototipo)

![Pruebas](https://github.com/Johan-SnaiderMM/Proyecto-Corpouraba/actions/workflows/ci.yml/badge.svg)

Prototipo web para que cualquier persona reporte una afectación ambiental desde el celular, con foto y ubicación, y para que un funcionario la gestione en un mapa. Funciona solo con datos de prueba y herramientas gratuitas: Vite, Leaflet y Supabase.

Páginas:

| Página | Archivo | Quién la usa |
| --- | --- | --- |
| `/` | `index.html` | Ciudadano: enviar un reporte |
| `/seguimiento.html` | `seguimiento.html` | Ciudadano: ver su ticket (avance, evidencia de la Corporación) y validar si la acción se cumplió |
| `/panel/` | `panel/index.html` | Funcionario: lista, mapa, filtros, responsables, casos pendientes, cambio de estado, evidencia con foto, CSV |

## Panel de trabajo: responsables y casos pendientes

Para que el trabajo no se pierda entre varias personas, cada reporte puede tener un **responsable**:

- **Tomar, soltar y asignar.** En el detalle de un reporte, "Tomar este caso" lo deja a nombre de quien lo toma; también se puede soltar o asignar a otra persona. Cada cambio queda en el historial interno ("Responsable — Ana tomó el caso"). **La persona que reportó no ve nada de esto**, y asignar no cambia la "última actualización" de su ticket.
- **Reglas.** Si el caso no tiene responsable, cualquier funcionario puede tomarlo o asignarlo. Si ya lo tiene, solo ese responsable o un **coordinador** puede cambiarlo. Para nombrar a un coordinador, en el SQL Editor: `update staff set is_admin = true where user_id = 'EL-UUID';`. La base de datos hace cumplir estas reglas; el panel solo evita ofrecer lo que va a fallar.
- **Mis casos.** El filtro "Responsable" tiene "Mis casos", "Sin responsable" y una opción por persona.
- **Requieren atención.** El botón del mismo nombre (con su contador) deja solo los casos que necesitan atención, en este orden de importancia:
  1. **Reabierto por la persona:** respondió "no conforme" y el caso no se ha vuelto a cerrar.
  2. **Sin atender:** sigue "recibido" después de 2 días.
  3. **Sin movimiento:** en revisión, sin cambios hace 7 días o más.

  Cada caso muestra el motivo en texto en la tabla y en su detalle. Los plazos (2 y 7 días) son los valores por omisión de `report_attention()` en `supabase/asignacion.sql`.

Si el panel se publica antes de ejecutar `asignacion.sql`, sigue funcionando: simplemente no muestra responsables ni pendientes.

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

2. Crear un proyecto en [Supabase](https://supabase.com). En **SQL Editor** pegar y ejecutar, en este orden, `supabase/schema.sql`, `supabase/seed.sql`, `supabase/seguimiento.sql` (agrega el ticket, la evidencia y la validación) y `supabase/asignacion.sql` (agrega responsables de caso y casos pendientes). Los dos últimos se pueden ejecutar más de una vez sin problema.
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

## Datos de demostración

Para ensayar la presentación hay 8 reportes inventados en municipios del Urabá, en distintos momentos del proceso (con evidencia, validaciones y un caso reabierto). Se cargan en dos pasos, **después de haber registrado a una funcionaria en `staff`** (paso 4 de "Puesta en marcha"):

1. Ejecute `supabase/demo.sql` en el SQL Editor de Supabase. Se puede repetir: borra y vuelve a crear los reportes DEMO con fechas relativas a hoy (por eso conviene cargarlo **el mismo día de la presentación**; las horas son de Colombia).
   Los 30 reportes genéricos de `seed.sql` quedan por encima de los DEMO en el panel (orden por fecha). Para que la demostración se vea limpia, bórrelos: `delete from reports where description like 'Reporte de prueba%';`
2. Suba las fotos de evidencia (son 7 imágenes de ejemplo, rotuladas "IMAGEN DE EJEMPLO"):

   ```bash
   npm run demo:fotos
   ```

   Pide el correo y la contraseña de la funcionaria (la misma del panel; la contraseña no se muestra al escribirla) y usa la clave `anon` del `.env`: no necesita la clave `service_role`. Requiere **Node 22 o más nuevo**; si algo falla, el mensaje dice qué revisar.

Los casos 1, 2, 3 y 6 quedan con responsable (la primera funcionaria de `staff` por orden alfabético); en el panel, **"Requieren atención"** muestra los casos 3, 7 y 8.

Tickets para la demostración (se escriben con o sin guiones):

| Ticket | Qué muestra |
| --- | --- |
| `DEMO-0001-VALI-DADO` | Atendido y validado como conforme por la persona |
| `DEMO-0002-PORV-ALID` | Atendido, **esperando la validación**: úselo para validar en vivo |
| `DEMO-0003-REAB-IERT` | La persona dijo "no conforme"; el caso volvió a revisión y hubo una segunda visita |
| `DEMO-0004-RECI-BIDO` | Recién recibido |
| `DEMO-0005-DESC-ARTA` | Descartado |
| `DEMO-0006-REVI-SION` | En revisión, con una evidencia |
| `DEMO-0007-SINA-TEND` | Recibido hace 4 días y nadie lo ha mirado (**sin atender**, sin responsable) |
| `DEMO-0008-ESTA-NCAD` | En revisión, sin movimiento hace 9 días (**sin movimiento**, sin responsable) |

Para quitarlos: `delete from reports where tracking_code like 'DEMO%';` (las fotos quedan en Storage, en `report-evidence`; bórrelas desde el panel de Supabase si lo desea). Sus códigos son fáciles de adivinar a propósito: no los use en un proyecto con datos reales.

## Pruebas automáticas

| Qué | Cómo | Qué comprueba |
| --- | --- | --- |
| Web | `npm test` y `npm run build` | Ticket, validaciones del formulario, lógica del captcha y que el sitio compile |
| Base de datos | `bash supabase/tests/ejecutar.sh` | Carga el SQL en un Postgres de verdad y comprueba permisos (RLS), que no se filtren notas internas, la validación del ciudadano, los datos de demostración y el captcha |

En GitHub se ejecutan solas en cada subida (`.github/workflows/ci.yml`): el resultado se ve en la pestaña **Actions** y como marca verde o X roja junto a cada commit. Las pruebas web piden Node 22. Para correr las de la base de datos en su computador hace falta `psql` y un Postgres 14 o más nuevo (las variables `PGHOST`, `PGUSER`, etc. indican a cuál conectarse).

## Captcha (opcional)

Protege el envío de reportes contra robots con [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) (gratuito). Es un módulo **independiente**: sin configurarlo, el formulario funciona igual que antes.

Cómo funciona: con el captcha activo, el formulario ya no llama a Supabase para crear el reporte; envía los datos y el token del captcha a la función `api/crear-reporte.js` (en Vercel), que verifica el token con Cloudflare y recién entonces crea el reporte. Para que un robot no pueda saltarse la página, `supabase/captcha.sql` cierra la puerta directa.

**Activarlo** (en este orden):

1. En Cloudflare (Turnstile > Add site) cree un sitio con el dominio de Vercel. Copie la *Site key* y la *Secret key*.
2. En Vercel (Settings > Environment Variables) agregue:
   - `VITE_TURNSTILE_SITE_KEY`: la Site key (es pública).
   - `TURNSTILE_SECRET_KEY`: la Secret key.
   - `SUPABASE_SERVICE_ROLE_KEY`: la clave `service_role` (Supabase > Project Settings > API). **Es la llave maestra de la base de datos: solo va en Vercel, nunca en el repositorio ni en una variable que empiece por `VITE_`.**
   - Opcional: `TURNSTILE_HOSTNAME` con el dominio, para rechazar tokens creados en otro sitio.

   Vuelva a desplegar.
3. Compruebe en el sitio publicado que se puede enviar un reporte (incluida una foto).
4. Ejecute `supabase/captcha.sql` en el SQL Editor de Supabase.
5. **Compruebe que quedó cerrada la puerta directa.** Este comando debe responder `permission denied for function create_report` (si crea un reporte, el captcha no está protegiendo nada):

   ```bash
   curl -s -X POST "https://TU-PROYECTO.supabase.co/rest/v1/rpc/create_report" \
     -H "apikey: TU-CLAVE-ANON" -H "Content-Type: application/json" \
     -d '{"p_type":"otro","p_description":"prueba del captcha","p_lat":7.8,"p_lng":-76.6}'
   ```

   Si más adelante ejecuta otro SQL que otorgue permisos sobre `create_report`, vuelva a ejecutar `supabase/captcha.sql` y repita esta comprobación.

**Desactivarlo:** ejecute `supabase/captcha-desactivar.sql`, quite `VITE_TURNSTILE_SITE_KEY` en Vercel y vuelva a desplegar. Ambos SQL se pueden repetir sin problema.

**Probarlo con las claves de prueba de Cloudflare** (siempre aprueban): Site key `1x00000000000000000000AA` y Secret key `1x0000000000000000000000000000000AA`. La función `api/` no corre con `npm run dev`; para probar el flujo completo en su computador use `npx vercel dev`.

> **Las claves de prueba solo sirven en su computador o en Preview.** Si la Secret key de prueba queda en Vercel como `TURNSTILE_SECRET_KEY` de producción, *cualquier* texto pasa como token y el captcha no protege nada (con `captcha.sql` aplicado, la API quedaría abierta). La función se niega a trabajar con una clave de prueba cuando `VERCEL_ENV` es `production`, pero no confíe solo en eso: use las claves reales.

Si define `TURNSTILE_HOSTNAME`, debe ser **exactamente** el dominio de producción, sin `https://` (por ejemplo, `mi-proyecto.vercel.app`). Un desajuste rechaza a todo el mundo con `captcha_invalido`; compruébelo enviando un reporte tras desplegar.

**Qué protege y qué no:**
- Protege la *creación* de reportes y la subida de fotos contra robots simples. No detiene a quien resuelve captchas con servicios pagos o navegadores automatizados.
- `/api/crear-reporte` no tiene un límite propio de peticiones: cada intento, aun con un token falso, cuesta una invocación de Vercel y una consulta a Cloudflare. Un límite por IP se configura aparte (Vercel Firewall).
- `get_report_tracking` y `validate_report` siguen abiertas con la clave `anon`: se protegen por el tamaño del código del ticket (64 bits), no por captcha.
- La espera de 30 segundos y el campo trampa del formulario viven en el navegador: ayudan con envíos repetidos de personas, no frenan a un robot.

## Seguridad en pocas líneas

- Con el captcha **activo** (variables en Vercel *y* `supabase/captcha.sql` ejecutado), `create_report` solo lo puede llamar la función del servidor (`service_role`). Definir las variables sin ejecutar el SQL no cierra la puerta directa: cualquiera con la clave `anon` puede seguir creando reportes.
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
- Roles más finos que "coordinador" (por ejemplo, quién puede descartar o reabrir) y alta de funcionarios desde el panel: hoy se registran a mano en `staff`. Depende de cómo trabaje Corpouraba.
- Reparto automático por territorial (Caribe, Centro, Nutibara, Urrao y Atrato), según el municipio del reporte.
- Prueba de que Turnstile u otro CAPTCHA frena el spam, si hace falta.
