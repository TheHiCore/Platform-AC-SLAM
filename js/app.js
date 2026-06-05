// ─── App Initialization Module ──────────────────────────────────────────────
// Entry point. Initializes all modules and handles UI tab switching.

import { connect, disconnect, isConnected, onConnectionChange } from './connection.js';
import { initMapViewer } from './map_viewer.js';
import { initTeleop } from './teleop.js';
import { initPartitioner } from './partitioner.js';
import { initParameters } from './parameters.js';
import { initMetrics } from './metrics.js';

document.addEventListener('DOMContentLoaded', () => {
  console.log('App starting...');

  // Initialize UI components
  _initTabs();
  _initConnectionUI();

  // Initialize modules
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

function _initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      // Add active class to clicked tab and corresponding content
      tab.classList.add('active');
      const targetId = tab.getAttribute('data-target');
      document.getElementById(targetId).classList.add('active');
    });
  });
}
