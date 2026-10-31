'use strict';

const LS_KEY = 'revisor-cortes:v1';

const filaMiaVacia = () => ({
  cantidad: '', ladoA: '', ladoB: '',
  enchapeA1: false, enchapeA2: false, enchapeB1: false, enchapeB2: false,
});
const filaProvVacia = () => ({
  cantidad: '', base: '', altura: '',
  enchapeA1: false, enchapeA2: false, enchapeB1: false, enchapeB2: false,
  observacion: '',
});

let estado = {
  material: '',
  cubrecanto: '',
  misFilas: Array.from({ length: 6 }, filaMiaVacia),
  provFilas: [],
  provCliente: '',
  provMaterial: '',
  proveedorTelefono: '',
};

function cargarEstado() {
  try {
    const guardado = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (guardado && Array.isArray(guardado.misFilas)) {
      estado = { ...estado, ...guardado };
    }
  } catch (e) { /* localStorage no disponible o corrupto: seguimos con el estado por defecto */ }
}

function guardarEstado() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(estado)); } catch (e) { /* almacenamiento lleno o bloqueado */ }
}

// ===================== MI LISTA =====================

// Campos numéricos que la IA califica con un nivel de confianza (1=dudoso, 2=revisar, 3=claro)
// y el nombre del campo de confianza correspondiente en la fila.
const CAMPOS_CON_CONFIANZA = { cantidad: 'confianzaCantidad', ladoA: 'confianzaLadoA', ladoB: 'confianzaLadoB' };

function claseConfianza(nivel) {
  if (nivel === 1) return 'confianza-baja';
  if (nivel === 2) return 'confianza-media';
  return '';
}

// Los valores de las filas pueden venir de la IA, del OCR o de texto pegado; se escapan antes
// de meterlos al HTML para que una comilla (p.ej. en la Observación) no corte el campo.
function escaparHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderMia() {
  document.getElementById('mia-material').value = estado.material;
  document.getElementById('mia-cubrecanto').value = estado.cubrecanto;

  const tbody = document.getElementById('tbody-mia');
  tbody.innerHTML = '';
  estado.misFilas.forEach((fila, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fila.fotoId ? `<button type="button" class="btn-ver-foto" title="Ver en mi foto">${i + 1}</button>` : i + 1}</td>
      <td><input type="number" min="0" step="1" data-campo="cantidad" value="${escaparHtml(fila.cantidad)}" class="${claseConfianza(fila.confianzaCantidad)}"></td>
      <td><input type="number" min="0" step="0.1" data-campo="ladoA" value="${escaparHtml(fila.ladoA)}" class="${claseConfianza(fila.confianzaLadoA)}"></td>
      <td><input type="number" min="0" step="0.1" data-campo="ladoB" value="${escaparHtml(fila.ladoB)}" class="${claseConfianza(fila.confianzaLadoB)}"></td>
      <td><input type="checkbox" data-campo="enchapeA1" ${fila.enchapeA1 ? 'checked' : ''}></td>
      <td><input type="checkbox" data-campo="enchapeA2" ${fila.enchapeA2 ? 'checked' : ''}></td>
      <td><input type="checkbox" data-campo="enchapeB1" ${fila.enchapeB1 ? 'checked' : ''}></td>
      <td><input type="checkbox" data-campo="enchapeB2" ${fila.enchapeB2 ? 'checked' : ''}></td>
      <td><button type="button" class="btn-eliminar" title="Eliminar pieza">✕</button></td>
    `;
    tr.querySelectorAll('[data-campo]').forEach(input => {
      const campo = input.dataset.campo;
      const evento = input.type === 'checkbox' ? 'change' : 'input';
      input.addEventListener(evento, () => {
        fila[campo] = input.type === 'checkbox' ? input.checked : input.value;
        // Ya lo revisó/corrigió el usuario: quita la marca de confianza de la IA.
        const campoConfianza = CAMPOS_CON_CONFIANZA[campo];
        if (campoConfianza && fila[campoConfianza] !== undefined) {
          delete fila[campoConfianza];
          input.classList.remove('confianza-baja', 'confianza-media');
        }
        guardarEstado();
      });
    });
    // Un número marcado por la IA abre la revisión (foto + valor) en vez de editarse directo.
    // mousedown.preventDefault evita que el celular saque el teclado antes de abrir la ventana.
    tr.querySelectorAll('input.confianza-media, input.confianza-baja').forEach(input => {
      input.addEventListener('mousedown', e => e.preventDefault());
      input.addEventListener('click', () => abrirRevision(i));
    });
    tr.querySelector('.btn-ver-foto')?.addEventListener('click', () => abrirRevision(i));
    tr.querySelector('.btn-eliminar').addEventListener('click', () => {
      estado.misFilas.splice(i, 1);
      guardarEstado();
      renderMia();
      Fotos.limpiarSinUso(estado.misFilas.map(f => f.fotoId).filter(Boolean));
    });
    tbody.appendChild(tr);
  });
}

document.getElementById('mia-material').addEventListener('input', e => { estado.material = e.target.value; guardarEstado(); });
document.getElementById('mia-cubrecanto').addEventListener('input', e => { estado.cubrecanto = e.target.value; guardarEstado(); });

document.getElementById('btn-agregar-fila').addEventListener('click', () => {
  estado.misFilas.push(filaMiaVacia());
  guardarEstado();
  renderMia();
});

// ===================== PROVEEDOR =====================

function renderProveedor() {
  const infoDiv = document.getElementById('info-proveedor');
  if (estado.provCliente || estado.provMaterial) {
    infoDiv.hidden = false;
    document.getElementById('prov-cliente').textContent = estado.provCliente ? `Cliente: ${estado.provCliente}` : '';
    document.getElementById('prov-material').textContent = estado.provMaterial ? `Material: ${estado.provMaterial}` : '';
  } else {
    infoDiv.hidden = true;
  }

  const tbody = document.getElementById('tbody-proveedor');
  tbody.innerHTML = '';
  estado.provFilas.forEach((fila, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="number" min="0" step="1" data-campo="cantidad" value="${escaparHtml(fila.cantidad)}"></td>
      <td><input type="number" min="0" step="0.1" data-campo="base" value="${escaparHtml(fila.base)}"></td>
      <td><input type="number" min="0" step="0.1" data-campo="altura" value="${escaparHtml(fila.altura)}"></td>
      <td><input type="checkbox" data-campo="enchapeA1" ${fila.enchapeA1 ? 'checked' : ''}></td>
      <td><input type="checkbox" data-campo="enchapeA2" ${fila.enchapeA2 ? 'checked' : ''}></td>
      <td><input type="checkbox" data-campo="enchapeB1" ${fila.enchapeB1 ? 'checked' : ''}></td>
      <td><input type="checkbox" data-campo="enchapeB2" ${fila.enchapeB2 ? 'checked' : ''}></td>
      <td><input type="text" data-campo="observacion" value="${escaparHtml(fila.observacion)}"></td>
      <td><button type="button" class="btn-eliminar" title="Eliminar pieza">✕</button></td>
    `;
    tr.querySelectorAll('[data-campo]').forEach(input => {
      const campo = input.dataset.campo;
      const evento = input.type === 'checkbox' ? 'change' : 'input';
      input.addEventListener(evento, () => {
        fila[campo] = input.type === 'checkbox' ? input.checked : input.value;
        guardarEstado();
      });
    });
    tr.querySelector('.btn-eliminar').addEventListener('click', () => {
      estado.provFilas.splice(i, 1);
      guardarEstado();
      renderProveedor();
    });
    tbody.appendChild(tr);
  });
}

