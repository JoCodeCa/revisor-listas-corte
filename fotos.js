// Guarda las fotos de "mi lista" en el dispositivo (IndexedDB) para poder mostrar, al revisar
// un número dudoso, el renglón de la hoja original junto al valor que leyó la IA.
// No se usa localStorage porque una sola foto ya rebasa su límite (~5 MB).
'use strict';

const Fotos = (() => {
  const DB_NOMBRE = 'revisor-cortes-fotos';
  const STORE = 'fotos';
  let dbPromesa = null;

  function abrir() {
    if (!dbPromesa) {
      dbPromesa = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NOMBRE, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromesa;
  }

  async function operar(modo, accion) {
    const db = await abrir();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, modo);
      const req = accion(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
    });
  }

  // Todas las funciones toleran que IndexedDB no exista o falle (modo privado, etc.):
  // la app sigue funcionando, solo sin la foto al revisar.
  async function guardar(id, blob) {
    try { await operar('readwrite', s => s.put(blob, id)); return true; } catch (e) { return false; }
  }
  async function obtener(id) {
    try { return (await operar('readonly', s => s.get(id))) || null; } catch (e) { return null; }
  }
  async function borrarTodas() {
    try { await operar('readwrite', s => s.clear()); } catch (e) { /* nada que borrar */ }
  }
  // Borra las fotos que ya ninguna fila usa (p.ej. tras eliminar todas las piezas de una foto).
  async function limpiarSinUso(idsEnUso) {
    try {
      const claves = await operar('readonly', s => s.getAllKeys());
      const enUso = new Set(idsEnUso);
      const sobrantes = (claves || []).filter(k => !enUso.has(k));
      if (sobrantes.length) await operar('readwrite', s => { sobrantes.forEach(k => s.delete(k)); });
    } catch (e) { /* no es crítico */ }
  }

  return { guardar, obtener, borrarTodas, limpiarSinUso };
})();

window.Fotos = Fotos;
