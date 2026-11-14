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

  const STORAGE_KEY = 'flame_blueprint_graph_v2';
  const API_EVAL_URL = '/api/blueprint-eval';
  const API_PROMPT_URL = '/api/blueprint-prompt';
  const API_NOTE_URL = '/api/blueprint-note';

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
      el.className = `bp-node node node-type-${this.type}`;
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
  // NODE 0: NOTE AI (JARVIS Mission Architect)
  // -------------------------------------------------------------------------

  class NoteNode extends BaseNode {
    constructor(id, x, y) {
      super(id, 'note', 'NOTE AI // JARVIS ARCHITECT', x, y, 380);
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
      if (!SpeechRecognition) {
        this.recognition = null;
        return;
      }
      try {
        const r = new SpeechRecognition();
        r.continuous = false;
        r.interimResults = false;
        r.lang = 'ru-RU';

        r.onstart = () => {
          this.isRecording = true;
          const btn = this.element.querySelector(`#${this.id}-btn-voice`);
          if (btn) {
            btn.classList.add('recording');
            btn.querySelector('.voice-btn-text').textContent = 'LISTENING...';
          }
          showToast('Recording voice note... Speak flight parameters');
        };

        r.onresult = (e) => {
          const transcript = e.results[0][0].transcript;
          const textarea = this.element.querySelector(`#${this.id}-note-text`);
          if (textarea) {
            textarea.value = (textarea.value ? textarea.value + ' ' : '') + transcript;
            this.noteText = textarea.value;
          }
          showToast('Voice note captured');
        };

        r.onerror = (e) => {
          console.warn('[SpeechRec] Error:', e.error);
          showToast('Voice note error: ' + e.error);
          this.resetVoiceButton();
        };

        r.onend = () => {
          this.resetVoiceButton();
        };

        this.recognition = r;
      } catch (err) {
        console.warn('[SpeechRec] Init failed:', err);
        this.recognition = null;
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
          showToast('SpeechRecognition API not available in this browser. Please type.');
          return;
        }
        if (this.isRecording) {
          this.recognition.stop();
        } else {
          try {
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
          textarea.value = this.noteText;
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
            this.applyCompiledPlan({ params: instantParams });
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
            language: 'ru'
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

        // Render summary card
        const card = this.element.querySelector(`#${this.id}-summary-card`);
        if (card) {
          card.style.display = 'block';
          card.innerHTML = `
            <div style="font-family: var(--font-mono); font-size: 10px; color: #F59E0B; font-weight: 700;">✓ MISSION ARCHITECTURE COMPILED</div>
            <div style="margin-top: 4px; color: #F1F5F9;">${sanitize(compiled.summary || '')}</div>
            <div style="margin-top: 4px; color: var(--text-muted); font-size: 10px;">Suggested Copilot Query: <i>${sanitize(compiled.suggested_query || '')}</i></div>
          `;
        }

        this.data = compiled;
        showToast('Mission blueprint compiled');

        // Propagate down the wire
        propagateDataFrom(this.id, compiled);

        // Apply to connected Variable node or direct pipeline
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
      // Find connected nodes from this node's out pin
      const outgoingWires = state.wires.filter(w => w.fromNode === this.id);
      let targetVar = null;

      outgoingWires.forEach(w => {
        const target = state.nodes.get(w.toNode);
        if (target && target.type === 'variable') {
          targetVar = target;
        }
      });

      // If no directly wired Variable node, find the first Variable node on the canvas
      if (!targetVar) {
        for (const n of state.nodes.values()) {
          if (n.type === 'variable') {
            targetVar = n;
            break;
          }
        }
      }

      if (targetVar && compiled.params) {
        targetVar.setParams(compiled.params);
      }

      // Set graph channel if specified
      if (compiled.pipeline && compiled.pipeline.graph_metric) {
        state.nodes.forEach(n => {
          if (n.type === 'graph') {
            n.setChannel(compiled.pipeline.graph_metric);
          } else if (n.type === 'prompt' && compiled.suggested_query) {
            n.setQuery(compiled.suggested_query);
          }
        });
      }
    }
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
        const res = await fetch(API_EVAL_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.params)
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
    constructor(id, x, y) {
      super(id, 'simtoreal', 'SIM-TO-REAL // NASA GROUNDING', x, y, 420);
      this.init();
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

        <div style="font-size: 10px; font-family: var(--font-mono); color: var(--text-muted); text-transform: uppercase; margin-top: 4px;">
          Top-3 Flight Benchmarks (NASA PSI & Saffire):
        </div>
        <div class="s2r-matches-list" id="${this.id}-matches-list">
          <div class="s2r-match-item">Awaiting physical evaluation stream...</div>
        </div>

        <div class="s2r-explanation-card" id="${this.id}-explanation-card">
          Grounded across 41 documented flight runs (Saffire I–VI, BASS-II, PSI-117, PSI-10, PSI-60, PSI-179, Apollo, Mir).
        </div>
      `;

      this.createDOM('', portsHtml, bodyHtml);
    }

    onReceiveData(data) {
      super.onReceiveData(data);
      this.updateSimToRealDisplay();
      propagateDataFrom(this.id, data);
    }

    updateSimToRealDisplay() {
      if (!this.data) return;
      const s2r = this.data.sim_to_real;
      if (!s2r) return;

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

      // Top matches
      const matchesList = this.element.querySelector(`#${this.id}-matches-list`);
      if (matchesList && Array.isArray(s2r.top_matches)) {
        matchesList.innerHTML = s2r.top_matches.slice(0, 3).map((m, idx) => `
          <div class="s2r-match-item">
            <div class="s2r-match-top">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="s2r-rank-tag">#${idx + 1}</span>
                <span class="s2r-match-title">${sanitize(m.id || '')} &middot; ${sanitize(m.investigation || m.title || '')}</span>
              </div>
              <span class="s2r-match-score">${(m.match_pct || 90).toFixed(1)}%</span>
            </div>
            <div class="s2r-match-details">
              <span>O₂: ${m.o2_percent}%</span>
              <span>P: ${m.pressure_atm} atm</span>
              <span>V_g: ${m.flow_velocity_cms} cm/s</span>
              <span>Regime: ${(m.measured_regime || 'nominal').toUpperCase()}</span>
            </div>
            <div>
              <a href="${m.url || 'https://psi.nasa.gov'}" target="_blank" rel="noopener noreferrer" class="s2r-link">
                View Official Investigation Telemetry ↗
              </a>
            </div>
          </div>
        `).join('');
      }

      // Explanation
      const explCard = this.element.querySelector(`#${this.id}-explanation-card`);
      if (explCard && s2r.gap_explanation) {
        explCard.innerHTML = `<span style="font-family: var(--font-mono); font-size: 10px; color: #06B6D4; font-weight: 700;">PHYSICAL GROUNDING ANALYSIS:</span><br>${sanitize(s2r.gap_explanation)}`;
      }
    }
  }

  // -------------------------------------------------------------------------
  // NODE 2: SIM (Spacecraft Cutaway & Verdict)
  // -------------------------------------------------------------------------

  class SimNode extends BaseNode {
    constructor(id, x, y) {
      super(id, 'sim', 'SIM // 2D FINITE-VOLUME SOLVER', x, y, 440);
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

      this.createDOM(headerExtra, portsHtml, bodyHtml);
      this.bindSimModeEvents();
      this.initParticles();
      this.startCanvasAnimation();
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
      for (let i = 0; i < 40; i++) {
        this.stars.push({
          x: Math.random() * 416,
          y: Math.random() * 220,
          size: Math.random() * 1.5 + 0.5,
          alpha: Math.random() * 0.7 + 0.3
        });
      }
      this.particles = [];
      for (let i = 0; i < 24; i++) {
        this.particles.push({
          x: 95 + Math.random() * 220,
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
      const cabinY = 30;
      const cabinW = 246;
      const cabinH = 160;
      const radius = 24;

      // Thermal hull wall radiation glow
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

    setChannel(channel) {
      if (['spread', 'temp', 'pressure', 'co'].includes(channel)) {
        this.selectedChannel = channel;
        const select = this.element.querySelector(`#${this.id}-channel-select`);
        if (select) select.value = channel;
        this.renderGraph();
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
      const simToReal = this.data ? this.data.sim_to_real : null;
      const overlay = (simToReal && simToReal.real_data_overlay) ? simToReal.real_data_overlay : null;
      const hasDirectFlightData = simToReal && (simToReal.has_direct_flight_data === true);

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
        yValues = (series && series.cabin_pressure_kpa) ? series.cabin_pressure_kpa : [101, 101, 102, 102, 103, 104, 104];
        yMinValues = (series && series.pressure_kpa_min) ? series.pressure_kpa_min : yValues.map(v => v - 0.2);
        yMaxValues = (series && series.pressure_kpa_max) ? series.pressure_kpa_max : yValues.map(v => v + 0.2);
        yUnit = 'kPa';
        thresholdVal = 146.0; // 101 + 45 kPa proof limit
        thresholdLabel = 'HULL PROOF LIMIT';
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

      if (hasDirectFlightData && overlay && Array.isArray(overlay.points)) {
        yRealPoints = overlay.points;
      }

      let allNumbers = [...yValues, ...yMaxValues, ...yMinValues];
      if (hasDirectFlightData && yRealPoints.length > 0) {
        yRealPoints.forEach(pt => {
          const v = (this.selectedChannel === 'spread') ? pt.front_cm
                  : (this.selectedChannel === 'temp') ? pt.cabin_temp_c
                  : (this.selectedChannel === 'pressure') ? pt.cabin_pressure_kpa
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

      // Draw Main SIM (Physics) Line
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

        const areaGrad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
        areaGrad.addColorStop(0, strokeColor + '30');
        areaGrad.addColorStop(1, strokeColor + '00');
        ctx.fillStyle = areaGrad;
        ctx.lineTo(padLeft + plotW, padTop + plotH);
        ctx.lineTo(padLeft, padTop + plotH);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // Draw REAL (NASA Flight) or Extrapolation Banner
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
                    : (this.selectedChannel === 'pressure') ? pt.cabin_pressure_kpa
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
                    : (this.selectedChannel === 'pressure') ? pt.cabin_pressure_kpa
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

      if (hasDirectFlightData && yRealPoints.length > 0) {
        ctx.fillStyle = '#F59E0B';
        ctx.fillText('● REAL (NASA Flight ±σ)', w - padRight, padTop - 6);

        ctx.fillStyle = strokeColor;
        ctx.fillText('■ SIM ±1σ (Physics)', w - padRight - 130, padTop - 6);
      } else {
        ctx.fillStyle = strokeColor;
        ctx.fillText('■ SIM ±1σ (Pure Physics Extrapolation)', w - padRight, padTop - 6);
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
        yValues = series ? series.cabin_pressure_kpa : [];
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
          const rVal = (this.selectedChannel === 'spread') ? closestPt.front_cm
                     : (this.selectedChannel === 'temp') ? closestPt.cabin_temp_c
                     : (this.selectedChannel === 'pressure') ? closestPt.cabin_pressure_kpa
                     : closestPt.co_ppm;
          const sigma = closestPt.sensor_sigma || 0.5;
          realStr = `<br><span style="color: #F59E0B;">REAL: <b>${rVal} ${unit}</b> (±${sigma})</span>`;
        }
      }

      const isH2Fuel = this.data && this.data.params && ['h2', 'hydrogen'].includes(String(this.data.params.fuel || '').toLowerCase());
      const isH2 = this.selectedChannel === 'co' && isH2Fuel;
      const simValDisplay = isH2 ? 'N/A (carbon-free H2 fuel)' : `${val} ${unit}`;

      tooltip.style.display = 'block';
      tooltip.style.left = `${mx + 10}px`;
      tooltip.style.top = `30px`;
      tooltip.innerHTML = `t = <b>${Math.round(tHover)} s</b> &middot; SIM: <b>${simValDisplay}</b>${realStr}`;
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

    if (type === 'note') {
      node = new NoteNode(id, x, y);
    } else if (type === 'variable') {
      node = new VariableNode(id, x, y, initialData);
    } else if (type === 'simtoreal') {
      node = new SimToRealNode(id, x, y);
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

        if (action === 'spawn_note') spawnNode('note', x, y);
        else if (action === 'spawn_variable') spawnNode('variable', x, y);
        else if (action === 'spawn_simtoreal') spawnNode('simtoreal', x, y);
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
      } else if (node.type === 'sim') {
        node.x = 940;
        node.y = 50;
      } else if (node.type === 'graph') {
        node.x = 940;
        node.y = 530;
      } else if (node.type === 'prompt') {
        node.x = 1420;
        node.y = 50;
      } else if (node.type === 'brief') {
        node.x = 1840;
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
    const simNode = spawnNode('sim', 940, 50);

    // Node 4: Graph Time Telemetry
    const graphNode = spawnNode('graph', 940, 530);

    // Node 5: Prompt AI Safety Officer
    const promptNode = spawnNode('prompt', 1420, 50);

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
      if (localStorage.getItem('flame_blueprint_graph')) {
        localStorage.removeItem('flame_blueprint_graph');
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.nodes) || data.nodes.length === 0) return false;

      clearGraph();

      state.pan = data.pan || { x: 40, y: 30 };
      state.scale = data.scale || 0.92;

      let seenGraph = false;
      data.nodes.forEach(n => {
        if (n.type === 'graph') {
          if (seenGraph) return; // Discard duplicate graph nodes
          seenGraph = true;
        }
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

    console.log('[FLAME BLUEPRINT] Engine active on port 5000.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
