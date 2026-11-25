# Taskly

Sistema para registrar proyectos y **seguir el avance** de las tareas de cada integrante del equipo.

- **API:** Node.js + Express + MongoDB (Mongoose), login con JWT
- **Front:** React + Vite
- **Base de datos:** MongoDB local

```
app-taskly/
 ├─ api/   → API (puerto 4000)
 └─ web/   → Front en React (puerto 5173)
```

---

## 1. Qué necesitas tener instalado

| Programa | Versión | Cómo comprobarlo |
|---|---|---|
| Node.js | 20 o superior | `node -v` |
| MongoDB Community Server | 6 o superior | servicio "MongoDB" en marcha en Windows |

**MongoDB en Windows:** descarga *MongoDB Community Server* (MSI) en mongodb.com/try/download/community y, durante la instalación, deja marcada la opción **"Install MongoD as a Service"**. Así queda funcionando en `mongodb://127.0.0.1:27017`.

> Alternativa con Docker: en la carpeta `app-taskly`, ejecuta `docker compose up -d`.

---

## 2. Primera vez: instalar y crear datos de prueba

Abre un terminal en la carpeta `app-taskly`:

```bash
# API
cd api
npm install
copy .env.example .env      # en Windows (en Mac/Linux: cp .env.example .env)
npm run seed                # crea usuarios, proyectos y tareas FALSOS
```

```bash
# Front (en otro terminal)
cd web
npm install
```

> ⚠️ `npm run seed` **borra todo** lo que haya en la base de datos `taskly` y vuelve a crear los datos de prueba.

---

## 3. Uso diario

Dos terminales:

```bash
# Terminal 1
cd api
npm run dev        # API en http://localhost:4000/api
```

```bash
# Terminal 2
cd web
npm run dev        # abre http://localhost:5173
```

### Logins de prueba (los crea el seed)

| Perfil | E-mail | Contraseña |
|---|---|---|
| Admin | admin@taskly.local | admin123 |
| Equipo | ana@taskly.local | 123456 |
| Equipo | joao@taskly.local | 123456 |
| Equipo | maria@taskly.local | 123456 |
| Equipo | pedro@taskly.local | 123456 |
| Equipo | carla@taskly.local | 123456 |

> El seed crea el proyecto **Plataforma AHK**, un ejemplo completo: 7 hitos (Recopilar información, Crear dominios, Moodle 4.5, Propuesta gráfica…), tareas de Awakelab y del cliente, alcance v1 firmado por las dos partes, diario rellenado y adjuntos de ejemplo.

---

## 4. Reglas de acceso

| Acción | Admin | Equipo |
|---|---|---|
| Crear, editar y eliminar proyectos | ✅ | ❌ |
| Crear, editar, eliminar y asignar tareas | ✅ | ❌ |
| Ver proyectos y avance | ✅ todos | ✅ solo aquellos en los que participa |
| Cambiar el estado de sus **propias** tareas | ✅ | ✅ |
| Registrar horas en sus **propias** tareas | ✅ | ✅ |
| Dar de alta usuarios | ✅ | ❌ |

Todo cambio en una tarea (creación, edición, estado, horas) queda registrado en el **historial** de la tarea.

**Atrasada** = plazo vencido y tarea aún no completada (se calcula al momento, no se guarda).

---

## 5. Pantallas

1. **Login**
2. **Proyectos**: tarjetas con estado, % completado, atrasadas y plazo; búsqueda y filtro por estado.
3. **Proyecto**, con 6 pestañas:
   - **Hitos** (vista lineal): hito a hito, con fechas aproximadas, estado calculado a partir de las tareas, entrega vencida, y las tareas de cada uno con el lado (**Awakelab** o **Cliente**), el responsable y el estado. Filtro Todas / Awakelab / Cliente.
   - **Alcance y acuerdo**: lo que **entra** y lo que **no entra** en el proyecto, con versiones y firmas (ver la sección 5.1).
   - **Diario**: lo que pasó cada día, con observaciones (ver la sección 5.3).
   - **Adjuntos**: vídeos, imágenes, documentos y archivos del proyecto, con visualizador (ver la sección 5.2).
   - **Tablero de tareas**: columnas Por hacer / En curso / Completada.
   - **Avance del equipo**: tareas y horas por integrante y por prioridad (no es un ranking).
