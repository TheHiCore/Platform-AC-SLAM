// ─── Parameters Module ──────────────────────────────────────────────────────
// Dynamically generates a form based on EXPLORER_PARAMS and calls set_parameters service

import { callService, isConnected } from './connection.js';
import { TOPICS, SERVICES, EXPLORER_PARAMS } from '../config/topics.js';

let selectedRobot = 'robot1';

export function initParameters() {
  const container = document.getElementById('params-container');
  if (!container) return;

  // Build form
  container.innerHTML = '';
  EXPLORER_PARAMS.forEach(param => {
    const row = document.createElement('div');
    row.className = 'param-row';

    const label = document.createElement('label');
    label.textContent = param.name;
    label.title = param.desc;

    let input;
    if (param.type === 'bool') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = param.default;
    } else {
      input = document.createElement('input');
      input.type = 'number';
      input.value = param.default;
      if (param.min !== undefined) input.min = param.min;
      if (param.max !== undefined) input.max = param.max;
      if (param.step !== undefined) input.step = param.step;
    }
    input.id = `param-${param.name}`;
    input.className = 'param-input';

    const desc = document.createElement('span');
    desc.className = 'param-desc';
    desc.textContent = param.desc;

    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(desc);
    container.appendChild(row);
  });

  // Robot selector
  const selector = document.getElementById('params-robot');
  if (selector) {
    selector.addEventListener('change', () => {
      selectedRobot = selector.value;
      _readParams();
    });
  }

  // Buttons
  const applyBtn = document.getElementById('params-apply');
  if (applyBtn) {
    applyBtn.addEventListener('click', _applyParams);
  }

  const readBtn = document.getElementById('params-read');
  if (readBtn) {
    readBtn.addEventListener('click', _readParams);
  }
}

async function _applyParams() {
  if (!isConnected()) {
    _showStatus('Not connected to ROS', 'error');
    return;
  }

  const btn = document.getElementById('params-apply');
  btn.disabled = true;
  btn.textContent = 'Applying...';

  const svcName = SERVICES[selectedRobot]?.setParams;
  if (!svcName) {
    _showStatus('Service name not configured', 'error');
    btn.disabled = false;
    btn.textContent = 'Apply Parameters';
    return;
  }

  // Build request
  const parameters = EXPLORER_PARAMS.map(param => {
    const input = document.getElementById(`param-${param.name}`);
    let value = {};
    if (param.type === 'bool') {
      value.bool_value = input.checked;
      value.type = 1; // bool
    } else if (param.type === 'int') {
      value.integer_value = parseInt(input.value);
      value.type = 2; // integer
    } else if (param.type === 'double') {
      value.double_value = parseFloat(input.value);
      value.type = 3; // double
    } else if (param.type === 'string') {
      value.string_value = input.value;
      value.type = 4; // string
    }
    return { name: param.name, value: value };
  });

  try {
    const res = await callService(svcName, 'rcl_interfaces/SetParameters', { parameters });
    console.log('[parameters] Set result:', res);
    
    // Check results
    const allSuccessful = res.results.every(r => r.successful);
    if (allSuccessful) {
      _showStatus('Parameters applied successfully', 'success');
    } else {
      const reasons = res.results.filter(r => !r.successful).map(r => r.reason).join(', ');
      _showStatus(`Failed to apply some parameters: ${reasons}`, 'error');
    }
  } catch (err) {
    console.error('[parameters] Error setting params:', err);
    _showStatus(`Service call failed: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Apply Parameters';
  }
}

async function _readParams() {
  if (!isConnected()) return;

  const svcName = SERVICES[selectedRobot]?.getParams;
  if (!svcName) return;

  const names = EXPLORER_PARAMS.map(p => p.name);

  try {
    const res = await callService(svcName, 'rcl_interfaces/GetParameters', { names });
    console.log('[parameters] Get result:', res);

    res.values.forEach((val, i) => {
      const param = EXPLORER_PARAMS[i];
      const input = document.getElementById(`param-${param.name}`);
      if (!input) return;

      if (param.type === 'bool' && val.type === 1) {
        input.checked = val.bool_value;
      } else if (param.type === 'int' && val.type === 2) {
        input.value = val.integer_value;
      } else if (param.type === 'double' && val.type === 3) {
        input.value = val.double_value;
      } else if (param.type === 'string' && val.type === 4) {
        input.value = val.string_value;
      }
    });
    _showStatus('Parameters read from robot', 'success');
  } catch (err) {
    console.error('[parameters] Error getting params:', err);
    _showStatus(`Failed to read parameters: ${err.message}`, 'error');
  }
}

function _showStatus(msg, type) {
  const statusEl = document.getElementById('params-status');
  if (statusEl) {
    statusEl.textContent = msg;
    statusEl.className = `params-status ${type}`;
    statusEl.style.display = 'block';
    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 4000);
  }
}

export function destroyParameters() {
  // nothing to clean up
}
