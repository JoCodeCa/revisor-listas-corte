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
      contarA: (f.enchapeA1 ? 1 : 0) + (f.enchapeA2 ? 1 : 0),
      contarB: (f.enchapeB1 ? 1 : 0) + (f.enchapeB2 ? 1 : 0),
    }));
}

// El reporte del proveedor solo trae datos de cubrecanto cuando se leyó con IA (puede
// ver el dibujo del Esquema); si vino de texto (PDF/OCR/pegado), estos campos no existen.
function tieneDatosEnchape(f) {
  return f.enchapeA1 !== undefined || f.enchapeA2 !== undefined || f.enchapeB1 !== undefined || f.enchapeB2 !== undefined;
}

// Normaliza las piezas extraídas del reporte del proveedor (ya en mm).
function normalizarPiezasProveedor(filas) {
  return filas
    .filter(f => Number(f.cantidad) > 0)
    .map((f, idx) => {
      const conDatosEnchape = tieneDatosEnchape(f);
      return {
        origenIndex: idx,
        cantidad: Number(f.cantidad),
        base_mm: Number(f.base),
        altura_mm: Number(f.altura),
        observacion: f.observacion || '',
        ladoAEnchapado: conDatosEnchape ? (f.enchapeA1 ? 1 : 0) + (f.enchapeA2 ? 1 : 0) : null,
        ladoBEnchapado: conDatosEnchape ? (f.enchapeB1 ? 1 : 0) + (f.enchapeB2 ? 1 : 0) : null,
      };
    });
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
        mensaje: `Veta mal orientada: capturaron Base=${candidata.base_mm} Altura=${candidata.altura_mm} mm, pero pediste Lado A (veta)=${mia.ladoA_mm} Lado B=${mia.ladoB_mm} mm — cruzaron los lados, la pieza saldría con la veta en el sentido incorrecto`,
      };
    }

    // El cubrecanto solo se puede verificar cuando el reporte del proveedor se leyó
    // con IA (puede ver el dibujo del Esquema); si vino de texto pegado, no se compara.
    if (candidata.ladoAEnchapado !== null && candidata.ladoBEnchapado !== null) {
      if (candidata.ladoAEnchapado !== mia.contarA || candidata.ladoBEnchapado !== mia.contarB) {
        return {
          mia,
          proveedor: candidata,
          estado: 'enchape',
          mensaje: `Cubrecanto incorrecto: pediste ${mia.contarA} lado(s) A y ${mia.contarB} lado(s) B con cubrecanto, el proveedor marcó ${candidata.ladoAEnchapado} lado(s) A y ${candidata.ladoBEnchapado} lado(s) B`,
        };
      }
    }

    return { mia, proveedor: candidata, estado: 'ok', mensaje: 'Coincide' };
  });

  // 4) Medida incorrecta: una pieza mía que quedó sin pareja y una del proveedor que sobra,
  // pero que comparten al menos un lado, casi siempre son la misma pieza con el otro lado mal
  // capturado (p.ej. 571 tecleado como 581). Se juntan en un solo error en vez de reportar
  // "falta" + "sobra" por separado, que confunde. Se hace hasta el final para no robarle a
  // otra pieza mía su coincidencia exacta.
  resultados.forEach((r, i) => {
    if (r.estado !== 'falta') return;
    const mia = r.mia;
    let mejor = null;
    let mejorPuntaje = Infinity;
    for (const p of provDisponibles) {
      if (p.usada) continue;
      // Diferencia en el lado que NO coincide, para cada orientación que comparte un lado.
      const opciones = [];
      if (numerosIguales(p.base_mm, mia.ladoA_mm, tolerancia)) opciones.push(Math.abs(p.altura_mm - mia.ladoB_mm));
      if (numerosIguales(p.altura_mm, mia.ladoB_mm, tolerancia)) opciones.push(Math.abs(p.base_mm - mia.ladoA_mm));
      if (numerosIguales(p.base_mm, mia.ladoB_mm, tolerancia)) opciones.push(Math.abs(p.altura_mm - mia.ladoA_mm));
      if (numerosIguales(p.altura_mm, mia.ladoA_mm, tolerancia)) opciones.push(Math.abs(p.base_mm - mia.ladoB_mm));
      if (opciones.length === 0) continue;
      // Preferimos la que tiene la misma cantidad; luego la de diferencia más chica.
      const puntaje = (p.cantidad === mia.cantidad ? 0 : 1e6) + Math.min(...opciones);
      if (puntaje < mejorPuntaje) { mejor = p; mejorPuntaje = puntaje; }
    }
    if (!mejor) return;

    mejor.usada = true;
    const notaCantidad = mejor.cantidad !== mia.cantidad
      ? ` (y la cantidad: pediste ${mia.cantidad}, capturó ${mejor.cantidad})`
      : '';
    resultados[i] = {
      mia,
      proveedor: mejor,
      estado: 'medida',
      mensaje: `Medida incorrecta: pediste ${mia.ladoA_mm} x ${mia.ladoB_mm} mm, el proveedor capturó ${mejor.base_mm} x ${mejor.altura_mm} mm${notaCantidad}`,
    };
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

      let cantidadTexto, baseTexto, alturaM;

      if (numeros.length >= 3) {
        const ultimas = numeros.slice(-3);
        cantidadTexto = ultimas[0][0];
        baseTexto = ultimas[1][0];
        alturaM = ultimas[2];
      } else if (numeros.length === 2 && !/[.,]/.test(numeros[0][0]) && numeros[0][0].length >= 4) {
        // El OCR a veces pega "cantidad" y "base" sin espacio (p.ej. "5571" en vez de
        // "5 571"), dejando solo 2 números en la línea. La cantidad en estas listas
        // casi siempre es de 1 dígito, así que separamos el primero del resto.
        cantidadTexto = numeros[0][0].slice(0, 1);
        baseTexto = numeros[0][0].slice(1);
        alturaM = numeros[1];
      } else {
        continue;
      }

      const finAltura = alturaM.index + alturaM[0].length;
      piezas.push({
        cantidad: normalizaNumero(cantidadTexto),
        base: normalizaNumero(baseTexto),
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

// Becor: PDF de SketchCut. Lo que importa es la tabla "Partes" con columnas
//   #  | Largo | Ancho | Cantidad | Rotación | Nombre | PA
// en milímetros (Largo = Lado A, Ancho = Lado B) y SIN cubrecanto. El PDF también trae portada y
// hojas "Piezas en el tablero" (los acomodos), con tablas de números parecidos que no deben
// contarse: por eso solo se toman renglones numerados "N. largo ancho cantidad" (los del
// acomodo no llevan el "N.").
function parseReporteBecor(texto) {
  const lineas = String(texto || '')
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(l => l.length > 0);

  let material = null;
  for (const l of lineas) {
    const m = l.match(/Material\s*:\s*(.*?)\s*(?:Espesor\s*:.*)?$/i);
    if (m && m[1]) { material = m[1]; break; }
  }

  // Solo la sección "Partes": desde su encabezado hasta las hojas de acomodo ("Piezas en el
  // tablero"), que repiten medidas en tablas sin numerar.
  let inicio = lineas.findIndex(l => /Largo\s+Ancho\s+Cantidad/i.test(l));
  if (inicio === -1) inicio = lineas.findIndex(l => /^Partes$/i.test(l));
  const fin = lineas.findIndex((l, k) => k > inicio && /Piezas en el tablero/i.test(l));
  const seccion = lineas.slice(inicio + 1, fin === -1 ? undefined : fin);

  // En el PDF real los números (Largo, Ancho, Cantidad) van arriba en su celda y el "#" y la
  // Rotación van más abajo, centrados: el lector de PDF los saca en líneas separadas
  // ("2430 550 2" y "1. No"). Se aceptan las tres formas: todo junto, o medidas y "N." por
  // separado (se emparejan en orden), con la Rotación en la misma línea o en la siguiente.
  const NUM = '(\\d+(?:[.,]\\d+)?)';
  const ROT = '(?:\\s+(No|S[ií])(?=\\s|$))?'; // (\b no sirve tras la "í")
  const completo = new RegExp(`^(\\d{1,3})\\s*\\.\\s+${NUM}\\s+${NUM}\\s+(\\d+)${ROT}\\s*(.*)$`, 'i');
  const medidas = new RegExp(`^${NUM}\\s+${NUM}\\s+(\\d+)${ROT}\\s*(.*)$`, 'i');
  const numero = new RegExp(`^(\\d{1,3})\\s*\\.${ROT}\\s*(.*)$`, 'i');
  const soloRotacion = /^(No|S[ií])$/i;

  const filas = [];          // renglones con todo en una línea
  const sueltasMedidas = []; // "2430 550 2"
  const sueltosNumeros = []; // "1. No"
  let ultimo = null;         // a quién se le pega una Rotación que viene sola en la línea siguiente
  for (const l of seccion) {
    let m;
    if ((m = l.match(completo))) {
      ultimo = { n: m[1], base: m[2], altura: m[3], cantidad: m[4], rotacion: m[5] || '', nombre: m[6] };
      filas.push(ultimo);
    } else if ((m = l.match(medidas))) {
      ultimo = { base: m[1], altura: m[2], cantidad: m[3], rotacion: m[4] || '', nombre: m[5] };
      sueltasMedidas.push(ultimo);
    } else if ((m = l.match(numero))) {
      ultimo = { n: m[1], rotacion: m[2] || '', nombre: m[3] };
      sueltosNumeros.push(ultimo);
    } else if (soloRotacion.test(l) && ultimo && !ultimo.rotacion) {
      ultimo.rotacion = l;
    }
  }
  // Una línea de medidas suelta solo cuenta si tiene su "N." para emparejarse: en las hojas de
  // acomodo el texto girado sale como "2 1 1" o "550 100 100", que parecen medidas y no lo son.
  // (Única excepción: si el PDF no trae ningún "N.", se toman las medidas solas.)
  const conPareja = sueltosNumeros.length ? sueltasMedidas.slice(0, sueltosNumeros.length) : (filas.length ? [] : sueltasMedidas);
  conPareja.forEach((med, k) => {
    const num = sueltosNumeros[k] || {};
    filas.push({
      n: num.n || `s${k + 1}`,
      base: med.base,
      altura: med.altura,
      cantidad: med.cantidad,
      rotacion: med.rotacion || num.rotacion || '',
      nombre: [med.nombre, num.nombre].filter(Boolean).join(' '),
    });
  });

  const vistos = new Set();
  const piezas = [];
  for (const f of filas) {
    if (vistos.has(f.n)) continue; // el # no se repite (por si el encabezado sale dos veces)
    vistos.add(f.n);
    const notas = [];
    if (/^s/i.test(f.rotacion)) notas.push('Rotación: Sí');
    const nombre = String(f.nombre || '').replace(/[☐□]/g, '').trim();
    if (nombre) notas.push(nombre);
    piezas.push({
      cantidad: Number(f.cantidad),
      base: normalizaNumero(f.base),
      altura: normalizaNumero(f.altura),
      observacion: notas.join(' · '),
    });
  }
  return { cliente: null, material, piezas };
}

// Elige el lector de texto según el proveedor (ver PERFILES_PROVEEDOR en app.js).
function parseReportePorProveedor(texto, proveedor) {
  return proveedor === 'becor' ? parseReporteBecor(texto) : parseReporteProveedor(texto);
}

// Arma una línea breve, dirigida al proveedor (no al taller), por cada pieza con problema.
// A diferencia de r.mensaje (pensado para la tabla de resultados, en 1a persona hacia el
// usuario), esto se redacta para que el proveedor entienda qué corregir sin contexto extra.
function lineaParaProveedor(r) {
  const dimMia = r.mia ? `${r.mia.ladoA_cm}x${r.mia.ladoB_cm} cm` : null;
  const dimProv = r.proveedor ? `${r.proveedor.base_mm}x${r.proveedor.altura_mm} mm` : null;

  switch (r.estado) {
    case 'cantidad':
      return `Pieza ${dimMia}: pedí ${r.mia.cantidad} pza, capturaste ${r.proveedor.cantidad}`;
    case 'medida': {
      const cantidad = r.proveedor.cantidad !== r.mia.cantidad
        ? `, y la cantidad es ${r.mia.cantidad} pza (capturaste ${r.proveedor.cantidad})`
        : '';
      return `Pieza ${dimMia} (x${r.mia.cantidad}): capturaste ${dimProv}, la medida correcta es ${r.mia.ladoA_mm}x${r.mia.ladoB_mm} mm${cantidad}`;
    }
    case 'falta':
      return `Pieza ${dimMia} (x${r.mia.cantidad}): no aparece en tu confirmación`;
    case 'invertida':
      return `Pieza ${dimMia} (x${r.mia.cantidad}): lados cruzados (capturaste ${dimProv}) — revisar la veta`;
    case 'enchape':
      return `Pieza ${dimMia} (x${r.mia.cantidad}): cubrecanto no coincide — pedí ${r.mia.contarA} lado(s) A y ${r.mia.contarB} lado(s) B, capturaste ${r.proveedor.ladoAEnchapado} y ${r.proveedor.ladoBEnchapado}`;
    case 'sobra':
      return `Pieza ${dimProv} (x${r.proveedor.cantidad}): no la pedí`;
    default:
      return r.mensaje;
  }
}

// Mensaje completo listo para enviar al proveedor (por ejemplo por WhatsApp) con solo
// las piezas que tienen algún problema. Devuelve '' si no hay nada que corregir.
function generarMensajeProveedor(resultados, opciones = {}) {
  const problemas = resultados.filter(r => r.estado !== 'ok');
  if (problemas.length === 0) return '';

  const asunto = opciones.material ? ` del pedido de ${opciones.material}` : ' del pedido';
  const encabezado = `Hola, revisando tu confirmación${asunto} encontré estas diferencias, ¿me las corriges?`;
  const lineas = problemas.map((r, i) => `${i + 1}) ${lineaParaProveedor(r)}`);

  return [encabezado, '', ...lineas, '', 'Gracias!'].join('\n');
}

const API = {
  cmAMm,
  comparar,
  generarMensajeProveedor,
  normalizarMisPiezas,
  normalizarPiezasProveedor,
  normalizaNumero,
  parseReporteBecor,
  parseReportePorProveedor,
  parseReporteProveedor,
  TOLERANCIA_MM,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
} else {
  window.Engine = API;
}