4. **Mis tareas**: todo lo que tiene asignado el usuario conectado, en todos los proyectos.
5. **Usuarios** (solo admin).
6. **Mi cuenta** (haz clic en tu nombre en el menú): cambiar la contraseña y configurar el **e-mail de envío**.
7. **Página del cliente** (`/acuerdo/<código>`): se abre desde el enlace del e-mail, sin login.

### 5.1 Alcance y acuerdo (firma de las dos partes)

```
Borrador  →  "Enviar a firma"  →  Pendiente  →  las dos firmas  →  Firmado (vigente)
 (admin edita     (e-mail al cliente,      ├─ Awakelab: botón "Firmar por Awakelab"
  las 2 listas)    desde la cuenta de       │   (solo el responsable del proyecto)
                   quien está conectado)    └─ Cliente: botón "Acepto" en el e-mail
```

- Cada proyecto tiene un **responsable de Awakelab** y un **responsable del cliente** (nombre, e-mail y cargo, en "Editar proyecto").
- Cualquier cambio después de firmado: **"Modificar alcance (nueva versión)"**. La versión anterior queda en el historial como *Sustituida*.
- **Comprobante** de cada versión: contenido, quién firmó y cuándo, IP del cliente y los **e-mails adjuntos** (la solicitud y la confirmación de aceptación, enviada al cliente y a quien la envió).
- El enlace del cliente es válido durante 30 días. Hacer clic dos veces no duplica nada. Si se cancela el envío, el enlace deja de aceptar.

**E-mail de envío.** El acuerdo sale desde la cuenta de e-mail **de quien está conectado**, configurada en *Mi cuenta → E-mail de envío* (Gmail/Google Workspace, Outlook/Microsoft 365 u otro servidor SMTP, usando una **contraseña de aplicación**). La contraseña se guarda cifrada en la base de datos.
Mientras nadie lo configure, el sistema queda en **modo prueba**: el e-mail se genera y se adjunta, pero no sale del ordenador, y la pantalla muestra el enlace para que simules el clic del cliente.

> **Importante:** para que un cliente real abra el enlace, Taskly debe estar publicado en una dirección accesible desde internet. Ajusta `APP_URL` en el `.env` con esa dirección. Si solo funciona en local, el enlace `http://localhost:5173/...` solo funciona en tu ordenador.

### 5.2 Adjuntos

Pestaña **Adjuntos** en cada proyecto. Cualquier participante sube y ve archivos; cada uno elimina lo que subió (el admin puede eliminarlo todo).

| Tipo | Extensiones | Cómo se abre |
|---|---|---|
| **Vídeos** | mp4, webm, mov, m4v, ogv (avi y mkv solo descarga) | Reproductor en el propio Taskly, con avance a cualquier punto |
| **Imágenes** | png, jpg, gif, webp, bmp, svg | Visualizador a pantalla completa (miniatura en la lista) |
| **Documentos** | pdf, docx (Word), txt, md (Markdown) · doc, odt y rtf solo descarga | PDF en el lector del navegador, Word y Markdown con formato, texto plano |
| **Archivos** | cualquier otro (zip, xlsx, csv…) | Solo descarga |

- Subida arrastrando o eligiendo en el ordenador, hasta **10 archivos por vez** y **500 MB cada uno** (`MAX_UPLOAD_MB` en el `.env`), con barra de progreso y descripción opcional.
- En el visualizador: las flechas ← → pasan al adjunto siguiente, Esc cierra, botón **Descargar**.
- Los archivos se guardan en la carpeta `api/uploads/<id del proyecto>/` (fuera de Git). Para guardarlos en otro sitio, usa `CARPETA_UPLOADS` en el `.env`. Al eliminar un proyecto, se borran sus adjuntos.
- Los enlaces para ver/descargar son **temporales (30 min)** y solo se generan para quien participa en el proyecto.
- Cada subida aparece en el **diario** del proyecto.

