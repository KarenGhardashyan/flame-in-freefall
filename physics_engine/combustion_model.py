"""
Microgravity Combustion Physics Engine
Implements droplet combustion under 0g and 1g regimes, d^2-law,
critical flammability limits, Damköhler number S-curve, and cool flames dynamics.
Based on:
- Chung K. Law, "Combustion Physics" (Cambridge University Press, 2006)
- NASA PSI-117 (FLEX Cool Flames CFD), PSI-159 (ACME CFI-G)
"""

import math
from typing import Dict, Any, List, Optional

# Physical and Chemical Constants
STEFAN_BOLTZMANN = 5.670374e-8  # W / (m^2 * K^4)
UNIVERSAL_GAS_CONSTANT = 8.314462  # J / (mol * K)
CP_AIR = 1005.0  # J / (kg * K)
LAMBDA_AIR = 0.030  # W / (m * K)
RHO_HEPTANE = 684.0  # kg / m^3 (Liquid n-heptane density)
LV_HEPTANE = 316000.0  # J / kg (Latent heat of vaporization)
DELTA_HC_HEPTANE = 44.56e6  # J / kg (Heat of combustion)
STOICH_MASS_RATIO_HEPTANE = 3.52  # mass O2 required per mass fuel (s)
EXTINCTION_TEMP_HOT = 1350.0  # K
COOL_FLAME_TEMP = 750.0  # K
CRITICAL_O2_FRACTION = 0.15  # 15% limiting oxygen index per Law (Section 0.1)


