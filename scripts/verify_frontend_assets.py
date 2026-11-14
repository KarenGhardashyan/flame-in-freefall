import urllib.request
import re
import sys

BASE_URL = "http://127.0.0.1:5000"

def test_frontend_assets():
    print("[1] Verifying frontend assets...")
    
    # 1. index.html
    with urllib.request.urlopen(f"{BASE_URL}/") as resp:
        assert resp.status == 200, f"Expected 200, got {resp.status}"
        html = resp.read().decode("utf-8")
        assert "<canvas" in html or "app.js" in html, "Missing app.js script in index.html"
        assert "styles.css" in html, "Missing styles.css in index.html"
        print("  ✓ index.html served with 200 OK")

    # 2. styles.css
    with urllib.request.urlopen(f"{BASE_URL}/styles.css") as resp:
        assert resp.status == 200
        css = resp.read().decode("utf-8")
        assert ".out-of-domain-banner" in css, "Missing .out-of-domain-banner in CSS"
        assert ".btn-sim-mode" in css, "Missing .btn-sim-mode in CSS"
        assert ".sim-mode-toggle" in css, "Missing .sim-mode-toggle in CSS"
        print("  ✓ styles.css served with out-of-domain banner and 2D sim-mode styles")

    # 3. app.js
    with urllib.request.urlopen(f"{BASE_URL}/app.js") as resp:
        assert resp.status == 200
        js = resp.read().decode("utf-8")
        assert "class SimNode" in js, "Missing SimNode in app.js"
        assert "stepSolver" in js, "Missing 2D stepSolver in SimNode"
        assert "renderSolverToImageData" in js, "Missing renderSolverToImageData in SimNode"
        assert "FLAME + O₂ FIELD" in js, "Missing FLAME + O2 FIELD button in SimNode"
        assert "THERMAL HULL MAP" in js, "Missing THERMAL HULL MAP button in SimNode"
        assert "class GraphNode" in js, "Missing GraphNode in app.js"
        assert "out_of_domain_warning" in js, "Missing out_of_domain_warning in NoteNode"
        assert "EXTRAPOLATION ZONE" in js, "Missing extrapolation banner in GraphNode"
        print("  ✓ app.js served with 2D Finite-Volume solver, Graph error bars & Note AI detector")

if __name__ == "__main__":
    try:
        test_frontend_assets()
        print("\nAll frontend assets and scripts verified successfully!")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