### 5.3 Diario

- Cualquier participante registra lo que pasó en un día: texto con observaciones, **tipo** (Avance, Observación, Problema, Reunión, Cliente), **día** (puede ser retroactivo) e **hito** opcional.
- Si se marca la opción, también aparecen los **eventos automáticos**: cambios de estado y horas en las tareas, y los pasos del acuerdo (enviado, firmado, etc.).
- Cada uno edita/elimina solo lo que escribió (el admin puede editarlo todo). Los eventos automáticos no se pueden modificar.

---

## 6. Rutas de la API

Todas empiezan por `/api` y, salvo el login, exigen la cabecera `Authorization: Bearer <token>`.

| Método | Ruta | Quién | Qué hace |
|---|---|---|---|
| POST | `/auth/login` | todos | Login (`email`, `contrasena`) |
| GET | `/auth/me` | conectado | Datos del usuario conectado |
| PATCH | `/auth/me/contrasena` | conectado | Cambiar la propia contraseña |
| GET | `/usuarios` | admin | Lista paginada (`busqueda`, `pagina`, `limite`) |
| GET | `/usuarios/opciones` | admin | Lista corta para selectores |
| POST | `/usuarios` | admin | Crear usuario |
| PATCH | `/usuarios/:id` | admin | Editar / desactivar usuario |
| GET | `/proyectos` | conectado | Lista paginada con resumen (`busqueda`, `status`, `pagina`) |
| POST | `/proyectos` | admin | Crear proyecto |
| GET | `/proyectos/:id` | participante | Detalle del proyecto |
| PATCH | `/proyectos/:id` | admin | Editar proyecto e integrantes |
| DELETE | `/proyectos/:id` | admin | Eliminar el proyecto y sus tareas |
| GET | `/proyectos/:id/avance` | participante | Avance general, por prioridad y por integrante |
| GET | `/proyectos/:id/tareas` | participante | Tareas (`status`, `responsable`, `prioridad`, `atrasadas`, `hito`, `lado`, `busqueda`, `pagina`) |
| POST | `/proyectos/:id/tareas` | admin | Crear tarea |
| GET | `/tareas/mis` | conectado | Tareas del usuario conectado (`status=abiertas`, etc.) |
| GET | `/tareas/:id` | participante | Detalle de la tarea |
| PATCH | `/tareas/:id` | admin | Editar tarea |
| PATCH | `/tareas/:id/status` | admin o responsable | Cambiar estado |
| POST | `/tareas/:id/horas` | admin o responsable | Registrar horas (`horas`, `nota`) |
| DELETE | `/tareas/:id` | admin | Eliminar tarea |
| GET | `/tareas/:id/historial` | participante | Historial de la tarea |
| GET | `/proyectos/:id/hitos` | participante | Hitos (`conTareas=true` devuelve la vista lineal) |
| POST | `/proyectos/:id/hitos` | admin | Crear hito |
| PATCH / DELETE | `/hitos/:id` | admin | Editar / eliminar hito (las tareas quedan "sin hito") |
| GET | `/proyectos/:id/acuerdos` | participante | Alcance: versión vigente, en curso e historial |
| POST | `/proyectos/:id/acuerdos/borrador` | admin | Abrir (o crear) la versión en borrador |
| PATCH | `/acuerdos/:id` | admin | Editar las listas del borrador (`incluidos`, `noIncluidos`, `observaciones`) |
| POST | `/acuerdos/:id/enviar` | admin | Enviar al cliente por e-mail |
| POST | `/acuerdos/:id/firmar` | responsable de Awakelab | Firmar por Awakelab |
| POST | `/acuerdos/:id/cancelar` | admin | Cancelar el envío |
| GET | `/acuerdos/:id/comprobante` | participante | Comprobante con los e-mails adjuntos |
| GET / POST | `/publico/acuerdos/:token` (`/aceptar`) | cliente, sin login | Ver y aceptar el acuerdo |
| GET / POST | `/proyectos/:id/diario` | participante | Diario por día (`hasta`, `dias`, `automaticos`) / nuevo registro |
| PATCH / DELETE | `/diario/:id` | autor o admin | Editar / eliminar registro |
| GET | `/proyectos/:id/adjuntos` | participante | Adjuntos (`tipo`, `busqueda`) con recuento por tipo |
| POST | `/proyectos/:id/adjuntos` | participante | Subir archivos (multipart, campo `archivos`, hasta 10) |
| GET | `/adjuntos/:id/link` | participante | Enlace temporal para ver/descargar |
| DELETE | `/adjuntos/:id` | quien lo subió o admin | Eliminar adjunto |
| GET | `/archivos/:id?t=…` | enlace temporal | Entrega el archivo (con `&descargar=1` fuerza la descarga) |
| GET / PUT | `/auth/me/email` | conectado | Ver / guardar el e-mail de envío |
| POST | `/auth/me/email/prueba` | conectado | Enviar e-mail de prueba |
| GET | `/chat` | conectado | Mensajes de la conversación con el asistente |
| POST | `/chat` | conectado | Enviar un mensaje al asistente (`mensaje`) |
| DELETE | `/chat` | conectado | Empezar una conversación nueva |

