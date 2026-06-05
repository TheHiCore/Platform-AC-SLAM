// ─── ROS Connection Manager ─────────────────────────────────────────────────
// Owns the single ROSLIB.Ros instance. All other modules use getRos().

import { ROSBRIDGE } from '../config/topics.js';

let ros = null;
let connected = false;
const listeners = new Set();

// Event system for connection state changes
export function onConnectionChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify() {
  listeners.forEach(fn => fn(connected));
}

export function getRos() {
  return ros;
}

export function isConnected() {
  return connected;
}

export function connect(host, port) {
  if (ros) disconnect();

  const url = `ws://${host || ROSBRIDGE.host}:${port || ROSBRIDGE.port}`;
  console.log(`[connection] Connecting to ${url}…`);

  ros = new ROSLIB.Ros({ url });

  ros.on('connection', () => {
    console.log('[connection] Connected ✓');
    connected = true;
    notify();
  });

  ros.on('error', (err) => {
    console.error('[connection] Error:', err);
  });

  ros.on('close', () => {
    console.log('[connection] Closed');
    connected = false;
    notify();
  });
}

export function disconnect() {
  if (ros) {
    try { ros.close(); } catch (e) { /* ignore */ }
    ros = null;
    connected = false;
    notify();
  }
}

// Subscribe helper — auto-handles reconnection
export function subscribe(topicName, msgType, callback, opts = {}) {
  if (!ros) {
    console.warn(`[connection] Cannot subscribe to ${topicName}: not connected`);
    return null;
  }
  const topic = new ROSLIB.Topic({
    ros,
    name: topicName,
    messageType: msgType,
    throttle_rate: opts.throttleRate || 0,
    queue_length: opts.queueLength || 1,
    compression: opts.compression || 'none',
  });
  topic.subscribe(callback);
  console.log(`[connection] Subscribed: ${topicName}`);
  return topic;
}

// Publish helper
export function publish(topicName, msgType, msg) {
  if (!ros) return;
  const topic = new ROSLIB.Topic({
    ros,
    name: topicName,
    messageType: msgType,
  });
  topic.publish(new ROSLIB.Message(msg));
}

// Service call helper
export function callService(svcName, svcType, request) {
  return new Promise((resolve, reject) => {
    if (!ros) { reject(new Error('Not connected')); return; }
    const svc = new ROSLIB.Service({
      ros,
      name: svcName,
      serviceType: svcType,
    });
    svc.callService(new ROSLIB.ServiceRequest(request), resolve, reject);
  });
}
