// ─── Graph Partitioner Module ───────────────────────────────────────────────
// BFS region growing with canvas visualization, YAML highlighting, fullscreen, robot picker.

import { publish, isConnected } from './connection.js';
import { TOPICS } from '../config/topics.js';

const COLORS = [
  '#0066FF','#FF6600','#3385FF','#CC5200','#66A3FF',
  '#FF8533','#99C2FF','#E67300','#B3D1FF','#FFB380',
  '#0052CC','#FF9E40','#1A75FF','#D98600','#4D94FF',
  '#FF7A1A','#80B3FF','#FFAD5C','#3D8BFF','#FFC699'
];
const SEED_RING = '#FF6600';

// ── YAML parser ──
function parseYAML(text) {
  const lines = text.split('\n');
  const r = { nodes: [], edges: [] };
  let section = null, cur = null;
  for (let raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (/^nodes\s*:/.test(line)) { section = 'nodes'; continue; }
    if (/^edges\s*:/.test(line)) { section = 'edges'; continue; }
    const li = line.match(/^\s+-\s+(.*)/);
    if (li) {
      cur = {};
      if (section === 'nodes') r.nodes.push(cur);
      else if (section === 'edges') r.edges.push(cur);
      const kv = li[1].match(/(\w+)\s*:\s*(.+)/);
      if (kv) cur[kv[1]] = _pv(kv[2].trim());
      continue;
    }
    const kv = line.match(/^\s+(\w+)\s*:\s*(.+)/);
    if (kv && cur) cur[kv[1]] = _pv(kv[2].trim());
  }
  return r;
}
function _pv(v) {
  if (v === 'true') return true; if (v === 'false') return false;
  const n = Number(v); return isNaN(n) ? v : n;
}

// ── YAML Syntax Highlighting ──
function highlightYAML(text) {
  return text.split('\n').map(line => {
    if (!line.trim() || line.trim().startsWith('#')) {
      return `<span class="yaml-comment">${_esc(line)}</span>`;
    }
    // Section headers
    if (/^(nodes|edges)\s*:/.test(line.trim())) {
      return `<span class="yaml-key">${_esc(line.replace(/^(nodes|edges)/, '$1'))}</span>`;
    }
    // List item with key: value
    const li = line.match(/^(\s*)(-)\s+(.*)/);
    if (li) {
      const indent = _esc(li[1]);
      const dash = `<span class="yaml-dash">${li[2]}</span>`;
      const rest = _highlightKV(li[3]);
      return `${indent}${dash} ${rest}`;
    }
    // Key: value (indented)
    const kv = line.match(/^(\s+)(\w+)\s*:\s*(.*)/);
    if (kv) {
      const indent = _esc(kv[1]);
      const key = `<span class="yaml-key">${_esc(kv[2])}</span>:`;
      const val = kv[3].trim() ? ` ${_highlightVal(kv[3].trim())}` : '';
      return `${indent}${key}${val}`;
    }
    return _esc(line);
  }).join('\n');
}

function _highlightKV(text) {
  const kv = text.match(/(\w+)\s*:\s*(.*)/);
  if (kv) {
    const key = `<span class="yaml-key">${_esc(kv[1])}</span>:`;
    const val = kv[2].trim() ? ` ${_highlightVal(kv[2].trim())}` : '';
    return `${key}${val}`;
  }
  return _esc(text);
}

function _highlightVal(v) {
  if (v === 'true' || v === 'false') return `<span class="yaml-string">${v}</span>`;
  const n = Number(v);
  if (!isNaN(n)) return `<span class="yaml-number">${v}</span>`;
  return `<span class="yaml-string">${_esc(v)}</span>`;
}