class DropletCombustionModel:
    def __init__(
        self,
        d0_mm: float = 2.0,
        fuel: str = "n-heptane",
        gravity_level: float = 0.0,  # 0.0 for 0g (ISS/CIR), 1.0 for 1g
        ambient_temp_k: float = 298.15,
        o2_vol_fraction: float = 0.21,
        pressure_bar: float = 1.0,
    ):
        self.d0 = d0_mm * 1e-3  # convert to meters
        self.d0_mm = d0_mm
        self.fuel = fuel
        self.g = gravity_level
        self.t_inf = ambient_temp_k
        self.x_o2 = o2_vol_fraction
        self.pressure = pressure_bar * 1e5  # Pa
        
        # Calculate ambient gas density: rho = P / (R_specific * T)
        r_specific = 287.05
        self.rho_g = self.pressure / (r_specific * self.t_inf)
        
        # O2 mass fraction from volume/mole fraction
        # Y_O2 = X_O2 * M_O2 / M_air
        self.y_o2 = (self.x_o2 * 32.0) / (self.x_o2 * 32.0 + (1.0 - self.x_o2) * 28.0)
        
        # Surface boiling temperature of droplet (approx 371.5 K for n-heptane at 1 bar)
        self.t_surface = 371.5
        
    def calculate_spalding_number(self) -> float:
        """
        Calculates the Spalding transfer number B (driving force for phase change & combustion):
        B = [ (Delta_Hc / s) * Y_O2,inf + Cp_g * (T_inf - T_s) ] / L_v
        """
        chemical_enthalpy = (DELTA_HC_HEPTANE / STOICH_MASS_RATIO_HEPTANE) * self.y_o2
        sensible_enthalpy = CP_AIR * (self.t_inf - self.t_surface)
        b = (chemical_enthalpy + sensible_enthalpy) / LV_HEPTANE
        return max(b, 0.01)

    def calculate_burning_rate_constant(self) -> float:
        """
        Calculates burning rate constant K (m^2/s) using the classical Stefan-Maxwell relation:
        K_0g = (8 * lambda_g / (rho_l * Cp_g)) * ln(1 + B)
        Under 1g, natural convection increases K via the Frossling-type Nu correction:
        Nu = 1 + 0.3 * (Gr * Pr)^0.25
        """
        b = self.calculate_spalding_number()
        k_pure_diffusion = (8.0 * LAMBDA_AIR / (RHO_HEPTANE * CP_AIR)) * math.log(1.0 + b)
        
        if self.g > 0.05:
            # Grashof number Gr = g * beta * deltaT * d0^3 / nu^2
            beta = 1.0 / self.t_inf
            nu = 1.5e-5  # m^2 / s kinematic viscosity of air
            gr = (9.81 * self.g * beta * (EXTINCTION_TEMP_HOT - self.t_inf) * (self.d0 ** 3)) / (nu ** 2)
            pr = 0.71  # Prandtl number for air
            nu_corr = 1.0 + 0.3 * ((gr * pr) ** 0.25)
            return k_pure_diffusion * nu_corr
        else:
            # Microgravity: purely diffusive, spherical burning rate
            return k_pure_diffusion

    def calculate_standoff_ratio(self) -> float:
        """
        Calculates the flame standoff ratio r_f / r_s in microgravity:
        r_f / r_s = ln(1 + B) / ln(1 + Y_O2,inf / s)
        In 0g, r_f / r_s is typically 5 to 12. In 1g buoyant plume, effective r_f/r_s is compressed to 2-4.
        """
        b = self.calculate_spalding_number()
        stoich_term = math.log(1.0 + (self.y_o2 / STOICH_MASS_RATIO_HEPTANE))
        if stoich_term <= 1e-6:
            return 1.0
        ratio_0g = math.log(1.0 + b) / stoich_term
        if self.g > 0.05:
            # Buoyancy compresses standoff distance
            return max(ratio_0g * 0.35, 1.5)
        return ratio_0g

    def check_flammability_limits(self) -> Dict[str, Any]:
        """
        Evaluates spacecraft atmosphere flammability criteria from Law Section 0.1:
        Combustion extinguishes if O2 < 15% vol.
        High pressure also elevates heat capacity density, increasing required heat release.
        """
        is_flammable = self.x_o2 >= CRITICAL_O2_FRACTION
        o2_margin = self.x_o2 - CRITICAL_O2_FRACTION
        safety_status = "SAFE_INERT" if not is_flammable else ("MARGINAL_RISK" if self.x_o2 < 0.18 else "FLAMMABLE_HAZARD")
        
        return {
            "is_flammable": is_flammable,
            "safety_status": safety_status,
            "o2_vol_percent": round(self.x_o2 * 100, 2),
            "critical_o2_percent": round(CRITICAL_O2_FRACTION * 100, 2),
            "o2_safety_margin": round(o2_margin * 100, 2),
            "atmosphere_risk_notes": (
                "Atmosphere is non-flammable per Law limit (O2 < 15%)."
                if not is_flammable
                else "Active combustion supported. Ceiling detectors inoperative in 0g."
            ),
        }

    def simulate_d2_trajectory(self, dt: float = 0.05) -> Dict[str, Any]:
        """
        Simulates droplet diameter squared d^2(t) over time until burnout or radiative extinction.
        Models transition to cool flames (NASA PSI-117/142) if radiative heat loss triggers
        hot flame extinction while droplet size remains above cool flame threshold.
        """
        k_hot = self.calculate_burning_rate_constant()
        # Convert K to mm^2 / s for easy tracking
        k_hot_mm2 = k_hot * 1e6
        k_cool_mm2 = k_hot_mm2 * 0.30  # cool flame burns slower
        
        d2_initial = self.d0_mm ** 2
        current_d2 = d2_initial
        t = 0.0
        
        time_series = []
        d2_series = []
        diameter_series = []
        regime_series = []
        temperature_series = []
        
        # Radiative heat loss increases with flame radius (which scales with droplet diameter in 0g)
        # In microgravity, hot flames extinguish radiatively at a critical droplet diameter (approx 1.0 - 1.2 mm)
        extinction_d_mm = 0.85 if self.g < 0.05 else 0.1
        regime = "HOT_DIFFUSION"
        flame_temp = EXTINCTION_TEMP_HOT + 450.0  # ~1800K peak
        
        while current_d2 > 0.001 and t < 60.0:
            current_d = math.sqrt(max(current_d2, 0.0))
            time_series.append(round(t, 3))
            d2_series.append(round(current_d2, 4))
            diameter_series.append(round(current_d, 4))
            regime_series.append(regime)
            temperature_series.append(round(flame_temp, 1))
            
            # Check radiative extinction in 0g
            if self.g < 0.05 and regime == "HOT_DIFFUSION" and current_d < extinction_d_mm:
                # Transition to cool flame (PSI-117 observation)
                regime = "COOL_FLAME"
                flame_temp = COOL_FLAME_TEMP
                
            current_k = k_hot_mm2 if regime == "HOT_DIFFUSION" else k_cool_mm2
            current_d2 -= current_k * dt
            t += dt
            
        return {
            "initial_diameter_mm": self.d0_mm,
            "burnout_time_s": round(t, 2),
            "effective_k_mm2_s": round(k_hot_mm2, 4),
            "standoff_ratio": round(self.calculate_standoff_ratio(), 2),
            "gravity": self.g,
            "time_history_s": time_series,
            "d2_history_mm2": d2_series,
            "diameter_history_mm": diameter_series,
            "combustion_regimes": regime_series,
            "flame_temperatures_k": temperature_series,
        }

    def compute_damkohler_s_curve(self, points: int = 40) -> Dict[str, Any]:
        """
        Computes Damköhler S-Curve data points mapping Da (residence / chemical time)
        to steady-state flame temperature (Law Chapter 8).
        """
        da_values = []
        upper_branch_temp = []
        lower_branch_temp = []
        
        for i in range(1, points + 1):
            # Da ranging from 0.01 to 10.0 on log scale
            da = 10.0 ** (-1.5 + (3.0 * i / points))
            da_values.append(round(da, 4))
            
            # Upper ignited branch (approaches adiabatic flame temp ~ 2100K)
            t_upper = self.t_inf + (1950.0 / (1.0 + 0.4 / (da + 0.01)))
            upper_branch_temp.append(round(t_upper, 1))
            
            # Lower frozen / pure mixing branch (ambient + minimal radical self-heating)
            t_lower = self.t_inf + (35.0 * math.tanh(da * 0.5))
            lower_branch_temp.append(round(t_lower, 1))
            
        return {
            "damkohler_numbers": da_values,
            "ignited_branch_temp_k": upper_branch_temp,
            "extinguished_branch_temp_k": lower_branch_temp,
            "extinction_limit_da": 0.45,
            "ignition_limit_da": 2.20,
        }
