import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const debugPort = Number(process.env.CHROME_DEBUG_PORT ?? 9228);
const appUrl = process.env.APP_URL ?? 'http://127.0.0.1:4173/class3d-gallery/';
const evidenceDir = path.resolve('project/evidence/P10-T01');
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

async function waitFor(expression, message, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  const state = await evaluate("({ count: document.querySelector('#gallery-count')?.textContent, cards: document.querySelectorAll('.work-card').length, status: document.querySelector('#media-status')?.textContent })");
  throw new Error(`Timed out: ${message}; ${JSON.stringify(state)}; errors=${JSON.stringify(pageErrors)}`);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Page.navigate', { url: appUrl });
await waitFor("document.readyState === 'complete' && document.querySelectorAll('.work-card').length === 3", 'gallery ready');
await evaluate('localStorage.clear(); sessionStorage.clear(); window.__class3dXss = 0; location.reload()');
await waitFor("document.readyState === 'complete' && document.querySelectorAll('.work-card').length === 3", 'clean gallery ready');
await evaluate('window.__class3dXss = 0; document.fonts.ready.then(() => true)');
await new Promise((resolve) => setTimeout(resolve, 300));
requests.length = 0;

const importStartedAt = Date.now();
await evaluate(`(() => {
  const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), (character) => character.charCodeAt(0));
  const transfer = new DataTransfer();
  for (let index = 1; index <= 200; index += 1) {
    const number = String(index).padStart(3, '0');
    const name = index === 1
      ? number + '_"><img src=x onerror="window.__class3dXss=1">_測試同學.png'
      : number + '_作品 ' + index + '_測試同學.png';
    transfer.items.add(new File([bytes], name, { type: 'image/png', lastModified: index }));
  }
  const input = document.querySelector('#media-file-input');
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await waitFor("document.querySelectorAll('.work-card').length === 200 && document.querySelector('#gallery-count').textContent.includes('200 / 200')", '200 work import');
const importDurationMs = Date.now() - importStartedAt;
assert(importDurationMs < 10_000, `200-work import/render took ${importDurationMs}ms`);

const largeGallery = await evaluate(`({
  cards: document.querySelectorAll('.work-card').length,
  domNodes: document.querySelectorAll('*').length,
  titleInjectedElements: document.querySelectorAll('.work-card h3 img').length,
  compromised: window.__class3dXss
})`);
assert.equal(largeGallery.cards, 200);
assert(largeGallery.domNodes < 15_000, `unexpected DOM growth: ${largeGallery.domNodes}`);
assert.equal(largeGallery.titleInjectedElements, 0);
assert.equal(largeGallery.compromised, 0);

await evaluate(`(() => {
  const select = document.querySelector('#gallery-sort');
  select.value = 'importedAt';
  select.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await waitFor("document.querySelector('.work-card h3').textContent.startsWith('作品 200')", '200-work sorting');

await evaluate("[...document.querySelectorAll('.work-card button')].find((button) => button.textContent.startsWith('留言')).click()");
await waitFor("document.querySelector('#engagement-dialog').open", 'comment dialog');
await evaluate(`(() => {
  const dialog = document.querySelector('#engagement-dialog');
  dialog.querySelector('[name=body]').value = '<img src=x onerror="window.__class3dXss=2">';
  dialog.querySelector('.comment-form').requestSubmit();
})()`);
await waitFor("document.querySelectorAll('[data-role=pending] .comment-item').length === 1", 'hostile comment pending');
await evaluate("[...document.querySelectorAll('[data-role=pending] button')].find((button) => button.textContent === '核准').click()");
await waitFor("document.querySelectorAll('[data-role=approved] .comment-item').length === 1", 'hostile comment approved');
assert.equal(await evaluate("document.querySelectorAll('[data-role=approved] img').length"), 0);
assert.equal(await evaluate('window.__class3dXss'), 0);
await evaluate("document.querySelector('[data-action=close]').click()");

await evaluate("document.querySelector('#start-showcase').focus()");
assert.equal(await evaluate('document.activeElement.id'), 'start-showcase');
await evaluate("document.querySelector('#start-showcase').click()");
await waitFor("!document.querySelector('#showcase-overlay').hidden", 'focusable control starts showcase');
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await waitFor("document.querySelector('#showcase-overlay').hidden", 'keyboard exits showcase');

await evaluate("document.querySelector('#start-showcase').click()");
await waitFor("!document.querySelector('#showcase-overlay').hidden", 'touch test showcase');
await evaluate("document.dispatchEvent(new TouchEvent('touchstart', { bubbles: true }))");
await waitFor("document.querySelector('#showcase-overlay').hidden", 'touch exits showcase');

await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await evaluate("document.querySelector('#start-showcase').click()");
await waitFor("document.querySelector('.showcase-stage.transition-none')", 'reduced motion class');
const reducedMotion = await evaluate(`({
  transition: document.querySelector('.showcase-stage').className,
  progressAnimationDuration: getComputedStyle(document.querySelector('.showcase-progress i')).animationDuration
})`);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await waitFor("document.querySelector('#showcase-overlay').hidden", 'exit reduced motion showcase');
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });

await evaluate("document.querySelector('#works').scrollIntoView(); true");
await new Promise((resolve) => setTimeout(resolve, 150));
const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await writeFile(path.join(evidenceDir, 'large-gallery.png'), Buffer.from(screenshot.data, 'base64'));

const uploadRequests = requests.filter((request) => ['POST', 'PUT', 'PATCH'].includes(request.method));
assert.equal(uploadRequests.length, 0, `files were uploaded: ${uploadRequests.map((request) => request.url).join(', ')}`);
assert.deepEqual(pageErrors, []);

console.log(JSON.stringify({
  browser: 'Google Chrome headless',
  importDurationMs,
  largeGallery,
  sortVerified: true,
  filenameAndCommentXssSafe: true,
  keyboardFocusableAndExit: true,
  touchExit: true,
  reducedMotion,
  uploadRequests: uploadRequests.length,
  pageErrors
}, null, 2));
socket.close();
