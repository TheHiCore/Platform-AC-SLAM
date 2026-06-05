// ─── App Initialization Module ──────────────────────────────────────────────
// Entry point. Initializes all modules and handles UI switching.

import { connect, disconnect, isConnected, onConnectionChange } from './connection.js';
import { initMapViewer } from './map_viewer.js';
import { initTeleop } from './teleop.js';
import { initPartitioner } from './partitioner.js';
import { initParameters } from './parameters.js';
import { initMetrics } from './metrics.js';

document.addEventListener('DOMContentLoaded', () => {
  console.log('App starting...');

  _initConnectionUI();
  _initModeSelector();
  _initBottomTabs();

  initMapViewer();
  initTeleop();
  initPartitioner();
  initParameters();
  initMetrics();
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
  const modeBtns = document.querySelectorAll('.mode-btn');
  const modePanels = document.querySelectorAll('.mode-panel');

  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modeBtns.forEach(b => b.classList.remove('active'));
      modePanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const mode = btn.dataset.mode;
      const panel = document.getElementById(`mode-${mode}`);
      if (panel) panel.classList.add('active');

      // Trigger resize for partitioner canvas when switching to it
      if (mode === 'partitioner') {
        window.dispatchEvent(new Event('resize'));
      }
    });
  });
}

function _initBottomTabs() {
  const tabs = document.querySelectorAll('.left-bottom .tab-btn');
  const contents = document.querySelectorAll('.left-bottom .tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.getAttribute('data-target');
      document.getElementById(targetId).classList.add('active');
    });
  });
}
