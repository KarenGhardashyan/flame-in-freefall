# 🚀 Karen Ghardashyan — R&D Sandbox & Lead Workspace
**Project Role:** Team Lead & System Architect  
**Designated Git Branch:** `dev-karen`  
**Focus Areas:** System architecture, NASA PSI data ingestion, core physics engine, Firebase integration, and AI safety advisor.

---

## 🛠 Working Guidelines for Git
1. **Branch Hygiene:**
   - Always commit and test your experiments in `dev-karen`:
     ```bash
     git checkout dev-karen || git checkout -b dev-karen
     ```
   - Do not push experimental unverified scripts directly to `main`.
2. **Pull Requests & Merges:**
   - Merge `main` into `dev-karen` periodically to stay updated with physics engine and UI updates:
     ```bash
     git fetch origin
     git merge origin/main
     ```
   - Before submitting PR into `main`, verify backend tests and model calculations.
3. **Sandbox Scopes:**
   - Use this directory for prototyping algorithms, scratch scripts, and raw experiment notes.
   - Production modules belong in `/backend`, `/physics_engine`, `/ml_models`, `/frontend`.
