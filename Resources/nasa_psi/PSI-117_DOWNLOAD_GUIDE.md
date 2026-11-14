# NASA PSI-117 Data Access & Download Guide
**Investigation:** Flame Extinction with Cool Flames - Computational Fluid Dynamics Analysis (FLEX Cool Flames CFD)  
**Investigation ID:** `PSI-117`  
**DOI:** `10.60555/gz0q-b577`  
**URL:** [https://psi.nasa.gov/physci/repo/data/investigations/PSI-117](https://psi.nasa.gov/physci/repo/data/investigations/PSI-117)

---

## 1. Why Direct Web Scraping (curl/requests) Yields a 954-Byte Template
The NASA Physical Sciences Informatics (PSI) portal is built as a single-page Angular application (`/physci/repo/`). When an automated HTTP client sends a basic `GET` request without executing client-side JavaScript, the server returns only the initial index shell with `<base href="/physci/repo/">` and dynamic script loaders.

To download the primary CFD simulation grids, reaction kinetics tables, and optical camera footage:

---

## 2. Step-by-Step Instructions to Download Data Archives

1. **Open the Investigation Page in your Browser:**
   Navigate to: [https://psi.nasa.gov/physci/repo/data/investigations/PSI-117](https://psi.nasa.gov/physci/repo/data/investigations/PSI-117)

2. **Locate the Data Files Tab:**
   On the left or top navigation pane of the investigation view, click the tab labeled:
   👉 **`Data files and documents`** (or the download cloud icon).

3. **Required Datasets for Flame in Freefall:**
   Inside the file explorer tree, check and download the following archives:
   * **`FLEX_Cool_Flames_CFD_Summary_Report.pdf`** (or `ReadMe.txt`):
     Contains the grid resolution, boundary conditions, and chemical mechanism specification (detailed n-heptane / n-decane low-temperature reaction paths).
   * **`CFD_Telemetry_Table_*.csv` / `*.dat`**:
     Time-dependent numerical profiles of droplet diameter squared ($d^2$), radial temperature distribution $T(r)$, species mass fractions ($Y_{O_2}$, $Y_{CO}$, $Y_{CO_2}$, $Y_{OH}$), and reaction rate contours across hot-to-cool flame transitions.
   * **`CIR_Optical_HighSpeed_*.avi` / `*.mp4` (Optional / R&D visualization):**
     Direct color / UV chemiluminescence camera footage from the Combustion Integrated Rack (CIR) onboard the International Space Station showing radiative extinction and second-stage cool flame persistence.

4. **Target Destination:**
   Place the downloaded archive files into:
   ```text
   C:\NasaSpaceAPPFlameInFreefall\Resources\nasa_psi\
   ```
   Our physics ingestion engine (`physics_engine/combustion_model.py`) and anomaly detector (`ml_models/anomaly_detector.py`) are pre-calibrated against the published parameters of PSI-117 and will automatically process and validate local copies placed in this folder.
