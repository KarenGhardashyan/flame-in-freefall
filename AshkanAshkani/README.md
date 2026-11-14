# 🔬 Ashkan Ashkani — R&D Sandbox
**Project Role:** Combustion Physics & Mathematical Modeling Specialist  
**Designated Git Branch:** `dev-ashkan`  
**Focus Areas:** $d^2$-law verification, microgravity droplet extinction, cool flames kinetics, boundary limits analysis (Chung K. Law book Chapters 6 & 8, NASA PSI-117/159).

---

## 🛠 Working Guidelines for Git
1. **Branch Hygiene:**
   - Always commit and test your models in `dev-ashkan`:
     ```bash
     git checkout dev-ashkan || git checkout -b dev-ashkan
     ```
   - Keep commits granular and descriptive (e.g., `feat(physics): implement d2 droplet evaporation curve`).
2. **Synchronizing with Core:**
   - Regularly pull latest updates from `origin/main`:
     ```bash
     git fetch origin
     git merge origin/main
     ```
3. **Module Contribution Workflow:**
   - Test equations and numerical solvers here in `AshkanAshkani/`.
   - When verified, promote core algorithms into `physics_engine/combustion_model.py`.
