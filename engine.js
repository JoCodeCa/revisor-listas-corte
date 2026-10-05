// Motor de comparación: lógica pura, sin DOM, para poder probarla con Node.
// Convención de unidades: mi lista se captura en CENTÍMETROS (como en la hoja de papel),
// el proveedor regresa su reporte en MILÍMETROS (como en su software de optimización).
'use strict';

const TOLERANCIA_MM = 0.6; // margen por redondeo (p.ej. 57.1cm -> 571mm exacto, pero cubrimos imprecisiones)

function cmAMm(cm) {
  return Math.round(cm * 10 * 10) / 10; // *10 para mm, redondeado a 1 decimal
}

function numerosIguales(a, b, tolerancia) {
  return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tolerancia;
}

// Normaliza las filas que el usuario captura (en cm) a piezas comparables (en mm).
function normalizarMisPiezas(filas) {
  return filas
    .filter(f => Number(f.cantidad) > 0 && (Number(f.ladoA) > 0 || Number(f.ladoB) > 0))
    .map((f, idx) => ({
      origenIndex: idx,
      no: f.no ?? idx + 1,
      cantidad: Number(f.cantidad),
      ladoA_cm: Number(f.ladoA),
      ladoB_cm: Number(f.ladoB),
      ladoA_mm: cmAMm(Number(f.ladoA)),
      ladoB_mm: cmAMm(Number(f.ladoB)),
      enchapeA1: !!f.enchapeA1,
      enchapeA2: !!f.enchapeA2,
      enchapeB1: !!f.enchapeB1,
      enchapeB2: !!f.enchapeB2,
    }));
}

// Normaliza las piezas extraídas del reporte del proveedor (ya en mm).
function normalizarPiezasProveedor(filas) {
  return filas
    .filter(f => Number(f.cantidad) > 0)
    .map((f, idx) => ({
      origenIndex: idx,
      cantidad: Number(f.cantidad),
      base_mm: Number(f.base),
      altura_mm: Number(f.altura),
      observacion: f.observacion || '',
    }));
}

// Compara "mis piezas" contra las piezas que capturó el proveedor.
// Devuelve un resultado por cada pieza mía (emparejada o faltante) y además
// señala las piezas del proveedor que sobran (no solicitadas).
function comparar(misFilas, filasProveedor, tolerancia = TOLERANCIA_MM) {
  const mias = normalizarMisPiezas(misFilas);
  const prov = normalizarPiezasProveedor(filasProveedor);
  const provDisponibles = prov.map(p => ({ ...p, usada: false }));

  const resultados = mias.map(mia => {
    // 1) buscar coincidencia exacta (misma cantidad y mismas medidas, en cualquier orientación)
    let candidata = provDisponibles.find(p =>
      !p.usada &&
      p.cantidad === mia.cantidad &&
      numerosIguales(p.base_mm, mia.ladoA_mm, tolerancia) &&
      numerosIguales(p.altura_mm, mia.ladoB_mm, tolerancia)
    );
    let invertida = false;

    if (!candidata) {
      // 2) buscar coincidencia con lados invertidos (posible error de orientación)
      candidata = provDisponibles.find(p =>
        !p.usada &&
        p.cantidad === mia.cantidad &&
        numerosIguales(p.base_mm, mia.ladoB_mm, tolerancia) &&
        numerosIguales(p.altura_mm, mia.ladoA_mm, tolerancia)
      );
      if (candidata) invertida = true;
    }

    if (!candidata) {
      // 3) buscar coincidencia solo por medidas (cantidad distinta)
      candidata = provDisponibles.find(p =>
        !p.usada &&
        ((numerosIguales(p.base_mm, mia.ladoA_mm, tolerancia) && numerosIguales(p.altura_mm, mia.ladoB_mm, tolerancia)) ||
         (numerosIguales(p.base_mm, mia.ladoB_mm, tolerancia) && numerosIguales(p.altura_mm, mia.ladoA_mm, tolerancia)))
      );
    }

    if (!candidata) {
      return {
        mia,
        proveedor: null,
        estado: 'falta',
        mensaje: `Falta en el reporte del proveedor: ${mia.cantidad} pza(s) de ${mia.ladoA_cm} x ${mia.ladoB_cm} cm`,
      };
    }

    candidata.usada = true;

    if (candidata.cantidad !== mia.cantidad) {
      return {
        mia,
        proveedor: candidata,
        estado: 'cantidad',
        mensaje: `Cantidad incorrecta: pediste ${mia.cantidad}, el proveedor capturó ${candidata.cantidad}`,
      };
    }

    if (invertida) {
      return {
        mia,
        proveedor: candidata,
        estado: 'invertida',
        mensaje: `Revisar orientación: el proveedor capturó ${candidata.base_mm} x ${candidata.altura_mm} mm (lados invertidos respecto a tu medida)`,
      };
    }

    return { mia, proveedor: candidata, estado: 'ok', mensaje: 'Coincide' };
  });

  const sobrantes = provDisponibles
    .filter(p => !p.usada)
    .map(p => ({
      mia: null,
      proveedor: p,
      estado: 'sobra',
      mensaje: `Pieza no solicitada: el proveedor capturó ${p.cantidad} pza(s) de ${p.base_mm} x ${p.altura_mm} mm que no está en tu lista`,
    }));

  const todos = resultados.concat(sobrantes);
  const resumen = {
    total: todos.length,
    ok: todos.filter(r => r.estado === 'ok').length,
    conError: todos.filter(r => r.estado !== 'ok').length,
  };

  return { resultados: todos, resumen };
}

