// Tema claro/oscuro. Se carga en el <head> (sin defer) para aplicar el tema antes de
// pintar la página y evitar el "destello" blanco al abrir la app en modo oscuro.
// Se guarda aparte del estado de la app para que "Borrar todo" no lo reinicie.
'use strict';

(function () {
  const LS_TEMA = 'revisor-cortes:tema';
  const TEMAS = ['auto', 'claro', 'oscuro'];

  function obtener() {
    try {
      const guardado = localStorage.getItem(LS_TEMA);
      if (TEMAS.includes(guardado)) return guardado;
    } catch (e) { /* localStorage bloqueado: usamos el del sistema */ }
    return 'auto';
  }

  // "auto" quita el atributo y deja que el CSS siga a prefers-color-scheme.
  function aplicar(tema) {
    if (tema === 'claro' || tema === 'oscuro') {
      document.documentElement.dataset.tema = tema;
    } else {
      delete document.documentElement.dataset.tema;
    }
  }

  function guardar(tema) {
    if (!TEMAS.includes(tema)) tema = 'auto';
    try { localStorage.setItem(LS_TEMA, tema); } catch (e) { /* almacenamiento bloqueado */ }
    aplicar(tema);
  }

  aplicar(obtener());
  window.Tema = { obtener, guardar };
})();
