// Lectura con IA (Gemini, vía Firebase AI Logic) de la hoja escrita a mano y del
// reporte del proveedor. A diferencia de OCR tradicional, el modelo entiende la
// imagen completa (tabla, dibujos) en vez de leer caracter por caracter, así que
// puede ubicar qué número va en qué columna y detectar marcas visuales como las
// líneas de cubrecanto en los diagramas de pieza.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app-check.js';
import { getAI, GoogleAIBackend, getGenerativeModel, Schema } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-ai.js';

const firebaseConfig = {
  projectId: 'revisor-cortes-taller',
  appId: '1:840973194482:web:52b8684726750540ccec6b',
  storageBucket: 'revisor-cortes-taller.firebasestorage.app',
  apiKey: 'AIzaSyC5KC17l45WpWrfAEhz1Ey4V8CJ7DDR60s',
  authDomain: 'revisor-cortes-taller.firebaseapp.com',
  messagingSenderId: '840973194482',
};

// Verificación de aplicaciones (App Check): confirma ante Google que las solicitudes a
// Gemini vienen de verdad de este sitio, para que nadie más pueda usar la cuota/costo
// copiando la apiKey (que es pública, visible en el código del navegador).
const RECAPTCHA_SITE_KEY = '6LdTWuEtAAAAAOQnDoV3HbwopSejU-pPLlJD6I9j';

const firebaseApp = initializeApp(firebaseConfig);
initializeAppCheck(firebaseApp, {
  provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY),
  isTokenAutoRefreshEnabled: true,
});
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

// Gemini a veces responde "modelo con mucha demanda" (error 500/503) en picos de tráfico, y en
// el celular la red se corta a ratos; ambos suelen resolverse reintentando a los pocos segundos.
async function generarConReintentos(modelo, partes, intentos = 4) {
  for (let i = 1; i <= intentos; i++) {
    try {
      return await modelo.generateContent(partes);
    } catch (err) {
      // Errores pasajeros: saturación del modelo, o un corte de red a media petición (en el
      // celular pasa seguido al cambiar de WiFi a datos o con señal débil).
      // Ojo: TODOS los errores de Firebase AI dicen "Error fetching from…", así que no se
      // puede buscar solo "fetch" (eso reintentaba cualquier error y dejaba al usuario esperando).
      const esPasajero = /high demand|\b50[0-9]\b|overloaded|unavailable|failed to fetch|networkerror|network error|load failed|timed? ?out|aborted/i.test(err.message || '');
      if (!esPasajero || i === intentos) throw err;
      await esperar(3000 * i);
    }
  }
}

async function preguntarConArchivo(modelo, prompt, file, intentos = 4) {
  const base64 = await archivoABase64(file);
  const resultado = await generarConReintentos(modelo, [
    prompt,
    { inlineData: { mimeType: file.type || 'application/octet-stream', data: base64 } },
  ], intentos);
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
    // Qué tan clara estaba la letra para cada número: 3=clara, 2=razonable pero podría
    // confundirse, 1=dudosa/casi adivinando. Así el usuario solo revisa lo marcado, en
    // vez de tener que releer toda la hoja contra la pantalla.
    confianzaCantidad: Schema.number(),
    confianzaLadoA: Schema.number(),
    confianzaLadoB: Schema.number(),
    // El número impreso en la columna "No." de la hoja: sirve después para ubicar el renglón
    // en la foto cuando el usuario revisa un número dudoso (ver ubicarRenglonConIA).
    numeroHoja: Schema.number(),
  },
  optionalProperties: ['numeroHoja'],
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
Es una tabla con estas columnas: No. (el número de renglón impreso o escrito en la hoja), Cantidad, Lado A (en centímetros),
Lado B (en centímetros), y 4 casillas de "enchape" o "tapacanto" etiquetadas A1, A2, B1, B2 que pueden estar
marcadas (con una palomita, una X o rellenas) o vacías. También puede haber campos de encabezado "MATERIAL"
y "CUBRE CANTO" escritos a mano arriba de la tabla.

Lee SOLO las filas de la tabla que tengan datos (ignora las filas vacías).
Para cada fila devuelve: numeroHoja (el número de la columna No. de ese renglón), cantidad (entero), ladoA y ladoB (números, pueden tener decimales, usa punto
decimal, no coma), y si cada casilla de enchape A1/A2/B1/B2 está marcada (true) o vacía (false).
Prioriza la precisión numérica: si una cifra es ambigua, usa tu mejor estimación según el contexto
(por ejemplo, medidas de piezas de un mueble suelen ser razonables, no extremas).

Además, para cantidad, ladoA y ladoB por separado, califica qué tan clara estaba la letra escrita a mano
(confianzaCantidad, confianzaLadoA, confianzaLadoB), siendo honesto y crítico contigo mismo:
- 3 = la cifra se lee con toda claridad, no hay duda razonable.
- 2 = se lee, pero hay algo que podría confundirse (un dígito con trazo ambiguo, un punto decimal que
  podría ser una mancha, un número parecido a otro, letra apretada o encimada).
