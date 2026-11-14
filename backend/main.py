"""
Flame in Freefall - FastAPI Main Application Server
AI-Powered Fire Safety Insights from Microgravity Combustion Data
NASA International Space Apps Challenge - Team Sisyphus
"""

import os
import sys
import json
import asyncio
from typing import Dict, Any, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from physics_engine.combustion_model import DropletCombustionModel
from ml_models.anomaly_detector import EarlyFireDetector
from backend.firebase_client import initialize_firebase, record_telemetry_event, get_connection_status
from backend.gemini_advisor import generate_safety_advisory

app = FastAPI(
    title="Flame in Freefall API",
    description="Microgravity combustion physics engine, early fire anomaly detector, and Gemini AI safety advisor.",
    version="1.0.0",
)

# Enable CORS for local development and Firebase Hosting domains
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

detector = EarlyFireDetector()

# Pydantic Schemas
class D2SimulationRequest(BaseModel):
    d0_mm: float = Field(default=2.0, ge=0.2, le=10.0, description="Initial droplet diameter in mm")
    fuel: str = Field(default="n-heptane", description="Hydrocarbon fuel name")
    gravity_level: float = Field(default=0.0, ge=0.0, le=1.0, description="Gravity level (0.0 for 0g, 1.0 for 1g)")
    ambient_temp_k: float = Field(default=298.15, description="Ambient temperature in Kelvin")
    o2_vol_fraction: float = Field(default=0.21, ge=0.05, le=0.50, description="Oxygen volume fraction")
    pressure_bar: float = Field(default=1.0, ge=0.2, le=5.0, description="Cabin pressure in bar")

class TelemetryFrameRequest(BaseModel):
    co_ppm: float = Field(default=3.5, description="Carbon monoxide in ppm")
    co2_ppm: float = Field(default=500.0, description="Carbon dioxide in ppm")
    blue_optical_obscuration: float = Field(default=0.1, description="Blue wavelength obscuration %/m")
    ir_optical_obscuration: float = Field(default=0.08, description="IR wavelength obscuration %/m")
    temp_rate_k_s: float = Field(default=0.01, description="Rate of temperature rise K/s")
    o2_percent: float = Field(default=20.9, description="Ambient O2 percentage")

class AIAdvisoryRequest(BaseModel):
    telemetry: Dict[str, Any]
    physics_context: Optional[Dict[str, Any]] = None


@app.on_event("startup")
async def startup_event():
    initialize_firebase()
    print("[SERVER] Flame in Freefall API Server started.")


@app.get("/health")
def health_check():
    return {
        "status": "online",
        "project": "Flame in Freefall",
        "team": "Sisyphus",
        "firebase": get_connection_status(),
        "physics_engine": "operational",
        "anomaly_detector": "operational",
        "gemini_advisor": "operational"
    }


@app.post("/api/physics/simulate-d2")
def simulate_d2_trajectory(req: D2SimulationRequest):
    """
    Simulates droplet vaporization and burning under 0g or 1g according to the d^2 law (Law Ch. 6.4).
    Computes S-curve and radiative extinction transitions (NASA PSI-117).
    """
    model = DropletCombustionModel(
        d0_mm=req.d0_mm,
        fuel=req.fuel,
        gravity_level=req.gravity_level,
        ambient_temp_k=req.ambient_temp_k,
        o2_vol_fraction=req.o2_vol_fraction,
        pressure_bar=req.pressure_bar,
    )
    trajectory = model.simulate_d2_trajectory()
    s_curve = model.compute_damkohler_s_curve()
    flammability = model.check_flammability_limits()
    
    return {
        "trajectory": trajectory,
        "s_curve": s_curve,
        "flammability_assessment": flammability,
        "spalding_number_B": round(model.calculate_spalding_number(), 3),
        "standoff_ratio": round(model.calculate_standoff_ratio(), 2),
    }


@app.post("/api/detection/evaluate-telemetry")
def evaluate_telemetry(frame: TelemetryFrameRequest):
    """
    Evaluates habitat telemetry frame against false-alarm dust profiles and 0g fire signatures.
    """
    result = detector.classify_telemetry(
        co_ppm=frame.co_ppm,
        co2_ppm=frame.co2_ppm,
        blue_optical_obscuration=frame.blue_optical_obscuration,
        ir_optical_obscuration=frame.ir_optical_obscuration,
        temp_rate_k_s=frame.temp_rate_k_s,
        o2_percent=frame.o2_percent
    )
    record_telemetry_event(result)
    return result


@app.get("/api/detection/demo-stream")
def get_demo_stream():
    """Returns a pre-computed 30s realistic space station telemetry time series."""
    return detector.generate_synthetic_stream(seconds=30)


@app.post("/api/ai/advisor-report")
def get_ai_advisor_report(req: AIAdvisoryRequest):
    """
    Invokes Gemini AI (or the physical expert reasoning engine) to formulate
    a comprehensive NASA Flight Rule fire emergency response.
    """
    advisory = generate_safety_advisory(req.telemetry, req.physics_context)
    return advisory


@app.websocket("/ws/telemetry-stream")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint streaming live simulated 0g combustion telemetry
    and real-time classification updates every 1 second.
    """
    await websocket.accept()
    stream = detector.generate_synthetic_stream(seconds=30)
    try:
        for frame in stream:
            await websocket.send_json(frame)
            await asyncio.sleep(1.0)
        # Keep connection alive with periodic nominal telemetry
        t = 30
        while True:
            t += 1
            eval_res = detector.classify_telemetry(co_ppm=2.8, co2_ppm=485.0, blue_optical_obscuration=0.04, ir_optical_obscuration=0.03, temp_rate_k_s=0.005)
            eval_res["timestamp_s"] = t
            await websocket.send_json(eval_res)
            await asyncio.sleep(1.0)
    except WebSocketDisconnect:
        print("[WS] Client disconnected from telemetry stream.")
    except Exception as e:
        print(f"[WS] Error during stream: {e}")


# Serve frontend static assets if available
frontend_dir = os.path.join(PROJECT_ROOT, "frontend")
if os.path.isdir(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
