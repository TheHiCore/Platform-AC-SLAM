// ─── Teleop Module ──────────────────────────────────────────────────────────
import { publish, isConnected } from './connection.js';
import { TOPICS } from '../config/topics.js';

let selectedRobot = 'robot1';
let speed = 0.2;
let angularSpeed = 0.5;
let activeKeys = new Set();
let publishInterval = null;

export function initTeleop() {
  const slider = document.getElementById('teleop-speed');
  const speedLabel = document.getElementById('teleop-speed-val');
  if (slider) {
    slider.addEventListener('input', () => {
      speed = parseFloat(slider.value);
      speedLabel.textContent = speed.toFixed(2);
    });
  }

  const angSlider = document.getElementById('teleop-angular-speed');
  const angLabel = document.getElementById('teleop-angular-speed-val');
  if (angSlider) {
    angSlider.addEventListener('input', () => {
      angularSpeed = parseFloat(angSlider.value);
      angLabel.textContent = angularSpeed.toFixed(2);
    });
  }

  const selector = document.getElementById('teleop-robot');
  if (selector) {
    selector.addEventListener('change', () => {
      selectedRobot = selector.value;
      _updateRobotIndicator();
    });
  }

  ['fwd', 'back', 'left', 'right', 'stop'].forEach(dir => {
    const btn = document.getElementById(`btn-${dir}`);
    if (!btn) return;
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); _startDir(dir); });
    btn.addEventListener('mouseup', () => _stopDir(dir));
    btn.addEventListener('mouseleave', () => _stopDir(dir));
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); _startDir(dir); });
    btn.addEventListener('touchend', () => _stopDir(dir));
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const dir = _keyToDir(e.key);
    if (dir) { e.preventDefault(); _startDir(dir); }
  });
  document.addEventListener('keyup', (e) => {
    const dir = _keyToDir(e.key);
    if (dir) _stopDir(dir);
  });

  _updateRobotIndicator();
}

function _keyToDir(key) {
  const map = { w:'fwd', ArrowUp:'fwd', s:'back', ArrowDown:'back',
                a:'left', ArrowLeft:'left', d:'right', ArrowRight:'right', ' ':'stop' };
  return map[key] || null;
}

function _startDir(dir) {
  if (dir === 'stop') { activeKeys.clear(); _publishVel(0, 0); return; }
  activeKeys.add(dir);
  _publishFromKeys();
  if (!publishInterval) {
    publishInterval = setInterval(() => { if (activeKeys.size > 0) _publishFromKeys(); }, 100);
  }
}

function _stopDir(dir) {
  activeKeys.delete(dir);
  if (activeKeys.size === 0) {
    _publishVel(0, 0);
    if (publishInterval) { clearInterval(publishInterval); publishInterval = null; }
  } else { _publishFromKeys(); }
}

function _publishFromKeys() {
  let linear = 0, angular = 0;
  if (activeKeys.has('fwd'))   linear += speed;
  if (activeKeys.has('back'))  linear -= speed;
  if (activeKeys.has('left'))  angular += angularSpeed;
  if (activeKeys.has('right')) angular -= angularSpeed;
  _publishVel(linear, angular);
}

function _publishVel(linear, angular) {
  if (!isConnected()) return;
  const topic = TOPICS[selectedRobot]?.cmdVel;
  if (!topic) return;
  publish(topic, 'geometry_msgs/Twist', {
    linear: { x: linear, y: 0, z: 0 },
    angular: { x: 0, y: 0, z: angular },
  });
  const linEl = document.getElementById('vel-linear');
  const angEl = document.getElementById('vel-angular');
  if (linEl) linEl.textContent = linear.toFixed(2);
  if (angEl) angEl.textContent = angular.toFixed(2);
}

function _updateRobotIndicator() {
  const indicator = document.getElementById('teleop-robot-label');
  if (indicator) {
    indicator.textContent = selectedRobot === 'robot1' ? 'Robot 1' : 'Robot 2';
    indicator.style.color = selectedRobot === 'robot1' ? 'var(--primary)' : 'var(--secondary)';
  }
}

export function getSelectedRobot() { return selectedRobot; }

export function destroyTeleop() {
  if (publishInterval) { clearInterval(publishInterval); publishInterval = null; }
  activeKeys.clear();
}
