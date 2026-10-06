# Revisor de Listas de Corte — notas para Claude

## Forma de trabajar (preferencia del usuario)

- Responder siempre en **español**. Commits también en español, con mensaje descriptivo.
- **Subir los cambios directo a `main`** al terminar cada tarea (commit + push), sin PR,
  para probarlos rápido en línea. Si la sesión trabaja en otra rama, también empujar a `main`
  (`git push origin HEAD:main`, solo si es fast-forward; si no, traer `main` primero).
- Antes de cada push: `node test-engine.js` debe pasar. Si el cambio es visual, revisarlo en
  el navegador (Playwright) en modo claro y oscuro y a ancho de celular.
- Si algo sale mal, se regresa con `git revert` (nunca reescribir historia ni force-push en `main`).
- El push a `main` publica solo en Firebase Hosting (`.github/workflows/deploy.yml`, proyecto
  `revisor-cortes-taller`); las pruebas del motor corren antes y bloquean la publicación si fallan.

## Qué es la app

PWA estática (sin build, sin backend, JS plano) para comparar la lista de corte que el taller
envía (cm, a menudo escrita a mano) contra el reporte que regresa el proveedor de tableros (mm),
detectar errores y redactar el mensaje de correcciones para el proveedor (WhatsApp).

| Archivo | Rol |
|---|---|
| `engine.js` | Lógica pura (probada en Node): `comparar`, `parseReporteProveedor`, `generarMensajeProveedor`. |
| `test-engine.js` | Pruebas del motor: `node test-engine.js`. |
| `app.js` | UI: tablas editables, estado en `localStorage` (`revisor-cortes:v1`), carga de archivos, resultados, configuración. |
| `ia.js` | Lectura con Gemini vía Firebase AI Logic + App Check (hoja manuscrita y reporte del proveedor con cubrecanto). |
| `pdfParser.js` | Texto de PDF con pdf.js (respaldo si la IA falla). |
| `tema.js` | Tema claro/oscuro/automático (`revisor-cortes:tema`), se carga en `<head>`. |
| `sw.js`, `compartir.html`, `manifest.json` | "Compartir a esta app" desde WhatsApp (Web Share Target). |

## Reglas del dominio

- Mi lista en **cm**, proveedor en **mm**; tolerancia `TOLERANCIA_MM = 0.6`.
- Lado A ↔ Base, Lado B ↔ Altura. Lados cruzados = error de veta (`invertida`), no advertencia.
- Cubrecanto: se compara el **conteo** de orillas por lado (A y B), no cuál orilla. Solo si el
  reporte se leyó con IA (si vino de texto, los campos de enchape no existen y no se compara).
- Estados de resultado: `ok`, `cantidad`, `invertida`, `enchape`, `falta`, `sobra`.

## Convenciones

- Código, comentarios y textos de la UI en español; comentarios explican el porqué.
- Colores solo con variables CSS de `style.css` (`:root` + modo oscuro); no usar colores fijos
  nuevos para que ambos temas sigan funcionando.
- `proveedorTelefono` y el tema sobreviven a "Borrar todo"; el resto del estado se reinicia.