document.getElementById('btn-agregar-fila-prov').addEventListener('click', () => {
  estado.provFilas.push(filaProvVacia());
  guardarEstado();
  renderProveedor();
});

function filaProveedorDesde(p) {
  const fila = { cantidad: p.cantidad, base: p.base, altura: p.altura, observacion: p.observacion || '' };
  // Solo se incluyen las casillas de cubrecanto si el origen las trae (lectura con IA);
  // si vienen de texto (PDF/OCR/pegado) se dejan sin definir para no comparar cubrecanto.
  const traeEnchape = p.enchapeA1 !== undefined || p.enchapeA2 !== undefined || p.enchapeB1 !== undefined || p.enchapeB2 !== undefined;
  if (traeEnchape) {
    fila.enchapeA1 = !!p.enchapeA1;
    fila.enchapeA2 = !!p.enchapeA2;
    fila.enchapeB1 = !!p.enchapeB1;
    fila.enchapeB2 = !!p.enchapeB2;
  }
  return fila;
}

// Reemplaza "el reporte del proveedor" por completo (usado por "pegar texto": una sola acción manual).
function aplicarReporteParseado(reporte) {
  estado.provCliente = reporte.cliente || '';
  estado.provMaterial = reporte.material || '';
  estado.provFilas = reporte.piezas.map(filaProveedorDesde);
  guardarEstado();
  renderProveedor();
}

// Agrega piezas al reporte del proveedor sin borrar lo que ya había (usado al subir varios archivos).
function agregarPiezasProveedor(reporte) {
  if (reporte.cliente && !estado.provCliente) estado.provCliente = reporte.cliente;
  if (reporte.material && !estado.provMaterial) estado.provMaterial = reporte.material;
  estado.provFilas.push(...reporte.piezas.map(filaProveedorDesde));
  guardarEstado();
  renderProveedor();
}

function esImagen(file) {
  return file.type.startsWith('image/');
}
function esPDF(file) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}
function esTexto(file) {
  return file.type === 'text/plain' || /\.txt$/i.test(file.name);
}

async function extraerTextoDeArchivo(file, estadoTexto) {
  if (esPDF(file)) {
    estadoTexto.textContent = 'Leyendo PDF...';
    return extraerTextoPDF(file);
  }
  if (esImagen(file)) {
    estadoTexto.textContent = 'Leyendo imagen con OCR, esto puede tardar un poco (se descarga el modelo la primera vez)...';
    return ocrImagen(file);
  }
  if (esTexto(file)) {
    estadoTexto.textContent = 'Leyendo archivo de texto...';
    return file.text();
  }
  // Tipo desconocido: intentamos leerlo como texto plano por si acaso.
  estadoTexto.textContent = 'Intentando leer el archivo como texto...';
  return file.text();
}

// Intenta leer un archivo del proveedor con IA (PDF/imagen, incluye cubrecanto) y si
// falla o no aplica, cae de vuelta a extracción de texto (PDF.js/OCR/texto plano).
async function leerUnReporteProveedor(file, estadoTexto, indice, total) {
  let fallaIA = null;
  if ((esPDF(file) || esImagen(file)) && typeof window.leerReporteProveedorConIA === 'function') {
    // Contador de segundos: la lectura con IA de un reporte largo puede tardar.
    const inicio = Date.now();
    const pintar = () => {
      const seg = Math.round((Date.now() - inicio) / 1000);
      // Pasado un rato se explica: si se topó con el límite por minuto, la app está esperando para
      // reintentar con el modelo avanzado (no está colgada).
      const nota = seg > 20 ? ' (si la IA pidió esperar por su límite por minuto, la app reintenta sola)' : '';
      estadoTexto.textContent = `Leyendo archivo ${indice} de ${total} con IA… ${seg} s${nota}`;
    };
    pintar();
    const reloj = setInterval(pintar, 1000);
    try {
      const reporte = await window.leerReporteProveedorConIA(file);
      if (reporte.piezas && reporte.piezas.length > 0) return { reporte, conCubrecanto: true, conRespaldo: reporte.usoRespaldo ? (reporte.cuotaRespaldo || {}) : null };
      fallaIA = { error: 'la IA no encontró piezas en el archivo' };
    } catch (err) {
      console.error(err);
      fallaIA = motivoError(err);
    } finally {
      clearInterval(reloj);
    }
    estadoTexto.textContent = `La IA no pudo leer el archivo ${indice} (${fallaIA.error}); probando solo con el texto...`;
  }
  try {
    const texto = await extraerTextoDeArchivo(file, estadoTexto);
    return { reporte: Engine.parseReporteProveedor(texto), conCubrecanto: false, fallaIA };
  } catch (err) {
    // Si tampoco se pudo leer el texto, se conserva el motivo de la IA para mostrarlo.
    console.error(err);
    return { reporte: { piezas: [] }, conCubrecanto: false, fallaIA };
  }
}

