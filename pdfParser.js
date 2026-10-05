// Extrae texto de un PDF (con texto seleccionable, no escaneado) reconstruyendo
// el orden de lectura por filas, usando pdf.js. Solo corre en el navegador.
'use strict';

async function extraerTextoPDF(file) {
  if (!window.pdfjsLib) {
    throw new Error('pdf.js no está cargado todavía.');
  }

  const buffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;

  const lineasTotales = [];

  for (let numPagina = 1; numPagina <= pdf.numPages; numPagina++) {
    const pagina = await pdf.getPage(numPagina);
    const contenido = await pagina.getTextContent();

    // Cada item trae su posición (transform[4]=x, transform[5]=y) y el texto (str).
    const items = contenido.items
      .filter(it => it.str && it.str.trim().length > 0)
      .map(it => ({ x: it.transform[4], y: it.transform[5], texto: it.str }));

    // Agrupa items en filas por cercanía vertical (la misma fila de una tabla
    // puede tener variaciones de 1-2pt entre columnas).
    const TOLERANCIA_Y = 3;
    items.sort((a, b) => b.y - a.y || a.x - b.x);

    const filas = [];
    for (const item of items) {
      let fila = filas.find(f => Math.abs(f.y - item.y) <= TOLERANCIA_Y);
      if (!fila) {
        fila = { y: item.y, items: [] };
        filas.push(fila);
      }
      fila.items.push(item);
    }

    for (const fila of filas) {
      fila.items.sort((a, b) => a.x - b.x);
      const texto = fila.items.map(it => it.texto).join(' ').replace(/\s+/g, ' ').trim();
      if (texto) lineasTotales.push(texto);
    }
  }

  return lineasTotales.join('\n');
}

window.extraerTextoPDF = extraerTextoPDF;
