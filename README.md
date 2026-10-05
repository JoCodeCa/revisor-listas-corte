# Revisor de Listas de Corte

App web (PWA, sin backend) para comparar la lista de corte que le envías a tu
proveedor de tableros contra el reporte que ellos te regresan, y detectar
automáticamente errores de captura.

## Cómo funciona

1. **Mi lista**: captura tus piezas (cantidad, Lado A, Lado B en **centímetros**,
   igual que en tu hoja de papel) y qué lados llevan tapacanto.
2. **Reporte del proveedor**: sube lo que te regresen — PDF, foto o captura de
   pantalla, o un archivo de texto — (o pega el texto si no tienes archivo) y
   la app extrae automáticamente sus piezas (en **milímetros**). Los PDF con
   texto seleccionable se leen directo (más confiable); las imágenes se leen
   con OCR (Tesseract.js), útil para texto impreso pero revisa siempre la
   tabla resultante antes de comparar.
3. **Comparar**: la app convierte tus medidas a milímetros y empareja cada
   pieza, señalando:
   - **Cantidad incorrecta**
   - **Dimensión incorrecta / falta en el reporte del proveedor**
   - **Orientación invertida** (lados A/B cruzados — útil si el material tiene veta)
   - **Pieza no solicitada** (algo que el proveedor capturó de más)
4. **Correcciones**: genera un texto listo para copiar, descargar o enviar por
   WhatsApp con solo los errores encontrados.

Todo corre en el navegador. Tus datos se guardan únicamente en este
dispositivo (`localStorage`); nada se sube a ningún servidor.

## Captura por foto (OCR)

Hay un botón para subir una foto de tu hoja llenada a mano. Usa Tesseract.js
para intentar leer el texto, pero el reconocimiento de letra manuscrita **no es
confiable** — se muestra solo como referencia para que transcribas tú los
valores a la tabla. No llena la tabla automáticamente.

## Desarrollo local

Es un sitio estático, no requiere build. Basta con abrir `index.html` o
servirlo con cualquier servidor estático, por ejemplo:

```
npx http-server -p 8081
```

### Pruebas del motor de comparación

```
node test-engine.js
```

## Despliegue

Pensado para Firebase Hosting (mismo patrón que los demás proyectos:
`firebase.json` + GitHub Actions). Pendiente de crear el proyecto de Firebase
y el repositorio remoto.
