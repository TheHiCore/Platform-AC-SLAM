// ─── App Initialization Module ──────────────────────────────────────────────

import { connect, disconnect, isConnected, onConnectionChange } from './connection.js';
import { initMapViewer } from './map_viewer.js';
import { initTeleop } from './teleop.js';
import { initPartitioner } from './partitioner.js';

document.addEventListener('DOMContentLoaded', () => {
  console.log('App starting...');
  _initConnectionUI();
  _initModeSelector();
  _initRobotTabs();
  _initResizeHandle();
  _initMissionTime();
  initMapViewer();
  initTeleop();
  initPartitioner();
});

function _initConnectionUI() {
  const btn = document.getElementById('btn-connect');
  const input = document.getElementById('input-ros-url');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');

  btn.addEventListener('click', () => {
    if (isConnected()) {
      disconnect();
    } else {
      const url = input.value.trim();
      const match = url.match(/ws:\/\/(.+):(\d+)/);
      if (match) {
        connect(match[1], parseInt(match[2]));
      } else {
        alert('Invalid WebSocket URL format. Use ws://host:port');
      }
    }
  });

  onConnectionChange((connected) => {
    if (connected) {
      btn.textContent = 'Disconnect';
      btn.className = 'btn btn-danger';
      statusDot.className = 'status-dot connected';
      statusText.textContent = 'Connected';
    } else {
      btn.textContent = 'Connect';
      btn.className = 'btn btn-primary';
      statusDot.className = 'status-dot disconnected';
      statusText.textContent = 'Disconnected';
    }
  });
}

function _initModeSelector() {
  const modeTabs = document.querySelectorAll('.mode-tab');
  const modePanels = document.querySelectorAll('.mode-panel');

  modeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      modeTabs.forEach(t => t.classList.remove('active'));
      modePanels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const mode = tab.dataset.mode;
      const panel = document.getElementById(`mode-${mode}`);
      if (panel) panel.classList.add('active');
      if (mode === 'partitioner') window.dispatchEvent(new Event('resize'));
    });
  });
}

function _initRobotTabs() {
  const tabs = document.querySelectorAll('.robot-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const robot = tab.dataset.robot;
      if (!robot) return;

      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update robot images
      document.querySelectorAll('.robot-img-wrap').forEach(wrap => {
        wrap.classList.toggle('hidden', wrap.id !== `robot-img-${robot}`);
      });

      // Notify teleop module via custom event
      document.dispatchEvent(new CustomEvent('robot-tab-change', { detail: { robot } }));
    });
  });
}

function _initResizeHandle() {
  const handle = document.getElementById('resize-handle');
  const leftPanel = document.getElementById('left-panel');
  if (!handle || !leftPanel) return;

  let isResizing = false;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isResizing = true;
    handle.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const newWidth = Math.max(280, Math.min(700, e.clientX));
    leftPanel.style.width = newWidth + 'px';
    window.dispatchEvent(new Event('resize'));
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      handle.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}

let missionStartTime = null;
let missionInterval = null;

function _initMissionTime() {
  missionStartTime = Date.now();
  missionInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - missionStartTime) / 1000);
    const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
    const el = document.getElementById('mission-time');
    if (el) el.textContent = `${m}:${s}`;
  }, 1000);
}
