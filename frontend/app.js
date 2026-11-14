/**
 * FLAME IN FREEFALL // BLUEPRINT TELEMETRY ENGINE
 * SpaceX Telemetry / Mission Control Node Graph System
 * NASA Physical Sciences Informatics (PSI) & Sisyphus Architecture
 */

(function () {
  'use strict';

  // =========================================================================
  // CONSTANTS & CONFIGURATION
  // =========================================================================

  const STORAGE_KEY = 'flame_blueprint_graph_v1';
  const API_EVAL_URL = '/api/blueprint-eval';
  const API_PROMPT_URL = '/api/blueprint-prompt';

  const SCENARIOS = {
    iss_nominal: {
      name: 'ISS Nominal (21%)',
      params: { o2_percent: 21.0, pressure_atm: 1.0, flow_velocity_cms: 10.0, fuel: 'pmma', h2_conc_pct: 0.0, cabin_volume_m3: 106.0 }
    },
    saffire_v: {
      name: 'Saffire V (Cygnus)',
      params: { o2_percent: 29.5, pressure_atm: 0.71, flow_velocity_cms: 20.0, fuel: 'pmma', h2_conc_pct: 0.0, cabin_volume_m3: 28.0 }
    },
    psi117_cool: {
      name: 'PSI-117 Cool Flame',
      params: { o2_percent: 21.0, pressure_atm: 1.0, flow_velocity_cms: 0.5, fuel: 'n-heptane', h2_conc_pct: 0.0, cabin_volume_m3: 28.0 }
    },
    apollo13_h2: {
      name: 'Apollo 13 (H₂ Blast)',
      params: { o2_percent: 21.0, pressure_atm: 1.0, flow_velocity_cms: 5.0, fuel: 'h2', h2_conc_pct: 6.5, cabin_volume_m3: 15.0 }
    },
    apollo1_o2: {
      name: 'Apollo 1 (Flashover)',
      params: { o2_percent: 95.0, pressure_atm: 1.1, flow_velocity_cms: 5.0, fuel: 'pmma', h2_conc_pct: 0.0, cabin_volume_m3: 15.0 }
    }
  };

  // =========================================================================
  // GRAPH STATE
  // =========================================================================

  const state = {
    nodes: new Map(), // id -> NodeInstance
    wires: [],        // [{ id, fromNode, fromPin, toNode, toPin }]
    pan: { x: 60, y: 40 },
    scale: 0.95,
    isPanning: false,
    panStart: { x: 0, y: 0 },
    activeWireDraft: null, // { fromNode, fromPin, startX, startY }
    selectedNodeId: null,
    selectedWireId: null,
    nodeCounter: 0,
    wireCounter: 0,
    contextMenuPos: { x: 0, y: 0 },
    evalDebounceTimer: null
  };

  // DOM Elements
  const viewport = document.getElementById('viewport');
  const canvasWorld = document.getElementById('canvas-world');
  const wiresLayer = document.getElementById('wires-layer');
  const draftWirePath = document.getElementById('draft-wire');
  const nodesLayer = document.getElementById('nodes-layer');
  const contextMenu = document.getElementById('context-menu');
  const toastContainer = document.getElementById('toast-container');

  // =========================================================================
  // UTILITY HELPERS
  // =========================================================================

  function showToast(msg, duration = 3000) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span>▸</span> <span>${msg}</span>`;
    toastContainer.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.3s ease';
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  function screenToWorld(sx, sy) {
    const rect = viewport.getBoundingClientRect();
    return {
      x: (sx - rect.left - state.pan.x) / state.scale,
      y: (sy - rect.top - state.pan.y) / state.scale
    };
  }

  function updateWorldTransform() {
    canvasWorld.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.scale})`;
    viewport.style.backgroundPosition = `${state.pan.x}px ${state.pan.y}px`;
    viewport.style.backgroundSize = `${24 * state.scale}px ${24 * state.scale}px`;
    renderAllWires();
  }

  function sanitize(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
  }

  // =========================================================================
  // WIRE & CONNECTION MANAGEMENT
  // =========================================================================

  function createBezierCurve(x1, y1, x2, y2) {
    const dx = Math.abs(x2 - x1) * 0.55;
    const cx1 = x1 + Math.max(dx, 40);
    const cy1 = y1;
    const cx2 = x2 - Math.max(dx, 40);
    const cy2 = y2;
    return `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;
  }

  function getPinWorldPos(nodeId, pinName, isOut) {
    const node = state.nodes.get(nodeId);
    if (!node || !node.element) return { x: 0, y: 0 };
    const pinEl = node.element.querySelector(`.pin-${isOut ? 'out' : 'in'}[data-pin="${pinName}"] .pin-socket`);
    if (!pinEl) {
      // Fallback
      return {
        x: isOut ? node.x + node.width : node.x,
        y: node.y + 40
      };
    }
    const pinRect = pinEl.getBoundingClientRect();
    const worldCoord = screenToWorld(pinRect.left + pinRect.width / 2, pinRect.top + pinRect.height / 2);
    return worldCoord;
  }

  function renderAllWires() {
    wiresLayer.innerHTML = '';
    state.wires.forEach(w => {
      const p1 = getPinWorldPos(w.fromNode, w.fromPin, true);
      const p2 = getPinWorldPos(w.toNode, w.toPin, false);
      const d = createBezierCurve(p1.x, p1.y, p2.x, p2.y);

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.dataset.wireId = w.id;

      // Base wire
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('class', `wire-path ${state.selectedWireId === w.id ? 'selected' : ''}`);
      path.setAttribute('d', d);

      // Wire data flow animation
      const flowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      flowPath.setAttribute('class', 'wire-flow');
      flowPath.setAttribute('d', d);

      g.appendChild(path);
      g.appendChild(flowPath);

      // Click to select or Alt-click to delete
      path.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.altKey) {
          removeWire(w.id);
          showToast('Wire disconnected');
        } else {
          state.selectedWireId = (state.selectedWireId === w.id) ? null : w.id;
          renderAllWires();
        }
      });

      wiresLayer.appendChild(g);
    });
  }

  function addWire(fromNode, fromPin, toNode, toPin) {
    if (fromNode === toNode) return; // Prevent self-loop
    // Prevent duplicate wires
    const exists = state.wires.some(w =>
      w.fromNode === fromNode && w.fromPin === fromPin && w.toNode === toNode && w.toPin === toPin
    );
    if (exists) return;

    state.wireCounter++;
    const wire = {
      id: `wire_${state.wireCounter}`,
      fromNode,
      fromPin,
      toNode,
      toPin
    };
    state.wires.push(wire);
    renderAllWires();
    saveGraphToLocalStorage();

    // Propagate data from sender to receiver
    const sender = state.nodes.get(fromNode);
    const receiver = state.nodes.get(toNode);
    if (sender && receiver && sender.data) {
      receiver.onReceiveData(sender.data);
    }
  }

  function removeWire(wireId) {
    state.wires = state.wires.filter(w => w.id !== wireId);
    if (state.selectedWireId === wireId) state.selectedWireId = null;
    renderAllWires();
    saveGraphToLocalStorage();
  }

  function propagateDataFrom(nodeId, data) {
    const outgoing = state.wires.filter(w => w.fromNode === nodeId);
    outgoing.forEach(w => {
      const target = state.nodes.get(w.toNode);
      if (target) {
        target.onReceiveData(data);
      }
    });
  }

  // =========================================================================
  // BASE NODE CLASS & TYPES
  // =========================================================================

  class BaseNode {
    constructor(id, type, title, x, y, width = 340) {
      this.id = id;
      this.type = type;
      this.title = title;
      this.x = x;
      this.y = y;
      this.width = width;
      this.data = null;
      this.element = null;
    }

    createDOM(headerExtra = '', portsHtml = '', bodyHtml = '') {
      const el = document.createElement('div');
      el.id = this.id;
      el.className = `bp-node node-type-${this.type}`;
      el.style.left = `${this.x}px`;
      el.style.top = `${this.y}px`;
      el.style.width = `${this.width}px`;

      el.innerHTML = `
        <div class="node-header">
          <div class="node-title-group">
            <span class="node-title">${this.title}</span>
            <span class="node-type-badge">${this.type.toUpperCase()}</span>
            ${headerExtra}
          </div>
          <button class="btn-node-close" title="Delete node">&times;</button>
        </div>
        ${portsHtml ? `<div class="node-ports-bar">${portsHtml}</div>` : ''}
        <div class="node-body">${bodyHtml}</div>
      `;

      this.element = el;
      this.bindDragEvents();

      // Close button
      el.querySelector('.btn-node-close').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteNode(this.id);
      });

      // Pin socket events
      el.querySelectorAll('.pin-out').forEach(pin => {
        pin.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          startWireDraft(this.id, pin.dataset.pin, e);
        });
      });

      el.querySelectorAll('.pin-in').forEach(pin => {
        pin.addEventListener('mouseup', (e) => {
          e.stopPropagation();
          completeWireDraft(this.id, pin.dataset.pin);
        });
      });

      return el;
    }

    bindDragEvents() {
      const header = this.element.querySelector('.node-header');
      let startX = 0, startY = 0;
      let initialNodeX = 0, initialNodeY = 0;
      let isDragging = false;

      header.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('btn-node-close')) return;
        e.stopPropagation();
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialNodeX = this.x;
        initialNodeY = this.y;

        state.selectedNodeId = this.id;
        document.querySelectorAll('.bp-node').forEach(n => n.classList.remove('selected'));
        this.element.classList.add('selected');

        const onMouseMove = (ev) => {
          if (!isDragging) return;
          const dx = (ev.clientX - startX) / state.scale;
          const dy = (ev.clientY - startY) / state.scale;
          this.x = Math.round(initialNodeX + dx);
          this.y = Math.round(initialNodeY + dy);
          this.element.style.left = `${this.x}px`;
          this.element.style.top = `${this.y}px`;
          renderAllWires();
        };

        const onMouseUp = () => {
          isDragging = false;
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
          saveGraphToLocalStorage();
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });
    }

    onReceiveData(data) {
      this.data = data;
    }

    onDestroy() {}
  }

  // -------------------------------------------------------------------------
  // NODE 1: VARIABLE / PARAMETER
  // -------------------------------------------------------------------------

  class VariableNode extends BaseNode {
    constructor(id, x, y, initialParams = {}) {
      super(id, 'variable', 'ENV VARIABLES // FEED', x, y, 320);
      this.params = Object.assign({
        o2_percent: 21.0,
        pressure_atm: 1.0,
        flow_velocity_cms: 10.0,
        fuel: 'pmma',
        h2_conc_pct: 0.0,
        cabin_volume_m3: 28.0
      }, initialParams);
      this.init();
    }

    init() {
      const portsHtml = `
        <div class="pin pin-out" data-pin="out">
          <span>OUT (Eval Stream)</span>
          <div class="pin-socket"></div>
        </div>
      `;

      const bodyHtml = `
        <div class="form-row">
          <div class="form-label-row">
            <span>Oxygen Concentration [O₂]</span>
            <span class="form-val-display" id="${this.id}-o2-disp">${this.params.o2_percent.toFixed(1)}%</span>
          </div>
          <div class="input-slider-row">
            <input type="range" id="${this.id}-o2-range" min="10" max="100" step="0.5" value="${this.params.o2_percent}">
            <input type="number" id="${this.id}-o2-num" class="input-num-sm" min="10" max="100" step="0.5" value="${this.params.o2_percent}">
          </div>
        </div>

        <div class="form-row">
          <div class="form-label-row">
            <span>Cabin Pressure [P]</span>
            <span class="form-val-display" id="${this.id}-p-disp">${this.params.pressure_atm.toFixed(2)} atm</span>
          </div>
          <div class="input-slider-row">
            <input type="range" id="${this.id}-p-range" min="0.3" max="2.0" step="0.05" value="${this.params.pressure_atm}">
            <input type="number" id="${this.id}-p-num" class="input-num-sm" min="0.3" max="2.0" step="0.05" value="${this.params.pressure_atm}">
          </div>
        </div>

        <div class="form-row">
          <div class="form-label-row">
            <span>ECLSS Ventilation Flow [V_g]</span>
            <span class="form-val-display" id="${this.id}-v-disp">${this.params.flow_velocity_cms.toFixed(1)} cm/s</span>
          </div>
          <div class="input-slider-row">
            <input type="range" id="${this.id}-v-range" min="0" max="70" step="0.5" value="${this.params.flow_velocity_cms}">
            <input type="number" id="${this.id}-v-num" class="input-num-sm" min="0" max="70" step="0.5" value="${this.params.flow_velocity_cms}">
          </div>
        </div>

        <div class="form-row">
          <div class="form-label-row">
            <span>Fuel / Hazard Source</span>
          </div>
          <select id="${this.id}-fuel-select">
            <option value="pmma" ${this.params.fuel === 'pmma' ? 'selected' : ''}>PMMA Solid (Standard Panel)</option>
            <option value="sibal" ${this.params.fuel === 'sibal' ? 'selected' : ''}>SIBAL Fabric (Saffire)</option>
            <option value="n-heptane" ${this.params.fuel === 'n-heptane' ? 'selected' : ''}>n-Heptane Droplet (FLEX)</option>
            <option value="h2" ${this.params.fuel === 'h2' ? 'selected' : ''}>Hydrogen (H₂) Gas Leak</option>
            <option value="methane" ${this.params.fuel === 'methane' ? 'selected' : ''}>Methane (CH₄) Gas Leak</option>
          </select>
        </div>

        <div class="form-row" id="${this.id}-gas-row" style="display: ${['h2', 'methane'].includes(this.params.fuel) ? 'flex' : 'none'};">
          <div class="form-label-row">
            <span>Flammable Gas Leak [Vol %]</span>
            <span class="form-val-display" id="${this.id}-gas-disp">${this.params.h2_conc_pct.toFixed(1)}%</span>
          </div>
          <div class="input-slider-row">
            <input type="range" id="${this.id}-gas-range" min="0" max="15" step="0.5" value="${this.params.h2_conc_pct}">
            <input type="number" id="${this.id}-gas-num" class="input-num-sm" min="0" max="15" step="0.5" value="${this.params.h2_conc_pct}">
          </div>
        </div>

        <div class="form-row">
          <div class="form-label-row">
            <span>Compartment Volume [V_cabin]</span>
          </div>
          <select id="${this.id}-vol-select">
            <option value="15" ${this.params.cabin_volume_m3 === 15 ? 'selected' : ''}>15 m³ (Crew Capsule)</option>
            <option value="28" ${this.params.cabin_volume_m3 === 28 ? 'selected' : ''}>28 m³ (Cygnus Cargo Module)</option>
            <option value="106" ${this.params.cabin_volume_m3 === 106 ? 'selected' : ''}>106 m³ (ISS Destiny Lab)</option>
          </select>
        </div>
      `;

      this.createDOM('', portsHtml, bodyHtml);
      this.bindInputs();
      this.evaluate();
    }

    bindInputs() {
      const syncInput = (rangeId, numId, dispId, unit, paramKey, isFloat = true) => {
        const rEl = this.element.querySelector(`#${rangeId}`);
        const nEl = this.element.querySelector(`#${numId}`);
        const dEl = this.element.querySelector(`#${dispId}`);

        const updateVal = (val) => {
          const num = isFloat ? parseFloat(val) : parseInt(val, 10);
          this.params[paramKey] = num;
          rEl.value = num;
          nEl.value = num;
          dEl.textContent = `${num.toFixed(isFloat ? (paramKey === 'pressure_atm' ? 2 : 1) : 0)}${unit}`;
          this.queueEvaluate();
        };

        rEl.addEventListener('input', () => updateVal(rEl.value));
        nEl.addEventListener('change', () => updateVal(nEl.value));
      };

      syncInput(`${this.id}-o2-range`, `${this.id}-o2-num`, `${this.id}-o2-disp`, '%', 'o2_percent');
      syncInput(`${this.id}-p-range`, `${this.id}-p-num`, `${this.id}-p-disp`, ' atm', 'pressure_atm');
      syncInput(`${this.id}-v-range`, `${this.id}-v-num`, `${this.id}-v-disp`, ' cm/s', 'flow_velocity_cms');
      syncInput(`${this.id}-gas-range`, `${this.id}-gas-num`, `${this.id}-gas-disp`, '%', 'h2_conc_pct');

      const fuelSel = this.element.querySelector(`#${this.id}-fuel-select`);
      fuelSel.addEventListener('change', () => {
        this.params.fuel = fuelSel.value;
        const isGas = ['h2', 'methane'].includes(this.params.fuel);
        this.element.querySelector(`#${this.id}-gas-row`).style.display = isGas ? 'flex' : 'none';
        if (isGas && this.params.h2_conc_pct === 0) {
          this.params.h2_conc_pct = (this.params.fuel === 'h2') ? 6.5 : 5.5;
          this.element.querySelector(`#${this.id}-gas-range`).value = this.params.h2_conc_pct;
          this.element.querySelector(`#${this.id}-gas-num`).value = this.params.h2_conc_pct;
          this.element.querySelector(`#${this.id}-gas-disp`).textContent = `${this.params.h2_conc_pct.toFixed(1)}%`;
        }
        this.queueEvaluate();
      });

      const volSel = this.element.querySelector(`#${this.id}-vol-select`);
      volSel.addEventListener('change', () => {
        this.params.cabin_volume_m3 = parseFloat(volSel.value);
        this.queueEvaluate();
      });
    }

    setParams(newParams) {
      Object.assign(this.params, newParams);
      // Update UI elements
      const updateField = (id, val, fmt) => {
        const elR = this.element.querySelector(`#${this.id}-${id}-range`);
        const elN = this.element.querySelector(`#${this.id}-${id}-num`);
        const elD = this.element.querySelector(`#${this.id}-${id}-disp`);
        if (elR) elR.value = val;
        if (elN) elN.value = val;
        if (elD) elD.textContent = fmt;
      };

      updateField('o2', this.params.o2_percent, `${this.params.o2_percent.toFixed(1)}%`);
      updateField('p', this.params.pressure_atm, `${this.params.pressure_atm.toFixed(2)} atm`);
      updateField('v', this.params.flow_velocity_cms, `${this.params.flow_velocity_cms.toFixed(1)} cm/s`);
      updateField('gas', this.params.h2_conc_pct || 0, `${(this.params.h2_conc_pct || 0).toFixed(1)}%`);

      const fuelSel = this.element.querySelector(`#${this.id}-fuel-select`);
      if (fuelSel) fuelSel.value = this.params.fuel;

      const isGas = ['h2', 'methane'].includes(this.params.fuel);
      const gasRow = this.element.querySelector(`#${this.id}-gas-row`);
      if (gasRow) gasRow.style.display = isGas ? 'flex' : 'none';

      const volSel = this.element.querySelector(`#${this.id}-vol-select`);
      if (volSel) volSel.value = this.params.cabin_volume_m3;

      this.queueEvaluate();
    }

    queueEvaluate() {
      if (state.evalDebounceTimer) clearTimeout(state.evalDebounceTimer);
      state.evalDebounceTimer = setTimeout(() => {
        this.evaluate();
      }, 60);
    }

    async evaluate() {
      try {
        const res = await fetch(API_EVAL_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.params)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // Pack params + evaluation + benchmark
        this.data = {
          params: Object.assign({}, this.params),
          evaluation: data.evaluation,
          nearest_benchmark: data.nearest_benchmark
        };

        propagateDataFrom(this.id, this.data);
        saveGraphToLocalStorage();
      } catch (err) {
        console.error('[VariableNode] Eval error:', err);
      }
    }
  }

  // -------------------------------------------------------------------------
  // NODE 2: SIM (Spacecraft Cutaway & Verdict)
  // -------------------------------------------------------------------------

  class SimNode extends BaseNode {
    constructor(id, x, y) {
      super(id, 'sim', 'SIM // SPACECRAFT CUTAWAY', x, y, 440);
      this.animFrameId = null;
      this.particles = [];
      this.sootParticles = [];
      this.flamePulse = 0;
      this.blastWaveRadius = 0;
      this.stars = [];
      this.init();
    }

    init() {
      const portsHtml = `
        <div class="pin pin-in" data-pin="in">
          <div class="pin-socket"></div>
          <span>IN (Eval Stream)</span>
        </div>
        <div class="pin pin-out" data-pin="out">
          <span>OUT (Telemetry)</span>
          <div class="pin-socket"></div>
        </div>
      `;

      const bodyHtml = `
        <div class="cutaway-canvas-container">
          <canvas id="${this.id}-canvas" width="416" height="220"></canvas>
          <div class="sim-hud-overlay">
            <div class="hud-pill" id="${this.id}-hud-regime">REGIME: <b>INIT</b></div>
            <div class="hud-pill" id="${this.id}-hud-flux">HEAT FLUX: <b>0.0 kW/m²</b></div>
          </div>
        </div>

        <div class="verdict-box">
          <div class="verdict-header-row">
            <span class="flight-status-badge status-go" id="${this.id}-status-badge">FLIGHT STATUS: GO</span>
            <span style="font-family: var(--font-mono); font-size: 10px; color: var(--text-muted);" id="${this.id}-analog-tag">NASA ANALOG</span>
          </div>

          <div class="metrics-row">
            <div class="metric-cell">
              <div class="metric-label">FIRE RISK</div>
              <div class="metric-val" id="${this.id}-fire-risk">4.0%</div>
            </div>
            <div class="metric-cell">
              <div class="metric-label">EXPLOSION RISK</div>
              <div class="metric-val" id="${this.id}-expl-risk">0.0%</div>
            </div>
            <div class="metric-cell">
              <div class="metric-label">OUTSIDE BREACH</div>
              <div class="metric-val" id="${this.id}-breach-risk">NO</div>
            </div>
          </div>

          <div style="font-size: 10px; font-family: var(--font-mono); color: var(--text-muted); text-transform: uppercase;">Objective Engineering Reasons</div>
          <ul class="objective-reasons-list" id="${this.id}-reasons-list">
            <li>Awaiting physical telemetry stream...</li>
          </ul>

          <div class="benchmark-card" id="${this.id}-benchmark-card">
            <div class="bench-header">
              <span>NEAREST NASA BENCHMARK:</span>
              <span id="${this.id}-bench-match">100.0% MATCH</span>
            </div>
            <div style="font-size: 11px; font-weight: 600; color: #FFFFFF;" id="${this.id}-bench-name">PSI-117 (FLEX Cool Flames CFD)</div>
            <div>
              <a href="#" target="_blank" rel="noopener noreferrer" class="bench-link" id="${this.id}-bench-link">
                View Official Investigation Telemetry ↗
              </a>
            </div>
          </div>
        </div>
      `;

      this.createDOM('', portsHtml, bodyHtml);
      this.initParticles();
      this.startCanvasAnimation();
    }

    initParticles() {
      // Background stars
      this.stars = [];
      for (let i = 0; i < 40; i++) {
        this.stars.push({
          x: Math.random() * 416,
          y: Math.random() * 220,
          size: Math.random() * 1.5 + 0.5,
          alpha: Math.random() * 0.7 + 0.3
        });
      }

      // Airflow stream particles
      this.particles = [];
      for (let i = 0; i < 24; i++) {
        this.particles.push({
          x: 100 + Math.random() * 210,
          y: 40 + Math.random() * 140,
          speed: Math.random() * 0.8 + 0.4,
          alpha: Math.random() * 0.5 + 0.2
        });
      }

      this.sootParticles = [];
    }

    startCanvasAnimation() {
      const canvas = this.element.querySelector(`#${this.id}-canvas`);
      if (!canvas) return;
      const ctx = canvas.getContext('2d');

      const render = () => {
        this.drawScene(ctx, canvas.width, canvas.height);
        this.animFrameId = requestAnimationFrame(render);
      };
      this.animFrameId = requestAnimationFrame(render);
    }

    drawScene(ctx, w, h) {
      ctx.clearRect(0, 0, w, h);

      // 1. Deep Space Vacuum Background
      const spaceGrad = ctx.createLinearGradient(0, 0, 0, h);
      spaceGrad.addColorStop(0, '#030509');
      spaceGrad.addColorStop(1, '#070C18');
      ctx.fillStyle = spaceGrad;
      ctx.fillRect(0, 0, w, h);

      // Stars
      ctx.fillStyle = '#FFFFFF';
      this.stars.forEach(st => {
        ctx.globalAlpha = st.alpha * (0.8 + Math.sin(Date.now() * 0.003 + st.x) * 0.2);
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1.0;

      // Extract telemetry
      const evalData = this.data ? this.data.evaluation : null;
      const params = this.data ? this.data.params : { flow_velocity_cms: 10, o2_percent: 21 };
      const simTel = evalData ? (evalData.sim_telemetry || {}) : {};

      const vg = parseFloat(params.flow_velocity_cms || 10.0);
      const mode = simTel.flame_color_mode || 'sooty_yellow';
      const breach = evalData ? evalData.breach_outside_risk : false;
      const heatFlux = parseFloat(simTel.hull_heat_flux_kw_m2 || 0.5);
      const fingering = parseFloat(simTel.fingering_instability || 0.1);

      // 2. Spacecraft Hull Outer Geometry (Cylindrical Module Cutaway)
      const cabinX = 85;
      const cabinY = 30;
      const cabinW = 246;
      const cabinH = 160;
      const radius = 24;

      // Thermal hull wall radiation glow (outside wall heat flux)
      if (heatFlux > 1.0) {
        ctx.save();
        const glowRad = Math.min(60, heatFlux * 0.35);
        const hullGlow = ctx.createRadialGradient(cabinX + cabinW, cabinY + 80, 5, cabinX + cabinW, cabinY + 80, glowRad + 20);
        hullGlow.addColorStop(0, `rgba(255, 60, 30, ${Math.min(0.85, heatFlux * 0.015)})`);
        hullGlow.addColorStop(1, 'rgba(255, 40, 10, 0)');
        ctx.fillStyle = hullGlow;
        ctx.beginPath();
        ctx.arc(cabinX + cabinW, cabinY + 80, glowRad + 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Outer Structural Shell (Titanium & insulation blankets)
      ctx.save();
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#1E293B';
      ctx.fillStyle = '#0B111E';
      ctx.beginPath();
      ctx.roundRect(cabinX, cabinY, cabinW, cabinH, radius);
      ctx.fill();
      ctx.stroke();

      // Inner Pressure Bulkhead Line
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#334155';
      ctx.stroke();
      ctx.restore();

      // Atmospheric Cabin Interior (Air volume)
      ctx.save();
      const cabinGrad = ctx.createLinearGradient(cabinX, cabinY, cabinX, cabinY + cabinH);
      cabinGrad.addColorStop(0, '#0B1324');
      cabinGrad.addColorStop(1, '#080E1B');
      ctx.fillStyle = cabinGrad;
      ctx.beginPath();
      ctx.roundRect(cabinX + 6, cabinY + 6, cabinW - 12, cabinH - 12, radius - 4);
      ctx.fill();
      ctx.restore();

      // ECLSS Ventilation Ducts & Grilles (Top & Bottom)
      ctx.fillStyle = '#172033';
      ctx.fillRect(cabinX + 20, cabinY + 8, cabinW - 40, 6); // Top duct
      ctx.fillRect(cabinX + 20, cabinY + cabinH - 14, cabinW - 40, 6); // Bottom duct

      // Duct grille slots
      ctx.fillStyle = 'rgba(0, 229, 255, 0.4)';
      for (let gx = cabinX + 28; gx < cabinX + cabinW - 30; gx += 16) {
        ctx.fillRect(gx, cabinY + 8, 4, 6);
        ctx.fillRect(gx, cabinY + cabinH - 14, 4, 6);
      }

      // 3. Airflow Streamlines & Particles (speed proportional to V_g)
      const flowSpeedFactor = Math.max(0.1, vg * 0.12);
      ctx.fillStyle = 'rgba(0, 229, 255, 0.6)';
      this.particles.forEach(p => {
        p.x += p.speed * flowSpeedFactor;
        if (p.x > cabinX + cabinW - 15) {
          p.x = cabinX + 12;
          p.y = cabinY + 25 + Math.random() * (cabinH - 50);
        }
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
        ctx.fill();

        // Particle trail
        if (vg > 2.0) {
          ctx.strokeStyle = 'rgba(0, 229, 255, 0.25)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - Math.min(18, vg * 0.4), p.y);
          ctx.stroke();
        }
      });
      ctx.globalAlpha = 1.0;

      // Equipment Rack / Sample Stand
      const rackX = cabinX + 65;
      const rackY = cabinY + 95;
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(rackX - 12, rackY + 15, 24, 28);
      ctx.fillStyle = '#334155';
      ctx.fillRect(rackX - 16, rackY + 12, 32, 4);

      // Flame Center Point
      const flameX = rackX;
      const flameY = rackY + 10;
      this.flamePulse += 0.05;

      // 4. Dynamic Combustion Modes
      if (mode === 'extinguished') {
        // Glowing ember bed, zero flame
        ctx.fillStyle = '#C2410C';
        ctx.beginPath();
        ctx.arc(flameX, flameY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(234, 88, 12, 0.3)';
        ctx.beginPath();
        ctx.arc(flameX, flameY, 8 + Math.sin(this.flamePulse) * 1.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (mode === 'cool_flame') {
        // Low-temperature NTC blue spherical glow (PSI-117)
        const coolRadius = 18 + Math.sin(this.flamePulse * 1.8) * 3;
        const coolGrad = ctx.createRadialGradient(flameX, flameY, 2, flameX, flameY, coolRadius);
        coolGrad.addColorStop(0, 'rgba(180, 240, 255, 0.9)');
        coolGrad.addColorStop(0.35, 'rgba(56, 189, 248, 0.7)');
        coolGrad.addColorStop(0.7, 'rgba(3, 105, 161, 0.35)');
        coolGrad.addColorStop(1, 'rgba(3, 105, 161, 0)');

        ctx.fillStyle = coolGrad;
        ctx.beginPath();
        ctx.arc(flameX, flameY, coolRadius, 0, Math.PI * 2);
        ctx.fill();
      } else if (mode === 'explosion_flash') {
        // Deflagration / detonation shockwave flash
        this.blastWaveRadius = (this.blastWaveRadius + 3.5) % 110;
        ctx.save();
        ctx.strokeStyle = `rgba(255, 255, 255, ${Math.max(0, 1 - this.blastWaveRadius / 110)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(flameX, flameY, this.blastWaveRadius, 0, Math.PI * 2);
        ctx.stroke();

        const blastGrad = ctx.createRadialGradient(flameX, flameY, 5, flameX, flameY, 65);
        blastGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        blastGrad.addColorStop(0.4, 'rgba(255, 170, 0, 0.7)');
        blastGrad.addColorStop(0.8, 'rgba(255, 42, 84, 0.4)');
        blastGrad.addColorStop(1, 'rgba(255, 42, 84, 0)');
        ctx.fillStyle = blastGrad;
        ctx.beginPath();
        ctx.arc(flameX, flameY, 65, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        // mode === 'sooty_yellow' (Normal / Hot Flame with deflection & fingering)
        const tiltX = Math.min(26, vg * 0.45);
        const flicker = Math.sin(this.flamePulse * 4) * 2.5;

        // Outer Flame Envelope
        ctx.save();
        const flameGrad = ctx.createRadialGradient(flameX + tiltX * 0.4, flameY - 14 + flicker, 2, flameX + tiltX * 0.5, flameY - 12, 28);
        flameGrad.addColorStop(0, '#FEF08A');
        flameGrad.addColorStop(0.35, '#F59E0B');
        flameGrad.addColorStop(0.7, '#DC2626');
        flameGrad.addColorStop(1, 'rgba(220, 38, 38, 0)');

        ctx.fillStyle = flameGrad;
        ctx.beginPath();
        ctx.moveTo(flameX - 8, flameY);
        // Cellular fingering instability waves
        const fingerAmp = fingering * 6;
        ctx.bezierCurveTo(
          flameX - 12 - fingerAmp, flameY - 18,
          flameX + tiltX - 6, flameY - 32 + flicker,
          flameX + tiltX, flameY - 38 + flicker
        );
        ctx.bezierCurveTo(
          flameX + tiltX + 8, flameY - 30 + flicker,
          flameX + tiltX + 12 + fingerAmp, flameY - 16,
          flameX + 8, flameY
        );
        ctx.closePath();
        ctx.fill();

        // Blue base flame (reaction zone)
        ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
        ctx.beginPath();
        ctx.arc(flameX, flameY + 1, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Soot emissions
        if (Math.random() < 0.35) {
          this.sootParticles.push({
            x: flameX + tiltX,
            y: flameY - 36 + flicker,
            vx: (vg * 0.08) + (Math.random() * 0.4 - 0.2),
            vy: -Math.random() * 0.8 - 0.3,
            life: 1.0,
            size: Math.random() * 3 + 1.5
          });
        }
      }

      // Update and draw soot particles
      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      for (let i = this.sootParticles.length - 1; i >= 0; i--) {
        const sp = this.sootParticles[i];
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.life -= 0.02;
        if (sp.life <= 0 || sp.x > cabinX + cabinW - 10) {
          this.sootParticles.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = sp.life * 0.75;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;

      // 5. Exterior Spacecraft Hull Breach (Inside -> Outside Blowout into Vacuum)
      if (breach) {
        ctx.save();
        const breachX = cabinX + cabinW;
        const breachY = cabinY + 75;

        // Ruptured Hull Hole
        ctx.fillStyle = '#05070B';
        ctx.beginPath();
        ctx.ellipse(breachX, breachY, 6, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#EF4444';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Venting Gas & Fire Jet into Vacuum
        const jetGrad = ctx.createLinearGradient(breachX, breachY, breachX + 65, breachY);
        jetGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        jetGrad.addColorStop(0.3, 'rgba(255, 170, 0, 0.85)');
        jetGrad.addColorStop(0.7, 'rgba(255, 42, 84, 0.6)');
        jetGrad.addColorStop(1, 'rgba(255, 42, 84, 0)');

        ctx.fillStyle = jetGrad;
        ctx.beginPath();
        ctx.moveTo(breachX, breachY - 14);
        ctx.lineTo(breachX + 65, breachY - 32);
        ctx.lineTo(breachX + 75, breachY);
        ctx.lineTo(breachX + 65, breachY + 32);
        ctx.lineTo(breachX, breachY + 14);
        ctx.closePath();
        ctx.fill();

        // Vacuum jet sparks
        ctx.fillStyle = '#FEF08A';
        for (let s = 0; s < 6; s++) {
          ctx.beginPath();
          ctx.arc(breachX + 20 + Math.random() * 50, breachY + (Math.random() * 40 - 20), 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Module Observation Window
      ctx.save();
      const winX = cabinX + 30;
      const winY = cabinY + 35;
      ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(winX, winY, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    onReceiveData(data) {
      super.onReceiveData(data);
      this.updateHUDAndVerdict();
      propagateDataFrom(this.id, data);
    }

    updateHUDAndVerdict() {
      if (!this.data || !this.data.evaluation) return;
      const evalData = this.data.evaluation;
      const simTel = evalData.sim_telemetry || {};
      const analog = evalData.historical_analog || {};
      const bench = this.data.nearest_benchmark || {};

      // 1. HUD Overlay
      const hudRegime = this.element.querySelector(`#${this.id}-hud-regime`);
      const hudFlux = this.element.querySelector(`#${this.id}-hud-flux`);
      if (hudRegime) hudRegime.innerHTML = `REGIME: <b>${(simTel.flame_color_mode || 'INIT').toUpperCase()}</b>`;
      if (hudFlux) hudFlux.innerHTML = `HEAT FLUX: <b>${(simTel.hull_heat_flux_kw_m2 || 0).toFixed(1)} kW/m²</b>`;

      // 2. Flight Status Badge
      const statusBadge = this.element.querySelector(`#${this.id}-status-badge`);
      const status = evalData.flight_status || 'GO';
      if (statusBadge) {
        statusBadge.textContent = `FLIGHT STATUS: ${status}`;
        statusBadge.className = `flight-status-badge status-${status.toLowerCase().replace(/[^a-z]/g, '')}`;
      }

      // 3. Metrics
      const fRisk = this.element.querySelector(`#${this.id}-fire-risk`);
      const eRisk = this.element.querySelector(`#${this.id}-expl-risk`);
      const bRisk = this.element.querySelector(`#${this.id}-breach-risk`);

      if (fRisk) fRisk.textContent = `${(evalData.fire_risk_pct || 0).toFixed(1)}%`;
      if (eRisk) eRisk.textContent = `${(evalData.explosion_risk_pct || 0).toFixed(1)}%`;
      if (bRisk) {
        bRisk.textContent = evalData.breach_outside_risk ? 'YES (CRITICAL)' : 'NO';
        bRisk.style.color = evalData.breach_outside_risk ? 'var(--color-nogo)' : 'var(--color-go)';
      }

      // 4. Objective reasons
      const reasonsList = this.element.querySelector(`#${this.id}-reasons-list`);
      if (reasonsList && Array.isArray(evalData.objective_reasons)) {
        reasonsList.innerHTML = evalData.objective_reasons
          .map(r => `<li>${sanitize(r)}</li>`)
          .join('');
      }

      // 5. Analog & Benchmark
      const analogTag = this.element.querySelector(`#${this.id}-analog-tag`);
      if (analogTag && analog.name) {
        analogTag.textContent = `${analog.name.slice(0, 24)}... (${analog.similarity_pct}%)`;
      }

      const bMatch = this.element.querySelector(`#${this.id}-bench-match`);
      const bName = this.element.querySelector(`#${this.id}-bench-name`);
      const bLink = this.element.querySelector(`#${this.id}-bench-link`);

      if (bMatch) bMatch.textContent = `${(bench.match_pct || 100).toFixed(1)}% MATCH`;
      if (bName) bName.textContent = `${bench.benchmark_id || ''} ${bench.investigation || 'NASA PSI'}`;
      if (bLink && bench.url) {
        bLink.href = bench.url;
        bLink.textContent = `View NASA PSI Investigation (${bench.benchmark_id || 'Direct Repo'}) ↗`;
      }
    }

    onDestroy() {
      if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    }
  }

  // -------------------------------------------------------------------------
  // NODE 3: GRAPH (Time Telemetry Curve)
  // -------------------------------------------------------------------------

  class GraphNode extends BaseNode {
    constructor(id, x, y) {
      super(id, 'graph', 'GRAPH // TIME TELEMETRY (0–600s)', x, y, 420);
      this.selectedChannel = 'spread'; // 'spread', 'temp', 'pressure', 'co'
      this.init();
    }

    init() {
      const portsHtml = `
        <div class="pin pin-in" data-pin="in">
          <div class="pin-socket"></div>
          <span>IN (Eval Stream)</span>
        </div>
        <div class="pin pin-out" data-pin="out">
          <span>OUT (Series)</span>
          <div class="pin-socket"></div>
        </div>
      `;

      const bodyHtml = `
        <div class="graph-controls-row">
          <select id="${this.id}-channel-select">
            <option value="spread">Flame Front Spread L(t) [cm]</option>
            <option value="temp">Cabin Temperature T(t) [°C]</option>
            <option value="pressure">Cabin Pressure P(t) [kPa] (Proof 45 kPa)</option>
            <option value="co" selected>Toxic CO Level [ppm] (NASA SMAC 55 ppm)</option>
          </select>
        </div>

        <div class="graph-canvas-container">
          <canvas id="${this.id}-graph-canvas" width="396" height="198"></canvas>
          <div class="graph-tooltip" id="${this.id}-tooltip"></div>
        </div>
      `;

      this.createDOM('', portsHtml, bodyHtml);
      this.bindGraphEvents();
      this.renderGraph();
    }

    bindGraphEvents() {
      const select = this.element.querySelector(`#${this.id}-channel-select`);
      select.addEventListener('change', () => {
        this.selectedChannel = select.value;
        this.renderGraph();
      });

      const canvas = this.element.querySelector(`#${this.id}-graph-canvas`);
      const tooltip = this.element.querySelector(`#${this.id}-tooltip`);

      canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        this.handleGraphHover(mx, tooltip, canvas.width, canvas.height);
      });

      canvas.addEventListener('mouseleave', () => {
        tooltip.style.display = 'none';
        this.renderGraph();
      });
    }

    onReceiveData(data) {
      super.onReceiveData(data);
      this.renderGraph();
      propagateDataFrom(this.id, data);
    }

    renderGraph(hoverTime = null) {
      const canvas = this.element.querySelector(`#${this.id}-graph-canvas`);
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      // Background
      ctx.fillStyle = '#050811';
      ctx.fillRect(0, 0, w, h);

      // Grid margins
      const padLeft = 38;
      const padRight = 14;
      const padTop = 18;
      const padBottom = 24;
      const plotW = w - padLeft - padRight;
      const plotH = h - padTop - padBottom;

      // Extract time_series
      const evalData = this.data ? this.data.evaluation : null;
      const series = (evalData && evalData.time_series) ? evalData.time_series : null;

      const tSec = (series && series.t_sec) ? series.t_sec : [0, 100, 200, 300, 400, 500, 600];
      let yValues = [];
      let yUnit = '';
      let thresholdVal = null;
      let thresholdLabel = '';
      let strokeColor = '#38BDF8';

      if (this.selectedChannel === 'spread') {
        yValues = (series && series.front_cm) ? series.front_cm : [0, 2, 4, 6, 8, 10, 12];
        yUnit = 'cm';
        strokeColor = '#10B981';
      } else if (this.selectedChannel === 'temp') {
        yValues = (series && series.cabin_temp_c) ? series.cabin_temp_c : [25, 28, 32, 38, 45, 52, 60];
        yUnit = '°C';
        strokeColor = '#F59E0B';
      } else if (this.selectedChannel === 'pressure') {
        yValues = (series && series.cabin_pressure_kpa) ? series.cabin_pressure_kpa : [101, 101, 102, 102, 103, 104, 104];
        yUnit = 'kPa';
        thresholdVal = 146.0; // 101 + 45 kPa limit
        thresholdLabel = 'HULL PROOF LIMIT';
        strokeColor = '#EF4444';
      } else { // 'co'
        yValues = (series && series.co_ppm) ? series.co_ppm : [5, 12, 22, 34, 48, 62, 75];
        yUnit = 'ppm';
        thresholdVal = 55.0; // NASA SMAC 1-hr threshold
        thresholdLabel = 'NASA SMAC LIMIT (55 ppm)';
        strokeColor = '#A855F7';
      }

      const maxYData = Math.max(...yValues, thresholdVal || 1);
      const minYData = Math.min(...yValues, 0);
      const yMax = Math.max(maxYData * 1.15, 1.0);
      const yMin = Math.min(minYData, 0);

      // Grid lines
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fillStyle = '#64748B';
      ctx.font = '9px "JetBrains Mono"';

      // 4 horizontal gridlines
      for (let i = 0; i <= 4; i++) {
        const gy = padTop + (plotH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padLeft, gy);
        ctx.lineTo(w - padRight, gy);
        ctx.stroke();

        const val = yMax - ((yMax - yMin) / 4) * i;
        ctx.textAlign = 'right';
        ctx.fillText(val.toFixed(val >= 100 ? 0 : 1), padLeft - 6, gy + 3);
      }

      // Vertical time gridlines
      for (let s = 0; s <= 600; s += 100) {
        const gx = padLeft + (s / 600) * plotW;
        ctx.beginPath();
        ctx.moveTo(gx, padTop);
        ctx.lineTo(gx, padTop + plotH);
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.fillText(`${s}s`, gx, h - 8);
      }

      // Draw Critical Safety Threshold (Dashed Line)
      if (thresholdVal !== null && thresholdVal <= yMax && thresholdVal >= yMin) {
        const ty = padTop + plotH - ((thresholdVal - yMin) / (yMax - yMin)) * plotH;
        ctx.save();
        ctx.strokeStyle = '#FF2A54';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(padLeft, ty);
        ctx.lineTo(w - padRight, ty);
        ctx.stroke();

        ctx.fillStyle = '#FF2A54';
        ctx.font = '8px "JetBrains Mono"';
        ctx.textAlign = 'right';
        ctx.fillText(thresholdLabel, w - padRight - 4, ty - 4);
        ctx.restore();
      }

      // Draw Main Curve
      if (tSec.length > 1 && yValues.length === tSec.length) {
        ctx.save();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2.0;
        ctx.beginPath();

        tSec.forEach((t, idx) => {
          const px = padLeft + (t / 600) * plotW;
          const py = padTop + plotH - ((yValues[idx] - yMin) / (yMax - yMin)) * plotH;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();

        // Area gradient fill
        const areaGrad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
        areaGrad.addColorStop(0, strokeColor + '40');
        areaGrad.addColorStop(1, strokeColor + '00');
        ctx.fillStyle = areaGrad;
        ctx.lineTo(padLeft + plotW, padTop + plotH);
        ctx.lineTo(padLeft, padTop + plotH);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // Hover Crosshair
      if (hoverTime !== null) {
        const hx = padLeft + (hoverTime / 600) * plotW;
        ctx.save();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(hx, padTop);
        ctx.lineTo(hx, padTop + plotH);
        ctx.stroke();
        ctx.restore();
      }
    }

    handleGraphHover(mx, tooltip, w, h) {
      const padLeft = 38;
      const padRight = 14;
      const plotW = w - padLeft - padRight;

      if (mx < padLeft || mx > w - padRight) {
        tooltip.style.display = 'none';
        return;
      }

      const tHover = Math.max(0, Math.min(600, ((mx - padLeft) / plotW) * 600));
      this.renderGraph(tHover);

      // Find nearest point
      const evalData = this.data ? this.data.evaluation : null;
      const series = (evalData && evalData.time_series) ? evalData.time_series : null;
      const tSec = (series && series.t_sec) ? series.t_sec : [0, 100, 200, 300, 400, 500, 600];

      let yValues = [];
      let unit = '';
      if (this.selectedChannel === 'spread') { yValues = series ? series.front_cm : []; unit = 'cm'; }
      else if (this.selectedChannel === 'temp') { yValues = series ? series.cabin_temp_c : []; unit = '°C'; }
      else if (this.selectedChannel === 'pressure') { yValues = series ? series.cabin_pressure_kpa : []; unit = 'kPa'; }
      else { yValues = series ? series.co_ppm : []; unit = 'ppm'; }

      const idx = Math.min(yValues.length - 1, Math.max(0, Math.round(tHover / 10)));
      const val = yValues[idx] !== undefined ? yValues[idx] : 0;

      tooltip.style.display = 'block';
      tooltip.style.left = `${mx + 10}px`;
      tooltip.style.top = `30px`;
      tooltip.innerHTML = `t = <b>${Math.round(tHover)} s</b> &middot; <b>${val} ${unit}</b>`;
    }
  }

  // -------------------------------------------------------------------------
  // NODE 4: PROMPT (AI Safety Engineer)
  // -------------------------------------------------------------------------

  class PromptNode extends BaseNode {
    constructor(id, x, y) {
      super(id, 'prompt', 'PROMPT // AI SAFETY OFFICER', x, y, 380);
      this.query = 'Оценить риск взрыва и пробоя гермооболочки';
      this.init();
    }

    init() {
      const portsHtml = `
        <div class="pin pin-in" data-pin="in">
          <div class="pin-socket"></div>
          <span>IN (Eval Stream)</span>
        </div>
        <div class="pin pin-out" data-pin="out">
          <span>OUT (Brief)</span>
          <div class="pin-socket"></div>
        </div>
      `;

      const bodyHtml = `
        <div class="form-row">
          <textarea class="prompt-textarea" id="${this.id}-query-text" placeholder="Enter inquiry for NASA AI Safety Officer...">${sanitize(this.query)}</textarea>
        </div>

        <div class="quick-prompts-group">
          <div class="quick-prompts-title">Quick Action Blueprints</div>
          <button class="btn-quick-prompt" data-q="Оценить риск взрыва и пробоя">⚡ Оценить риск взрыва и пробоя</button>
          <button class="btn-quick-prompt" data-q="Сравнить с тестами NASA PSI">🔬 Сравнить с тестами NASA PSI</button>
          <button class="btn-quick-prompt" data-q="План действий для ECLSS">🚨 План действий для ECLSS</button>
        </div>

        <button class="btn-execute-prompt" id="${this.id}-btn-exec">
          <span>EXECUTE PROMPT [GEMINI AI]</span>
        </button>
      `;

      this.createDOM('', portsHtml, bodyHtml);
      this.bindPromptEvents();
    }

    bindPromptEvents() {
      const textarea = this.element.querySelector(`#${this.id}-query-text`);
      textarea.addEventListener('input', () => {
        this.query = textarea.value;
      });

      this.element.querySelectorAll('.btn-quick-prompt').forEach(btn => {
        btn.addEventListener('click', () => {
          this.query = btn.dataset.q;
          textarea.value = this.query;
          this.execute();
        });
      });

      const execBtn = this.element.querySelector(`#${this.id}-btn-exec`);
      execBtn.addEventListener('click', () => this.execute());
    }

    onReceiveData(data) {
      super.onReceiveData(data);
    }

    async execute() {
      const execBtn = this.element.querySelector(`#${this.id}-btn-exec`);
      execBtn.disabled = true;
      execBtn.innerHTML = `<div class="spinner"></div> <span>ANALYZING PHYSICAL TELEMETRY...</span>`;

      try {
        const payload = {
          user_query: this.query,
          params: (this.data && this.data.params) ? this.data.params : {},
          evaluation: (this.data && this.data.evaluation) ? this.data.evaluation : null,
          nearest_benchmark: (this.data && this.data.nearest_benchmark) ? this.data.nearest_benchmark : null,
          language: 'ru'
        };

        const res = await fetch(API_PROMPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();

        showToast('AI Safety Briefing synthesized');
        this.spawnOrUpdateBriefNode(result);
      } catch (err) {
        console.error('[PromptNode] Error:', err);
        showToast('Prompt execution failed: ' + err.message);
      } finally {
        execBtn.disabled = false;
        execBtn.innerHTML = `<span>EXECUTE PROMPT [GEMINI AI]</span>`;
      }
    }

    spawnOrUpdateBriefNode(result) {
      // Check if an AI SAFETY BRIEF is already connected to OUT pin
      const connectedWire = state.wires.find(w => w.fromNode === this.id && w.fromPin === 'out');
      let briefNode = null;

      if (connectedWire) {
        briefNode = state.nodes.get(connectedWire.toNode);
      }

      if (!briefNode || briefNode.type !== 'brief') {
        // Spawn a new brief node to the right
        briefNode = spawnNode('brief', this.x + 420, this.y);
        addWire(this.id, 'out', briefNode.id, 'in');
      }

      briefNode.setBriefContent(result);
      saveGraphToLocalStorage();
    }
  }

  // -------------------------------------------------------------------------
  // NODE 5: AI SAFETY BRIEF (Result Node)
  // -------------------------------------------------------------------------

  class BriefNode extends BaseNode {
    constructor(id, x, y) {
      super(id, 'brief', 'AI SAFETY BRIEF // NASA ADVISORY', x, y, 440);
      this.init();
    }

    init() {
      const portsHtml = `
        <div class="pin pin-in" data-pin="in">
          <div class="pin-socket"></div>
          <span>IN (Prompt Output)</span>
        </div>
      `;

      const bodyHtml = `
        <div class="brief-content" id="${this.id}-content">
          <div style="color: var(--text-muted); font-style: italic;">
            Waiting for prompt execution... Output will be synthesized based on NASA PSI benchmarks and C.K. Law equations.
          </div>
        </div>
      `;

      this.createDOM('', portsHtml, bodyHtml);
    }

    setBriefContent(result) {
      const container = this.element.querySelector(`#${this.id}-content`);
      if (!container) return;

      const rawText = result.advisory_text || 'No response generated.';

      // Format markdown & tags
      let html = sanitize(rawText);

      // Replace tags
      html = html.replace(/\[VERIFIED NASA PSI DATA\]\s*(https?:\/\/[^\s<]+)/g, (match, url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="badge-nasa">✓ [VERIFIED NASA PSI DATA] ↗</a>`;
      });

      html = html.replace(/\[VERIFIED NASA PSI DATA\]/g, () => {
        return `<span class="badge-nasa">✓ [VERIFIED NASA PSI DATA]</span>`;
      });

      html = html.replace(/\[THEORETICAL EXTRAPOLATION[^\]]*\]/g, (match) => {
        return `<span class="badge-theory">⚛ ${match}</span>`;
      });

      // Headers ###
      html = html.replace(/###\s+(.+)/g, '<h3>$1</h3>');

      // Bold **text**
      html = html.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

      // Bullets - text
      html = html.replace(/^- (.+)/gm, '<li>$1</li>');
      html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');

      // Line breaks
      html = html.replace(/\n\n/g, '<br><br>');

      container.innerHTML = html;
    }
  }

  // =========================================================================
  // NODE FACTORY & LIFECYCLE
  // =========================================================================

  function spawnNode(type, x, y, initialData = {}) {
    state.nodeCounter++;
    const id = `node_${state.nodeCounter}`;
    let node = null;

    if (type === 'variable') {
      node = new VariableNode(id, x, y, initialData);
    } else if (type === 'sim') {
      node = new SimNode(id, x, y);
    } else if (type === 'graph') {
      node = new GraphNode(id, x, y);
    } else if (type === 'prompt') {
      node = new PromptNode(id, x, y);
    } else if (type === 'brief') {
      node = new BriefNode(id, x, y);
    }

    if (node) {
      state.nodes.set(id, node);
      nodesLayer.appendChild(node.element);
      renderAllWires();
      saveGraphToLocalStorage();
    }
    return node;
  }

  function deleteNode(nodeId) {
    const node = state.nodes.get(nodeId);
    if (!node) return;
    node.onDestroy();
    if (node.element) node.element.remove();

    // Remove wires associated with this node
    state.wires = state.wires.filter(w => w.fromNode !== nodeId && w.toNode !== nodeId);
    state.nodes.delete(nodeId);
    renderAllWires();
    saveGraphToLocalStorage();
    showToast(`Deleted node ${node.title}`);
  }

  // =========================================================================
  // WIRE DRAFTING (DRAG & DROP TO CONNECT)
  // =========================================================================

  function startWireDraft(fromNodeId, fromPin, e) {
    state.activeWireDraft = {
      fromNode: fromNodeId,
      fromPin: fromPin
    };
    draftWirePath.style.display = 'block';

    const onDraftMove = (ev) => {
      if (!state.activeWireDraft) return;
      const p1 = getPinWorldPos(state.activeWireDraft.fromNode, state.activeWireDraft.fromPin, true);
      const p2 = screenToWorld(ev.clientX, ev.clientY);
      draftWirePath.setAttribute('d', createBezierCurve(p1.x, p1.y, p2.x, p2.y));
    };

    const onDraftUp = () => {
      state.activeWireDraft = null;
      draftWirePath.style.display = 'none';
      window.removeEventListener('mousemove', onDraftMove);
      window.removeEventListener('mouseup', onDraftUp);
    };

    window.addEventListener('mousemove', onDraftMove);
    window.addEventListener('mouseup', onDraftUp);
  }

  function completeWireDraft(toNodeId, toPin) {
    if (!state.activeWireDraft) return;
    addWire(state.activeWireDraft.fromNode, state.activeWireDraft.fromPin, toNodeId, toPin);
    state.activeWireDraft = null;
    draftWirePath.style.display = 'none';
    showToast('Wire connected');
  }

  // =========================================================================
  // PAN & ZOOM (VIEWPORT NAVIGATION)
  // =========================================================================

  function setupViewportInteractions() {
    viewport.addEventListener('mousedown', (e) => {
      // Middle click or drag background
      if (e.target === viewport || e.target === canvasWorld || e.target.id === 'wire-canvas') {
        state.isPanning = true;
        state.panStart = { x: e.clientX - state.pan.x, y: e.clientY - state.pan.y };
        viewport.classList.add('panning');
        contextMenu.style.display = 'none';
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!state.isPanning) return;
      state.pan.x = e.clientX - state.panStart.x;
      state.pan.y = e.clientY - state.panStart.y;
      updateWorldTransform();
    });

    window.addEventListener('mouseup', () => {
      if (state.isPanning) {
        state.isPanning = false;
        viewport.classList.remove('panning');
        saveGraphToLocalStorage();
      }
    });

    // Zoom on wheel
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = 1.08;
      const rect = viewport.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const newScale = e.deltaY < 0 ? state.scale * zoomFactor : state.scale / zoomFactor;
      const clampedScale = Math.max(0.35, Math.min(2.2, newScale));

      // Zoom towards mouse pointer
      state.pan.x = mouseX - ((mouseX - state.pan.x) / state.scale) * clampedScale;
      state.pan.y = mouseY - ((mouseY - state.pan.y) / state.scale) * clampedScale;
      state.scale = clampedScale;

      updateWorldTransform();
      saveGraphToLocalStorage();
    }, { passive: false });

    // Context Menu (Right Click)
    viewport.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const worldPos = screenToWorld(e.clientX, e.clientY);
      state.contextMenuPos = worldPos;

      contextMenu.style.display = 'flex';
      contextMenu.style.left = `${e.clientX}px`;
      contextMenu.style.top = `${e.clientY}px`;
    });

    // Hide context menu on click outside
    window.addEventListener('click', () => {
      contextMenu.style.display = 'none';
    });

    // Context menu actions
    contextMenu.querySelectorAll('.context-item').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        const x = Math.round(state.contextMenuPos.x);
        const y = Math.round(state.contextMenuPos.y);

        if (action === 'spawn_variable') spawnNode('variable', x, y);
        else if (action === 'spawn_sim') spawnNode('sim', x, y);
        else if (action === 'spawn_graph') spawnNode('graph', x, y);
        else if (action === 'spawn_prompt') spawnNode('prompt', x, y);

        contextMenu.style.display = 'none';
      });
    });

    // Keyboard delete for selected wire
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.selectedWireId && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
          removeWire(state.selectedWireId);
          showToast('Wire deleted');
        }
      }
    });
  }

  // =========================================================================
  // TOP BAR CONTROLS & SCENARIOS
  // =========================================================================

  function setupTopBar() {
    // Scenario buttons
    document.querySelectorAll('.btn-scenario').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-scenario').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const scKey = btn.dataset.scenario;
        const sc = SCENARIOS[scKey];
        if (!sc) return;

        // Apply scenario to active or first Variable node
        let varNode = null;
        for (const n of state.nodes.values()) {
          if (n.type === 'variable') {
            varNode = n;
            break;
          }
        }

        if (!varNode) {
          varNode = spawnNode('variable', 80, 80, sc.params);
        } else {
          varNode.setParams(sc.params);
        }

        showToast(`Loaded scenario: ${sc.name}`);
      });
    });

    // Auto-layout
    document.getElementById('btn-autolayout').addEventListener('click', () => {
      autoLayoutGraph();
    });

    // Export JSON
    document.getElementById('btn-export-json').addEventListener('click', () => {
      exportGraphJSON();
    });

    // Import JSON
    const fileInput = document.getElementById('file-import-input');
    document.getElementById('btn-import-json').addEventListener('click', () => {
      fileInput.click();
    });
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) importGraphJSON(file);
      fileInput.value = '';
    });

    // Reset graph
    document.getElementById('btn-reset-graph').addEventListener('click', () => {
      if (confirm('Reset canvas to default starter blueprint graph?')) {
        buildDefaultGraph();
        showToast('Blueprint canvas reset to nominal state');
      }
    });
  }

  function autoLayoutGraph() {
    // Arrange: Column 1 (Variable), Column 2 (SIM, Graph), Column 3 (Prompt, Brief)
    let varY = 80;
    let midY = 80;
    let rightY = 80;

    state.nodes.forEach(node => {
      if (node.type === 'variable') {
        node.x = 80;
        node.y = varY;
        varY += 460;
      } else if (node.type === 'sim') {
        node.x = 440;
        node.y = midY;
        midY += 440;
      } else if (node.type === 'graph') {
        node.x = 440;
        node.y = midY;
        midY += 320;
      } else if (node.type === 'prompt') {
        node.x = 920;
        node.y = rightY;
        rightY += 340;
      } else if (node.type === 'brief') {
        node.x = 1340;
        node.y = 80;
      }
      if (node.element) {
        node.element.style.left = `${node.x}px`;
        node.element.style.top = `${node.y}px`;
      }
    });

    state.pan = { x: 40, y: 30 };
    state.scale = 0.88;
    updateWorldTransform();
    saveGraphToLocalStorage();
    showToast('Auto-layout arranged');
  }

  function exportGraphJSON() {
    const exportData = {
      version: '1.2.0',
      timestamp: new Date().toISOString(),
      pan: state.pan,
      scale: state.scale,
      nodes: Array.from(state.nodes.values()).map(n => ({
        id: n.id,
        type: n.type,
        x: n.x,
        y: n.y,
        params: n.params || null
      })),
      wires: state.wires
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flame-blueprint-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Blueprint exported as JSON');
  }

  function importGraphJSON(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.nodes || !data.wires) throw new Error('Invalid blueprint JSON');

        clearGraph();

        state.pan = data.pan || { x: 60, y: 40 };
        state.scale = data.scale || 0.95;

        data.nodes.forEach(n => {
          spawnNode(n.type, n.x, n.y, n.params || {});
        });

        data.wires.forEach(w => {
          addWire(w.fromNode, w.fromPin, w.toNode, w.toPin);
        });

        updateWorldTransform();
        showToast('Blueprint imported successfully');
      } catch (err) {
        alert('Failed to import JSON: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  function clearGraph() {
    state.nodes.forEach(n => n.onDestroy());
    nodesLayer.innerHTML = '';
    wiresLayer.innerHTML = '';
    state.nodes.clear();
    state.wires = [];
    state.nodeCounter = 0;
    state.wireCounter = 0;
  }

  // =========================================================================
  // STARTER GRAPH & PERSISTENCE
  // =========================================================================

  function buildDefaultGraph() {
    clearGraph();

    state.pan = { x: 40, y: 30 };
    state.scale = 0.92;

    // Node 1: Variable / Parameter
    const varNode = spawnNode('variable', 60, 60, {
      o2_percent: 21.0,
      pressure_atm: 1.0,
      flow_velocity_cms: 10.0,
      fuel: 'pmma',
      h2_conc_pct: 0.0,
      cabin_volume_m3: 28.0
    });

    // Node 2: SIM Spacecraft Cutaway
    const simNode = spawnNode('sim', 420, 60);

    // Node 3: Graph Time Telemetry
    const graphNode = spawnNode('graph', 420, 520);

    // Node 4: Prompt AI Safety Officer
    const promptNode = spawnNode('prompt', 900, 60);

    // Wires: Variable -> SIM, Graph, Prompt
    addWire(varNode.id, 'out', simNode.id, 'in');
    addWire(varNode.id, 'out', graphNode.id, 'in');
    addWire(varNode.id, 'out', promptNode.id, 'in');

    updateWorldTransform();
    saveGraphToLocalStorage();
  }

  function saveGraphToLocalStorage() {
    try {
      const data = {
        pan: state.pan,
        scale: state.scale,
        nodes: Array.from(state.nodes.values()).map(n => ({
          id: n.id,
          type: n.type,
          x: n.x,
          y: n.y,
          params: n.params || null
        })),
        wires: state.wires
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[Storage] Failed to save graph:', e);
    }
  }

  function loadGraphFromLocalStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.nodes) || data.nodes.length === 0) return false;

      clearGraph();

      state.pan = data.pan || { x: 40, y: 30 };
      state.scale = data.scale || 0.92;

      data.nodes.forEach(n => {
        spawnNode(n.type, n.x, n.y, n.params || {});
      });

      if (Array.isArray(data.wires)) {
        data.wires.forEach(w => {
          addWire(w.fromNode, w.fromPin, w.toNode, w.toPin);
        });
      }

      updateWorldTransform();
      return true;
    } catch (e) {
      console.warn('[Storage] Failed to load graph:', e);
      return false;
    }
  }

  // =========================================================================
  // BOOTSTRAP APPLICATION
  // =========================================================================

  function init() {
    setupViewportInteractions();
    setupTopBar();

    const loaded = loadGraphFromLocalStorage();
    if (!loaded) {
      buildDefaultGraph();
    } else {
      updateWorldTransform();
    }

    console.log('[FLAME BLUEPRINT] Engine active on port 5000.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
