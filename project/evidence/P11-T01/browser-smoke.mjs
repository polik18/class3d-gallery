import assert from 'node:assert/strict';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const debugPort = Number(process.env.CHROME_DEBUG_PORT ?? 9228);
const appUrl = process.env.APP_URL ?? 'http://127.0.0.1:4173/class3d-gallery/';
const evidencePrefix = process.env.EVIDENCE_PREFIX ?? 'local';
const evidenceDir = path.resolve('project/evidence/P11-T01');
await mkdir(evidenceDir, { recursive: true });

const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
const target = targets.find((item) => item.type === 'page');
assert(target?.webSocketDebuggerUrl, 'Chrome page target is unavailable');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let messageId = 0;
const pending = new Map();
const pageErrors = [];
const requests = [];
const downloads = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const task = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) task.reject(new Error(message.error.message));
    else task.resolve(message.result);
  }
  if (message.method === 'Runtime.exceptionThrown') {
    const details = message.params.exceptionDetails;
    pageErrors.push(details.exception?.description ?? details.text);
  }
  if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request);
  if (message.method === 'Browser.downloadWillBegin') downloads.push(message.params);
});

function send(method, params = {}) {
  const id = ++messageId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(expression, message, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const state = await evaluate("({ url: location.href, count: document.querySelector('#gallery-count')?.textContent, status: document.querySelector('#media-status')?.textContent, library: document.querySelector('#library-status')?.textContent })");
  throw new Error(`Timed out: ${message}; ${JSON.stringify(state)}; errors=${JSON.stringify(pageErrors)}`);
}

async function captureScreenshot(name) {
  const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(path.join(evidenceDir, name), Buffer.from(capture.data, 'base64'));
}

async function play(title, selector, statusPattern = '') {
  await evaluate(`(() => {
    const card = [...document.querySelectorAll('.work-card')].find((item) => item.querySelector('h3')?.textContent === ${JSON.stringify(title)});
    if (!card) throw new Error('Missing card: ' + ${JSON.stringify(title)});
    [...card.querySelectorAll('button')].find((button) => button.textContent === '播放')?.click();
  })()`);
  await waitFor(`document.querySelector(${JSON.stringify(selector)})${statusPattern ? ` && ${statusPattern}` : ''}`, `renderer for ${title}`);
}

async function verifyCardPreview(title, selector) {
  await evaluate(`(() => {
    const card = [...document.querySelectorAll('.work-card')].find((item) => item.querySelector('h3')?.textContent === ${JSON.stringify(title)});
    if (!card) throw new Error('Missing card: ' + ${JSON.stringify(title)});
    card.scrollIntoView({ block: 'center' });
  })()`);
  await waitFor(`[...document.querySelectorAll('.work-card')].some((item) => item.querySelector('h3')?.textContent === ${JSON.stringify(title)} && item.querySelector(${JSON.stringify(selector)}))`, `card preview for ${title}`);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Page.navigate', { url: appUrl });
await waitFor("document.readyState === 'complete' && document.querySelector('#media-file-input')", 'app ready');
await evaluate(`(async () => {
  localStorage.clear();
  sessionStorage.clear();
  await new Promise((resolve) => {
    const request = indexedDB.open('class3d-gallery-v2');
    request.onerror = () => resolve();
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('gallery')) {
        database.close();
        resolve();
        return;
      }
      const transaction = database.transaction('gallery', 'readwrite');
      transaction.objectStore('gallery').clear();
      transaction.oncomplete = transaction.onerror = () => {
        database.close();
        resolve();
      };
    };
  });
  location.reload();
})()`);
await waitFor("document.readyState === 'complete' && document.querySelectorAll('.work-card').length === 3", 'clean app ready');
await new Promise((resolve) => setTimeout(resolve, 250));
requests.length = 0;

await evaluate(`(() => {
  const fromBase64 = (value) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  const image = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="800" viewBox="0 0 640 800"><defs><radialGradient id="g"><stop stop-color="#ffe29a"/><stop offset="1" stop-color="#ef5a3c"/></radialGradient></defs><rect width="640" height="800" fill="#172523"/><circle cx="320" cy="360" r="220" fill="url(#g)"/><circle cx="320" cy="360" r="82" fill="#fff4d1"/><text x="320" y="690" fill="white" font-size="42" text-anchor="middle">LIGHT STUDY</text></svg>';
  const wav = new Uint8Array(44);
  const wavView = new DataView(wav.buffer);
  ['RIFF', 'WAVE', 'fmt ', 'data'].forEach((word, group) => {
    const offset = [0, 8, 12, 36][group];
    [...word].forEach((character, index) => wavView.setUint8(offset + index, character.charCodeAt(0)));
  });
  wavView.setUint32(4, 36, true); wavView.setUint32(16, 16, true); wavView.setUint16(20, 1, true);
  wavView.setUint16(22, 1, true); wavView.setUint32(24, 8000, true); wavView.setUint32(28, 16000, true); wavView.setUint16(32, 2, true); wavView.setUint16(34, 16, true);
  const positions = new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]);
  const positionBytes = new Uint8Array(positions.buffer);
  const positionBase64 = btoa(String.fromCharCode(...positionBytes));
  const gltf = JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, -1, 0], max: [1, 1, 0] }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positionBytes.byteLength }],
    buffers: [{ byteLength: positionBytes.byteLength, uri: 'data:application/octet-stream;base64,' + positionBase64 }]
  });
  const pdfContent = 'BT /F1 20 Tf 42 220 Td (Class3D PDF Preview) Tj ET\\n';
  const pdfObjects = [
    '1 0 obj\\n<< /Type /Catalog /Pages 2 0 R >>\\nendobj\\n',
    '2 0 obj\\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\\nendobj\\n',
    '3 0 obj\\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\\nendobj\\n',
    '4 0 obj\\n<< /Length ' + pdfContent.length + ' >>\\nstream\\n' + pdfContent + 'endstream\\nendobj\\n',
    '5 0 obj\\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\\nendobj\\n'
  ];
  let pdf = '%PDF-1.4\\n';
  const pdfOffsets = [0];
  pdfObjects.forEach((object) => { pdfOffsets.push(pdf.length); pdf += object; });
  const xrefOffset = pdf.length;
  pdf += 'xref\\n0 6\\n0000000000 65535 f \\n' + pdfOffsets.slice(1).map((offset) => String(offset).padStart(10, '0') + ' 00000 n \\n').join('');
  pdf += 'trailer\\n<< /Size 6 /Root 1 0 R >>\\nstartxref\\n' + xrefOffset + '\\n%%EOF';
  const transfer = new DataTransfer();
  transfer.items.add(new File([image], '序號01__光點__林同學__圖片作品.svg', { type: 'image/svg+xml' }));
  transfer.items.add(new File([fromBase64('GkXfo0A=')], '序號02__影像實驗__陳同學__影片作品.webm', { type: 'video/webm' }));
  transfer.items.add(new File([wav], '序號03__聲音日記__張同學__音訊作品.wav', { type: 'audio/wav' }));
  transfer.items.add(new File([pdf], '序號04__紙上故事__黃同學__PDF 作品.pdf', { type: 'application/pdf' }));
  transfer.items.add(new File([gltf], '序號05__三角星球__王同學__3D 作品.gltf', { type: 'model/gltf+json' }));
  const input = document.querySelector('#media-file-input');
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await waitFor("document.querySelectorAll('.work-card').length === 5", 'five mixed-media cards');

await verifyCardPreview('光點', '.work-preview-layer img');
await verifyCardPreview('影像實驗', '.work-preview-layer video');
await verifyCardPreview('聲音日記', '.work-preview-layer audio');
await verifyCardPreview('紙上故事', '.work-preview-layer iframe');
await verifyCardPreview('三角星球', '.work-preview-layer canvas');

await evaluate("document.querySelector('#start-exhibition').click()");
await waitFor("document.querySelector('#start-exhibition-dialog').open", 'start exhibition choice');
await evaluate("document.querySelector('[data-start-mode=multiple]').click()");
await waitFor("document.querySelector('.showcase-stage--overview.showcase-stage--manual') && document.querySelectorAll('.showcase-tile--selectable').length === 5", 'multiple-work exhibition');
await new Promise((resolve) => setTimeout(resolve, 250));
await captureScreenshot('manual-multiple-exhibition.png');
await evaluate("(() => { const tile = document.querySelectorAll('.showcase-tile--selectable')[1]; if (!tile) return false; try { tile.click(); } catch {} return true; })()");
await waitFor("document.querySelector('.showcase-stage--carousel.showcase-stage--manual h2')?.textContent === '影像實驗'", 'select work from multiple exhibition');
await new Promise((resolve) => setTimeout(resolve, 850));
await captureScreenshot('manual-single-exhibition.png');
await evaluate("[...document.querySelectorAll('.showcase-controls button')].find((button) => button.textContent.includes('下一件')).click()");
await waitFor("document.querySelector('.showcase-stage--carousel h2')?.textContent === '聲音日記'", 'next work control');
await evaluate(`(() => {
  const select = document.querySelector('.showcase-controls select');
  select.value = '4';
  select.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await waitFor("document.querySelector('.showcase-stage--carousel h2')?.textContent === '三角星球'", 'direct work selector');
await evaluate("[...document.querySelectorAll('.showcase-controls button')].find((button) => button.textContent === '多件同展').click()");
await waitFor("document.querySelector('.showcase-stage--overview.showcase-stage--manual')", 'switch back to multiple exhibition');
await evaluate("document.querySelector('.showcase-close').click()");
await waitFor("document.querySelector('#showcase-overlay').hidden", 'close manual exhibition');

await play('光點', '.media-stage .native-renderer--image img');
await play('影像實驗', '.media-stage video');
await play('聲音日記', '.media-stage audio');
await play('紙上故事', '.media-stage iframe');
await play('三角星球', '.media-stage canvas', "document.querySelector('#media-status').textContent.includes('已載入')");

await evaluate("document.querySelector('#save-local-gallery').click()");
await waitFor("document.querySelector('#library-status').textContent.includes('已將 5 件')", 'save mixed gallery');

await send('Page.reload', { ignoreCache: true });
await waitFor("document.readyState === 'complete' && document.querySelectorAll('.work-card').length === 5", 'automatic IndexedDB restore');
await waitFor("document.querySelector('#library-status').textContent.includes('已從這台電腦載入 5 件')", 'restore status');
await play('三角星球', '.media-stage canvas', "document.querySelector('#media-status').textContent.includes('已載入')");

await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: evidenceDir, eventsEnabled: true });
const downloadsBefore = downloads.length;
await evaluate("document.querySelector('#export-local-gallery').click()");
await waitFor("document.querySelector('#library-status').textContent.includes('已匯出 5 件')", 'archive export status');
for (let attempt = 0; attempt < 100; attempt += 1) {
  if (downloads.length > downloadsBefore) break;
  await new Promise((resolve) => setTimeout(resolve, 50));
}
const archivesAfter = (await readdir(evidenceDir)).filter((name) => name.endsWith('.c3dg')).length;
assert(downloads.length > downloadsBefore && archivesAfter > 0, 'local gallery archive was not downloaded');

await evaluate("document.querySelector('.work-grid').scrollIntoView({ block: 'start' }); true");
await new Promise((resolve) => setTimeout(resolve, 200));
const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await writeFile(path.join(evidenceDir, `${evidencePrefix}-mixed-media.png`), Buffer.from(screenshot.data, 'base64'));

const uploadRequests = requests.filter((request) => ['POST', 'PUT', 'PATCH'].includes(request.method));
assert.equal(uploadRequests.length, 0, `artwork upload request detected: ${uploadRequests.map((request) => request.url).join(', ')}`);
assert.deepEqual(pageErrors, []);

console.log(JSON.stringify({
  browser: 'Google Chrome headless',
  appUrl,
  media: ['image', 'video', 'audio', 'pdf', 'model3d'],
  cards: 5,
  cardPreviews: ['image', 'video', 'audio', 'pdf', 'model3d'],
  manualExhibition: { modes: ['single', 'multiple'], previousNext: true, directSelection: true },
  indexedDbSaveAndReload: true,
  archiveDownloaded: true,
  uploadRequests: uploadRequests.length,
  pageErrors
}, null, 2));
socket.close();
