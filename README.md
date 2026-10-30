# Revisor de Listas de Corte

App web (PWA, sin backend ni build) para comparar la lista de corte que le envías a tu
proveedor de tableros contra el reporte que ellos te regresan, y detectar
automáticamente errores de captura.

## Cómo funciona

1. **Mi lista**: captura tus piezas (cantidad, Lado A, Lado B en **centímetros**,
   igual que en tu hoja de papel) y qué orillas llevan tapacanto (A1, A2, B1, B2).
   También puedes subir foto(s) de tu hoja escrita a mano: la IA (Gemini) llena la
   tabla y marca en amarillo/rojo los números de los que no estuvo segura.
2. **Reporte del proveedor**: sube lo que te regresen — PDF, foto o captura de
   pantalla (varias a la vez) — o pega el texto. La IA lee las piezas (en
   **milímetros**) y también el cubrecanto del dibujo del Esquema. Si la IA falla,
   se lee solo el texto (PDF.js / OCR con Tesseract.js), sin cubrecanto.
3. **Comparar**: la app convierte tus medidas a milímetros y empareja cada
   pieza, señalando:
   - **Cantidad incorrecta**
   - **Medida incorrecta** (comparte un lado, el otro está mal capturado)
   - **Veta mal orientada** (lados A/B cruzados)
   - **Cubrecanto incorrecto** (solo si el reporte se leyó con IA)
   - **Falta en el reporte** / **Pieza no solicitada**
4. **Correcciones**: genera un mensaje dirigido al proveedor, listo para copiar,
   descargar o enviar por WhatsApp (puedes guardar su teléfono).

Además: modo claro/oscuro/automático (botón de Configuración), "Borrar todo" y
"Compartir a esta app" desde WhatsApp u otras apps (Web Share Target).

## Privacidad

Tus listas se guardan solo en el navegador de este dispositivo (`localStorage`).
Las fotos y PDF que se leen con IA se envían a Gemini (Google, vía Firebase AI
Logic, protegido con App Check) únicamente para leerlos.

## Desarrollo local

Es un sitio estático, no requiere build:

```
npx http-server -p 8081
```

### Pruebas del motor de comparación

```
node test-engine.js
```

## Despliegue

Cada push a `main` corre las pruebas y publica en Firebase Hosting
(proyecto `revisor-cortes-taller`) con GitHub Actions (`.github/workflows/deploy.yml`).
