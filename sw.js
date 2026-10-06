// Service worker mínimo: su único trabajo es recibir los archivos que otra app
// (como WhatsApp) comparte con esta PWA usando el Web Share Target API.
// No cachea nada de la app para funcionar sin conexión (no era el objetivo aquí);
// si el navegador no logra activarlo, la app sigue funcionando normal, solo sin
// la opción de "Compartir a esta app" desde otras apps.

const CACHE_COMPARTIDOS = 'compartidos-v1';
const RUTA_COMPARTIR = '/compartir';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname === RUTA_COMPARTIR) {
    event.respondWith(manejarCompartido(event.request));
  }
});

async function manejarCompartido(request) {
  try {
    const formData = await request.formData();
    const archivos = formData.getAll('archivos');
    const cache = await caches.open(CACHE_COMPARTIDOS);

    const meta = [];
    for (let i = 0; i < archivos.length; i++) {
      const archivo = archivos[i];
      if (!(archivo instanceof File)) continue;
      const clave = `/compartido-${i}`;
      await cache.put(clave, new Response(archivo, { headers: { 'Content-Type': archivo.type || 'application/octet-stream' } }));
      meta.push({ clave, nombre: archivo.name, tipo: archivo.type });
    }
    await cache.put('/compartido-meta', new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));

    return Response.redirect('/compartir.html', 303);
  } catch (err) {
    return Response.redirect('/compartir.html?error=1', 303);
  }
}
