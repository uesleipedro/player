export function parseM3U(text) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./m3uWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = event => {
      worker.terminate();
      if (event.data.ok) resolve(event.data);
      else reject(new Error(event.data.error));
    };
    worker.onerror = event => {
      worker.terminate();
      reject(new Error(event.message || 'Erro no parser M3U'));
    };
    worker.postMessage({ text });
  });
}

export async function loadM3U(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Não foi possível carregar a lista (${response.status})`);
  return parseM3U(await response.text());
}
