"""
Comprehensive Test Suite for Physics Core Engine (physics_engine/test_core.py)
Tests the 5 required physical scenarios for evaluate_fire_safety():
1. O2 = 14% (Chung K. Law flammability extinction limit)
2. O2 = 21%, V_g = 0.5 cm/s (Radiative quenching / low-temperature cool flame)
3. Saffire V (O2 = 29.5%, P = 0.71 atm, V_g = 20 cm/s, thick PMMA burn)
4. H2 leak above LFL (Detonation / Apollo 13 regime)
5. Pure oxygen O2 = 95%, P = 1.1 atm (Apollo 1 hyperoxic flashover regime)

Grounded in:
- C.K. Law, "Combustion Physics" (Ch. 0.1, 6.4, 7, 8)
- NASA BASS-II (TM-20210011385)
- NASA Saffire V (ICES-2024-310)
"""

import sys
import os

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from physics_engine.combustion_model import evaluate_fire_safety


def run_scenario_1_law_extinction():
    print("\n" + "=" * 75)
    print("SCENARIO 1: O2 = 14% (Chung K. Law Inherent Flammability Limit)")
    print("=" * 75)
    params = {
        "o2_percent": 14.0,
        "pressure_atm": 1.0,
        "flow_velocity_cms": 5.0,
        "fuel": "pmma",
        "gravity_level": 0.0
    }
    res = evaluate_fire_safety(params)

    print(f"Flight Status:       {res['flight_status']}")
    print(f"Fire Risk:           {res['fire_risk_pct']}%")
    print(f"Explosion Risk:      {res['explosion_risk_pct']}%")
    print(f"Breach Outside:      {res['breach_outside_risk']}")
    print(f"Historical Analog:   {res['historical_analog']['name']} ({res['historical_analog']['similarity_pct']}%)")
    print(f"Flame Temp:          {res['sim_telemetry']['flame_temp_k']} K")
    print(f"Flame Mode:          {res['sim_telemetry']['flame_color_mode']}")
    print(f"Spread Rate:         {res['sim_telemetry']['spread_rate_mm_s']} mm/s")
    print("\nObjective Engineering Reasons:")
    for r in res['objective_reasons']:
        print(f"  - {r}")

    # Assertions
    assert res['flight_status'] == "GO", f"Expected GO, got {res['flight_status']}"
    assert res['fire_risk_pct'] <= 10.0, f"Expected fire_risk <= 10, got {res['fire_risk_pct']}"
    assert res['breach_outside_risk'] is False, "Expected no breach risk"
    assert res['sim_telemetry']['flame_color_mode'] == "extinguished", "Expected extinguished mode"
    assert res['sim_telemetry']['spread_rate_mm_s'] == 0.0, "Expected zero spread rate"
    assert "Law" in res['historical_analog']['name'], "Expected Law analog"
    print("\n>>> Scenario 1 PASSED: Strict thermodynamic extinction verified.")
    return res


def run_scenario_2_cool_flame():
    print("\n" + "=" * 75)
    print("SCENARIO 2: O2 = 21%, V_g = 0.5 cm/s (Radiative Extinction / Cool Flame)")
    print("=" * 75)
    params = {
        "o2_percent": 21.0,
        "pressure_atm": 1.0,
        "flow_velocity_cms": 0.5,
        "fuel": "n-heptane",
        "gravity_level": 0.0
    }
    res = evaluate_fire_safety(params)

    print(f"Flight Status:       {res['flight_status']}")
    print(f"Fire Risk:           {res['fire_risk_pct']}%")
    print(f"Explosion Risk:      {res['explosion_risk_pct']}%")
    print(f"Breach Outside:      {res['breach_outside_risk']}")
    print(f"Historical Analog:   {res['historical_analog']['name']} ({res['historical_analog']['similarity_pct']}%)")
    print(f"Flame Temp:          {res['sim_telemetry']['flame_temp_k']} K")
    print(f"Flame Mode:          {res['sim_telemetry']['flame_color_mode']}")
    print(f"Fingering Instability: {res['sim_telemetry']['fingering_instability']}")
    print("\nObjective Engineering Reasons:")
    for r in res['objective_reasons']:
        print(f"  - {r}")

    # Assertions
    assert res['flight_status'] == "CAUTION", f"Expected CAUTION, got {res['flight_status']}"
    assert 600.0 <= res['sim_telemetry']['flame_temp_k'] <= 850.0, f"Expected 600-850K, got {res['sim_telemetry']['flame_temp_k']}"
    assert res['sim_telemetry']['flame_color_mode'] == "cool_blue", "Expected cool_blue mode"
    assert "PSI-117" in res['historical_analog']['name'], "Expected PSI-117 Cool Flame analog"
    print("\n>>> Scenario 2 PASSED: Low-temperature NTC cool flame branch verified.")
    return res


