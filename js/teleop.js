// ─── Teleop Module ──────────────────────────────────────────────────────────
// Exact emulation of teleop_twist_keyboard.py

import { publish, isConnected } from './connection.js';
import { TOPICS } from '../config/topics.js';

let selectedRobot = 'robot1';

// Robot state
let x = 0;
let y = 0;
let z = 0;
let th = 0;
let speed = 0.5;
let turn = 1.0;
const speedLimit = 1000.0;
const turnLimit = 1000.0;

let publishInterval = null;

const moveBindings = {
  'i': [ 1,  0,  0,  0],
  'o': [ 1,  0,  0, -1],
  'j': [ 0,  0,  0,  1],
  'l': [ 0,  0,  0, -1],
  'u': [ 1,  0,  0,  1],
  ',': [-1,  0,  0,  0],
  '.': [-1,  0,  0,  1],
  'm': [-1,  0,  0, -1],
  'O': [ 1, -1,  0,  0],
  'I': [ 1,  0,  0,  0],
  'J': [ 0,  1,  0,  0],
  'L': [ 0, -1,  0,  0],
  'U': [ 1,  1,  0,  0],
  '<': [-1,  0,  0,  0],
  '>': [-1, -1,  0,  0],
  'M': [-1,  1,  0,  0],
  't': [ 0,  0,  1,  0],
  'b': [ 0,  0, -1,  0],
};

const speedBindings = {
  'q': [1.1, 1.1],
  'z': [0.9, 0.9],
  'w': [1.1, 1.0],
  'x': [0.9, 1.0],
  'e': [1.0, 1.1],
  'c': [1.0, 0.9],
};

// Map HTML buttons to keys
const btnToKey = {
  'n': 'i',
  'ne': 'o',
  'e': 'l',
  'se': 'm',
  's': ',',
  'sw': '.',
  'w': 'j',
  'nw': 'u',
  'stop': 'k'
};

export function initTeleop() {
  document.addEventListener('robot-tab-change', (e) => {
    selectedRobot = e.detail.robot;
    x = 0; y = 0; z = 0; th = 0;
  });

  // Keyboard events
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const holonomicActive = e.getModifierState('CapsLock') || e.shiftKey;
    _updateHolonomicUI(holonomicActive);

    const key = e.key;

    if (moveBindings[key]) {
      e.preventDefault();
      x = moveBindings[key][0];
      y = moveBindings[key][1];
      z = moveBindings[key][2];
      th = moveBindings[key][3];
      _updateActiveButton(key.toLowerCase());
    } else if (speedBindings[key.toLowerCase()]) {
      e.preventDefault();
      const binding = speedBindings[key.toLowerCase()];
      speed = Math.min(speedLimit, speed * binding[0]);
      turn = Math.min(turnLimit, turn * binding[1]);
      _updateSliders();
    } else {
      // Anything else = stop
      x = 0; y = 0; z = 0; th = 0;
      _updateActiveButton('k');
    }
  });

  document.addEventListener('keyup', (e) => {
    const holonomicActive = e.getModifierState('CapsLock') || e.shiftKey;
    _updateHolonomicUI(holonomicActive);
  });

  // UI Button events
  Object.keys(btnToKey).forEach(btnDir => {
    const btn = document.getElementById(`btn-${btnDir}`);
    if (!btn) return;
    
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      let key = btnToKey[btnDir];
      
      // If holonomic is toggled on via UI or CapsLock, use uppercase for movement
      const track = document.getElementById('holonomic-switch');
      const isHolonomic = track && track.classList.contains('on');
      if (isHolonomic && key !== 'k' && key !== ',' && key !== '.') {
        key = key.toUpperCase();
      } else if (isHolonomic && key === ',') { key = '<'; }
      else if (isHolonomic && key === '.') { key = '>'; }

      if (key === 'k') {
        x = 0; y = 0; z = 0; th = 0;
      } else if (moveBindings[key]) {
        x = moveBindings[key][0];
        y = moveBindings[key][1];
        z = moveBindings[key][2];
        th = moveBindings[key][3];
      }
      _updateActiveButton(btnToKey[btnDir]);
    });
  });

  // Holonomic switch click
  const hSwitch = document.getElementById('holonomic-switch');
  if (hSwitch) {
    hSwitch.addEventListener('click', () => {
      const isOn = hSwitch.classList.contains('on');
      _updateHolonomicUI(!isOn);
    });
  }

  _updateSliders();

  if (!publishInterval) {
    publishInterval = setInterval(() => {
      _publishCurrentVel();
    }, 100);
  }
}

function _publishCurrentVel() {
  if (!isConnected()) return;
  const topic = TOPICS[selectedRobot]?.cmdVel;
  if (!topic) return;

  const linearX = x * speed;
  const linearY = y * speed;
  const linearZ = z * speed;
  const angularZ = th * turn;

  publish(topic, 'geometry_msgs/Twist', {
    linear:  { x: linearX, y: linearY, z: linearZ },
    angular: { x: 0, y: 0, z: angularZ },
  });

  // Visual feedback
  const lxEl = document.getElementById('vel-lin-x');
  const lyEl = document.getElementById('vel-lin-y');
  const azEl = document.getElementById('vel-ang-z');
  if (lxEl) lxEl.textContent = linearX.toFixed(2);
  if (lyEl) lyEl.textContent = linearY.toFixed(2);
  if (azEl) azEl.textContent = angularZ.toFixed(2);
}

function _updateActiveButton(activeKey) {
  // Clear all
  Object.keys(btnToKey).forEach(btnDir => {
    const btn = document.getElementById(`btn-${btnDir}`);
    if (btn) btn.classList.remove('active');
  });

  // Set active
  const targetBtnDir = Object.keys(btnToKey).find(k => btnToKey[k] === activeKey);
  if (targetBtnDir) {
    const btn = document.getElementById(`btn-${targetBtnDir}`);
    if (btn) btn.classList.add('active');
  }
}

function _updateSliders() {
  const speedLabel = document.getElementById('teleop-speed-val');
  const slider = document.getElementById('teleop-speed');
  if (speedLabel) speedLabel.textContent = speed.toFixed(2);
  if (slider) slider.value = speed;

  const angLabel = document.getElementById('teleop-angular-speed-val');
  const angSlider = document.getElementById('teleop-angular-speed');
  if (angLabel) angLabel.textContent = turn.toFixed(2);
  if (angSlider) angSlider.value = turn;
}


function _updateHolonomicUI(isHolonomic) {
  const track = document.getElementById('holonomic-switch');
  const labelOff = document.getElementById('holonomic-label');
  const labelOn = document.getElementById('holonomic-label-on');

  if (track) track.classList.toggle('on', isHolonomic);
  if (labelOff) labelOff.style.display = isHolonomic ? 'none' : '';
  if (labelOn) labelOn.style.display = isHolonomic ? '' : 'none';
}

export function getSelectedRobot() { return selectedRobot; }
// Holonomic boolean getter removed as logic now entirely driven by moveBindings mapping.

export function destroyTeleop() {
  if (publishInterval) {
    clearInterval(publishInterval);
    publishInterval = null;
  }
  x = 0; y = 0; z = 0; th = 0;
}
