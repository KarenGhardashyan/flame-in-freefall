# Microgravity Combustion Physics & Fire Safety Formulas
**Reference:** Chung K. Law, *Combustion Physics*, Cambridge University Press (2006)  
**Project:** Flame in Freefall: AI-Powered Fire Safety Insights from Microgravity Combustion Data  
**Team:** Sisyphus (NASA International Space Apps Challenge)  
**Applicability:** ISS Combustion Integrated Rack (CIR), Multi-user Droplet Combustion Apparatus (MDCA), Spacecraft Habitat Fire Safety

---

## 1. Section 0.1: Defense and Space Applications

### 1.1 The Failure of Conventional Terrestrial Fire Detection in Microgravity
* **Absence of Buoyant Thermal Plumes:**  
  In normal gravity ($1g$), density differences between high-temperature flame products ($ho_b$) and cool ambient gas ($ho_\infty$) induce a strong buoyancy force:
  $$F_b pprox g (ho_\infty - ho_b)$$
  This buoyancy accelerates hot gases and combustion particulates upward at velocities of $1 - 5\text{ m/s}$, creating a buoyant plume that directly impinges upon ceiling surfaces.
* **Ceiling Smoke Detector Failure in Spacecraft:**  
  In orbital freefall / microgravity ($g \approx 0$), $F_b \to 0$. Combustion products and particulate soot do **not** rise. Instead, they expand spherically via molecular diffusion and are deflected solely by low-velocity cabin ventilation loops ($u_{\text{vent}} \approx 0.05 - 0.2\text{ m/s}$).
* **Catastrophic Detection Latency:**  
  Standard ceiling-mounted ionization and optical smoke detectors remain completely un-triggered during the critical incubation phase. Smoke only reaches the sensor once the entire module is heavily contaminated or when forced air currents slowly carry particles across the compartment.
* **Early Detection Paradigm:**  
  Fire safety in space habitats requires multi-sensor spatial distributed arrays measuring:
  - Localized diffusion gradients ($\nabla T$, $\nabla X_{CO}$).
  - Dual-wavelength optical scattering (blue/IR ratio) to differentiate micron-scale cabin lint/dust from submicron combustion soot ($d_p < 0.1\ \mu\text{m}$).
  - Non-luminous radical chemiluminescence ($OH^*$, $CH^*$).

### 1.2 Spacecraft Atmosphere Flammability Criteria
* **The 15% Oxygen Extinction Limit:**  
  Law establishes that below a critical oxygen mole fraction, normal hydrocarbon combustion cannot generate sufficient chemical energy to overcome thermal dissipation:
  $$X_{O_2} < 0.15 \quad (15\%\ \text{by volume})$$
  Any atmosphere with $X_{O_2} < 0.15$ is inherently non-flammable under standard spacecraft thermal environments.
* **Pressure Compensation Criterion ($P > 1\text{ atm}$):**  
  At elevated cabin pressures, the volumetric heat capacity of the atmosphere increases proportionally with density ($\rho C_p \propto P$). Consequently, a higher chemical reaction rate is required to sustain flame temperature above the extinction threshold:
  $$T_f > T_{\text{extinction}} \approx 1350\text{ K}$$

---

## 2. Chapter 6.4: Droplet Vaporization and Combustion

### 2.1 The Classical $d^2$-Law (Quasi-Steady Droplet Burning)
In quiescent microgravity, absence of buoyant convection restores pure spherical symmetry ($1\text{D}$ radial coordinate $r$):
$$d^2(t) = d_0^2 - K \cdot t$$

Where:
* $d(t)$ = instantaneous droplet diameter at time $t$ [m]
* $d_0$ = initial droplet diameter [m]
* $K$ = burning rate constant (evaporation coefficient) [$\text{m}^2/\text{s}$ or $\text{mm}^2/\text{s}$]
* $t_b = \frac{d_0^2}{K}$ = total droplet burning lifetime [s]

### 2.2 Theoretical Burning Rate Constant ($K$) Formulation
From the Stefan-Maxwell conservation of species and thermal energy:
$$K = \frac{8 \lambda_g}{\rho_l C_{p,g}} \ln(1 + B)$$

Where:
* $\lambda_g$ = thermal conductivity of ambient gas [$\text{W}/(\text{m}\cdot\text{K})$]
* $\rho_l$ = liquid fuel density [$\text{kg}/\text{m}^3$]
* $C_{p,g}$ = specific heat capacity of gas phase [$\text{J}/(\text{kg}\cdot\text{K})$]
* $B$ = Spalding mass/thermal transfer number:
  $$B = \frac{\frac{\Delta H_c}{s} Y_{O_2,\infty} + C_{p,g}(T_\infty - T_s)}{L_v}$$
  with $\Delta H_c$ = heat of combustion, $s$ = stoichiometric oxidizer-to-fuel mass ratio, $Y_{O_2,\infty}$ = ambient oxygen mass fraction, $L_v$ = latent heat of vaporization, $T_s$ = droplet surface boiling temperature.

### 2.3 Flame Standoff Ratio ($r_f / r_s$)
In steady spherical microgravity flames:
$$\frac{r_f}{r_s} = \frac{\ln(1 + B)}{\ln\left(1 + \frac{Y_{O_2,\infty}}{s}\right)}$$
* In $1g$: Buoyant upward flow compresses the flame boundary toward the droplet ($r_f / r_s \approx 2 - 4$).
* In $0g$: Pure diffusion allows the flame front to expand far into the ambient gas ($r_f / r_s \approx 8 - 12$). This enlarged surface area dramatically elevates radiative heat loss.

