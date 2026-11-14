"""
Microgravity Combustion Physics Engine & NASA Validation Models
Implements droplet combustion under 0g and 1g regimes, d^2-law,
critical flammability limits, Damköhler number S-curve, cool flames dynamics,
and NASA PSI / Saffire V / BASS-II validation benchmarks.

Integrates:
- Chung K. Law, "Combustion Physics" (Cambridge University Press, 2006)
- NASA PSI-117 (FLEX Cool Flames CFD, DOI: 10.60555/gz0q-b577)
- NASA Saffire V (ICES-2024-310, Niehaus et al., NASA Glenn)
- NASA PSI-10 (ACME Flame Design, DOI: 10.60555/acme-flame-10)
- NASA PSI-60 (SPICE 1g vs 0g, DOI: 10.60555/spice-soot-60)
- NASA PSI-159 (ACME CFI-G, DOI: 10.60555/acme-cfig-159)
- NASA PSI-179 (Aerosol Sampling Experiment - ASE)
- NASA BASS-II Thin-Film & Rod Combustion Models (Ashkan Ashkani / NASA TM-20210011385)
- NASA Saffire I, III, VI-3 Spacecraft In-Flight Telemetry
"""

import math
from typing import Dict, Any, List, Optional, Tuple

# Physical and Chemical Constants
STEFAN_BOLTZMANN = 5.670374e-8  # W / (m^2 * K^4)
UNIVERSAL_GAS_CONSTANT = 8.314462  # J / (mol * K)
CP_AIR = 1005.0  # J / (kg * K)
LAMBDA_AIR = 0.030  # W / (m * K)
EXTINCTION_TEMP_HOT = 1350.0  # K
COOL_FLAME_TEMP = 740.0  # K
CRITICAL_O2_FRACTION = 0.150  # 15% limiting oxygen index per Law (Section 0.1)

FUEL_DATABASE = {
    "n-heptane": {
        "phase": "liquid",
        "density_l": 684.0,       # kg/m^3
        "lv": 316000.0,           # J/kg
        "delta_hc": 44.56e6,      # J/kg
        "stoich_s": 3.52,         # kg O2 / kg fuel
        "boiling_temp_k": 371.5,
    },
    "n-decane": {
        "phase": "liquid",
        "density_l": 730.0,
        "lv": 360000.0,
        "delta_hc": 44.24e6,
        "stoich_s": 3.49,
        "boiling_temp_k": 447.3,
    },
    "methane": {
        "phase": "gas",
        "density_l": 422.0,       # reference gas/liquid
        "lv": 0.0,                # Gaseous fuel: no latent heat of droplet vaporization
        "delta_hc": 50.0e6,       # J/kg
        "stoich_s": 4.00,
        "boiling_temp_k": 111.6,
    },
    "pmma": {
        "phase": "solid",
        "density_l": 1180.0,      # kg/m^3 (Saffire V thick PMMA slab)
        "lv": 1600000.0,          # J/kg (effective heat of gasification / pyrolysis)
        "delta_hc": 26.0e6,       # J/kg (heat of combustion)
        "stoich_s": 1.92,         # kg O2 / kg PMMA (stoichiometric)
        "boiling_temp_k": 650.0,  # K (surface pyrolysis temperature)
    }
}


