import re
import json

def verify_frontend():
    print("Verifying frontend/index.html and frontend/app.js...")

    with open('frontend/index.html', 'r', encoding='utf-8') as f:
        html = f.read()

    with open('frontend/app.js', 'r', encoding='utf-8') as f:
        js = f.read()

    with open('frontend/styles.css', 'r', encoding='utf-8') as f:
        css = f.read()

    # 1. Check required DOM IDs in HTML
    required_ids = [
        'top-bar', 'viewport', 'canvas-world', 'wire-canvas', 'wires-layer',
        'draft-wire', 'nodes-layer', 'context-menu', 'toast-container',
        'btn-autolayout', 'btn-export-json', 'btn-import-json', 'file-import-input', 'btn-reset-graph'
    ]
    missing_ids = [id_name for id_name in required_ids if f'id="{id_name}"' not in html]
    if missing_ids:
        print(f"[FAIL] Missing IDs in index.html: {missing_ids}")
        return False
    else:
        print("[PASS] All required root DOM IDs exist in index.html.")

    # 2. Check Scenario buttons
    required_scenarios = ['iss_nominal', 'saffire_v', 'psi117_cool', 'apollo13_h2', 'apollo1_o2']
    missing_sc = [sc for sc in required_scenarios if f'data-scenario="{sc}"' not in html]
    if missing_sc:
        print(f"[FAIL] Missing scenario buttons in index.html: {missing_sc}")
        return False
    else:
        print(f"[PASS] All 5 required scenario presets exist in index.html: {required_scenarios}")

    # 3. Check node types in app.js
    required_node_classes = ['VariableNode', 'SimNode', 'GraphNode', 'PromptNode', 'BriefNode']
    missing_classes = [c for c in required_node_classes if f'class {c}' not in js]
    if missing_classes:
        print(f"[FAIL] Missing Node classes in app.js: {missing_classes}")
        return False
    else:
        print(f"[PASS] All 5 Node classes implemented in app.js: {required_node_classes}")

    # 4. Check API endpoints called in app.js
    assert '/api/blueprint-eval' in js, "Missing /api/blueprint-eval in app.js"
    assert '/api/blueprint-prompt' in js, "Missing /api/blueprint-prompt in app.js"
    print("[PASS] Both /api/blueprint-eval and /api/blueprint-prompt wired in app.js.")

    # 5. Check CSS classes
    required_css_classes = [
        '.bp-node', '.node-header', '.node-type-variable', '.node-type-sim',
        '.node-type-graph', '.node-type-prompt', '.node-type-brief',
        '.status-go', '.status-caution', '.status-nogo', '.wire-path', '.wire-flow'
    ]
    missing_css = [c for c in required_css_classes if c not in css]
    if missing_css:
        print(f"[FAIL] Missing CSS classes in styles.css: {missing_css}")
        return False
    else:
        print("[PASS] All critical SpaceX Telemetry & Unreal Engine Blueprint CSS styles defined.")

    print("\n>>> FRONTEND CODE & ASSETS INTEGRITY VERIFIED (100% PASS) <<<")
    return True

if __name__ == '__main__':
    if not verify_frontend():
        exit(1)
