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

  const STORAGE_KEY = 'flame_blueprint_graph_v9';
  const API_EVAL_URL = '/api/blueprint-eval';
  const API_PROMPT_URL = '/api/blueprint-prompt';
  const API_NOTE_URL = '/api/blueprint-note';

  const I18N = {
    en: {
      add_node: '+ ADD NODE ▾',
      autolayout: 'Auto-Layout',
      export: 'Export (.json)',
      import: 'Import (.json)',
      reset: 'Reset',
      cloud_online: 'CLOUD ENGINE // ONLINE',
      core_online: 'PORT 5000 // CORE ONLINE'
    }
  };

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
    evalDebounceTimer: null,
    theme: localStorage.getItem('flame_blueprint_theme') || 'dark',
    language: localStorage.getItem('flame_blueprint_lang') || 'en'
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

  // -------------------------------------------------------------------------
  // GRAPH DAG TRAVERSAL HELPERS (BRANCH ISOLATION)
  // -------------------------------------------------------------------------

  function findDownstreamNode(startNodeId, targetType, visited = new Set()) {
    if (visited.has(startNodeId)) return null;
    visited.add(startNodeId);
    const outgoing = state.wires.filter(w => w.fromNode === startNodeId);
    for (const w of outgoing) {
      const target = state.nodes.get(w.toNode);
      if (!target) continue;
      if (target.type === targetType) return target;
      const deeper = findDownstreamNode(w.toNode, targetType, visited);
      if (deeper) return deeper;
    }
    return null;
  }

  function findUpstreamNode(startNodeId, targetType, visited = new Set()) {
    if (visited.has(startNodeId)) return null;
    visited.add(startNodeId);
    const incoming = state.wires.filter(w => w.toNode === startNodeId);
    for (const w of incoming) {
      const source = state.nodes.get(w.fromNode);
      if (!source) continue;
      if (source.type === targetType) return source;
      const deeper = findUpstreamNode(w.fromNode, targetType, visited);
      if (deeper) return deeper;
    }
    return null;
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

      const fromNodeObj = state.nodes.get(w.fromNode);
      const accent = (fromNodeObj && fromNodeObj.accentColor) ? fromNodeObj.accentColor : 'default';

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.dataset.wireId = w.id;
      g.dataset.accentColor = accent;

      // Base wire
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('class', `wire-path ${state.selectedWireId === w.id ? 'selected' : ''} wire-accent-${accent}`);
      path.setAttribute('d', d);

      // Wire data flow animation
      const flowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      flowPath.setAttribute('class', `wire-flow wire-flow-accent-${accent}`);
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

  function isOutputPin(pin) {
    if (!pin) return false;
    const p = String(pin).toLowerCase();
    return p === 'out' || p.startsWith('out_') || p.includes('output');
  }

  function isInputPin(pin) {
    if (!pin) return false;
    const p = String(pin).toLowerCase();
    return p === 'in' || p === 'in_a' || p === 'in_b' || p.startsWith('in_') || p.includes('input');
  }

  function isReachable(startNodeId, targetNodeId, visited = new Set()) {
    if (startNodeId === targetNodeId) return true;
    visited.add(startNodeId);
    const outgoing = state.wires.filter(w => w.fromNode === startNodeId);
    for (const w of outgoing) {
      if (!visited.has(w.toNode)) {
        if (isReachable(w.toNode, targetNodeId, visited)) return true;
      }
    }
    return false;
  }

  function addWire(fromNode, fromPin, toNode, toPin) {
    if (fromNode === toNode) return; // Prevent self-loop

    // If user dragged from an input pin to an output pin, auto-reverse to maintain OUT -> IN direction
    if (isInputPin(fromPin) && isOutputPin(toPin)) {
      const tNode = fromNode;
      const tPin = fromPin;
      fromNode = toNode;
      fromPin = toPin;
      toNode = tNode;
      toPin = tPin;
    }

    // Disallow IN -> IN connections
    if (isInputPin(fromPin) && isInputPin(toPin)) {
      showToast('Invalid: Cannot connect IN pin to IN pin');
      return;
    }

    // Disallow OUT -> OUT connections
    if (isOutputPin(fromPin) && isOutputPin(toPin)) {
      showToast('Invalid: Cannot connect OUT pin to OUT pin');
      return;
    }

    // Must be OUT -> IN
    if (!isOutputPin(fromPin) || !isInputPin(toPin)) {
      showToast('Connection must be directed OUT ➔ IN');
      return;
    }

    // Cycle check (strictly enforce DAG feed-forward flow)
    if (isReachable(toNode, fromNode)) {
      showToast('Cycle detected: connections must be feed-forward DAG');
      return;
    }

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

    // Propagate data strictly forward from sender to receiver
    const sender = state.nodes.get(fromNode);
    const receiver = state.nodes.get(toNode);
    if (sender && receiver && sender.data) {
      receiver.onReceiveData(sender.data, toPin);
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
        target.onReceiveData(data, w.toPin);
      }
    });
  }

  // =========================================================================
  // BASE NODE CLASS & TYPES
  // =========================================================================

  class BaseNode {
    constructor(id, type, title, x, y, width = 340, height = null, nodeScale = 1.0, accentColor = 'default') {
      this.id = id;
      this.type = type;
      this.title = title;
      this.x = x;
      this.y = y;
      this.baseWidth = width;
      this.baseHeight = height;
      this.nodeScale = Number(nodeScale) || 1.0;
      this.width = Math.round(this.baseWidth * (this.nodeScale === 1.0 ? 1.0 : this.nodeScale));
      this.height = this.baseHeight ? Math.round(this.baseHeight * (this.nodeScale === 1.0 ? 1.0 : this.nodeScale)) : null;
      this.accentColor = accentColor || 'default';
      this.data = null;
      this.element = null;
    }

    setNodeScale(scale) {
      this.nodeScale = Number(scale) || 1.0;
      if (this.element) {
        this.element.style.setProperty('--node-scale', this.nodeScale);
        this.element.dataset.nodeScale = String(this.nodeScale);

        this.width = Math.round(this.baseWidth * this.nodeScale);
        this.element.style.width = `${this.width}px`;
        if (this.baseHeight) {
          this.height = Math.round(this.baseHeight * this.nodeScale);
          this.element.style.height = `${this.height}px`;
        } else {
          this.element.style.minHeight = `${Math.round(220 * this.nodeScale)}px`;
        }

        this.element.querySelectorAll('.btn-node-scale').forEach(btn => {
          btn.classList.toggle('active', parseFloat(btn.dataset.scale) === this.nodeScale);
        });
      }

      if (typeof this.onResize === 'function') {
        this.onResize(this.width, this.height);
      }
      renderAllWires();
      saveGraphToLocalStorage();
    }

    setAccentColor(color) {
      this.accentColor = color || 'default';
      if (this.element) {
        this.element.dataset.accentColor = this.accentColor;
        this.element.querySelectorAll('.node-color-dot').forEach(dot => {
          dot.classList.toggle('active', dot.dataset.color === this.accentColor);
        });
      }

      renderAllWires();
      saveGraphToLocalStorage();
    }

    createDOM(headerExtra = '', portsHtml = '', bodyHtml = '', portsExtraClass = '') {
      const el = document.createElement('div');
      el.id = this.id;
      el.className = `bp-node node node-type-${this.type}`;
      el.dataset.nodeScale = String(this.nodeScale);
      el.dataset.accentColor = this.accentColor;
      el.style.setProperty('--node-scale', this.nodeScale);
      el.style.left = `${this.x}px`;
      el.style.top = `${this.y}px`;
      el.style.width = `${this.width}px`;
      if (this.height) el.style.height = `${this.height}px`;

      el.innerHTML = `
        <div class="node-header">
          <div class="node-title-group">
            <span class="node-title">${this.title}</span>
            <span class="node-type-badge">${this.type.toUpperCase()}</span>
            ${headerExtra}
          </div>
          <div class="node-header-tools">
            <div class="node-scale-selector" title="Node Scale (1×, 1.5×, 2×)">
              <button class="btn-node-scale ${this.nodeScale === 1.0 ? 'active' : ''}" data-scale="1">1×</button>
              <button class="btn-node-scale ${this.nodeScale === 1.5 ? 'active' : ''}" data-scale="1.5">1.5×</button>
              <button class="btn-node-scale ${this.nodeScale === 2.0 ? 'active' : ''}" data-scale="2">2×</button>
            </div>
            <div class="node-color-palette" title="Network Accent Color">
              <button class="node-color-dot color-default ${this.accentColor === 'default' ? 'active' : ''}" data-color="default" title="Default Accent"></button>
              <button class="node-color-dot color-cyan ${this.accentColor === 'cyan' ? 'active' : ''}" data-color="cyan" title="Cyan Accent (Branch 1)"></button>
              <button class="node-color-dot color-amber ${this.accentColor === 'amber' ? 'active' : ''}" data-color="amber" title="Amber Accent (Branch 2)"></button>
              <button class="node-color-dot color-emerald ${this.accentColor === 'emerald' ? 'active' : ''}" data-color="emerald" title="Emerald Accent (Safe)"></button>
              <button class="node-color-dot color-rose ${this.accentColor === 'rose' ? 'active' : ''}" data-color="rose" title="Rose Accent (Critical)"></button>
              <button class="node-color-dot color-violet ${this.accentColor === 'violet' ? 'active' : ''}" data-color="violet" title="Violet Accent (AI)"></button>
            </div>
            <button class="btn-node-close" title="Delete node">&times;</button>
          </div>
        </div>
        ${portsHtml ? `<div class="node-ports-bar ${portsExtraClass}">${portsHtml}</div>` : ''}
        <div class="node-body">${bodyHtml}</div>
        <div class="node-resizer node-resize-handle" title="Drag to resize card"></div>
      `;

      this.element = el;
      this.bindDragEvents();
      this.bindResizeEvents();

      // Scale selector clicks
      el.querySelectorAll('.btn-node-scale').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const s = parseFloat(btn.dataset.scale);
          if (s) this.setNodeScale(s);
        });
      });

      // Color palette clicks
      el.querySelectorAll('.node-color-dot').forEach(dot => {
        dot.addEventListener('click', (e) => {
          e.stopPropagation();
          const c = dot.dataset.color;
          if (c) this.setAccentColor(c);
        });
      });

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

    bindResizeEvents() {
      const resizer = this.element.querySelector('.node-resizer, .node-resize-handle');
      if (!resizer) return;
      let startX = 0, startY = 0;
      let startW = 0, startH = 0;
      let isResizing = false;

      const onStartResize = (e) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        e.preventDefault();
        isResizing = true;
        resizer.classList.add('resizing');
        this.element.classList.add('resizing-node');
        startX = e.clientX;
        startY = e.clientY;
        startW = this.element.offsetWidth;
        startH = this.element.offsetHeight;

        const onMouseMove = (ev) => {
          if (!isResizing) return;
          ev.stopPropagation();
          ev.preventDefault();
          const dw = (ev.clientX - startX) / state.scale;
          const dh = (ev.clientY - startY) / state.scale;
          // 2D free resizing with strictly enforced minimum dimensions
          this.width = Math.max(280, Math.round(startW + dw));
          this.height = Math.max(220, Math.round(startH + dh));
          this.element.style.width = `${this.width}px`;
          this.element.style.height = `${this.height}px`;
          renderAllWires();
          if (typeof this.onResize === 'function') {
            this.onResize(this.width, this.height);
          }
        };

        const onMouseUp = (ev) => {
          if (!isResizing) return;
          ev.stopPropagation();
          ev.preventDefault();
          isResizing = false;
          resizer.classList.remove('resizing');
          this.element.classList.remove('resizing-node');
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
          window.removeEventListener('pointermove', onMouseMove);
          window.removeEventListener('pointerup', onMouseUp);
          renderAllWires();
          saveGraphToLocalStorage();
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('pointermove', onMouseMove);
        window.addEventListener('pointerup', onMouseUp);
      };

      resizer.addEventListener('mousedown', onStartResize);
      resizer.addEventListener('pointerdown', onStartResize);
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

    onReceiveData(data, toPin = 'in') {
      this.data = data;
    }

    onResize(w, h) {}

    onDestroy() {}
  }

  // =========================================================================
  // UPSTREAM BRANCH DATA RESOLVER
  // =========================================================================

  function getOrComputeNodeBranchData(sourceNodeId) {
    const srcNode = state.nodes.get(sourceNodeId);
    if (!srcNode) return null;

    if (srcNode.data && srcNode.data.evaluation && srcNode.data.params) {
      return srcNode.data;
    }

    if (srcNode.type === 'variable') {
      const params = Object.assign({}, srcNode.params);
      const evalData = (window.StandaloneAPI && typeof window.StandaloneAPI.evaluateFireSafety === 'function')
        ? window.StandaloneAPI.evaluateFireSafety(params)
        : null;
      const s2rData = (window.StandaloneAPI && typeof window.StandaloneAPI.computeSimToReal === 'function' && evalData)
        ? window.StandaloneAPI.computeSimToReal(params, evalData)
        : null;
      const data = {
        params: params,
        evaluation: evalData,
        sim_to_real: s2rData,
        nearest_benchmark: (s2rData && s2rData.best_match) ? s2rData.best_match : null
      };
      srcNode.data = data;
      return data;
    }

    const upstreamVar = findUpstreamNode(sourceNodeId, 'variable');
    if (upstreamVar) {
      const params = Object.assign({}, upstreamVar.params);
      const evalData = (window.StandaloneAPI && typeof window.StandaloneAPI.evaluateFireSafety === 'function')
        ? window.StandaloneAPI.evaluateFireSafety(params)
        : null;
      const s2rData = (window.StandaloneAPI && typeof window.StandaloneAPI.computeSimToReal === 'function' && evalData)
        ? window.StandaloneAPI.computeSimToReal(params, evalData)
        : null;
      return {
        params: params,
        evaluation: evalData,
        sim_to_real: s2rData,
        nearest_benchmark: (s2rData && s2rData.best_match) ? s2rData.best_match : null
      };
    }

    return srcNode.data || null;
  }

  function resolveUpstreamBranchData(nodeId, inPin = 'in') {
    const wire = state.wires.find(w => w.toNode === nodeId && (w.toPin === inPin || !w.toPin || (inPin === 'in' && w.toPin.startsWith('in'))));
    if (!wire) {
      const anyWire = state.wires.find(w => w.toNode === nodeId);
      if (!anyWire) return null;
      return getOrComputeNodeBranchData(anyWire.fromNode);
    }
    return getOrComputeNodeBranchData(wire.fromNode);
  }

  // -------------------------------------------------------------------------
  // NODE 0: NOTE AI (JARVIS Mission Architect)
  // -------------------------------------------------------------------------

  class NoteNode extends BaseNode {
    constructor(id, x, y, initialData = {}, width = 420, height = null, nodeScale = 1.0, accentColor = 'default') {
      super(id, 'note', 'NOTE AI // JARVIS ARCHITECT', x, y, width, height, nodeScale, accentColor);
      this.noteText = 'Saffire V: Cygnus 29.5% O2, 0.71 atm, 20 cm/s flow of PMMA in 28 m3. Check cabin pressure.';
      this.isRecording = false;
      this.recognition = null;
      this.init();
    }

    init() {
      const portsHtml = `
        <div class="pin pin-out" data-pin="out">
          <span>OUT (Blueprint Plan)</span>
          <div class="pin-socket"></div>
        </div>
      `;

      const bodyHtml = `
        <div class="note-input-container">
          <textarea class="note-textarea" id="${this.id}-note-text" placeholder="Speak or type mission note (e.g. Saffire V 29.5% O2, 0.71 atm, 20 cm/s, PMMA)...">${sanitize(this.noteText)}</textarea>

          <div class="note-actions-row">
            <button class="btn-voice-input" id="${this.id}-btn-voice" title="Click to speak (Web Speech API)">
              <span class="voice-icon">🎙</span>
              <span class="voice-btn-text">VOICE INPUT</span>
            </button>
            <button class="btn-compile-note" id="${this.id}-btn-compile" title="Compile note into Blueprint Architecture">
              <span>COMPILE TO BLUEPRINT</span>
            </button>
          </div>

          <div class="voice-status-wrapper">
            <span class="voice-status-text" id="${this.id}-voice-status">Ready for voice input or typing</span>
          </div>

          <div class="note-presets-group">
            <div style="font-size: 10px; font-family: var(--font-mono); color: var(--text-muted); text-transform: uppercase;">Flight Presets:</div>
            <div class="note-preset-chip" data-note="Saffire V: Cygnus 29.5% O2, 0.71 atm, 20 cm/s, PMMA. Monitor cabin pressure and temperature." data-o2="29.5" data-p="0.71" data-v="20.0" data-fuel="pmma" data-gas="0.0" data-vol="28">
              <span>▸ Saffire V Cygnus (29.5% O₂, PMMA, 0.71 atm)</span>
            </div>
            <div class="note-preset-chip" data-note="PSI-117 Cool Flame: 21% O2, 1.0 atm, 0.5 cm/s, n-heptane droplet. Detect toxic CO." data-o2="21.0" data-p="1.0" data-v="0.5" data-fuel="n-heptane" data-gas="0.0" data-vol="28">
              <span>▸ PSI-117 Cool Flame (n-Heptane, 0.5 cm/s, toxic CO)</span>
            </div>
            <div class="note-preset-chip" data-note="Apollo 13: 21% O2, 1.0 atm, 5.0 cm/s, 6.5% H2 gas leak in 15 m3 cabin. Check explosion." data-o2="21.0" data-p="1.0" data-v="5.0" data-fuel="h2" data-gas="6.5" data-vol="15">
              <span>▸ Apollo 13 H₂ Blast (6.5% H₂ leak, 15 m³ volume)</span>
            </div>
            <div class="note-preset-chip" data-note="Hazard Audit: Uranium fuel pellet ignition at 35% O2, 1.2 atm, 15 cm/s flow. Check safety compliance." data-o2="35.0" data-p="1.2" data-v="15.0" data-fuel="pmma" data-gas="0.0" data-vol="28">
              <span>▸ Hazard Test (Uranium fuel pellet, 35% O₂ [Out-of-Domain])</span>
            </div>
          </div>

          <div class="note-summary-card" id="${this.id}-summary-card"></div>
        </div>
      `;

      this.createDOM('', portsHtml, bodyHtml);
      this.bindNoteEvents();
      this.initSpeechRecognition();
    }

    initSpeechRecognition() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const statusEl = this.element.querySelector(`#${this.id}-voice-status`);
      if (!SpeechRecognition) {
        this.recognition = null;
        if (statusEl) {
          statusEl.textContent = '⚠ Web Speech API not supported - type text manually';
        }
        return;
      }
      try {
        const r = new SpeechRecognition();
        r.continuous = false;
        r.interimResults = false;
        r.lang = 'en-US';

        r.onstart = () => {
          this.isRecording = true;
          const btn = this.element.querySelector(`#${this.id}-btn-voice`);
          if (btn) {
            btn.classList.add('recording');
            btn.querySelector('.voice-btn-text').textContent = 'LISTENING...';
          }
          if (statusEl) {
            statusEl.className = 'voice-status-text listening';
            statusEl.textContent = '🎙 Listening... Speak flight parameters';
          }
          showToast('Recording voice note... Speak flight parameters');
        };

        r.onresult = (e) => {
          const transcript = e.results && e.results[0] && e.results[0][0] ? e.results[0][0].transcript : '';
          const textarea = this.element.querySelector(`#${this.id}-note-text`);
          if (textarea && transcript) {
            textarea.value = (textarea.value ? textarea.value.trim() + ' ' : '') + transcript;
            this.noteText = textarea.value;
          }
          if (statusEl) {
            statusEl.className = 'voice-status-text success';
            statusEl.textContent = '✓ Voice captured: "' + transcript + '". Compiling...';
          }
          showToast('Voice note captured');
          // Automatically trigger compilation to blueprint
          setTimeout(() => {
            this.compile();
          }, 200);
        };

        r.onerror = (e) => {
          console.warn('[SpeechRec] Error:', e.error);
          if (statusEl) {
            statusEl.className = 'voice-status-text';
            if (e.error === 'not-allowed') {
              statusEl.textContent = '⚠ Microphone permission denied in browser';
            } else {
              statusEl.textContent = `⚠ Voice input notice: ${e.error}`;
            }
          }
          showToast('Voice note notice: ' + e.error);
          this.resetVoiceButton();
        };

        r.onend = () => {
          this.resetVoiceButton();
          if (statusEl && !statusEl.classList.contains('success')) {
            statusEl.className = 'voice-status-text';
            statusEl.textContent = 'Ready for voice input or typing';
          }
        };

        this.recognition = r;
      } catch (err) {
        console.warn('[SpeechRec] Init failed:', err);
        this.recognition = null;
        if (statusEl) {
          statusEl.textContent = '⚠ Speech recognition unavailable';
        }
      }
    }

    resetVoiceButton() {
      this.isRecording = false;
      const btn = this.element.querySelector(`#${this.id}-btn-voice`);
      if (btn) {
        btn.classList.remove('recording');
        btn.querySelector('.voice-btn-text').textContent = 'VOICE INPUT';
      }
    }

    bindNoteEvents() {
      const textarea = this.element.querySelector(`#${this.id}-note-text`);
      textarea.addEventListener('input', () => {
        this.noteText = textarea.value;
      });

      const voiceBtn = this.element.querySelector(`#${this.id}-btn-voice`);
      voiceBtn.addEventListener('click', () => {
        if (!this.recognition) {
          const statusEl = this.element.querySelector(`#${this.id}-voice-status`);
          if (statusEl) statusEl.textContent = '⚠ Web Speech API not supported - type text manually';
          showToast('SpeechRecognition API not available in this browser. Please type.');
          return;
        }
        if (this.isRecording) {
          this.recognition.stop();
        } else {
          try {
            this.recognition.lang = 'en-US';
            this.recognition.start();
          } catch (e) {
            console.warn('[SpeechRec] Start error:', e);
          }
        }
      });

      const compileBtn = this.element.querySelector(`#${this.id}-btn-compile`);
      compileBtn.addEventListener('click', () => this.compile());

      this.element.querySelectorAll('.note-preset-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          this.noteText = chip.dataset.note;
          const textarea = this.element.querySelector(`#${this.id}-note-text`);
          if (textarea) textarea.value = this.noteText;
          if (chip.dataset.o2) {
            const instantParams = {
              o2_percent: parseFloat(chip.dataset.o2),
              pressure_atm: parseFloat(chip.dataset.p),
              flow_velocity_cms: parseFloat(chip.dataset.v),
              fuel: chip.dataset.fuel,
              h2_conc_pct: parseFloat(chip.dataset.gas || 0),
              gas_vol_pct: parseFloat(chip.dataset.gas || 0),
              cabin_volume_m3: parseFloat(chip.dataset.vol || 28)
            };
            this.applyCompiledPlan({ params: instantParams, summary: chip.dataset.note });
          }
          this.compile();
        });
      });
    }

    async compile() {
      const compileBtn = this.element.querySelector(`#${this.id}-btn-compile`);
      compileBtn.disabled = true;
      compileBtn.innerHTML = `<div class="spinner"></div> <span>COMPILING...</span>`;

      try {
        const res = await fetch(API_NOTE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            note_text: this.noteText,
            language: 'en'
          })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const compiled = await res.json();

        // Render or update out-of-domain banner
        let warnBanner = this.element.querySelector(`#${this.id}-warning-banner`);
        if (compiled.out_of_domain_warning) {
          if (!warnBanner) {
            warnBanner = document.createElement('div');
            warnBanner.id = `${this.id}-warning-banner`;
            warnBanner.className = 'out-of-domain-banner';
            const inputContainer = this.element.querySelector('.note-input-container');
            const actionsRow = this.element.querySelector('.note-actions-row');
            inputContainer.insertBefore(warnBanner, actionsRow);
          }
          warnBanner.style.display = 'flex';
          warnBanner.innerHTML = `
            <div class="warning-icon">⚠️</div>
            <div class="warning-content">
              <div class="warning-title">OUT-OF-DOMAIN MATERIAL DETECTED</div>
              <div class="warning-desc">${sanitize(compiled.warning_message || 'Exotic/hazardous materials prohibited under NASA STD-6001. Mapped to surrogate polymer PMMA thermal proxy with standard microgravity kinetics.')}</div>
            </div>
          `;
        } else if (warnBanner) {
          warnBanner.style.display = 'none';
        }

        this.data = compiled;
        showToast('Mission blueprint compiled');

        // Propagate down the wire
        propagateDataFrom(this.id, compiled);

        // Apply strictly to connected Variable node(s) on this network
        this.applyCompiledPlan(compiled);
      } catch (err) {
        console.error('[NoteNode] Compilation error:', err);
        showToast('Compilation error: ' + err.message);
      } finally {
        compileBtn.disabled = false;
        compileBtn.innerHTML = `<span>COMPILE TO BLUEPRINT</span>`;
      }
    }

    applyCompiledPlan(compiled) {
      // Strictly isolate: find target variable node(s) ONLY via outgoing wires from this.id
      const outgoingWires = state.wires.filter(w => w.fromNode === this.id && w.fromPin === 'out');
      const targetVars = [];
      outgoingWires.forEach(w => {
        const target = state.nodes.get(w.toNode);
        if (target && target.type === 'variable') {
          targetVars.push(target);
        } else if (target) {
          const downstreamVar = findDownstreamNode(target.id, 'variable');
          if (downstreamVar) targetVars.push(downstreamVar);
        }
      });

      const card = this.element.querySelector(`#${this.id}-summary-card`);

      // If no connected OUT wire or no connected Variable node, NEVER modify any other node!
      if (targetVars.length === 0) {
        if (card) {
          card.style.display = 'block';
          card.innerHTML = `
            <div style="font-family: var(--font-mono); font-size: 10px; color: #F59E0B; font-weight: 700;">✓ MISSION ARCHITECTURE COMPILED</div>
            <div style="margin-top: 4px; color: var(--text-primary); font-size: 11px;">${sanitize(compiled.summary || '')}</div>
            <div style="margin-top: 6px; padding: 4px 8px; background: rgba(245, 158, 11, 0.12); border: 1px dashed #F59E0B; border-radius: 4px; color: #F59E0B; font-size: 9.5px; font-family: var(--font-mono);">
              ℹ Compiled (connect OUT pin to ENV VARIABLES to apply)
            </div>
            ${compiled.suggested_query ? `<div style="margin-top: 4px; color: var(--text-muted); font-size: 10px;">Suggested Copilot Query: <i>${sanitize(compiled.suggested_query)}</i></div>` : ''}
          `;
        }
        return;
      }

      // If connected target variable node(s) exist, apply parameters to them
      targetVars.forEach(targetVar => {
        if (compiled.params) {
          targetVar.setParams(compiled.params);
        }
        if (compiled.pipeline) {
          const targetS2r = findDownstreamNode(targetVar.id, 'simtoreal');
          if (targetS2r) {
            if (compiled.pipeline.match_by && typeof targetS2r.setMatchBy === 'function') {
              targetS2r.setMatchBy(compiled.pipeline.match_by);
            }
            if (compiled.pipeline.active_benchmark_id && typeof targetS2r.setActiveBenchmark === 'function') {
              targetS2r.setActiveBenchmark(compiled.pipeline.active_benchmark_id);
            }
          }
          const targetGraph = findDownstreamNode(targetVar.id, 'graph');
          if (targetGraph && compiled.pipeline.graph_metric) {
            targetGraph.setChannel(compiled.pipeline.graph_metric);
          }
          const targetPrompt = findDownstreamNode(targetVar.id, 'prompt');
          if (targetPrompt && compiled.suggested_query) {
            targetPrompt.setQuery(compiled.suggested_query);
          }
        }
      });

      if (card) {
        card.style.display = 'block';
        card.innerHTML = `
          <div style="font-family: var(--font-mono); font-size: 10px; color: #F59E0B; font-weight: 700;">✓ MISSION ARCHITECTURE COMPILED</div>
          <div style="margin-top: 4px; color: var(--text-primary); font-size: 11px;">${sanitize(compiled.summary || '')}</div>
          ${compiled.suggested_query ? `<div style="margin-top: 4px; color: var(--text-muted); font-size: 10px;">Suggested Copilot Query: <i>${sanitize(compiled.suggested_query)}</i></div>` : ''}
        `;
      }
    }
  }

  function triggerVariableEvaluate(sourceNodeId = null) {
    if (sourceNodeId) {
      const varNode = findUpstreamNode(sourceNodeId, 'variable');
      if (varNode) {
        varNode.queueEvaluate();
        return;
      }
    }
  }

  // -------------------------------------------------------------------------
  // NODE 1: VARIABLE / PARAMETER
  // -------------------------------------------------------------------------

  class VariableNode extends BaseNode {
    constructor(id, x, y, initialParams = {}, width = 320, height = null, nodeScale = 1.0, accentColor = 'default') {
      super(id, 'variable', 'ENV VARIABLES // FEED', x, y, width, height, nodeScale, accentColor);
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
        <div class="pin pin-in" data-pin="in">
          <div class="pin-socket"></div>
          <span>IN (Plan)</span>
        </div>
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
        if (!isGas) {
          this.params.h2_conc_pct = 0.0;
          this.params.gas_vol_pct = 0.0;
          const gasR = this.element.querySelector(`#${this.id}-gas-range`);
          const gasN = this.element.querySelector(`#${this.id}-gas-num`);
          const gasD = this.element.querySelector(`#${this.id}-gas-disp`);
          if (gasR) gasR.value = 0.0;
          if (gasN) gasN.value = 0.0;
          if (gasD) gasD.textContent = '0.0%';
        } else if (this.params.h2_conc_pct === 0) {
          this.params.h2_conc_pct = (this.params.fuel === 'h2') ? 6.5 : 5.5;
          this.params.gas_vol_pct = this.params.h2_conc_pct;
          const gasR = this.element.querySelector(`#${this.id}-gas-range`);
          const gasN = this.element.querySelector(`#${this.id}-gas-num`);
          const gasD = this.element.querySelector(`#${this.id}-gas-disp`);
          if (gasR) gasR.value = this.params.h2_conc_pct;
          if (gasN) gasN.value = this.params.h2_conc_pct;
          if (gasD) gasD.textContent = `${this.params.h2_conc_pct.toFixed(1)}%`;
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
      const isGas = ['h2', 'methane'].includes(this.params.fuel);
      if (!isGas) {
        this.params.h2_conc_pct = 0.0;
        this.params.gas_vol_pct = 0.0;
      }
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

      const gasRow = this.element.querySelector(`#${this.id}-gas-row`);
      if (gasRow) gasRow.style.display = isGas ? 'flex' : 'none';

      const volSel = this.element.querySelector(`#${this.id}-vol-select`);
      if (volSel) volSel.value = this.params.cabin_volume_m3;

      this.queueEvaluate();
    }

    onReceiveData(data) {
      super.onReceiveData(data);
      if (data && data.params) {
        this.setParams(data.params);
      }
    }

    queueEvaluate() {
      if (state.evalDebounceTimer) clearTimeout(state.evalDebounceTimer);
      state.evalDebounceTimer = setTimeout(() => {
        this.evaluate();
      }, 60);
    }

    async evaluate() {
      try {
        const s2rNode = findDownstreamNode(this.id, 'simtoreal');
        const payload = Object.assign({}, this.params, {
          match_by: s2rNode ? s2rNode.matchBy : 'physics',
          active_benchmark_id: s2rNode ? s2rNode.activeBenchmarkId : null,
          filter_mission: s2rNode ? s2rNode.filterMission : 'all',
          filter_fuel: s2rNode ? s2rNode.filterFuel : 'all'
        });

        const res = await fetch(API_EVAL_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // Pack params + evaluation + benchmark + sim_to_real
        this.data = {
          params: Object.assign({}, this.params),
          evaluation: data.evaluation,
          nearest_benchmark: data.nearest_benchmark,
          sim_to_real: data.sim_to_real
        };

        propagateDataFrom(this.id, this.data);
        saveGraphToLocalStorage();
      } catch (err) {
        console.error('[VariableNode] Eval error:', err);
      }
    }
  }

  // -------------------------------------------------------------------------
  // NODE 1.5: SIM-TO-REAL (NASA PSI Flight Grounding)
  // -------------------------------------------------------------------------

  class SimToRealNode extends BaseNode {
    constructor(id, x, y, initialData = {}, width = 440, height = null, nodeScale = 1.0, accentColor = 'default') {
      super(id, 'simtoreal', 'SIM-TO-REAL // NASA GROUNDING', x, y, width, height, nodeScale, accentColor);
      this.matchBy = 'physics';
      this.filterMission = 'all';
      this.filterFuel = 'all';
      this.activeBenchmarkId = null;
      this.init();
    }

    triggerBranchEvaluate() {
      const varNode = findUpstreamNode(this.id, 'variable');
      if (varNode) {
        varNode.queueEvaluate();
      }
    }

    init() {
      const portsHtml = `
        <div class="pin pin-in" data-pin="in">
          <div class="pin-socket"></div>
          <span>IN (Eval Stream)</span>
        </div>
        <div class="pin pin-out" data-pin="out">
          <span>OUT (Calibrated Stream)</span>
          <div class="pin-socket"></div>
        </div>
      `;

      const bodyHtml = `
        <div class="s2r-header-metrics">
          <div class="s2r-metric-box">
            <div class="s2r-metric-title">Sim-to-Real Confidence</div>
            <div class="s2r-metric-val-row">
              <span class="s2r-metric-val" id="${this.id}-conf-val">88.5%</span>
              <span class="confidence-badge confidence-high" id="${this.id}-conf-badge">HIGH</span>
            </div>
            <div class="confidence-meter">
              <div class="confidence-bar-fill" id="${this.id}-conf-bar" style="width: 88.5%;"></div>
            </div>
          </div>

          <div class="s2r-metric-box">
            <div class="s2r-metric-title">Empirical Reality Gap</div>
            <div class="s2r-metric-val-row">
              <span class="s2r-metric-val" id="${this.id}-gap-val">24.0%</span>
              <span class="gap-badge gap-moderate" id="${this.id}-gap-badge">CALIBRATED</span>
            </div>
            <div style="font-family: var(--font-mono); font-size: 9px; color: var(--text-muted);">Against 41 Flight Runs</div>
          </div>
        </div>

        <div class="s2r-filter-panel">
          <div class="s2r-filter-group">
            <span class="s2r-filter-label">MISSION:</span>
            <div class="s2r-filter-buttons" id="${this.id}-filter-mission">
              <button class="btn-s2r-filter ${this.filterMission === 'all' ? 'active' : ''}" data-filter-type="mission" data-val="all">ALL</button>
              <button class="btn-s2r-filter ${this.filterMission === 'saffire' ? 'active' : ''}" data-filter-type="mission" data-val="saffire">SAFFIRE</button>
              <button class="btn-s2r-filter ${this.filterMission === 'bass' ? 'active' : ''}" data-filter-type="mission" data-val="bass">BASS-II</button>
              <button class="btn-s2r-filter ${this.filterMission === 'psi' ? 'active' : ''}" data-filter-type="mission" data-val="psi">FLEX / PSI</button>
              <button class="btn-s2r-filter ${this.filterMission === 'historical' ? 'active' : ''}" data-filter-type="mission" data-val="historical">HISTORICAL</button>
            </div>
          </div>

          <div class="s2r-filter-group">
            <span class="s2r-filter-label">FUEL:</span>
            <div class="s2r-filter-buttons" id="${this.id}-filter-fuel">
              <button class="btn-s2r-filter ${this.filterFuel === 'all' ? 'active' : ''}" data-filter-type="fuel" data-val="all">ALL</button>
              <button class="btn-s2r-filter ${this.filterFuel === 'solid' ? 'active' : ''}" data-filter-type="fuel" data-val="solid">SOLID</button>
              <button class="btn-s2r-filter ${this.filterFuel === 'liquid' ? 'active' : ''}" data-filter-type="fuel" data-val="liquid">LIQUID</button>
              <button class="btn-s2r-filter ${this.filterFuel === 'gas' ? 'active' : ''}" data-filter-type="fuel" data-val="gas">GAS</button>
            </div>
          </div>

          <div class="s2r-filter-group">
            <span class="s2r-filter-label">MATCH BY:</span>
            <div class="s2r-filter-buttons" id="${this.id}-match-by">
              <button class="btn-s2r-filter ${this.matchBy === 'physics' ? 'active' : ''}" data-filter-type="match" data-val="physics">PARAMS</button>
              <button class="btn-s2r-filter ${this.matchBy === 'telemetry' ? 'active' : ''}" data-filter-type="match" data-val="telemetry">CURVE SHAPE</button>
              <button class="btn-s2r-filter ${this.matchBy === 'safety' ? 'active' : ''}" data-filter-type="match" data-val="safety">SAFETY RISK</button>
            </div>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
          <div style="font-size: 10px; font-family: var(--font-mono); color: var(--text-muted); text-transform: uppercase;">
            Top-3 Flight Benchmarks:
          </div>
          <div style="font-size: 9px; font-family: var(--font-mono); color: #06B6D4;">
            (Click to set Active Benchmark)
          </div>
        </div>
        <div class="s2r-matches-list" id="${this.id}-matches-list">
          <div class="s2r-match-item">Awaiting physical evaluation stream...</div>
        </div>

        <div class="s2r-explanation-card" id="${this.id}-explanation-card">
          Grounded across 41 documented flight runs (Saffire I–VI, BASS-II, PSI-117, PSI-10, PSI-60, PSI-179, Apollo, Mir).
        </div>
      `;

      this.createDOM('', portsHtml, bodyHtml);
      this.bindCriteriaEvents();
    }

    bindCriteriaEvents() {
      const filterBtns = this.element.querySelectorAll('.btn-s2r-filter');
      filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const fType = btn.dataset.filterType;
          const val = btn.dataset.val;
          if (fType === 'mission') {
            this.filterMission = val;
            this.element.querySelectorAll(`#${this.id}-filter-mission .btn-s2r-filter`).forEach(b => {
              b.classList.toggle('active', b.dataset.val === val);
            });
            this.triggerBranchEvaluate();
          } else if (fType === 'fuel') {
            this.filterFuel = val;
            this.element.querySelectorAll(`#${this.id}-filter-fuel .btn-s2r-filter`).forEach(b => {
              b.classList.toggle('active', b.dataset.val === val);
            });
            this.triggerBranchEvaluate();
          } else if (fType === 'match') {
            this.setMatchBy(val);
          }
        });
      });
    }

    setMatchBy(mode) {
      if (!['physics', 'safety', 'telemetry'].includes(mode)) return;
      this.matchBy = mode;
      const matchBtns = this.element.querySelectorAll(`#${this.id}-match-by .btn-s2r-filter`);
      matchBtns.forEach(b => {
        b.classList.toggle('active', b.dataset.val === mode);
      });
      this.triggerBranchEvaluate();
    }

    setActiveBenchmark(benchmarkId) {
      this.activeBenchmarkId = benchmarkId;
      this.triggerBranchEvaluate();
    }

    onReceiveData(data, toPin = 'in') {
      super.onReceiveData(data, toPin);
      this.updateSimToRealDisplay();
      propagateDataFrom(this.id, data);
    }

    updateSimToRealDisplay() {
      if (!this.data) return;
      const s2r = this.data.sim_to_real;
      if (!s2r) return;

      if (s2r.match_by && s2r.match_by !== this.matchBy) {
        this.matchBy = s2r.match_by;
        const matchBtns = this.element.querySelectorAll(`#${this.id}-match-by .btn-s2r-filter`);
        matchBtns.forEach(b => {
          b.classList.toggle('active', b.dataset.val === this.matchBy);
        });
      }

      if (s2r.active_benchmark_id) {
        this.activeBenchmarkId = s2r.active_benchmark_id;
      }

      const confVal = s2r.sim_to_real_confidence_pct || 85.0;
      const gapVal = s2r.reality_gap_pct || 15.0;

      // Confidence
      const confEl = this.element.querySelector(`#${this.id}-conf-val`);
      const confBadge = this.element.querySelector(`#${this.id}-conf-badge`);
      const confBar = this.element.querySelector(`#${this.id}-conf-bar`);
      if (confEl) confEl.textContent = `${confVal.toFixed(1)}%`;
      if (confBar) confBar.style.width = `${Math.min(100, Math.max(0, confVal))}%`;
      if (confBadge) {
        if (confVal >= 75.0) {
          confBadge.className = 'confidence-badge confidence-high';
          confBadge.textContent = 'HIGH';
        } else if (confVal >= 45.0) {
          confBadge.className = 'confidence-badge confidence-med';
          confBadge.textContent = 'MODERATE';
        } else {
          confBadge.className = 'confidence-badge confidence-low';
          confBadge.textContent = 'LOW';
        }
      }

      // Reality Gap
      const gapEl = this.element.querySelector(`#${this.id}-gap-val`);
      const gapBadge = this.element.querySelector(`#${this.id}-gap-badge`);
      if (gapEl) gapEl.textContent = `${gapVal.toFixed(1)}%`;
      if (gapBadge) {
        if (gapVal <= 20) {
          gapBadge.className = 'gap-badge gap-low';
          gapBadge.textContent = 'HIGH ACCURACY';
        } else if (gapVal <= 45) {
          gapBadge.className = 'gap-badge gap-moderate';
          gapBadge.textContent = 'CALIBRATED';
        } else {
          gapBadge.className = 'gap-badge gap-high';
          gapBadge.textContent = 'DIVERGENCE';
        }
      }

      // Top matches with clickable cards and active benchmark highlight
      const matchesList = this.element.querySelector(`#${this.id}-matches-list`);
      if (matchesList && Array.isArray(s2r.top_matches)) {
        const activeId = s2r.active_benchmark_id || this.activeBenchmarkId || (s2r.best_match ? s2r.best_match.id : null);
        matchesList.innerHTML = s2r.top_matches.slice(0, 3).map((m, idx) => {
          const isActive = (m.id === activeId || m.is_active === true);
          return `
          <div class="s2r-match-item ${isActive ? 'active-benchmark' : ''}" data-benchmark-id="${sanitize(m.id || '')}">
            <div class="s2r-match-top">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="s2r-rank-tag">#${idx + 1}</span>
                <span class="s2r-match-title">${sanitize(m.id || '')} &middot; ${sanitize(m.investigation || m.title || '')}</span>
                ${isActive ? '<span class="s2r-active-badge">ACTIVE BENCHMARK</span>' : ''}
              </div>
              <span class="s2r-match-score">${(m.match_pct || 90).toFixed(1)}%</span>
            </div>
            <div class="s2r-match-details">
              <span>O₂: ${m.o2_percent}%</span>
              <span>P: ${m.pressure_atm} atm</span>
              <span>V_g: ${m.flow_velocity_cms} cm/s</span>
              <span>Regime: ${(m.measured_regime || 'nominal').toUpperCase()}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <a href="${m.url || 'https://psi.nasa.gov'}" target="_blank" rel="noopener noreferrer" class="s2r-link" onclick="event.stopPropagation()">
                View Investigation Telemetry ↗
              </a>
              <span style="font-family: var(--font-mono); font-size: 9px; color: ${isActive ? '#06B6D4' : 'var(--text-muted)'}; font-weight: ${isActive ? '700' : '400'};">
                ${isActive ? '● Active Calibration Reference' : 'Click to select as reference'}
              </span>
            </div>
          </div>
        `;
        }).join('');

        // Attach click listeners to cards
        const cardEls = matchesList.querySelectorAll('.s2r-match-item');
        cardEls.forEach(card => {
          card.addEventListener('click', (e) => {
            e.stopPropagation();
            const bId = card.dataset.benchmarkId;
            if (bId) {
              this.setActiveBenchmark(bId);
            }
          });
        });
      }

      // Explanation
      const explCard = this.element.querySelector(`#${this.id}-explanation-card`);
      if (explCard && s2r.gap_explanation) {
        explCard.innerHTML = `<span style="font-family: var(--font-mono); font-size: 10px; color: #06B6D4; font-weight: 700;">PHYSICAL GROUNDING ANALYSIS:</span><br>${sanitize(s2r.gap_explanation)}`;
      }

      // Check if a TABLE node is already connected
      const hasConnectedTable = findDownstreamNode(this.id, 'table') || findUpstreamNode(this.id, 'table');
      let tableBanner = this.element.querySelector(`#${this.id}-table-banner`);
      if (!hasConnectedTable) {
        if (!tableBanner) {
          tableBanner = document.createElement('div');
          tableBanner.id = `${this.id}-table-banner`;
          tableBanner.className = 'smart-connect-banner';
          if (explCard && explCard.parentNode) {
            explCard.parentNode.insertBefore(tableBanner, explCard.nextSibling);
          }
        }
        tableBanner.style.display = 'flex';
        tableBanner.innerHTML = `
          <span>NASA PSI Matrix table available</span>
          <button class="smart-connect-btn" id="${this.id}-btn-connect-table">[+ Connect TABLE]</button>
        `;
        const btnConnect = tableBanner.querySelector(`#${this.id}-btn-connect-table`);
        if (btnConnect) {
          btnConnect.addEventListener('click', (e) => {
            e.stopPropagation();
            const tableNode = spawnNode('table', this.x + this.width + 30, this.y);
            addWire(this.id, 'out', tableNode.id, 'in');
            tableBanner.style.display = 'none';
            showToast('Connected TABLE // NASA PSI MATRIX node');
          });
        }
      } else if (tableBanner) {
        tableBanner.style.display = 'none';
      }
    }
  }

  // -------------------------------------------------------------------------
  // NODE 1.75: TABLE (NASA PSI Flight Matrix & Telemetry Summary)
  // -------------------------------------------------------------------------

  class TableNode extends BaseNode {
    constructor(id, x, y, initialData = {}, width = 490, height = 540, nodeScale = 1.0, accentColor = 'default') {
      super(id, 'table', 'TABLE // NASA PSI MATRIX', x, y, width, height, nodeScale, accentColor);
      this.activeBenchmarkId = null;
      this.filterText = '';
      this.filterMode = 'relevant'; // 'relevant' (top 5) or 'all' (all 41)
      this.init();
    }

    init() {
      // Strictly a terminal analytical node: ONLY input pin 'in' (NO out pin)
      const portsHtml = `
        <div class="pin pin-in" data-pin="in">
          <div class="pin-socket"></div>
          <span>IN (Eval Stream)</span>
        </div>
      `;

      const bodyHtml = `
        <div class="table-node-sections">
          <div class="telemetry-summary-section">
            <div class="table-section-title">
              <span>SIMULATION TELEMETRY SUMMARY</span>
              <span style="color: var(--text-muted); font-size: 8.5px;" id="${this.id}-summary-status">STREAM: LIVE</span>
            </div>
            <div class="telemetry-summary-grid" id="${this.id}-summary-grid">
              <div class="telemetry-summary-item" style="grid-column: span 2; text-align: center; color: var(--text-muted);">
                Awaiting physical telemetry stream...
              </div>
            </div>
          </div>

          <div class="psi-runs-section">
            <div class="table-section-title">
              <span>MATCHING NASA PSI EXPERIMENTAL RUNS</span>
              <span style="color: var(--color-go); font-size: 8.5px;">CLICK ROW TO CALIBRATE</span>
            </div>
            <div class="table-node-toolbar">
              <div class="table-filter-pills" id="${this.id}-filter-pills">
                <button class="btn-table-filter ${this.filterMode === 'relevant' ? 'active' : ''}" data-mode="relevant">RELEVANT (TOP 5)</button>
                <button class="btn-table-filter ${this.filterMode === 'all' ? 'active' : ''}" data-mode="all">ALL 41 RUNS</button>
              </div>
              <input type="text" class="table-node-search" id="${this.id}-search" placeholder="Filter runs (PMMA, Saffire, 21%, BASS)...">
            </div>
            <div class="table-node-container" id="${this.id}-table-container"></div>
          </div>
        </div>
      `;

      this.createDOM('', portsHtml, bodyHtml);
      this.bindTableEvents();
      this.renderTelemetrySummary();
      this.renderMatrix();
    }

    bindTableEvents() {
      const searchInput = this.element.querySelector(`#${this.id}-search`);
      if (searchInput) {
        searchInput.addEventListener('input', () => {
          this.filterText = searchInput.value.toLowerCase().trim();
          this.renderMatrix();
        });
      }

      const filterPills = this.element.querySelectorAll(`#${this.id}-filter-pills .btn-table-filter`);
      filterPills.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const mode = btn.dataset.mode;
          if (mode && (mode === 'relevant' || mode === 'all')) {
            this.filterMode = mode;
            filterPills.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
            this.renderMatrix();
          }
        });
      });
    }

    renderTelemetrySummary() {
      const grid = this.element.querySelector(`#${this.id}-summary-grid`);
      const statusEl = this.element.querySelector(`#${this.id}-summary-status`);
      if (!grid) return;

      const evalData = this.data ? this.data.evaluation : null;
      const params = this.data ? this.data.params : null;
      const simTel = (evalData && evalData.sim_telemetry) ? evalData.sim_telemetry : {};

      if (!evalData) {
        grid.innerHTML = `
          <div class="telemetry-summary-item" style="grid-column: span 2; text-align: center; color: var(--text-muted); padding: 8px;">
            Awaiting physical telemetry stream...
          </div>
        `;
        if (statusEl) statusEl.textContent = 'STREAM: IDLE';
        return;
      }

      if (statusEl) {
        const flightStatus = evalData.flight_status || 'NOMINAL';
        statusEl.textContent = `STATUS: ${flightStatus}`;
        statusEl.style.color = flightStatus === 'GO' ? 'var(--color-go)' : (flightStatus === 'NO-GO' ? 'var(--color-nogo)' : '#F59E0B');
      }

      const rawRegime = (simTel.flame_color_mode || evalData.combustion_regime || 'nominal').toUpperCase();
      const tfVal = evalData.t_flame_k !== undefined ? evalData.t_flame_k : (simTel.flame_temp_k || 1650);
      const tf = `${Number(tfVal).toFixed(0)} K`;

      const vgVal = params && params.flow_velocity_cms !== undefined ? Number(params.flow_velocity_cms) : 10.0;
      let daVal = null;
      if (evalData.damkohler_da !== undefined && !isNaN(evalData.damkohler_da)) {
        daVal = Number(evalData.damkohler_da).toFixed(3);
      } else if (simTel.damkohler_da !== undefined && !isNaN(simTel.damkohler_da)) {
        daVal = Number(simTel.damkohler_da).toFixed(3);
      } else if (Array.isArray(evalData.objective_reasons)) {
        for (const r of evalData.objective_reasons) {
          const m = r.match(/Damk[öo]hler\s+(?:number\s+)?Da\s*(?:=|≈)\s*([\d.]+)/i);
          if (m && m[1]) {
            daVal = Number(m[1]).toFixed(3);
            break;
          }
        }
      }
      if (!daVal) {
        const pBar = params && params.pressure_atm !== undefined ? Number(params.pressure_atm) : 1.0;
        const xO2 = params && params.o2_percent !== undefined ? Number(params.o2_percent) / 100.0 : 0.21;
        const vgMs = vgVal / 100.0;
        const tauFlow = 0.008 / (vgMs + 0.005);
        const rateFactor = 3.2e7 * Math.pow(pBar, 1.75) * xO2 * Math.exp(-14500.0 / 1500.0);
        const tauChem = 1.0 / Math.max(rateFactor, 1.0e-5);
        daVal = (tauFlow / tauChem).toFixed(3);
      }

      const loiVal = simTel.loi_crit_pct !== undefined ? Number(simTel.loi_crit_pct).toFixed(1) : '14.8';
      const rawVf = (evalData.spread_rate_mm_s !== undefined && !isNaN(evalData.spread_rate_mm_s)) ? evalData.spread_rate_mm_s
                  : ((evalData.flame_spread_rate_mm_s !== undefined && !isNaN(evalData.flame_spread_rate_mm_s)) ? evalData.flame_spread_rate_mm_s
                  : ((simTel.spread_rate_mm_s !== undefined && !isNaN(simTel.spread_rate_mm_s)) ? simTel.spread_rate_mm_s
                  : ((simTel.flame_spread_rate_mm_s !== undefined && !isNaN(simTel.flame_spread_rate_mm_s)) ? simTel.flame_spread_rate_mm_s : 2.10)));
      const vfVal = Number(rawVf).toFixed(2);

      const fluxVal = evalData.hull_heat_flux_kw_m2 !== undefined ? Number(evalData.hull_heat_flux_kw_m2)
                    : (simTel.hull_heat_flux_kw_m2 !== undefined ? Number(simTel.hull_heat_flux_kw_m2) : 0.0);
      const flux = `${fluxVal.toFixed(1)} kW/m²`;

      const dpVal = simTel.cabin_overpressure_kpa !== undefined ? Number(simTel.cabin_overpressure_kpa) : 0.0;
      const dp = `+${dpVal.toFixed(2)} kPa`;

      const isH2 = params && ['h2', 'hydrogen'].includes(String(params.fuel || '').toLowerCase());
      let coVal = '0.0 ppm';
      if (isH2) {
        coVal = '0.0 (H₂ Fuel)';
      } else if (evalData.time_series && Array.isArray(evalData.time_series.co_ppm) && evalData.time_series.co_ppm.length > 0) {
        const lastCO = evalData.time_series.co_ppm[evalData.time_series.co_ppm.length - 1];
        coVal = `${Number(lastCO).toFixed(1)} ppm`;
      } else if (evalData.toxic_co_ppm_600s !== undefined) {
        coVal = `${Number(evalData.toxic_co_ppm_600s).toFixed(1)} ppm`;
      } else {
        coVal = '24.5 ppm';
      }

      let smacStr = '> 600 s (SAFE)';
      let isSmacCritical = false;
      if (isH2) {
        smacStr = 'N/A (Carbon-free)';
      } else {
        const tSmac = evalData.time_to_smac_sec !== undefined ? evalData.time_to_smac_sec
                    : (simTel.time_to_smac_sec !== undefined ? simTel.time_to_smac_sec : 99999);
        if (tSmac < 600) {
          smacStr = `${Math.round(tSmac)} s (CRITICAL SMAC)`;
          isSmacCritical = true;
        }
      }

      grid.innerHTML = `
        <div class="telemetry-summary-item">
          <span class="telemetry-summary-label">Combustion Regime:</span>
          <span class="telemetry-summary-value highlight-cyan">${sanitize(rawRegime)}</span>
        </div>
        <div class="telemetry-summary-item">
          <span class="telemetry-summary-label">Flame Temp T_f:</span>
          <span class="telemetry-summary-value">${sanitize(tf)}</span>
        </div>
        <div class="telemetry-summary-item">
          <span class="telemetry-summary-label">Damköhler Da:</span>
          <span class="telemetry-summary-value">${sanitize(daVal)}</span>
        </div>
        <div class="telemetry-summary-item">
          <span class="telemetry-summary-label">Critical LOI_crit:</span>
          <span class="telemetry-summary-value">${sanitize(loiVal)}%</span>
        </div>
        <div class="telemetry-summary-item">
          <span class="telemetry-summary-label">Spread Rate V_f:</span>
          <span class="telemetry-summary-value highlight-cyan">${sanitize(vfVal)} mm/s</span>
        </div>
        <div class="telemetry-summary-item">
          <span class="telemetry-summary-label">Hull Heat Flux q''_w:</span>
          <span class="telemetry-summary-value ${fluxVal >= 28.0 ? 'highlight-danger' : (fluxVal > 15.0 ? 'highlight-cyan' : '')}">${sanitize(flux)}</span>
        </div>
        <div class="telemetry-summary-item">
          <span class="telemetry-summary-label">Peak ΔP Overpressure:</span>
          <span class="telemetry-summary-value ${dpVal >= 45.0 ? 'highlight-danger' : ''}">${sanitize(dp)}</span>
        </div>
        <div class="telemetry-summary-item">
          <span class="telemetry-summary-label">Toxic CO @ 600s:</span>
          <span class="telemetry-summary-value">${sanitize(coVal)}</span>
        </div>
        <div class="telemetry-summary-item" style="grid-column: span 2;">
          <span class="telemetry-summary-label">Time to SMAC 55 ppm:</span>
          <span class="telemetry-summary-value ${isSmacCritical ? 'highlight-danger' : 'highlight-safe'}">${sanitize(smacStr)}</span>
        </div>
      `;
    }

    renderMatrix() {
      const container = this.element.querySelector(`#${this.id}-table-container`);
      if (!container) return;

      const allRuns = (window.StandaloneAPI && Array.isArray(window.StandaloneAPI.NASA_EXPERIMENTS))
        ? window.StandaloneAPI.NASA_EXPERIMENTS
        : (this.data && this.data.sim_to_real && Array.isArray(this.data.sim_to_real.all_runs) ? this.data.sim_to_real.all_runs : []);

      let baseList = allRuns;

      if (this.filterMode === 'relevant') {
        const topMatches = (this.data && this.data.sim_to_real && Array.isArray(this.data.sim_to_real.top_matches) && this.data.sim_to_real.top_matches.length > 0)
          ? this.data.sim_to_real.top_matches
          : null;

        if (topMatches && topMatches.length > 0) {
          const matchedIds = new Set(topMatches.map(m => m.id));
          const topRunObjects = topMatches.map(m => {
            const found = allRuns.find(r => r.id === m.id);
            return found ? { ...found, match_pct: m.match_pct } : m;
          });
          const remaining = allRuns.filter(r => !matchedIds.has(r.id));
          baseList = [...topRunObjects, ...remaining].slice(0, 5);
        } else {
          baseList = allRuns.slice(0, 5);
        }
      }

      let filtered = baseList;
      if (this.filterText) {
        filtered = allRuns.filter(r => {
          const s = `${r.id} ${r.mission} ${r.investigation} ${r.fuel} ${r.fuel_display || ''} ${r.outcome || ''} ${r.measured_regime || ''}`.toLowerCase();
          return s.includes(this.filterText);
        });
      }

      let html = `
        <table class="psi-matrix-table">
          <thead>
            <tr>
              <th>Run ID</th>
              <th>Mission</th>
              <th>Fuel / Specimen</th>
              <th>O₂ %</th>
              <th>P atm</th>
              <th>V_g cm/s</th>
              <th>V_f mm/s</th>
              <th>Outcome</th>
              <th>NASA PSI ↗</th>
            </tr>
          </thead>
          <tbody>
      `;

      if (filtered.length === 0) {
        html += `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 14px;">No matching NASA PSI runs found</td></tr>`;
      } else {
        filtered.forEach(r => {
          const isActive = (r.id === this.activeBenchmarkId);
          const reg = String(r.measured_regime || 'nominal').toLowerCase();
          let outcomeClass = 'outcome-nominal';
          if (reg.includes('extinct')) outcomeClass = 'outcome-extinction';
          else if (reg.includes('cool')) outcomeClass = 'outcome-cool';
          else if (reg.includes('blast') || reg.includes('breach') || reg.includes('critical')) outcomeClass = 'outcome-breach';

          const outcomeText = r.outcome || reg.toUpperCase();
          const vf = (r.measured_vf_mm_s !== undefined && r.measured_vf_mm_s !== null) ? Number(r.measured_vf_mm_s).toFixed(2) : '0.00';
          const url = r.url || 'https://psi.nasa.gov/physci/repo/search?q=Saffire';

          html += `
            <tr class="${isActive ? 'active-psi-row' : ''}" data-run-id="${sanitize(r.id)}">
              <td style="font-weight: 700; color: ${isActive ? 'var(--color-go)' : '#FFFFFF'};">${sanitize(r.id)}</td>
              <td>${sanitize(r.mission || '')}</td>
              <td>${sanitize(r.fuel_display || r.fuel || '')}</td>
              <td>${Number(r.o2_percent || 21.0).toFixed(1)}%</td>
              <td>${Number(r.pressure_atm || 1.0).toFixed(2)}</td>
              <td>${Number(r.flow_velocity_cms || 10.0).toFixed(1)}</td>
              <td>${vf}</td>
              <td><span class="psi-outcome-tag ${outcomeClass}">${sanitize(outcomeText)}</span></td>
              <td><a href="${url}" target="_blank" rel="noopener noreferrer" class="badge-nasa" style="font-size: 8.5px;" onclick="event.stopPropagation();">NASA PSI ↗</a></td>
            </tr>
          `;
        });
      }

      html += `</tbody></table>`;
      container.innerHTML = html;

      // Bind row clicks: strict branch isolation (notify upstream simtoreal only)
      container.querySelectorAll('tbody tr').forEach(tr => {
        tr.addEventListener('click', (e) => {
          e.stopPropagation();
          const rId = tr.dataset.runId;
          if (!rId) return;

          this.activeBenchmarkId = rId;
          container.querySelectorAll('tbody tr').forEach(r => r.classList.remove('active-psi-row'));
          tr.classList.add('active-psi-row');

          // Strict branch isolation: notify ONLY upstream simtoreal on this branch
          const s2rNode = findUpstreamNode(this.id, 'simtoreal');
          if (s2rNode && typeof s2rNode.setActiveBenchmark === 'function') {
            s2rNode.setActiveBenchmark(rId);
          } else {
            const varNode = findUpstreamNode(this.id, 'variable');
            if (varNode) varNode.queueEvaluate();
          }

          showToast(`Calibrated branch with NASA benchmark ${rId}`);
        });
      });
    }

    onReceiveData(data, toPin = 'in') {
      super.onReceiveData(data, toPin);
      if (data && data.nearest_benchmark && data.nearest_benchmark.id) {
        if (!this.activeBenchmarkId) {
          this.activeBenchmarkId = data.nearest_benchmark.id;
        }
      }
      if (data && data.sim_to_real && data.sim_to_real.active_benchmark_id) {
        this.activeBenchmarkId = data.sim_to_real.active_benchmark_id;
      }
      this.renderTelemetrySummary();
      this.renderMatrix();
      // Strictly terminal: do NOT propagate downstream
    }
  }

  // -------------------------------------------------------------------------
  // NODE 1.85: AI DIFF // COMPARATOR (2-Pin Differential Safety)
  // -------------------------------------------------------------------------

  class AiDiffNode extends BaseNode {
    constructor(id, x, y, initialData = {}, width = 520, height = null, nodeScale = 1.0, accentColor = 'default') {
      super(id, 'aidiff', 'AI DIFF // COMPARATOR', x, y, width, height, nodeScale, accentColor);
      this.dataA = null;
      this.dataB = null;
      this.diffQuery = 'Compare Branch A and Branch B microgravity fire risks';
      this.init();
    }

    init() {
      const portsHtml = `
        <div class="pins-group-in">
          <div class="pin pin-in pin-in-a" data-pin="in_a" title="Wire Branch A / Network 1">
            <div class="pin-socket"></div>
            <span>IN A (Network 1)</span>
          </div>
          <div class="pin pin-in pin-in-b" data-pin="in_b" title="Wire Branch B / Network 2">
            <div class="pin-socket"></div>
            <span>IN B (Network 2)</span>
          </div>
        </div>
        <div class="pins-group-out">
          <div class="pin pin-out" data-pin="out" title="Differential Safety Output">
            <span>OUT (Diff Report)</span>
            <div class="pin-socket"></div>
          </div>
        </div>
      `;

      const bodyHtml = `
        <div class="diff-grid-container">
          <div class="diff-verdict-banner">
            <div>
              <div style="font-size: 9px; color: var(--text-muted); text-transform: uppercase;">Safer Configuration:</div>
              <div style="font-size: 13px; font-weight: 700; color: #FFFFFF;" id="${this.id}-verdict-text">Awaiting Dual Inputs...</div>
            </div>
            <div class="diff-verdict-tag equal" id="${this.id}-verdict-tag">CONNECT A & B</div>
          </div>

          <table class="diff-matrix-table" id="${this.id}-matrix-table">
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Branch A (Net 1)</th>
                <th>Branch B (Net 2)</th>
                <th>Delta (B - A)</th>
              </tr>
            </thead>
            <tbody id="${this.id}-matrix-tbody">
              <tr><td colspan="4" style="color: var(--text-muted); text-align: center; padding: 12px;">Connect wires from two branches to IN A and IN B to compare deltas</td></tr>
            </tbody>
          </table>

          <div class="diff-query-box">
            <input type="text" class="diff-query-input" id="${this.id}-query-input" value="${sanitize(this.diffQuery)}" placeholder="Ask AI Safety Officer differential comparison...">
            <button class="btn-diff-compare" id="${this.id}-btn-compare">COMPARE BLUEPRINTS</button>
          </div>

          <div class="diff-output-box" id="${this.id}-output-box">
            <div style="color: var(--text-muted); font-style: italic;">
              Differential flight safety advisory will appear here once compared.
            </div>
          </div>
        </div>
      `;

      this.createDOM('', portsHtml, bodyHtml, 'two-inputs');
      this.bindDiffEvents();
    }

    bindDiffEvents() {
      const qInput = this.element.querySelector(`#${this.id}-query-input`);
      if (qInput) {
        qInput.addEventListener('input', () => {
          this.diffQuery = qInput.value;
        });
      }

      const cmpBtn = this.element.querySelector(`#${this.id}-btn-compare`);
      if (cmpBtn) {
        cmpBtn.addEventListener('click', () => {
          this.executeComparison();
        });
      }
    }

    onReceiveData(data, toPin = 'in_a') {
      if (toPin === 'in_b') {
        this.dataB = data;
      } else if (toPin === 'in_a') {
        this.dataA = data;
      } else {
        if (!this.dataA) this.dataA = data;
        else this.dataB = data;
      }
      this.updateDiffView();
    }

    updateDiffView() {
      if (!this.dataA) this.dataA = resolveUpstreamBranchData(this.id, 'in_a');
      if (!this.dataB) this.dataB = resolveUpstreamBranchData(this.id, 'in_b');

      const pA = this.dataA ? (this.dataA.params || {}) : null;
      const pB = this.dataB ? (this.dataB.params || {}) : null;
      const eA = this.dataA ? (this.dataA.evaluation || {}) : null;
      const eB = this.dataB ? (this.dataB.evaluation || {}) : null;

      const vText = this.element.querySelector(`#${this.id}-verdict-text`);
      const vTag = this.element.querySelector(`#${this.id}-verdict-tag`);
      const tbody = this.element.querySelector(`#${this.id}-matrix-tbody`);
      if (!tbody) return;

      if (!pA && !pB) {
        tbody.innerHTML = `<tr><td colspan="4" style="color: var(--text-muted); text-align: center; padding: 12px;">Connect wires from two branches to IN A and IN B to compare deltas</td></tr>`;
        if (vText) vText.textContent = 'Awaiting Dual Inputs...';
        if (vTag) { vTag.className = 'diff-verdict-tag equal'; vTag.textContent = 'CONNECT A & B'; }
        return;
      }

      const o2A = pA ? Number(pA.o2_percent !== undefined ? pA.o2_percent : 21).toFixed(1) : '—';
      const o2B = pB ? Number(pB.o2_percent !== undefined ? pB.o2_percent : 21).toFixed(1) : '—';
      const deltaO2 = (pA && pB) ? (pB.o2_percent - pA.o2_percent).toFixed(1) : '—';

      const pAtmA = pA ? Number(pA.pressure_atm !== undefined ? pA.pressure_atm : 1).toFixed(2) : '—';
      const pAtmB = pB ? Number(pB.pressure_atm !== undefined ? pB.pressure_atm : 1).toFixed(2) : '—';
      const deltaP = (pA && pB) ? (pB.pressure_atm - pA.pressure_atm).toFixed(2) : '—';

      const vgA = pA ? Number(pA.flow_velocity_cms !== undefined ? pA.flow_velocity_cms : 10).toFixed(1) : '—';
      const vgB = pB ? Number(pB.flow_velocity_cms !== undefined ? pB.flow_velocity_cms : 10).toFixed(1) : '—';
      const deltaVg = (pA && pB) ? (pB.flow_velocity_cms - pA.flow_velocity_cms).toFixed(1) : '—';

      const tfA = eA ? Number(eA.t_flame_k || 1650).toFixed(0) : '—';
      const tfB = eB ? Number(eB.t_flame_k || 1650).toFixed(0) : '—';
      const deltaTf = (eA && eB) ? (eB.t_flame_k - eA.t_flame_k).toFixed(0) : '—';

      const vfA = eA ? Number(eA.flame_spread_rate_mm_s || 2).toFixed(2) : '—';
      const vfB = eB ? Number(eB.flame_spread_rate_mm_s || 2).toFixed(2) : '—';
      const deltaVf = (eA && eB) ? (eB.flame_spread_rate_mm_s - eA.flame_spread_rate_mm_s).toFixed(2) : '—';

      const fluxA = eA ? Number(eA.hull_heat_flux_kw_m2 || 5).toFixed(1) : '—';
      const fluxB = eB ? Number(eB.hull_heat_flux_kw_m2 || 5).toFixed(1) : '—';
      const deltaFlux = (eA && eB) ? (eB.hull_heat_flux_kw_m2 - eA.hull_heat_flux_kw_m2).toFixed(1) : '—';

      const riskA = eA ? Number(eA.fire_risk_score || 0).toFixed(1) : '—';
      const riskB = eB ? Number(eB.fire_risk_score || 0).toFixed(1) : '—';
      const deltaRisk = (eA && eB) ? (eB.fire_risk_score - eA.fire_risk_score).toFixed(1) : '—';

      const explA = eA ? Number(eA.explosion_risk_pct || 0).toFixed(1) : '—';
      const explB = eB ? Number(eB.explosion_risk_pct || 0).toFixed(1) : '—';
      const deltaExpl = (eA && eB) ? (eB.explosion_risk_pct - eA.explosion_risk_pct).toFixed(1) : '—';

      let riskDeltaClass = 'delta-neutral';
      if (eA && eB) {
        const dR = eB.fire_risk_score - eA.fire_risk_score;
        if (dR < -0.5) riskDeltaClass = 'delta-safer';
        else if (dR > 0.5) riskDeltaClass = 'delta-danger';
      }

      // Verdict
      if (eA && eB) {
        const scoreA = (eA.fire_risk_score || 0) + 2 * (eA.explosion_risk_pct || 0) + (eA.hull_breach_predicted ? 100 : 0);
        const scoreB = (eB.fire_risk_score || 0) + 2 * (eB.explosion_risk_pct || 0) + (eB.hull_breach_predicted ? 100 : 0);
        if (scoreA < scoreB - 1.0) {
          if (vText) vText.textContent = 'BRANCH A IS SAFER';
          if (vTag) { vTag.className = 'diff-verdict-tag safer-a'; vTag.textContent = 'BRANCH A SAFER'; }
        } else if (scoreB < scoreA - 1.0) {
          if (vText) vText.textContent = 'BRANCH B IS SAFER';
          if (vTag) { vTag.className = 'diff-verdict-tag safer-b'; vTag.textContent = 'BRANCH B SAFER'; }
        } else {
          if (vText) vText.textContent = 'EQUAL RISK PROFILES';
          if (vTag) { vTag.className = 'diff-verdict-tag equal'; vTag.textContent = 'EQUAL RISK'; }
        }
      }

      tbody.innerHTML = `
        <tr><td><b>Oxygen [O₂]</b></td><td>${o2A}%</td><td>${o2B}%</td><td>${deltaO2 !== '—' && Number(deltaO2) > 0 ? '+' : ''}${deltaO2}%</td></tr>
        <tr><td><b>Cabin Pressure [P]</b></td><td>${pAtmA} atm</td><td>${pAtmB} atm</td><td>${deltaP !== '—' && Number(deltaP) > 0 ? '+' : ''}${deltaP} atm</td></tr>
        <tr><td><b>Flow Velocity [V_g]</b></td><td>${vgA} cm/s</td><td>${vgB} cm/s</td><td>${deltaVg !== '—' && Number(deltaVg) > 0 ? '+' : ''}${deltaVg} cm/s</td></tr>
        <tr><td><b>Flame Temp [T_f]</b></td><td>${tfA} K</td><td>${tfB} K</td><td>${deltaTf !== '—' && Number(deltaTf) > 0 ? '+' : ''}${deltaTf} K</td></tr>
        <tr><td><b>Spread Rate [V_f]</b></td><td>${vfA} mm/s</td><td>${vfB} mm/s</td><td>${deltaVf !== '—' && Number(deltaVf) > 0 ? '+' : ''}${deltaVf} mm/s</td></tr>
        <tr><td><b>Heat Flux [q'']</b></td><td>${fluxA} kW/m²</td><td>${fluxB} kW/m²</td><td>${deltaFlux !== '—' && Number(deltaFlux) > 0 ? '+' : ''}${deltaFlux} kW/m²</td></tr>
        <tr><td><b>Fire Risk Score</b></td><td>${riskA}%</td><td>${riskB}%</td><td class="${riskDeltaClass}">${deltaRisk !== '—' && Number(deltaRisk) > 0 ? '+' : ''}${deltaRisk}%</td></tr>
        <tr><td><b>Explosion Risk</b></td><td>${explA}%</td><td>${explB}%</td><td>${deltaExpl !== '—' && Number(deltaExpl) > 0 ? '+' : ''}${deltaExpl}%</td></tr>
      `;
    }

    async executeComparison() {
      const cmpBtn = this.element.querySelector(`#${this.id}-btn-compare`);
      const outBox = this.element.querySelector(`#${this.id}-output-box`);
      if (cmpBtn) {
        cmpBtn.disabled = true;
        cmpBtn.textContent = 'COMPARING...';
      }

      try {
        const branchDataA = resolveUpstreamBranchData(this.id, 'in_a') || this.dataA || {};
        const branchDataB = resolveUpstreamBranchData(this.id, 'in_b') || this.dataB || {};

        const res = await fetch('/api/compare-blueprints', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            branch_a: branchDataA,
            branch_b: branchDataB,
            query: this.diffQuery,
            language: 'en'
          })
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();

        if (outBox) {
          let html = sanitize(result.advisory_text || '');
          html = html.replace(/###\s+(.+)/g, '<h4 style="color:#00E5FF; margin:6px 0;">$1</h4>');
          html = html.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
          html = html.replace(/^- (.+)/gm, '<li>$1</li>');
          html = html.replace(/(<li>.*<\/li>)/gs, '<ul style="margin-left: 14px;">$1</ul>');
          html = html.replace(/\n\n/g, '<br>');
          outBox.innerHTML = html;
        }

        this.data = result;
        propagateDataFrom(this.id, result);

        // Spawn a new connected AI BRIEF node to the right
        const briefNode = spawnNode('brief', this.x + this.width + 36, this.y, { title: 'AI BRIEF // DIFFERENTIAL SAFETY' }, null, null, this.nodeScale, this.accentColor);
        addWire(this.id, 'out', briefNode.id, 'in');
        briefNode.setBriefContent(result, this.diffQuery);
        saveGraphToLocalStorage();

        showToast('Differential comparison computed & Brief generated');
      } catch (err) {
        console.error('[AiDiffNode] Compare error:', err);
        showToast('Comparison error: ' + err.message);
      } finally {
        if (cmpBtn) {
          cmpBtn.disabled = false;
          cmpBtn.textContent = 'COMPARE BLUEPRINTS';
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // NODE 2: SIM (Spacecraft Cutaway & Verdict)
  // -------------------------------------------------------------------------

  class SimNode extends BaseNode {
    constructor(id, x, y, initialData = {}, width = 460, height = null, nodeScale = 1.0, accentColor = 'default') {
      super(id, 'sim', 'SIM // 2D FINITE-VOLUME SOLVER', x, y, width, height, nodeScale, accentColor);
      this.animFrameId = null;
      this.simGridMode = 'flame_o2'; // 'flame_o2' or 'thermal_hull'
      this.gridNx = 48;
      this.gridNy = 24;
      this.fieldT = new Float32Array(this.gridNx * this.gridNy);
      this.fieldO2 = new Float32Array(this.gridNx * this.gridNy);
      this.fieldT_next = new Float32Array(this.gridNx * this.gridNy);
      this.fieldO2_next = new Float32Array(this.gridNx * this.gridNy);
      this.offscreenCanvas = document.createElement('canvas');
      this.offscreenCanvas.width = this.gridNx;
      this.offscreenCanvas.height = this.gridNy;
      this.offscreenCtx = this.offscreenCanvas.getContext('2d');
      this.offscreenImg = this.offscreenCtx.createImageData(this.gridNx, this.gridNy);
      this.initGridFields(25.0, 0.21);
      this.particles = [];
      this.sootParticles = [];
      this.flamePulse = 0;
      this.blastWaveRadius = 0;
      this.stars = [];
      this.init();
    }

    initGridFields(initT, initO2) {
      for (let i = 0; i < this.gridNx * this.gridNy; i++) {
        this.fieldT[i] = initT;
        this.fieldO2[i] = initO2;
        this.fieldT_next[i] = initT;
        this.fieldO2_next[i] = initO2;
      }
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

      const headerExtra = `
        <div class="sim-mode-toggle">
          <button class="btn-sim-mode active" id="${this.id}-btn-mode-flame" data-mode="flame_o2">FLAME + O₂ FIELD</button>
          <button class="btn-sim-mode" id="${this.id}-btn-mode-hull" data-mode="thermal_hull">THERMAL HULL MAP</button>
        </div>
      `;

      const bodyHtml = `
        <div class="cutaway-canvas-container">
          <canvas id="${this.id}-canvas" width="436" height="230"></canvas>
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

      this.createDOM(headerExtra, portsHtml, bodyHtml);
      this.bindSimModeEvents();
      this.initParticles();
      this.startCanvasAnimation();

      if (window.ResizeObserver) {
        this.resizeObserver = new ResizeObserver(() => this.onResize());
        this.resizeObserver.observe(this.element);
      }
    }

    bindSimModeEvents() {
      const btnFlame = this.element.querySelector(`#${this.id}-btn-mode-flame`);
      const btnHull = this.element.querySelector(`#${this.id}-btn-mode-hull`);
      if (btnFlame && btnHull) {
        btnFlame.addEventListener('click', (e) => {
          e.stopPropagation();
          this.simGridMode = 'flame_o2';
          btnFlame.classList.add('active');
          btnHull.classList.remove('active');
        });
        btnHull.addEventListener('click', (e) => {
          e.stopPropagation();
          this.simGridMode = 'thermal_hull';
          btnHull.classList.add('active');
          btnFlame.classList.remove('active');
        });
      }
    }

    initParticles() {
      this.stars = [];
      for (let i = 0; i < 45; i++) {
        this.stars.push({
          x: Math.random() * 436,
          y: Math.random() * 230,
          size: Math.random() * 1.5 + 0.5,
          alpha: Math.random() * 0.7 + 0.3
        });
      }
      this.particles = [];
      for (let i = 0; i < 26; i++) {
        this.particles.push({
          x: 95 + Math.random() * 250,
          y: 30 + Math.random() * 165,
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

    stepSolver(params, simTel) {
      const Nx = this.gridNx;
      const Ny = this.gridNy;
      const vg = Math.max(0.1, parseFloat(params.flow_velocity_cms || 10.0));
      const o2_raw = parseFloat(params.o2_percent || 21.0);
      const Y_O2_inlet = Math.max(0.05, Math.min(1.0, o2_raw / 100.0));
      const mode = simTel.flame_color_mode || 'sooty_yellow';
      const isExtinguished = (mode === 'extinguished');
      const isCoolFlame = (mode === 'cool_flame');
      const isExplosion = (mode === 'explosion_flash');

      let T_flame_target = 1650.0;
      if (isExtinguished) T_flame_target = 25.0;
      else if (isCoolFlame) T_flame_target = 680.0;
      else if (isExplosion) T_flame_target = 2300.0;
      else T_flame_target = 1350.0 + (o2_raw - 21.0) * 22.0;

      const u0 = Math.min(0.42, Math.max(0.04, vg * 0.016));
      const alpha_diff = 0.065;
      const d_diff = 0.075;

      const fcX = 13;
      const fcY = 12;
      this.flamePulse += 0.05;
      const pulseMod = Math.sin(this.flamePulse * 3.0) * 0.12;

      for (let i = 0; i < Nx; i++) {
        for (let j = 0; j < Ny; j++) {
          const idx = i * Ny + j;

          // 1. Left Boundary: Inflow of fresh ECLSS air
          if (i === 0) {
            this.fieldT_next[idx] = 25.0;
            this.fieldO2_next[idx] = Y_O2_inlet;
            continue;
          }

          // 2. Right Boundary: Convective/Radiative Heat Transfer to Cabin Bulkhead
          if (i === Nx - 1) {
            const leftIdx = (Nx - 2) * Ny + j;
            this.fieldT_next[idx] = this.fieldT[leftIdx] - 0.18 * (this.fieldT[leftIdx] - 25.0);
            this.fieldO2_next[idx] = this.fieldO2[leftIdx];
            continue;
          }

          // Top and Bottom Boundary Walls (adiabatic/cooled)
          if (j === 0 || j === Ny - 1) {
            const innerJ = j === 0 ? 1 : Ny - 2;
            const innerIdx = i * Ny + innerJ;
            this.fieldT_next[idx] = this.fieldT[innerIdx] * 0.94 + 25.0 * 0.06;
            this.fieldO2_next[idx] = this.fieldO2[innerIdx];
            continue;
          }

          const normY = j / (Ny - 1);
          const u_local = 4.0 * u0 * normY * (1.0 - normY) + 0.06 * u0;

          const idxL = (i - 1) * Ny + j;
          const idxR = (i + 1) * Ny + j;
          const idxB = i * Ny + (j - 1);
          const idxT = i * Ny + (j + 1);

          const T_c = this.fieldT[idx];
          const O2_c = this.fieldO2[idx];

          const advT = - u_local * (T_c - this.fieldT[idxL]);
          const advO2 = - u_local * (O2_c - this.fieldO2[idxL]);

          const lapT = this.fieldT[idxR] + this.fieldT[idxL] + this.fieldT[idxT] + this.fieldT[idxB] - 4.0 * T_c;
          const lapO2 = this.fieldO2[idxR] + this.fieldO2[idxL] + this.fieldO2[idxT] + this.fieldO2[idxB] - 4.0 * O2_c;

          const dx = i - fcX;
          const dy = j - fcY;
          const r2 = (dx * dx) / 1.5 + dy * dy;

          let Q_chem = 0;
          let S_O2 = 0;

          if (!isExtinguished && O2_c > 0.02) {
            if (isExplosion) {
              if (r2 < 48.0) {
                const w = Math.exp(- r2 / 24.0) * (O2_c / Y_O2_inlet);
                Q_chem = w * (T_flame_target - T_c) * 0.35;
                S_O2 = - w * O2_c * 0.25;
              }
            } else if (r2 < 28.0) {
              const w = Math.exp(- r2 / (10.0 + pulseMod * 2.0)) * (O2_c / Y_O2_inlet);
              Q_chem = w * (T_flame_target - T_c) * 0.22;
              S_O2 = - w * O2_c * 0.16; // Oxygen sink generates downstream depleted oxygen shadow
            }
          }

          const Q_rad = 0.0035 * (T_c - 25.0);

          let nextT = T_c + advT + alpha_diff * lapT + Q_chem - Q_rad;
          let nextO2 = O2_c + advO2 + d_diff * lapO2 + S_O2;

          this.fieldT_next[idx] = Math.max(25.0, Math.min(2400.0, nextT));
          this.fieldO2_next[idx] = Math.max(0.008, Math.min(1.0, nextO2));
        }
      }

      const tmpT = this.fieldT;
      this.fieldT = this.fieldT_next;
      this.fieldT_next = tmpT;

      const tmpO2 = this.fieldO2;
      this.fieldO2 = this.fieldO2_next;
      this.fieldO2_next = tmpO2;
    }

    renderSolverToImageData(isCoolFlame, Y_O2_inlet) {
      const Nx = this.gridNx;
      const Ny = this.gridNy;
      const data = this.offscreenImg.data;
      const isHullMap = (this.simGridMode === 'thermal_hull');

      for (let j = 0; j < Ny; j++) {
        for (let i = 0; i < Nx; i++) {
          const idx = i * Ny + j;
          const pixelIdx = (j * Nx + i) * 4;
          const T = this.fieldT[idx];
          const O2 = this.fieldO2[idx];

          if (isHullMap) {
            const tau = Math.min(1.0, Math.max(0.0, (T - 25.0) / 1400.0));
            if (tau < 0.15) {
              const f = tau / 0.15;
              data[pixelIdx]     = Math.round(15 + f * 20);
              data[pixelIdx + 1] = Math.round(25 + f * 100);
              data[pixelIdx + 2] = Math.round(80 + f * 120);
              data[pixelIdx + 3] = 230;
            } else if (tau < 0.40) {
              const f = (tau - 0.15) / 0.25;
              data[pixelIdx]     = Math.round(20 + f * 30);
              data[pixelIdx + 1] = Math.round(125 + f * 100);
              data[pixelIdx + 2] = Math.round(200 - f * 150);
              data[pixelIdx + 3] = 240;
            } else if (tau < 0.70) {
              const f = (tau - 0.40) / 0.30;
              data[pixelIdx]     = Math.round(220 + f * 35);
              data[pixelIdx + 1] = Math.round(180 - f * 80);
              data[pixelIdx + 2] = 20;
              data[pixelIdx + 3] = 250;
            } else {
              const f = (tau - 0.70) / 0.30;
              data[pixelIdx]     = 255;
              data[pixelIdx + 1] = Math.round(100 + f * 155);
              data[pixelIdx + 2] = Math.round(40 + f * 215);
              data[pixelIdx + 3] = 255;
            }
          } else {
            if (T > 280.0) {
              if (isCoolFlame) {
                const f = Math.min(1.0, (T - 280.0) / 400.0);
                data[pixelIdx]     = Math.round(40 + f * 120);
                data[pixelIdx + 1] = Math.round(160 + f * 80);
                data[pixelIdx + 2] = 255;
                data[pixelIdx + 3] = Math.round(180 + f * 70);
              } else if (T > 1200.0) {
                const f = Math.min(1.0, (T - 1200.0) / 500.0);
                data[pixelIdx]     = 255;
                data[pixelIdx + 1] = Math.round(235 + f * 20);
                data[pixelIdx + 2] = Math.round(150 + f * 105);
                data[pixelIdx + 3] = 255;
              } else if (T > 750.0) {
                const f = (T - 750.0) / 450.0;
                data[pixelIdx]     = 255;
                data[pixelIdx + 1] = Math.round(140 + f * 95);
                data[pixelIdx + 2] = Math.round(20 + f * 60);
                data[pixelIdx + 3] = 250;
              } else {
                const f = (T - 280.0) / 470.0;
                data[pixelIdx]     = Math.round(190 + f * 65);
                data[pixelIdx + 1] = Math.round(25 + f * 95);
                data[pixelIdx + 2] = 15;
                data[pixelIdx + 3] = Math.round(190 + f * 55);
              }
            } else {
              const o2Norm = Math.min(1.0, Math.max(0.0, O2 / Y_O2_inlet));
              if (o2Norm > 0.65) {
                const f = (o2Norm - 0.65) / 0.35;
                data[pixelIdx]     = Math.round(8 + f * 8);
                data[pixelIdx + 1] = Math.round(28 + f * 28);
                data[pixelIdx + 2] = Math.round(55 + f * 65);
                data[pixelIdx + 3] = Math.round(160 + f * 60);
              } else {
                const f = o2Norm / 0.65;
                data[pixelIdx]     = Math.round(14 - f * 6);
                data[pixelIdx + 1] = Math.round(12 + f * 16);
                data[pixelIdx + 2] = Math.round(28 + f * 27);
                data[pixelIdx + 3] = Math.round(210 - f * 50);
              }
            }
          }
        }
      }
      this.offscreenCtx.putImageData(this.offscreenImg, 0, 0);
    }

    drawScene(ctx, w, h) {
      ctx.clearRect(0, 0, w, h);

      // Deep Space Vacuum Background
      const spaceGrad = ctx.createLinearGradient(0, 0, 0, h);
      spaceGrad.addColorStop(0, '#030509');
      spaceGrad.addColorStop(1, '#070C18');
      ctx.fillStyle = spaceGrad;
      ctx.fillRect(0, 0, w, h);

      // Background stars
      ctx.fillStyle = '#FFFFFF';
      this.stars.forEach(st => {
        ctx.globalAlpha = st.alpha * (0.8 + Math.sin(Date.now() * 0.003 + st.x) * 0.2);
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1.0;

      // Telemetry
      const evalData = this.data ? this.data.evaluation : null;
      const params = this.data ? this.data.params : { flow_velocity_cms: 10, o2_percent: 21 };
      const simTel = evalData ? (evalData.sim_telemetry || {}) : {};

      const vg = parseFloat(params.flow_velocity_cms || 10.0);
      const o2_raw = parseFloat(params.o2_percent || 21.0);
      const Y_O2_inlet = Math.max(0.05, Math.min(1.0, o2_raw / 100.0));
      const mode = simTel.flame_color_mode || 'sooty_yellow';
      const isCoolFlame = (mode === 'cool_flame');
      const breach = evalData ? evalData.breach_outside_risk : false;
      const heatFlux = parseFloat(simTel.hull_heat_flux_kw_m2 || 0.5);

      // Execute 2D Finite-Volume Advection-Diffusion Solver Step
      this.stepSolver(params, simTel);
      this.renderSolverToImageData(isCoolFlame, Y_O2_inlet);

      // Spacecraft Hull Cutaway Geometry
      const cabinX = 85;
      const cabinY = 22;
      const cabinW = 266;
      const cabinH = 180;
      const radius = 24;

      // Thermal hull wall radiation glow
      if (heatFlux > 1.0) {
        ctx.save();
        const glowRad = Math.min(60, heatFlux * 0.35);
        const hullGlow = ctx.createRadialGradient(cabinX + cabinW, cabinY + 90, 5, cabinX + cabinW, cabinY + 90, glowRad + 20);
        hullGlow.addColorStop(0, `rgba(255, 60, 30, ${Math.min(0.85, heatFlux * 0.015)})`);
        hullGlow.addColorStop(1, 'rgba(255, 40, 10, 0)');
        ctx.fillStyle = hullGlow;
        ctx.beginPath();
        ctx.arc(cabinX + cabinW, cabinY + 90, glowRad + 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Outer Structural Shell
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

      // 2D Finite-Volume Solver Layer inside Cabin Interior
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(cabinX + 6, cabinY + 6, cabinW - 12, cabinH - 12, radius - 4);
      ctx.clip();

      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.offscreenCanvas, cabinX + 6, cabinY + 6, cabinW - 12, cabinH - 12);

      // Flow Velocity Vectors V_g at Inlet (Forced ECLSS Ventilation Flow)
      ctx.save();
      const arrowLen = Math.min(26, Math.max(8, vg * 1.3));
      const arrowYPositions = [cabinY + 45, cabinY + 75, cabinY + 105, cabinY + 135];
      ctx.strokeStyle = '#00E5FF';
      ctx.fillStyle = '#00E5FF';
      ctx.lineWidth = 1.4;
      arrowYPositions.forEach(ay => {
        const ax = cabinX + 16;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + arrowLen, ay);
        ctx.stroke();
        // Arrowhead
        ctx.beginPath();
        ctx.moveTo(ax + arrowLen, ay);
        ctx.lineTo(ax + arrowLen - 4, ay - 3);
        ctx.lineTo(ax + arrowLen - 4, ay + 3);
        ctx.closePath();
        ctx.fill();
      });
      ctx.font = '8px "JetBrains Mono"';
      ctx.fillStyle = '#00E5FF';
      ctx.fillText(`V_g = ${vg.toFixed(1)} cm/s`, cabinX + 16, cabinY + 34);
      ctx.restore();

      // Isotherm Contours Overlay
      if (mode !== 'extinguished') {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.28)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        const fcX = cabinX + (13 / this.gridNx) * cabinW;
        const fcY = cabinY + (12 / this.gridNy) * cabinH;
        [16, 32, 54].forEach((rad, rIdx) => {
          ctx.beginPath();
          ctx.ellipse(fcX + rIdx * 6, fcY, rad * 1.2, rad * 0.85, 0, 0, Math.PI * 2);
          ctx.stroke();
        });
        ctx.restore();
      }

      // Draw Flow Streamlines & Dust Particles
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

      // Mode-specific labels inside solver viewport
      if (this.simGridMode === 'thermal_hull') {
        ctx.font = '8px "JetBrains Mono"';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'right';
        ctx.fillText(`HULL FLUX: ${heatFlux.toFixed(1)} kW/m²`, cabinX + cabinW - 14, cabinY + 24);
        ctx.fillStyle = heatFlux > 1.5 ? '#EF4444' : '#10B981';
        ctx.fillText(`T_HULL: ${(25.0 + heatFlux * 14.5).toFixed(0)}°C`, cabinX + cabinW - 14, cabinY + 36);

        const barX = cabinX + cabinW - 10;
        const barY = cabinY + 44;
        const barH = 70;
        const gradBar = ctx.createLinearGradient(0, barY, 0, barY + barH);
        gradBar.addColorStop(0, '#FFFFFF');
        gradBar.addColorStop(0.3, '#EF4444');
        gradBar.addColorStop(0.6, '#F59E0B');
        gradBar.addColorStop(1, '#06B6D4');
        ctx.fillStyle = gradBar;
        ctx.fillRect(barX - 4, barY, 4, barH);
      } else {
        ctx.font = '8px "JetBrains Mono"';
        ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
        ctx.textAlign = 'left';
        ctx.fillText(`INFLOW [${o2_raw.toFixed(1)}% O₂] →`, cabinX + 14, cabinY + 24);

        if (mode !== 'extinguished') {
          ctx.fillStyle = 'rgba(168, 85, 247, 0.9)';
          ctx.fillText(`[O₂ SHADOW WAKE]`, cabinX + 120, cabinY + 24);
        }
      }

      ctx.restore();

      // ECLSS Ventilation Ducts & Grilles (Top & Bottom)
      ctx.fillStyle = '#172033';
      ctx.fillRect(cabinX + 20, cabinY + 8, cabinW - 40, 6);
      ctx.fillRect(cabinX + 20, cabinY + cabinH - 14, cabinW - 40, 6);

      ctx.fillStyle = 'rgba(0, 229, 255, 0.4)';
      for (let gx = cabinX + 28; gx < cabinX + cabinW - 30; gx += 16) {
        ctx.fillRect(gx, cabinY + 8, 4, 6);
        ctx.fillRect(gx, cabinY + cabinH - 14, 4, 6);
      }

      // Localized Thermal Bulkhead Footprint on Right Wall
      ctx.save();
      const wallX = cabinX + cabinW - 5;
      const wallY = cabinY + cabinH / 2;
      const fpRad = Math.min(50, Math.max(14, heatFlux * 1.8));
      const wallFootprint = ctx.createRadialGradient(wallX, wallY, 2, wallX, wallY, fpRad);
      wallFootprint.addColorStop(0, `rgba(255, 69, 0, ${Math.min(0.9, 0.15 + heatFlux * 0.04)})`);
      wallFootprint.addColorStop(0.5, `rgba(245, 158, 11, ${Math.min(0.6, 0.08 + heatFlux * 0.02)})`);
      wallFootprint.addColorStop(1, 'rgba(239, 68, 68, 0)');
      ctx.fillStyle = wallFootprint;
      ctx.beginPath();
      ctx.ellipse(wallX, wallY, 10, fpRad, 0, 0, Math.PI * 2);
      ctx.fill();

      if (heatFlux > 0.8) {
        ctx.font = '8px "JetBrains Mono"';
        ctx.fillStyle = heatFlux > 15.0 ? '#EF4444' : '#F59E0B';
        ctx.textAlign = 'right';
        ctx.fillText(`q''_w = ${heatFlux.toFixed(1)} kW/m²`, cabinX + cabinW - 14, cabinY + cabinH - 20);
      }
      ctx.restore();

      // Exterior Spacecraft Hull Breach (Inside -> Outside Blowout into Vacuum)
      if (breach) {
        ctx.save();
        const breachX = cabinX + cabinW;
        const breachY = cabinY + 75;

        ctx.fillStyle = '#05070B';
        ctx.beginPath();
        ctx.ellipse(breachX, breachY, 6, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#EF4444';
        ctx.lineWidth = 2.5;
        ctx.stroke();

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
      const params = this.data.params || {};

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
      if (reasonsList) {
        if (Array.isArray(evalData.objective_reasons) && evalData.objective_reasons.length > 0) {
          reasonsList.innerHTML = evalData.objective_reasons
            .map(r => `<li>${sanitize(r)}</li>`)
            .join('');
        } else {
          const isRu = (state.language === 'ru');
          const o2Val = parseFloat(params.o2_percent || 21.0);
          const vgVal = parseFloat(params.flow_velocity_cms || 10.0);
          let daVal = null;
          if (evalData.damkohler_da !== undefined && !isNaN(evalData.damkohler_da)) {
            daVal = Number(evalData.damkohler_da).toFixed(3);
          } else if (simTel.damkohler_da !== undefined && !isNaN(simTel.damkohler_da)) {
            daVal = Number(simTel.damkohler_da).toFixed(3);
          } else {
            const pBar = params && params.pressure_atm !== undefined ? Number(params.pressure_atm) : 1.0;
            const xO2 = o2Val / 100.0;
            const vgMs = vgVal / 100.0;
            const tauFlow = 0.008 / (vgMs + 0.005);
            const rateFactor = 3.2e7 * Math.pow(pBar, 1.75) * xO2 * Math.exp(-14500.0 / 1500.0);
            const tauChem = 1.0 / Math.max(rateFactor, 1.0e-5);
            daVal = (tauFlow / tauChem).toFixed(3);
          }
          const rMode = (simTel.flame_color_mode || 'steady').toUpperCase();
          const qVal = (simTel.hull_heat_flux_kw_m2 || 0.5).toFixed(1);
          const dpVal = (simTel.cabin_overpressure_kpa || 0.0).toFixed(1);
          const loiVal = simTel.loi_crit_pct !== undefined ? Number(simTel.loi_crit_pct).toFixed(1) : '14.8';
          const reasonsEn = [
            `Combustion Regime: ${rMode} (Damköhler Da ≈ ${daVal} vs critical Da_ext = 0.45).`,
            `Thermal & Structural Load: Localized hull heat flux = ${qVal} kW/m² (limit: 28 kW/m²), Delta P = ${dpVal} kPa.`,
            `Ventilation Dynamics: Forced ECLSS flow V_g = ${vgVal.toFixed(1)} cm/s at 0g microgravity (LOI_crit = ${loiVal}%).`,
            `Atmospheric Composition: ${o2Val.toFixed(1)}% O₂ in compartment (CO accumulation monitored vs NASA SMAC 55 ppm).`
          ];
          reasonsList.innerHTML = reasonsEn.map(r => `<li>${sanitize(r)}</li>`).join('');
        }
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

    onResize() {
      const container = this.element.querySelector('.cutaway-canvas-container');
      const canvas = this.element.querySelector(`#${this.id}-canvas`);
      if (container && canvas) {
        if (this.nodeScale && this.nodeScale > 1.0) {
          const scaledH = Math.round(180 * this.nodeScale);
          container.style.height = `${scaledH}px`;
        } else {
          container.style.height = '';
        }
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        if (cw > 40 && ch > 40 && (canvas.width !== cw || canvas.height !== ch)) {
          canvas.width = cw;
          canvas.height = ch;
        }
      }
    }

    onDestroy() {
      if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
      if (this.resizeObserver) this.resizeObserver.disconnect();
    }
  }

  // -------------------------------------------------------------------------
  // NODE 3: GRAPH (Time Telemetry Curve & NASA PSI Data Table)
  // -------------------------------------------------------------------------

  class GraphNode extends BaseNode {
    constructor(id, x, y, initialData = {}, width = 460, height = null, nodeScale = 1.0, accentColor = 'default') {
      super(id, 'graph', 'GRAPH // TIME TELEMETRY (0–600s)', x, y, width, height, nodeScale, accentColor);
      this.selectedChannel = 'spread'; // 'spread', 'temp', 'pressure', 'co'
      this.viewMode = 'curves'; // 'curves' or 'table'
      this.init();
    }

    setChannel(channel) {
      if (['spread', 'temp', 'pressure', 'co'].includes(channel)) {
        this.selectedChannel = channel;
        const select = this.element.querySelector(`#${this.id}-channel-select`);
        if (select) select.value = channel;
        if (this.viewMode === 'curves') this.renderGraph();
      }
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
        <div class="graph-header-controls">
          <div class="graph-view-tabs">
            <button class="btn-graph-tab ${this.viewMode === 'curves' ? 'active' : ''}" id="${this.id}-tab-curves" data-tab="curves">📈 TIME SERIES CURVES</button>
            <button class="btn-graph-tab ${this.viewMode === 'table' ? 'active' : ''}" id="${this.id}-tab-table" data-tab="table">📋 NASA PSI DATA TABLE</button>
          </div>
          <div class="graph-channel-select-wrap" id="${this.id}-channel-select-wrap">
            <select id="${this.id}-channel-select">
              <option value="spread">Flame Front Spread L(t) [cm]</option>
              <option value="temp">Cabin Temperature T(t) [°C]</option>
              <option value="pressure">Overpressure Transient ΔP(t) [kPa] (Hull Limit 45 kPa)</option>
              <option value="co" selected>Toxic CO Level [ppm] (NASA SMAC 55 ppm)</option>
            </select>
          </div>
        </div>

        <div class="graph-canvas-container" id="${this.id}-canvas-container">
          <canvas id="${this.id}-graph-canvas" width="436" height="205"></canvas>
          <div class="graph-tooltip" id="${this.id}-tooltip"></div>
        </div>

        <div class="graph-table-container" id="${this.id}-table-container" style="display: none;"></div>
      `;

      this.createDOM('', portsHtml, bodyHtml);
      this.bindGraphEvents();
      this.renderGraph();
      this.checkTableBanner();

      if (window.ResizeObserver) {
        this.resizeObserver = new ResizeObserver(() => this.onResize());
        this.resizeObserver.observe(this.element);
      }
    }

    bindGraphEvents() {
      const select = this.element.querySelector(`#${this.id}-channel-select`);
      if (select) {
        select.addEventListener('change', () => {
          this.selectedChannel = select.value;
          this.renderGraph();
        });
      }

      const tabCurves = this.element.querySelector(`#${this.id}-tab-curves`);
      const tabTable = this.element.querySelector(`#${this.id}-tab-table`);
      const canvasContainer = this.element.querySelector(`#${this.id}-canvas-container`);
      const tableContainer = this.element.querySelector(`#${this.id}-table-container`);
      const channelSelectWrap = this.element.querySelector(`#${this.id}-channel-select-wrap`);

      if (tabCurves && tabTable) {
        tabCurves.addEventListener('click', (e) => {
          e.stopPropagation();
          this.viewMode = 'curves';
          tabCurves.classList.add('active');
          tabTable.classList.remove('active');
          if (canvasContainer) canvasContainer.style.display = 'block';
          if (channelSelectWrap) channelSelectWrap.style.display = 'block';
          if (tableContainer) tableContainer.style.display = 'none';
          this.renderGraph();
        });

        tabTable.addEventListener('click', (e) => {
          e.stopPropagation();
          this.viewMode = 'table';
          tabTable.classList.add('active');
          tabCurves.classList.remove('active');
          if (canvasContainer) canvasContainer.style.display = 'none';
          if (channelSelectWrap) channelSelectWrap.style.display = 'none';
          if (tableContainer) tableContainer.style.display = 'block';
          this.renderTable();
        });
      }

      const canvas = this.element.querySelector(`#${this.id}-graph-canvas`);
      const tooltip = this.element.querySelector(`#${this.id}-tooltip`);

      if (canvas && tooltip) {
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
    }

    renderTable() {
      const container = this.element.querySelector(`#${this.id}-table-container`);
      if (!container) return;

      const simToReal = this.data ? this.data.sim_to_real : null;
      let runs = (simToReal && Array.isArray(simToReal.all_benchmarks)) ? simToReal.all_benchmarks : [];
      if (!runs || runs.length === 0) {
        runs = window.NASA_FLIGHT_EXPERIMENTS || [];
      }

      const activeId = (simToReal && simToReal.active_benchmark_id) || (this.data && this.data.nearest_benchmark && this.data.nearest_benchmark.benchmark_id) || 'SAFFIRE-V-01';

      if (!runs || runs.length === 0) {
        container.innerHTML = `<div style="padding: 18px; color: var(--text-muted); font-family: var(--font-mono); font-size: 11px; text-align: center;">Awaiting NASA PSI telemetry stream...</div>`;
        return;
      }

      let html = `
        <table class="psi-table">
          <thead>
            <tr>
              <th>Run ID</th>
              <th>Mission</th>
              <th>Fuel</th>
              <th>O₂ [%]</th>
              <th>P [atm]</th>
              <th>V_g [cm/s]</th>
              <th>V_f [mm/s]</th>
              <th>CO/CO₂</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
      `;

      runs.forEach(r => {
        const isActive = (r.id === activeId || r.id === (activeId + ''));
        const reg = String(r.measured_regime || 'nominal').toLowerCase();
        let outcomeClass = 'outcome-nominal';
        if (reg.includes('extinct')) outcomeClass = 'outcome-extinction';
        else if (reg.includes('cool')) outcomeClass = 'outcome-cool';
        else if (reg.includes('blast') || reg.includes('breach') || reg.includes('critical')) outcomeClass = 'outcome-breach';

        const outcomeText = r.outcome || (reg.toUpperCase());
        const coRatio = r.co_ratio !== undefined ? r.co_ratio : '—';
        const vf = (r.measured_vf_mm_s !== undefined && r.measured_vf_mm_s !== null) ? Number(r.measured_vf_mm_s).toFixed(2) : '0.00';

        html += `
          <tr class="${isActive ? 'active-psi-row' : ''}" data-run-id="${sanitize(r.id || '')}">
            <td style="font-weight: 700; color: ${isActive ? '#00E5FF' : '#FFFFFF'};">${sanitize(r.id || '')}</td>
            <td>${sanitize(r.mission || '')}</td>
            <td>${sanitize(r.fuel_display || r.fuel || '')}</td>
            <td>${Number(r.o2_percent || 21.0).toFixed(1)}%</td>
            <td>${Number(r.pressure_atm || 1.0).toFixed(2)}</td>
            <td>${Number(r.flow_velocity_cms || 10.0).toFixed(1)}</td>
            <td>${vf}</td>
            <td>${coRatio}</td>
            <td><span class="psi-outcome-tag ${outcomeClass}">${sanitize(outcomeText)}</span></td>
          </tr>
        `;
      });

      html += `</tbody></table>`;
      container.innerHTML = html;

      // Click to select active benchmark
      const rows = container.querySelectorAll('.psi-table tbody tr');
      rows.forEach(tr => {
        tr.addEventListener('click', (e) => {
          e.stopPropagation();
          const rId = tr.dataset.runId;
          if (rId) {
            const s2rNode = findUpstreamNode(this.id, 'simtoreal') || findDownstreamNode(this.id, 'simtoreal');
            if (s2rNode && typeof s2rNode.setActiveBenchmark === 'function') {
              s2rNode.setActiveBenchmark(rId);
            } else {
              const varNode = findUpstreamNode(this.id, 'variable');
              if (varNode) varNode.queueEvaluate();
            }
            rows.forEach(r => r.classList.remove('active-psi-row'));
            tr.classList.add('active-psi-row');
          }
        });
      });
    }

    onReceiveData(data) {
      super.onReceiveData(data);
      if (this.viewMode === 'table') {
        this.renderTable();
      } else {
        this.renderGraph();
      }
      this.checkTableBanner();
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
      const simToReal = this.data ? this.data.sim_to_real : null;
      const overlay = (simToReal && simToReal.real_data_overlay) ? simToReal.real_data_overlay : null;
      const hasDirectFlightData = simToReal && (simToReal.has_direct_flight_data === true);

      // Check stream source: 'calibrated' if incoming wire from simtoreal, 'eval' if from variable or direct
      const incomingWires = state.wires.filter(w => w.toNode === this.id);
      let streamSource = 'eval';
      for (const w of incomingWires) {
        const src = state.nodes.get(w.fromNode);
        if (src && src.type === 'simtoreal') {
          streamSource = 'calibrated';
          break;
        }
      }

      const tSec = (series && series.t_sec) ? series.t_sec : [0, 100, 200, 300, 400, 500, 600];
      let yValues = [];
      let yMinValues = [];
      let yMaxValues = [];
      let yRealPoints = [];
      let yUnit = '';
      let thresholdVal = null;
      let thresholdLabel = '';
      let strokeColor = '#38BDF8';

      if (this.selectedChannel === 'spread') {
        yValues = (series && series.front_cm) ? series.front_cm : [0, 2, 4, 6, 8, 10, 12];
        yMinValues = (series && series.front_cm_min) ? series.front_cm_min : yValues.map(v => v * 0.94);
        yMaxValues = (series && series.front_cm_max) ? series.front_cm_max : yValues.map(v => v * 1.06);
        yUnit = 'cm';
        strokeColor = '#10B981';
      } else if (this.selectedChannel === 'temp') {
        yValues = (series && series.cabin_temp_c) ? series.cabin_temp_c : [25, 28, 32, 38, 45, 52, 60];
        yMinValues = (series && series.temp_c_min) ? series.temp_c_min : yValues.map(v => Math.max(25, v - 2.5));
        yMaxValues = (series && series.temp_c_max) ? series.temp_c_max : yValues.map(v => v + 2.5);
        yUnit = '°C';
        strokeColor = '#F59E0B';
      } else if (this.selectedChannel === 'pressure') {
        const pBaseKPa = (this.data && this.data.params) ? (parseFloat(this.data.params.pressure_atm || 1.0) * 101.325) : 101.325;
        const rawP = (series && series.cabin_pressure_kpa) ? series.cabin_pressure_kpa : [101.3, 101.4, 101.7, 102.2, 102.9, 103.8, 104.5];
        yValues = rawP.map(p => Math.max(0.0, Number((p - pBaseKPa).toFixed(2))));
        yMinValues = (series && series.pressure_kpa_min)
          ? series.pressure_kpa_min.map(p => Math.max(0.0, Number((p - pBaseKPa).toFixed(2))))
          : yValues.map(v => Math.max(0.0, v - 0.2));
        yMaxValues = (series && series.pressure_kpa_max)
          ? series.pressure_kpa_max.map(p => Math.max(0.0, Number((p - pBaseKPa).toFixed(2))))
          : yValues.map(v => v + 0.3);
        yUnit = 'kPa';
        thresholdVal = 45.0; // Hull limit 45.0 kPa net overpressure
        thresholdLabel = 'HULL PROOF LIMIT 45 kPa';
        strokeColor = '#EF4444';
      } else { // 'co'
        const isH2Fuel = this.data && this.data.params && ['h2', 'hydrogen'].includes(String(this.data.params.fuel || '').toLowerCase());
        yValues = (series && series.co_ppm) ? series.co_ppm : (isH2Fuel ? new Array(7).fill(0) : [5, 12, 22, 34, 48, 62, 75]);
        yMinValues = (series && series.co_ppm_min) ? series.co_ppm_min : (isH2Fuel ? new Array(7).fill(0) : yValues.map(v => Math.max(0, v * 0.88)));
        yMaxValues = (series && series.co_ppm_max) ? series.co_ppm_max : (isH2Fuel ? new Array(7).fill(0) : yValues.map(v => v * 1.12));
        yUnit = 'ppm';
        thresholdVal = 55.0; // NASA SMAC 1-hr threshold
        thresholdLabel = 'NASA SMAC LIMIT (55 ppm)';
        strokeColor = '#A855F7';
      }

      // Discrete flight points only if in calibrated stream
      if (streamSource === 'calibrated' && hasDirectFlightData && overlay && Array.isArray(overlay.points)) {
        yRealPoints = overlay.points;
      }

      // Compute calibrated series against active benchmark points
      let yCalibrated = [];
      const pBaseKPa = (this.data && this.data.params) ? (parseFloat(this.data.params.pressure_atm || 1.0) * 101.325) : 101.325;
      if (streamSource === 'calibrated' && hasDirectFlightData && overlay && Array.isArray(overlay.points) && overlay.points.length > 0) {
        yCalibrated = tSec.map((t, idx) => {
          const rawVal = yValues[idx];
          let closestPt = overlay.points[0];
          let minDt = Math.abs(closestPt.t_sec - t);
          for (const pt of overlay.points) {
            const dt = Math.abs(pt.t_sec - t);
            if (dt < minDt) {
              minDt = dt;
              closestPt = pt;
            }
          }
          const realVal = (this.selectedChannel === 'spread') ? closestPt.front_cm
                        : (this.selectedChannel === 'temp') ? closestPt.cabin_temp_c
                        : (this.selectedChannel === 'pressure') ? Math.max(0.0, (closestPt.cabin_pressure_kpa || 101.325) - pBaseKPa)
                        : closestPt.co_ppm;
          if (realVal !== undefined) {
            return rawVal + 0.70 * (realVal - rawVal);
          }
          return rawVal;
        });
      }

      let allNumbers = [...yValues, ...yMaxValues, ...yMinValues, ...yCalibrated];
      if (streamSource === 'calibrated' && hasDirectFlightData && yRealPoints.length > 0) {
        yRealPoints.forEach(pt => {
          const v = (this.selectedChannel === 'spread') ? pt.front_cm
                  : (this.selectedChannel === 'temp') ? pt.cabin_temp_c
                  : (this.selectedChannel === 'pressure') ? Math.max(0.0, (pt.cabin_pressure_kpa || 101.325) - pBaseKPa)
                  : pt.co_ppm;
          if (v !== undefined) allNumbers.push(v);
        });
      }
      const maxYData = Math.max(...allNumbers, thresholdVal || 1);
      const minYData = Math.min(...allNumbers, 0);
      const yMax = Math.max(maxYData * 1.15, 1.0);
      const yMin = Math.min(minYData, 0);

      // Grid lines
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fillStyle = '#64748B';
      ctx.font = '9px "JetBrains Mono"';

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

      for (let s = 0; s <= 600; s += 100) {
        const gx = padLeft + (s / 600) * plotW;
        ctx.beginPath();
        ctx.moveTo(gx, padTop);
        ctx.lineTo(gx, padTop + plotH);
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.fillText(`${s}s`, gx, h - 8);
      }

      // Safety Threshold Dashed Line
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

      // Draw SIM ±1σ Uncertainty Corridor Fill
      if (tSec.length > 1 && yMinValues.length === tSec.length && yMaxValues.length === tSec.length) {
        ctx.save();
        ctx.fillStyle = strokeColor + '22';
        ctx.beginPath();
        tSec.forEach((t, idx) => {
          const px = padLeft + (t / 600) * plotW;
          const py = padTop + plotH - ((yMaxValues[idx] - yMin) / (yMax - yMin)) * plotH;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        for (let idx = tSec.length - 1; idx >= 0; idx--) {
          const t = tSec[idx];
          const px = padLeft + (t / 600) * plotW;
          const py = padTop + plotH - ((yMinValues[idx] - yMin) / (yMax - yMin)) * plotH;
          ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // 1. Draw SIM RAW Line (dashed in Calibrated Stream, solid in Eval Stream)
      if (tSec.length > 1 && yValues.length === tSec.length) {
        ctx.save();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = streamSource === 'calibrated' ? 1.6 : 2.0;
        if (streamSource === 'calibrated') {
          ctx.setLineDash([5, 4]);
        }
        ctx.beginPath();

        tSec.forEach((t, idx) => {
          const px = padLeft + (t / 600) * plotW;
          const py = padTop + plotH - ((yValues[idx] - yMin) / (yMax - yMin)) * plotH;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();

        if (streamSource === 'eval') {
          const areaGrad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
          areaGrad.addColorStop(0, strokeColor + '30');
          areaGrad.addColorStop(1, strokeColor + '00');
          ctx.fillStyle = areaGrad;
          ctx.lineTo(padLeft + plotW, padTop + plotH);
          ctx.lineTo(padLeft, padTop + plotH);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }

      // 2. Draw SIM CALIBRATED Line (ONLY in Calibrated Stream)
      if (streamSource === 'calibrated' && yCalibrated.length === tSec.length) {
        ctx.save();
        ctx.strokeStyle = '#00E5FF';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        tSec.forEach((t, idx) => {
          const px = padLeft + (t / 600) * plotW;
          const py = padTop + plotH - ((yCalibrated[idx] - yMin) / (yMax - yMin)) * plotH;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();

        const areaGrad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
        areaGrad.addColorStop(0, 'rgba(0, 229, 255, 0.22)');
        areaGrad.addColorStop(1, 'rgba(0, 229, 255, 0.00)');
        ctx.fillStyle = areaGrad;
        ctx.lineTo(padLeft + plotW, padTop + plotH);
        ctx.lineTo(padLeft, padTop + plotH);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // 3. Draw REAL (NASA Flight) or Extrapolation Banner (ONLY in Calibrated Stream)
      if (streamSource === 'calibrated') {
        if (hasDirectFlightData && yRealPoints.length > 0) {
          ctx.save();
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
          ctx.lineWidth = 1.2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          yRealPoints.forEach((pt, pIdx) => {
            const t = pt.t_sec;
            const val = (this.selectedChannel === 'spread') ? pt.front_cm
                      : (this.selectedChannel === 'temp') ? pt.cabin_temp_c
                      : (this.selectedChannel === 'pressure') ? Math.max(0.0, (pt.cabin_pressure_kpa || 101.325) - pBaseKPa)
                      : pt.co_ppm;
            const px = padLeft + (t / 600) * plotW;
            const py = padTop + plotH - ((val - yMin) / (yMax - yMin)) * plotH;
            if (pIdx === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.stroke();
          ctx.restore();

          yRealPoints.forEach(pt => {
            const t = pt.t_sec;
            const val = (this.selectedChannel === 'spread') ? pt.front_cm
                      : (this.selectedChannel === 'temp') ? pt.cabin_temp_c
                      : (this.selectedChannel === 'pressure') ? Math.max(0.0, (pt.cabin_pressure_kpa || 101.325) - pBaseKPa)
                      : pt.co_ppm;
            const sigma = pt.sensor_sigma || 0.5;
            const sigmaScale = (this.selectedChannel === 'spread') ? sigma * 0.85
                             : (this.selectedChannel === 'temp') ? sigma * 2.2
                             : (this.selectedChannel === 'pressure') ? sigma * 0.35
                             : sigma * 1.8;

            const px = padLeft + (t / 600) * plotW;
            const py = padTop + plotH - ((val - yMin) / (yMax - yMin)) * plotH;
            const pyTop = padTop + plotH - ((val + sigmaScale - yMin) / (yMax - yMin)) * plotH;
            const pyBot = padTop + plotH - ((val - sigmaScale - yMin) / (yMax - yMin)) * plotH;

            ctx.save();
            ctx.strokeStyle = '#F59E0B';
            ctx.lineWidth = 1.2;

            ctx.beginPath();
            ctx.moveTo(px, pyTop);
            ctx.lineTo(px, pyBot);
            ctx.moveTo(px - 3, pyTop); ctx.lineTo(px + 3, pyTop);
            ctx.moveTo(px - 3, pyBot); ctx.lineTo(px + 3, pyBot);
            ctx.stroke();

            ctx.fillStyle = '#F59E0B';
            ctx.beginPath();
            ctx.arc(px, py, 3.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          });
        } else {
          ctx.save();
          const bannerW = 270;
          const bannerH = 24;
          const bx = padLeft + (plotW - bannerW) / 2;
          const by = padTop + (plotH - bannerH) / 2;
          ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(bx, by, bannerW, bannerH, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#F59E0B';
          ctx.font = '8.5px "JetBrains Mono"';
          ctx.textAlign = 'center';
          ctx.fillText('⚠ NO MATCHING NASA FLIGHT DATA (EXTRAPOLATION ZONE)', bx + bannerW / 2, by + 15);
          ctx.restore();
        }
      }

      // Carbon-Free H2 Banner for CO Channel
      const isH2Fuel = this.data && this.data.params && ['h2', 'hydrogen'].includes(String(this.data.params.fuel || '').toLowerCase());
      if (this.selectedChannel === 'co' && isH2Fuel) {
        ctx.save();
        const bannerW = 280;
        const bannerH = 26;
        const bx = padLeft + (plotW - bannerW) / 2;
        const by = padTop + (plotH - bannerH) / 2;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.strokeStyle = '#00E5FF';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bx, by, bannerW, bannerH, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#00E5FF';
        ctx.font = 'bold 9.5px "JetBrains Mono"';
        ctx.textAlign = 'center';
        ctx.fillText('CO generation: N/A (carbon-free H2 fuel)', bx + bannerW / 2, by + 16);
        ctx.restore();
      }

      // Legend
      ctx.save();
      ctx.font = '9px "JetBrains Mono"';
      ctx.textAlign = 'right';

      if (streamSource === 'calibrated') {
        if (hasDirectFlightData && yRealPoints.length > 0) {
          ctx.fillStyle = '#F59E0B';
          ctx.fillText('● REAL NASA FLIGHT (±σ)', w - padRight, padTop - 6);

          ctx.fillStyle = '#00E5FF';
          ctx.fillText('━ SIM CALIBRATED', w - padRight - 145, padTop - 6);

          ctx.fillStyle = strokeColor;
          ctx.fillText('┄ SIM RAW', w - padRight - 250, padTop - 6);
        } else {
          ctx.fillStyle = strokeColor;
          ctx.fillText('┄ SIM RAW (Physics Extrapolation)', w - padRight, padTop - 6);
        }
      } else {
        ctx.fillStyle = strokeColor;
        ctx.fillText('━ SIM RAW (Physical Model)', w - padRight, padTop - 6);
      }
      ctx.restore();

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

      const evalData = this.data ? this.data.evaluation : null;
      const series = (evalData && evalData.time_series) ? evalData.time_series : null;
      const simToReal = this.data ? this.data.sim_to_real : null;
      const overlay = (simToReal && simToReal.real_data_overlay) ? simToReal.real_data_overlay : null;
      const hasDirectFlightData = simToReal && (simToReal.has_direct_flight_data === true);

      let yValues = [];
      let unit = '';
      if (this.selectedChannel === 'spread') {
        yValues = series ? series.front_cm : [];
        unit = 'cm';
      } else if (this.selectedChannel === 'temp') {
        yValues = series ? series.cabin_temp_c : [];
        unit = '°C';
      } else if (this.selectedChannel === 'pressure') {
        const pBaseKPa = (this.data && this.data.params) ? (parseFloat(this.data.params.pressure_atm || 1.0) * 101.325) : 101.325;
        yValues = series ? series.cabin_pressure_kpa.map(p => Math.max(0.0, p - pBaseKPa)) : [];
        unit = 'kPa';
      } else {
        yValues = series ? series.co_ppm : [];
        unit = 'ppm';
      }

      const idx = Math.min(yValues.length - 1, Math.max(0, Math.round(tHover / 10)));
      const val = yValues[idx] !== undefined ? yValues[idx] : 0;

      let realStr = '';
      if (hasDirectFlightData && overlay && Array.isArray(overlay.points)) {
        let closestPt = null;
        let minDt = 9999;
        overlay.points.forEach(pt => {
          const dt = Math.abs(pt.t_sec - tHover);
          if (dt < minDt) {
            minDt = dt;
            closestPt = pt;
          }
        });
        if (closestPt && minDt <= 30) {
          const pBaseKPa = (this.data && this.data.params) ? (parseFloat(this.data.params.pressure_atm || 1.0) * 101.325) : 101.325;
          const rVal = (this.selectedChannel === 'spread') ? closestPt.front_cm
                     : (this.selectedChannel === 'temp') ? closestPt.cabin_temp_c
                     : (this.selectedChannel === 'pressure') ? Math.max(0.0, (closestPt.cabin_pressure_kpa || 101.325) - pBaseKPa).toFixed(2)
                     : closestPt.co_ppm;
          const sigma = closestPt.sensor_sigma || 0.5;
          realStr = `<br><span style="color: #F59E0B;">REAL: <b>${rVal} ${unit}</b> (±${sigma})</span>`;
        }
      }

      const isH2Fuel = this.data && this.data.params && ['h2', 'hydrogen'].includes(String(this.data.params.fuel || '').toLowerCase());
      const isH2 = this.selectedChannel === 'co' && isH2Fuel;
      let simValDisplay = isH2 ? 'N/A (carbon-free H2 fuel)' : `${val.toFixed(1)} ${unit}`;
      if (this.selectedChannel === 'pressure') {
        simValDisplay = `+${val.toFixed(2)} kPa (Overpressure ΔP)`;
      }

      // Check stream source
      const incomingWires = state.wires.filter(w => w.toNode === this.id);
      let streamSource = 'eval';
      for (const w of incomingWires) {
        const src = state.nodes.get(w.fromNode);
        if (src && src.type === 'simtoreal') {
          streamSource = 'calibrated';
          break;
        }
      }

      tooltip.style.display = 'block';
      tooltip.style.left = `${mx + 10}px`;
      tooltip.style.top = `30px`;

      if (streamSource === 'calibrated') {
        let calValDisplay = simValDisplay;
        if (!isH2 && hasDirectFlightData && overlay && Array.isArray(overlay.points) && overlay.points.length > 0) {
          let closestPt = overlay.points[0];
          let minDt = Math.abs(closestPt.t_sec - tHover);
          for (const pt of overlay.points) {
            const dt = Math.abs(pt.t_sec - tHover);
            if (dt < minDt) {
              minDt = dt;
              closestPt = pt;
            }
          }
          const pBaseKPa = (this.data && this.data.params) ? (parseFloat(this.data.params.pressure_atm || 1.0) * 101.325) : 101.325;
          const rVal = (this.selectedChannel === 'spread') ? closestPt.front_cm
                     : (this.selectedChannel === 'temp') ? closestPt.cabin_temp_c
                     : (this.selectedChannel === 'pressure') ? Math.max(0.0, (closestPt.cabin_pressure_kpa || 101.325) - pBaseKPa)
                     : closestPt.co_ppm;
          if (rVal !== undefined && typeof val === 'number') {
            calValDisplay = (this.selectedChannel === 'pressure')
              ? `+${(val + 0.70 * (rVal - val)).toFixed(2)} ${unit}`
              : `${(val + 0.70 * (rVal - val)).toFixed(1)} ${unit}`;
          }
        }
        tooltip.innerHTML = `t = <b>${Math.round(tHover)} s</b> &middot; <span style="color:#00E5FF; font-weight:700;">CALIBRATED: ${calValDisplay}</span> &middot; SIM RAW: <b>${simValDisplay}</b>${realStr}`;
      } else {
        tooltip.innerHTML = `t = <b>${Math.round(tHover)} s</b> &middot; SIM RAW: <b>${simValDisplay}</b>`;
      }
    }

    checkTableBanner() {
      const hasConnectedTable = findDownstreamNode(this.id, 'table') || findUpstreamNode(this.id, 'table');
      let tableBanner = this.element.querySelector(`#${this.id}-table-banner`);
      const body = this.element.querySelector('.node-body');
      if (!hasConnectedTable) {
        if (!tableBanner) {
          tableBanner = document.createElement('div');
          tableBanner.id = `${this.id}-table-banner`;
          tableBanner.className = 'smart-connect-banner';
          if (body) body.appendChild(tableBanner);
        }
        tableBanner.style.display = 'flex';
        tableBanner.innerHTML = `
          <span>NASA PSI Matrix table available</span>
          <button class="smart-connect-btn" id="${this.id}-btn-connect-table">[+ Connect TABLE]</button>
        `;
        const btnConnect = tableBanner.querySelector(`#${this.id}-btn-connect-table`);
        if (btnConnect) {
          btnConnect.addEventListener('click', (e) => {
            e.stopPropagation();
            const tableNode = spawnNode('table', this.x + this.width + 30, this.y);
            addWire(this.id, 'out', tableNode.id, 'in');
            tableBanner.style.display = 'none';
            showToast('Connected TABLE // NASA PSI MATRIX node');
          });
        }
      } else if (tableBanner) {
        tableBanner.style.display = 'none';
      }
    }

    onResize() {
      const container = this.element.querySelector('.graph-canvas-container');
      const canvas = this.element.querySelector(`#${this.id}-graph-canvas`);
      if (container && canvas) {
        if (this.nodeScale && this.nodeScale > 1.0) {
          const scaledH = Math.round(205 * this.nodeScale);
          container.style.height = `${scaledH}px`;
        } else {
          container.style.height = '';
        }
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        if (cw > 40 && ch > 40 && (canvas.width !== cw || canvas.height !== ch)) {
          canvas.width = cw;
          canvas.height = ch;
          this.renderGraph();
        }
      }
    }

    onDestroy() {
      if (this.resizeObserver) this.resizeObserver.disconnect();
    }
  }

  // -------------------------------------------------------------------------
  // NODE 4: PROMPT (AI Safety Engineer)
  // -------------------------------------------------------------------------

  class PromptNode extends BaseNode {
    constructor(id, x, y, initialData = {}, width = 380, height = null, nodeScale = 1.0, accentColor = 'default') {
      super(id, 'prompt', 'PROMPT // AI SAFETY OFFICER', x, y, width, height, nodeScale, accentColor);
      this.query = (initialData && initialData.query) || 'Evaluate hull breach and explosion risk';
      this.init();
    }

    setQuery(q) {
      this.query = q;
      const textarea = this.element.querySelector(`#${this.id}-query-text`);
      if (textarea) textarea.value = q;
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
          <button class="btn-quick-prompt" data-q="Evaluate hull breach and explosion risk">⚡ Evaluate Breach & Explosion Risk</button>
          <button class="btn-quick-prompt" data-q="Compare with NASA PSI flight tests">🔬 Compare with NASA PSI Tests</button>
          <button class="btn-quick-prompt" data-q="ECLSS action plan for ventilation">🚨 ECLSS Action Plan</button>
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
        const branchData = resolveUpstreamBranchData(this.id, 'in') || this.data || {};
        const params = branchData.params || {};
        let evaluation = branchData.evaluation || null;
        let nearest_benchmark = branchData.nearest_benchmark || (branchData.sim_to_real ? branchData.sim_to_real.best_match : null);

        if (!evaluation && window.StandaloneAPI && typeof window.StandaloneAPI.evaluateFireSafety === 'function') {
          evaluation = window.StandaloneAPI.evaluateFireSafety(params);
        }

        const payload = {
          user_query: this.query,
          params: params,
          evaluation: evaluation,
          nearest_benchmark: nearest_benchmark,
          language: 'en'
        };

        const res = await fetch(API_PROMPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();

        showToast('AI Safety Briefing synthesized');
        this.spawnBriefNode(result);
      } catch (err) {
        console.error('[PromptNode] Error:', err);
        showToast('Prompt execution failed: ' + err.message);
      } finally {
        execBtn.disabled = false;
        execBtn.innerHTML = `<span>EXECUTE PROMPT [GEMINI AI]</span>`;
      }
    }

    spawnBriefNode(result) {
      const title = 'AI BRIEF // ECLSS ADVISOR';
      const briefNode = spawnNode('brief', this.x + this.width + 36, this.y, { title }, null, null, this.nodeScale, this.accentColor);
      addWire(this.id, 'out', briefNode.id, 'in');
      briefNode.setBriefContent(result, this.query);
      saveGraphToLocalStorage();
    }
  }

  // -------------------------------------------------------------------------
  // NODE 5: AI SAFETY BRIEF (Result Node)
  // -------------------------------------------------------------------------

  class BriefNode extends BaseNode {
    constructor(id, x, y, initialData = {}, width = 440, height = null, nodeScale = 1.0, accentColor = 'default') {
      const title = (initialData && initialData.title) || 'AI BRIEF // ECLSS ADVISOR';
      super(id, 'brief', title, x, y, width, height, nodeScale, accentColor);
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

    setBriefContent(result, queryText = null) {
      const container = this.element.querySelector(`#${this.id}-content`);
      if (!container) return;

      const rawText = result.advisory_text || 'No response generated.';

      let html = '';
      if (queryText) {
        const timeStr = new Date().toLocaleTimeString();
        html += `
          <div class="brief-meta-bar">
            <span class="brief-meta-query">QUERY: <b>${sanitize(queryText)}</b></span>
            <span class="brief-meta-time">${timeStr}</span>
          </div>
        `;
      }

      let bodyHtml = sanitize(rawText);

      // Replace tags
      bodyHtml = bodyHtml.replace(/\[VERIFIED NASA PSI DATA\]\s*(https?:\/\/[^\s<]+)/g, (match, url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="badge-nasa">✓ [VERIFIED NASA PSI DATA] ↗</a>`;
      });

      bodyHtml = bodyHtml.replace(/\[VERIFIED NASA PSI DATA\]/g, () => {
        return `<span class="badge-nasa">✓ [VERIFIED NASA PSI DATA]</span>`;
      });

      bodyHtml = bodyHtml.replace(/\[THEORETICAL EXTRAPOLATION[^\]]*\]/g, (match) => {
        return `<span class="badge-theory">⚛ ${match}</span>`;
      });

      // Headers ###
      bodyHtml = bodyHtml.replace(/###\s+(.+)/g, '<h3>$1</h3>');

      // Bold **text**
      bodyHtml = bodyHtml.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');

      // Bullets - text
      bodyHtml = bodyHtml.replace(/^- (.+)/gm, '<li>$1</li>');
      bodyHtml = bodyHtml.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');

      // Line breaks
      bodyHtml = bodyHtml.replace(/\n\n/g, '<br><br>');

      html += `<div class="brief-body">${bodyHtml}</div>`;
      container.innerHTML = html;
    }
  }

  // =========================================================================
  // NODE FACTORY & LIFECYCLE
  // =========================================================================

  function spawnNode(type, x, y, initialData = {}, width = null, height = null, nodeScale = 1.0, accentColor = 'default') {
    state.nodeCounter++;
    const id = `node_${state.nodeCounter}`;
    let node = null;

    if (type === 'note') {
      node = new NoteNode(id, x, y, initialData, width || 420, height, nodeScale, accentColor);
    } else if (type === 'variable') {
      node = new VariableNode(id, x, y, initialData, width || 380, height, nodeScale, accentColor);
    } else if (type === 'simtoreal') {
      node = new SimToRealNode(id, x, y, initialData, width || 430, height, nodeScale, accentColor);
    } else if (type === 'table') {
      node = new TableNode(id, x, y, initialData, width || 580, height || 440, nodeScale, accentColor);
    } else if (type === 'aidiff') {
      node = new AiDiffNode(id, x, y, initialData, width || 520, height, nodeScale, accentColor);
    } else if (type === 'sim') {
      node = new SimNode(id, x, y, initialData, width || 460, height, nodeScale, accentColor);
    } else if (type === 'graph') {
      node = new GraphNode(id, x, y, initialData, width || 460, height, nodeScale, accentColor);
    } else if (type === 'prompt') {
      node = new PromptNode(id, x, y, initialData, width || 380, height, nodeScale, accentColor);
    } else if (type === 'brief') {
      node = new BriefNode(id, x, y, initialData, width || 440, height, nodeScale, accentColor);
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

        if (action === 'spawn_note') spawnNode('note', x, y);
        else if (action === 'spawn_variable') spawnNode('variable', x, y);
        else if (action === 'spawn_simtoreal') spawnNode('simtoreal', x, y);
        else if (action === 'spawn_table') spawnNode('table', x, y);
        else if (action === 'spawn_aidiff') spawnNode('aidiff', x, y);
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

  function applyTheme(theme) {
    state.theme = theme;
    localStorage.setItem('flame_blueprint_theme', theme);
    const themeIcon = document.getElementById('theme-icon');
    const themeText = document.getElementById('theme-text');

    if (theme === 'light') {
      document.body.classList.add('theme-light');
      if (themeIcon) themeIcon.textContent = '☀';
      if (themeText) themeText.textContent = 'LIGHT';
    } else {
      document.body.classList.remove('theme-light');
      if (themeIcon) themeIcon.textContent = '🌙';
      if (themeText) themeText.textContent = 'DARK';
    }

    renderAllWires();
    state.nodes.forEach(n => {
      if (typeof n.renderGraph === 'function') n.renderGraph();
    });
  }

  function applyLanguage(lang = 'en') {
    state.language = 'en';
    window.currentAppLanguage = 'en';
    localStorage.setItem('flame_blueprint_lang', 'en');
    const langText = document.getElementById('lang-text');
    if (langText) langText.textContent = 'EN';

    const dict = I18N.en || {};
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (dict[key]) {
        el.textContent = dict[key];
      }
    });

    state.nodes.forEach(n => {
      if (typeof n.onLanguageChange === 'function') {
        n.onLanguageChange('en');
      }
    });
  }

  function setupTopBar() {
    // Add Node dropdown
    const addNodeToggle = document.getElementById('btn-add-node-toggle');
    const addNodesMenu = document.getElementById('add-nodes-menu');
    if (addNodeToggle && addNodesMenu) {
      addNodeToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        addNodesMenu.classList.toggle('show');
      });
      document.addEventListener('click', (e) => {
        if (!addNodesMenu.contains(e.target) && e.target !== addNodeToggle) {
          addNodesMenu.classList.remove('show');
        }
      });
    }

    // Add Node items (dropdown menu + any legacy buttons)
    document.querySelectorAll('.btn-add-node-item, .btn-add-node').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const type = btn.dataset.type;
        if (!type) return;
        if (addNodesMenu) addNodesMenu.classList.remove('show');

        const vpRect = viewport.getBoundingClientRect();
        const centerWorld = screenToWorld(vpRect.left + vpRect.width / 2, vpRect.top + vpRect.height / 2);
        const jitterX = Math.round((Math.random() - 0.5) * 60);
        const jitterY = Math.round((Math.random() - 0.5) * 60);
        const spawnX = Math.round(centerWorld.x - 200 + jitterX);
        const spawnY = Math.round(centerWorld.y - 120 + jitterY);

        const newNode = spawnNode(type, spawnX, spawnY);
        if (newNode) {
          showToast(`Added ${newNode.title}`);
        }
      });
    });

    // Theme toggle
    const btnTheme = document.getElementById('btn-theme-toggle');
    if (btnTheme) {
      btnTheme.addEventListener('click', () => {
        const nextTheme = state.theme === 'light' ? 'dark' : 'light';
        applyTheme(nextTheme);
        showToast(`Theme switched to ${nextTheme.toUpperCase()}`);
      });
    }

    // Auto-layout
    const btnAuto = document.getElementById('btn-autolayout');
    if (btnAuto) {
      btnAuto.addEventListener('click', () => {
        autoLayoutGraph();
      });
    }

    // Export JSON
    const btnExport = document.getElementById('btn-export-json');
    if (btnExport) {
      btnExport.addEventListener('click', () => {
        exportGraphJSON();
      });
    }

    // Import JSON
    const fileInput = document.getElementById('file-import-input');
    const btnImport = document.getElementById('btn-import-json');
    if (btnImport && fileInput) {
      btnImport.addEventListener('click', () => {
        fileInput.click();
      });
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) importGraphJSON(file);
        fileInput.value = '';
      });
    }

    // Reset graph
    const btnReset = document.getElementById('btn-reset-graph');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        if (confirm('Reset canvas to default starter blueprint graph?')) {
          buildDefaultGraph();
          showToast('Blueprint canvas reset to nominal state');
        }
      });
    }
  }

  function autoLayoutGraph() {
    const simNode = Array.from(state.nodes.values()).find(n => n.type === 'sim');
    const simHeight = (simNode && simNode.element && simNode.element.offsetHeight > 100) ? simNode.element.offsetHeight : 700;
    const simY = simNode ? simNode.y : 50;
    const graphY = simY + simHeight + 28;

    state.nodes.forEach(node => {
      if (node.type === 'note') {
        node.x = 40;
        node.y = 50;
      } else if (node.type === 'variable') {
        node.x = 40;
        node.y = 440;
      } else if (node.type === 'simtoreal') {
        node.x = 460;
        node.y = 50;
      } else if (node.type === 'table') {
        node.x = 460;
        node.y = 660;
      } else if (node.type === 'aidiff') {
        node.x = 920;
        node.y = 50;
      } else if (node.type === 'sim') {
        node.x = 1480;
        node.y = simY;
      } else if (node.type === 'graph') {
        node.x = 1480;
        node.y = graphY;
      } else if (node.type === 'prompt') {
        node.x = 2000;
        node.y = 50;
      } else if (node.type === 'brief') {
        node.x = 2420;
        node.y = 50;
      }
      if (node.element) {
        node.element.style.left = `${node.x}px`;
        node.element.style.top = `${node.y}px`;
      }
    });

    state.pan = { x: 30, y: 25 };
    state.scale = 0.85;
    updateWorldTransform();
    saveGraphToLocalStorage();
    showToast('Auto-layout arranged');
  }

  function exportGraphJSON() {
    const exportData = {
      version: '1.3.0',
      timestamp: new Date().toISOString(),
      pan: state.pan,
      scale: state.scale,
      nodes: Array.from(state.nodes.values()).map(n => ({
        id: n.id,
        type: n.type,
        x: n.x,
        y: n.y,
        width: n.width,
        height: n.height || (n.element ? n.element.offsetHeight : null),
        nodeScale: n.nodeScale || 1.0,
        accentColor: n.accentColor || 'default',
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
          spawnNode(n.type, n.x, n.y, n.params || {}, n.width, n.height, n.nodeScale || 1.0, n.accentColor || 'default');
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

    state.pan = { x: 30, y: 25 };
    state.scale = 0.85;

    // Node 0: Note AI // JARVIS Architect
    const noteNode = spawnNode('note', 40, 50);

    // Node 1: Variable / Parameter Feed
    const varNode = spawnNode('variable', 40, 440, {
      o2_percent: 21.0,
      pressure_atm: 1.0,
      flow_velocity_cms: 10.0,
      fuel: 'pmma',
      h2_conc_pct: 0.0,
      cabin_volume_m3: 28.0
    });

    // Node 2: Sim-to-Real NASA Grounding
    const s2rNode = spawnNode('simtoreal', 460, 50);

    // Node 3: SIM Spacecraft Cutaway
    const simNode = spawnNode('sim', 920, 50);

    // Calculate dynamic Y for graphNode with robust clearance
    const simHeight = (simNode && simNode.element && simNode.element.offsetHeight > 100) ? simNode.element.offsetHeight : 700;
    const graphY = simNode.y + simHeight + 28;

    // Node 4: Graph Time Telemetry
    const graphNode = spawnNode('graph', 920, graphY);

    // Node 5: Prompt AI Safety Officer
    const promptNode = spawnNode('prompt', 1400, 50);

    // Wires:
    // Note AI out -> Variable in
    addWire(noteNode.id, 'out', varNode.id, 'in');
    // Variable out -> Sim-to-Real in
    addWire(varNode.id, 'out', s2rNode.id, 'in');
    // Sim-to-Real out -> SIM in, Graph in, Prompt in
    addWire(s2rNode.id, 'out', simNode.id, 'in');
    addWire(s2rNode.id, 'out', graphNode.id, 'in');
    addWire(s2rNode.id, 'out', promptNode.id, 'in');

    updateWorldTransform();
    saveGraphToLocalStorage();

    // Secondary clearance check after DOM layout pass
    requestAnimationFrame(() => {
      if (simNode.element && graphNode.element) {
        const actualSimH = simNode.element.offsetHeight;
        if (actualSimH > 100) {
          const targetY = simNode.y + actualSimH + 28;
          if (graphNode.y < targetY) {
            graphNode.y = targetY;
            graphNode.element.style.top = `${targetY}px`;
            updateWorldTransform();
            saveGraphToLocalStorage();
          }
        }
      }
    });
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
          width: n.width,
          height: n.height || (n.element ? n.element.offsetHeight : null),
          nodeScale: n.nodeScale || 1.0,
          accentColor: n.accentColor || 'default',
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
      ['flame_blueprint_graph', 'flame_blueprint_graph_v1', 'flame_blueprint_graph_v2', 'flame_blueprint_graph_v3', 'flame_blueprint_graph_v4', 'flame_blueprint_graph_v5', 'flame_blueprint_graph_v6', 'flame_blueprint_graph_v7', 'flame_blueprint_graph_v8'].forEach(k => {
        if (localStorage.getItem(k)) localStorage.removeItem(k);
      });
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.nodes) || data.nodes.length === 0) return false;

      clearGraph();

      state.pan = data.pan || { x: 40, y: 30 };
      state.scale = data.scale || 0.92;

      data.nodes.forEach(n => {
        spawnNode(n.type, n.x, n.y, n.params || {}, n.width, n.height, n.nodeScale || 1.0, n.accentColor || 'default');
      });

      if (Array.isArray(data.wires)) {
        data.wires.forEach(w => {
          addWire(w.fromNode, w.fromPin, w.toNode, w.toPin);
        });
      }

      // Check and enforce clearance for graphNode below simNode if on same branch
      const simNode = Array.from(state.nodes.values()).find(n => n.type === 'sim');
      const graphNode = Array.from(state.nodes.values()).find(n => n.type === 'graph');
      if (simNode && graphNode && Math.abs(simNode.x - graphNode.x) < 50) {
        requestAnimationFrame(() => {
          if (simNode.element && graphNode.element) {
            const actualSimH = simNode.element.offsetHeight || 700;
            const minGraphY = simNode.y + actualSimH + 28;
            if (graphNode.y < minGraphY) {
              graphNode.y = minGraphY;
              graphNode.element.style.top = `${minGraphY}px`;
              updateWorldTransform();
              saveGraphToLocalStorage();
            }
          }
        });
      }

      updateWorldTransform();
      return true;
    } catch (e) {
      console.warn('[Storage] Failed to load graph from localStorage, clearing cache & resetting default:', e);
      try {
        localStorage.clear();
      } catch (_) {}
      buildDefaultGraph();
      return true;
    }
  }

  // =========================================================================
  // BOOTSTRAP APPLICATION
  // =========================================================================

  function init() {
    try {
      applyTheme(state.theme);
      applyLanguage(state.language);
    } catch (e) {
      console.warn('[Init] Theme/Language init warning:', e);
    }

    try {
      setupViewportInteractions();
    } catch (e) {
      console.warn('[Init] Viewport interaction setup warning:', e);
    }

    try {
      setupTopBar();
    } catch (e) {
      console.warn('[Init] Topbar setup warning:', e);
    }

    try {
      const loaded = loadGraphFromLocalStorage();
      if (!loaded || state.nodes.size === 0) {
        buildDefaultGraph();
      } else {
        updateWorldTransform();
      }
    } catch (e) {
      console.warn('[Init] LocalStorage load failed, clearing cache & building default graph:', e);
      try {
        localStorage.clear();
      } catch (_) {}
      buildDefaultGraph();
    }

    if (state.nodes.size === 0) {
      buildDefaultGraph();
    }

    try {
      const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const pillText = document.getElementById('connection-status-text') || document.querySelector('.connection-pill span');
      if (!isLocal) {
        if (pillText) pillText.textContent = 'CLOUD ENGINE // ONLINE';
      } else {
        fetch('/api/status')
          .then(res => res.json())
          .then(data => {
            if (pillText) {
              pillText.textContent = data.mode === 'standalone_cloud' ? 'CLOUD ENGINE // ONLINE' : 'PORT 5000 // CORE ONLINE';
            }
          })
          .catch(() => {
            if (pillText) pillText.textContent = 'CLOUD ENGINE // ONLINE';
          });
      }
    } catch (_) {}

    console.log('[FLAME BLUEPRINT] Engine initialized.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