async function procesarArchivosProveedor(files) {
  if (files.length === 0) return;
  const estadoTexto = document.getElementById('pdf-estado');

  // Quita las filas vacías antes de ir agregando lo leído de cada archivo.
  estado.provFilas = estado.provFilas.filter(f => Number(f.cantidad) > 0);

  let totalPiezas = 0;
  let archivosConCubrecanto = 0;
  let huboError = false;
  let ultimaFallaIA = null;
  let usoRespaldo = false;

  for (let i = 0; i < files.length; i++) {
    try {
      const { reporte, conCubrecanto, conRespaldo, fallaIA } = await leerUnReporteProveedor(files[i], estadoTexto, i + 1, files.length);
      if (fallaIA) ultimaFallaIA = fallaIA;
      if (conRespaldo) usoRespaldo = conRespaldo;
      if (!reporte.piezas || reporte.piezas.length === 0) {
        huboError = true;
        continue;
      }
      agregarPiezasProveedor(reporte);
      totalPiezas += reporte.piezas.length;
      if (conCubrecanto) archivosConCubrecanto++;
    } catch (err) {
      console.error(err);
      huboError = true;
    }
  }

  // Si la IA falló, se dice por qué (y el error original), para no quedarse sin saber qué pasó.
  const notaIA = ultimaFallaIA
    ? ` La IA no pudo leerlo: ${ultimaFallaIA.error}.${ultimaFallaIA.detalle && ultimaFallaIA.detalle !== ultimaFallaIA.error ? ` (Detalle: ${ultimaFallaIA.detalle})` : ''}`
    : '';
  if (totalPiezas === 0) {
    estadoTexto.textContent = `No se encontraron piezas en el/los archivo(s).${notaIA} Puedes reintentar, o probar con "pegar texto".`;
  } else {
    const notaCubrecanto = archivosConCubrecanto < files.length ? ' (algún archivo se leyó solo con texto, sin cubrecanto)' : '';
    const notaError = huboError ? ' — algún archivo falló, revisa' : '';
    // Se agotó la cuota del modelo completo y se leyó con el rápido: el cubrecanto puede venir mal.
    const limiteDia = usoRespaldo && usoRespaldo.porDia ? `la cuota DIARIA del modelo avanzado${usoRespaldo.limite ? ` (${usoRespaldo.limite} consultas al día)` : ''}` : 'la cuota del modelo avanzado';
    const notaRespaldo = usoRespaldo ? ` Ojo: se agotó ${limiteDia} y se leyó con el modelo rápido, que distingue peor el cubrecanto; revísalo.` : '';
    estadoTexto.textContent = `Se agregaron ${totalPiezas} pieza(s) de ${files.length} archivo(s)${notaCubrecanto}${notaError}. Revísalas antes de comparar.${notaRespaldo}`;
  }
}

document.getElementById('input-pdf').addEventListener('change', (e) => {
  procesarArchivosProveedor(Array.from(e.target.files));
  // Se limpia para que elegir el MISMO archivo otra vez (para reintentar) vuelva a disparar.
  e.target.value = '';
});

document.getElementById('btn-procesar-texto').addEventListener('click', () => {
  const texto = document.getElementById('texto-pegado').value;
  const reporte = Engine.parseReporteProveedor(texto);
  const estadoTexto = document.getElementById('pdf-estado');
  if (reporte.piezas.length === 0) {
    estadoTexto.textContent = 'No se encontraron piezas en el texto pegado.';
    return;
  }
  aplicarReporteParseado(reporte);
  estadoTexto.textContent = `Se detectaron ${reporte.piezas.length} piezas en el texto pegado. Revísalas antes de comparar.`;
});

// ===================== OCR para imágenes del proveedor (texto impreso) =====================
// Nota: para la foto de "mi lista" (letra manuscrita) se usa leerHojaConIA (ia.js, Gemini),
// que es mucho más confiable que Tesseract para texto escrito a mano.

let tesseractCargado = false;

async function cargarTesseract() {
  if (tesseractCargado) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.0.4/tesseract.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  tesseractCargado = true;
}

async function ocrImagen(file) {
  await cargarTesseract();
  const { data } = await Tesseract.recognize(file, 'spa');
  return data.text.trim();
}

async function procesarFotosMia(files) {
  if (files.length === 0) return;

  const contenedor = document.getElementById('ocr-resultado');
  const estadoP = document.getElementById('ocr-estado');
  contenedor.hidden = false;

  if (typeof window.leerHojaConIA !== 'function') {
    estadoP.textContent = 'El módulo de lectura con IA todavía no está listo (revisa tu conexión y vuelve a intentar).';
    return;
  }

  // Quita las filas vacías de la plantilla antes de ir agregando lo que se lea de cada foto.
  estado.misFilas = estado.misFilas.filter(f => Number(f.cantidad) > 0 || Number(f.ladoA) > 0 || Number(f.ladoB) > 0);

  let totalPiezas = 0;
  let huboError = false;

  for (let i = 0; i < files.length; i++) {
    estadoP.textContent = `Analizando foto ${i + 1} de ${files.length} con IA, esto puede tardar unos segundos...`;
    try {
      const foto = await prepararFoto(files[i]);
      const resultado = await window.leerHojaConIA(foto);
      if (!resultado.piezas || resultado.piezas.length === 0) continue;

      // Se guarda la misma imagen que vio la IA, para que las coordenadas de cada renglón cuadren.
      const fotoId = `foto-${Date.now()}-${i}`;
      const fotoGuardada = await Fotos.guardar(fotoId, foto);

      if (resultado.material && !estado.material) estado.material = resultado.material;
      if (resultado.cubreCanto && !estado.cubrecanto) estado.cubrecanto = resultado.cubreCanto;

      estado.misFilas.push(...resultado.piezas.map(p => ({
        cantidad: p.cantidad ?? '',
        ladoA: p.ladoA ?? '',
        ladoB: p.ladoB ?? '',
        enchapeA1: !!p.enchapeA1,
        enchapeA2: !!p.enchapeA2,
        enchapeB1: !!p.enchapeB1,
        enchapeB2: !!p.enchapeB2,
        confianzaCantidad: p.confianzaCantidad,
        confianzaLadoA: p.confianzaLadoA,
        confianzaLadoB: p.confianzaLadoB,
        ...(fotoGuardada ? { fotoId } : {}),
        ...(typeof p.numeroHoja === 'number' ? { numeroHoja: p.numeroHoja } : {}),
      })));
      totalPiezas += resultado.piezas.length;
    } catch (err) {
      console.error(err);
      huboError = true;
    }
  }

  guardarEstado();
  renderMia();

  // Se van ubicando los renglones de cada foto que tenga piezas dudosas, para que al tocarlas
  // la revisión abra sin esperar.
  new Set(estado.misFilas.filter(f => f.fotoId && tieneDudas(f)).map(f => f.fotoId)).forEach(analizarFoto);

  if (totalPiezas === 0) {
    estadoP.textContent = 'No se detectó ninguna pieza en las fotos. Intenta con mejor luz/enfoque o captura manualmente.';
  } else {
    estadoP.textContent = `Se agregaron ${totalPiezas} pieza(s) de ${files.length} foto(s)${huboError ? ' (alguna foto falló, revisa)' : ''}. Revisa cada valor en la tabla de arriba antes de comparar — la IA puede equivocarse.`;
  }
}