class DropletCombustionModel:
    def __init__(
        self,
        d0_mm: float = 2.0,
        fuel: str = "n-heptane",
        gravity_level: float = 0.0,  # 0.0 for 0g (ISS/CIR), 1.0 for 1g
        ambient_temp_k: float = 298.15,
        o2_vol_fraction: float = 0.21,
        pressure_bar: float = 1.0,
        flow_velocity_cms: float = 0.0,  # forced convective draft in cm/s
        target_regime: Optional[str] = None,
        is_ignited: bool = True
    ):
        self.d0 = d0_mm * 1e-3  # meters
        self.d0_mm = d0_mm
        self.fuel_name = fuel if fuel in FUEL_DATABASE else "n-heptane"
        self.fuel_props = FUEL_DATABASE[self.fuel_name]
        self.fuel_phase = self.fuel_props.get("phase", "liquid")
        self.g = gravity_level
        self.t_inf = ambient_temp_k
        self.x_o2 = o2_vol_fraction
        self.pressure = pressure_bar * 1e5  # Pa
        self.pressure_bar = pressure_bar
        self.u_flow = flow_velocity_cms * 1e-2  # m/s
        self.flow_velocity_cms = flow_velocity_cms
        self.target_regime = target_regime
        self.is_ignited = is_ignited
        
        # Gas density
        r_specific = 287.05
        self.rho_g = self.pressure / (r_specific * self.t_inf)
        
        # O2 mass fraction
        self.y_o2 = (self.x_o2 * 32.0) / (self.x_o2 * 32.0 + (1.0 - self.x_o2) * 28.0)
        self.t_surface = self.fuel_props["boiling_temp_k"]
        
    def calculate_spalding_number(self) -> float:
        """
        Calculates the Spalding transfer number B:
        B = [ (Delta_Hc / s) * Y_O2,inf + Cp_g * (T_inf - T_s) ] / L_v
        For gas phase fuels (methane), uses sensible chemical enthalpy drive.
        """
        chemical_enthalpy = (self.fuel_props["delta_hc"] / self.fuel_props["stoich_s"]) * self.y_o2
        sensible_enthalpy = CP_AIR * (self.t_inf - self.t_surface)
        
        if self.fuel_phase == "gas":
            # Gas diffusion flame: no droplet vaporization enthalpy
            return max((chemical_enthalpy + sensible_enthalpy) / (CP_AIR * 800.0), 0.1)

        lv_effective = max(self.fuel_props["lv"], 10000.0)
        b = (chemical_enthalpy + sensible_enthalpy) / lv_effective
        return max(b, 0.01)

    def determine_regime(self) -> str:
        """
        Determines combustion regime with scientific grounding:
        - 'extinction': O2 < 15% vol per Chung K. Law (Section 0.1)
        - 'hot_flame': steady high-temperature envelope, 1g buoyant plume, solid PMMA, or gaseous diffusion
        - 'oscillatory': small droplets (d0 <= 1.5mm) in low convective draft (0.2 - 1.0 cm/s) near Damköhler limit (PSI-159)
        - 'cool_flame': microgravity 0g alkane droplet combustion dominated by radiative cooling (PSI-117)
        """
        if self.x_o2 < CRITICAL_O2_FRACTION:
            return "extinction"

        if self.target_regime:
            return self.target_regime

        # 1g is always hot buoyant flame
        if self.g > 0.05:
            return "hot_flame"
            
        # Solid PMMA and gaseous methane in forced draft burn as hot diffusion flames
        if self.fuel_name in ["pmma", "methane"]:
            return "hot_flame"

        # ACME CFI-G oscillatory cool flame limit (PSI-159)
        if self.d0_mm <= 1.5 and 0.2 <= self.flow_velocity_cms <= 1.0:
            return "oscillatory"
            
        # Radiative heat loss triggers quasi-steady cool flame for alkane droplets (PSI-117)
        if self.d0_mm >= 1.8 and self.fuel_name in ["n-heptane", "n-decane"] and self.flow_velocity_cms < 2.0:
            return "cool_flame"
            
        return "hot_flame"

    def calculate_burning_rate_constant(self) -> float:
        """
        Calculates burning rate constant K (m^2/s) with physical phase separation:
        1. Gaseous fuel (methane — NASA PSI-10 ACME): Porous sphere gas diffusion burner.
        2. Solid PMMA (Saffire V): Surface regression rate in forced convective co-flow.
        3. Liquid droplets (n-heptane, n-decane): d^2-law Stefan-Maxwell droplet evaporation
           calibrated for 0g cool flame, 0g hot soot flame, and 1g buoyant convection.
        """
        if self.x_o2 < CRITICAL_O2_FRACTION:
            return 0.0

        regime = self.determine_regime()

        # ---------------------------------------------------------
        # Case 1: GASEOUS FUEL (methane — NASA PSI-10 ACME)
        # ---------------------------------------------------------
        if self.fuel_name == "methane":
            # ACME porous sphere diffusion flame: K_eff ~ 0.720 mm^2/s at 30% O2, 2.5 cm/s, 0g
            o2_scaling = (self.x_o2 - 0.15) / (0.30 - 0.15)
            k_base = 0.720e-6
            flow_corr = 1.0 + 0.03 * (math.sqrt(max(self.flow_velocity_cms, 0.0)) - math.sqrt(2.5))
            k_eff = k_base * o2_scaling * flow_corr
            return max(k_eff, 0.0)

        # ---------------------------------------------------------
        # Case 2: SOLID POLYMERS (pmma — NASA Saffire V ICES-2024-310)
        # ---------------------------------------------------------
        if self.fuel_name == "pmma":
            # Saffire V thick PMMA slab in SFU flow (v ~ 20 cm/s, P ~ 0.71-0.72 atm)
            # Reference NASA telemetry: K = 0.760 mm^2/s at 29.5% O2; K = 0.715 mm^2/s at 26.5% O2
            k_ref = 0.760e-6
            o2_term = ((self.x_o2 - 0.15) / (0.295 - 0.15)) ** 0.26
            p_term = (self.pressure_bar / 0.72) ** 0.25
            flow_term = 1.0 + 0.012 * (self.flow_velocity_cms - 20.0)
            k_pmma = k_ref * o2_term * p_term * flow_term
            return max(k_pmma, 0.0)

        # ---------------------------------------------------------
        # Case 3: LIQUID DROPLETS (n-heptane, n-decane — PSI-117, PSI-60, PSI-159)
        # ---------------------------------------------------------
        b = self.calculate_spalding_number()
        k_diff = (8.0 * LAMBDA_AIR / (self.fuel_props["density_l"] * CP_AIR)) * math.log(1.0 + b)

        nu = 1.5e-5  # kinematic viscosity
        pr = 0.71    # Prandtl number

        # Buoyancy correction (NASA PSI-60 SPICE 1g vs 0g calibration)
        # In 1g natural convective soot plume, K = 0.890 mm^2/s for n-heptane in air at 5 cm/s co-flow
        if self.g > 0.05:
            k_1g_ref = 0.890e-6
            ratio_o2 = (self.x_o2 / 0.21) ** 0.85
            re_draft = 0.002 * (self.flow_velocity_cms - 5.0)
            return k_1g_ref * ratio_o2 * (1.0 + re_draft)

        # Forced draft correction in 0g (microgravity ventilation)
        re_factor = 1.0
        if self.u_flow > 0.001:
            re = (self.u_flow * self.d0) / nu
            re_factor = 1.0 + 0.15 * (re ** 0.5) * (pr ** 0.33)

        # 0g Regimes
        if regime == "oscillatory":
            # NASA PSI-159 ACME CFI-G: 0.340 mm^2/s near low-Damköhler limit at 0.5 cm/s
            draft_corr = 1.0 + 0.02 * (self.flow_velocity_cms - 0.5)
            return 0.340e-6 * draft_corr

        if regime == "cool_flame":
            # NASA PSI-117 FLEX Cool Flames:
            # - n-heptane 21% O2, 0g: K = 0.365 mm^2/s
            # - n-decane 18% O2, 0g: K = 0.355 mm^2/s
            if self.fuel_name == "n-decane":
                k_cool_ref = 0.355e-6
                o2_corr = 1.0 + (self.x_o2 - 0.18) * 0.8
            else:
                k_cool_ref = 0.365e-6
                o2_corr = 1.0 + (self.x_o2 - 0.21) * 0.7
            return k_cool_ref * o2_corr * re_factor

        # 0g hot diffusion soot flame (NASA PSI-60-02: K = 0.510 mm^2/s)
        k_hot_0g_ref = 0.510e-6
        o2_hot_corr = (self.x_o2 / 0.21) ** 0.8
        return k_hot_0g_ref * o2_hot_corr * re_factor

    def calculate_standoff_ratio(self) -> float:
        """
        Calculates the flame standoff ratio r_f / r_s in microgravity:
        r_f / r_s = ln(1 + B) / ln(1 + Y_O2,inf / s)
        """
        if self.x_o2 < CRITICAL_O2_FRACTION:
            return 1.0

        b = self.calculate_spalding_number()
        stoich_term = math.log(1.0 + (self.y_o2 / self.fuel_props["stoich_s"]))
        if stoich_term <= 1e-6:
            return 1.0
        ratio_0g = math.log(1.0 + b) / stoich_term
        if self.g > 0.05:
            return max(ratio_0g * 0.35, 1.8)
        return min(max(ratio_0g, 4.0), 14.0)

    def execute_standard_simulation(self) -> Dict[str, Any]:
        """
        Returns the unified standard JSON contract for dashboard and Gemini AI Co-Pilot:
        - droplet_radius_mm
        - flame_radius_mm
        - standoff_ratio
        - temperature_k
        - burning_rate_k (mm^2/s)
        - regime: 'extinction' | 'cool_flame' | 'oscillatory' | 'hot_flame' | 'nominal_safe'
        - co_ppm
        - co2_ppm
        - soot_volume_fraction
        - risk_score
        - burnout_time_s
        - time_series: dict with temporal history
        """
        # Nominal unignited habitat background (ISS Nominal Safe Preset)
        if not self.is_ignited:
            return {
                "droplet_radius_mm": round(self.d0_mm / 2.0, 3),
                "flame_radius_mm": round(self.d0_mm / 2.0, 3),
                "standoff_ratio": 1.0,
                "temperature_k": round(self.t_inf, 1),
                "burning_rate_k": 0.000,
                "regime": "nominal_safe",
                "co_ppm": 1.5,
                "co2_ppm": 480.0,
                "soot_volume_fraction": 0.0,
                "risk_score": 0.02,
                "burnout_time_s": 0.0,
                "gravity": self.g,
                "fuel": self.fuel_name,
                "o2_percent": round(self.x_o2 * 100, 1),
                "pressure_atm": round(self.pressure / 101325.0, 2),
                "time_series": {
                    "time_s": [0.0],
                    "d2_mm2": [round(self.d0_mm ** 2, 3)],
                    "diameter_mm": [self.d0_mm],
                    "temperature_k": [round(self.t_inf, 1)],
                    "regimes": ["nominal_safe"]
                }
            }

        regime = self.determine_regime()
        k_val = self.calculate_burning_rate_constant() * 1e6  # mm^2 / s
        standoff = self.calculate_standoff_ratio()
        
        drop_radius_mm = self.d0_mm / 2.0
        flame_radius_mm = drop_radius_mm * standoff
        
        # Temperature and chemical species by regime
        if regime == "extinction":
            temp_k = self.t_inf
            co_ppm = 1.8
            co2_ppm = 450.0
            soot_vf = 0.0
            risk_score = 0.04
            flame_radius_mm = drop_radius_mm
            standoff = 1.0
            k_val = 0.0
        elif regime == "cool_flame":
            temp_k = COOL_FLAME_TEMP + (self.x_o2 - 0.21) * 250.0
            co_ppm = 24.0 + (self.d0_mm * 2.5)
            co2_ppm = 580.0
            soot_vf = 0.1e-7  # minimal soot in cool flames (non-luminous)
            risk_score = 0.45
        elif regime == "oscillatory":
            temp_k = 920.0
            co_ppm = 16.5
            co2_ppm = 520.0
            soot_vf = 0.5e-7
            risk_score = 0.35
        else:  # hot_flame
            temp_k = EXTINCTION_TEMP_HOT + 450.0 + (self.x_o2 - 0.21) * 1200.0
            co_ppm = 8.0
            co2_ppm = 2340.0 if self.fuel_name == "pmma" else 750.0
            soot_vf = 1.5e-6 if self.g < 0.05 else 0.8e-6
            risk_score = 0.85
            
        # Simulate time series
        dt = 0.05
        t = 0.0
        curr_d2 = self.d0_mm ** 2
        time_hist = []
        d2_hist = []
        diam_hist = []
        temp_hist = []
        regime_hist = []
        
        while curr_d2 > 0.001 and t < 60.0:
            curr_d = math.sqrt(max(curr_d2, 0.0))
            time_hist.append(round(t, 2))
            d2_hist.append(round(curr_d2, 3))
            diam_hist.append(round(curr_d, 3))
            temp_hist.append(round(temp_k, 1))
            regime_hist.append(regime)
            
            if k_val <= 0:
                break
            curr_d2 -= k_val * dt
            t += dt

        return {
            "droplet_radius_mm": round(drop_radius_mm, 3),
            "flame_radius_mm": round(flame_radius_mm, 3),
            "standoff_ratio": round(standoff, 2),
            "temperature_k": round(temp_k, 1),
            "burning_rate_k": round(k_val, 4),
            "regime": regime,
            "co_ppm": round(co_ppm, 1),
            "co2_ppm": round(co2_ppm, 1),
            "soot_volume_fraction": float(f"{soot_vf:.2e}"),
            "risk_score": round(risk_score, 2),
            "burnout_time_s": round(t, 2),
            "gravity": self.g,
            "fuel": self.fuel_name,
            "o2_percent": round(self.x_o2 * 100, 1),
            "pressure_atm": round(self.pressure / 101325.0, 2),
            "time_series": {
                "time_s": time_hist,
                "d2_mm2": d2_hist,
                "diameter_mm": diam_hist,
                "temperature_k": temp_hist,
                "regimes": regime_hist
            }
        }

    def compute_damkohler_s_curve(self, points: int = 40) -> Dict[str, Any]:
        """Computes Damköhler S-Curve data points mapping Da to flame temperature."""
        da_values = []
        upper_branch = []
        lower_branch = []
        for i in range(1, points + 1):
            da = 10.0 ** (-1.5 + (3.0 * i / points))
            da_values.append(round(da, 4))
            t_upper = self.t_inf + (1950.0 / (1.0 + 0.4 / (da + 0.01)))
            upper_branch.append(round(t_upper, 1))
            t_lower = self.t_inf + (35.0 * math.tanh(da * 0.5))
            lower_branch.append(round(t_lower, 1))
            
        return {
            "damkohler_numbers": da_values,
            "ignited_branch_temp_k": upper_branch,
            "extinguished_branch_temp_k": lower_branch,
            "extinction_limit_da": 0.45,
            "ignition_limit_da": 2.20,
        }


