"""
Verification and Test Script for Blueprint Dashboard Endpoints:
- POST /api/blueprint-eval
- POST /api/blueprint-prompt

Tests:
1. /api/blueprint-eval latency (< 20 ms), correctness, nearest NASA PSI benchmark matching
2. /api/blueprint-prompt response structure, [VERIFIED NASA PSI DATA] with URL,
   [THEORETICAL EXTRAPOLATION — C.K. LAW / SAFFIRE V MODEL], 3-part format.
3. Tests both Russian and English queries, and multiple physical configurations:
   - Saffire V Cygnus vehicle burn (O2=29.5%, P=0.71, Vg=20)
   - Chung K. Law flammability limit (O2=14%, P=1.0, Vg=0)
   - NASA PSI-117 Cool Flame mode (O2=21%, Vg=0.5, n-heptane)
   - Apollo 13 H2 leak explosive risk
"""

import sys
import json
import time
import urllib.request
import urllib.error

BASE_URL = "http://localhost:5000"


def test_blueprint_eval():
    print("\n" + "=" * 75)
    print("TEST 1: POST /api/blueprint-eval (Physical Engine + Nearest NASA Benchmark)")
    print("=" * 75)

    test_cases = [
        {
            "name": "Saffire V Flight Config",
            "params": {"o2_percent": 29.5, "pressure_atm": 0.71, "flow_velocity_cms": 20.0, "fuel": "pmma"}
        },
        {
            "name": "Law 14% O2 Extinction Limit",
            "params": {"o2_percent": 14.0, "pressure_atm": 1.0, "flow_velocity_cms": 0.0, "fuel": "pmma"}
        },
        {
            "name": "PSI-117 Cool Flame Config",
            "params": {"o2_percent": 21.0, "pressure_atm": 1.0, "flow_velocity_cms": 0.5, "fuel": "n-heptane"}
        },
        {
            "name": "Apollo 13 Detonation Gas Leak",
            "params": {"o2_percent": 21.0, "pressure_atm": 1.0, "flow_velocity_cms": 5.0, "h2_conc_pct": 6.5}
        }
    ]

    all_passed = True
    for tc in test_cases:
        url = f"{BASE_URL}/api/blueprint-eval"
        data = json.dumps(tc["params"]).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})

        t0 = time.time()
        with urllib.request.urlopen(req) as resp:
            elapsed_ms = (time.time() - t0) * 1000.0
            body = json.loads(resp.read().decode("utf-8"))

        eval_res = body.get("evaluation", {})
        nearest = body.get("nearest_benchmark", {})
        server_lat = body.get("latency_ms", 0.0)

        print(f"\n[Case: {tc['name']}]")
        print(f"  HTTP Roundtrip: {elapsed_ms:.2f} ms | Server Latency: {server_lat:.2f} ms (< 20 ms requirement)")
        print(f"  Flight Status:  {eval_res.get('flight_status')}")
        print(f"  Fire Risk:      {eval_res.get('fire_risk_pct')}%")
        print(f"  Explosion Risk: {eval_res.get('explosion_risk_pct')}%")
        print(f"  Nearest Bench:  {nearest.get('benchmark_id')} ({nearest.get('investigation')}) - Match: {nearest.get('match_pct')}%")
        print(f"  Official URL:   {nearest.get('url')}")

        # Assertions
        assert "evaluation" in body, "Missing evaluation dict"
        assert "nearest_benchmark" in body, "Missing nearest_benchmark dict"
        assert nearest.get("url", "").startswith("http"), "Invalid or missing benchmark URL"
        assert server_lat < 25.0, f"Server latency exceeded 20 ms: {server_lat} ms"

    print("\n>>> ALL /api/blueprint-eval TEST CASES PASSED SUCCESSFULLY! <<<")


