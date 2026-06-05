// ─── Metrics Module ─────────────────────────────────────────────────────────
// Subscribes to maps to calculate exploration percentage, tracks time.

import { subscribe, onConnectionChange } from './connection.js';
import { TOPICS } from '../config/topics.js';

let startTime = null;
let timerInterval = null;

let subs = {};
let mapStats = {
  robot1: { total: 0, explored: 0 },
  robot2: { total: 0, explored: 0 },
  merged: { total: 0, explored: 0 }
};

export function initMetrics() {
  _startTimer();

  onConnectionChange((connected) => {
    if (connected) {
      _subscribeTopics();
    } else {
      _unsubscribeTopics();
    }
    _updateStatusIndicators(connected);
  });
}

function _startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  startTime = Date.now();
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
    const el = document.getElementById('metric-time');
    if (el) el.textContent = `${m}:${s}`;
  }, 1000);
}

function _subscribeTopics() {
  subs.r1map = subscribe(TOPICS.robot1.map, 'nav_msgs/OccupancyGrid', (msg) => _processMap('robot1', msg), { throttleRate: 2000 });
  subs.r2map = subscribe(TOPICS.robot2.map, 'nav_msgs/OccupancyGrid', (msg) => _processMap('robot2', msg), { throttleRate: 2000 });
  subs.mmap = subscribe(TOPICS.mergedMap, 'nav_msgs/OccupancyGrid', (msg) => _processMap('merged', msg), { throttleRate: 2000 });
  
  // Topic health monitoring (just check if receiving)
  subs.r1pose = subscribe(TOPICS.robot1.pose, 'geometry_msgs/PoseWithCovarianceStamped', () => _pingTopic('r1pose'));
  subs.r2pose = subscribe(TOPICS.robot2.pose, 'geometry_msgs/PoseWithCovarianceStamped', () => _pingTopic('r2pose'));
}

function _unsubscribeTopics() {
  Object.values(subs).forEach(sub => {
    if (sub) sub.unsubscribe();
  });
  subs = {};
}

function _processMap(id, msg) {
  const data = msg.data;
  let explored = 0;
  let total = data.length;

  for (let i = 0; i < data.length; i++) {
    if (data[i] !== -1) explored++;
  }

  mapStats[id] = { total, explored };
  const pct = total > 0 ? ((explored / total) * 100).toFixed(1) : '0.0';

  const el = document.getElementById(`metric-map-${id}`);
  if (el) {
    el.textContent = `${pct}%`;
  }
}

const topicPings = {};
function _pingTopic(id) {
  topicPings[id] = Date.now();
  const el = document.getElementById(`health-${id}`);
  if (el) {
    el.className = 'health-dot active';
    // reset after 2s if no new msg
    setTimeout(() => {
      if (Date.now() - topicPings[id] >= 1900) {
        const checkEl = document.getElementById(`health-${id}`);
        if (checkEl) checkEl.className = 'health-dot inactive';
      }
    }, 2000);
  }
}

function _updateStatusIndicators(connected) {
  const els = document.querySelectorAll('.health-dot');
  els.forEach(el => {
    el.className = `health-dot ${connected ? 'inactive' : 'offline'}`;
  });
}

export function destroyMetrics() {
  if (timerInterval) clearInterval(timerInterval);
  _unsubscribeTopics();
}