function _esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── MinHeap ──
class MinHeap {
  constructor() { this.data = []; }
  push(item) { this.data.push(item); this._up(this.data.length - 1); }
  pop() {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length) { this.data[0] = last; this._down(0); }
    return top;
  }
  get size() { return this.data.length; }
  _up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.data[p][0] <= this.data[i][0]) break;
      [this.data[p], this.data[i]] = [this.data[i], this.data[p]];
      i = p;
    }
  }
  _down(i) {
    const n = this.data.length;
    while (true) {
      let m = i, l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this.data[l][0] < this.data[m][0]) m = l;
      if (r < n && this.data[r][0] < this.data[m][0]) m = r;
      if (m === i) break;
      [this.data[m], this.data[i]] = [this.data[i], this.data[m]];
      i = m;
    }
  }
}

function dijkstraDist(adj, source, nodeIds) {
  const dist = {};
  for (const id of nodeIds) dist[id] = Infinity;
  dist[source] = 0;
  const pq = new MinHeap();
  pq.push([0, source]);
  while (pq.size) {
    const [d, u] = pq.pop();
    if (d > dist[u]) continue;
    for (const [v, w] of (adj[u] || [])) {
      const nd = d + w;
      if (nd < dist[v]) { dist[v] = nd; pq.push([nd, v]); }
    }
  }
  return dist;
}

function chooseSeeds(nodeIds, adj, k, rng) {
  if (k >= nodeIds.length) return [...nodeIds];
  const seeds = [nodeIds[Math.floor(rng() * nodeIds.length)]];
  let minDist = dijkstraDist(adj, seeds[0], nodeIds);
  for (let i = 1; i < k; i++) {
    let best = nodeIds[0], bestD = -Infinity;
    for (const n of nodeIds) {
      if ((minDist[n] || 0) > bestD) { bestD = minDist[n] || 0; best = n; }
    }
    seeds.push(best);
    const nd = dijkstraDist(adj, best, nodeIds);
    for (const n of nodeIds) minDist[n] = Math.min(minDist[n] || 0, nd[n] || 0);
  }
  return seeds;
}

function regionGrow(nodes, edges, k, balanceStrength, rng) {
  const nodeIds = nodes.map(n => n.id);
  const sizeMap = {};
  for (const n of nodes) sizeMap[n.id] = n.size || 1;
  const totalSize = Object.values(sizeMap).reduce((a, b) => a + b, 0);
  const target = totalSize / k;
  const adj = {};
  for (const n of nodes) adj[n.id] = [];
  for (const e of edges) {
    adj[e.u] = adj[e.u] || []; adj[e.v] = adj[e.v] || [];
    adj[e.u].push([e.v, e.cost || 1]);
    adj[e.v].push([e.u, e.cost || 1]);
  }
  const seeds = chooseSeeds(nodeIds, adj, k, rng);
  const labels = {};
  const regSize = new Array(k).fill(0);
  const pq = new MinHeap();
  let counter = 0;
  for (let ri = 0; ri < seeds.length; ri++) {
    const s = seeds[ri]; labels[s] = ri; regSize[ri] += sizeMap[s];
    for (const [nb, cost] of (adj[s] || [])) {
      if (!(nb in labels)) {
        const deficit = target - regSize[ri];
        pq.push([cost - balanceStrength * deficit, counter++, nb, ri]);
      }
    }
  }
  while (pq.size && Object.keys(labels).length < nodeIds.length) {
    const [, , nid, ri] = pq.pop();
    if (nid in labels) continue;
    labels[nid] = ri; regSize[ri] += sizeMap[nid];
    for (const [nb, cost] of (adj[nid] || [])) {
      if (!(nb in labels)) {
        const deficit = target - regSize[ri];
        pq.push([cost - balanceStrength * deficit, counter++, nb, ri]);
      }
    }
  }
  for (const nid of nodeIds) {
    if (!(nid in labels)) {
      let bestRi = regSize.indexOf(Math.min(...regSize));
      for (const [nb] of (adj[nid] || [])) {
        if (nb in labels) { bestRi = labels[nb]; break; }
      }
      labels[nid] = bestRi; regSize[bestRi] += sizeMap[nid];
    }
  }
  return { labels, seeds, regSize };
}

