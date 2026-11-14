import os
import sys
import json
import urllib.request

def test_frontend_syntax():
    with open('frontend/app.js', 'r', encoding='utf-8') as f:
        js = f.read()

    # Simple check for key class definitions
    assert 'class NoteNode extends BaseNode' in js, "NoteNode missing"
    assert 'class SimToRealNode extends BaseNode' in js, "SimToRealNode missing"
    assert 'class VariableNode extends BaseNode' in js, "VariableNode missing"
    assert 'class SimNode extends BaseNode' in js, "SimNode missing"
    assert 'class GraphNode extends BaseNode' in js, "GraphNode missing"
    assert 'class PromptNode extends BaseNode' in js, "PromptNode missing"
    assert 'class BriefNode extends BaseNode' in js, "BriefNode missing"
    assert 'API_NOTE_URL' in js, "API_NOTE_URL missing"
    assert 'SpeechRecognition' in js, "SpeechRecognition missing"
    assert 'real_data_overlay' in js, "real_data_overlay missing in GraphNode"

    print("✓ frontend/app.js syntax & class structures verified.")

def test_static_assets():
    urls = [
        "http://localhost:5000/",
        "http://localhost:5000/index.html",
        "http://localhost:5000/styles.css",
        "http://localhost:5000/app.js"
    ]
    for url in urls:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as resp:
            assert resp.status == 200, f"Expected 200 for {url}, got {resp.status}"
            content = resp.read()
            assert len(content) > 100, f"Empty response for {url}"
            print(f"✓ Asset {url} returned HTTP 200 ({len(content)} bytes)")

def test_api_endpoints():
    # 1. /api/blueprint-eval
    eval_payload = {
        "params": {
            "o2_percent": 29.5,
            "pressure_atm": 0.71,
            "flow_velocity_cms": 20.0,
            "fuel": "pmma",
            "cabin_volume_m3": 28.0
        }
    }
    req = urllib.request.Request(
        "http://localhost:5000/api/blueprint-eval",
        data=json.dumps(eval_payload).encode('utf-8'),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        res = json.loads(resp.read().decode('utf-8'))
        assert res.get("status") == "success"
        assert "evaluation" in res
        assert "nearest_benchmark" in res
        assert "sim_to_real" in res
        s2r = res["sim_to_real"]
        assert len(s2r.get("top_matches", [])) == 3
        assert "reality_gap_pct" in s2r
        assert "sim_to_real_confidence_pct" in s2r
        assert "real_data_overlay" in s2r
        overlay = s2r["real_data_overlay"]
        assert len(overlay.get("time_s", [])) > 0
        assert len(overlay.get("measured_front_cm", [])) > 0
        print(f"✓ /api/blueprint-eval OK (Latency: {res.get('latency_ms')} ms, Confidence: {s2r.get('sim_to_real_confidence_pct')}%, Gap: {s2r.get('reality_gap_pct')}%)")

    # 2. /api/blueprint-note (Russian text note)
    note_payload = {
        "note_text": "Cygnus Saffire V: 29.5% O2, 0.71 atm, 20 cm/s flow of PMMA in 28 m3. Check cabin pressure.",
        "language": "ru"
    }
    req2 = urllib.request.Request(
        "http://localhost:5000/api/blueprint-note",
        data=json.dumps(note_payload).encode('utf-8'),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req2) as resp2:
        assert resp2.status == 200
        res2 = json.loads(resp2.read().decode('utf-8'))
        assert res2.get("status") == "success"
        params = res2.get("params", {})
        assert params.get("o2_percent") == 29.5
        assert params.get("pressure_atm") == 0.71
        assert params.get("flow_velocity_cms") == 20.0
        assert params.get("fuel") == "pmma"
        assert params.get("cabin_volume_m3") == 28.0
        assert res2.get("pipeline", {}).get("graph_metric") == "pressure"
        print(f"✓ /api/blueprint-note OK: {res2.get('summary')}")

if __name__ == "__main__":
    test_frontend_syntax()
    test_static_assets()
    test_api_endpoints()
    print("\nALL VERIFICATION SUITES PASSED SUCCESSFULLY!")
