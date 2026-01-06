const CACHE_NAME = 'dunkadunka-lab-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/static/styles.css',
  '/static/waveform.js',
  '/static/modules/audio.js',
  '/static/modules/fft.js',
  '/static/modules/math.js',
  '/manifest.json'
];

// Install event - cache resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version or fetch from network
        return response || fetch(event.request);
      }
    )
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Handle file opening from the operating system
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'OPEN_FILE') {
    // Notify the main app that a file needs to be opened
    event.ports[0].postMessage({
      type: 'FILE_OPENED',
      file: event.data.file
    });
  }
});

// Handle share target (when files are shared to the app)
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Handle share target POST requests
  if (event.request.method === 'POST' && url.pathname === '/') {
    event.respondWith(handleShareTarget(event.request));
  }
});

async function handleShareTarget(request) {
  const formData = await request.formData();
  const audioFile = formData.get('audio');
  
  if (audioFile) {
    // Store the file temporarily and redirect to main app
    const clients = await self.clients.matchAll();
    if (clients.length > 0) {
      // Send file to existing client
      clients[0].postMessage({
        type: 'SHARED_FILE',
        file: audioFile
      });
      return Response.redirect('/', 303);
    } else {
      // Open new client and handle file
      const client = await self.clients.openWindow('/');
      if (client) {
        client.postMessage({
          type: 'SHARED_FILE',
          file: audioFile
        });
      }
      return new Response('File received', { status: 200 });
    }
  }
  
  return Response.redirect('/', 303);
}