// ─── Map Viewer Module ──────────────────────────────────────────────────────
// Subscribes to OccupancyGrid topics, renders on canvas, overlays robot pose.
// New layout: one big canvas (swappable), three thumbnail canvases, right-click rotation.

import { subscribe, onConnectionChange } from './connection.js';
import { TOPICS } from '../config/topics.js';

const MAP_NAMES = {
  robot1: { topic: TOPICS.robot1.map, pose: TOPICS.robot1.pose, label: 'Robot 1 Map' },
  robot2: { topic: TOPICS.robot2.map, pose: TOPICS.robot2.pose, label: 'Robot 2 Map' },
  merged: { topic: TOPICS.mergedMap, pose: null, label: 'Merged Global Map' },
};

class MapData {
  constructor(key) {
    this.key = key;
    this.topicName = MAP_NAMES[key].topic;
    this.poseTopicName = MAP_NAMES[key].pose;
    this.label = MAP_NAMES[key].label;
    this.mapMeta = null;
    this.mapImage = null;
    this.pose = null;
    this.mapSub = null;
    this.poseSub = null;
  }

  subscribeTo() {
    this.unsubscribe();
    this.mapSub = subscribe(this.topicName, 'nav_msgs/OccupancyGrid', (msg) => {
      this._processMap(msg);
      mapViewer.onMapUpdate(this.key);
    }, { throttleRate: 500 });

    if (this.poseTopicName) {
      this.poseSub = subscribe(this.poseTopicName, 'geometry_msgs/PoseWithCovarianceStamped', (msg) => {
        this.pose = msg.pose.pose;
        mapViewer.onMapUpdate(this.key);
      }, { throttleRate: 200 });
    }
  }

  unsubscribe() {
    if (this.mapSub) { this.mapSub.unsubscribe(); this.mapSub = null; }
    if (this.poseSub) { this.poseSub.unsubscribe(); this.poseSub = null; }
  }

  _processMap(msg) {
    const info = msg.info;
    const data = msg.data;
    this.mapMeta = info;

    const offCanvas = document.createElement('canvas');
    offCanvas.width = info.width;
    offCanvas.height = info.height;
    const offCtx = offCanvas.getContext('2d');
    const imgData = offCtx.createImageData(info.width, info.height);

    for (let i = 0; i < data.length; i++) {
      const val = data[i];
      const idx = i * 4;
      if (val === -1) {
        imgData.data[idx]     = 40;
        imgData.data[idx + 1] = 44;
        imgData.data[idx + 2] = 52;
        imgData.data[idx + 3] = 255;
      } else if (val === 0) {
        imgData.data[idx]     = 22;
        imgData.data[idx + 1] = 27;
        imgData.data[idx + 2] = 34;
        imgData.data[idx + 3] = 255;
      } else {
        const intensity = Math.min(val / 100, 1);
        imgData.data[idx]     = Math.floor(88 + intensity * 167);
        imgData.data[idx + 1] = Math.floor(166 - intensity * 100);
        imgData.data[idx + 2] = Math.floor(255 - intensity * 180);
        imgData.data[idx + 3] = 255;
      }
    }

    offCtx.putImageData(imgData, 0, 0);
    this.mapImage = offCanvas;
  }
}

