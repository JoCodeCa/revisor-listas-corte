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

function renderMia() {
  document.getElementById('mia-material').value = estado.material;
  document.getElementById('mia-cubrecanto').value = estado.cubrecanto;

  const tbody = document.getElementById('tbody-mia');
  tbody.innerHTML = '';
  estado.misFilas.forEach((fila, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td><input type="number" min="0" step="1" data-campo="cantidad" value="${fila.cantidad}" class="${claseConfianza(fila.confianzaCantidad)}"></td>
      <td><input type="number" min="0" step="0.1" data-campo="ladoA" value="${fila.ladoA}" class="${claseConfianza(fila.confianzaLadoA)}"></td>
      <td><input type="number" min="0" step="0.1" data-campo="ladoB" value="${fila.ladoB}" class="${claseConfianza(fila.confianzaLadoB)}"></td>
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
    tr.querySelector('.btn-eliminar').addEventListener('click', () => {
      estado.misFilas.splice(i, 1);
      guardarEstado();
      renderMia();
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
      <td><input type="number" min="0" step="1" data-campo="cantidad" value="${fila.cantidad}"></td>
      <td><input type="number" min="0" step="0.1" data-campo="base" value="${fila.base}"></td>
      <td><input type="number" min="0" step="0.1" data-campo="altura" value="${fila.altura}"></td>
      <td><input type="checkbox" data-campo="enchapeA1" ${fila.enchapeA1 ? 'checked' : ''}></td>
      <td><input type="checkbox" data-campo="enchapeA2" ${fila.enchapeA2 ? 'checked' : ''}></td>
      <td><input type="checkbox" data-campo="enchapeB1" ${fila.enchapeB1 ? 'checked' : ''}></td>
      <td><input type="checkbox" data-campo="enchapeB2" ${fila.enchapeB2 ? 'checked' : ''}></td>
      <td><input type="text" data-campo="observacion" value="${fila.observacion || ''}"></td>
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
  if ((esPDF(file) || esImagen(file)) && typeof window.leerReporteProveedorConIA === 'function') {
    estadoTexto.textContent = `Leyendo archivo ${indice} de ${total} con IA...`;
    try {
      const reporte = await window.leerReporteProveedorConIA(file);
      if (reporte.piezas && reporte.piezas.length > 0) return { reporte, conCubrecanto: true };
    } catch (err) {
      console.error(err);
      estadoTexto.textContent = `La IA no pudo leer el archivo ${indice}, probando solo con el texto...`;
    }
  }
  const texto = await extraerTextoDeArchivo(file, estadoTexto);
  const reporte = Engine.parseReporteProveedor(texto);
  return { reporte, conCubrecanto: false };
}

async function procesarArchivosProveedor(files) {
  if (files.length === 0) return;
  const estadoTexto = document.getElementById('pdf-estado');

  // Quita las filas vacías antes de ir agregando lo leído de cada archivo.
  estado.provFilas = estado.provFilas.filter(f => Number(f.cantidad) > 0);

  let totalPiezas = 0;
  let archivosConCubrecanto = 0;
  let huboError = false;

  for (let i = 0; i < files.length; i++) {
    try {
      const { reporte, conCubrecanto } = await leerUnReporteProveedor(files[i], estadoTexto, i + 1, files.length);
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

  if (totalPiezas === 0) {
    estadoTexto.textContent = 'No se encontraron piezas en el/los archivo(s). Prueba con "pegar texto" o revisa el archivo.';
  } else {
    const notaCubrecanto = archivosConCubrecanto < files.length ? ' (algún archivo se leyó solo con texto, sin cubrecanto)' : '';
    const notaError = huboError ? ' — algún archivo falló, revisa' : '';
    estadoTexto.textContent = `Se agregaron ${totalPiezas} pieza(s) de ${files.length} archivo(s)${notaCubrecanto}${notaError}. Revísalas antes de comparar.`;
  }
}

document.getElementById('input-pdf').addEventListener('change', (e) => {
  procesarArchivosProveedor(Array.from(e.target.files));
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
      const resultado = await window.leerHojaConIA(files[i]);
      if (!resultado.piezas || resultado.piezas.length === 0) continue;

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
      })));
      totalPiezas += resultado.piezas.length;
    } catch (err) {
      console.error(err);
      huboError = true;
    }
  }

  guardarEstado();
  renderMia();

  if (totalPiezas === 0) {
    estadoP.textContent = 'No se detectó ninguna pieza en las fotos. Intenta con mejor luz/enfoque o captura manualmente.';
  } else {
    estadoP.textContent = `Se agregaron ${totalPiezas} pieza(s) de ${files.length} foto(s)${huboError ? ' (alguna foto falló, revisa)' : ''}. Revisa cada valor en la tabla de arriba antes de comparar — la IA puede equivocarse.`;
  }
}

document.getElementById('input-foto-ocr').addEventListener('change', (e) => {
  procesarFotosMia(Array.from(e.target.files));
});

// ===================== COMPARAR =====================

function estadoALegible(estadoPieza) {
  const mapa = { ok: 'Coincide', cantidad: 'Cantidad incorrecta', invertida: 'Veta mal orientada', enchape: 'Cubrecanto incorrecto', falta: 'Falta en proveedor', sobra: 'Pieza no solicitada' };
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
renderProveedor();
document.getElementById('proveedor-telefono').value = estado.proveedorTelefono || '';
revisarArchivoCompartido();