function checkConnected(adj, labels, k) {
  const result = new Array(k).fill(true);
  const parts = {};
  for (const [id, p] of Object.entries(labels)) {
    parts[p] = parts[p] || []; parts[p].push(id);
  }
  for (let p = 0; p < k; p++) {
    const ns = parts[p] || [];
    if (ns.length <= 1) continue;
    const visited = new Set([ns[0]]); const stack = [ns[0]];
    const nset = new Set(ns);
    while (stack.length) {
      const u = stack.pop();
      for (const [v] of (adj[u] || [])) {
        if (nset.has(v) && !visited.has(v)) { visited.add(v); stack.push(v); }
      }
    }
    result[p] = visited.size === ns.length;
  }
  return result;
}

function makeRng(seed) {
  let s = seed;
  return () => {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ── Canvas rendering ──
let cv, ctx, graphData = null, result = null;
let tfm = { x: 0, y: 0, scale: 1 };
let drag = false, dragStart = {}, tfmStart = {};
let hoveredNode = null;

function w2s(wx, wy) { return { x: wx * tfm.scale + tfm.x, y: -wy * tfm.scale + tfm.y }; }
function s2w(sx, sy) { return { x: (sx - tfm.x) / tfm.scale, y: -(sy - tfm.y) / tfm.scale }; }

function lighten(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.min(255, r + a * 255)},${Math.min(255, g + a * 255)},${Math.min(255, b + a * 255)})`;
}

function fitGraph(nodes) {
  const r = cv.getBoundingClientRect();
  const pad = 60;
  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const gw = x1 - x0 || 1, gh = y1 - y0 || 1;
  tfm.scale = Math.min((r.width - pad * 2) / gw, (r.height - pad * 2) / gh, 100);
  tfm.x = r.width / 2 - tfm.scale * (x0 + x1) / 2;
  tfm.y = r.height / 2 + tfm.scale * (y0 + y1) / 2;
}

function draw() {
  if (!cv || !ctx) return;
  const r = cv.getBoundingClientRect();
  ctx.clearRect(0, 0, r.width, r.height);

  ctx.fillStyle = '#F5F5F5';
  ctx.fillRect(0, 0, r.width, r.height);

  if (!graphData) {
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.font = '13px Montserrat, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Enter graph YAML and click Run', r.width / 2, r.height / 2);
    return;
  }
  const { nodes, edges } = graphData;
  const labels = result ? result.labels : null;
  const seeds = result ? new Set(result.seeds) : new Set();

  for (const e of edges) {
    const nu = nodes.find(n => n.id === e.u);
    const nv = nodes.find(n => n.id === e.v);
    if (!nu || !nv) continue;
    const pu = w2s(nu.x, nu.y), pv = w2s(nv.x, nv.y);
    const isCut = labels && labels[e.u] !== labels[e.v];
    ctx.beginPath(); ctx.moveTo(pu.x, pu.y); ctx.lineTo(pv.x, pv.y);
    if (isCut) {
      ctx.strokeStyle = 'rgba(255,102,0,0.5)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
    } else if (labels) {
      ctx.strokeStyle = COLORS[labels[e.u] % COLORS.length] + '33'; ctx.lineWidth = 2; ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1; ctx.setLineDash([]);
    }
    ctx.stroke(); ctx.setLineDash([]);
    if (tfm.scale > 18) {
      const mx2 = (pu.x + pv.x) / 2, my2 = (pu.y + pv.y) / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.font = `${Math.min(10, tfm.scale * 0.17)}px Montserrat`;
      ctx.textAlign = 'center';
      ctx.fillText(e.cost, mx2, my2 - 4);
    }
  }

  const nr = Math.max(7, Math.min(24, tfm.scale * 0.6));
  for (const n of nodes) {
    const p = w2s(n.x, n.y);
    const col = labels ? COLORS[labels[n.id] % COLORS.length] : '#0066FF';
    const isSeed = seeds.has(n.id);
    const isHov = hoveredNode && hoveredNode.id === n.id;
    const rr = isHov ? nr * 1.25 : nr;
    if (labels) {
      const grd = ctx.createRadialGradient(p.x, p.y, rr * 0.4, p.x, p.y, rr * 3.5);
      grd.addColorStop(0, col + '20'); grd.addColorStop(1, 'transparent');
      ctx.beginPath(); ctx.arc(p.x, p.y, rr * 3.5, 0, Math.PI * 2);
      ctx.fillStyle = grd; ctx.fill();
    }
    if (isSeed) {
      ctx.beginPath(); ctx.arc(p.x, p.y, rr + 4, 0, Math.PI * 2);
      ctx.strokeStyle = SEED_RING; ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]);
      ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
    const grd2 = ctx.createRadialGradient(p.x - rr * 0.3, p.y - rr * 0.35, 0, p.x, p.y, rr);
    grd2.addColorStop(0, lighten(col, 0.35)); grd2.addColorStop(1, col);
    ctx.fillStyle = grd2; ctx.fill();
    ctx.strokeStyle = isHov ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.08)';
    ctx.lineWidth = isHov ? 2 : 1; ctx.stroke();
    if (rr > 9) {
      ctx.fillStyle = '#fff';
      ctx.font = `600 ${Math.min(rr * 0.75, 12)}px Montserrat`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(n.id, p.x, p.y);
    }
  }
  ctx.textBaseline = 'alphabetic';
}

function doResize() {
  if (!cv) return;
  const dpr = window.devicePixelRatio || 1;
  const wrap = cv.parentElement;
  if (!wrap) return;
  const r = wrap.getBoundingClientRect();
  cv.width = r.width * dpr; cv.height = r.height * dpr;
  cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
  ctx.scale(dpr, dpr);
  draw();
}

function fmtFloat(v) {
  const s = parseFloat(parseFloat(v).toFixed(6));
  return Number.isInteger(s) ? s.toFixed(1) : String(s);
}

function exportPart(p, nodes, edges, labels) {
  const partNodes = nodes.filter(n => labels[n.id] === p).sort((a, b) => a.id - b.id);
  const idRemap = {}; partNodes.forEach((n, i) => { idRemap[n.id] = i + 1; });
  const ids = new Set(partNodes.map(n => n.id));
  let yaml = 'nodes:\n';
  for (const n of partNodes) {
    yaml += `  - id: ${idRemap[n.id]}\n    x: ${fmtFloat(n.x)}\n    y: ${fmtFloat(n.y)}\n`;
    if (n.size && n.size !== 1) yaml += `    size: ${n.size}\n`;
  }
  yaml += 'edges:\n';
  const seen = new Set();
  for (const e of edges) {
    if (ids.has(e.u) && ids.has(e.v)) {
      const key = `${Math.min(e.u, e.v)},${Math.max(e.u, e.v)}`;
      if (!seen.has(key)) {
        seen.add(key);
        yaml += `  - u: ${idRemap[e.u]}\n    v: ${idRemap[e.v]}\n    cost: ${fmtFloat(e.cost || 1.0)}\n`;
      }
    }
  }
  return yaml;
}

// ── YAML highlight updater ──
function _updateYAMLHighlight() {
  const ta = document.getElementById('part-yaml');
  const pre = document.getElementById('yaml-highlight');
  if (!ta || !pre) return;
  pre.innerHTML = highlightYAML(ta.value) + '\n';
}

// ── Fullscreen ──
let fsGraphCanvas = null, fsGraphCtx = null, fsGraphActive = false;
let fsYamlActive = false;

function _initFullscreen() {
  // YAML fullscreen
  const fsYamlBtn = document.getElementById('part-fs-yaml');
  if (fsYamlBtn) {
    fsYamlBtn.addEventListener('click', () => {
      const overlay = document.getElementById('fs-yaml-overlay');
      const ta = document.getElementById('fs-yaml-textarea');
      const src = document.getElementById('part-yaml');
      if (overlay && ta && src) {
        ta.value = src.value;
        overlay.classList.add('active');
        fsYamlActive = true;
      }
    });
  }
  const fsYamlClose = document.getElementById('fs-yaml-close');
  if (fsYamlClose) {
    fsYamlClose.addEventListener('click', () => {
      const overlay = document.getElementById('fs-yaml-overlay');
      const ta = document.getElementById('fs-yaml-textarea');
      const src = document.getElementById('part-yaml');
      if (overlay && ta && src) {
        src.value = ta.value;
        _updateYAMLHighlight();
        overlay.classList.remove('active');
        fsYamlActive = false;
      }
    });
  }

  // Graph fullscreen
  const fsGraphBtn = document.getElementById('part-fs-graph');
  if (fsGraphBtn) {
    fsGraphBtn.addEventListener('click', () => {
      const overlay = document.getElementById('fs-graph-overlay');
      if (overlay) {
        overlay.classList.add('active');
        fsGraphActive = true;
        fsGraphCanvas = document.getElementById('fs-graph-canvas');
        fsGraphCtx = fsGraphCanvas.getContext('2d');
        _resizeFsGraph();
      }
    });
  }
  const fsGraphClose = document.getElementById('fs-graph-close');
  if (fsGraphClose) {
    fsGraphClose.addEventListener('click', () => {
      const overlay = document.getElementById('fs-graph-overlay');
      if (overlay) {
        overlay.classList.remove('active');
        fsGraphActive = false;
      }
    });
  }
  window.addEventListener('resize', () => {
    if (fsGraphActive) _resizeFsGraph();
  });
}

function _resizeFsGraph() {
  if (!fsGraphCanvas) return;
  const dpr = window.devicePixelRatio || 1;
  const r = fsGraphCanvas.parentElement.getBoundingClientRect();
  fsGraphCanvas.width = r.width * dpr;
  fsGraphCanvas.height = r.height * dpr;
  fsGraphCanvas.style.width = r.width + 'px';
  fsGraphCanvas.style.height = r.height + 'px';
  fsGraphCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Draw in fullscreen context
  _drawInContext(fsGraphCtx, fsGraphCanvas.getBoundingClientRect());
}

function _drawInContext(ctx, r) {
  ctx.clearRect(0, 0, r.width, r.height);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, r.width, r.height);

  if (!graphData) {
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.font = '16px Montserrat';
    ctx.textAlign = 'center';
    ctx.fillText('Run partitioning first', r.width / 2, r.height / 2);
    return;
  }

  const { nodes, edges } = graphData;
  const labels = result ? result.labels : null;
  const seeds = result ? new Set(result.seeds) : new Set();

  // Fit to fullscreen
  const pad = 80;
  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const gw = x1 - x0 || 1, gh = y1 - y0 || 1;
  const sc = Math.min((r.width - pad * 2) / gw, (r.height - pad * 2) / gh, 100);
  const ox = r.width / 2 - sc * (x0 + x1) / 2;
  const oy = r.height / 2 + sc * (y0 + y1) / 2;

  function fw(wx, wy) { return { x: wx * sc + ox, y: -wy * sc + oy }; }

  for (const e of edges) {
    const nu = nodes.find(n => n.id === e.u), nv = nodes.find(n => n.id === e.v);
    if (!nu || !nv) continue;
    const pu = fw(nu.x, nu.y), pv = fw(nv.x, nv.y);
    const isCut = labels && labels[e.u] !== labels[e.v];
    ctx.beginPath(); ctx.moveTo(pu.x, pu.y); ctx.lineTo(pv.x, pv.y);
    if (isCut) { ctx.strokeStyle = 'rgba(255,102,0,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); }
    else if (labels) { ctx.strokeStyle = COLORS[labels[e.u] % COLORS.length] + '33'; ctx.lineWidth = 3; ctx.setLineDash([]); }
    else { ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1.5; ctx.setLineDash([]); }
    ctx.stroke(); ctx.setLineDash([]);
    const mx2 = (pu.x + pv.x) / 2, my2 = (pu.y + pv.y) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.font = `${Math.min(12, sc * 0.15)}px Montserrat`;
    ctx.textAlign = 'center';
    ctx.fillText(e.cost, mx2, my2 - 5);
  }

  const nr = Math.max(10, Math.min(30, sc * 0.5));
  for (const n of nodes) {
    const p = fw(n.x, n.y);
    const col = labels ? COLORS[labels[n.id] % COLORS.length] : '#0066FF';
    const isSeed = seeds.has(n.id);
    const rr = nr;
    if (labels) {
      const grd = ctx.createRadialGradient(p.x, p.y, rr * 0.4, p.x, p.y, rr * 3);
      grd.addColorStop(0, col + '20'); grd.addColorStop(1, 'transparent');
      ctx.beginPath(); ctx.arc(p.x, p.y, rr * 3, 0, Math.PI * 2);
      ctx.fillStyle = grd; ctx.fill();
    }
    if (isSeed) {
      ctx.beginPath(); ctx.arc(p.x, p.y, rr + 5, 0, Math.PI * 2);
      ctx.strokeStyle = SEED_RING; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
      ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
    const grd2 = ctx.createRadialGradient(p.x - rr * 0.3, p.y - rr * 0.35, 0, p.x, p.y, rr);
    grd2.addColorStop(0, lighten(col, 0.35)); grd2.addColorStop(1, col);
    ctx.fillStyle = grd2; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `600 ${Math.min(rr * 0.75, 14)}px Montserrat`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(n.id, p.x, p.y);
  }
}

// ── Public API ──

export function initPartitioner() {
  cv = document.getElementById('part-canvas');
  if (!cv) return;
  ctx = cv.getContext('2d');
  doResize();
  window.addEventListener('resize', doResize);

  cv.addEventListener('mousedown', e => {
    const r = cv.getBoundingClientRect();
    drag = true;
    dragStart = { x: e.clientX - r.left, y: e.clientY - r.top };
    tfmStart = { ...tfm };
  });
  cv.addEventListener('mousemove', e => {
    const r = cv.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    if (drag) {
      tfm.x = tfmStart.x + (mx - dragStart.x);
      tfm.y = tfmStart.y + (my - dragStart.y);
      draw(); return;
    }
    if (!graphData) return;
    const w = s2w(mx, my);
    const nrr = Math.max(6, Math.min(24, tfm.scale * 0.6));
    const threshold = nrr / tfm.scale * 1.5;
    const hit = graphData.nodes.find(n => {
      const dx = n.x - w.x, dy = n.y - w.y;
      return Math.sqrt(dx * dx + dy * dy) < threshold;
    }) || null;
    if (hit !== hoveredNode) { hoveredNode = hit; draw(); }
    const tip = document.getElementById('part-tooltip');
    if (hit && tip) {
      const p = result ? result.labels[hit.id] : null;
      const col = p !== null ? COLORS[p % COLORS.length] : '#000';
      tip.innerHTML = `<strong style="color:${col}">Node ${hit.id}</strong><br>` +
        (p !== null ? `Partition P${p}<br>` : '') +
        `<span style="color:var(--text-hint)">x: ${hit.x.toFixed(2)}  y: ${hit.y.toFixed(2)}</span>`;
      tip.style.display = 'block';
      tip.style.left = (mx + 16) + 'px';
      tip.style.top = (my - 12) + 'px';
    } else if (tip) { tip.style.display = 'none'; }
  });
  cv.addEventListener('mouseup', () => { drag = false; });
  cv.addEventListener('mouseleave', () => {
    drag = false; hoveredNode = null;
    const tip = document.getElementById('part-tooltip');
    if (tip) tip.style.display = 'none';
    draw();
  });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const f = e.deltaY > 0 ? 0.85 : 1.18;
    const wx = (mx - tfm.x) / tfm.scale, wy = (my - tfm.y) / tfm.scale;
    tfm.scale = Math.max(0.4, Math.min(400, tfm.scale * f));
    tfm.x = mx - wx * tfm.scale; tfm.y = my - wy * tfm.scale;
    draw();
  }, { passive: false });

  const runBtn = document.getElementById('part-run-btn');
  if (runBtn) runBtn.addEventListener('click', runPartition);

  // YAML highlight
  const ta = document.getElementById('part-yaml');
  if (ta) {
    ta.addEventListener('input', _updateYAMLHighlight);
    ta.addEventListener('scroll', () => {
      const pre = document.getElementById('yaml-highlight');
      if (pre) pre.scrollTop = ta.scrollTop;
    });
    _updateYAMLHighlight();
  }

  _initFullscreen();
  draw();
}

export function runPartition() {
  const errBox = document.getElementById('part-error');
  if (errBox) { errBox.textContent = ''; errBox.style.display = 'none'; }

  const yaml = document.getElementById('part-yaml')?.value || '';
  const k = parseInt(document.getElementById('part-k')?.value || '2');
  const bal = parseFloat(document.getElementById('part-bal')?.value || '2.0');
  const seed = parseInt(document.getElementById('part-seed')?.value || '42');

  if (isNaN(k) || k < 2) { _showPartErr('k must be >= 2'); return; }
  if (isNaN(bal) || bal < 0) { _showPartErr('Balance must be >= 0'); return; }

  let parsed;
  try { parsed = parseYAML(yaml); }
  catch (e) { _showPartErr('YAML error: ' + e.message); return; }

  const { nodes, edges } = parsed;
  if (!nodes || nodes.length < 2) { _showPartErr('Need at least 2 nodes'); return; }
  if (k > nodes.length) { _showPartErr(`k=${k} > nodes=${nodes.length}`); return; }

  const hud = document.getElementById('part-hud');
  if (hud) { hud.textContent = 'computing...'; hud.className = 'part-hud'; }

  setTimeout(() => {
    try {
      const rng = makeRng(isNaN(seed) ? 42 : seed);
      const res = regionGrow(nodes, edges || [], k, bal, rng);
      graphData = { nodes, edges: edges || [] };
      result = res;

      const adj2 = {};
      for (const n of nodes) adj2[n.id] = [];
      for (const e of (edges || [])) {
        adj2[e.u] = adj2[e.u] || []; adj2[e.v] = adj2[e.v] || [];
        adj2[e.u].push([e.v, e.cost || 1]); adj2[e.v].push([e.u, e.cost || 1]);
      }
      const conn = checkConnected(adj2, res.labels, k);
      fitGraph(nodes); draw();

      let cutC = 0; const seen = new Set();
      for (const e of (edges || [])) {
        const key = `${Math.min(e.u, e.v)},${Math.max(e.u, e.v)}`;
        if (!seen.has(key)) { seen.add(key); if (res.labels[e.u] !== res.labels[e.v]) cutC += (e.cost || 1); }
      }
      _updateEl('part-s-nodes', nodes.length);
      _updateEl('part-s-edges', (edges || []).length);
      _updateEl('part-s-k', k);
      _updateEl('part-s-cut', cutC.toFixed(1));
      _showEl('part-stats');

      // Legend
      const partMap = {};
      for (const [id, p] of Object.entries(res.labels)) {
        partMap[p] = partMap[p] || []; partMap[p].push(id);
      }
      const totalSize = nodes.reduce((s, n) => s + (n.size || 1), 0);
      const legendEl = document.getElementById('part-legend');
      if (legendEl) {
        legendEl.innerHTML = '';
        for (let p = 0; p < k; p++) {
          const ns = partMap[p] || [];
          const sz = ns.reduce((s, id) => { const n = nodes.find(x => x.id == id); return s + (n?.size || 1); }, 0);
          const pct = (sz / totalSize * 100).toFixed(0);
          const div = document.createElement('div');
          div.className = 'part-row';
          div.innerHTML = `
            <div class="part-swatch" style="background:${COLORS[p % COLORS.length]}"></div>
            <span class="part-name" style="color:${COLORS[p % COLORS.length]}">P${p}</span>
            <span class="part-nodes">${ns.sort((a, b) => a - b).join(', ')}</span>
            <span class="part-count">${ns.length}n · ${pct}%</span>
            <span class="part-conn ${conn[p] ? 'ok' : 'bad'}">${conn[p] ? 'ok' : 'disc'}</span>`;
          legendEl.appendChild(div);
        }
      }
      _showEl('part-legend');

      // Export + Deploy with robot picker
      const exportEl = document.getElementById('part-export');
      if (exportEl) {
        exportEl.innerHTML = '';
        for (let p = 0; p < k; p++) {
          const dlBtn = document.createElement('button');
          dlBtn.className = 'btn-export';
          dlBtn.innerHTML = `<span class="swatch" style="background:${COLORS[p % COLORS.length]}"></span>P${p}.yaml`;
          dlBtn.onclick = () => {
            const yamlOut = exportPart(p, nodes, edges || [], res.labels);
            const blob = new Blob([yamlOut], { type: 'text/yaml' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = `partition_${p}.yaml`; a.click();
          };
          exportEl.appendChild(dlBtn);

          // Deploy with robot selector
          const deployWrap = document.createElement('span');
          deployWrap.style.display = 'inline-flex';
          deployWrap.style.alignItems = 'center';
          deployWrap.style.gap = '3px';

          const sel = document.createElement('select');
          sel.className = 'deploy-select';
          sel.innerHTML = '<option value="robot1">R1</option><option value="robot2">R2</option>';

          const deployBtn = document.createElement('button');
          deployBtn.className = 'btn-deploy';
          deployBtn.textContent = `Deploy P${p}`;
          deployBtn.onclick = () => {
            if (!isConnected()) { alert('Not connected to rosbridge'); return; }
            const robotKey = sel.value;
            const yamlOut = exportPart(p, nodes, edges || [], res.labels);
            const topic = TOPICS[robotKey]?.graph;
            if (topic) {
              publish(topic, 'std_msgs/String', { data: yamlOut });
              deployBtn.textContent = 'Sent!';
              setTimeout(() => { deployBtn.textContent = `Deploy P${p}`; }, 2000);
            }
          };

          deployWrap.appendChild(sel);
          deployWrap.appendChild(deployBtn);
          exportEl.appendChild(deployWrap);
        }
      }
      _showEl('part-export');

      const allConn = conn.every(Boolean);
      if (hud) {
        hud.textContent = `k=${k} · ${allConn ? 'all connected' : 'check connectivity'}`;
        hud.className = 'part-hud' + (allConn ? ' active' : '');
      }

      // Update fullscreen graph if open
      if (fsGraphActive) _resizeFsGraph();

    } catch (err) {
      _showPartErr('Error: ' + err.message);
      if (hud) hud.textContent = 'error';
    }
  }, 50);
}

function _showPartErr(msg) {
  const b = document.getElementById('part-error');
  if (b) { b.textContent = msg; b.style.display = 'block'; }
}
function _updateEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function _showEl(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = '';
}

export function destroyPartitioner() {
  graphData = null; result = null;
}