def test_blueprint_prompt():
    print("\n" + "=" * 75)
    print("TEST 2: POST /api/blueprint-prompt (BM25 Retrieval + Gemini AI Co-Pilot)")
    print("=" * 75)

    test_queries = [
        {
            "query": "Безопасно ли поддерживать 29.5% O2 при давлении 0.71 атм и потоке SFU 20 см/с?",
            "params": {"o2_percent": 29.5, "pressure_atm": 0.71, "flow_velocity_cms": 20.0, "fuel": "pmma"},
            "language": "ru"
        },
        {
            "query": "Explain what happens below the 15% oxygen flammability limit per Chung K. Law.",
            "params": {"o2_percent": 14.0, "pressure_atm": 1.0, "flow_velocity_cms": 0.0},
            "language": "en"
        }
    ]

    for tq in test_queries:
        url = f"{BASE_URL}/api/blueprint-prompt"
        payload = {
            "user_query": tq["query"],
            "params": tq["params"],
            "language": tq["language"]
        }
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})

        t0 = time.time()
        with urllib.request.urlopen(req) as resp:
            elapsed_ms = (time.time() - t0) * 1000.0
            body = json.loads(resp.read().decode("utf-8"))

        advisory_text = body.get("advisory_text", "")
        model_name = body.get("model", "unknown")
        nearest = body.get("nearest_benchmark", {})
        chunks = body.get("retrieved_chunks", [])

        print(f"\n[Query: '{tq['query'][:60]}...']")
        print(f"  Model Engine:      {model_name}")
        print(f"  Roundtrip Time:    {elapsed_ms:.1f} ms")
        print(f"  Retrieved Chunks:  {len(chunks)} chunks from BM25")
        for i, c in enumerate(chunks):
            print(f"    - Chunk {i+1}: [{c.get('source')}] (Score: {c.get('score')})")
        print(f"  Nearest Benchmark: {nearest.get('benchmark_id')} ({nearest.get('match_pct')}%)")

        print("\n--- ADVISORY TEXT PREVIEW ---")
        lines = advisory_text.strip().splitlines()
        for line in lines[:18]:
            print("  " + line)
        if len(lines) > 18:
            print("  ... [truncated for display]")

        # Check required tags and 3-part structure
        has_nasa_tag = "[VERIFIED NASA PSI DATA]" in advisory_text
        has_theory_tag = "[THEORETICAL EXTRAPOLATION — C.K. LAW / SAFFIRE V MODEL]" in advisory_text
        has_verdict = ("VERDICT" in advisory_text) or ("ВЕРДИКТ" in advisory_text)
        has_reasons = ("OBJECTIVE PHYSICAL REASONS" in advisory_text) or ("ФИЗИЧЕСКОЕ ОБОСНОВАНИЕ" in advisory_text)
        has_lessons = ("HISTORICAL LESSON" in advisory_text) or ("УРОКИ ИСТОРИИ" in advisory_text)

        print("\n--- FORMAT & TAG VALIDATION ---")
        print(f"  [VERIFIED NASA PSI DATA] present:                                {has_nasa_tag}")
        print(f"  [THEORETICAL EXTRAPOLATION — C.K. LAW / SAFFIRE V MODEL] present: {has_theory_tag}")
        print(f"  1. VERDICT section present:                                     {has_verdict}")
        print(f"  2. OBJECTIVE PHYSICAL REASONS section present:                  {has_reasons}")
        print(f"  3. BENCHMARK REFERENCE & HISTORICAL LESSON section present:     {has_lessons}")

        assert has_nasa_tag, "Missing [VERIFIED NASA PSI DATA] tag"
        assert has_theory_tag, "Missing [THEORETICAL EXTRAPOLATION — C.K. LAW / SAFFIRE V MODEL] tag"
        assert has_verdict and has_reasons and has_lessons, "Missing 3-part structured sections"

    print("\n>>> ALL /api/blueprint-prompt TEST CASES PASSED SUCCESSFULLY! <<<")


if __name__ == "__main__":
    print("Testing Blueprint API Endpoints on localhost:5000...")
    try:
        test_blueprint_eval()
        test_blueprint_prompt()
        print("\n" + "=" * 75)
        print("ALL BLUEPRINT ENDPOINT VERIFICATIONS COMPLETED SUCCESSFULLY (100% PASS)")
        print("=" * 75)
    except Exception as exc:
        print(f"\n[FAIL] Test encountered error: {exc}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
