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

document.getElementById('input-pdf').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const estadoTexto = document.getElementById('pdf-estado');
  estadoTexto.textContent = 'Leyendo PDF...';
  try {
    const texto = await extraerTextoPDF(file);
    const reporte = Engine.parseReporteProveedor(texto);
    if (reporte.piezas.length === 0) {
      estadoTexto.textContent = 'No se encontraron piezas en el PDF. Prueba con "pegar texto" o revisa el archivo.';
      return;
    }
    aplicarReporteParseado(reporte);
    estadoTexto.textContent = `Se detectaron ${reporte.piezas.length} piezas en el PDF. Revísalas antes de comparar.`;
  } catch (err) {
    console.error(err);
    estadoTexto.textContent = 'No se pudo leer el PDF (¿es una imagen escaneada sin texto? prueba "pegar texto").';
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

// ===================== OCR (beta, solo ayuda visual) =====================

let tesseractCargado = false;

document.getElementById('input-foto-ocr').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const contenedor = document.getElementById('ocr-resultado');
  const textarea = document.getElementById('ocr-texto');
  contenedor.hidden = false;
  textarea.value = 'Analizando imagen, esto puede tardar unos segundos...';

  try {
    if (!tesseractCargado) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.0.4/tesseract.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
      tesseractCargado = true;
    }
    const { data } = await Tesseract.recognize(file, 'spa');
    textarea.value = data.text.trim() || '(no se detectó texto legible en la imagen)';
  } catch (err) {
    console.error(err);
    textarea.value = 'No se pudo analizar la imagen. Transcribe los datos manualmente en la tabla de arriba.';
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
