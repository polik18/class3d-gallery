import './style.css';
import { createGuestUser } from './backend/auth';
import type { CloudRecord } from './backend/database';
import { calculateDashboard } from './dashboard/dashboard';
import { setDisplayMode, type DisplayMode } from './exhibition/displayMode';
import { mountModelViewer } from './exhibition/modelViewer';
import { generateArtworkURL } from './qrcode/share';
import { createProfile } from './student/profile';

const records: CloudRecord[] = [
  { id: 'class-301', type: 'class', data: { name: '三年一班' }, updatedAt: Date.now() },
  { id: 'class-302', type: 'class', data: { name: '三年二班' }, updatedAt: Date.now() },
  { id: 'student-01', type: 'student', data: createProfile('01', '林同學'), updatedAt: Date.now() },
  { id: 'student-02', type: 'student', data: createProfile('02', '陳同學'), updatedAt: Date.now() },
  { id: 'student-03', type: 'student', data: createProfile('03', '張同學'), updatedAt: Date.now() },
  { id: 'artwork-light', type: 'artwork', data: { title: '光的房間', author: '林同學' }, updatedAt: Date.now() },
  { id: 'artwork-city', type: 'artwork', data: { title: '漂浮城市', author: '陳同學' }, updatedAt: Date.now() },
  { id: 'artwork-seed', type: 'artwork', data: { title: '一顆種子的旅行', author: '張同學' }, updatedAt: Date.now() }
];

const user = createGuestUser('訪客教師');
const stats = calculateDashboard(records);
const artworks = records.filter((record) => record.type === 'artwork');
const app = document.querySelector<HTMLDivElement>('#app');

if (!app) throw new Error('找不到應用程式掛載點');

