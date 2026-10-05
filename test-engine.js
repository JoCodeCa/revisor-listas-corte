// Pruebas rápidas del motor de comparación usando el caso real de las dos hojas de ejemplo.
'use strict';
const assert = require('assert');
const { cmAMm, comparar, parseReporteProveedor } = require('./engine.js');

// --- cmAMm ---
assert.strictEqual(cmAMm(187.6), 1876);
assert.strictEqual(cmAMm(57.1), 571);
assert.strictEqual(cmAMm(15.8), 158);
console.log('OK: cmAMm');

// --- caso real: todo coincide ---
const misPiezas = [
  { no: 1, cantidad: 5, ladoA: 187.6, ladoB: 29 },
  { no: 2, cantidad: 5, ladoA: 57.1, ladoB: 14 },
  { no: 3, cantidad: 2, ladoA: 190, ladoB: 29 },
  { no: 4, cantidad: 1, ladoA: 190, ladoB: 15.8 },
  { no: 5, cantidad: 1, ladoA: 190, ladoB: 14 },
];

const piezasProveedorCorrectas = [
  { cantidad: 5, base: 1876, altura: 290 },
  { cantidad: 5, base: 571, altura: 140 },
  { cantidad: 2, base: 1900, altura: 290 },
  { cantidad: 1, base: 1900, altura: 158 },
  { cantidad: 1, base: 1900, altura: 140 },
];

let r = comparar(misPiezas, piezasProveedorCorrectas);
assert.strictEqual(r.resumen.conError, 0, 'no debería haber errores en el caso correcto');
assert.strictEqual(r.resumen.ok, 5);
console.log('OK: caso real sin errores');

// --- cantidad incorrecta ---
const provCantidadMal = piezasProveedorCorrectas.map((p, i) => i === 0 ? { ...p, cantidad: 4 } : p);
r = comparar(misPiezas, provCantidadMal);
const errCantidad = r.resultados.find(x => x.estado === 'cantidad');
assert.ok(errCantidad, 'debe detectar cantidad incorrecta');
console.log('OK: detecta cantidad incorrecta');

// --- medida incorrecta (falta) ---
const provMedidaMal = piezasProveedorCorrectas.map((p, i) => i === 1 ? { ...p, base: 580 } : p);
r = comparar(misPiezas, provMedidaMal);
const errFalta = r.resultados.find(x => x.estado === 'falta' && x.mia.no === 2);
assert.ok(errFalta, 'debe marcar como faltante la pieza cuya medida no coincide');
console.log('OK: detecta medida incorrecta como faltante');

// --- orientación invertida ---
const provInvertida = piezasProveedorCorrectas.map((p, i) => i === 2 ? { cantidad: p.cantidad, base: p.altura, altura: p.base } : p);
r = comparar(misPiezas, provInvertida);
const errInvertida = r.resultados.find(x => x.estado === 'invertida');
assert.ok(errInvertida, 'debe detectar lados invertidos');
console.log('OK: detecta orientación invertida');

// --- pieza faltante por completo ---
const provFaltaUna = piezasProveedorCorrectas.slice(0, 4);
r = comparar(misPiezas, provFaltaUna);
assert.strictEqual(r.resultados.filter(x => x.estado === 'falta').length, 1);
console.log('OK: detecta pieza completamente faltante');

// --- pieza sobrante (no solicitada) ---
const provConSobrante = piezasProveedorCorrectas.concat([{ cantidad: 3, base: 500, altura: 500 }]);
r = comparar(misPiezas, provConSobrante);
assert.ok(r.resultados.some(x => x.estado === 'sobra'));
console.log('OK: detecta pieza sobrante no solicitada');

// --- parseReporteProveedor con el texto real del reporte de ejemplo ---
const textoReporte = `
Material: MDF LIGERO 18MM  4X8  (Liso- 18 mm )  -  MDF000061
Desperdicio de la Sierra : 5 mm
Cliente : JOSE LUIS CASTAÑEDA
Cantidad de desplazamientos de la sierra = 24   metros =    25.42
Total de mts lineales :   45.726

Lista de Planchas Utilizadas
Cant Base Altura Detalle
2 2440 1220 Placa Entera
Piezas ubicadas
Esquema Cant Base Altura Observación
5 1876 290
5 571 140
2 1900 290
1 1900 158
1 1900 140
Total de piezas cortadas : 14   Total m2:    4.8   Total ml:   45.7
`;

const reporte = parseReporteProveedor(textoReporte);
assert.strictEqual(reporte.cliente, 'JOSE LUIS CASTAÑEDA');
assert.ok(/MDF LIGERO 18MM/.test(reporte.material));
assert.strictEqual(reporte.piezas.length, 5);
assert.strictEqual(reporte.piezas[0].cantidad, 5);
assert.strictEqual(reporte.piezas[0].base, 1876);
assert.strictEqual(reporte.piezas[0].altura, 290);
assert.strictEqual(reporte.totalPiezasReportado, 14);
assert.strictEqual(reporte.totalM2, 4.8);
console.log('OK: parseReporteProveedor extrae cliente, material y piezas correctamente');

// el resultado de parseReporteProveedor debe poder compararse directo contra misPiezas
r = comparar(misPiezas, reporte.piezas);
assert.strictEqual(r.resumen.conError, 0);
console.log('OK: parseReporteProveedor + comparar end-to-end sin errores');

// --- parseReporteProveedor con texto "sucio" como el que produce el OCR real ---
// La columna "Esquema" es un dibujo; el OCR la lee como basura (guiones, corchetes,
// dígitos sueltos) antes de los números reales de cada fila.
const textoReporteOCR = `
Material: MDF LIGERO 18MM 4X8 (Liso- 18 mm ) - MDFO00061
Desperdicio de la Sierra : 5 mm
Cliente : JOSE LUIS CASTAÑEDA
Cantidad de desplazamientos de la sierra =24 metros = 25.42
Total de mts lineales: 45.726
Lista de Planchas Utilizadas
Cant Base Altura Detalle
* 2 2440 1220 Placa Entera
Piezas ubicadas
Esquema Cant Base Altura Observación
—— 5 1876 290
P——] 5 571 140
9 2 1900 290
— 1 1900 158
— 1 1900 140
Total de piezas cortadas : 14 Total m2: 4.8 Total ml: 45.7
`;
const reporteOCR = parseReporteProveedor(textoReporteOCR);
assert.strictEqual(reporteOCR.piezas.length, 5, 'debe extraer las 5 piezas pese al ruido del OCR');
r = comparar(misPiezas, reporteOCR.piezas);
assert.strictEqual(r.resumen.conError, 0, 'el texto ruidoso del OCR debe comparar igual de bien que el PDF limpio');
console.log('OK: parseReporteProveedor tolera el ruido típico del OCR en la columna Esquema');

console.log('\nTodas las pruebas pasaron.');
