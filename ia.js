// Lectura de la hoja escrita a mano usando Gemini (vía Firebase AI Logic).
// A diferencia de un OCR tradicional, el modelo entiende la imagen completa como
// una tabla, así que sabe qué número pertenece a qué columna en vez de leer
// caracter por caracter.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAI, GoogleAIBackend, getGenerativeModel, Schema } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-ai.js';

const firebaseConfig = {
  projectId: 'revisor-cortes-taller',
  appId: '1:840973194482:web:52b8684726750540ccec6b',
  storageBucket: 'revisor-cortes-taller.firebasestorage.app',
  apiKey: 'AIzaSyC5KC17l45WpWrfAEhz1Ey4V8CJ7DDR60s',
  authDomain: 'revisor-cortes-taller.firebaseapp.com',
  messagingSenderId: '840973194482',
};

const firebaseApp = initializeApp(firebaseConfig);
const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });

const esquemaPieza = Schema.object({
  properties: {
    cantidad: Schema.number(),
    ladoA: Schema.number(),
    ladoB: Schema.number(),
    enchapeA1: Schema.boolean(),
    enchapeA2: Schema.boolean(),
    enchapeB1: Schema.boolean(),
    enchapeB2: Schema.boolean(),
  },
});

const esquemaHoja = Schema.object({
  properties: {
    material: Schema.string(),
    cubreCanto: Schema.string(),
    piezas: Schema.array({ items: esquemaPieza }),
  },
  optionalProperties: ['material', 'cubreCanto'],
});

const modelo = getGenerativeModel(ai, {
  model: 'gemini-3.8-flash',
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: esquemaHoja,
  },
});

const PROMPT = `Esta es una foto de una hoja de pedido de corte de un taller de carpintería, escrita a mano.
Es una tabla con estas columnas: No. (ignóralo, es solo el número de fila), Cantidad, Lado A (en centímetros),
Lado B (en centímetros), y 4 casillas de "enchape" o "tapacanto" etiquetadas A1, A2, B1, B2 que pueden estar
marcadas (con una palomita, una X o rellenas) o vacías. También puede haber campos de encabezado "MATERIAL"
y "CUBRE CANTO" escritos a mano arriba de la tabla.

Lee SOLO las filas de la tabla que tengan datos (ignora las filas vacías).
Para cada fila devuelve: cantidad (entero), ladoA y ladoB (números, pueden tener decimales, usa punto
decimal, no coma), y si cada casilla de enchape A1/A2/B1/B2 está marcada (true) o vacía (false).
Prioriza la precisión numérica: si una cifra es ambigua, usa tu mejor estimación según el contexto
(por ejemplo, medidas de piezas de un mueble suelen ser razonables, no extremas).`;

function archivoABase64(file) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result).split(',')[1]);
    lector.onerror = () => reject(lector.error);
    lector.readAsDataURL(file);
  });
}

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Gemini a veces responde "modelo con mucha demanda" (error 500/503) en picos de tráfico;
// suele resolverse solo reintentando a los pocos segundos.
async function generarConReintentos(partes, intentos = 4) {
  for (let i = 1; i <= intentos; i++) {
    try {
      return await modelo.generateContent(partes);
    } catch (err) {
      const esSaturado = /high demand|50[0-9]|overloaded|unavailable/i.test(err.message || '');
      if (!esSaturado || i === intentos) throw err;
      await esperar(3000 * i);
    }
  }
}

async function leerHojaConIA(file) {
  const base64 = await archivoABase64(file);
  const resultado = await generarConReintentos([
    PROMPT,
    { inlineData: { mimeType: file.type || 'image/jpeg', data: base64 } },
  ]);
  const texto = resultado.response.text();
  return JSON.parse(texto);
}

window.leerHojaConIA = leerHojaConIA;
window.dispatchEvent(new Event('ia-lista'));
