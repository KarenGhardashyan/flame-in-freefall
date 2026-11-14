import json
import os
import sys

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from physics_engine.combustion_model import DropletCombustionModel

BENCHMARKS_FILE = os.path.join(PROJECT_ROOT, "Resources", "nasa_psi_benchmarks.json")

with open(BENCHMARKS_FILE, "r", encoding="utf-8") as f:
    benchmarks = json.load(f)

print(f"{'ID':<12} | {'Fuel':<10} | {'Regime':<12} | {'Sim K':<8} | {'NASA K':<8} | {'Match %':<8} | {'Status'}")
print("-" * 75)

all_passed = True
for b in benchmarks:
    g = 0.0 if str(b.get("gravity", "0g")).lower() == "0g" else 1.0
    m = DropletCombustionModel(
        d0_mm=float(b.get("droplet_d0_mm", 2.0)),
        fuel=b.get("fuel", "n-heptane"),
        gravity_level=g,
        o2_vol_fraction=float(b.get("o2_percent", 21.0)) / 100.0,
        pressure_bar=float(b.get("pressure_atm", 1.0)),
        flow_velocity_cms=float(b.get("flow_velocity_cms", 0.0)),
        target_regime=b.get("nasa_regime")
    )
    res = m.execute_standard_simulation()
    sim_k = res["burning_rate_k"]
    nasa_k = float(b.get("nasa_burning_rate_k", 0.0))
    if nasa_k > 0:
        match_pct = max(0.0, 100.0 - abs(sim_k - nasa_k) / nasa_k * 100.0)
    else:
        match_pct = 100.0 if sim_k == 0.0 else 0.0
    
    status = "PASS (>=95%)" if match_pct >= 95.0 else "FAIL (<95%)"
    if match_pct < 95.0:
        all_passed = False
    print(f"{b['id']:<12} | {b.get('fuel'):<10} | {res['regime']:<12} | {sim_k:<8.3f} | {nasa_k:<8.3f} | {match_pct:<8.1f} | {status}")

print("-" * 75)
print("All >= 95%:", all_passed)
