import {GestureController, HandInteraction, EffectGestures, FingerZoom, FingerGun, OKGesture} from './gesture.js?v=8';
import {ShotEffects} from './shots.js?v=7';
import {CurtainEffect} from './curtain.js?v=8';

const $ = id => document.getElementById(id);
const titles = ['山的呼吸', '海的日常', '沙丘漫步', '暮色之間'];
// Local SVG demo artwork keeps the slideshow usable without an image service.
let slides = titles.map((title, i) => ({url: `/static/images/scene-${i + 1}.svg`, title}));
let current = 0;
let mirrored = false;
let vertical = false, appearance = 0, motionAnimation;
function applyEffect(action) {
  if (action === 'vertical') {
    vertical = !vertical;
    $('slide').classList.toggle('vertical', vertical);
    $('status').textContent = vertical ? '已辨識：握拳 → 圖片上下翻轉' : '已辨識：再次握拳 → 取消上下翻轉';
  } else if (action === 'clap') {
    appearance = (appearance + 1) % 3;
    $('slide').classList.toggle('grayscale', appearance === 1);
    $('slide').classList.toggle('transparent', appearance === 2);
    $('status').textContent = `已辨識：拍手 → ${['恢復原圖色彩與不透明度', '灰階', '半透明（40% 不透明度）'][appearance]}`;
  } else {
    motionAnimation?.cancel();
    const squat = action === 'squat';
    const transform = squat ? 'translateY(16px) scaleY(0.78)' : 'translateY(-36px) scaleY(1.03)';
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      motionAnimation = $('slideMotion').animate([
        {transform: 'translateY(0) scaleY(1)'}, {transform, offset: 0.45}, {transform: 'translateY(0) scaleY(1)'},
      ], {duration: 650, easing: 'ease-in-out'});
    }
    $('status').textContent = squat ? '已辨識：倒讚 → 圖片下蹲' : '已辨識：比讚 → 圖片向上跳';
  }
}
function show(index) {
  shots.clear();
  current = Math.max(0, Math.min(slides.length - 1, index));
  $('slide').src = slides[current].url; $('slide').alt = slides[current].title;
  $('slideTitle').textContent = slides[current].title;
  $('counter').textContent = `${String(current + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;
  $('first').disabled = $('previous').disabled = current === 0;
  $('last').disabled = $('next').disabled = current === slides.length - 1;
  $('dots').replaceChildren(...slides.map((slide, i) => {
    const button = document.createElement('button'); button.className = i === current ? 'active' : '';
    button.setAttribute('aria-label', `第 ${i + 1} 張：${slide.title}`);
    button.setAttribute('aria-current', i === current ? 'true' : 'false');
    button.onclick = () => show(i); return button;
  }));
}
const actions = {first: () => show(0), last: () => show(slides.length - 1), previous: () => show(current - 1), next: () => show(current + 1)};
for (const [id, action] of Object.entries(actions)) $(id).onclick = action;
document.addEventListener('keydown', event => {
  if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(event.target.tagName) || event.target.isContentEditable) return;
  const action = {ArrowLeft: 'previous', ArrowRight: 'next', Home: 'first', End: 'last'}[event.key];
  if (action) { event.preventDefault(); actions[action](); }
});
$('imageUpload').onchange = event => {
  const files = [...event.target.files].filter(file => file.type.startsWith('image/'));
  if (!files.length) return;
  slides.forEach(slide => { if (slide.url.startsWith('blob:')) URL.revokeObjectURL(slide.url); });
  slides = files.map(file => ({url: URL.createObjectURL(file), title: file.name.replace(/\.[^.]+$/, '')}));
  $('slideCategory').textContent = 'YOUR COLLECTION'; show(0); event.target.value = '';
};
$('slide').onerror = () => { $('status').textContent = '圖片無法解碼，請切換圖片或載入 JPG、PNG、WebP 圖片。'; };
const shots = new ShotEffects($('slide'), $('shotMarks'));
show(0);

const controller = new GestureController();
const interaction = new HandInteraction();
const effects = new EffectGestures();
const zoom = new FingerZoom();
const gun = new FingerGun();
const ok = new OKGesture();
const curtain = new CurtainEffect($('curtain'));
let primaryHand = null;
let landmarker, drawing, vision, modelLoading, stream, frame, active = false, starting = false, lastTime = -1, lastInference = 0, session = 0;
const video = $('video'), canvas = $('overlay'), context = canvas.getContext('2d');
function withTimeout(promise, milliseconds, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), milliseconds);
  })]).finally(() => clearTimeout(timer));
}
function loadModel() {
  if (!modelLoading) {
    modelLoading = (async () => {
      const api = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs');
      const files = await api.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm');
      const model = await api.HandLandmarker.createFromOptions(files, {
        baseOptions: {modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'},
        runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.6,
      });
      return {api, model};
    })().catch(error => { modelLoading = null; throw error; });
  }
  return modelLoading;
}
function stopCamera(message = '攝影機已停止，可繼續使用按鈕播放圖片。') {
  session++; active = false; starting = false; cancelAnimationFrame(frame);
  if (stream) stream.getTracks().forEach(track => track.stop());
  stream = null; video.srcObject = null; controller.reset(); context.clearRect(0, 0, canvas.width, canvas.height);
  interaction.reset(); primaryHand = null;
  effects.reset();
  gun.reset();
  ok.reset(); curtain.cancel();
  zoom.reset(); $('slideZoom').style.transform = 'scale(1)';
  $('zoomStatus').textContent = '縮放：只伸出同一手的食指與中指，調整兩指間距。';
  $('clapStatus').textContent = '拍手：開啟攝影機後，先讓雙手張開並分開。';
  $('cameraPlaceholder').hidden = false; $('startCamera').disabled = false; $('stopCamera').disabled = true;
  $('cameraBadge').textContent = '尚未啟動'; $('status').textContent = message;
}
async function startCamera() {
  if (active || starting) return;
  starting = true; const token = ++session; $('startCamera').disabled = true; $('stopCamera').disabled = false;
  $('status').textContent = '正在要求攝影機權限，請在瀏覽器提示中選擇允許。';
  $('cameraBadge').textContent = '等待攝影機授權';
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('請透過 HTTPS 或 localhost 開啟，才能使用攝影機。');
    const acquired = await navigator.mediaDevices.getUserMedia({video: {width: {ideal: 640}, height: {ideal: 480}, facingMode: 'user'}, audio: false});
    if (token !== session) { acquired.getTracks().forEach(track => track.stop()); return; }
    stream = acquired; video.srcObject = stream;
    await withTimeout(video.play(), 15000, '攝影機預覽啟動逾時');
    if (token !== session) return;
    stream.getVideoTracks()[0].onended = () => stopCamera('攝影機已中斷，請重新開啟。');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    $('cameraPlaceholder').hidden = true;
    $('cameraBadge').textContent = '攝影機已開啟 · 模型載入中';
    $('status').textContent = '攝影機已開啟，正在下載手部辨識模型（最多等待 45 秒）…';
    if (!landmarker) {
      const loaded = await withTimeout(loadModel(), 45000, '辨識模型載入逾時，請檢查網路是否可存取 jsDelivr 與 Google 模型服務');
      if (token !== session) return;
      vision = loaded.api; landmarker = loaded.model; drawing = new vision.DrawingUtils(context);
    }
    if (token !== session) return;
    active = true; starting = false; lastTime = -1; lastInference = 0;
    $('cameraPlaceholder').hidden = true; $('cameraBadge').textContent = '● 偵測中';
    $('status').textContent = '請將手放進畫面，張開手掌左右移動，或只伸出食指／小指。';
    frame = requestAnimationFrame(detect);
  } catch (error) {
    if (token !== session) return;
    const messages = {NotAllowedError: '攝影機權限未獲允許，請在瀏覽器設定中開放權限。', NotFoundError: '找不到攝影機，請確認裝置已連接。', NotReadableError: '無法讀取攝影機，請確認未被其他程式占用。'};
    stopCamera(messages[error.name] || `啟動失敗：${error.message}。請確認網路可載入 MediaPipe 模型後重試。`);
  }
}
function detect(now) {
  if (!active) return;
  try {
    if (video.readyState >= 2 && video.currentTime !== lastTime && now - lastInference >= 65) {
      lastTime = video.currentTime; lastInference = now;
      const result = landmarker.detectForVideo(video, now);
      context.clearRect(0, 0, canvas.width, canvas.height);
      for (const points of result.landmarks) {
        drawing.drawConnectors(points, vision.HandLandmarker.HAND_CONNECTIONS, {color: '#a9d7a0', lineWidth: 3});
        drawing.drawLandmarks(points, {color: '#fff', radius: 3, lineWidth: 1});
      }
      const state = interaction.update(result.landmarks, now);
      const okState = ok.update(state.hands, now);
      const effect = effects.update(state.hands, now);
      const zoomState = zoom.update(state.hands);
      const gunState = gun.update(state.hands, now);
      $('gunStatus').textContent = gunState.busy.size
        ? '開槍手勢就緒：壓下拇指射擊，抬起拇指可再次射擊。'
        : '開槍：食指伸直、其餘三指收起，拇指張開成 L 形後壓下。';
      $('slideZoom').style.transform = `scale(${zoomState.scale})`;
      $('zoomStatus').textContent = zoomState.active
        ? `兩指縮放：${Math.round(zoomState.scale * 100)}% · 張開放大，靠近縮小；移出畫面恢復大小`
        : '縮放：只伸出同一手的食指與中指，調整兩指間距。';
      $('clapStatus').textContent = effect.progress;
      const primary = state.hands.find(hand => hand.id === primaryHand) || state.hands[0];
      if (primary?.id !== primaryHand) { controller.reset(); primaryHand = primary?.id ?? null; }
      let action = null;
      if (okState.trigger) {
        if (curtain.play()) $('status').textContent = '已辨識：OK → 謝幕，謝謝觀賞！';
        controller.reset();
      } else if (gunState.shot) {
        if (shots.fire()) $('status').textContent = '已辨識：開槍 → 圖片隨機打穿！';
        controller.reset();
      } else if (effect.action) {
        applyEffect(effect.action);
        controller.reset();
      } else if (effect.clapping) {
        controller.reset();
      } else if (state.flip) {
        mirrored = !mirrored;
        $('slide').classList.toggle('mirrored', mirrored);
        $('status').textContent = mirrored ? '已辨識：手心／手背翻轉 → 圖片左右翻轉' : '已辨識：再次翻手 → 圖片恢復原向';
        controller.reset();
      } else {
        action = controller.update(primary && !primary.turning && primary.id !== zoomState.handId && !gunState.busy.has(primary.id) && !okState.busy.has(primary.id) ? primary.points : null, now);
      }
      if (action) {
        actions[action]();
        $('status').textContent = `已辨識：${{previous: '手掌向左 → 上一張', next: '手掌向右 → 下一張', first: '食指 → 第一張', last: '小指 → 最後一張'}[action]}`;
      }
      $('cameraBadge').textContent = state.hands.length ? `● 已找到 ${state.hands.length} 隻手` : '● 等待手部';
    }
    frame = requestAnimationFrame(detect);
  } catch (error) { stopCamera(`偵測中斷：${error.message}，請重新開啟攝影機。`); }
}
$('startCamera').onclick = startCamera;
$('stopCamera').onclick = () => stopCamera();
window.addEventListener('pagehide', () => stopCamera());
window.gestureAppReady = true;