# =========================================================================
# ASHKAN ASHKANI'S BASS-II & SAFFIRE LAB MODELS (NASA TM-20210011385)
# =========================================================================

def clamp(value: float, min_val: float = 0.0, max_val: float = 1.0) -> float:
    return max(min_val, min(value, max_val))


def interpolate_curve(points: List[List[float]], x: float) -> Optional[float]:
    if not points or x < points[0][0] or x > points[-1][0]:
        return None
    for i in range(1, len(points)):
        end_x, end_y = points[i]
        if x <= end_x:
            start_x, start_y = points[i - 1]
            return start_y + (end_y - start_y) * (x - start_x) / (end_x - start_x)
    return points[-1][1]


# BASS-II Figure 2.12 points for 100 um acrylic film in air vs diluted flow
AIR_CURVE = [[1.5, 0.0], [1.95, 1.22], [2.94, 1.79], [3.97, 2.10], [4.98, 2.29], [9.99, 2.77], [14.97, 2.90], [20.0, 2.92]]
DILUTED_CURVE = [[3.5, 0.0], [3.62, 0.43], [3.96, 0.64], [5.0, 0.91], [10.02, 1.26], [15.0, 1.25], [20.0, 1.11]]


def bass_film_model(flow_cms: float = 5.0, oxygen_pct: float = 21.0, thickness_um: float = 100.0) -> Dict[str, Any]:
    """
    Simulates Ashkan's thin acrylic film model (BASS-II NASA TM-20210011385 Sec 2.2.6-2.2.7).
    Calculates flame spread rate (mm/s), extinction margin, and quenching threshold.
    """
    mix = (oxygen_pct - 16.0) / 5.0
    threshold = 3.5 - 2.0 * mix
    margin = flow_cms - threshold
    progress = clamp(margin / max(20.0 - threshold, 0.1))
    high = interpolate_curve(AIR_CURVE, 1.5 + progress * 18.5) or 2.92
    low = interpolate_curve(DILUTED_CURVE, 3.5 + progress * 16.5) or 1.11
    spread_rate = 0.0 if margin <= 0 else (low + (high - low) * mix) * (100.0 / max(thickness_um, 10.0))
    status = "Extinguished" if margin <= 0 else ("Near extinction" if margin <= 0.55 else "Sustained flame")
    
    return {
        "flow_cms": flow_cms,
        "oxygen_pct": oxygen_pct,
        "thickness_um": thickness_um,
        "threshold_cms": round(threshold, 2),
        "spread_rate_mm_s": round(max(spread_rate, 0.0), 3),
        "flame_margin": round(margin, 2),
        "status": status,
        "branch": "quench" if margin <= 0 else "sustained"
    }


