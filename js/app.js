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
  _initVerticalResizeHandles();
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

function _initVerticalResizeHandles() {
  const resizeYaml = document.getElementById('resize-yaml');
  const yamlSection = document.getElementById('part-yaml-section');
  const resizeLogs = document.getElementById('resize-logs');
  const logsSection = document.getElementById('part-logs-section');

  if (resizeYaml && yamlSection) {
    let isResizingYaml = false;
    let startY = 0;
    let startHeight = 0;

    resizeYaml.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isResizingYaml = true;
      startY = e.clientY;
      startHeight = yamlSection.getBoundingClientRect().height;
      resizeYaml.classList.add('active');
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizingYaml) return;
      const dy = e.clientY - startY;
      const newHeight = Math.max(50, startHeight + dy);
      yamlSection.style.height = newHeight + 'px';
      window.dispatchEvent(new Event('resize'));
    });

    document.addEventListener('mouseup', () => {
      if (isResizingYaml) {
        isResizingYaml = false;
        resizeYaml.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  if (resizeLogs && logsSection) {
    let isResizingLogs = false;
    let startY = 0;
    let startHeight = 0;

    resizeLogs.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isResizingLogs = true;
      startY = e.clientY;
      startHeight = logsSection.getBoundingClientRect().height;
      resizeLogs.classList.add('active');
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizingLogs) return;
      // For logs, it's at the bottom, so dragging up increases height (negative dy)
      const dy = startY - e.clientY;
      const newHeight = Math.max(50, startHeight + dy);
      logsSection.style.height = newHeight + 'px';
      window.dispatchEvent(new Event('resize'));
    });

    document.addEventListener('mouseup', () => {
      if (isResizingLogs) {
        isResizingLogs = false;
        resizeLogs.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }

  // Toggle sections when clicking titles
  const titleYaml = document.getElementById('title-toggle-yaml');
  if (titleYaml && yamlSection) {
    titleYaml.addEventListener('click', () => {
      yamlSection.classList.toggle('collapsed');
      if (resizeYaml) resizeYaml.classList.toggle('collapsed');
      window.dispatchEvent(new Event('resize'));
    });
  }

  const titleGraph = document.getElementById('title-toggle-graph');
  const graphSection = document.getElementById('part-graph-section');
  if (titleGraph && graphSection) {
    titleGraph.addEventListener('click', () => {
      graphSection.classList.toggle('collapsed');
      window.dispatchEvent(new Event('resize'));
    });
  }

  const titleLogs = document.getElementById('title-toggle-logs');
  if (titleLogs && logsSection) {
    titleLogs.addEventListener('click', () => {
      logsSection.classList.toggle('collapsed');
      if (resizeLogs) resizeLogs.classList.toggle('collapsed');
      window.dispatchEvent(new Event('resize'));
    });
  }
}