- 1 = es difícil de leer, estás adivinando o completando con el contexto más que leyendo el trazo.
No califiques todo como 3 por default: el usuario va a confiar en tu palabra para NO revisar lo que
marques como 3, así que sé estricto.`;

async function leerHojaConIA(file) {
  return preguntarConArchivo(modeloHoja, PROMPT_HOJA, file);
}

// ===================== Qué hay en cada renglón numerado (F1, F2…) =====================
// La app detecta los renglones de la tabla en la foto (renglones.js) y los numera con etiquetas
// rojas a la izquierda. Aquí la IA solo LEE qué hay en cada etiqueta, que se le da mucho mejor
// que dar coordenadas. Con eso la app sabe exactamente qué renglón de la foto es cada pieza.

const esquemaEtiquetas = Schema.object({
  properties: {
    renglones: Schema.array({
      items: Schema.object({
        properties: {
          etiqueta: Schema.number(),
          numeroHoja: Schema.number(),
          cantidad: Schema.number(),
          ladoA: Schema.number(),
          ladoB: Schema.number(),
        },
        optionalProperties: ['numeroHoja', 'cantidad', 'ladoA', 'ladoB'],
      }),
    }),
  },
});

// Modelo completo: con hojas de muchos renglones (45) el lite devolvía uno solo. Es una consulta
// por foto y solo cuando la app no pudo emparejar los renglones por su cuenta (ver app.js).
const modeloEtiquetas = getGenerativeModel(ai, {
  model: 'gemini-3.8-flash',
  generationConfig: { responseMimeType: 'application/json', responseSchema: esquemaEtiquetas },
});

async function leerRenglonesEtiquetadosConIA(file, total, piezasEsperadas) {
  const prompt = `Esta es una foto de una hoja de pedido de corte escrita a mano: una tabla con columnas No., Cantidad,
Lado A, Lado B y casillas de enchape. A la IZQUIERDA de la foto agregamos una columna blanca con etiquetas rojas
F1, F2, … F${total}: cada etiqueta está a la altura de un renglón de la tabla, entre dos rayitas rojas.

Para CADA etiqueta cuyo renglón de la tabla tenga datos escritos, devuelve:
- etiqueta: el número de la etiqueta (sin la F),
- numeroHoja: el número de la columna No. de ese renglón,
- cantidad, ladoA, ladoB: lo que está escrito en ese renglón (usa punto decimal).
Omite las etiquetas que caen en el encabezado de la tabla o en renglones vacíos. Fíjate bien en que cada
etiqueta corresponda al renglón que está exactamente a su misma altura.${piezasEsperadas ? `
En esta foto hay aproximadamente ${piezasEsperadas} renglones con datos: devuélvelos TODOS, no te detengas en el primero.` : ''}`;
  return preguntarConArchivo(modeloEtiquetas, prompt, file, 3);
}

// ===================== Ubicar UN renglón de la hoja en la foto =====================
// (Respaldo: solo se usa si no se pudieron detectar las líneas de la tabla en la foto.)
// Pedirle al modelo lite las coordenadas de ~50 renglones a la vez daba cajas corridas varios
// renglones. Por eso la ubicación se pide aparte, renglón por renglón y solo cuando el usuario
// lo abre para revisar, con el modelo completo y una pregunta concreta: "¿dónde está el
// renglón No. X que dice tal cosa?". Se pide por separado la parte de los números y la de
// las casillas, para mostrar los números grandes.

const esquemaUbicacion = Schema.object({
  properties: {
    encontrado: Schema.boolean(),
    cajaNumeros: Schema.array({ items: Schema.number() }),
    cajaEnchape: Schema.array({ items: Schema.number() }),
  },
  optionalProperties: ['cajaNumeros', 'cajaEnchape'],
});

const modeloUbicacion = getGenerativeModel(ai, {
  model: 'gemini-3.8-flash',
  generationConfig: { responseMimeType: 'application/json', responseSchema: esquemaUbicacion },
});

// pista: { numeroHoja?, renglon, cantidad, ladoA, ladoB }
async function ubicarRenglonConIA(file, pista) {
  const numero = pista.numeroHoja ? `cuyo número en la columna "No." es ${pista.numeroHoja}` : `que es el renglón con datos número ${pista.renglon} contando desde arriba`;
  const prompt = `Esta es una foto de una hoja de pedido de corte escrita a mano: una tabla con columnas
No., Cantidad, Lado A, Lado B y 4 casillas de enchape (A1, A2, B1, B2).

Localiza en la imagen el renglón ${numero}. Sus datos escritos a mano deberían ser aproximadamente:
cantidad ${pista.cantidad}, Lado A ${pista.ladoA}, Lado B ${pista.ladoB} (pueden diferir un poco porque se
leyeron con errores). Usa el número de la columna No. y esos valores juntos para asegurarte de elegir el renglón
correcto; revisa los renglones vecinos antes de responder, es fácil equivocarse por uno o dos renglones.