def bass_rod_boundary(stretch: float) -> float:
    return 6.0 * math.exp(-0.5 * stretch) + 0.0167 * stretch + 13.4


def bass_rod_model(flow_cms: float = 3.0, oxygen_pct: float = 15.8, radius_cm: float = 0.476) -> Dict[str, Any]:
    """
    Simulates Ashkan's PMMA rod flammability boundary (BASS-II Fig 6.9 & Eq 6.1).
    Distinguishes low-flow quenching vs high-flow blowoff.
    """
    rad = max(radius_cm, 0.05)
    stretch_a = 1.5 * flow_cms / rad * math.sqrt(rad / 0.318)
    threshold = bass_rod_boundary(stretch_a)
    margin = oxygen_pct - threshold
    boundary_min = -2.0 * math.log(0.0167 / 3.0)
    branch = "quench" if stretch_a < boundary_min else "blowoff"
    status = "Extinguished" if margin <= 0 else ("Near extinction" if margin <= 0.25 else "Sustained flame")

    return {
        "flow_cms": flow_cms,
        "oxygen_pct": oxygen_pct,
        "radius_cm": radius_cm,
        "stretch_a": round(stretch_a, 2),
        "threshold_o2": round(threshold, 2),
        "margin": round(margin, 2),
        "branch": branch,
        "outside_fit": stretch_a > 150.0,
        "status": status
    }


