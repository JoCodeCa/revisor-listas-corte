// Ubica los renglones de la tabla en la foto de "mi lista" detectando las líneas impresas del
// formato, sin IA. La IA es mala dando coordenadas (los recuadros salían corridos uno o varios
// renglones), pero las líneas de la tabla dan los límites exactos de cada renglón. Después la
// IA solo tiene que LEER qué hay en cada renglón numerado (ver etiquetarRenglones/ia.js).
// La parte de detección trabaja sobre arreglos simples para poder probarla en Node.
'use strict';

const Renglones = (() => {
  // Marca como "tinta" los pixeles bastante más oscuros que su entorno. Comparar contra el
  // promedio local (y no contra un umbral fijo) aguanta sombras y luz dispareja de la foto.
  function pixelesOscuros(gris, w, h) {
    const radio = Math.max(8, Math.round(w / 60));
    const integral = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let filaSuma = 0;
      for (let x = 0; x < w; x++) {
        filaSuma += gris[y * w + x];
        integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + filaSuma;
      }
    }
    const oscuro = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - radio), y1 = Math.min(h, y + radio + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - radio), x1 = Math.min(w, x + radio + 1);
        const suma = integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
        const promedio = suma / ((y1 - y0) * (x1 - x0));
        if (gris[y * w + x] < promedio - 30) oscuro[y * w + x] = 1;
      }
    }
    return oscuro;
  }

  // Posiciones donde el perfil tiene un "pico" (una línea). Se toma el centro de cada tramo que
  // supera el umbral y se juntan los que quedan demasiado cerca (una línea gruesa o inclinada).
  function picos(perfil, umbralRelativo, separacionMin) {
    const max = Math.max(...perfil);
    if (!(max > 0)) return [];
    const umbral = max * umbralRelativo;
    const resultado = [];
    let i = 0;
    while (i < perfil.length) {
      if (perfil[i] < umbral) { i++; continue; }
      let mejor = i;
      while (i < perfil.length && perfil[i] >= umbral) {
        if (perfil[i] > perfil[mejor]) mejor = i;
        i++;
      }
      if (resultado.length && mejor - resultado[resultado.length - 1] < separacionMin) {
        const anterior = resultado.length - 1;
        if (perfil[mejor] > perfil[resultado[anterior]]) resultado[anterior] = mejor;
      } else {
        resultado.push(mejor);
      }
    }
    return resultado;
  }

  function suavizar(perfil) {
    return perfil.map((v, i) => ((perfil[i - 1] ?? v) + v + (perfil[i + 1] ?? v)) / 3);
  }

  function perfilHorizontal(oscuro, w, h, desde, hasta) {
    const xa = Math.round(w * desde), xb = Math.round(w * hasta);
    const perfil = new Array(h).fill(0);
    for (let y = 0; y < h; y++) {
      let n = 0;
      for (let x = xa; x < xb; x++) n += oscuro[y * w + x];
      perfil[y] = n / (xb - xa);
    }
    return picos(suavizar(perfil), 0.35, Math.max(3, h * 0.006));
  }

  // Qué tan chueca está la foto. Se prueban ángulos de -5° a 5°: con el ángulo correcto, los
  // pixeles de cada línea de la tabla caen todos en el mismo renglón de pixeles y el perfil queda
  // con picos muy marcados (se mide con la suma de cuadrados). Solo se usa la zona de números
  // (a la derecha, los cuadritos de enchape meten ruido). Devuelve radianes (positivo = las
  // líneas bajan hacia la derecha).
  function estimarInclinacion(gris, w, h) {
    const oscuro = pixelesOscuros(gris, w, h);
    const xa = Math.round(w * 0.1), xb = Math.round(w * 0.5);
    const xs = [], ys = [];
    for (let y = 0; y < h; y++) {
      for (let x = xa; x < xb; x++) {
        if (oscuro[y * w + x]) { xs.push(x - xa); ys.push(y); }
      }
    }
    if (xs.length < 100) return 0;
    const margen = Math.ceil((xb - xa) * Math.tan(5.5 * Math.PI / 180)) + 1;
    const nitidez = (grados) => {
      const t = Math.tan(grados * Math.PI / 180);
      const perfil = new Float64Array(h + 2 * margen);
      for (let i = 0; i < xs.length; i++) perfil[Math.round(ys[i] - xs[i] * t) + margen]++;
      let suma = 0;
      for (let i = 0; i < perfil.length; i++) suma += perfil[i] * perfil[i];
      return suma;
    };
    let mejor = 0, mejorValor = -1;
    for (let g = -5; g <= 5.0001; g += 0.25) {
      const v = nitidez(g);
      if (v > mejorValor) { mejorValor = v; mejor = g; }
    }
    const grueso = mejor;
    for (let g = grueso - 0.25; g <= grueso + 0.25; g += 0.05) {
      const v = nitidez(g);
      if (v > mejorValor) { mejorValor = v; mejor = g; }
    }
    return Math.abs(mejor) < 0.05 ? 0 : mejor * Math.PI / 180;
  }

  // Devuelve las líneas horizontales y verticales de la tabla, en pixeles de la imagen dada
  // (que ya debe venir enderezada; ver estimarInclinacion).
  function detectarLineas(gris, w, h) {
    const oscuro = pixelesOscuros(gris, w, h);

    // Horizontales: se miden en la zona de No./Cant./Lado A. Ahí solo están las líneas de la
    // tabla; más a la derecha, los cuadritos de las casillas de enchape agregaban líneas falsas
    // que partían cada renglón en pedazos.
    const horizontales = perfilHorizontal(oscuro, w, h, 0.1, 0.5);
    if (horizontales.length < 3) return { horizontales, verticales: [] };

    // Verticales: solo dentro del alto de la tabla.
    const ya = horizontales[0], yb = horizontales[horizontales.length - 1];
    const perfilV = new Array(w).fill(0);
    for (let x = 0; x < w; x++) {
      let n = 0;
      for (let y = ya; y < yb; y++) n += oscuro[y * w + x];
      perfilV[x] = n / Math.max(1, yb - ya);
    }
    // Solo cuentan las líneas que cruzan TODA la tabla (columnas). Los bordes de los cuadritos
    // de enchape se interrumpen entre renglón y renglón, así que su perfil queda más bajo.
    const verticales = picos(suavizar(perfilV), 0.7, Math.max(3, w * 0.01));
    return { horizontales, verticales };
  }

  // Convierte las líneas en renglones (entre cada par de líneas horizontales) y en el punto
  // donde termina "Lado B" y empiezan las casillas de enchape: son las últimas 4 columnas,
  // angostas y casi iguales. Todo normalizado de 0 a 1000, como las cajas de la IA.
  function estructura(lineas, w, h) {
    const { horizontales, verticales } = lineas;
    let renglones = [];
    for (let i = 0; i + 1 < horizontales.length; i++) {
      const alto = horizontales[i + 1] - horizontales[i];
      if (alto > h * 0.008) renglones.push([horizontales[i] / h * 1000, horizontales[i + 1] / h * 1000]);
    }
    // Si aun así algún renglón quedó partido (pedazos mucho más bajos que lo normal), se juntan
    // los pedazos consecutivos hasta tener el alto típico de un renglón.
    if (renglones.length >= 3) {
      const altos = renglones.map(([a, b]) => b - a).sort((x, y) => x - y);
      const tipico = altos[Math.floor(altos.length / 2)];
      const unidos = [];
      for (const r of renglones) {
        const ultimo = unidos[unidos.length - 1];
        if (ultimo && (ultimo[1] - ultimo[0] < tipico * 0.6 || r[1] - r[0] < tipico * 0.6) && r[1] - ultimo[0] < tipico * 1.4) {
          ultimo[1] = r[1];
        } else {
          unidos.push([...r]);
        }
      }
      renglones = unidos;
    }
    let izquierda = 0, derecha = 1000, corte = null;
    if (verticales.length >= 2) {
      izquierda = verticales[0] / w * 1000;
      derecha = verticales[verticales.length - 1] / w * 1000;
    }
    // Columnas: borde izquierdo | No. | Cant. | Lado A | Lado B | casillas… → Lado B termina en
    // la 5ª línea completa.
    if (verticales.length >= 6) corte = verticales[4] / w * 1000;
    if (corte === null) corte = izquierda + (derecha - izquierda) * 0.55;
    return { renglones, izquierda, derecha, corte };
  }

  // ===================== Solo navegador =====================

  // Dibuja la foto girada -angulo alrededor de su centro (para enderezarla), en el contexto ya
  // escalado/trasladado que se le pase.
  function dibujarEnderezada(ctx, bitmap, angulo) {
    const W = bitmap.width, H = bitmap.height;
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-angulo);
    ctx.translate(-W / 2, -H / 2);
    ctx.drawImage(bitmap, 0, 0);
  }

  function grisesDe(bitmap, angulo) {
    const escala = Math.min(1, 1200 / bitmap.width);
    const w = Math.round(bitmap.width * escala), h = Math.round(bitmap.height * escala);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.scale(escala, escala);
    dibujarEnderezada(ctx, bitmap, angulo);
    const datos = ctx.getImageData(0, 0, w, h).data;
    const gris = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) gris[i] = (datos[i * 4] * 299 + datos[i * 4 + 1] * 587 + datos[i * 4 + 2] * 114) / 1000;
    return { gris, w, h };
  }

  // Mide la inclinación, endereza y detecta. Las coordenadas que devuelve son de la foto ya
  // enderezada; "angulo" se guarda para enderezar igual al dibujar el recorte.
  async function analizar(bitmap) {
    const original = grisesDe(bitmap, 0);
    const angulo = estimarInclinacion(original.gris, original.w, original.h);
    const { gris, w, h } = angulo ? grisesDe(bitmap, angulo) : original;
    return { ...estructura(detectarLineas(gris, w, h), w, h), angulo };
  }

  // Copia de la foto con una columna a la izquierda que numera cada renglón detectado (F1, F2…)
  // y líneas rojas en sus bordes. Es lo que se le manda a la IA para que diga qué hay en cada uno.
  async function etiquetar(bitmap, renglones, angulo = 0, ladoMax = 1600) {
    const escala = Math.min(1, ladoMax / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * escala), h = Math.round(bitmap.height * escala);
    const margen = Math.round(w * 0.09);
    const canvas = document.createElement('canvas');
    canvas.width = w + margen;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w + margen, h);
    // La foto va enderezada, igual que como se detectaron los renglones.
    ctx.save();
    ctx.translate(margen, 0);
    ctx.scale(escala, escala);
    dibujarEnderezada(ctx, bitmap, angulo);
    ctx.restore();
    ctx.strokeStyle = 'rgba(220, 0, 0, 0.85)';
    ctx.fillStyle = 'rgb(200, 0, 0)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    renglones.forEach(([y0, y1], i) => {
      const a = y0 / 1000 * h, b = y1 / 1000 * h;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, a); ctx.lineTo(margen, a);
      ctx.moveTo(0, b); ctx.lineTo(margen, b);
      ctx.stroke();
      ctx.font = `bold ${Math.round(Math.min((b - a) * 0.75, margen * 0.38))}px sans-serif`;
      ctx.fillText(`F${i + 1}`, margen / 2, (a + b) / 2);
    });
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    return blob;
  }

  return { estimarInclinacion, detectarLineas, estructura, analizar, etiquetar, dibujarEnderezada };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Renglones;
} else {
  window.Renglones = Renglones;
}