---

## 7. Base de datos (colecciones)

- **usuarios** – nombre, email, contrasena (cifrada), rol (`admin`/`equipo`), funcion, activo, emailEnvio
- **proyectos** – nombre, descripcion, cliente, responsable, responsableCliente (nombre, email, cargo), integrantes[{usuario, funcion}], status, fechaInicio, plazo
- **tareas** – proyecto, hito, lado (`awakelab`/`cliente`), titulo, descripcion, responsable, responsableExterno (nombre de la persona del cliente), status, prioridad, plazo, horasEstimadas, horasGastadas, completadaEn
- **historiales** – tarea, proyecto, usuario, accion, detalles
- **conversaciones** – historial del asistente de chat, una por usuario
- **hitos** – proyecto, titulo, descripcion, fechaInicio, fechaFin, orden (el estado se calcula a partir de las tareas)
- **acuerdos** – versiones del alcance: incluidos, noIncluidos, status, firmas (Awakelab y cliente), e-mails adjuntos
- **registrodiarios** – diario: proyecto, fecha, texto, categoria, hito, autor, tipo (manual/sistema)
- **adjuntos** – proyecto, nombre, tipo (video/imagen/documento/archivo), extension, tamano, enviadoPor; el archivo se guarda en `api/uploads`

Las tareas están en una colección separada (no dentro del proyecto) y las listas están paginadas, con índices en MongoDB. Los totales de avance los calcula la propia base de datos (aggregation), así que el sistema no tiene límite de tamaño de proyecto.

> **Actualización desde la versión en portugués:** los nombres de las colecciones y de los campos cambiaron. Después de actualizar el código, ejecuta `npm run seed` en la carpeta `api` (también borra las colecciones antiguas en portugués).

---

## 8. Asistente de chat (OpenAI)

Botón **Asistente** en la esquina inferior derecha. Escribes en lenguaje normal ("quiero crear un proyecto", "he terminado la tarea de login", "¿cómo va el Portal del Alumno?") y él pregunta lo que falta y lo ejecuta solo.

### Configurar

1. En el archivo `api/.env`, rellena:
   ```
   OPENAI_API_KEY=tu-clave-aqui
   OPENAI_MODEL=gpt-6.1-terra
   OPENAI_REASONING_EFFORT=low
   ```
2. En la carpeta `api`, ejecuta `npm install` (instala la librería `openai`) y reinicia la API (`npm run dev`).

> Nunca pongas la clave en el código, en el front ni en mensajes. Solo va en el `.env`, que no se sube a Git.

### Cómo funciona

```
Front (Chat.jsx) → POST /api/chat → OpenAI elige la función → la API la ejecuta
                                       con los permisos del usuario → OpenAI responde
```

