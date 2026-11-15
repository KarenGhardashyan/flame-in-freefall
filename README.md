# 🔥 Flame in Freefall: AI-Powered Fire Safety Insights from Microgravity Combustion Data

[![NASA Space Apps Challenge 2026](https://img.shields.io/badge/NASA%20Space%20Apps-2026%20Challenge-0B3D91?style=for-the-badge&logo=nasa&logoColor=white)](https://www.spaceappschallenge.org/)
[![Live Production App](https://img.shields.io/badge/Live%20App-microgravitational--flame.web.app-00E5FF?style=for-the-badge&logo=firebase&logoColor=black)](https://microgravitational-flame.web.app)
[![Team Sisyphus](https://img.shields.io/badge/Team-Sisyphus-FF9100?style=for-the-badge)](https://github.com/KarenGhardashyan/flame-in-freefall)
[![Target Facilities](https://img.shields.io/badge/Spacecraft-ISS%20%7C%20Cygnus%20%7C%20Gateway%20%7C%20Artemis-10B981?style=for-the-badge)](#)

> **Live Production Dashboard:** [https://microgravitational-flame.web.app](https://microgravitational-flame.web.app)  
> **GitHub Repository:** [https://github.com/KarenGhardashyan/flame-in-freefall](https://github.com/KarenGhardashyan/flame-in-freefall)  
> **NASA Space Apps Challenge Category:** *Flame in Freefall*  
> **Team:** Team Sisyphus (Karen Ghardashyan, Ashkan Ashkani, Lala Margaryan)

---

## 🌟 Executive Summary

In terrestrial normal gravity ($1g$), density gradients generate buoyant plumes that transport smoke and heat directly upward toward ceiling detectors. In microgravity ($\mu g \approx 0$), **buoyancy is virtually absent**, causing combustion to form spherical diffusion envelopes dominated by molecular transport where conventional ceiling-mounted detectors fail to trigger. Unchecked radiative soot losses induce transitions into invisible **cool flames** ($600 - 800\text{ K}$, demonstrated in NASA PSI-117 / FLEX) that silently exhaust crew oxygen and generate lethal carbon monoxide without visible illumination, while localized radiative and convective heat fluxes ($q''_w$) threaten spacecraft pressure hulls with catastrophic structural breach.

**Flame in Freefall** solves this life-critical challenge through a high-performance **Visual Blueprint Mission Control Simulator**. It integrates a 2D finite-volume transient combustion solver, real-time empirical grounding against 41 NASA PSI and historical spaceflight experiments, and a directed multi-network graph architecture (`OUT -> IN`) that enables flight directors and astronaut crews to run side-by-side trade-off analyses (`AI DIFF`), evaluate ECLSS fire-suppression protocols, and export automated NASA Flight Readiness Briefs.

---

## 🚀 Core Capabilities (Production Build)

### 1. Multi-Network Visual Blueprint Editor (`OUT -> IN` Directed Topology)
* **Arbitrary Parallel Networks:** Evaluate independent spacecraft configurations on the same infinite canvas simultaneously with zero cross-network crosstalk (e.g., comparing Nominal ISS Cabin vs. Hypobaric Lunar Habitat).
* **Color-Coded Visual Organization:** 6 selectable blueprint card accent themes (Default Cyan, Emerald, Amber, Violet, Rose, Crimson) with dedicated $1\times / 1.5\times / 2\times$ zoom scaling and free 2D bidirectional card resizing.
* **9 Interactive Blueprint Node Types:**
  1. `NOTE AI // JARVIS ARCHITECT`: Natural language and speech-to-text mission planner compiling spoken crew requests directly into active graph topologies.
  2. `ENV VARIABLES // ATMOSPHERIC FEED`: Independent atmospheric controls for oxygen concentration ($10.0 - 100.0\%$), cabin pressure ($0.30 - 2.00\text{ atm}$), ECLSS ventilation speed ($0.0 - 70.0\text{ cm/s}$), fuel chemistry (PMMA solid slab, Sibal fabric, n-Heptane droplet, Hydrogen $\text{H}_2$, Methane $\text{CH}_4$), compartment volume ($10 - 200\text{ m}^3$), and ignition triggers.
  3. `SIM 2D // FINITE-VOLUME COMBUSTION SOLVER`: Real-time 2D transient visualizer rendering the expanding flame front $R_f(t)$, downstream $\text{O}_2$ depletion wake, ventilation streamlines $\vec{V}_g$, and thermal hull heating $q''_w(t)$ against the $28.0\text{ kW/m}^2$ structural breach threshold.
  4. `SIM-TO-REAL // NASA PSI GROUNDING`: Similarity calibration engine matching simulated state vectors against 41 NASA flight experiments across 3 matching criteria (`PARAMS`, `CURVE SHAPE`, `SAFETY RISK`).
  5. `GRAPH // TIME TELEMETRY (0–600s)`: Interactive multi-channel time-series telemetry tracking flame spread distance $L(t)$, cabin temperature $T_{\text{cabin}}(t)$, hull overpressure $\Delta P(t)$, and toxic $\text{CO}$ concentration against the NASA 7-day SMAC limit.
  6. `TABLE // NASA PSI MATRIX`: Live telemetry statistics matrix alongside a searchable catalog of all 41 NASA spaceflight runs with direct links to verified NASA Physical Sciences Informatics (PSI) and NASA NTRS repositories.
  7. `AI DIFF // COMPARATOR`: 2-pin differential safety engine connecting `IN A` and `IN B` to perform delta evaluations ($\Delta V_f$, $\Delta T_f$, $\Delta q''_w$, $\Delta(\Delta P)$, $\Delta [\text{CO}]$) and compute automated safety verdicts.
  8. `PROMPT // AI SAFETY OFFICER`: Copilot querying spacecraft emergency procedures, NASA STD-6001 materials compliance, and ECLSS ventilation cutoffs.
  9. `AI BRIEF // FLIGHT READINESS REPORT`: 1-click structured safety brief generator compiling upstream telemetry into formatted mission documentation.
* **1-Click Rapid Demonstrations:** Instant `Load 2-Network Trade-Off Demo` pre-spawning Branch A (Nominal 21% $\text{O}_2$) and Branch B (Saffire 29.5% $\text{O}_2$) wired into `AI DIFF` and `AI BRIEF`.
* **Hardware-Agnostic Touch & Gesture Support:** Unified Pointer Events engine supporting desktop mice, styluses, and touchscreens: pinch-to-zoom, two-finger canvas panning, tap-to-connect wire routing, 500ms long-press / right-click context menu, and keyboard selection deletion via `Delete` or `Backspace`.
* **Dark / Light Theme Engine:** High-contrast spacecraft telemetry palette optimized for both dim mission control rooms and bright field presentations.

---

### 2. 2D Finite-Volume Transient Flame & Hull Thermal Solver (0–600s)
* **Interactive Time Evolution:** Scrubber and play/pause controls stepping through $0 - 600\text{ s}$ of combustion transient dynamics.
* **Dual Visualization Views:**
  * **FLAME + O₂ FIELD:** Illustrates the expanding spherical/elliptic flame boundary $R_f(t)$, downstream oxygen-starved wake, and cabin ventilation flow vectors $\vec{V}_g$.
  * **THERMAL HULL MAP:** Maps radiative soot emissions and convective boundary layer heat transfer onto the spacecraft pressure hull.
* **Critical Safety Threshold Warnings:**
  * **Hull Thermal Breach Limit:** $q''_w \ge 28.0\text{ kW/m}^2$ (structural aluminum / composite degradation hazard).
  * **Hull Structural Overpressure Proof Limit:** $\Delta P(t) \ge 45.0\text{ kPa}$ ($0.44\text{ atm}$ delta pressure hull failure risk).
  * **7-Day SMAC Toxicity Limit:** $[\text{CO}] \ge 55\text{ ppm}$ per NASA JSC 20584 Rev D (with $0\text{ ppm}$ emission for carbon-free pure $\text{H}_2$).

---

### 3. Sim-to-Real Empirical Grounding (41 NASA PSI & Flight Runs)
Simulations are validated and dynamically calibrated against **41 documented NASA flight experiments** from the NASA Physical Sciences Informatics (PSI) and NASA Technical Reports Server (NTRS):
* **Cygnus Saffire I–VI (2016–2024):** Large-scale spacecraft fire safety tests burning Sibal cotton-fiberglass fabric and thick PMMA slabs under controlled microgravity tunnel drafts (ICES-2024-310).
* **ISS BASS-II (NASA TM-20210011385):** Opposed-flow flame spread over thin acrylic films and solid cylindrical rods across oxygen concentrations ($15.8\% - 21.0\%$) and forced draft velocities ($0.5 - 35.0\text{ cm/s}$).
* **FLEX / NASA PSI-117:** Radiative extinction of isolated $n$-heptane droplets and the discovery of low-temperature cool flame phenomena in microgravity.
* **ACME / NASA PSI-159:** Coflow laminar diffusion flame structure and soot formation under microgravity.
* **Historical Spaceflight Anomalies:** Apollo 1 (high-pressure $100\% \text{ O}_2$ flashover), Apollo 13 ($H_2/O_2$ cryogenic tank combustion transient), and Mir 1997 ($O_2$ generator candle deflagration).
* **Transparent Scientific Labeling:** Explicit visual distinction between reconstructed flight telemetry curves and direct flight endpoints, ensuring judges and researchers have full scientific transparency.

---

### 4. 2-Pin `AI DIFF // COMPARATOR` & Mission Brief Synthesis
* **Side-by-Side Differential Telemetry:** Connects two independent branches (`IN A` and `IN B`) to compute quantitative differences across flame dynamics, thermal loading, overpressure, and toxic emissions:

$$
\begin{aligned}
\Delta V_f &= V_{f,B} - V_{f,A} && [\text{mm/s}] \\
\Delta T_f &= T_{f,B} - T_{f,A} && [\text{K}] \\
\Delta q''_w &= q''_{w,B} - q''_{w,A} && [\text{kW/m}^2] \\
\Delta(\Delta P) &= \Delta P_B - \Delta P_A && [\text{kPa}] \\
\Delta [CO] &= [CO]_B - [CO]_A && [\text{ppm}]
\end{aligned}
$$

* **Automated Risk Scoring & Verdict:** Calculates weighted relative safety differentials to award deterministic flight verdicts: `BRANCH_A_SAFER`, `BRANCH_B_SAFER`, or `EQUAL_RISK`.
* **NASA Flight Readiness Brief:** Reports each branch’s combustion mechanism, model thresholds, and relevant ECLSS priorities from the public ISS Fire Safety Strategy. [NASA OCHMO-TB-008](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-008-fire-protection.pdf#page=3)

---

## 🧮 Physics & Mathematical Formulations

The physics core (`frontend/standalone_api.js` and `physics_engine/combustion_model.py`) executes first-principles microgravity combustion formulations:

### 1. Damköhler Non-Equilibrium Extinction & S-Curve Classification
The transition between vigorous hot burning, radiative quenching, cool flames, and convective blowout is governed by the non-dimensional Damköhler number $Da$:
```math
Da = \frac{\tau_{flow}}{\tau_{chem}}
```

The characteristic flow residence time $\tau_{flow}$ and chemical kinetic time $\tau_{chem}$ are formulated as:
```math
\tau_{flow} = \frac{\delta_f}{V_g + V_{diff}}
```
```math
\tau_{chem} = \left[ A \cdot P^n \cdot X_{O_2} \cdot \exp\left(-\frac{E_a}{R \cdot T_{ref}}\right) \right]^{-1}
```

Where:
* $\delta_f$: Flame thickness ($\approx 8.0\text{ mm}$)
* $V_g$: Forced cabin ventilation velocity ($\text{m/s}$)
* $V_{diff}$: Molecular oxygen diffusion velocity ($\approx 0.005\text{ m/s}$)
* $A$: Arrhenius pre-exponential kinetic constant ($3.2 \times 10^7\text{ s}^{-1}$)
* $E_a / R$: Activation temperature ($\approx 14,500\text{ K}$)
* $T_{ref}$: Kinetic reference temperature ($1,500\text{ K}$)

#### Combustion Regime Evaluation:
* **EXTINCTION ($Da < 0.20$ or $Y_{O_2} < LOI_{crit}$):**
  Flame cannot sustain chemical reaction; temperature cools to ambient $T_\infty = 298.15\text{ K}$.
* **COOL FLAME ($Da < Da_{ext}$ with $n$-Heptane, $14.8\% \le X_{O_2} \le 22.0\%$, $V_g \le 1.2\text{ cm/s}$):**
  Low-temperature quasi-steady chemical oxidation without soot formation ($T_f \approx 650 - 780\text{ K}$), validated against **NASA PSI-117 / FLEX**:

$$
T_{cool} = 650.0 + 130.0 \cdot \tanh\left(50.0 \cdot (X_{O_2} - 0.15)\right) \quad [\text{K}]
$$

* **HOT FLAME ($Da \ge Da_{ext}$):**
  Vigorous hydrocarbon combustion with adiabatic flame temperature $T_{ad}$ tempered by radiative heat loss $\eta_{rad}$:
  ```math
  T_f = T_\infty + (T_{ad} - T_\infty) \cdot \left(1.0 - \eta_{rad} \cdot \frac{0.8}{1.0 + 0.2 \cdot V_g}\right)
  ```
* **EXPLOSION FLASH (Premixed $H_2 \ge 4.0\%$ or $CH_4 \ge 5.0\%$):**
  Deflagration shock characterized by immediate pressure surge and peak flame temperatures exceeding $2,400\text{ K}$.

---

### 2. Flammability Boundaries & Chung K. Law's 15% Spacecraft Criterion
Solid material ignition and opposed-flow propagation obey Chung K. Law's critical spacecraft oxygen boundary:
```math
LOI_{crit} = 15.0\% \cdot \left(\frac{1.0\text{ bar}}{P}\right)^{0.10}
```
$$\text{If } X_{O_2} < LOI_{crit} \implies \text{Combustion is thermodynamically unviable} \implies \text{EXTINCTION}$$

Under microgravity, the absence of buoyant convective cooling alters the traditional terrestrial flammability envelope into a **U-shaped boundary**:
* **Low-Velocity Quenching ($V_g < 0.5\text{ cm/s}$):** Radiative heat loss from accumulated combustion products and soot freezes the reaction zone.
* **High-Velocity Blowoff ($V_g > 35.0\text{ cm/s}$):** Excessive convective strain thins the reaction zone until chemical residence time $\tau_{flow} < \tau_{chem}$.

---

### 3. Solid Opposed-Flow Flame Spread Rate ($V_f$)
Calibrated against **NASA BASS-II (TM-20210011385)** and **Saffire I–VI**, the solid flame spread rate $V_f$ [mm/s] over acrylic (PMMA) and fabric (Sibal) is governed by:
```math
V_f = V_{f,ref} \cdot \left(\frac{X_{O_2} - LOI}{0.21 - LOI}\right)^{1.35} \cdot \left(\frac{P}{1.0\text{ atm}}\right)^{0.45} \cdot f(V_g) \cdot \left(\frac{100\,\mu\text{m}}{\delta_{fuel}}\right)^{0.75}
```

Where ventilation influence $f(V_g)$ models thermal boundary layer enhancement up to blowoff:
```math
f(V_g) = \left(\frac{V_g + 1.0}{21.0}\right)^{0.42}
```

---

### 4. Structural Hull Radiative & Convective Heat Flux ($q''_w$)
Heat transfer from the microgravity flame to the spacecraft pressure boundary combines Stefan-Boltzmann radiative transfer and turbulent boundary layer convection:

$$
\begin{aligned}
q''_w(t) &= q''_{rad}(t) + q''_{conv}(t) && [\text{kW/m}^2] \\
q''_{rad} &= \varepsilon \cdot \sigma \cdot \left(T_f^4 - T_\infty^4\right) \cdot \mathcal{F}_{view} \cdot \left(\frac{X_{O_2}}{0.21}\right)^{1.25} \\
q''_{conv} &= h_c \cdot (T_f - T_\infty) \cdot \sqrt{\frac{V_g + 1.0}{20.0}} \cdot \sqrt{\frac{X_{O_2}}{0.21}} \cdot \mathcal{F}_{view}
\end{aligned}
$$

* **Model thermal threshold:** The simulator flags hull risk when $q''_w(t) \ge 28.0\text{ kW/m}^2$.

---

### 5. Cabin Thermal Response & Transient Overpressure ($\Delta P(t)$)
Cabin thermal response is integrated over sub-steps ($\Delta t_{sub} = 0.25\text{ s}$):
```math
\frac{dT_{cabin}}{dt} = \frac{\dot{Q}_{chem} - \dot{Q}_{hull\_loss}}{M_{air} \cdot c_v}
```
```math
\Delta P(t) = P(t) - P(0) = \frac{n_{air} \cdot R \cdot T_{cabin}(t)}{V_{cabin}} - P_0 + \Delta P_{blast}
```

* **Model overpressure threshold:** The simulator flags hull risk when modeled peak $\Delta P \ge 45.0\text{ kPa}$ ($0.44\text{ atm}$).

---

### 6. Carbon Monoxide Generation & SMAC 55 ppm Tracking
Toxic carbon monoxide accumulation is calculated dynamically from the fuel mass burning rate $\dot{m}_f$:
```math
\frac{d[CO]}{dt} = \left(\frac{\dot{m}_f \cdot Y_{CO}}{M_{air}}\right) \cdot \left(\frac{W_{air}}{W_{CO}}\right) \cdot 10^6 \quad [\text{ppm/s}]
```

* **Spacecraft Maximum Allowable Concentration (SMAC):** The simulator uses the $55\text{ ppm}$ seven-day nominal CO exposure limit as a concentration screen for its 600-second run. [NASA JSC 20584 Rev D, p. 10](https://www.nasa.gov/wp-content/uploads/2026/02/jsc-20584-smacs-rev-d.pdf#page=10)
* **Time-to-SMAC Calculation:**

$$
t_{SMAC} = \frac{55.0 - [CO]_0}{\frac{d[CO]}{dt}} \quad [\text{seconds}]
$$

* Pure Hydrogen fuel ($H_2$) combustion emits strictly water vapor ($H_2O$), resulting in $0\text{ ppm}$ CO yield.

---

## 📂 Repository Structure

```
c:\NasaSpaceAPPFlameInFreefall/
├── frontend/
│   ├── index.html                 # Main Mission Control UI with SVG canvas and topbar
│   ├── styles.css                 # SpaceX Telemetry CSS, theme tokens, touch & mobile rules
│   ├── app.js                     # DAG node engine, 2D finite-volume canvas, touch/pointer handler
│   └── standalone_api.js          # Offline client-side physics engine, NASA PSI catalog & router
├── backend/
│   ├── main.py                    # Optional FastAPI REST & WebSocket application server
│   ├── firebase_client.py         # Firebase Admin SDK telemetry logger
│   ├── gemini_advisor.py          # Google GenAI Gemini Copilot integration
│   ├── knowledge_retriever.py     # Local BM25 search & Sim-to-Real matching engine
│   └── data/
│       └── nasa_flight_telemetry.json # 41 NASA PSI flight runs with verified URLs
├── physics_engine/
│   ├── combustion_model.py        # Python microgravity combustion solver (d²-law, S-Curve, BASS-II)
│   └── __init__.py
├── ml_models/
│   ├── anomaly_detector.py        # Microgravity thermal run-up & fire anomaly detector
│   └── __init__.py
├── Resources/
│   ├── CITATIONS.md               # Scientific peer-reviewed literature & NASA papers
│   ├── nasa_psi_benchmarks.json   # NASA Physical Sciences Informatics benchmark catalog
│   └── Law_Combustion_Physics.pdf # Primary theoretical combustion physics reference
├── firebase.json                  # Firebase Hosting configuration
├── .firebaserc                    # Firebase project binding (microgravitational-flame)
├── requirements.txt               # Optional Python backend dependencies
└── README.md                      # Complete system documentation for NASA Space Apps
```

---

## 🛠 How to Run

### Option 1: Instant Live / Standalone Mode (Recommended)
Zero backend setup required! The client-side physics engine runs 100% autonomously in any modern browser:

* **Official Live Production URL:** [https://microgravitational-flame.web.app](https://microgravitational-flame.web.app)
* **Or Run Locally with Any Static Server:**
  ```bash
  # Using Node.js npx serve
  npx serve frontend

  # Or using Python's built-in static server
  python -m http.server 8080 --directory frontend
  ```
  Open `http://localhost:8080` in Chrome, Safari, Edge, or Firefox.

---

### Option 2: Optional Local FastAPI Server
For developers wishing to run the Python backend and test WebSocket streams locally:

```bash
# 1. Clone repository
git clone https://github.com/KarenGhardashyan/flame-in-freefall.git
cd flame-in-freefall

# 2. Create and activate virtual environment
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Start FastAPI server
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```
Open `http://localhost:8000` to inspect interactive API docs via Swagger UI (`http://localhost:8000/docs`).

---

## 👥 Team Sisyphus & Scientific Citations

### Team Members
* **Karen Ghardashyan** — *Team Lead & System Architect*  
  System architecture, visual blueprint DAG engine, client-side fallback router, touch/mobile optimization, and cloud deployment.
* **Ashkan Ashkani** — *Combustion Physics Lead & UI/UX Designer*  
  Microgravity combustion mathematical formulation, Damköhler non-equilibrium S-curve, NASA BASS-II thin-film models, and SpaceX telemetry aesthetic.
* **Lala Margaryan** — *Frontend Engineer & Motion Visualization*  
  2D finite-volume transient flame field canvas renderer, thermal hull heat flux mapping, and interactive chart time-series monitors.

### Primary Scientific Citations
1. **Chung K. Law:** *Combustion Physics*, Cambridge University Press, New York, 2006. ([Law_Combustion_Physics.pdf](Resources/Law_Combustion_Physics.pdf))
2. **NASA BASS-II:** *Burning and Suppression of Solids - II*, NASA Glenn Research Center, NASA TM-20210011385.
3. **NASA Saffire Program:** *Spacecraft Fire Safety Demonstration Project (Saffire I–VI)*, ICES-2024-310 / NASA Glenn Research Center.
4. **NASA PSI-117:** *Flame Extinction Experiment (FLEX / Droplet Cool Flames)*, NASA Physical Sciences Informatics Repository.
5. **NASA PSI-159:** *Advanced Combustion via Microgravity Experiments (ACME / Coflow Flame)*, NASA PSI Repository.
6. **NASA Spacecraft Toxicology:** *Spacecraft Maximum Allowable Concentrations for Selected Airborne Contaminants*, NASA JSC 20584 Rev D (Carbon Monoxide 55 ppm limit).
