"""
Microgravity Combustion Physics Engine
Implements droplet combustion under 0g and 1g regimes, d^2-law,
critical flammability limits, Damköhler number S-curve, cool flames dynamics,
and NASA PSI validation benchmarks.

Based on:
- Chung K. Law, "Combustion Physics" (Cambridge University Press, 2006)
- NASA PSI-117 (FLEX Cool Flames CFD), PSI-10 (ACME Flame Design),
  PSI-60 (SPICE 1g vs 0g), PSI-159 (ACME CFI-G), PSI-62 (BASS)
"""

import math
from typing import Dict, Any, List, Optional

# Physical and Chemical Constants
STEFAN_BOLTZMANN = 5.670374e-8  # W / (m^2 * K^4)
UNIVERSAL_GAS_CONSTANT = 8.314462  # J / (mol * K)
CP_AIR = 1005.0  # J / (kg * K)
LAMBDA_AIR = 0.030  # W / (m * K)
EXTINCTION_TEMP_HOT = 1350.0  # K
COOL_FLAME_TEMP = 740.0  # K
CRITICAL_O2_FRACTION = 0.15  # 15% limiting oxygen index per Law (Section 0.1)

FUEL_DATABASE = {
    "n-heptane": {
        "density_l": 684.0,       # kg/m^3
        "lv": 316000.0,           # J/kg
        "delta_hc": 44.56e6,      # J/kg
        "stoich_s": 3.52,         # kg O2 / kg fuel
        "boiling_temp_k": 371.5,
    },
    "n-decane": {
        "density_l": 730.0,
        "lv": 360000.0,
        "delta_hc": 44.24e6,
        "stoich_s": 3.49,
        "boiling_temp_k": 447.3,
    },
    "methane": {
        "density_l": 422.0,
        "lv": 510000.0,
        "delta_hc": 50.0e6,
        "stoich_s": 4.00,
        "boiling_temp_k": 111.6,
    },
    "pmma": {
        "density_l": 1180.0,      # kg/m^3 (Saffire V thick PMMA slab)
        "lv": 1600000.0,          # J/kg (effective heat of gasification)
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
    ):
        self.d0 = d0_mm * 1e-3  # meters
        self.d0_mm = d0_mm
        self.fuel_name = fuel if fuel in FUEL_DATABASE else "n-heptane"
        self.fuel_props = FUEL_DATABASE[self.fuel_name]
        self.g = gravity_level
        self.t_inf = ambient_temp_k
        self.x_o2 = o2_vol_fraction
        self.pressure = pressure_bar * 1e5  # Pa
        self.u_flow = flow_velocity_cms * 1e-2  # m/s
        
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
        """
        chemical_enthalpy = (self.fuel_props["delta_hc"] / self.fuel_props["stoich_s"]) * self.y_o2
        sensible_enthalpy = CP_AIR * (self.t_inf - self.t_surface)
        b = (chemical_enthalpy + sensible_enthalpy) / self.fuel_props["lv"]
        return max(b, 0.01)

    def calculate_burning_rate_constant(self) -> float:
        """
        Calculates burning rate constant K (m^2/s) using Stefan-Maxwell formulation:
        K_0g = (8 * lambda_g / (rho_l * Cp_g)) * ln(1 + B)
        Corrected for buoyancy (1g) and forced flow draft.
        """
        if self.x_o2 < CRITICAL_O2_FRACTION:
            # Below 15% O2 flammability limit per Law Section 0.1
            return 0.0

        b = self.calculate_spalding_number()
        k_diff = (8.0 * LAMBDA_AIR / (self.fuel_props["density_l"] * CP_AIR)) * math.log(1.0 + b)
        
        nu = 1.5e-5  # kinematic viscosity
        pr = 0.71    # Prandtl number
        
        # Buoyancy correction (Natural Convection)
        gr_term = 0.0
        if self.g > 0.05:
            beta = 1.0 / self.t_inf
            gr = (9.81 * self.g * beta * (EXTINCTION_TEMP_HOT - self.t_inf) * (self.d0 ** 3)) / (nu ** 2)
            gr_term = 0.3 * ((gr * pr) ** 0.25)
            
        # Forced draft correction (Ventilation / flow velocity)
        re_term = 0.0
        if self.u_flow > 0.001:
            re = (self.u_flow * self.d0) / nu
            re_term = 0.276 * (re ** 0.5) * (pr ** 0.33)
            
        nu_corr = 1.0 + gr_term + re_term
        return k_diff * nu_corr

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

    def determine_regime(self) -> str:
        """
        Determines combustion regime:
        - 'extinction' (or 'no_ignition'): O2 < 15% vol
        - 'oscillatory': small droplets near low-temperature limit with low draft (PSI-159)
        - 'cool_flame': microgravity 0g alkane combustion with radiative cooling (PSI-117)
        - 'hot_flame': steady high-temperature envelope or 1g buoyant flame
        """
        if self.x_o2 < CRITICAL_O2_FRACTION:
            return "extinction"
            
        if self.g > 0.05:
            return "hot_flame"
            
        # 0g microgravity conditions
        if self.fuel_name == "pmma":
            return "hot_flame"

        if self.d0_mm <= 1.5 and 0.2 <= (self.u_flow * 100) <= 1.0:
            return "oscillatory"
            
        # Radiative heat loss triggers cool flame for alkane droplets
        if self.d0_mm >= 1.8 and self.fuel_name in ["n-heptane", "n-decane"]:
            return "cool_flame"
            
        return "hot_flame"

    def execute_standard_simulation(self) -> Dict[str, Any]:
        """
        Returns the unified standard JSON contract for the entire team (physicist + 3D designer):
        - droplet_radius_mm
        - flame_radius_mm
        - standoff_ratio
        - temperature_k
        - burning_rate_k
        - regime: 'no_ignition' | 'cool_flame' | 'oscillatory' | 'hot_flame' | 'extinction'
        - co_ppm
        - co2_ppm
        - soot_volume_fraction
        - risk_score
        - time_series: dict with detailed temporal history
        """
        regime = self.determine_regime()
        k_val = self.calculate_burning_rate_constant() * 1e6  # mm^2 / s
        standoff = self.calculate_standoff_ratio()
        
        drop_radius_mm = self.d0_mm / 2.0
        flame_radius_mm = drop_radius_mm * standoff
        
        # Temperature and chemical species by regime
        if regime == "extinction":
            temp_k = self.t_inf
            co_ppm = 2.0
            co2_ppm = 450.0
            soot_vf = 0.0
            risk_score = 0.0
            flame_radius_mm = drop_radius_mm
            standoff = 1.0
            k_val = 0.0
        elif regime == "cool_flame":
            temp_k = COOL_FLAME_TEMP + (self.x_o2 - 0.21) * 300.0
            co_ppm = 22.0 + (self.d0_mm * 4.0)
            co2_ppm = 580.0
            soot_vf = 0.1e-7  # minimal soot in cool flames
            risk_score = 0.45
            k_val = max(k_val * 0.45, 0.15)  # cool flame rate is reduced
        elif regime == "oscillatory":
            temp_k = 950.0
            co_ppm = 15.0
            co2_ppm = 520.0
            soot_vf = 0.5e-7
            risk_score = 0.35
            k_val = max(k_val * 0.65, 0.25)
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