// ── Main MapViewer controller ──
const mapViewer = {
  activeKey: 'merged',
  dataSources: {},
  bigCanvas: null,
  bigCtx: null,
  thumbCanvases: {},
  thumbCtxs: {},

  // Interaction state (per-map transforms stored here)
  transforms: {
    robot1: { x: 0, y: 0, scale: 1, rotation: 0 },
    robot2: { x: 0, y: 0, scale: 1, rotation: 0 },
    merged: { x: 0, y: 0, scale: 1, rotation: 0 },
  },
  isDragging: false,
  isRotating: false,
  dragStart: { x: 0, y: 0 },
  transformStart: null,
  rotationStart: 0,
  rotMouseStart: 0,
  firstMapReceived: { robot1: false, robot2: false, merged: false },

  rotationBadge: null,
  rotationBadgeTimeout: null,
  unsubConnection: null,

  init() {
    this.bigCanvas = document.getElementById('map-big-canvas');
    this.bigCtx = this.bigCanvas.getContext('2d');
    this.rotationBadge = document.getElementById('map-rotation-badge');

    this.thumbCanvases = {
      robot1: document.getElementById('map-thumb-robot1'),
      robot2: document.getElementById('map-thumb-robot2'),
      merged: document.getElementById('map-thumb-merged'),
    };
    this.thumbCtxs = {};
    for (const key of Object.keys(this.thumbCanvases)) {
      if (this.thumbCanvases[key]) {
        this.thumbCtxs[key] = this.thumbCanvases[key].getContext('2d');
      }
    }

    // Init data sources
    for (const key of Object.keys(MAP_NAMES)) {
      this.dataSources[key] = new MapData(key);
    }

    this._initBigCanvasInteraction();
    this._initThumbClicks();
    this._resize();
    window.addEventListener('resize', () => this._resize());

    this.unsubConnection = onConnectionChange((connected) => {
      if (connected) {
        Object.values(this.dataSources).forEach(d => d.subscribeTo());
      } else {
        Object.values(this.dataSources).forEach(d => d.unsubscribe());
      }
    });
  },

  _initThumbClicks() {
    document.querySelectorAll('.map-thumb').forEach(el => {
      el.addEventListener('click', () => {
        const key = el.dataset.map;
        if (key && key !== this.activeKey) {
          this.switchActive(key);
        }
      });
    });
  },

  switchActive(key) {
    this.activeKey = key;

    // Update thumb active states
    document.querySelectorAll('.map-thumb').forEach(el => {
      el.classList.toggle('active', el.dataset.map === key);
    });

    // Update header
    const header = document.getElementById('map-big-header');
    if (header) header.textContent = MAP_NAMES[key].label;

    this._resize();
  },

  _initBigCanvasInteraction() {
    const cv = this.bigCanvas;

    cv.addEventListener('contextmenu', (e) => { e.preventDefault(); });

    cv.addEventListener('mousedown', (e) => {
      const r = cv.getBoundingClientRect();
      if (e.button === 2) {
        // Right-click: rotation
        this.isRotating = true;
        this.rotMouseStart = e.clientX - r.left;
        this.rotationStart = this.transforms[this.activeKey].rotation;
        cv.style.cursor = 'crosshair';
      } else if (e.button === 0) {
        // Left-click: pan
        this.isDragging = true;
        this.dragStart = { x: e.clientX - r.left, y: e.clientY - r.top };
        this.transformStart = { ...this.transforms[this.activeKey] };
        cv.style.cursor = 'grabbing';
      }
    });

    cv.addEventListener('mousemove', (e) => {
      const r = cv.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;

      if (this.isRotating) {
        const dx = mx - this.rotMouseStart;
        const deltaDeg = dx * 0.3;
        const newRot = this.rotationStart + deltaDeg;
        this.transforms[this.activeKey].rotation = newRot;
        this._showRotationBadge(newRot);
        this._drawBig();
      } else if (this.isDragging) {
        this.transforms[this.activeKey].x = this.transformStart.x + (mx - this.dragStart.x);
        this.transforms[this.activeKey].y = this.transformStart.y + (my - this.dragStart.y);
        this._drawBig();
      }
    });

    cv.addEventListener('mouseup', (e) => {
      if (e.button === 2) {
        this.isRotating = false;
        cv.style.cursor = 'grab';
        this._hideRotationBadgeDelayed();
      } else {
        this.isDragging = false;
        cv.style.cursor = 'grab';
      }
    });

    cv.addEventListener('mouseleave', () => {
      this.isDragging = false;
      this.isRotating = false;
      cv.style.cursor = 'grab';
      this._hideRotationBadgeDelayed();
    });

    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const factor = e.deltaY > 0 ? 0.85 : 1.18;
      const tfm = this.transforms[this.activeKey];

      // Account for rotation: un-rotate the mouse position to get world coords
      const rad = tfm.rotation * Math.PI / 180;
      const cosR = Math.cos(-rad), sinR = Math.sin(-rad);
      const relX = mx - tfm.x, relY = my - tfm.y;
      const wx = (relX * cosR - relY * sinR) / tfm.scale;
      const wy = (relX * sinR + relY * cosR) / tfm.scale;

      tfm.scale = Math.max(0.1, Math.min(50, tfm.scale * factor));

      // Recalculate position to keep world point under mouse
      const newRelX = wx * tfm.scale, newRelY = wy * tfm.scale;
      const rotNewX = newRelX * Math.cos(rad) - newRelY * Math.sin(rad);
      const rotNewY = newRelX * Math.sin(rad) + newRelY * Math.cos(rad);
      tfm.x = mx - rotNewX;
      tfm.y = my - rotNewY;

      this._drawBig();
    }, { passive: false });

    cv.style.cursor = 'grab';
  },

  _showRotationBadge(deg) {
    if (this.rotationBadge) {
      this.rotationBadge.textContent = `${deg.toFixed(1)} deg`;
      this.rotationBadge.classList.add('visible');
    }
    if (this.rotationBadgeTimeout) clearTimeout(this.rotationBadgeTimeout);
  },

  _hideRotationBadgeDelayed() {
    this.rotationBadgeTimeout = setTimeout(() => {
      if (this.rotationBadge) this.rotationBadge.classList.remove('visible');
    }, 1500);
  },

  _resize() {
    // Resize big canvas
    const dpr = window.devicePixelRatio || 1;
    const r = this.bigCanvas.parentElement.getBoundingClientRect();
    this.bigCanvas.width = r.width * dpr;
    this.bigCanvas.height = r.height * dpr;
    this.bigCanvas.style.width = r.width + 'px';
    this.bigCanvas.style.height = r.height + 'px';
    this.bigCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Resize thumbnails
    for (const key of Object.keys(this.thumbCanvases)) {
      const tc = this.thumbCanvases[key];
      if (!tc) continue;
      const tr = tc.parentElement.getBoundingClientRect();
      tc.width = tr.width * dpr;
      tc.height = tr.height * dpr;
      tc.style.width = tr.width + 'px';
      tc.style.height = tr.height + 'px';
      this.thumbCtxs[key].setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    this._drawBig();
    this._drawThumbnails();
  },

  onMapUpdate(key) {
    if (!this.firstMapReceived[key]) {
      this.firstMapReceived[key] = true;
      this._fitMap(key);
    }
    if (key === this.activeKey) {
      this._drawBig();
    }
    this._drawThumbnail(key);
  },

  _fitMap(key) {
    const src = this.dataSources[key];
    if (!src || !src.mapMeta) return;
    const info = src.mapMeta;
    const tfm = this.transforms[key];

    const r = this.bigCanvas.getBoundingClientRect();
    const padding = 20;
    const scaleX = (r.width - padding * 2) / (info.width * info.resolution);
    const scaleY = (r.height - padding * 2) / (info.height * info.resolution);
    tfm.scale = Math.min(scaleX, scaleY);
    tfm.x = r.width / 2 - (info.width * info.resolution * tfm.scale) / 2;
    tfm.y = r.height / 2 - (info.height * info.resolution * tfm.scale) / 2;
    tfm.rotation = 0;
  },

  _drawBig() {
    const cv = this.bigCanvas;
    const ctx = this.bigCtx;
    const r = cv.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);

    // Background
    ctx.fillStyle = '#121212';
    ctx.fillRect(0, 0, r.width, r.height);

    // Grid
    const tfm = this.transforms[this.activeKey];
    ctx.strokeStyle = 'rgba(68,68,68,0.3)';
    ctx.lineWidth = 0.5;
    const gridSize = 40;
    for (let x = tfm.x % gridSize; x < r.width; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, r.height); ctx.stroke();
    }
    for (let y = tfm.y % gridSize; y < r.height; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(r.width, y); ctx.stroke();
    }

    const src = this.dataSources[this.activeKey];
    if (!src || !src.mapImage || !src.mapMeta) {
      ctx.fillStyle = 'rgba(136,136,136,0.3)';
      ctx.font = '13px "Roboto Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for map data...', r.width / 2, r.height / 2);
      return;
    }

    const info = src.mapMeta;
    const scale = tfm.scale;
    const mapW = info.width * info.resolution * scale;
    const mapH = info.height * info.resolution * scale;

    ctx.save();
    ctx.translate(tfm.x, tfm.y);

    // Apply rotation around center of map
    if (tfm.rotation !== 0) {
      const cx = mapW / 2, cy = mapH / 2;
      ctx.translate(cx, cy);
      ctx.rotate(tfm.rotation * Math.PI / 180);
      ctx.translate(-cx, -cy);
    }

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src.mapImage, 0, 0, mapW, mapH);

    // Draw robot pose arrow
    if (src.pose) {
      const px = (src.pose.position.x - info.origin.position.x) * scale;
      const py = mapH - (src.pose.position.y - info.origin.position.y) * scale;

      const q = src.pose.orientation;
      const yaw = Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));

      const arrowLen = Math.max(12, scale * 0.8);

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-yaw);

      ctx.shadowColor = '#2196f3';
      ctx.shadowBlur = 12;

      ctx.beginPath();
      ctx.moveTo(arrowLen, 0);
      ctx.lineTo(-arrowLen * 0.5, -arrowLen * 0.5);
      ctx.lineTo(-arrowLen * 0.2, 0);
      ctx.lineTo(-arrowLen * 0.5, arrowLen * 0.5);
      ctx.closePath();
      ctx.fillStyle = '#2196f3';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.restore();
    }

    ctx.restore();
  },

  _drawThumbnails() {
    for (const key of Object.keys(this.thumbCanvases)) {
      this._drawThumbnail(key);
    }
  },

  _drawThumbnail(key) {
    const tc = this.thumbCanvases[key];
    const ctx = this.thumbCtxs[key];
    if (!tc || !ctx) return;

    const r = tc.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    ctx.fillStyle = '#121212';
    ctx.fillRect(0, 0, r.width, r.height);

    const src = this.dataSources[key];
    if (!src || !src.mapImage || !src.mapMeta) {
      ctx.fillStyle = 'rgba(136,136,136,0.2)';
      ctx.font = '10px "Roboto Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No data', r.width / 2, r.height / 2);
      return;
    }

    const info = src.mapMeta;
    const padding = 4;
    const scaleX = (r.width - padding * 2) / (info.width * info.resolution);
    const scaleY = (r.height - padding * 2) / (info.height * info.resolution);
    const scale = Math.min(scaleX, scaleY);

    const mapW = info.width * info.resolution * scale;
    const mapH = info.height * info.resolution * scale;
    const ox = (r.width - mapW) / 2;
    const oy = (r.height - mapH) / 2;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src.mapImage, ox, oy, mapW, mapH);

    // Mini pose arrow
    if (src.pose) {
      const px = ox + (src.pose.position.x - info.origin.position.x) * scale;
      const py = oy + mapH - (src.pose.position.y - info.origin.position.y) * scale;

      const q = src.pose.orientation;
      const yaw = Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));
      const arrowLen = 6;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-yaw);
      ctx.beginPath();
      ctx.moveTo(arrowLen, 0);
      ctx.lineTo(-arrowLen * 0.5, -arrowLen * 0.5);
      ctx.lineTo(-arrowLen * 0.5, arrowLen * 0.5);
      ctx.closePath();
      ctx.fillStyle = '#2196f3';
      ctx.fill();
      ctx.restore();
    }
  },
};

export function initMapViewer() {
  mapViewer.init();
}

export function switchActiveMap(key) {
  mapViewer.switchActive(key);
}

export function destroyMapViewer() {
  Object.values(mapViewer.dataSources).forEach(d => d.unsubscribe());
  if (mapViewer.unsubConnection) mapViewer.unsubConnection();
}
