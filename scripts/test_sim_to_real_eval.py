import sys, os
sys.path.insert(0, os.path.abspath('.'))
import json
from backend.knowledge_retriever import compute_sim_to_real
from physics_engine.combustion_model import evaluate_fire_safety

def run_tests():
    # Test 1: Saffire V preset conditions
    params_saffire = {
        'o2_percent': 29.5,
        'pressure_atm': 0.71,
        'flow_velocity_cms': 20.0,
        'fuel': 'pmma',
        'cabin_volume_m3': 28.0,
        'match_by': 'physics'
    }
    eval_res = evaluate_fire_safety(params_saffire)
    s2r_phys = compute_sim_to_real(params_saffire, eval_res)

    print('--- TEST 1: PHYSICS CRITERIA ---')
    print(f"Confidence: {s2r_phys['sim_to_real_confidence_pct']}%")
    print(f"Reality Gap: {s2r_phys['reality_gap_pct']}%")
    print('Top 3 matches:')
    for m in s2r_phys['top_matches']:
        print(f"  {m['id']}: {m['match_pct']}% (active={m.get('is_active')})")

    # Test 2: Safety criteria
    params_safety = dict(params_saffire)
    params_safety['match_by'] = 'safety'
    s2r_safe = compute_sim_to_real(params_safety, eval_res)
    print('\n--- TEST 2: SAFETY CRITERIA ---')
    for m in s2r_safe['top_matches']:
        print(f"  {m['id']}: {m['match_pct']}%")

    # Test 3: Telemetry criteria
    params_tel = dict(params_saffire)
    params_tel['match_by'] = 'telemetry'
    s2r_tel = compute_sim_to_real(params_tel, eval_res)
    print('\n--- TEST 3: TELEMETRY CRITERIA ---')
    for m in s2r_tel['top_matches']:
        print(f"  {m['id']}: {m['match_pct']}%")

    # Test 4: Active benchmark selection (e.g. SAFFIRE-V-02)
    params_bench = dict(params_saffire)
    params_bench['active_benchmark_id'] = 'SAFFIRE-V-02'
    s2r_bench = compute_sim_to_real(params_bench, eval_res)
    print('\n--- TEST 4: ACTIVE BENCHMARK SAFFIRE-V-02 ---')
    print(f"Best match ID: {s2r_bench['best_match']['id']}")
    print(f"Active match ID: {s2r_bench.get('active_benchmark_id')}")
    for m in s2r_bench['top_matches']:
        print(f"  {m['id']}: {m['match_pct']}% (active={m.get('is_active')})")

    # Test 5: Sensitivity check (change P and O2)
    params_low_p = dict(params_saffire)
    params_low_p['pressure_atm'] = 0.40
    s2r_low_p = compute_sim_to_real(params_low_p, evaluate_fire_safety(params_low_p))
    print('\n--- TEST 5: SENSITIVITY CHECK (P=0.40 atm) ---')
    print(f"Original Conf: {s2r_phys['sim_to_real_confidence_pct']}% -> Low P Conf: {s2r_low_p['sim_to_real_confidence_pct']}%")
    print(f"Top 1 match: {s2r_low_p['top_matches'][0]['id']}: {s2r_low_p['top_matches'][0]['match_pct']}%")

    # Test 6: Note AI Intent Parsing
    from backend.gemini_advisor import compile_note_to_blueprint
    note_safety = compile_note_to_blueprint("Срочно сравни по safety для отсека Cygnus с обдувом 20 см/с", language="ru")
    print('\n--- TEST 6: NOTE AI INTENT "сравни по safety" ---')
    print(f"Compiled match_by: {note_safety.get('pipeline', {}).get('match_by')}")

    note_bench = compile_note_to_blueprint("Возьми эталон Saffire-V-02 и оцени концентрацию кислорода 26.5%", language="ru")
    print('\n--- TEST 7: NOTE AI INTENT "эталон Saffire-V-02" ---')
    print(f"Compiled active_benchmark_id: {note_bench.get('pipeline', {}).get('active_benchmark_id')}")
    print(f"Compiled O2: {note_bench.get('params', {}).get('o2_percent')}%")

if __name__ == '__main__':
    run_tests()
