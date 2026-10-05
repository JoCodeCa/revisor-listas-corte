// Lectura con IA (Gemini, vía Firebase AI Logic) de la hoja escrita a mano y del
// reporte del proveedor. A diferencia de OCR tradicional, el modelo entiende la
// imagen completa (tabla, dibujos) en vez de leer caracter por caracter, así que
// puede ubicar qué número va en qué columna y detectar marcas visuales como las
// líneas de cubrecanto en los diagramas de pieza.
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

const MODELO_ID = 'gemini-3.5-flash-lite'; // cuota gratuita amplia; ver git log para el porqué

function crearModelo(responseSchema) {
  return getGenerativeModel(ai, {
    model: MODELO_ID,
    generationConfig: { responseMimeType: 'application/json', responseSchema },
  });
}

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
async function generarConReintentos(modelo, partes, intentos = 4) {
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

async function preguntarConArchivo(modelo, prompt, file) {
  const base64 = await archivoABase64(file);
  const resultado = await generarConReintentos(modelo, [
    prompt,
    { inlineData: { mimeType: file.type || 'application/octet-stream', data: base64 } },
  ]);
  return JSON.parse(resultado.response.text());
}

// ===================== Mi lista (hoja escrita a mano) =====================

const esquemaPiezaHoja = Schema.object({
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
    piezas: Schema.array({ items: esquemaPiezaHoja }),
  },
  optionalProperties: ['material', 'cubreCanto'],
});

const modeloHoja = crearModelo(esquemaHoja);

const PROMPT_HOJA = `Esta es una foto de una hoja de pedido de corte de un taller de carpintería, escrita a mano.
Es una tabla con estas columnas: No. (ignóralo, es solo el número de fila), Cantidad, Lado A (en centímetros),
Lado B (en centímetros), y 4 casillas de "enchape" o "tapacanto" etiquetadas A1, A2, B1, B2 que pueden estar
marcadas (con una palomita, una X o rellenas) o vacías. También puede haber campos de encabezado "MATERIAL"
y "CUBRE CANTO" escritos a mano arriba de la tabla.

Lee SOLO las filas de la tabla que tengan datos (ignora las filas vacías).
Para cada fila devuelve: cantidad (entero), ladoA y ladoB (números, pueden tener decimales, usa punto
decimal, no coma), y si cada casilla de enchape A1/A2/B1/B2 está marcada (true) o vacía (false).
Prioriza la precisión numérica: si una cifra es ambigua, usa tu mejor estimación según el contexto
(por ejemplo, medidas de piezas de un mueble suelen ser razonables, no extremas).`;

async function leerHojaConIA(file) {
  return preguntarConArchivo(modeloHoja, PROMPT_HOJA, file);
}

// ===================== Reporte del proveedor (PDF o imagen) =====================

const esquemaPiezaReporte = Schema.object({
  properties: {
    cantidad: Schema.number(),
    base: Schema.number(),
    altura: Schema.number(),
    ladoAEnchapado: Schema.number(),
    ladoBEnchapado: Schema.number(),
    observacion: Schema.string(),
  },
  optionalProperties: ['observacion'],
});

const esquemaReporte = Schema.object({
  properties: {
    cliente: Schema.string(),
    material: Schema.string(),
    piezas: Schema.array({ items: esquemaPiezaReporte }),
  },
  optionalProperties: ['cliente', 'material'],
});

const modeloReporte = crearModelo(esquemaReporte);

const PROMPT_REPORTE = `Este es un reporte generado por un software de optimización de corte de tableros
(melamina/MDF/triplay) para un taller de carpintería. Tiene una sección "Piezas ubicadas" con una tabla de
columnas: Esquema (un dibujo del rectángulo de la pieza), Cant, Base, Altura, Observación.

Cada rectángulo del "Esquema" puede tener una o más de sus 4 orillas dibujadas con una línea más gruesa y de
color (normalmente azul) en vez de la línea delgada normal — esa línea gruesa indica que esa orilla lleva
cubrecanto (tapacanto/enchape). Si el rectángulo no tiene ninguna línea gruesa de color, la pieza no lleva
cubrecanto (a veces esto se confirma con el texto "SIN CH" en la columna Observación).

Regla importante para contar el cubrecanto de cada pieza:
- Una línea gruesa VERTICAL (en la orilla izquierda o derecha del rectángulo) cuenta como "lado A" enchapado.
- Una línea gruesa HORIZONTAL (en la orilla de arriba o abajo del rectángulo) cuenta como "lado B" enchapado.
Un rectángulo puede tener 0, 1 o 2 líneas verticales, y 0, 1 o 2 líneas horizontales, de forma independiente.

Lee SOLO las filas de la tabla "Piezas ubicadas" que tengan datos (ignora filas vacías y la tabla de
"Lista de Planchas Utilizadas", que es una sección distinta).
Para cada fila devuelve: cantidad (entero), base y altura (números, pueden tener decimales, usa punto
decimal), ladoAEnchapado (0, 1 o 2: cuántas líneas gruesas verticales tiene el dibujo), ladoBEnchapado
(0, 1 o 2: cuántas líneas gruesas horizontales), y observacion (el texto de esa columna si tiene, si no
cadena vacía).
También, si puedes leerlos, el nombre del cliente y la descripción del material del encabezado del reporte.
Prioriza la precisión numérica y en el conteo de líneas gruesas: si tienes duda, usa tu mejor estimación.`;

async function leerReporteProveedorConIA(file) {
  return preguntarConArchivo(modeloReporte, PROMPT_REPORTE, file);
}

window.leerHojaConIA = leerHojaConIA;
window.leerReporteProveedorConIA = leerReporteProveedorConIA;
window.dispatchEvent(new Event('ia-lista'));