// Endereza la foto según su orientación EXIF y la limita a 2400 px. Así la IA y la ventana de
// revisión ven exactamente la misma imagen (si no, las coordenadas de cada renglón no cuadran
// en fotos de celular giradas) y la foto guardada pesa menos.
async function prepararFoto(file, ladoMax = 2400) {
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, ladoMax / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) return file;
    return new File([blob], (file.name || 'hoja').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch (e) {
    return file; // formato que el navegador no sabe abrir: se manda tal cual
  }
}

// La caja de la IA es [ymin, xmin, ymax, xmax] de 0 a 1000; se descarta si no tiene sentido.
function cajaValida(caja) {
  return Array.isArray(caja) && caja.length === 4 &&
    caja.every(n => typeof n === 'number' && n >= 0 && n <= 1000) &&
    caja[2] > caja[0] && caja[3] > caja[1];
}

// ===================== REVISAR UN NÚMERO DUDOSO CONTRA LA FOTO =====================

const dialogoRevisar = document.getElementById('dialogo-revisar');
const CAMPOS_REVISION = ['cantidad', 'ladoA', 'ladoB', 'enchapeA1', 'enchapeA2', 'enchapeB1', 'enchapeB2'];
let revisionIndice = null;
let cacheFoto = { id: null, bitmap: null };

function tieneDudas(fila) {
  return [1, 2].includes(fila.confianzaCantidad) || [1, 2].includes(fila.confianzaLadoA) || [1, 2].includes(fila.confianzaLadoB);
}

function indicesPorRevisar() {
  return estado.misFilas.map((f, i) => (tieneDudas(f) ? i : -1)).filter(i => i !== -1);
}

async function bitmapDeFoto(fotoId) {
  if (cacheFoto.id === fotoId) return cacheFoto.bitmap;
  const blob = await Fotos.obtener(fotoId);
  if (!blob) return null;
  try {
    const bitmap = await createImageBitmap(blob);
    cacheFoto = { id: fotoId, bitmap };
    return bitmap;
  } catch (e) {
    return null;
  }
}

// Promesas de ubicación en curso, para no pedir dos veces el mismo renglón (p.ej. si se
// abre mientras se estaba buscando por adelantado).
const ubicacionesEnCurso = new WeakMap();

const LIMITE_UBICAR_MS = 45000;

// Traduce el error de la IA a algo que el usuario entienda, y guarda el mensaje original
// (recortado) como "detalle" para poder diagnosticar si vuelve a pasar.
function motivoError(err) {
  const msg = String(err?.message || err || '');
  // Se quita la URL larga de Firebase para que en el detalle quepa lo importante (código y causa).
  const detalle = msg.replace(/Error fetching from \S+:\s/i, '').replace(/\s+/g, ' ').slice(0, 160);
  let error = detalle || 'error desconocido';
  if (/tard[oó] demasiado/.test(msg)) error = 'la IA tardó demasiado en responder';
  else if (/429|quota|resource.?exhausted/i.test(msg)) error = 'se agotó por ahora la cuota de la IA; intenta en unos minutos';
  else if (/app.?check|recaptcha|403|permission/i.test(msg)) error = 'la IA rechazó la solicitud (permiso/App Check)';
  else if (/payload|too large|exceeds/i.test(msg)) error = 'el archivo es demasiado grande para la IA';
  // No basta con buscar "fetch": todos los errores de Firebase AI dicen "Error fetching from…".
  else if (/failed to fetch|networkerror|network error|load failed|offline/i.test(msg)) error = 'se cortó la conexión con la IA (ya se reintentó varias veces)';
  return { error, detalle };
}

// Sin límite, una llamada colgada dejaba la ventana en "Buscando…" para siempre.
function conLimite(promesa) {
  const limite = new Promise((_, reject) => setTimeout(() => reject(new Error('tardó demasiado')), LIMITE_UBICAR_MS));
  return Promise.race([promesa, limite]);
}

// Qué tanto se parece una pieza de mi lista a lo que la IA leyó en un renglón numerado.
// El No. de la hoja pesa más; los valores ayudan si el No. no se leyó (o si el usuario ya los
// corrigió, alguno no coincidirá, pero el resto sí).
function parecidoRenglon(fila, lectura) {
  let puntos = 0;
  if (fila.numeroHoja != null && lectura.numeroHoja === fila.numeroHoja) puntos += 2;
  if (lectura.cantidad != null && Number(lectura.cantidad) === Number(fila.cantidad)) puntos += 1;
  if (lectura.ladoA != null && Math.abs(lectura.ladoA - Number(fila.ladoA)) < 0.15) puntos += 1;
  if (lectura.ladoB != null && Math.abs(lectura.ladoB - Number(fila.ladoB)) < 0.15) puntos += 1;
  return puntos;
}