def run_scenario_3_saffire_v():
    print("\n" + "=" * 75)
    print("SCENARIO 3: Saffire V (O2 = 29.5%, P = 0.71 atm, V_g = 20 cm/s, thick PMMA)")
    print("=" * 75)
    params = {
        "o2_percent": 29.5,
        "pressure_atm": 0.71,
        "flow_velocity_cms": 20.0,
        "fuel": "pmma",
        "gravity_level": 0.0,
        "cabin_volume_m3": 19.2
    }
    res = evaluate_fire_safety(params)

    print(f"Flight Status:       {res['flight_status']}")
    print(f"Fire Risk:           {res['fire_risk_pct']}%")
    print(f"Explosion Risk:      {res['explosion_risk_pct']}%")
    print(f"Breach Outside:      {res['breach_outside_risk']}")
    print(f"Historical Analog:   {res['historical_analog']['name']} ({res['historical_analog']['similarity_pct']}%)")
    print(f"Flame Temp:          {res['sim_telemetry']['flame_temp_k']} K")
    print(f"Flame Mode:          {res['sim_telemetry']['flame_color_mode']}")
    print(f"Spread Rate:         {res['sim_telemetry']['spread_rate_mm_s']} mm/s")
    print(f"Final 600s Cabin P:  {res['time_series']['cabin_pressure_kpa'][-1]} kPa")
    print(f"Final 600s Cabin CO: {res['time_series']['co_ppm'][-1]} ppm")
    print("\nObjective Engineering Reasons:")
    for r in res['objective_reasons']:
        print(f"  - {r}")

    # Assertions
    assert res['flight_status'] in ["CAUTION", "NO-GO"], f"Expected CAUTION/NO-GO, got {res['flight_status']}"
    assert res['sim_telemetry']['flame_temp_k'] >= 1800.0, "Expected hot flame > 1800K"
    assert res['sim_telemetry']['flame_color_mode'] == "sooty_yellow", "Expected sooty_yellow mode"
    assert res['sim_telemetry']['spread_rate_mm_s'] > 1.0, "Expected positive spread rate"
    assert "Saffire" in res['historical_analog']['name'], "Expected Saffire analog"
    assert len(res['time_series']['t_sec']) == 61, "Expected 600s time series with 61 points"
    print("\n>>> Scenario 3 PASSED: Saffire V full vehicle transient burn verified.")
    return res


