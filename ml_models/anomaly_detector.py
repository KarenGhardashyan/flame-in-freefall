"""
Early Fire Anomaly Detector for Microgravity Environments (0g)
Solves the fundamental failure of conventional terrestrial ceiling smoke detectors in space:
1. Rejects false alarms caused by airborne particulate matter (skin flakes, lint, food crumbs)
   suspended in microgravity ventilation loops.
2. Identifies true microgravity smoldering, cool flames, and nascent combustion via:
   - Multi-wavelength optical scattering ratio (sub-micron soot vs macro dust)
   - Gas sensor telemetry (CO, CO2, total VOC, O2 depletion rate)
   - Thermal gradient diffusion metrics in the absence of buoyant convective plumes.
"""

import math
from typing import Dict, Any, List, Tuple

class EarlyFireDetector:
    def __init__(self):
        # Thresholds derived from NASA Spacecraft Fire Safety Guidelines & Chung K. Law
        self.co_alarm_ppm = 25.0  # Normal ISS cabin baseline < 5 ppm
        self.co_co2_ratio_threshold = 0.035  # Combustion yields elevated CO/CO2 in low-convection
        self.soot_particle_size_ratio_min = 2.4  # Blue/IR scattering ratio: high for soot, low for dust
        self.temp_gradient_threshold_k_per_s = 0.12  # Sustained thermal excursion rate
        
    def classify_telemetry(
        self,
        co_ppm: float,
        co2_ppm: float,
        blue_optical_obscuration: float,  # %/m (sensitive to submicron soot ~0.1um)
        ir_optical_obscuration: float,    # %/m (sensitive to large cabin dust ~1-10um)
        temp_rate_k_s: float,
        ventilation_velocity_m_s: float = 0.15,
        o2_percent: float = 20.9
    ) -> Dict[str, Any]:
        """
        Evaluates real-time sensor frame and categorizes fire risk:
        - NOMINAL_HABITAT
        - PARTICULATE_FALSE_ALARM (Dust/Lint in ventilation - standard ceiling detector would falsely trigger!)
        - COOL_FLAME_SMOLDERING (Low temp, high CO, invisible cool flame risk)
        - ACTIVE_FIRE_CRITICAL (High thermal output, rapid O2 drop, high submicron soot)
        """
        # Baseline check
        co_excess = max(co_ppm - 4.0, 0.0)
        co2_excess = max(co2_ppm - 450.0, 1.0)
        co_co2_ratio = co_excess / co2_excess
        
        # Dual-wavelength particle discrimination ratio
        # Pure soot has high scattering at shorter (blue) wavelengths (Rayleigh-Debye regime)
        # Macro dust has roughly equal blue and IR scattering
        safe_ir = max(ir_optical_obscuration, 0.005)
        dust_soot_ratio = blue_optical_obscuration / safe_ir
        
        # Anomaly scoring logic (0.0 to 1.0)
        score = 0.0
        reasons = []
        is_false_alarm = False
        
        # Check if optical obscuration is high BUT caused by macro dust
        if blue_optical_obscuration > 1.5 or ir_optical_obscuration > 1.5:
            if dust_soot_ratio < 1.6 and co_ppm < 12.0:
                is_false_alarm = True
                classification = "PARTICULATE_FALSE_ALARM"
                reasons.append("High optical obscuration detected, but scattering wavelength ratio indicates macro dust/lint rather than combustion soot.")
                score = 0.25
            else:
                score += 0.45
                reasons.append("Elevated sub-micron particulate concentration detected.")
        
        # Gas indicators
        if co_ppm > self.co_alarm_ppm:
            score += 0.40
            reasons.append(f"Elevated Carbon Monoxide ({co_ppm:.1f} ppm) above spacecraft threshold.")
            
        if co_co2_ratio > self.co_co2_ratio_threshold and co_ppm > 8.0:
            score += 0.35
            reasons.append(f"Abnormal CO/CO2 ratio ({co_co2_ratio:.3f}) characteristic of microgravity oxygen-starved smoldering.")
            
        if temp_rate_k_s > self.temp_gradient_threshold_k_per_s:
            score += 0.30
            reasons.append(f"Anomalous localized temperature increase rate (+{temp_rate_k_s:.2f} K/s).")
            
        if o2_percent < 19.5:
            score += 0.20
            reasons.append(f"Active oxygen depletion observed ({o2_percent:.1f}% O2).")
            
        score = min(max(score, 0.0), 1.0)
        
        if is_false_alarm:
            severity = "LOW_CAUTION"
            alert_code = "FALSE_ALARM_FILTERED"
        elif score >= 0.70:
            severity = "CRITICAL"
            classification = "ACTIVE_FIRE_CRITICAL"
            alert_code = "FIRE_ALARM_ENGAGED"
        elif score >= 0.40:
            severity = "WARNING"
            classification = "COOL_FLAME_SMOLDERING"
            alert_code = "INCUBATION_DETECTED"
        else:
            severity = "NOMINAL"
            classification = "NOMINAL_HABITAT"
            alert_code = "ALL_CLEAR"
            reasons.append("Environmental telemetry within nominal ISS Columbus / Destiny module baselines.")

        return {
            "risk_score": round(score, 3),
            "severity": severity,
            "classification": classification,
            "alert_code": alert_code,
            "false_alarm_suppression_active": is_false_alarm,
            "dust_soot_discrimination_ratio": round(dust_soot_ratio, 2),
            "co_co2_ratio": round(co_co2_ratio, 4),
            "reasons": reasons,
            "recommended_action": self._determine_action(severity, is_false_alarm)
        }

    def _determine_action(self, severity: str, is_false_alarm: bool) -> str:
        if is_false_alarm:
            return "No fire suppression needed. Advise crew to inspect ventilation HEPA filters for accumulated particulate lint."
        if severity == "CRITICAL":
            return "IMMEDIATE EVACUATION / ISOLATE VENTILATION. Initiate Halon/CO2 localized inerting of module. Crew don emergency breathing apparatus."
        if severity == "WARNING":
            return "Warning: Potential cool flame or smoldering detected. Cut electrical power to affected avionics bay; inspect area with portable IR/CO sensor."
        return "Continuous monitoring active. Atmospheric controls nominal."

    def generate_synthetic_stream(self, seconds: int = 30) -> List[Dict[str, Any]]:
        """
        Generates realistic 1-second telemetry stream demonstrating transition from
        nominal -> dust disturbance -> smoldering incubation -> active cool flame.
        """
        stream = []
        for t in range(seconds):
            if t < 8:
                # Nominal
                co = 2.5 + 0.2 * math.sin(t)
                co2 = 480.0 + 5.0 * math.cos(t)
                blue_obs = 0.05
                ir_obs = 0.04
                dT = 0.01
            elif t < 15:
                # Crew stirring dust (false alarm event)
                co = 3.0
                co2 = 490.0
                blue_obs = 2.2  # High
                ir_obs = 2.1    # High IR means macro dust!
                dT = 0.02
            elif t < 23:
                # Smoldering starts inside avionics rack (cool flame incubation)
                co = 18.0 + (t - 15) * 2.5
                co2 = 560.0 + (t - 15) * 15.0
                blue_obs = 1.8 + (t - 15) * 0.4
                ir_obs = 0.5   # Blue dominates -> submicron soot
                dT = 0.08 + (t - 15) * 0.02
            else:
                # Critical combustion outbreak
                co = 45.0 + (t - 23) * 6.0
                co2 = 820.0 + (t - 23) * 50.0
                blue_obs = 5.5 + (t - 23) * 0.8
                ir_obs = 1.2
                dT = 0.25 + (t - 23) * 0.05

            eval_result = self.classify_telemetry(
                co_ppm=co,
                co2_ppm=co2,
                blue_optical_obscuration=blue_obs,
                ir_optical_obscuration=ir_obs,
                temp_rate_k_s=dT,
            )
            eval_result["timestamp_s"] = t
            eval_result["raw_telemetry"] = {
                "co_ppm": round(co, 2),
                "co2_ppm": round(co2, 2),
                "blue_obs_%/m": round(blue_obs, 2),
                "ir_obs_%/m": round(ir_obs, 2),
                "temp_rate_k_s": round(dT, 3)
            }
            stream.append(eval_result)
            
        return stream