// Recuadro EXACTO (de línea a línea de la tabla) del renglón i detectado en la foto.
function ubicacionDeRenglon(est, i) {
  const [y0, y1] = est.renglones[i];
  return {
    numeros: [y0, est.izquierda, y1, est.corte],
    enchape: [y0, est.corte, y1, est.derecha],
    angulo: est.angulo,
    exacta: true,
    version: VERSION_UBICACION,
  };
}

// Sin IA: las piezas de una foto se leyeron en orden de arriba a abajo, y los renglones con
// letra a mano (tinta en Cant./Lado A/Lado B) son el encabezado impreso seguido de esas piezas,
// de corrido. Si las cuentas cuadran, la k-ésima pieza es el k-ésimo de los últimos N renglones
// escritos. Devuelve false si no cuadra (y entonces se le pregunta a la IA).
function asignarPorTinta(fotoId, est) {
  const filas = estado.misFilas.filter(f => f.fotoId === fotoId);
  const escritos = Renglones.renglonesEscritos(est.tinta);
  const n = filas.length;
  if (!n || escritos.length < n || escritos.length > n + 2) return false;
  const datos = escritos.slice(escritos.length - n);
  if (!datos.every((r, i) => i === 0 || r === datos[i - 1] + 1)) return false;
  filas.forEach((fila, k) => { fila.ubicacion = ubicacionDeRenglon(est, datos[k]); });
  guardarEstado();
  return true;
}

// Empareja las piezas de una foto con los renglones detectados y guarda en cada pieza el
// recuadro EXACTO de su renglón (de línea a línea de la tabla).
function asignarRenglones(fotoId, est, lecturas) {
  const filas = estado.misFilas.filter(f => f.fotoId === fotoId);
  const pares = [];
  filas.forEach((fila, k) => lecturas.forEach((lectura, j) => {
    const puntos = parecidoRenglon(fila, lectura);
    // Desempate por orden: con piezas idénticas, la k-ésima pieza va con la k-ésima lectura.
    if (puntos >= 2) pares.push({ fila, lectura, puntos: puntos - Math.abs(k - j) * 0.01 });
  }));
  pares.sort((a, b) => b.puntos - a.puntos);
  const filasUsadas = new Set(), lecturasUsadas = new Set();
  const asignar = (fila, lectura) => {
    filasUsadas.add(fila);
    lecturasUsadas.add(lectura);
    fila.ubicacion = ubicacionDeRenglon(est, lectura.etiqueta - 1);
  };
  for (const { fila, lectura } of pares) {
    if (!filasUsadas.has(fila) && !lecturasUsadas.has(lectura)) asignar(fila, lectura);
  }

  // Segunda pasada, por orden: las piezas que no se emparejaron (p.ej. sin No. de hoja y con el
  // número dudoso leído distinto) van con los renglones que quedaron libres, en el mismo orden,
  // siempre que coincidan en al menos un valor.
  const filasLibres = filas.filter(f => !filasUsadas.has(f));
  const lecturasLibres = lecturas.filter(l => !lecturasUsadas.has(l)).sort((a, b) => a.etiqueta - b.etiqueta);
  let j = 0;
  for (const fila of filasLibres) {
    while (j < lecturasLibres.length && parecidoRenglon(fila, lecturasLibres[j]) < 1) j++;
    if (j < lecturasLibres.length) asignar(fila, lecturasLibres[j++]);
  }

  guardarEstado();
  return { renglones: est.renglones.length, leidos: lecturas.length, emparejadas: filasUsadas.size, piezas: filas.length };
}

// Sube cuando cambia la detección, para que las ubicaciones ya guardadas se vuelvan a calcular
// (la v1 partía los renglones en hojas con cuadritos en las casillas de enchape).
const VERSION_UBICACION = 2;

// Un análisis por foto (detectar renglones + una lectura de la IA) sirve para todas sus piezas.
const analisisPorFoto = new Map();

function analizarFoto(fotoId) {
  if (analisisPorFoto.has(fotoId)) return analisisPorFoto.get(fotoId);
  const promesa = (async () => {
    try {
      if (typeof window.leerRenglonesEtiquetadosConIA !== 'function') {
        return { error: 'el módulo de IA no cargó (revisa tu conexión y recarga la app)' };
      }
      const bitmap = await bitmapDeFoto(fotoId);
      if (!bitmap) return { error: 'la foto ya no está guardada' };
      const est = await Renglones.analizar(bitmap);
      if (est.renglones.length < 3) return { error: 'no se distinguen las líneas de la tabla', sinLineas: true };
      // Primero sin IA (instantáneo, sin gastar cuota); la IA solo si las cuentas no cuadran.
      if (asignarPorTinta(fotoId, est)) return { ok: true };
      const piezas = estado.misFilas.filter(f => f.fotoId === fotoId).length;
      const etiquetada = await Renglones.etiquetar(bitmap, est.renglones, est.angulo, 2000);
      const r = await conLimite(window.leerRenglonesEtiquetadosConIA(etiquetada, est.renglones.length, piezas));
      const lecturas = (r?.renglones || []).filter(l => Number.isInteger(l.etiqueta) && l.etiqueta >= 1 && l.etiqueta <= est.renglones.length);
      const resumen = asignarRenglones(fotoId, est, lecturas);
      return { ok: true, resumen };
    } catch (err) {
      console.error(err);
      return motivoError(err);
    }
  })();
  analisisPorFoto.set(fotoId, promesa);
  // Si falló, se olvida para que "Reintentar" vuelva a intentarlo.
  promesa.then(r => { if (r.error) analisisPorFoto.delete(fotoId); });
  return promesa;
}