// Convierte un texto numérico a Number, tolerando coma decimal (p.ej. "187,6" -> 187.6)
// o coma de miles (p.ej. "1,900" -> 1900).
function normalizaNumero(str) {
  if (str == null) return NaN;
  let s = String(str).trim();
  if (/,\d{1,2}$/.test(s) && !/\.\d/.test(s)) {
    s = s.replace(',', '.'); // coma decimal
  } else {
    s = s.replace(/,/g, ''); // coma de miles
  }
  return Number(s);
}

// Parsea el texto del reporte del proveedor (ya reconstruido línea por línea,
// desde PDF o pegado manualmente) y extrae cliente, material y la tabla de "Piezas ubicadas".
function parseReporteProveedor(texto) {
  const lineas = String(texto || '')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const buscar = (regex) => {
    for (const l of lineas) {
      const m = l.match(regex);
      if (m) return m[1].trim();
    }
    return null;
  };

  const cliente = buscar(/Cliente\s*:\s*(.+)/i);
  const material = buscar(/Material\s*:?\s*(.+)/i);
  const desperdicioSierra = buscar(/Desperdicio\s+de\s+la\s+Sierra\s*:\s*([\d.,]+)\s*mm/i);
  const totalPiezasReportado = buscar(/Total\s+de\s+piezas\s+cortadas\s*:\s*(\d+)/i);
  const totalM2 = buscar(/Total\s*m2\s*:\s*([\d.,]+)/i);
  const totalMl = buscar(/Total\s*ml\s*:\s*([\d.,]+)/i);

  const idxPiezas = lineas.findIndex(l => /piezas\s+ubicadas/i.test(l));
  const piezas = [];

  if (idxPiezas !== -1) {
    // No anclamos al inicio de línea: la columna "Esquema" es un dibujo, y el OCR
    // suele leerlo como basura (guiones, corchetes, dígitos sueltos) antes de los
    // números reales. Por eso tomamos los ÚLTIMOS 3 números de la línea (cantidad,
    // base, altura) y lo que sobre antes se descarta como ruido del dibujo.
    const numeroRegex = /\d+(?:[.,]\d+)?/g;
    for (let i = idxPiezas + 1; i < lineas.length; i++) {
      const l = lineas[i];
      if (/total\s+de\s+piezas\s+cortadas/i.test(l)) break;
      const numeros = [...l.matchAll(numeroRegex)];
      if (numeros.length < 3) continue;
      const [cantidadM, baseM, alturaM] = numeros.slice(-3);
      const finAltura = alturaM.index + alturaM[0].length;
      piezas.push({
        cantidad: normalizaNumero(cantidadM[0]),
        base: normalizaNumero(baseM[0]),
        altura: normalizaNumero(alturaM[0]),
        observacion: l.slice(finAltura).trim(),
      });
    }
  }

  return {
    cliente,
    material,
    desperdicioSierra: desperdicioSierra ? normalizaNumero(desperdicioSierra) : null,
    totalPiezasReportado: totalPiezasReportado ? Number(totalPiezasReportado) : null,
    totalM2: totalM2 ? normalizaNumero(totalM2) : null,
    totalMl: totalMl ? normalizaNumero(totalMl) : null,
    piezas,
  };
}

const API = {
  cmAMm,
  comparar,
  normalizarMisPiezas,
  normalizarPiezasProveedor,
  normalizaNumero,
  parseReporteProveedor,
  TOLERANCIA_MM,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
} else {
  window.Engine = API;
}
