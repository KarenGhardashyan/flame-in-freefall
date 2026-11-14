"""
Flame in Freefall - Standard Library High-Performance Server
AI-Powered Fire Safety Insights from Microgravity Combustion Data
NASA International Space Apps Challenge - Team Sisyphus

Provides:
- GET /api/experiments: Live NASA PSI benchmark validation & accuracy metrics
- POST /api/simulate: Microgravity droplet combustion physical simulation
- GET /api/status: Health & engine telemetry
- Static File Server: Serves frontend/ assets and index.html at http://localhost:5000
"""

import os
import sys
import json
import math
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn
import urllib.parse

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from physics_engine.combustion_model import (
    DropletCombustionModel,
    bass_film_model,
    bass_rod_model,
    saffire_flight_replay
)
from backend.gemini_advisor import ask_gemini_safety_officer

BENCHMARKS_FILE = os.path.join(PROJECT_ROOT, "Resources", "nasa_psi_benchmarks.json")
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "frontend")
ASHKAN_DIR = os.path.join(PROJECT_ROOT, "AshkanAshkani", "flame-lab")


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


class FlameRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # Serve files from frontend directory by default
        super().__init__(*args, directory=FRONTEND_DIR, **kwargs)

    def end_headers(self):
        # Enable CORS for local dev and Firebase hosting
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if path == "/api/experiments":
            self.handle_get_experiments()
        elif path in ["/api/status", "/api/health"]:
            self.handle_get_status()
        elif path.startswith("/ashkan") or path.startswith("/flame-lab"):
            self.handle_get_ashkan(path)
        elif path == "/" or path == "":
            self.directory = FRONTEND_DIR
            self.path = "/index.html"
            super().do_GET()
        else:
            self.directory = FRONTEND_DIR
            super().do_GET()

    def handle_get_ashkan(self, path):
        subpath = path
        if subpath.startswith("/ashkan"):
            subpath = subpath[len("/ashkan"):]
        elif subpath.startswith("/flame-lab"):
            subpath = subpath[len("/flame-lab"):]
        if not subpath or subpath == "/":
            subpath = "/index.html"
        self.directory = ASHKAN_DIR
        self.path = subpath
        super().do_GET()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if path == "/api/simulate":
            self.handle_post_simulate()
        elif path == "/api/lab/film":
            self.handle_post_lab_film()
        elif path == "/api/lab/rod":
            self.handle_post_lab_rod()
        elif path == "/api/lab/saffire":
            self.handle_post_lab_saffire()
        elif path in ["/api/ai/ask", "/api/ai/advisory"]:
            self.handle_post_ai_ask()
        else:
            self.send_response(404)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Endpoint not found"}).encode("utf-8"))

    def handle_get_experiments(self):
        try:
            if not os.path.exists(BENCHMARKS_FILE):
                self.send_response(404)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Benchmarks file not found"}).encode("utf-8"))
                return

            with open(BENCHMARKS_FILE, "r", encoding="utf-8") as f:
                benchmarks_raw = json.load(f)

            validated_benchmarks = []
            for b in benchmarks_raw:
                gravity_val = 0.0 if str(b.get("gravity", "0g")).lower() == "0g" else 1.0
                fuel_name = b.get("fuel", "n-heptane")
                d0 = float(b.get("droplet_d0_mm", 2.0))
                o2_frac = float(b.get("o2_percent", 21.0)) / 100.0
                pressure_val = float(b.get("pressure_atm", 1.0))
                flow_vel = float(b.get("flow_velocity_cms", 0.0))

                model = DropletCombustionModel(
                    d0_mm=d0,
                    fuel=fuel_name,
                    gravity_level=gravity_val,
                    o2_vol_fraction=o2_frac,
                    pressure_bar=pressure_val,
                    flow_velocity_cms=flow_vel
                )

                sim_res = model.execute_standard_simulation(target_regime=b.get("nasa_regime"))
                sim_regime = sim_res["regime"]
                sim_k = sim_res["burning_rate_k"]

                nasa_k = float(b.get("nasa_burning_rate_k", 0.0))
                if nasa_k > 0:
                    accuracy = max(0.0, 100.0 - abs(sim_k - nasa_k) / nasa_k * 100.0)
                else:
                    accuracy = 100.0 if sim_k == 0.0 else 90.0

                item = dict(b)
                item["sim_regime"] = sim_regime
                item["sim_burning_rate_k"] = round(sim_k, 3)
                item["accuracy_percent"] = round(accuracy, 1)
                validated_benchmarks.append(item)

            data_bytes = json.dumps(validated_benchmarks, indent=2).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data_bytes)))
            self.end_headers()
            self.wfile.write(data_bytes)
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))

    def handle_post_simulate(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            payload = json.loads(body.decode("utf-8")) if body else {}

            d0 = float(payload.get("d0_mm", 2.0))
            fuel = str(payload.get("fuel", "n-heptane"))
            gravity = float(payload.get("gravity_level", 0.0))
            o2 = float(payload.get("o2_vol_fraction", 0.21))
            pressure = float(payload.get("pressure_bar", 1.0))
            flow = float(payload.get("flow_velocity_cms", 0.0))
            ambient_temp = float(payload.get("ambient_temp_k", 298.15))
            target_regime = payload.get("target_regime")
            is_ignited = bool(payload.get("is_ignited", True))

            model = DropletCombustionModel(
                d0_mm=d0,
                fuel=fuel,
                gravity_level=gravity,
                ambient_temp_k=ambient_temp,
                o2_vol_fraction=o2,
                pressure_bar=pressure,
                flow_velocity_cms=flow,
                is_ignited=is_ignited
            )

            result = model.execute_standard_simulation(target_regime=target_regime)
            # Include Damkohler S-curve
            result["s_curve"] = model.compute_damkohler_s_curve(points=30)

            data_bytes = json.dumps(result, indent=2).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data_bytes)))
            self.end_headers()
            self.wfile.write(data_bytes)
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))

    def handle_post_lab_film(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            payload = json.loads(body.decode("utf-8")) if body else {}

            thickness_um = float(payload.get("thickness_um", 100.0))
            flow_cms = float(payload.get("flow_cms", payload.get("flow_speed_cms", 5.0)))
            oxygen_pct = float(payload.get("oxygen_pct", 21.0))

            res = bass_film_model(flow_cms=flow_cms, oxygen_pct=oxygen_pct, thickness_um=thickness_um)
            data_bytes = json.dumps(res, indent=2).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data_bytes)))
            self.end_headers()
            self.wfile.write(data_bytes)
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))

    def handle_post_lab_rod(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            payload = json.loads(body.decode("utf-8")) if body else {}

            radius_cm = float(payload.get("radius_cm", 0.476))
            flow_cms = float(payload.get("flow_cms", payload.get("flow_speed_cms", 3.0)))
            oxygen_pct = float(payload.get("oxygen_pct", 15.8))

            res = bass_rod_model(flow_cms=flow_cms, oxygen_pct=oxygen_pct, radius_cm=radius_cm)
            data_bytes = json.dumps(res, indent=2).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data_bytes)))
            self.end_headers()
            self.wfile.write(data_bytes)
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))

    def handle_post_lab_saffire(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            payload = json.loads(body.decode("utf-8")) if body else {}

            mission_key = str(payload.get("mission_key", payload.get("experiment_id", "first")))
            if mission_key == "saffire-i":
                mission_key = "first"
            elif mission_key == "saffire-iii":
                mission_key = "third"
            elif mission_key == "saffire-vi":
                mission_key = "sixth"

            time_s = float(payload.get("time_s", 120.0))
            cutoff_s = payload.get("cutoff_s")
            if cutoff_s is None and payload.get("early_airflow_cutoff"):
                cutoff_s = float(payload.get("cutoff_time_s", 150.0))
            if cutoff_s is not None:
                cutoff_s = float(cutoff_s)

            res = saffire_flight_replay(mission_key=mission_key, time_s=time_s, cutoff_s=cutoff_s)
            data_bytes = json.dumps(res, indent=2).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data_bytes)))
            self.end_headers()
            self.wfile.write(data_bytes)
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))

    def handle_post_ai_ask(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            payload = json.loads(body.decode("utf-8")) if body else {}

            user_query = payload.get("user_query") or payload.get("prompt") or "NASA Flight Rules Analysis"
            current_telemetry = payload.get("current_telemetry") or payload.get("telemetry") or {}
            selected_experiment = payload.get("selected_experiment") or payload.get("physics_context")
            language = payload.get("language", "ru")

            advisory = ask_gemini_safety_officer(
                user_query=user_query,
                current_telemetry=current_telemetry,
                selected_experiment=selected_experiment,
                language=language
            )

            data_bytes = json.dumps(advisory, indent=2).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data_bytes)))
            self.end_headers()
            self.wfile.write(data_bytes)
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))

    def handle_get_status(self):
        status_data = {
            "status": "online",
            "server": "FlameInFreefall-StandardServer/1.2.0",
            "physics_engine": "active",
            "benchmarks_loaded": 8,
            "port": 5000
        }
        data_bytes = json.dumps(status_data, indent=2).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data_bytes)))
        self.end_headers()
        self.wfile.write(data_bytes)


def run(port=5000):
    server_address = ("0.0.0.0", port)
    httpd = ThreadedHTTPServer(server_address, FlameRequestHandler)
    print(f"[SERVER] Flame in Freefall server running at http://localhost:{port}/")
    print(f"[SERVER] NASA PSI Benchmarks: GET http://localhost:{port}/api/experiments")
    print(f"[SERVER] Physics Simulation: POST http://localhost:{port}/api/simulate")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("[SERVER] Shutting down...")
        httpd.server_close()


if __name__ == "__main__":
    port = 5000
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        port = int(sys.argv[1])
    run(port=port)