// Dónde está el renglón de esta pieza en su foto. Resuelve con { ubicacion } o { error }.
function ubicarRenglon(fila) {
  if (fila.ubicacion?.version === VERSION_UBICACION) return Promise.resolve({ ubicacion: fila.ubicacion });
  if (ubicacionesEnCurso.has(fila)) return ubicacionesEnCurso.get(fila);

  const promesa = (async () => {
    try {
      if (!fila.fotoId) return { error: 'la foto ya no está guardada' };
      const r = await analizarFoto(fila.fotoId);
      if (fila.ubicacion?.version === VERSION_UBICACION) return { ubicacion: fila.ubicacion };
      // Sin líneas detectadas, o con la foto analizada pero esta pieza sin emparejar: se recurre a
      // pedirle a la IA la ubicación directa (aproximada) en vez de dejar al usuario sin nada.
      if (r.sinLineas || r.ok) {
        if (fila.ubicacion) return { ubicacion: fila.ubicacion };
        const directa = await ubicarRenglonSoloIA(fila);
        if (directa.ubicacion) return directa;
        if (r.ok) {
          const { renglones, leidos, emparejadas, piezas } = r.resumen || {};
          return {
            error: 'la IA no reconoció este renglón en la foto',
            detalle: `renglones detectados: ${renglones}, leídos por la IA: ${leidos}, piezas emparejadas: ${emparejadas} de ${piezas}. ${directa.detalle || directa.error || ''}`.trim(),
          };
        }
        return directa;
      }
      return { error: r.error || 'error desconocido', detalle: r.detalle };
    } finally {
      ubicacionesEnCurso.delete(fila);
    }
  })();
  ubicacionesEnCurso.set(fila, promesa);
  return promesa;
}

// Respaldo cuando no se distinguen las líneas de la tabla: se le pregunta a la IA directamente
// por las coordenadas de ese renglón (menos preciso: a veces queda corrido).
async function ubicarRenglonSoloIA(fila) {
  try {
    if (typeof window.ubicarRenglonConIA !== 'function') {
      return { error: 'el módulo de IA no cargó (revisa tu conexión y recarga la app)' };
    }
    const blob = fila.fotoId ? await Fotos.obtener(fila.fotoId) : null;
    if (!blob) return { error: 'la foto ya no está guardada' };
    // Para ubicar el renglón no hace falta la foto a máxima resolución: más chica sube y se
    // procesa más rápido. Las coordenadas son relativas (0-1000), así que siguen cuadrando.
    const foto = await prepararFoto(blob, 1600);
    const mismaFoto = estado.misFilas.filter(f => f.fotoId === fila.fotoId);
    const consulta = window.ubicarRenglonConIA(foto, {
      numeroHoja: fila.numeroHoja,
      renglon: mismaFoto.indexOf(fila) + 1,
      cantidad: fila.cantidad,
      ladoA: fila.ladoA,
      ladoB: fila.ladoB,
    });
    const r = await conLimite(consulta);
    if (!r || !r.encontrado || !cajaValida(r.cajaNumeros)) return { error: 'la IA no encontró el renglón en la foto' };
    fila.ubicacion = { numeros: r.cajaNumeros };
    if (cajaValida(r.cajaEnchape)) fila.ubicacion.enchape = r.cajaEnchape;
    guardarEstado();
    return { ubicacion: fila.ubicacion };
  } catch (err) {
    console.error(err);
    return motivoError(err);
  }
}

// Dibuja un pedazo de la foto en el canvas. Devuelve la escala usada (px de pantalla por px de
// foto) para poder dibujar otro pedazo al mismo tamaño. Margen chico (25% del alto) por si la
// caja quedó un poco corrida y no se corten los números.
function dibujarRecorte(canvas, bitmap, caja, escalaFija, ubicacion = {}) {
  const W = bitmap.width;
  const H = bitmap.height;
  const y0 = caja[0] / 1000 * H, x0 = caja[1] / 1000 * W, y1 = caja[2] / 1000 * H, x1 = caja[3] / 1000 * W;
  // Con el renglón detectado por las líneas de la tabla basta un margen mínimo (se ven las
  // líneas, no los renglones vecinos); con la caja de la IA se deja más por si quedó corrida.
  const margenY = (y1 - y0) * (ubicacion.exacta ? 0.1 : 0.25);
  const margenX = (x1 - x0) * 0.015;
  const sx = Math.max(0, x0 - margenX);
  const ex = Math.min(W, x1 + margenX);
  const sy = Math.max(0, y0 - margenY);
  const ey = Math.min(H, y1 + margenY);

  const dpr = window.devicePixelRatio || 1;
  const anchoMax = canvas.parentElement.clientWidth;
  const escala = Math.min(escalaFija ?? Infinity, anchoMax / (ex - sx));
  const anchoCss = (ex - sx) * escala;
  const altoCss = (ey - sy) * escala;
  canvas.width = Math.round(anchoCss * dpr);
  canvas.height = Math.round(altoCss * dpr);
  canvas.style.width = `${anchoCss}px`;
  canvas.style.height = `${altoCss}px`;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(canvas.width / (ex - sx), canvas.height / (ey - sy));
  ctx.translate(-sx, -sy);
  // La foto se endereza igual que cuando se detectaron los renglones.
  Renglones.dibujarEnderezada(ctx, bitmap, ubicacion.angulo || 0);
  canvas.hidden = false;
  return escala;
}

