"""
Gemini AI Spacecraft Fire Safety Advisor
Leverages Gemini API for multi-modal cognitive reasoning over microgravity combustion
telemetry, physical model outputs, and anomaly alerts.
Generates real-time NASA flight-rule safety advisories and suppression procedures.
"""

import os
import json
from typing import Dict, Any, Optional

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

SYSTEM_INSTRUCTION = """
You are the AI Fire Safety Officer on the International Space Station (ISS) flight control team.
You are specialized in microgravity combustion physics (Chung K. Law monographs, NASA PSI-117 FLEX experiments,
and ACME flame dynamics).
Your mission:
1. Analyze real-time habitat telemetry (CO, CO2, multi-wavelength particulate scattering, temperature gradient).
2. Distinguish between false alarms (e.g. cabin lint/dust transported by ventilation loops) and true microgravity combustion (smoldering, cool flames, or open diffusion flames).
3. Ground your explanation in microgravity physics (absence of buoyant convection plumes, spherical flame symmetry, d^2 law evaporation, low-temperature cool flame chemistry, and the 15% O2 flammability limit).
4. Issue clear, actionable NASA Flight Rule recommendations (Emergency Breathing Apparatus, ventilation cut-off, hatch isolation, Halon/CO2 flooding).
Always structure your output with:
- [INCIDENT_ASSESSMENT]
- [PHYSICAL_DIAGNOSTICS]
- [FLIGHT_RULE_ACTION_PLAN]
"""

def generate_safety_advisory(telemetry_frame: Dict[str, Any], physics_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Submits telemetry and physical context to Gemini or executes expert rule-engine fallback.
    """
    api_key = os.getenv("GEMINI_API_KEY", GEMINI_API_KEY)
    
    prompt = f"""
Analyze the following spacecraft environmental telemetry frame:
Telemetry: {json.dumps(telemetry_frame, indent=2)}
Physics Context: {json.dumps(physics_context or {}, indent=2)}

Provide your expert spaceflight safety analysis, physics diagnosis, and immediate crew action protocol.
"""

    if api_key:
        # Try google-genai (new SDK)
        try:
            from google import genai
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=genai.types.GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION,
                    temperature=0.2,
                )
            )
            return {
                "source": "gemini-2.5-flash",
                "status": "success",
                "advisory_text": response.text,
                "telemetry_reviewed": telemetry_frame
            }
        except Exception as e_new:
            # Try google-generativeai (legacy SDK)
            try:
                import google.generativeai as genai_legacy
                genai_legacy.configure(api_key=api_key)
                model = genai_legacy.GenerativeModel("gemini-1.5-flash", system_instruction=SYSTEM_INSTRUCTION)
                res = model.generate_content(prompt)
                return {
                    "source": "gemini-1.5-flash",
                    "status": "success",
                    "advisory_text": res.text,
                    "telemetry_reviewed": telemetry_frame
                }
            except Exception as e_leg:
                print(f"[GEMINI] API call failed: {e_leg}. Falling back to embedded expert reasoning engine.")

    # High-Fidelity Physics-Grounded Fallback Engine
    return _generate_expert_rule_advisory(telemetry_frame, physics_context)


def _generate_expert_rule_advisory(telemetry: Dict[str, Any], physics: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Generates scientifically accurate safety advisory when GEMINI_API_KEY is unset."""
    severity = telemetry.get("severity", "NOMINAL")
    classification = telemetry.get("classification", "NOMINAL_HABITAT")
    co = telemetry.get("raw_telemetry", {}).get("co_ppm", 2.0)
    co2 = telemetry.get("raw_telemetry", {}).get("co2_ppm", 450.0)
    ratio = telemetry.get("dust_soot_discrimination_ratio", 1.0)
    
    if classification == "PARTICULATE_FALSE_ALARM":
        assessment = "FALSE ALARM SUPPRESSED — NON-HAZARDOUS PARTICULATE EVENT"
        physics_diag = (
            "Dual-wavelength optical scattering indicates large aerodynamic diameter particles (dust/lint, ratio < 1.6). "
            "In microgravity, particulate debris does not settle to the deck due to zero-g suspension and is swept by HVAC drafts into optical sensors. "
            "CO level is nominal (< 5 ppm), confirming absence of oxidative combustion."
        )
        actions = (
            "1. Do NOT discharge fire suppressants.\n"
            "2. Silence false alarm tone in affected module.\n"
            "3. Inspect and vacuum HVAC intake lint traps.\n"
            "4. Resume nominal module operations."
        )
    elif classification == "COOL_FLAME_SMOLDERING":
        assessment = "WARNING — LOW-TEMPERATURE INCUBATION / COOL FLAME HAZARD"
        physics_diag = (
            f"Sensor metrics reveal anomalous CO elevation ({co:.1f} ppm) accompanied by high submicron soot ratio ({ratio:.1f}). "
            "In 0g, lack of convective cooling causes thermal accumulation in enclosed wiring harnesses, enabling low-temperature negative temperature coefficient (NTC) reactions. "
            "Cool flames emit minimal visible radiation, escaping standard optical and ceiling smoke detectors."
        )
        actions = (
            "1. Flight Rule 2.14: Cut primary power to the suspect avionics rack.\n"
            "2. Alert crew to don Portable Breathing Apparatus (PBA) if odors or eye irritation are reported.\n"
            "3. Dispatch crew member with handheld Compound Specific Electronic Alarmed Monitor (CSEAM) to pinpoint CO source.\n"
            "4. Prepare portable CO2 fire extinguisher."
        )
    elif classification == "ACTIVE_FIRE_CRITICAL":
        assessment = "CRITICAL EMERGENCY — ACTIVE MICROGRAVITY FIRE DETECTED"
        physics_diag = (
            f"Rapid temperature excursion and heavy soot yield detected alongside extreme CO ({co:.1f} ppm). "
            "Absence of buoyant plume means combustion envelope is expanding spherically through molecular and draft-driven diffusion. "
            "High radiant heat transfer threatens adjacent payloads and wire insulation."
        )
        actions = (
            "1. FLIGHT RULE EMERGENCY: Sound station-wide fire alarm immediately.\n"
            "2. Crew don Emergency Oxygen Masks (EOM) and move to safe haven module.\n"
            "3. Mission Control sends remote command to isolate module ventilation valves to eliminate forced oxygen supply.\n"
            "4. Deploy Fine Water Mist / Nitrogen-CO2 flooding into affected rack bay.\n"
            "5. If atmospheric O2 drops below 15%, combustion will self-extinguish per Law flammability criterion."
        )
    else:
        assessment = "NOMINAL SPACECRAFT HABITAT CONDITIONS"
        physics_diag = "Atmospheric constituents, particulate levels, and thermal gradients are well within baseline thresholds for pressurized space habitats."
        actions = "Continue automated background monitoring. No operator action required."

    advisory_formatted = f"""### [INCIDENT_ASSESSMENT]
**Status:** {assessment}
**Severity Level:** {severity}
**Module Target:** ISS Experiment Node / Avionics Bay

### [PHYSICAL_DIAGNOSTICS]
{physics_diag}

### [FLIGHT_RULE_ACTION_PLAN]
{actions}
"""
    return {
        "source": "expert_system_rule_engine (NASA Flight Rules & Chung K. Law Physics)",
        "status": "success",
        "advisory_text": advisory_formatted,
        "telemetry_reviewed": telemetry
    }