def run_scenario_4_h2_detonation():
    print("\n" + "=" * 75)
    print("SCENARIO 4: H2 Leak Above LFL (Apollo 13 Detonation / Blast Regime)")
    print("=" * 75)
    params = {
        "h2_conc_pct": 6.5,
        "o2_percent": 21.0,
        "pressure_atm": 1.0,
        "flow_velocity_cms": 5.0,
        "fuel": "pmma",
        "gravity_level": 0.0
    }
    res = evaluate_fire_safety(params)

    print(f"Flight Status:       {res['flight_status']}")
    print(f"Fire Risk:           {res['fire_risk_pct']}%")
    print(f"Explosion Risk:      {res['explosion_risk_pct']}%")
    print(f"Breach Outside:      {res['breach_outside_risk']}")
    print(f"Historical Analog:   {res['historical_analog']['name']} ({res['historical_analog']['similarity_pct']}%)")
    print(f"Blast Overpressure:  {res['sim_telemetry']['cabin_overpressure_kpa']} kPa")
    print(f"Flame Mode:          {res['sim_telemetry']['flame_color_mode']}")
    print("\nObjective Engineering Reasons:")
    for r in res['objective_reasons']:
        print(f"  - {r}")

    # Assertions
    assert res['flight_status'] == "NO-GO", f"Expected NO-GO, got {res['flight_status']}"
    assert res['explosion_risk_pct'] >= 90.0, f"Expected explosion_risk >= 90, got {res['explosion_risk_pct']}"
    assert res['breach_outside_risk'] is True, "Expected outside breach from blast"
    assert res['sim_telemetry']['flame_color_mode'] == "explosion_flash", "Expected explosion_flash mode"
    assert "Apollo 13" in res['historical_analog']['name'], "Expected Apollo 13 analog"
    print("\n>>> Scenario 4 PASSED: Chapman-Jouguet blast & Apollo 13 analog verified.")
    return res


def run_scenario_5_apollo_1_hyperoxic():
    print("\n" + "=" * 75)
    print("SCENARIO 5: Pure Oxygen O2 = 95%, P = 1.1 atm (Apollo 1 Flashover Regime)")
    print("=" * 75)
    params = {
        "o2_percent": 95.0,
        "pressure_atm": 1.1,
        "flow_velocity_cms": 5.0,
        "fuel": "pmma",
        "gravity_level": 0.0
    }
    res = evaluate_fire_safety(params)

    print(f"Flight Status:       {res['flight_status']}")
    print(f"Fire Risk:           {res['fire_risk_pct']}%")
    print(f"Explosion Risk:      {res['explosion_risk_pct']}%")
    print(f"Breach Outside:      {res['breach_outside_risk']}")
    print(f"Historical Analog:   {res['historical_analog']['name']} ({res['historical_analog']['similarity_pct']}%)")
    print(f"Flame Temp:          {res['sim_telemetry']['flame_temp_k']} K")
    print(f"Spread Rate:         {res['sim_telemetry']['spread_rate_mm_s']} mm/s")
    print(f"Hull Heat Flux:      {res['sim_telemetry']['hull_heat_flux_kw_m2']} kW/m2")
    print("\nObjective Engineering Reasons:")
    for r in res['objective_reasons']:
        print(f"  - {r}")

    # Assertions
    assert res['flight_status'] == "NO-GO", f"Expected NO-GO, got {res['flight_status']}"
    assert res['fire_risk_pct'] >= 95.0, f"Expected fire_risk >= 95, got {res['fire_risk_pct']}"
    assert res['breach_outside_risk'] is True, "Expected outside breach from extreme flux"
    assert res['sim_telemetry']['flame_temp_k'] >= 2600.0, "Expected hyperoxic flame > 2600K"
    assert res['sim_telemetry']['spread_rate_mm_s'] >= 20.0, "Expected fast spread > 20 mm/s"
    assert "Apollo 1" in res['historical_analog']['name'], "Expected Apollo 1 analog"
    print("\n>>> Scenario 5 PASSED: Hyperoxic flashover & Apollo 1 analog verified.")
    return res


def main():
    print("=" * 75)
    print("PHYSICS CORE ENGINE TEST HARNESS - 5 CRITICAL NASA MISSION SCENARIOS")
    print("=" * 75)

    s1 = run_scenario_1_law_extinction()
    s2 = run_scenario_2_cool_flame()
    s3 = run_scenario_3_saffire_v()
    s4 = run_scenario_4_h2_detonation()
    s5 = run_scenario_5_apollo_1_hyperoxic()

    print("\n" + "=" * 75)
    print("ALL 5 CRITICAL MISSION SCENARIOS PASSED WITH RIGOROUS PREDICTIVE PHYSICS!")
    print("Provenance: PREDICTIVE_PHYSICS_LAW_BASS2_SAFFIREV")
    print("=" * 75)


if __name__ == "__main__":
    main()
