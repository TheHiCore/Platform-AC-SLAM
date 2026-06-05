// ─── Teleop Module ──────────────────────────────────────────────────────────
// 8-directional toggle buttons, holonomic switch, click-once to move, center to stop.

import { publish, isConnected } from './connection.js';
import { TOPICS } from '../config/topics.js';

let selectedRobot = 'robot1';
let speed = 0.2;
let angularSpeed = 0.5;
let holonomic = { robot1: false, robot2: true }; // R1 default non-holonomic, R2 default holonomic

// Active directions (toggle-on-click style)
let activeDirs = new Set();

// Button mapping: direction -> Twist components
// Each entry: [linearX, linearY, angularZ] multipliers
const DIR_MAP = {
  n:  [ 1,  0,  0],
  ne: [ 1,  1, -1],
  e:  [ 0,  1, -1],
  se: [-1,  1, -1],
  s:  [-1,  0,  0],
  sw: [-1, -1,  1],
  w:  [ 0, -1,  1],
  nw: [ 1, -1,  1],
};

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
      _updateHolonomicUI();
      _updateRobotIndicator();
      _updateButtonStates();
    });
  }

  // Direction buttons (toggle on click)
  Object.keys(DIR_MAP).forEach(dir => {
    const btn = document.getElementById(`btn-${dir}`);
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      _toggleDir(dir);
    });
  });

  // Stop button (always stops)
  const stopBtn = document.getElementById('btn-stop');
  if (stopBtn) {
    stopBtn.addEventListener('click', (e) => {
      e.preventDefault();
      _stopAll();
    });
  }

  // Holonomic switch
  const hSwitch = document.getElementById('holonomic-switch');
  if (hSwitch) {
    hSwitch.addEventListener('click', () => {
      holonomic[selectedRobot] = !holonomic[selectedRobot];
      _updateHolonomicUI();
      _publishFromActive();
    });
  }

  _updateHolonomicUI();
  _updateRobotIndicator();
  _updateButtonStates();
}

function _toggleDir(dir) {
  if (activeDirs.has(dir)) {
    activeDirs.delete(dir);
  } else {
    activeDirs.add(dir);
  }
  _updateButtonStates();
  _publishFromActive();
}

function _stopAll() {
  activeDirs.clear();
  _updateButtonStates();
  _publishVel(0, 0, 0);
}

function _publishFromActive() {
  let linX = 0, linY = 0, angZ = 0;
  const isHolonomic = holonomic[selectedRobot];

  for (const dir of activeDirs) {
    const [mx, my, mz] = DIR_MAP[dir];
    linX += mx;
    if (isHolonomic) {
      linY += my;
    } else {
      angZ += my; // non-holonomic: Y component becomes angular
    }
    angZ += mz;
  }

  // Apply speeds
  const vx = linX * speed;
  const vy = isHolonomic ? linY * speed : 0;
  const wz = angZ * angularSpeed;

  _publishVel(vx, vy, wz);
}

function _publishVel(linearX, linearY, angularZ) {
  if (!isConnected()) return;
  const topic = TOPICS[selectedRobot]?.cmdVel;
  if (!topic) return;
  publish(topic, 'geometry_msgs/Twist', {
    linear: { x: linearX, y: linearY, z: 0 },
    angular: { x: 0, y: 0, z: angularZ },
  });
  const lxEl = document.getElementById('vel-lin-x');
  const lyEl = document.getElementById('vel-lin-y');
  const azEl = document.getElementById('vel-ang-z');
  if (lxEl) lxEl.textContent = linearX.toFixed(2);
  if (lyEl) lyEl.textContent = linearY.toFixed(2);
  if (azEl) azEl.textContent = angularZ.toFixed(2);
}

function _updateButtonStates() {
  Object.keys(DIR_MAP).forEach(dir => {
    const btn = document.getElementById(`btn-${dir}`);
    if (btn) btn.classList.toggle('active', activeDirs.has(dir));
  });
  const stopBtn = document.getElementById('btn-stop');
  if (stopBtn) stopBtn.classList.toggle('active', activeDirs.size === 0);
}

function _updateHolonomicUI() {
  const isHolonomic = holonomic[selectedRobot];
  const track = document.getElementById('holonomic-switch');
  const labelOff = document.getElementById('holonomic-label');
  const labelOn = document.getElementById('holonomic-label-on');

  if (track) track.classList.toggle('on', isHolonomic);
  if (labelOff) labelOff.style.display = isHolonomic ? 'none' : '';
  if (labelOn) labelOn.style.display = isHolonomic ? '' : 'none';

  // Recalculate if directions are active
  if (activeDirs.size > 0) _publishFromActive();
}

function _updateRobotIndicator() {
  const indicator = document.getElementById('teleop-robot-label');
  if (indicator) {
    indicator.textContent = selectedRobot === 'robot1' ? 'Robot 1' : 'Robot 2';
    indicator.style.color = selectedRobot === 'robot1' ? 'var(--blue)' : 'var(--orange)';
  }
}

export function getSelectedRobot() { return selectedRobot; }
export function isHolonomic() { return holonomic[selectedRobot]; }

export function destroyTeleop() {
  activeDirs.clear();
}