- La IA **no accede a la base de datos**: solo elige qué función usar. Quien la ejecuta es la API, con las **mismas reglas que los botones** (carpeta `api/src/servicios`).
- El **equipo** recibe solo las funciones que tiene permitidas: consultar los proyectos en los que participa, ver tareas, cambiar el estado y registrar horas en sus **propias** tareas.
- Las **eliminaciones** solo ocurren si el asistente preguntó "¿Confirmas…?" en la respuesta anterior **y** el usuario respondió "sí".
- **Crear usuario:** la contraseña se genera automáticamente y solo aparece en la pantalla del admin (no se envía a OpenAI).
- La conversación se guarda por usuario (colección `conversaciones`). "Nueva conversación" borra el historial.
- Cuando el asistente modifica algo, las pantallas abiertas se actualizan solas.

| Función | Quién |
|---|---|
| listar_proyectos, ver_proyecto, listar_tareas, mis_tareas, ver_tarea | todos |
| cambiar_status_tarea, registrar_horas | todos (equipo: solo las propias) |
| crear_proyecto, editar_proyecto, anadir_integrante, quitar_integrante, eliminar_proyecto | admin |
| crear_tarea, editar_tarea, eliminar_tarea | admin |
| listar_usuarios, crear_usuario, editar_usuario | admin |
| ver_hitos, ver_alcance, registrar_diario, ver_diario, listar_adjuntos | todos |
| crear_hito, editar_hito, eliminar_hito, modificar_alcance | admin |

El asistente **no envía el acuerdo ni firma**: eso se hace con los botones de la pestaña *Alcance y acuerdo*.

### Archivos del asistente

| Archivo | Qué hace |
|---|---|
| `api/src/chat/asistente.js` | Conversa con OpenAI y ejecuta el ciclo de funciones |
| `api/src/chat/herramientas.js` | Las funciones disponibles y quién puede usar cada una |
| `api/src/chat/referencias.js` | Encuentra proyectos, tareas y personas por el nombre |
| `api/src/routes/chat.js` | Rutas `GET/POST/DELETE /api/chat` |
| `api/src/models/Conversacion.js` | Historial de las conversaciones |
| `web/src/components/Chat.jsx` | Ventana del chat |

Para **quitar** el asistente: borra esos archivos, la línea `app.use('/api/chat', …)` en `api/src/app.js` y la línea `<Chat />` en `web/src/components/Layout.jsx`. El resto del sistema sigue igual.

### Pruebas automáticas

Con la API en marcha y después de `npm run seed` (en la carpeta `api`):

```bash
node prueba-local/api.mjs                  # login, permisos, proyectos y tareas
node prueba-local/hitos-acuerdo-diario.mjs # hitos, alcance/firmas y diario
node prueba-local/adjuntos.mjs             # adjuntos: subida, enlaces, vídeo, permisos
```

### Probar sin gastar créditos

```bash
cd api
node prueba-local/chat.mjs              # pruebas del asistente con OpenAI simulada
node prueba-local/servidor-simulado.mjs # levanta la API con respuestas simuladas para probar la pantalla
```

### Errores frecuentes

| Mensaje | Qué hacer |
|---|---|
| "el asistente aún no está configurado" | Rellena `OPENAI_API_KEY` en el `.env` y reinicia la API |
| "clave … fue rechazada" | Clave incorrecta o revocada; genera otra en el panel de OpenAI |
| "límite de uso o falta de créditos" | Añade créditos a la cuenta de OpenAI |
| "modelo … no se encontró" | Cambia `OPENAI_MODEL` (p. ej.: `gpt-6-luna`) |
| error que menciona "reasoning" | Deja `OPENAI_REASONING_EFFORT=` vacío |

---

## 9. Próximos pasos sugeridos

- Comentarios en las tareas
- Gráfico de evolución del avance a lo largo del tiempo
- Notificaciones (tarea asignada, plazo próximo)
- Arrastrar tareas entre columnas en el tablero