---

## 3. Chapter 8: Limit Phenomena (Ignition, Extinction & S-Curve)

### 3.1 Damköhler Number ($Da$) and the Combustion S-Curve
Limit phenomena are governed by the Damköhler number ($Da$), the dimensionless ratio of characteristic flow/diffusion residence time to chemical reaction time:
$$Da = \frac{\tau_{\text{residence}}}{\tau_{\text{reaction}}} = \frac{\delta^2 / D}{1 / (A \rho^n e^{-E_a / R_u T})}$$

Plotting the maximum reaction zone temperature $T_{\text{max}}$ versus $Da$ produces the canonical **S-Curve**:
1. **Upper Branch (Ignited / Robust Burning):** Fast chemical kinetics ($Da \gg 1$). Reaction rate is diffusion-controlled.
2. **Middle Branch (Unstable State):** Negative slope ($\partial T / \partial Da < 0$), physically unobservable in steady state.
3. **Lower Branch (Extinguished / Frozen):** Slow chemical reactions ($Da \ll 1$), negligible heat release.
4. **Extinction Turning Point ($Da_{\text{ext}}$):** When strain rate or heat loss increases such that $Da$ drops below $Da_{\text{ext}}$, the system abruptly drops to the extinguished branch.

### 3.2 Microgravity Radiative Extinction vs Terrestrial Convective Blowoff
* **Terrestrial $1g$ Extinction:** Primarily driven by hydrodynamic strain and shear ($Da < Da_{\text{crit, strain}}$).
* **Microgravity $0g$ Radiative Extinction:** Because convective flow is near zero, residence times are large. Radiative emission from hot soot and triatomic gaseous products ($CO_2$, $H_2 O$) scales with the volume of the enlarged flame front:
  $$q_{\text{rad}} = 4 \sigma \kappa_P \left(T_f^4 - T_\infty^4\right)$$
  When $q_{\text{rad}}$ exceeds the chemical heat release rate ($q_{\text{chem}} = \dot{m}_F \Delta H_c$), flame temperature drops below $T_{\text{extinction}}$, triggering radiative extinction.

### 3.3 Cool Flames in Microgravity (The Second Extinction Limit)
As discovered in NASA PSI-117 (FLEX experiments):
* Following radiative extinction of the hot droplet flame ($T \approx 1800\text{ K}$), large alkane droplets ($n$-heptane, $n$-decane) do **not** simply cease reacting.
* Instead, low-temperature negative temperature coefficient (NTC) chemistry engages ($T \approx 600 - 800\text{ K}$), establishing a steady-state **cool flame**.
* The droplet continues to evaporate at a reduced rate constant $K_{\text{cool}} \approx (0.25 - 0.35) K_{\text{hot}}$.
* **Fire Safety Threat:** Cool flames emit almost no visible radiation and generate high levels of carbon monoxide ($CO$). Spacecraft optical flame sensors fail to detect them, creating a stealth fire hazard.

---

## 4. Key Physical Constants for Fire Safety Calculations

| Parameter | Symbol | Nominal Value | Units | Reference |
|---|---|---|---|---|
| Stefan-Boltzmann Constant | $\sigma$ | $5.670374 \times 10^{-8}$ | $\text{W}/(\text{m}^2 \cdot \text{K}^4)$ | CODATA |
| Universal Gas Constant | $R_u$ | $8.314462$ | $\text{J}/(\text{mol} \cdot \text{K})$ | Standard |
| Limiting Oxygen Index | $LOI_{\text{crit}}$ | $0.15$ | volume fraction | Law Section 0.1 |
| Normal Air $O_2$ Fraction | $X_{O_2,\text{air}}$ | $0.2095$ | volume fraction | Standard |
| Air Specific Heat Capacity | $C_{p,\text{air}}$ | $1005$ | $\text{J}/(\text{kg}\cdot\text{K})$ | Law Table B.1 |
| Air Thermal Conductivity | $\lambda_{\text{air}}$ | $0.026 - 0.032$ | $\text{W}/(\text{m}\cdot\text{K})$ | Law Table B.2 |
| $n$-Heptane Liquid Density | $\rho_l$ | $684$ | $\text{kg}/\text{m}^3$ | Standard |
| $n$-Heptane Heat of Combustion | $\Delta H_c$ | $44.56 \times 10^6$ | $\text{J}/\text{kg}$ | Law Table B.3 |
| $n$-Heptane Latent Heat of Vaporization | $L_v$ | $3.16 \times 10^5$ | $\text{J}/\text{kg}$ | Law Table B.3 |
| Stoichiometric O2/Fuel Mass Ratio | $s$ | $3.52$ | dimensionless | Stoichiometry |
| $n$-Heptane Burning Rate ($1g$) | $K_{1g}$ | $0.85 - 0.95$ | $\text{mm}^2/\text{s}$ | Law Ch. 6.4 |
| $n$-Heptane Burning Rate ($0g$) | $K_{0g}$ | $0.48 - 0.55$ | $\text{mm}^2/\text{s}$ | PSI-117 / Law |
| Cool Flame Burning Rate ($0g$) | $K_{\text{cool}}$ | $0.15 - 0.22$ | $\text{mm}^2/\text{s}$ | PSI-117 FLEX |
| Hot Flame Extinction Temperature | $T_{\text{ext}}$ | $\approx 1350$ | $\text{K}$ | Law Ch. 8 |
| Cool Flame Reaction Temperature | $T_{\text{cool}}$ | $\approx 650 - 800$ | $\text{K}$ | PSI-117 / PSI-159 |