Devuelve:
- encontrado: true si lo ubicaste con seguridad.
- cajaNumeros: el recuadro de ESE renglón desde la columna No. hasta el final de la columna Lado B.
- cajaEnchape: el recuadro de ESE mismo renglón que abarca solo las 4 casillas de enchape.
Ambos como [ymin, xmin, ymax, xmax] con coordenadas normalizadas de 0 a 1000 respecto a la imagen completa,
ajustados a las líneas del renglón (de la línea de arriba a la de abajo de ese renglón, no más).`;
  // Solo 2 intentos: el usuario está esperando con la ventana abierta.
  return preguntarConArchivo(modeloUbicacion, prompt, file, 2);
}

// ===================== Reporte del proveedor (PDF o imagen) =====================

const esquemaPiezaReporte = Schema.object({
  properties: {
    cantidad: Schema.number(),
    base: Schema.number(),
    altura: Schema.number(),
    bordeSuperior: Schema.boolean(),
    bordeInferior: Schema.boolean(),
    bordeIzquierdo: Schema.boolean(),
    bordeDerecho: Schema.boolean(),
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

// Para esta parte usamos el modelo completo (no el "lite"): distinguir una línea
// gruesa vertical de una horizontal en un dibujo diminuto es un detalle visual fino,
// y el modelo lite se equivocaba seguido (sobre todo en piezas muy delgadas/alargadas).
const modeloReporte = getGenerativeModel(ai, {
  model: 'gemini-3.8-flash',
  generationConfig: { responseMimeType: 'application/json', responseSchema: esquemaReporte },
});

const PROMPT_REPORTE = `Este es un reporte generado por un software de optimización de corte de tableros
(melamina/MDF/triplay) para un taller de carpintería. Tiene una sección "Piezas ubicadas" con una tabla de
columnas: Esquema (un dibujo del rectángulo de la pieza), Cant, Base, Altura, Observación.

Cada rectángulo del "Esquema" tiene 4 orillas: superior, inferior, izquierda, derecha. Cada orilla puede estar
dibujada con una línea DELGADA normal, o con una línea más GRUESA y de color (normalmente azul) — esa línea
gruesa indica que esa orilla específica lleva cubrecanto (tapacanto/enchape). Si el rectángulo no tiene
ninguna línea gruesa, la pieza no lleva cubrecanto (a veces esto se confirma con el texto "SIN CH" en la
columna Observación — úsalo como pista: si dice "SIN CH", las 4 orillas deben ser false).

Para cada pieza, examina sus 4 orillas UNA POR UNA, con cuidado (muchas piezas son rectángulos muy delgados
y alargados, donde es fácil confundir una orilla corta con una larga):
- ¿La orilla de ARRIBA es gruesa/de color? (bordeSuperior)
- ¿La orilla de ABAJO es gruesa/de color? (bordeInferior)
- ¿La orilla IZQUIERDA es gruesa/de color? (bordeIzquierdo)
- ¿La orilla DERECHA es gruesa/de color? (bordeDerecho)

Lee SOLO las filas de la tabla "Piezas ubicadas" que tengan datos (ignora filas vacías y la tabla de
"Lista de Planchas Utilizadas", que es una sección distinta).
Para cada fila devuelve: cantidad (entero), base y altura (números, pueden tener decimales, usa punto
decimal), las 4 orillas (true/false cada una), y observacion (el texto de esa columna si tiene, si no
cadena vacía).
También, si puedes leerlos, el nombre del cliente y la descripción del material del encabezado del reporte.
Prioriza la precisión: revisa cada orilla con calma antes de responder, no adivines rápido.`;

async function leerReporteProveedorConIA(file) {
  const resultado = await preguntarConArchivo(modeloReporte, PROMPT_REPORTE, file);
  resultado.piezas = (resultado.piezas || []).map(p => ({
    cantidad: p.cantidad,
    base: p.base,
    altura: p.altura,
    // Vertical (izquierda/derecha) = lado A; horizontal (arriba/abajo) = lado B — ver engine.js.
    // No hay forma de saber cuál orilla es "1" y cuál "2" en el formulario del usuario,
    // así que se asigna por posición (izquierda/arriba = 1, derecha/abajo = 2) solo para
    // mostrarlo igual que "mi lista"; la comparación en engine.js solo usa el conteo.
    enchapeA1: !!p.bordeIzquierdo,
    enchapeA2: !!p.bordeDerecho,
    enchapeB1: !!p.bordeSuperior,
    enchapeB2: !!p.bordeInferior,
    observacion: p.observacion || '',
  }));
  return resultado;
}

window.leerHojaConIA = leerHojaConIA;
window.leerRenglonesEtiquetadosConIA = leerRenglonesEtiquetadosConIA;
window.ubicarRenglonConIA = ubicarRenglonConIA;
window.leerReporteProveedorConIA = leerReporteProveedorConIA;
window.dispatchEvent(new Event('ia-lista'));
