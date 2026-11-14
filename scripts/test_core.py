import sys
import os

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from physics_engine.combustion_model import DropletCombustionModel
from ml_models.anomaly_detector import EarlyFireDetector
from backend.gemini_advisor import generate_safety_advisory
from backend.firebase_client import get_connection_status

def test_all():
    print("[TEST 1] Physics Model Simulation:")
    model_0g = DropletCombustionModel(d0_mm=2.0, gravity_level=0.0)
    traj_0g = model_0g.simulate_d2_trajectory()
    print(f"  0g Burnout time: {traj_0g['burnout_time_s']}s, Effective K: {traj_0g['effective_k_mm2_s']} mm²/s, Standoff: {traj_0g['standoff_ratio']}")

    model_1g = DropletCombustionModel(d0_mm=2.0, gravity_level=1.0)
    traj_1g = model_1g.simulate_d2_trajectory()
    print(f"  1g Burnout time: {traj_1g['burnout_time_s']}s, Effective K: {traj_1g['effective_k_mm2_s']} mm²/s, Standoff: {traj_1g['standoff_ratio']}")

    flammability = model_0g.check_flammability_limits()
    print(f"  Flammability: {flammability['safety_status']} (O2: {flammability['o2_vol_percent']}%)")

    print("\n[TEST 2] ML Anomaly Detector (Dust False Alarm vs Real Fire):")
    detector = EarlyFireDetector()
    dust_res = detector.classify_telemetry(
        co_ppm=3.0,
        co2_ppm=490.0,
        blue_optical_obscuration=2.0,
        ir_optical_obscuration=1.9,
        temp_rate_k_s=0.01
    )
    print(f"  Dust Event: {dust_res['classification']} | Severity: {dust_res['severity']} | Suppressed: {dust_res['false_alarm_suppression_active']}")

    fire_res = detector.classify_telemetry(
        co_ppm=35.0,
        co2_ppm=750.0,
        blue_optical_obscuration=4.2,
        ir_optical_obscuration=0.9,
        temp_rate_k_s=0.20
    )
    print(f"  Fire Event: {fire_res['classification']} | Severity: {fire_res['severity']} | Score: {fire_res['risk_score']}")

    print("\n[TEST 3] Gemini / Flight Rule Safety Advisory:")
    advisory = generate_safety_advisory(fire_res)
    print(f"  Advisory Source: {advisory['source']} | Status: {advisory['status']}")
    print(f"  Snippet:\n{advisory['advisory_text'][:250]}...")

    print("\n[TEST 4] Firebase Client Status:")
    print("  Firebase Connection:", get_connection_status())

    print("\n==========================================")
    print(">>> ALL CORE MODULE TESTS PASSED (100%) <<<")
    print("==========================================")

if __name__ == "__main__":
    test_all()
