import urllib.request
import json

def test_endpoints():
    print("Testing GET / ...")
    with urllib.request.urlopen("http://127.0.0.1:5000/") as resp:
        html = resp.read().decode("utf-8")
        assert resp.status == 200
        assert "viewport" in html
        assert "top-bar" in html
        assert "app.js" in html
        print(f"GET / OK (HTML size: {len(html)} bytes)")

    print("Testing GET /styles.css ...")
    with urllib.request.urlopen("http://127.0.0.1:5000/styles.css") as resp:
        css = resp.read().decode("utf-8")
        assert resp.status == 200
        assert ".bp-node" in css
        assert ".node" in css
        assert ".topbar" in css
        assert ".canvas-container" in css
        print(f"GET /styles.css OK (CSS size: {len(css)} bytes)")

    print("Testing GET /app.js ...")
    with urllib.request.urlopen("http://127.0.0.1:5000/app.js") as resp:
        js = resp.read().decode("utf-8")
        assert resp.status == 200
        assert "buildDefaultGraph" in js
        assert "flame_blueprint_graph_v2" in js
        # Check that there is no duplicate const isGas in setParams
        set_params_pos = js.find("setParams(newParams)")
        set_params_block = js[set_params_pos:set_params_pos+1200]
        assert set_params_block.count("const isGas") == 1, "Duplicate const isGas found in setParams!"
        print(f"GET /app.js OK (JS size: {len(js)} bytes, duplicate isGas = 0)")

    print("Testing POST /api/blueprint-eval ...")
    req = urllib.request.Request(
        "http://127.0.0.1:5000/api/blueprint-eval",
        data=json.dumps({
            "o2_percent": 21.0,
            "pressure_atm": 1.0,
            "flow_velocity_cms": 10.0,
            "fuel": "pmma",
            "cabin_volume_m3": 28.0
        }).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data["evaluation"]["flight_status"] == "GO"
        assert data["evaluation"]["explosion_risk_pct"] == 0.0
        assert data["evaluation"]["breach_outside_risk"] is False
        assert 2.0 <= data["evaluation"]["sim_telemetry"]["hull_heat_flux_kw_m2"] <= 5.0
        print(f"POST /api/blueprint-eval OK (Status: {data['evaluation']['flight_status']}, Flux: {data['evaluation']['sim_telemetry']['hull_heat_flux_kw_m2']} kW/m2)")

    print("\nALL SERVER ENDPOINTS & STATIC ASSETS VERIFIED SUCCESSFULLY!")

if __name__ == "__main__":
    test_endpoints()