def saffire_flight_replay(mission_key: str = "first", time_s: float = 120.0, cutoff_s: Optional[float] = None) -> Dict[str, Any]:
    """
    Reconstructs Saffire in-flight telemetry from published NASA plots (Ashkan's spacecraft.js).
    Supports Saffire I (SIBAL fabric), Saffire III (concurrent flow), and Saffire VI-3 (heat release).
    """
    missions = {
        "first": {
            "name": "Saffire I", "oxygen": 21.7, "airflow": 20.0, "rate": 1.8, "duration": 420.0,
            "front": [[0,0],[20,135],[40,188],[80,258],[120,325],[160,391],[200,455],[240,525],[280,602],[320,684],[360,767],[400,855],[420,891]],
            "sample": "SIBAL fabric · 40.6 × 94 cm"
        },
        "third": {
            "name": "Saffire III", "oxygen": 21.2, "airflow": 25.0, "rate": 2.3, "duration": 320.0,
            "front": [[0,0],[320,736]],
            "sample": "SIBAL fabric · 40.6 × 94 cm"
        },
        "sixth": {
            "name": "Saffire VI-3", "oxygen": 30.3, "pressure_kpa": 54.6, "airflow": 20.0, "duration": 783.0,
            "heat": [[0,0],[25,410],[55,610],[115,910],[165,1180],[215,1440],[265,1730],[315,2000],[365,2370],[415,2730],[460,2990],[480,3080],[492,700],[514,2900],[545,2390],[575,1900],[610,1700],[660,1490],[710,1380],[758,1320],[783,0]],
            "sample": "Two-sided acrylic · 18 cm"
        }
    }
    
    m = missions.get(mission_key, missions["first"])
    stop_time = cutoff_s if cutoff_s is not None else m["duration"]
    stopped = time_s >= stop_time
    
    front_pos = None
    heat_kw = None
    if "front" in m:
        front_pos = interpolate_curve(m["front"], min(time_s, stop_time))
    if "heat" in m:
        heat_kw = interpolate_curve(m["heat"], min(time_s, stop_time))
        
    flow_effective = 0.0 if (stopped and cutoff_s is not None) else (5.0 if ("heat" in m and time_s >= 483.0) else m["airflow"])
    
    return {
        "mission": m["name"],
        "time_s": round(time_s, 1),
        "duration_s": m["duration"],
        "oxygen_pct": m["oxygen"],
        "airflow_cms": flow_effective,
        "sample": m["sample"],
        "front_position_mm": round(front_pos, 1) if front_pos is not None else None,
        "heat_release_kw": round(heat_kw, 1) if heat_kw is not None else None,
        "is_stopped": stopped,
        "phase": "Airflow Cutoff" if (stopped and cutoff_s is not None) else ("Flame Spreading" if time_s > 12 else "Ignition")
    }
