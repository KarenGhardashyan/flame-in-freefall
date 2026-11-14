"""
Verification test script for 5 Critical Bugs in physics_engine and frontend
"""
import sys
import os

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from physics_engine.combustion_model import evaluate_fire_safety

def test_all():
    print("=" * 60)
    print("RUNNING 5-BUG VERIFICATION TEST SUITE")
    print("=" * 60)

    # 1. ISS Nominal (21% O2)
    print("\n--- TEST 1: ISS Nominal (21% O2) ---")
    r1 = evaluate_fire_safety({
        "o2_percent": 21.0,
        "pressure_atm": 1.0,
        "flow_velocity_cms": 10.0,
        "fuel": "pmma",
        "cabin_volume_m3": 28.0
    })
    flux1 = r1["sim_telemetry"]["hull_heat_flux_kw_m2"]
    status1 = r1["flight_status"]
    expl1 = r1["explosion_risk_pct"]
    breach1 = r1["breach_outside_risk"]
    print(f"Status: {status1}")
    print(f"Explosion risk: {expl1}%")
    print(f"Breach outside: {breach1}")
    print(f"Hull heat flux: {flux1} kW/m2")

    assert status1 == "GO", f"Expected GO, got {status1}"
    assert expl1 == 0.0, f"Expected 0.0, got {expl1}"
    assert breach1 is False, f"Expected breach=False, got {breach1}"
    assert 2.0 <= flux1 <= 5.0, f"Expected 2.0-5.0 kW/m2, got {flux1}"
    print(">>> TEST 1 PASSED: ISS Nominal is strictly GO with 2-5 kW/m2 flux, 0% explosion risk, NO breach.")

    # 2. Hyperoxic 65.5% O2
    print("\n--- TEST 2: 65.5% O2 Heat Flux ---")
    r2 = evaluate_fire_safety({
        "o2_percent": 65.5,
        "pressure_atm": 1.0,
        "flow_velocity_cms": 15.0,
        "fuel": "pmma",
        "cabin_volume_m3": 28.0
    })
    flux2 = r2["sim_telemetry"]["hull_heat_flux_kw_m2"]
    print(f"Hull heat flux: {flux2} kW/m2")
    assert 22.0 <= flux2 <= 45.0, f"Expected 22.0-45.0 kW/m2, got {flux2}"
    print(">>> TEST 2 PASSED: 65.5% O2 peak heat flux is strictly in 22-45 kW/m2.")

    # 3. Extinction (14% O2)
    print("\n--- TEST 3: Extinction (14% O2) ---")
    r3 = evaluate_fire_safety({
        "o2_percent": 14.0,
        "pressure_atm": 1.0,
        "flow_velocity_cms": 5.0,
        "fuel": "pmma"
    })
    flux3 = r3["sim_telemetry"]["hull_heat_flux_kw_m2"]
    print(f"Hull heat flux: {flux3} kW/m2")
    assert flux3 == 0.0, f"Expected 0.0 kW/m2, got {flux3}"
    print(">>> TEST 3 PASSED: Extinction heat flux is strictly 0.0 kW/m2.")

    # 4. Hydrogen Fuel (Carbon-free H2)
    print("\n--- TEST 4: Hydrogen Fuel (Carbon-Free H2) ---")
    r4 = evaluate_fire_safety({
        "o2_percent": 21.0,
        "pressure_atm": 1.0,
        "flow_velocity_cms": 5.0,
        "fuel": "h2",
        "h2_conc_pct": 6.5
    })
    co_reason = [r for r in r4["objective_reasons"] if "toxic atmosphere" in r.lower()][0]
    print(f"CO Reason: {co_reason}")
    max_co = max(r4["time_series"]["co_ppm"])
    print(f"Max CO in time series: {max_co} ppm")
    assert max_co == 0.0, f"Expected 0.0 ppm CO, got {max_co}"
    assert "carbon-free H2 fuel" in co_reason, f"Expected 'carbon-free H2 fuel' in reason, got {co_reason}"
    print(">>> TEST 4 PASSED: Hydrogen produces N/A (carbon-free H2 fuel) and 0.0 ppm CO.")

    # 5. Phantom Explosion Immunity
    print("\n--- TEST 5: Phantom Explosion Immunity (PMMA + gas leak param) ---")
    r5 = evaluate_fire_safety({
        "o2_percent": 21.0,
        "pressure_atm": 1.0,
        "flow_velocity_cms": 10.0,
        "fuel": "pmma",
        "h2_conc_pct": 6.5,
        "gas_vol_pct": 6.5
    })
    expl5 = r5["explosion_risk_pct"]
    breach5 = r5["breach_outside_risk"]
    analog5 = r5["historical_analog"]["name"]
    print(f"Explosion risk: {expl5}%")
    print(f"Breach outside: {breach5}")
    print(f"Analog name: {analog5}")
    assert expl5 == 0.0, f"Expected 0.0% explosion risk for solid PMMA, got {expl5}"
    assert breach5 is False, f"Expected no breach for solid PMMA, got {breach5}"
    assert "Apollo 13" not in analog5, f"Did not expect Apollo 13 for solid PMMA, got {analog5}"
    print(">>> TEST 5 PASSED: Non-gas fuels are completely immune to phantom explosions.")

    print("\n" + "=" * 60)
    print("ALL 5 VERIFICATION CRITERIA VERIFIED SUCCESSFULLY!")
    print("=" * 60)

if __name__ == "__main__":
    test_all()