async function dibujarFotoRevision() {
  const indice = revisionIndice;
  const fila = estado.misFilas[indice];
  const canvasNumeros = document.getElementById('revisar-canvas');
  const canvasEnchape = document.getElementById('revisar-canvas-enchape');
  const nota = document.getElementById('revisar-nota-foto');
  canvasNumeros.hidden = true;
  canvasEnchape.hidden = true;

  const bitmap = fila.fotoId ? await bitmapDeFoto(fila.fotoId) : null;
  if (!bitmap) {
    nota.textContent = 'La foto original no está guardada en este dispositivo (se leyó antes de esta función o se borró). Compara contra tu hoja de papel.';
    return;
  }

  const btnReintentar = document.getElementById('btn-revisar-reintentar');
  const detalle = document.getElementById('revisar-detalle-error');
  btnReintentar.hidden = true;
  detalle.textContent = '';

  if (fila.ubicacion?.version !== VERSION_UBICACION) {
    // Contador de segundos para que se note que sigue trabajando.
    const inicio = Date.now();
    const pintar = () => { nota.textContent = `Ubicando los renglones de tu foto… ${Math.round((Date.now() - inicio) / 1000)} s (solo la primera vez por foto)`; };
    pintar();
    const reloj = setInterval(pintar, 1000);
    const resultado = await ubicarRenglon(fila);
    clearInterval(reloj);
    // Si mientras tanto el usuario cerró o pasó a otra pieza, no dibujar encima.
    if (revisionIndice !== indice || !dialogoRevisar.open) return;
    if (resultado.error || !fila.ubicacion) {
      nota.textContent = `No se pudo ubicar la pieza ${indice + 1} en tu foto: ${resultado.error || 'error desconocido'}.`;
      detalle.textContent = resultado.detalle && resultado.detalle !== resultado.error ? `Detalle: ${resultado.detalle}` : '';
      btnReintentar.hidden = false;
      return;
    }
  }

  // Ubicación aproximada (la IA dio coordenadas directas): puede estar corrida, se avisa.
  nota.textContent = fila.ubicacion.version === VERSION_UBICACION ? '' : 'Ubicación aproximada: si no es este renglón, compáralo con tu hoja.';
  const escala = dibujarRecorte(canvasNumeros, bitmap, fila.ubicacion.numeros, undefined, fila.ubicacion);
  if (fila.ubicacion.enchape) dibujarRecorte(canvasEnchape, bitmap, fila.ubicacion.enchape, escala, fila.ubicacion);

  // Ya con esta lista, se ubica por adelantado la siguiente pieza dudosa (una a la vez, para
  // no gastar la cuota con varias consultas simultáneas).
  const pendientes = indicesPorRevisar();
  const siguiente = pendientes.find(j => j > indice) ?? pendientes.find(j => j !== indice);
  if (siguiente !== undefined) ubicarRenglon(estado.misFilas[siguiente]);
}

document.getElementById('btn-revisar-reintentar').addEventListener('click', () => dibujarFotoRevision());

function abrirRevision(i) {
  revisionIndice = i;
  const fila = estado.misFilas[i];

  document.getElementById('titulo-revisar').textContent = `Pieza ${i + 1}`;
  CAMPOS_REVISION.forEach(campo => {
    const input = dialogoRevisar.querySelector(`[data-revisar="${campo}"]`);
    if (input.type === 'checkbox') {
      input.checked = !!fila[campo];
    } else {
      input.value = fila[campo] ?? '';
      input.classList.remove('confianza-baja', 'confianza-media');
      const clase = claseConfianza(fila[CAMPOS_CON_CONFIANZA[campo]]);
      if (clase) input.classList.add(clase);
    }
  });

  const pendientes = indicesPorRevisar();
  const otros = pendientes.filter(j => j !== i).length;
  document.getElementById('revisar-pendientes').textContent = otros > 0
    ? `Quedan ${otros} pieza(s) más por revisar`
    : (tieneDudas(fila) ? 'Es la última por revisar' : '');
  document.getElementById('btn-revisar-ok').textContent = otros > 0 ? 'Correcto, siguiente →' : 'Correcto ✓';

  if (!dialogoRevisar.open) dialogoRevisar.showModal();
  dibujarFotoRevision();
}

function confirmarRevision() {
  const fila = estado.misFilas[revisionIndice];
  CAMPOS_REVISION.forEach(campo => {
    const input = dialogoRevisar.querySelector(`[data-revisar="${campo}"]`);
    fila[campo] = input.type === 'checkbox' ? input.checked : input.value;
  });
  // El usuario ya lo comparó con su hoja: se quitan las marcas de la IA.
  Object.values(CAMPOS_CON_CONFIANZA).forEach(c => { delete fila[c]; });
  guardarEstado();
  renderMia();

  // Pasa a la siguiente pieza dudosa (hacia abajo, y si no hay, desde arriba).
  const pendientes = indicesPorRevisar();
  const siguiente = pendientes.find(j => j > revisionIndice) ?? pendientes[0];
  if (siguiente !== undefined) {
    abrirRevision(siguiente);
  } else {
    dialogoRevisar.close();
  }
}

document.getElementById('btn-revisar-ok').addEventListener('click', confirmarRevision);
document.getElementById('btn-revisar-cancelar').addEventListener('click', () => dialogoRevisar.close());
dialogoRevisar.addEventListener('click', (e) => {
  if (e.target === dialogoRevisar) dialogoRevisar.close();
});

document.getElementById('input-foto-ocr').addEventListener('change', (e) => {
  procesarFotosMia(Array.from(e.target.files));
  e.target.value = '';
});

// ===================== COMPARAR =====================

function estadoALegible(estadoPieza) {
  const mapa = { ok: 'Coincide', cantidad: 'Cantidad incorrecta', invertida: 'Veta mal orientada', medida: 'Medida incorrecta', enchape: 'Cubrecanto incorrecto', falta: 'Falta en proveedor', sobra: 'Pieza no solicitada' };
  return mapa[estadoPieza] || estadoPieza;
}
function estadoAClase(estadoPieza) {
  if (estadoPieza === 'ok') return 'fila-ok';
  return 'fila-error';
}

function actualizarEnlaceWhatsapp(texto) {
  const telefono = (estado.proveedorTelefono || '').replace(/\D/g, '');
  const base = telefono ? `https://wa.me/${telefono}` : 'https://wa.me/';
  document.getElementById('btn-whatsapp').href = `${base}?text=${encodeURIComponent(texto)}`;
}

document.getElementById('proveedor-telefono').addEventListener('input', (e) => {
  estado.proveedorTelefono = e.target.value;
  guardarEstado();
  const texto = document.getElementById('texto-correcciones').value;
  if (texto) actualizarEnlaceWhatsapp(texto);
});

