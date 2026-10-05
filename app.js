'use strict';

const LS_KEY = 'revisor-cortes:v1';

const filaMiaVacia = () => ({
  cantidad: '', ladoA: '', ladoB: '',
  enchapeA1: false, enchapeA2: false, enchapeB1: false, enchapeB2: false,
});
const filaProvVacia = () => ({ cantidad: '', base: '', altura: '', observacion: '' });

let estado = {
  material: '',
  cubrecanto: '',
  misFilas: Array.from({ length: 6 }, filaMiaVacia),
  provFilas: [],
  provCliente: '',
  provMaterial: '',
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

function renderMia() {
  document.getElementById('mia-material').value = estado.material;
  document.getElementById('mia-cubrecanto').value = estado.cubrecanto;

  const tbody = document.getElementById('tbody-mia');
  tbody.innerHTML = '';
  estado.misFilas.forEach((fila, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td><input type="number" min="0" step="1" data-campo="cantidad" value="${fila.cantidad}"></td>
      <td><input type="number" min="0" step="0.1" data-campo="ladoA" value="${fila.ladoA}"></td>
      <td><input type="number" min="0" step="0.1" data-campo="ladoB" value="${fila.ladoB}"></td>
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
      <td><input type="text" data-campo="observacion" value="${fila.observacion || ''}"></td>
      <td><button type="button" class="btn-eliminar" title="Eliminar pieza">✕</button></td>
    `;
    tr.querySelectorAll('[data-campo]').forEach(input => {
      const campo = input.dataset.campo;
      input.addEventListener('input', () => { fila[campo] = input.value; guardarEstado(); });
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

function aplicarReporteParseado(reporte) {
  estado.provCliente = reporte.cliente || '';
  estado.provMaterial = reporte.material || '';
  estado.provFilas = reporte.piezas.map(p => ({
    cantidad: p.cantidad, base: p.base, altura: p.altura, observacion: p.observacion || '',
  }));
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

document.getElementById('input-pdf').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const estadoTexto = document.getElementById('pdf-estado');
  try {
    const texto = await extraerTextoDeArchivo(file, estadoTexto);
    const reporte = Engine.parseReporteProveedor(texto);
    if (reporte.piezas.length === 0) {
      estadoTexto.textContent = 'No se encontraron piezas en el archivo. Prueba con "pegar texto" o revisa el archivo.';
      return;
    }
    aplicarReporteParseado(reporte);
    estadoTexto.textContent = `Se detectaron ${reporte.piezas.length} piezas. Revísalas antes de comparar.`;
  } catch (err) {
    console.error(err);
    estadoTexto.textContent = 'No se pudo leer el archivo. Prueba con "pegar texto" como respaldo.';
  }
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

document.getElementById('input-foto-ocr').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const contenedor = document.getElementById('ocr-resultado');
  const estadoP = document.getElementById('ocr-estado');
  contenedor.hidden = false;
  estadoP.textContent = 'Analizando la foto con IA, esto puede tardar unos segundos (reintenta sola si el modelo está saturado)...';

  try {
    if (typeof window.leerHojaConIA !== 'function') {
      throw new Error('El módulo de lectura con IA todavía no está listo (revisa tu conexión y vuelve a intentar).');
    }
    const resultado = await window.leerHojaConIA(file);

    if (!resultado.piezas || resultado.piezas.length === 0) {
      estadoP.textContent = 'No se detectaron piezas en la foto. Intenta con mejor luz/enfoque o captura manualmente.';
      return;
    }

    if (resultado.material && !estado.material) estado.material = resultado.material;
    if (resultado.cubreCanto && !estado.cubrecanto) estado.cubrecanto = resultado.cubreCanto;

    estado.misFilas = resultado.piezas.map(p => ({
      cantidad: p.cantidad ?? '',
      ladoA: p.ladoA ?? '',
      ladoB: p.ladoB ?? '',
      enchapeA1: !!p.enchapeA1,
      enchapeA2: !!p.enchapeA2,
      enchapeB1: !!p.enchapeB1,
      enchapeB2: !!p.enchapeB2,
    }));
    guardarEstado();
    renderMia();

    estadoP.textContent = `Se detectaron ${resultado.piezas.length} piezas. Revisa cada valor en la tabla de arriba antes de comparar — la IA puede equivocarse.`;
  } catch (err) {
    console.error(err);
    estadoP.textContent = 'No se pudo analizar la foto (' + (err.message || 'error desconocido') + '). Captura los datos manualmente en la tabla de arriba.';
  }
});

// ===================== COMPARAR =====================

function estadoALegible(estadoPieza) {
  const mapa = { ok: 'Coincide', cantidad: 'Cantidad incorrecta', invertida: 'Revisar orientación', falta: 'Falta en proveedor', sobra: 'Pieza no solicitada' };
  return mapa[estadoPieza] || estadoPieza;
}
function estadoAClase(estadoPieza) {
  if (estadoPieza === 'ok') return 'fila-ok';
  if (estadoPieza === 'invertida') return 'fila-advertencia';
  return 'fila-error';
}

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
    const colMia = r.mia ? `${r.mia.cantidad} pza x ${r.mia.ladoA_cm} x ${r.mia.ladoB_cm} cm` : '—';
    const colProv = r.proveedor ? `${r.proveedor.cantidad} pza x ${r.proveedor.base_mm} x ${r.proveedor.altura_mm} mm` : '—';
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
    const lineas = resultados
      .filter(r => r.estado !== 'ok')
      .map(r => `- ${r.mensaje}`);
    const texto = [
      `Correcciones a la lista de corte${estado.material ? ' - ' + estado.material : ''}:`,
      '',
      ...lineas,
    ].join('\n');
    document.getElementById('texto-correcciones').value = texto;
    document.getElementById('btn-whatsapp').href = `https://wa.me/?text=${encodeURIComponent(texto)}`;
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

// ===================== INIT =====================

cargarEstado();
renderMia();
renderProveedor();