app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#top" aria-label="Class3D Gallery 首頁">
      <span class="brand-mark">C3</span>
      <span>Class3D <strong>Gallery</strong></span>
    </a>
    <div class="user-chip"><span class="online-dot"></span>${user.name} · ${user.role === 'teacher' ? '教師模式' : '學生模式'}</div>
  </header>

  <main id="top">
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-copy">
        <p class="eyebrow">CLASSROOMS BECOME GALLERIES</p>
        <h1 id="hero-title">讓每一件作品，<br /><em>擁有自己的空間。</em></h1>
        <p class="hero-intro">從電腦選擇 3D 作品，直接在瀏覽器裡旋轉、縮放、平移與播放模型動畫。檔案不會上傳到任何伺服器。</p>
        <div class="hero-actions">
          <label class="primary-button model-upload-button" for="model-file-input">
            選擇 3D 檔案
            <input id="model-file-input" type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" multiple />
          </label>
          <a class="text-link" href="#works">瀏覽示範作品 <span>↓</span></a>
        </div>
        <p class="upload-help">建議使用單一 GLB；GLTF 請連同它引用的 BIN 與貼圖一起選取。</p>
        <p class="sync-state" id="model-status" aria-live="polite">可選取檔案或直接拖放到右側展台。</p>
      </div>
      <div class="scene-shell" id="model-drop-zone" aria-label="互動式 3D 模型展台，可拖放 GLB 或 GLTF 檔案">
        <canvas id="gallery-scene" tabindex="0" aria-label="3D 模型操作區"></canvas>
        <span class="scene-label">INTERACTIVE 3D VIEWER</span>
        <div class="viewer-toolbar" aria-label="3D 檢視控制">
          <button id="reset-view" type="button">重設視角</button>
          <button id="auto-rotate" type="button" aria-pressed="false">自動旋轉</button>
          <button id="toggle-animation" type="button" aria-pressed="false" disabled>播放動畫</button>
        </div>
        <span class="scene-hint">左鍵旋轉 · 滾輪縮放 · 右鍵平移</span>
        <span class="drop-hint">放開以載入 3D 作品</span>
      </div>
    </section>

    <section class="dashboard" aria-labelledby="dashboard-title">
      <div>
        <p class="section-index">01 / DASHBOARD</p>
        <h2 id="dashboard-title">班級創作，一眼掌握</h2>
      </div>
      <div class="stats" aria-label="內容統計">
        <article><strong>${stats.classes}</strong><span>班級</span></article>
        <article><strong>${stats.students}</strong><span>學生</span></article>
        <article><strong>${stats.artworks}</strong><span>作品</span></article>
      </div>
    </section>

    <section class="works-section" id="works" aria-labelledby="works-title">
      <div class="section-heading">
        <div><p class="section-index">02 / EXHIBITION</p><h2 id="works-title">本週精選作品</h2></div>
        <div class="mode-switcher" aria-label="展示模式">
          <button class="mode-button active" data-mode="gallery" type="button">展廳</button>
          <button class="mode-button" data-mode="fullscreen" type="button">全螢幕</button>
          <button class="mode-button" data-mode="presentation" type="button">簡報</button>
        </div>
      </div>
      <div class="work-grid">
        ${artworks.map((artwork, index) => `
          <article class="work-card work-${index + 1}">
            <div class="work-visual"><span>${String(index + 1).padStart(2, '0')}</span></div>
            <div class="work-meta">
              <div><h3>${artwork.data.title}</h3><p>${artwork.data.author}</p></div>
              <button class="share-button" data-share="${artwork.id}" type="button" aria-label="分享${artwork.data.title}">分享 ↗</button>
            </div>
          </article>
        `).join('')}
      </div>
      <p class="share-state" id="share-state" aria-live="polite"></p>
    </section>

    <section class="architecture" aria-labelledby="architecture-title">
      <div><p class="section-index">03 / FOUNDATION</p><h2 id="architecture-title">已接好的架構基線</h2></div>
      <ul>
        <li><span>01</span><strong>角色模型</strong><small>教師 / 學生</small></li>
        <li><span>02</span><strong>本機載入</strong><small>GLB / GLTF，不上傳伺服器</small></li>
        <li><span>03</span><strong>互動操作</strong><small>旋轉 / 縮放 / 平移 / 重設</small></li>
        <li><span>04</span><strong>動態模型</strong><small>內建動畫 / 自動旋轉</small></li>
      </ul>
    </section>
  </main>

  <a class="portfolio-home-link" href="https://polik18.github.io/" aria-label="回到 Polik 專案總覽">← 回專案總覽</a>

  <footer><span>Class3D Gallery v1.2</span><span>Architecture Preview · Local Data</span></footer>
`;

document.querySelectorAll<HTMLButtonElement>('.mode-button').forEach((button) => {
  button.addEventListener('click', () => {
    const mode = button.dataset.mode as DisplayMode;
    setDisplayMode(mode);
    document.querySelectorAll('.mode-button').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
  });
});

document.querySelectorAll<HTMLButtonElement>('.share-button').forEach((button) => {
  button.addEventListener('click', async () => {
    const url = generateArtworkURL(button.dataset.share ?? '');
    const state = document.querySelector<HTMLParagraphElement>('#share-state');
    try {
      await navigator.clipboard.writeText(url);
      if (state) state.textContent = `已複製作品連結：${url}`;
    } catch {
      if (state) state.textContent = `作品連結：${url}`;
    }
  });
});

const sceneCanvas = document.querySelector<HTMLCanvasElement>('#gallery-scene');
const modelInput = document.querySelector<HTMLInputElement>('#model-file-input');
const modelStatus = document.querySelector<HTMLElement>('#model-status');
const dropZone = document.querySelector<HTMLElement>('#model-drop-zone');
const resetView = document.querySelector<HTMLButtonElement>('#reset-view');
const autoRotate = document.querySelector<HTMLButtonElement>('#auto-rotate');
const toggleAnimation = document.querySelector<HTMLButtonElement>('#toggle-animation');

if (sceneCanvas && modelInput && modelStatus && dropZone && resetView && autoRotate && toggleAnimation) {
  mountModelViewer({
    canvas: sceneCanvas,
    shell: dropZone,
    input: modelInput,
    status: modelStatus,
    resetButton: resetView,
    autoRotateButton: autoRotate,
    animationButton: toggleAnimation
  });
}
