import urllib.request
import json
import sys

BASE_URL = "http://127.0.0.1:5000"

def test_saffire_v_nominal():
    print("[1] Testing Saffire-V Nominal In-Domain Scenario...")
    payload = {
        "o2_percent": 29.5,
        "pressure_atm": 0.71,
        "flow_velocity_cms": 20.0,
        "fuel": "pmma",
        "cabin_volume_m3": 28.0
    }
    req = urllib.request.Request(
        f"{BASE_URL}/api/blueprint-eval",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200, f"Expected 200, got {resp.status}"
        data = json.loads(resp.read().decode("utf-8"))
        
        # Check time series corridor
        ts = data["evaluation"]["time_series"]
        assert "front_cm_min" in ts and "front_cm_max" in ts, "Missing front_cm corridor"
        assert "temp_c_min" in ts and "temp_c_max" in ts, "Missing temp_c corridor"
        assert "co_ppm_min" in ts and "co_ppm_max" in ts, "Missing co_ppm corridor"
        print("  ✓ Uncertainty corridor present in time_series")
        
        # Check sim_to_real
        s2r = data["sim_to_real"]
        assert s2r["has_direct_flight_data"] is True, "Expected has_direct_flight_data == True"
        assert s2r["best_match"]["match_pct"] >= 95.0, f"Expected high match, got {s2r['best_match']['match_pct']}"
        overlay = s2r["real_data_overlay"]
        assert len(overlay["points"]) > 0, "Expected discrete telemetry points"
        print(f"  ✓ Saffire-V Matched: {s2r['best_match']['id']} ({s2r['best_match']['match_pct']}%)")
        print(f"  ✓ Sim-to-Real Reality Gap: {s2r['reality_gap_pct']}% | Confidence: {s2r['sim_to_real_confidence_pct']}%")
        print(f"  ✓ Discrete flight telemetry points: {len(overlay['points'])} checkpoints loaded")

def test_extrapolation_zone():
    print("\n[2] Testing Pure Extrapolation Zone (Out-of-Domain conditions)...")
    payload = {
        "o2_percent": 90.0,
        "pressure_atm": 4.2,
        "flow_velocity_cms": 80.0,
        "fuel": "methane",
        "cabin_volume_m3": 28.0
    }
    req = urllib.request.Request(
        f"{BASE_URL}/api/blueprint-eval",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        s2r = data["sim_to_real"]
        assert s2r["has_direct_flight_data"] is False, "Expected has_direct_flight_data == False"
        assert s2r["best_match"]["match_pct"] < 55.0, f"Expected match < 55%, got {s2r['best_match']['match_pct']}"
        assert "EXTRAPOLATION ZONE" in s2r["gap_explanation"], "Expected EXTRAPOLATION ZONE in explanation"
        print(f"  ✓ Correctly flagged Extrapolation Zone (match: {s2r['best_match']['match_pct']}%)")
        print(f"  ✓ Explanation: {s2r['gap_explanation'][:100]}...")

def test_note_compiler_out_of_domain():
    print("\n[3] Testing Note AI Out-of-Domain Material Detection...")
    payload = {
        "note_text": "Hazard Test: Uranium nuclear fuel core burn at 40% O2, 1.2 atm, 15 cm/s flow in 28 m3",
        "language": "ru"
    }
    req = urllib.request.Request(
        f"{BASE_URL}/api/blueprint-note",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data.get("out_of_domain_warning") is True, f"Expected warning True, got {data.get('out_of_domain_warning')}"
        assert data.get("params", {}).get("fuel") == "pmma", f"Expected PMMA surrogate proxy, got {data.get('params', {}).get('fuel')}"
        assert "OUT-OF-DOMAIN" in data.get("warning_message", ""), "Expected warning message"
        print(f"  ✓ Out-of-domain detected: warning={data['out_of_domain_warning']}")
        print(f"  ✓ Fuel safely mapped to surrogate: {data['params']['fuel']}")
        print(f"  ✓ Warning banner text: {data['warning_message'][:90]}...")

def test_note_compiler_nominal():
    print("\n[4] Testing Note AI Nominal Flight Note...")
    payload = {
        "note_text": "Cygnus Saffire V: 29.5% O2, 0.71 atm, 20 cm/s flow of PMMA in 28 m3. Check cabin pressure.",
        "language": "ru"
    }
    req = urllib.request.Request(
        f"{BASE_URL}/api/blueprint-note",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data.get("out_of_domain_warning") in [False, None], "Expected no out-of-domain warning"
        assert data.get("params", {}).get("fuel") == "pmma"
        print(f"  ✓ Nominal compilation success: {data.get('summary')}")

if __name__ == "__main__":
    try:
        test_saffire_v_nominal()
        test_extrapolation_zone()
        test_note_compiler_out_of_domain()
        test_note_compiler_nominal()
        print("\n=======================================================")
        print("ALL 4 CRITICAL SIM-TO-REAL & COMPILER TESTS PASSED 100%")
        print("=======================================================")
    except Exception as e:
        print(f"\nTEST FAILED: {e}")
        sys.exit(1)
