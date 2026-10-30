// Pruebas de la detección de renglones (renglones.js) con una "foto" sintética de la hoja:
// tabla impresa, un poco chueca, con sombra y con trazos que simulan la letra a mano.
'use strict';
const assert = require('assert');
const { estimarInclinacion, detectarLineas, estructura } = require('./renglones.js');

function hojaSintetica({ inclinacion = 0.012, renglones = 20, cuadritos = false } = {}) {
  const w = 600, h = 900;
  const gris = new Uint8Array(w * h);
  // Papel con sombra (más oscuro hacia la derecha y abajo) y algo de ruido.
  let semilla = 7;
  const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    gris[y * w + x] = 225 - x * 0.06 - y * 0.05 + (azar() - 0.5) * 12;
  }
  const pinta = (x, y) => { if (x >= 0 && x < w && y >= 0 && y < h) gris[y * w + x] = 40; };
  const lineasY = Array.from({ length: renglones + 2 }, (_, i) => 80 + i * 32); // encabezado + renglones
  const lineasX = [40, 90, 170, 290, 410, 455, 500, 545, 590];
  // Líneas impresas (2 px), inclinadas.
  for (const y0 of lineasY) for (let x = lineasX[0]; x <= lineasX.at(-1); x++) {
    const y = Math.round(y0 + x * inclinacion);
    pinta(x, y); pinta(x, y + 1);
  }
  for (const x0 of lineasX) for (let y = lineasY[0]; y <= lineasY.at(-1) + 10; y++) {
    const x = Math.round(x0 - y * inclinacion);
    pinta(x, y); pinta(x + 1, y);
  }
  // Como en la hoja real: cada casilla de enchape trae un cuadrito dibujado adentro. Sus bordes
  // NO deben confundirse con líneas de la tabla (partían los renglones y el corte de columnas).
  if (cuadritos) {
    for (let r = 1; r < lineasY.length - 1; r++) for (let c = 4; c < 8; c++) {
      const xa = lineasX[c] + 8, xb = lineasX[c + 1] - 8, ya = lineasY[r] + 7, yb = lineasY[r + 1] - 7;
      for (let x = xa; x <= xb; x++) { pinta(Math.round(x), Math.round(ya + x * inclinacion)); pinta(Math.round(x), Math.round(yb + x * inclinacion)); }
      for (let y = ya; y <= yb; y++) { pinta(Math.round(xa - y * inclinacion), y); pinta(Math.round(xb - y * inclinacion), y); }
    }
  }
  // "Letra": trazos cortos dentro de las celdas de números.
  for (let r = 1; r < lineasY.length - 1; r++) {
    for (let c = 1; c < 4; c++) {
      const cx = (lineasX[c] + lineasX[c + 1]) / 2, cy = (lineasY[r] + lineasY[r + 1]) / 2;
      for (let k = 0; k < 40; k++) pinta(Math.round(cx - 20 + azar() * 40), Math.round(cy - 8 + azar() * 16));
    }
  }
  return { gris, w, h, lineasY, lineasX };
}

const hoja = hojaSintetica();
const lineas = detectarLineas(hoja.gris, hoja.w, hoja.h);
assert.strictEqual(lineas.horizontales.length, hoja.lineasY.length, `debe encontrar las ${hoja.lineasY.length} líneas horizontales (encontró ${lineas.horizontales.length})`);
lineas.horizontales.forEach((y, i) => {
  // Medido en la franja central (x≈300): la línea está en y0 + 300*inclinación.
  assert.ok(Math.abs(y - (hoja.lineasY[i] + 300 * 0.012)) <= 4, `línea ${i} en ${y}, se esperaba cerca de ${hoja.lineasY[i] + 3.6}`);
});
assert.strictEqual(lineas.verticales.length, hoja.lineasX.length, `debe encontrar las ${hoja.lineasX.length} líneas verticales (encontró ${lineas.verticales.length})`);
console.log('OK: detecta las líneas de la tabla en una foto chueca, con sombra y letra');

const est = estructura(lineas, hoja.w, hoja.h);
assert.strictEqual(est.renglones.length, hoja.lineasY.length - 1, 'un renglón entre cada par de líneas');
const corteEsperado = hoja.lineasX[4] / hoja.w * 1000;
assert.ok(Math.abs(est.corte - corteEsperado) < 15, `el corte números/enchape debe caer en la línea después de Lado B (${est.corte} vs ${corteEsperado})`);
console.log('OK: arma los renglones y ubica dónde empiezan las casillas de enchape');

// Sin tabla (foto en blanco): no inventa renglones.
const vacia = { gris: new Uint8Array(300 * 300).fill(210), w: 300, h: 300 };
assert.strictEqual(estructura(detectarLineas(vacia.gris, vacia.w, vacia.h), 300, 300).renglones.length, 0);
console.log('OK: en una foto sin tabla no inventa renglones');

// Hoja con cuadritos en las casillas de enchape (caso real): mismos renglones y mismo corte.
{
  const conCuadritos = hojaSintetica({ inclinacion: 0, cuadritos: true });
  const e = estructura(detectarLineas(conCuadritos.gris, conCuadritos.w, conCuadritos.h), conCuadritos.w, conCuadritos.h);
  assert.strictEqual(e.renglones.length, conCuadritos.lineasY.length - 1, `los cuadritos no deben partir renglones (salieron ${e.renglones.length})`);
  const corte = conCuadritos.lineasX[4] / conCuadritos.w * 1000;
  assert.ok(Math.abs(e.corte - corte) < 15, `con cuadritos, el corte debe seguir después de Lado B (${e.corte.toFixed(0)} vs ${corte.toFixed(0)})`);
  assert.ok(Math.abs(e.derecha - conCuadritos.lineasX.at(-1) / conCuadritos.w * 1000) < 15, 'el borde derecho es el de la tabla, no el de un cuadrito');
  const chueca = hojaSintetica({ inclinacion: 0.02, cuadritos: true });
  assert.ok(Math.abs(Math.tan(estimarInclinacion(chueca.gris, chueca.w, chueca.h)) - 0.02) < 0.004, 'mide la inclinación aunque haya cuadritos');
}
console.log('OK: los cuadritos de las casillas de enchape no parten renglones ni mueven el corte');

// Inclinación: debe medirla bien para poder enderezar la foto antes de detectar.
for (const inclinacion of [0, 0.02, -0.03, 0.05]) {
  const chueca = hojaSintetica({ inclinacion });
  const angulo = estimarInclinacion(chueca.gris, chueca.w, chueca.h);
  assert.ok(Math.abs(Math.tan(angulo) - inclinacion) < 0.004, `inclinación ${inclinacion}: midió ${Math.tan(angulo).toFixed(4)}`);
}
console.log('OK: mide la inclinación de la foto (para enderezarla)');

console.log('\nTodas las pruebas de renglones pasaron.');