document.getElementById('btn-comparar').addEventListener('click', () => {
  const { resultados, resumen } = Engine.comparar(estado.misFilas, estado.provFilas);

  const resumenDiv = document.getElementById('resumen-comparacion');
  resumenDiv.hidden = false;
  resumenDiv.innerHTML = `
    <span class="resumen-chip chip-ok">${resumen.ok} correctas</span>
    <span class="resumen-chip chip-error">${resumen.conError} con problema</span>
  `;

  const panelResultados = document.getElementById('panel-resultados');
  panelResultados.hidden = false;
  const tbody = document.getElementById('tbody-resultados');
  tbody.innerHTML = '';

  resultados.forEach(r => {
    const tr = document.createElement('tr');
    tr.className = estadoAClase(r.estado);
    const colMia = r.mia
      ? `${r.mia.cantidad} pza x ${r.mia.ladoA_cm} x ${r.mia.ladoB_cm} cm (cubrecanto: ${r.mia.contarA}A/${r.mia.contarB}B)`
      : '—';
    const colProv = r.proveedor
      ? `${r.proveedor.cantidad} pza x ${r.proveedor.base_mm} x ${r.proveedor.altura_mm} mm` +
        (r.proveedor.ladoAEnchapado !== null ? ` (cubrecanto: ${r.proveedor.ladoAEnchapado}A/${r.proveedor.ladoBEnchapado}B)` : '')
      : '—';
    tr.innerHTML = `
      <td>${colMia}</td>
      <td>${colProv}</td>
      <td><span class="estado-pill">${estadoALegible(r.estado)}</span></td>
    `;
    tbody.appendChild(tr);
  });

  const panelCorrecciones = document.getElementById('panel-correcciones');
  if (resumen.conError > 0) {
    panelCorrecciones.hidden = false;
    const texto = Engine.generarMensajeProveedor(resultados, { material: estado.material });
    document.getElementById('texto-correcciones').value = texto;
    actualizarEnlaceWhatsapp(texto);
  } else {
    panelCorrecciones.hidden = true;
  }

  panelResultados.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

document.getElementById('btn-copiar').addEventListener('click', async () => {
  const texto = document.getElementById('texto-correcciones').value;
  try {
    await navigator.clipboard.writeText(texto);
    const btn = document.getElementById('btn-copiar');
    const original = btn.textContent;
    btn.textContent = '¡Copiado!';
    setTimeout(() => { btn.textContent = original; }, 1500);
  } catch (e) {
    alert('No se pudo copiar automáticamente. Selecciona el texto y cópialo manualmente.');
  }
});

document.getElementById('btn-descargar').addEventListener('click', () => {
  const texto = document.getElementById('texto-correcciones').value;
  const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'correcciones-lista-corte.txt';
  a.click();
  URL.revokeObjectURL(url);
});

// ===================== BORRAR TODO =====================

document.getElementById('btn-borrar-todo').addEventListener('click', () => {
  if (!confirm('¿Borrar mi lista, el reporte del proveedor y los resultados? No se puede deshacer.')) return;

  estado = {
    material: '',
    cubrecanto: '',
    misFilas: Array.from({ length: 6 }, filaMiaVacia),
    provFilas: [],
    provCliente: '',
    provMaterial: '',
    proveedorTelefono: estado.proveedorTelefono, // el teléfono del proveedor no cambia por pedido, se conserva
  };
  guardarEstado();
  Fotos.borrarTodas();

  renderMia();
  renderProveedor();

  document.getElementById('resumen-comparacion').hidden = true;
  document.getElementById('panel-resultados').hidden = true;
  document.getElementById('panel-correcciones').hidden = true;
  document.getElementById('ocr-resultado').hidden = true;
  document.getElementById('pdf-estado').textContent = '';
  document.getElementById('texto-pegado').value = '';

  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ===================== CONFIGURACIÓN =====================

const dialogoConfig = document.getElementById('dialogo-config');

document.getElementById('btn-config').addEventListener('click', () => {
  const actual = window.Tema ? Tema.obtener() : 'auto';
  dialogoConfig.querySelectorAll('input[name="tema"]').forEach(r => { r.checked = r.value === actual; });
  dialogoConfig.showModal();
});

document.getElementById('btn-cerrar-config').addEventListener('click', () => dialogoConfig.close());

// Cerrar al tocar fuera del cuadro (el clic en el fondo oscuro llega al propio <dialog>).
dialogoConfig.addEventListener('click', (e) => {
  if (e.target === dialogoConfig) dialogoConfig.close();
});

dialogoConfig.querySelectorAll('input[name="tema"]').forEach(radio => {
  radio.addEventListener('change', () => {
    if (radio.checked && window.Tema) Tema.guardar(radio.value);
  });
});

// ===================== COMPARTIR DESDE WHATSAPP (u otra app) =====================
// Flujo: WhatsApp comparte el archivo -> el service worker lo intercepta y lo guarda
// en caché -> redirige a compartir.html (pregunta "mi lista" o "proveedor") -> esa
// página redirige aquí con ?compartido=mia|proveedor -> aquí se recupera el archivo
// de la caché y se procesa igual que si se hubiera subido con el botón normal.

const CACHE_COMPARTIDOS = 'compartidos-v1';

async function recuperarArchivosCompartidos() {
  if (!('caches' in window)) return [];
  const cache = await caches.open(CACHE_COMPARTIDOS);
  const respuestaMeta = await cache.match('/compartido-meta');
  if (!respuestaMeta) return [];
  const meta = await respuestaMeta.json();

  const archivos = [];
  for (const item of meta) {
    const respuesta = await cache.match(item.clave);
    if (!respuesta) continue;
    const blob = await respuesta.blob();
    archivos.push(new File([blob], item.nombre || 'compartido', { type: item.tipo || blob.type }));
    await cache.delete(item.clave);
  }
  await cache.delete('/compartido-meta');
  return archivos;
}

async function revisarArchivoCompartido() {
  const parametros = new URLSearchParams(location.search);
  const destino = parametros.get('compartido');
  if (!destino) return;

  // Limpia la URL para que recargar la página no vuelva a procesar lo mismo.
  history.replaceState(null, '', location.pathname);

  const archivos = await recuperarArchivosCompartidos();
  if (archivos.length === 0) return;

  if (destino === 'mia') {
    await procesarFotosMia(archivos);
    document.getElementById('panel-mia')?.scrollIntoView({ behavior: 'smooth' });
  } else if (destino === 'proveedor') {
    await procesarArchivosProveedor(archivos);
    document.getElementById('panel-proveedor')?.scrollIntoView({ behavior: 'smooth' });
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.error('No se pudo registrar el service worker:', err));
}

// ===================== INIT =====================

cargarEstado();
renderMia();
Fotos.limpiarSinUso(estado.misFilas.map(f => f.fotoId).filter(Boolean));
renderProveedor();
document.getElementById('proveedor-telefono').value = estado.proveedorTelefono || '';
revisarArchivoCompartido();
