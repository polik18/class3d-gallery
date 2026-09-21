import * as THREE from 'three';
import './style.css';
import { createGuestUser } from './backend/auth';
import { syncRecord, type CloudRecord } from './backend/database';
import { calculateDashboard } from './dashboard/dashboard';
import { setDisplayMode, type DisplayMode } from './exhibition/displayMode';
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
        <p class="hero-intro">Class3D Gallery 是班級作品的沉浸式展示基線。這個預覽已串接現有資料模型；雲端資料庫與正式權限仍待設定。</p>
        <div class="hero-actions">
          <a class="primary-button" href="#works">進入作品展</a>
          <button class="text-button" id="sync-button" type="button">測試同步介面 <span>↗</span></button>
        </div>
        <p class="sync-state" id="sync-state" aria-live="polite">目前使用本機示範資料</p>
      </div>
      <div class="scene-shell" aria-label="互動式 3D 展場預覽">
        <canvas id="gallery-scene"></canvas>
        <span class="scene-label">LIVE 3D PREVIEW</span>
        <span class="scene-hint">移動游標探索空間</span>
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
        <li><span>02</span><strong>資料介面</strong><small>Firebase / Supabase adapter 待實作</small></li>
        <li><span>03</span><strong>作品分享</strong><small>可產生作品專屬 URL</small></li>
        <li><span>04</span><strong>展示模式</strong><small>展廳 / 全螢幕 / 簡報</small></li>
      </ul>
    </section>
  </main>

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

document.querySelector<HTMLButtonElement>('#sync-button')?.addEventListener('click', async () => {
  const button = document.querySelector<HTMLButtonElement>('#sync-button');
  const state = document.querySelector<HTMLParagraphElement>('#sync-state');
  if (button) button.disabled = true;
  if (state) state.textContent = '正在測試同步 adapter…';
  const results = await Promise.all(records.map(syncRecord));
  if (state) state.textContent = `Adapter 回應成功：${results.length} 筆（尚未連接雲端）`;
  if (button) button.disabled = false;
});

function mountGalleryScene(canvas: HTMLCanvasElement) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x11100f, 5, 13);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 1.5, 6.7);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x11100f, 1);

  scene.add(new THREE.AmbientLight(0xfff4dd, 1.6));
  const keyLight = new THREE.DirectionalLight(0xffb968, 4);
  keyLight.position.set(2, 5, 4);
  scene.add(keyLight);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 12),
    new THREE.MeshStandardMaterial({ color: 0x22201d, roughness: 0.8 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.5;
  floor.position.z = -1;
  scene.add(floor);

  const artColors = [0xe8563f, 0x7a9e7e, 0xf1ba55];
  const group = new THREE.Group();
  artColors.forEach((color, index) => {
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 1.75, 0.12),
      new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.08 })
    );
    frame.position.set((index - 1) * 1.8, 0, index === 1 ? -0.45 : 0);
    frame.rotation.y = (index - 1) * -0.16;
    group.add(frame);
  });
  scene.add(group);

  let pointerX = 0;
  let pointerY = 0;
  canvas.addEventListener('pointermove', (event) => {
    const bounds = canvas.getBoundingClientRect();
    pointerX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 0.55;
    pointerY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 0.25;
  });

  const resize = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  renderer.setAnimationLoop((time) => {
    group.rotation.y += (pointerX - group.rotation.y) * 0.035;
    group.rotation.x += (-pointerY - group.rotation.x) * 0.035;
    group.position.y = Math.sin(time * 0.0007) * 0.08;
    renderer.render(scene, camera);
  });
}

const sceneCanvas = document.querySelector<HTMLCanvasElement>('#gallery-scene');
if (sceneCanvas) mountGalleryScene(sceneCanvas);
