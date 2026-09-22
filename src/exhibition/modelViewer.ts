import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

interface ModelViewerElements {
  canvas: HTMLCanvasElement;
  shell: HTMLElement;
  input: HTMLInputElement;
  status: HTMLElement;
  resetButton: HTMLButtonElement;
  autoRotateButton: HTMLButtonElement;
  animationButton: HTMLButtonElement;
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) value.dispose();
      });
      material.dispose();
    });
  });
}

function normalizeAssetPath(path: string) {
  return decodeURIComponent(path)
    .split(/[?#]/, 1)[0]
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .toLowerCase();
}

export function mountModelViewer({
  canvas,
  shell,
  input,
  status,
  resetButton,
  autoRotateButton,
  animationButton
}: ModelViewerElements) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x11100f);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
  camera.position.set(4.5, 3, 6.5);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.screenSpacePanning = true;
  controls.minDistance = 0.1;
  controls.maxDistance = 100;
  controls.target.set(0, 0, 0);
  controls.update();
  controls.saveState();

  scene.add(new THREE.HemisphereLight(0xfff4dd, 0x29313d, 2.2));
  const keyLight = new THREE.DirectionalLight(0xffe5bd, 4.5);
  keyLight.position.set(5, 8, 6);
  keyLight.castShadow = true;
  scene.add(keyLight);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(6, 96),
    new THREE.MeshStandardMaterial({ color: 0x25231f, roughness: 0.92, metalness: 0.02 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.55;
  floor.receiveShadow = true;
  scene.add(floor);

  const placeholder = new THREE.Group();
  [0xe8563f, 0x7a9e7e, 0xf1ba55].forEach((color, index) => {
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 1.75, 0.12),
      new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.08 })
    );
    frame.position.set((index - 1) * 1.8, 0, index === 1 ? -0.45 : 0);
    frame.rotation.y = (index - 1) * -0.16;
    frame.castShadow = true;
    placeholder.add(frame);
  });
  scene.add(placeholder);

  const clock = new THREE.Clock();
  let activeModel: THREE.Object3D | null = null;
  let activeMixer: THREE.AnimationMixer | null = null;
  let activeUrls: string[] = [];
  let animationsPlaying = false;
  let loadGeneration = 0;

  const setToggleState = (button: HTMLButtonElement, active: boolean) => {
    button.dataset.active = String(active);
    button.setAttribute('aria-pressed', String(active));
  };

  const clearActiveUrls = () => {
    activeUrls.forEach((url) => URL.revokeObjectURL(url));
    activeUrls = [];
  };

  const clearModel = () => {
    if (activeMixer && activeModel) {
      activeMixer.stopAllAction();
      activeMixer.uncacheRoot(activeModel);
    }
    activeMixer = null;
    if (activeModel) {
      scene.remove(activeModel);
      disposeObject(activeModel);
      activeModel = null;
    }
    clearActiveUrls();
  };

  const frameModel = (object: THREE.Object3D) => {
    const bounds = new THREE.Box3().setFromObject(object);
    if (bounds.isEmpty()) throw new Error('模型沒有可顯示的幾何內容');

    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z, 0.01);
    const fitHeightDistance = maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)));
    const fitWidthDistance = fitHeightDistance / Math.max(camera.aspect, 0.5);
    const distance = Math.max(fitHeightDistance, fitWidthDistance) * 1.35;
    const direction = new THREE.Vector3(1, 0.65, 1.25).normalize();

    camera.near = Math.max(distance / 1000, 0.001);
    camera.far = Math.max(distance * 100, 100);
    camera.position.copy(center).addScaledVector(direction, distance);
    camera.updateProjectionMatrix();

    controls.target.copy(center);
    controls.minDistance = maxSize * 0.05;
    controls.maxDistance = maxSize * 25;
    controls.update();
    controls.saveState();

    floor.position.y = bounds.min.y - maxSize * 0.015;
    const floorScale = Math.max(maxSize / 3, 0.1);
    floor.scale.setScalar(floorScale);
  };

  const loadFiles = (files: File[]) => {
    const modelFile = files.find((file) => /\.(glb|gltf)$/i.test(file.name));
    if (!modelFile) {
      status.textContent = '請選擇 .glb 或 .gltf 檔案。';
      return;
    }

    const requestId = ++loadGeneration;
    clearModel();
    placeholder.visible = true;
    animationButton.disabled = true;
    animationButton.textContent = '播放動畫';
    setToggleState(animationButton, false);
    status.textContent = `正在讀取 ${modelFile.name}…`;

    const manager = new THREE.LoadingManager();
    const assetUrls = new Map<string, string>();
    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      activeUrls.push(url);
      const relativePath = normalizeAssetPath(file.webkitRelativePath || file.name);
      assetUrls.set(relativePath, url);
      assetUrls.set(normalizeAssetPath(file.name), url);
    });

    manager.setURLModifier((requestedUrl) => {
      if (requestedUrl.startsWith('blob:') || requestedUrl.startsWith('data:')) return requestedUrl;
      const normalized = normalizeAssetPath(requestedUrl);
      const basename = normalized.split('/').pop() ?? normalized;
      return assetUrls.get(normalized) ?? assetUrls.get(basename) ?? requestedUrl;
    });

    const loader = new GLTFLoader(manager);
    const handleLoadedModel = (gltf: GLTF) => {
      if (requestId !== loadGeneration) {
        disposeObject(gltf.scene);
        return;
      }
      activeModel = gltf.scene;
      activeModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      scene.add(activeModel);
      placeholder.visible = false;

      try {
        frameModel(activeModel);
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : '無法定位模型視角。';
        clearModel();
        placeholder.visible = true;
        return;
      }

      if (gltf.animations.length > 0) {
        activeMixer = new THREE.AnimationMixer(activeModel);
        gltf.animations.forEach((clip) => activeMixer?.clipAction(clip).play());
        animationsPlaying = true;
        animationButton.disabled = false;
        animationButton.textContent = '暫停動畫';
        setToggleState(animationButton, true);
      } else {
        animationsPlaying = false;
      }

      const animationNote = gltf.animations.length > 0
        ? `，正在播放 ${gltf.animations.length} 段內建動畫`
        : '，沒有內建動畫';
      status.textContent = `已載入 ${modelFile.name}${animationNote}。檔案只存在這個瀏覽器分頁。`;
    };

    const handleLoadError = (error: unknown) => {
      if (requestId !== loadGeneration) return;
      console.error(error);
      status.textContent = modelFile.name.toLowerCase().endsWith('.gltf')
        ? '模型載入失敗；請同時選取 .gltf 引用的 .bin 與貼圖，或改用單一 .glb 檔。'
        : '模型載入失敗，請確認檔案是有效的 GLB。';
      clearActiveUrls();
    };

    modelFile.arrayBuffer().then((buffer) => {
      const modelData = modelFile.name.toLowerCase().endsWith('.gltf')
        ? new TextDecoder().decode(buffer)
        : buffer;
      loader.parse(
        modelData,
        '',
        handleLoadedModel,
        handleLoadError
      );
    }).catch(handleLoadError);
  };

  input.addEventListener('change', () => {
    loadFiles(Array.from(input.files ?? []));
    input.value = '';
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    shell.addEventListener(eventName, (event) => {
      event.preventDefault();
      shell.classList.add('is-dragging');
    });
  });
  ['dragleave', 'drop'].forEach((eventName) => {
    shell.addEventListener(eventName, (event) => {
      event.preventDefault();
      shell.classList.remove('is-dragging');
    });
  });
  shell.addEventListener('drop', (event) => {
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) loadFiles(files);
  });

  resetButton.addEventListener('click', () => controls.reset());
  autoRotateButton.addEventListener('click', () => {
    controls.autoRotate = !controls.autoRotate;
    setToggleState(autoRotateButton, controls.autoRotate);
  });
  animationButton.addEventListener('click', () => {
    if (!activeMixer) return;
    animationsPlaying = !animationsPlaying;
    activeMixer.timeScale = animationsPlaying ? 1 : 0;
    setToggleState(animationButton, animationsPlaying);
    animationButton.textContent = animationsPlaying ? '暫停動畫' : '播放動畫';
  });

  const resize = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  renderer.setAnimationLoop(() => {
    const delta = Math.min(clock.getDelta(), 0.1);
    activeMixer?.update(delta);
    controls.update();
    if (!activeModel) placeholder.rotation.y += delta * 0.18;
    renderer.render(scene, camera);
  });

  window.addEventListener('beforeunload', clearActiveUrls, { once: true });
}
