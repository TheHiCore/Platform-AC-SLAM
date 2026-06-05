// ─── Map Viewer Module ──────────────────────────────────────────────────────
// Subscribes to OccupancyGrid topics, renders on canvas, overlays robot pose.

import { getRos, subscribe, onConnectionChange } from './connection.js';
import { TOPICS } from '../config/topics.js';

class MapCanvas {
  constructor(canvasId, topicName, poseTopicName) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.topicName = topicName;
    this.poseTopicName = poseTopicName;
    this.mapData = null;
    this.mapMeta = null;
    this.imageData = null;
    this.pose = null;
    this.mapSub = null;
    this.poseSub = null;
    this.transform = { x: 0, y: 0, scale: 1 };
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.transformStart = { x: 0, y: 0 };

    this._initInteraction();
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _initInteraction() {
    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      const r = this.canvas.getBoundingClientRect();
      this.dragStart = { x: e.clientX - r.left, y: e.clientY - r.top };
      this.transformStart = { ...this.transform };
    });
    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const r = this.canvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      this.transform.x = this.transformStart.x + (mx - this.dragStart.x);
      this.transform.y = this.transformStart.y + (my - this.dragStart.y);
      this._draw();
    });
    this.canvas.addEventListener('mouseup', () => { this.isDragging = false; });
    this.canvas.addEventListener('mouseleave', () => { this.isDragging = false; });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = this.canvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const factor = e.deltaY > 0 ? 0.85 : 1.18;
      const wx = (mx - this.transform.x) / this.transform.scale;
      const wy = (my - this.transform.y) / this.transform.scale;
      this.transform.scale = Math.max(0.1, Math.min(50, this.transform.scale * factor));
      this.transform.x = mx - wx * this.transform.scale;
      this.transform.y = my - wy * this.transform.scale;
      this._draw();
    }, { passive: false });
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = r.width * dpr;
    this.canvas.height = r.height * dpr;
    this.canvas.style.width = r.width + 'px';
    this.canvas.style.height = r.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._draw();
  }

  subscribeTo() {
    if (this.mapSub) { this.mapSub.unsubscribe(); this.mapSub = null; }
    if (this.poseSub) { this.poseSub.unsubscribe(); this.poseSub = null; }

    this.mapSub = subscribe(this.topicName, 'nav_msgs/OccupancyGrid', (msg) => {
      this._processMap(msg);
    }, { throttleRate: 500 });

    if (this.poseTopicName) {
      this.poseSub = subscribe(this.poseTopicName, 'geometry_msgs/PoseWithCovarianceStamped', (msg) => {
        this.pose = msg.pose.pose;
        this._draw();
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

    // Create offscreen canvas for the map image
    const offCanvas = document.createElement('canvas');
    offCanvas.width = info.width;
    offCanvas.height = info.height;
    const offCtx = offCanvas.getContext('2d');
    const imgData = offCtx.createImageData(info.width, info.height);

    for (let i = 0; i < data.length; i++) {
      const val = data[i];
      const idx = i * 4;
      if (val === -1) {
        // Unknown — dark grey
        imgData.data[idx]     = 40;
        imgData.data[idx + 1] = 44;
        imgData.data[idx + 2] = 52;
        imgData.data[idx + 3] = 255;
      } else if (val === 0) {
        // Free — dark surface
        imgData.data[idx]     = 22;
        imgData.data[idx + 1] = 27;
        imgData.data[idx + 2] = 34;
        imgData.data[idx + 3] = 255;
      } else {
        // Occupied — bright accent
        const intensity = Math.min(val / 100, 1);
        imgData.data[idx]     = Math.floor(88 + intensity * 167);
        imgData.data[idx + 1] = Math.floor(166 - intensity * 100);
        imgData.data[idx + 2] = Math.floor(255 - intensity * 180);
        imgData.data[idx + 3] = 255;
      }
    }

    offCtx.putImageData(imgData, 0, 0);
    this.mapImage = offCanvas;

    // Auto-fit on first map
    if (!this.mapData) {
      this._fitMap(info);
    }
    this.mapData = data;
    this._draw();
  }

  _fitMap(info) {
    const r = this.canvas.getBoundingClientRect();
    const padding = 20;
    const scaleX = (r.width - padding * 2) / (info.width * info.resolution);
    const scaleY = (r.height - padding * 2) / (info.height * info.resolution);
    this.transform.scale = Math.min(scaleX, scaleY);
    this.transform.x = r.width / 2 - (info.width * info.resolution * this.transform.scale) / 2;
    this.transform.y = r.height / 2 - (info.height * info.resolution * this.transform.scale) / 2;
  }

  _draw() {
    const r = this.canvas.getBoundingClientRect();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, r.width, r.height);

    // Background
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, r.width, r.height);

    // Grid pattern
    ctx.strokeStyle = 'rgba(48,54,61,0.3)';
    ctx.lineWidth = 0.5;
    const gridSize = 40;
    for (let x = this.transform.x % gridSize; x < r.width; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, r.height); ctx.stroke();
    }
    for (let y = this.transform.y % gridSize; y < r.height; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(r.width, y); ctx.stroke();
    }

    if (!this.mapImage || !this.mapMeta) {
      ctx.fillStyle = 'rgba(139,148,158,0.3)';
      ctx.font = '12px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for map data…', r.width / 2, r.height / 2);
      return;
    }

    const info = this.mapMeta;
    const scale = this.transform.scale;

    ctx.save();
    ctx.translate(this.transform.x, this.transform.y);

    // Draw map image scaled
    const mapW = info.width * info.resolution * scale;
    const mapH = info.height * info.resolution * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.mapImage, 0, 0, mapW, mapH);

    // Draw robot pose arrow
    if (this.pose) {
      const px = (this.pose.position.x - info.origin.position.x) / info.resolution * info.resolution * scale;
      const py = mapH - (this.pose.position.y - info.origin.position.y) / info.resolution * info.resolution * scale;

      // Quaternion to yaw
      const q = this.pose.orientation;
      const yaw = Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * q.z));

      const arrowLen = Math.max(12, scale * 0.8);

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-yaw);

      // Glow
      ctx.shadowColor = '#58a6ff';
      ctx.shadowBlur = 12;

      // Arrow body
      ctx.beginPath();
      ctx.moveTo(arrowLen, 0);
      ctx.lineTo(-arrowLen * 0.5, -arrowLen * 0.5);
      ctx.lineTo(-arrowLen * 0.2, 0);
      ctx.lineTo(-arrowLen * 0.5, arrowLen * 0.5);
      ctx.closePath();
      ctx.fillStyle = '#58a6ff';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.restore();
    }

    ctx.restore();
  }
}

// Module state
let maps = {};
let unsubConnection = null;

export function initMapViewer() {
  maps = {
    robot1: new MapCanvas('map-robot1', TOPICS.robot1.map, TOPICS.robot1.pose),
    robot2: new MapCanvas('map-robot2', TOPICS.robot2.map, TOPICS.robot2.pose),
    merged: new MapCanvas('map-merged', TOPICS.mergedMap, null),
  };

  unsubConnection = onConnectionChange((connected) => {
    if (connected) {
      Object.values(maps).forEach(m => m.subscribeTo());
    } else {
      Object.values(maps).forEach(m => m.unsubscribe());
    }
  });
}

export function destroyMapViewer() {
  Object.values(maps).forEach(m => m.unsubscribe());
  if (unsubConnection) unsubConnection();
}
