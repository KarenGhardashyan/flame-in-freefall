import os
import subprocess
import pypdf

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Flame in Freefall - NASA Space Apps Challenge 2026</title>
<style>
  @page {
    size: 1920px 1080px;
    margin: 0;
  }
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  body {
    background-color: #070A12;
    color: #F8FAFC;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    overflow: hidden;
  }
  .slide {
    width: 1920px;
    height: 1080px;
    padding: 48px 64px 40px 64px;
    background: #0B0F19 radial-gradient(circle at 85% 15%, rgba(0, 229, 255, 0.08) 0%, transparent 40%),
                radial-gradient(circle at 15% 85%, rgba(249, 115, 22, 0.07) 0%, transparent 40%);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    page-break-after: always;
    break-after: page;
    position: relative;
    overflow: hidden;
    border: 1px solid #111827;
  }
  .slide:last-child {
    page-break-after: auto;
    break-after: auto;
  }

  /* Grid overlay for mission control aesthetic */
  .grid-overlay {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background-image: linear-gradient(rgba(0, 229, 255, 0.02) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(0, 229, 255, 0.02) 1px, transparent 1px);
    background-size: 48px 48px;
    pointer-events: none;
    z-index: 0;
  }

  /* Header Bar */
  .header-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid rgba(0, 229, 255, 0.25);
    padding-bottom: 14px;
    z-index: 2;
    position: relative;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .agency-badge {
    background: rgba(0, 229, 255, 0.12);
    border: 1px solid #00E5FF;
    color: #00E5FF;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 2px;
    padding: 4px 12px;
    border-radius: 4px;
    font-family: ui-monospace, "Consolas", monospace;
    text-transform: uppercase;
  }
  .header-title-sub {
    font-size: 14px;
    letter-spacing: 1.5px;
    color: #94A3B8;
    text-transform: uppercase;
    font-weight: 600;
  }
  .header-right {
    display: flex;
    align-items: center;
    gap: 20px;
    font-family: ui-monospace, "Consolas", monospace;
    font-size: 14px;
    color: #64748B;
  }
  .slide-counter {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.15);
    padding: 4px 14px;
    border-radius: 4px;
    color: #F8FAFC;
    font-weight: 700;
  }
  .slide-counter span {
    color: #00E5FF;
  }

  /* Slide Content Area */
  .slide-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    margin: 20px 0;
    z-index: 2;
    position: relative;
  }

  /* Footer Bar */
  .footer-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    padding-top: 14px;
    font-size: 13px;
    color: #64748B;
    z-index: 2;
    position: relative;
    font-family: ui-monospace, "Consolas", monospace;
  }
  .footer-bar a {
    color: #00E5FF;
    text-decoration: none;
  }
  .footer-highlight {
    color: #F97316;
    font-weight: 600;
  }

  /* Typography */
  h1.slide-title {
    font-size: 38px;
    font-weight: 800;
    letter-spacing: -0.5px;
    color: #FFFFFF;
    margin-bottom: 6px;
    display: flex;
    align-items: center;
    gap: 14px;
  }
  p.slide-subtitle {
    font-size: 17px;
    color: #94A3B8;
    margin-bottom: 24px;
    line-height: 1.4;
  }
  .accent-cyan { color: #00E5FF; }
  .accent-orange { color: #F97316; }
  .accent-green { color: #10B981; }

  /* Generic Card Components */
  .card {
    background: rgba(15, 23, 42, 0.85);
    border: 1px solid rgba(0, 229, 255, 0.2);
    border-radius: 8px;
    padding: 22px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    position: relative;
  }
  .card-glow-orange {
    border-color: rgba(249, 115, 22, 0.4);
    box-shadow: 0 10px 25px -5px rgba(249, 115, 22, 0.15);
  }
  .card-glow-cyan {
    border-color: rgba(0, 229, 255, 0.4);
    box-shadow: 0 10px 25px -5px rgba(0, 229, 255, 0.15);
  }
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding-bottom: 8px;
  }
  .card-tag {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    font-family: ui-monospace, "Consolas", monospace;
    padding: 3px 8px;
    border-radius: 3px;
  }
  .tag-cyan { background: rgba(0, 229, 255, 0.15); color: #00E5FF; border: 1px solid rgba(0, 229, 255, 0.3); }
  .tag-orange { background: rgba(249, 115, 22, 0.15); color: #F97316; border: 1px solid rgba(249, 115, 22, 0.3); }
  .tag-green { background: rgba(16, 185, 129, 0.15); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.3); }

  /* Slide 1 - Title specifics */
  .hero-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    max-width: 1400px;
    margin: 0 auto;
  }
  .hero-badge {
    background: rgba(0, 229, 255, 0.12);
    border: 1px solid #00E5FF;
    color: #00E5FF;
    font-size: 14px;
    font-weight: 800;
    letter-spacing: 3px;
    padding: 8px 24px;
    border-radius: 9999px;
    margin-bottom: 24px;
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .hero-title {
    font-size: 72px;
    font-weight: 900;
    letter-spacing: -1.5px;
    line-height: 1.05;
    margin-bottom: 16px;
    background: linear-gradient(135deg, #FFFFFF 30%, #00E5FF 75%, #F97316 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .hero-subtitle {
    font-size: 26px;
    color: #CBD5E1;
    font-weight: 500;
    max-width: 1050px;
    line-height: 1.4;
    margin-bottom: 36px;
  }
  .hero-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    width: 100%;
    margin-top: 10px;
  }
  .hero-stat-card {
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid rgba(0, 229, 255, 0.25);
    border-radius: 8px;
    padding: 20px 24px;
    text-align: left;
  }
  .hero-stat-title {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #64748B;
    font-family: ui-monospace, "Consolas", monospace;
    margin-bottom: 6px;
  }
  .hero-stat-val {
    font-size: 19px;
    font-weight: 700;
    color: #FFFFFF;
    margin-bottom: 4px;
  }
  .hero-stat-desc {
    font-size: 13px;
    color: #94A3B8;
    line-height: 1.35;
  }

  /* Multi-column grid systems */
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
  .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
  .grid-1-2 { display: grid; grid-template-columns: 1fr 2fr; gap: 24px; }
  .grid-2-1 { display: grid; grid-template-columns: 2fr 1fr; gap: 24px; }

  /* Node Chips */
  .node-chip {
    background: rgba(17, 24, 39, 0.95);
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 6px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .node-name {
    font-family: ui-monospace, "Consolas", monospace;
    font-weight: 700;
    font-size: 13px;
    color: #00E5FF;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .node-name-orange {
    color: #F97316;
  }
  .node-name-green {
    color: #10B981;
  }
  .node-role {
    font-size: 12px;
    color: #94A3B8;
    line-height: 1.3;
  }
  .node-io {
    font-family: ui-monospace, "Consolas", monospace;
    font-size: 10px;
    color: #64748B;
    margin-top: 4px;
  }

  /* Metric Big Numbers */
  .metric-box {
    display: flex;
    flex-direction: column;
    padding: 12px 16px;
    background: rgba(2, 6, 23, 0.6);
    border-radius: 6px;
    border-left: 3px solid #00E5FF;
  }
  .metric-box-orange {
    border-left-color: #F97316;
  }
  .metric-box-green {
    border-left-color: #10B981;
  }
  .metric-val {
    font-size: 26px;
    font-weight: 800;
    font-family: ui-monospace, "Consolas", monospace;
    color: #FFFFFF;
  }
  .metric-label {
    font-size: 11px;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: #94A3B8;
    font-weight: 600;
    margin-top: 2px;
  }

  /* Code / Equation Block */
  .eq-block {
    background: rgba(2, 6, 23, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    padding: 12px 16px;
    font-family: ui-monospace, "Consolas", monospace;
    font-size: 13px;
    color: #E2E8F0;
    line-height: 1.5;
  }
</style>
</head>
<body>

<!-- ========================================================================= -->
<!-- SLIDE 1: TITLE SLIDE -->
<!-- ========================================================================= -->
<div class="slide">
  <div class="grid-overlay"></div>
  <div class="header-bar">
    <div class="header-left">
      <div class="agency-badge">NASA SPACE APPS 2026</div>
      <div class="header-title-sub">MISSION CONTROL SAFETY DEMONSTRATION</div>
    </div>
    <div class="header-right">
      <span>CHALLENGE: MICROGRAVITY COMBUSTION</span>
      <div class="slide-counter">SLIDE <span>01</span> / 07</div>
    </div>
  </div>

  <div class="slide-body">
    <div class="hero-container">
      <div class="hero-badge">
        <span>⚡ DEEP SPACE EXPLORATION & ECLSS FIRE SAFETY</span>
      </div>
      <h1 class="hero-title">FLAME IN FREEFALL</h1>
      <p class="hero-subtitle">
        AI-Powered Microgravity Fire Safety & Trade-Off Simulator with Transient 2D Finite-Volume Combustion Physics & 41 NASA Flight Calibrations
      </p>

      <div class="hero-grid">
        <div class="hero-stat-card">
          <div class="hero-stat-title">TEAM SISYPHUS</div>
          <div class="hero-stat-val">Karen • Ashkan • Lala</div>
          <div class="hero-stat-desc">
            Karen Ghardashyan (Lead Architect)<br>
            Ashkan Ashkani (Combustion Dynamics)<br>
            Lala Margaryan (Safety & Human Factors)
          </div>
        </div>

        <div class="hero-stat-card" style="border-color: rgba(0, 229, 255, 0.4);">
          <div class="hero-stat-title">LIVE PRODUCTION PLATFORM</div>
          <div class="hero-stat-val" style="color: #00E5FF;">microgravitational-flame.web.app</div>
          <div class="hero-stat-desc">
            Autonomous multi-network DAG blueprint canvas, 2D mesh hull telemetry, dual-branch trade-off engine, and instant zero-install browser deployment.
          </div>
        </div>

        <div class="hero-stat-card" style="border-color: rgba(249, 115, 22, 0.4);">
          <div class="hero-stat-title">EMPIRICAL BENCHMARKING</div>
          <div class="hero-stat-val" style="color: #F97316;">41 NASA Flight Runs</div>
          <div class="hero-stat-desc">
            Grounded on NASA Saffire I–VI, BASS-II (TM-20210011385), FLEX / PSI-117 droplet tests, Apollo 1/13, and Mir 1997 real-world telemetry.
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="footer-bar">
    <div>TEAM SISYPHUS • NASA SPACE APPS CHALLENGE 2026</div>
    <div>PROJECT DEMO • <span class="footer-highlight">LIVE APP:</span> <a href="https://microgravitational-flame.web.app">https://microgravitational-flame.web.app</a></div>
    <div>CODEBASE: github.com/KarenGhardashyan/flame-in-freefall</div>
  </div>
</div>

<!-- ========================================================================= -->
<!-- SLIDE 2: THE PROBLEM IN 0G -->
<!-- ========================================================================= -->
<div class="slide">
  <div class="grid-overlay"></div>
  <div class="header-bar">
    <div class="header-left">
      <div class="agency-badge">01 / PROBLEM STATEMENT</div>
      <div class="header-title-sub">MICROGRAVITY COMBUSTION PARADOX</div>
    </div>
    <div class="header-right">
      <span>PHYSICS ANOMALIES IN FREEFALL</span>
      <div class="slide-counter">SLIDE <span>02</span> / 07</div>
    </div>
  </div>

  <div class="slide-body">
    <h1 class="slide-title">The Deadly Physics of Fire in Zero-G (0g)</h1>
    <p class="slide-subtitle">
      Why conventional 1g fire safety architectures catastrophically fail in orbital spacecraft and deep-space transit habitats.
    </p>

    <div class="grid-4" style="margin-bottom: 20px;">
      <div class="card card-glow-orange">
        <div class="card-header">
          <span class="card-tag tag-orange">FLUID DYNAMICS</span>
          <span style="font-size: 18px;">🚫 1g Sensors</span>
        </div>
        <h3 style="color: #FFF; font-size: 17px; margin-bottom: 8px;">Zero Buoyancy Smoke Failure</h3>
        <p style="color: #94A3B8; font-size: 13px; line-height: 1.45;">
          In 1g, buoyant thermal plumes ($\nabla \rho \cdot g$) drive smoke to ceilings. In microgravity ($g \approx 0$), the Grashof number drops to zero ($Gr \to 0$). Smoke does not rise; conventional ceiling smoke detectors remain completely blind.
        </p>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-tag tag-cyan">TRANSPORT</span>
          <span style="font-size: 18px;">🌐 Spherical</span>
        </div>
        <h3 style="color: #FFF; font-size: 17px; margin-bottom: 8px;">Quiescent Spherical Fronts</h3>
        <p style="color: #94A3B8; font-size: 13px; line-height: 1.45;">
          Combustion is governed solely by isotropic molecular diffusion ($\partial C / \partial t = D \nabla^2 C$) or weak forced ventilation ($0.05\text{–}0.2\text{ m/s}$). Flames form quiescent spherical domes that expand slowly, consuming local oxygen silently.
        </p>
      </div>

      <div class="card card-glow-cyan">
        <div class="card-header">
          <span class="card-tag tag-cyan">NASA FLEX / PSI-117</span>
          <span style="font-size: 18px;">❄️ Stealth</span>
        </div>
        <h3 style="color: #FFF; font-size: 17px; margin-bottom: 8px;">Invisible "Cold Flames"</h3>
        <p style="color: #94A3B8; font-size: 13px; line-height: 1.45;">
          As revealed by NASA FLEX experiments on ISS, liquid alkane droplets can sustain low-temperature quasi-steady burning at <strong>650–780 K</strong> with zero visible soot luminosity. Crews and visual cameras cannot see them, yet heat and radicals propagate.
        </p>
      </div>

      <div class="card card-glow-orange">
        <div class="card-header">
          <span class="card-tag tag-orange">TOXICOLOGY</span>
          <span style="font-size: 18px;">☠️ Toxic CO</span>
        </div>
        <h3 style="color: #FFF; font-size: 17px; margin-bottom: 8px;">Lethal CO Surge vs CO₂</h3>
        <p style="color: #94A3B8; font-size: 13px; line-height: 1.45;">
          Sub-stoichiometric oxygen availability at the diffusion boundary drives incomplete combustion, skyrocketing carbon monoxide (CO) yields. Lethal levels (>55 ppm, NASA JSC 20584) are reached long before hull thermal sensors trigger.
        </p>
      </div>
    </div>

    <div class="card" style="background: rgba(249, 115, 22, 0.08); border-color: rgba(249, 115, 22, 0.35); padding: 16px 24px;">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 14px;">
          <span style="font-size: 26px;">⚠️</span>
          <div>
            <div style="font-weight: 700; font-size: 15px; color: #F97316;">CRITICAL ECLSS VULNERABILITY IN DEEP SPACE HABITATS</div>
            <div style="font-size: 13px; color: #CBD5E1;">Astronauts have less than 180 seconds to detect quiescent combustion before cabin atmosphere toxicity compromises cognitive functions. Traditional ground-based safety models produce false negatives.</div>
          </div>
        </div>
        <div class="metric-box metric-box-orange" style="min-width: 200px;">
          <div class="metric-val" style="color: #F97316;">0.00 m/s²</div>
          <div class="metric-label">Effective Gravity Vector</div>
        </div>
      </div>
    </div>
  </div>

  <div class="footer-bar">
    <div>MISSION PROBLEM STATEMENT • ZERO-G COMBUSTION HAZARDS</div>
    <div>NASA JSC 20584 REV D • SPACE HABITAT TOXICITY THRESHOLDS</div>
    <div>SLIDE 02 / 07</div>
  </div>
</div>

<!-- ========================================================================= -->
<!-- SLIDE 3: SYSTEM ARCHITECTURE - MULTI-NETWORK DAG -->
<!-- ========================================================================= -->
<div class="slide">
  <div class="grid-overlay"></div>
  <div class="header-bar">
    <div class="header-left">
      <div class="agency-badge">02 / CORE ARCHITECTURE</div>
      <div class="header-title-sub">BLUEPRINT VISUAL COMPUTING ENGINE</div>
    </div>
    <div class="header-right">
      <span>TOPOLOGICAL DAG WITH PARALLEL ISOLATION</span>
      <div class="slide-counter">SLIDE <span>03</span> / 07</div>
    </div>
  </div>

  <div class="slide-body">
    <h1 class="slide-title">Multi-Network DAG Blueprint Architecture</h1>
    <p class="slide-subtitle">
      A reactive directed acyclic graph engine with typed OUT &rarr; IN pin validation, cycle detection, and isolated parallel branch execution.
    </p>

    <div class="grid-3" style="gap: 16px; margin-bottom: 18px;">
      <div class="node-chip" style="border-left: 3px solid #00E5FF;">
        <div class="node-name"><span>🧠 NOTE AI</span> <span class="card-tag tag-cyan">AI GEN</span></div>
        <div class="node-role">Autonomous hypothesis and operational rationale generator for safety officers.</div>
        <div class="node-io">OUT: text_prompt, safety_hypothesis</div>
      </div>

      <div class="node-chip" style="border-left: 3px solid #00E5FF;">
        <div class="node-name"><span>🎛️ ENV VARIABLES</span> <span class="card-tag tag-cyan">INPUT</span></div>
        <div class="node-role">Atmospheric pressure ($P$), $O_2\%$, forced ventilation speed, fuel substrate geometry.</div>
        <div class="node-io">OUT: env_telemetry_packet (JSON)</div>
      </div>

      <div class="node-chip" style="border-left: 3px solid #F97316;">
        <div class="node-name node-name-orange"><span>🔥 SIM 2D</span> <span class="card-tag tag-orange">PHYSICS</span></div>
        <div class="node-role">Finite-volume transient PDE solver (0–600s), flame front radius $R_f(t)$, thermal hull heat flux.</div>
        <div class="node-io">IN: env_packet &rarr; OUT: sim_time_series</div>
      </div>

      <div class="node-chip" style="border-left: 3px solid #10B981;">
        <div class="node-name node-name-green"><span>🚀 SIM-TO-REAL</span> <span class="card-tag tag-green">VALIDATION</span></div>
        <div class="node-role">Real-time telemetry grounding against 41 NASA flight experiments (Saffire, BASS-II, FLEX).</div>
        <div class="node-io">IN: sim_time_series &rarr; OUT: flight_error_delta</div>
      </div>

      <div class="node-chip" style="border-left: 3px solid #00E5FF;">
        <div class="node-name"><span>📈 GRAPH</span> <span class="card-tag tag-cyan">VISUAL</span></div>
        <div class="node-role">Multi-axis real-time charting of flame radius, oxygen depletion, CO surge, and hull temperature.</div>
        <div class="node-io">IN: sim_time_series &rarr; OUT: visual_canvas</div>
      </div>

      <div class="node-chip" style="border-left: 3px solid #00E5FF;">
        <div class="node-name"><span>📊 TABLE</span> <span class="card-tag tag-cyan">DATA</span></div>
        <div class="node-role">Tabular high-resolution numeric telemetry export with CSV/JSON serialization.</div>
        <div class="node-io">IN: sim_time_series &rarr; OUT: tabular_data</div>
      </div>

      <div class="node-chip" style="border-left: 3px solid #F97316;">
        <div class="node-name node-name-orange"><span>⚖️ AI DIFF</span> <span class="card-tag tag-orange">TRADE-OFF</span></div>
        <div class="node-role">2-Pin comparative decision engine evaluating Branch A vs Branch B hazard index deltas.</div>
        <div class="node-io">IN: pin_branch_a, pin_branch_b &rarr; OUT: diff_report</div>
      </div>

      <div class="node-chip" style="border-left: 3px solid #00E5FF;">
        <div class="node-name"><span>💬 PROMPT</span> <span class="card-tag tag-cyan">INTERACTION</span></div>
        <div class="node-role">Interactive mission control ECLSS query console and emergency protocol injector.</div>
        <div class="node-io">IN: user_query &rarr; OUT: directive_stream</div>
      </div>

      <div class="node-chip" style="border-left: 3px solid #10B981;">
        <div class="node-name node-name-green"><span>📑 AI BRIEF</span> <span class="card-tag tag-green">EXECUTIVE</span></div>
        <div class="node-role">Automated NASA flight safety readiness brief with quantitative risk mitigation plans.</div>
        <div class="node-io">IN: diff_report, sim_series &rarr; OUT: pdf_brief</div>
      </div>
    </div>

    <div class="grid-3" style="gap: 16px;">
      <div class="metric-box">
        <div class="metric-val">9 Interactive Nodes</div>
        <div class="metric-label">Composable Modular Blueprints</div>
      </div>
      <div class="metric-box metric-box-orange">
        <div class="metric-val">&lt; 16 ms Latency</div>
        <div class="metric-label">Full Reactive Graph Recomputation</div>
      </div>
      <div class="metric-box metric-box-green">
        <div class="metric-val">100% Branch Isolation</div>
        <div class="metric-label">Zero Contamination Across Scenarios</div>
      </div>
    </div>
  </div>

  <div class="footer-bar">
    <div>SYSTEM ARCHITECTURE • DIRECTED ACYCLIC GRAPH RUNTIME</div>
    <div>REACTIVE BLUEPRINT SYSTEM • TYPED OUT &rarr; IN PIN CONNECTORS</div>
    <div>SLIDE 03 / 07</div>
  </div>
</div>

<!-- ========================================================================= -->
<!-- SLIDE 4: 2D FINITE-VOLUME TRANSIENT SOLVER -->
<!-- ========================================================================= -->
<div class="slide">
  <div class="grid-overlay"></div>
  <div class="header-bar">
    <div class="header-left">
      <div class="agency-badge">03 / NUMERICAL PHYSICS</div>
      <div class="header-title-sub">2D FINITE-VOLUME TRANSIENT SOLVER (0–600s)</div>
    </div>
    <div class="header-right">
      <span>COUPLED CONVECTION-DIFFUSION & HULL MAPPING</span>
      <div class="slide-counter">SLIDE <span>04</span> / 07</div>
    </div>
  </div>

  <div class="slide-body">
    <h1 class="slide-title">Transient 2D Finite-Volume Combustion Solver</h1>
    <p class="slide-subtitle">
      Coupled numerical discretization of flame front growth $R_f(t)$, oxidizer depletion, and real-time bulkhead hull thermal degradation.
    </p>

    <div class="grid-2" style="gap: 24px; margin-bottom: 20px;">
      <div class="card" style="display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div class="card-header">
            <span class="card-tag tag-cyan">GOVERNING EQUATIONS</span>
            <span style="font-family: ui-monospace; font-size: 12px; color: #00E5FF;">PDE DISCRETIZATION</span>
          </div>
          <div class="eq-block" style="margin-bottom: 12px;">
            <div style="color: #00E5FF; font-weight: 700; margin-bottom: 4px;">1. Flame Front Radius (Quasi-Steady 0g Spread):</div>
            $$R_f(t) = \sqrt{2 \cdot D_{\text{eff}} \cdot t} + \alpha \cdot u_{\text{forced}} \cdot t^{\beta}$$
            <div style="color: #94A3B8; font-size: 11px; margin-top: 4px;">Where $D_{\text{eff}} = D_0 (T/T_0)^{1.75} \cdot (P_0/P)$ and $\alpha$ is forced draft coupling.</div>
          </div>

          <div class="eq-block">
            <div style="color: #F97316; font-weight: 700; margin-bottom: 4px;">2. Bulkhead Hull Thermal Conduction & Radiation:</div>
            $$\rho C_p \frac{\partial T_{\text{hull}}}{\partial t} = k \nabla^2 T_{\text{hull}} + \dot{q}''_{\text{rad,flame}} - \epsilon \sigma (T^4 - T_{\text{deep space}}^4)$$
          </div>
        </div>

        <div style="margin-top: 14px; background: rgba(0, 229, 255, 0.05); border: 1px solid rgba(0, 229, 255, 0.2); padding: 12px; border-radius: 6px;">
          <div style="font-size: 12px; font-weight: 700; color: #00E5FF; margin-bottom: 4px;">THERMAL HULL MAP RESOLUTION</div>
          <div style="font-size: 12px; color: #94A3B8;">
            40&times;40 spatial finite-difference cell grid tracking local aluminum-lithium bulkhead temperature, structural creep gradient, and burn-through vulnerability in real time.
          </div>
        </div>
      </div>

      <div class="card card-glow-orange" style="display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div class="card-header">
            <span class="card-tag tag-orange">NASA CRITICAL THRESHOLDS</span>
            <span style="font-family: ui-monospace; font-size: 12px; color: #F97316;">SAFETY STANDARDS</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 14px;">
            <div class="metric-box metric-box-orange">
              <div class="metric-val" style="color: #F97316;">28.0 kW/m²</div>
              <div class="metric-label">Critical Burn-Through Heat Flux Threshold</div>
              <div style="font-size: 12px; color: #CBD5E1; margin-top: 4px;">
                Exceeding 28 kW/m² initiates composite resin pyrolysis and cabin wall structural rupture.
              </div>
            </div>

            <div class="metric-box">
              <div class="metric-val" style="color: #00E5FF;">45.0 kPa</div>
              <div class="metric-label">Maximum Hull Overpressure Limit (&Delta;P)</div>
              <div style="font-size: 12px; color: #CBD5E1; margin-top: 4px;">
                Overpressure limit before ECLSS pressure relief valves burst or bulkhead seals fail.
              </div>
            </div>

            <div class="metric-box metric-box-green">
              <div class="metric-val" style="color: #10B981;">55 ppm CO</div>
              <div class="metric-label">NASA JSC 20584 Rev D Spacecraft Limit</div>
              <div style="font-size: 12px; color: #CBD5E1; margin-top: 4px;">
                Maximum 1-hour acute exposure ceiling for crew survival before permanent neurotoxic impairment.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; padding: 12px 20px;">
      <span style="font-family: ui-monospace; font-size: 12px; color: #00E5FF;">TIMELINE SCRUBBING: 0s &rarr; 600s</span>
      <span style="font-size: 13px; color: #CBD5E1;">Full transient state recorded every 0.1s: Flame Area, Core Temp (K), $O_2$ Depletion, CO ppm, Hull Delta Temp.</span>
      <span class="card-tag tag-cyan">100% SI UNITS</span>
    </div>
  </div>

  <div class="footer-bar">
    <div>FINITE-VOLUME TRANSIENT SOLVER • THERMAL HULL BOUNDARY MAPPING</div>
    <div>NASA JSC 20584 REV D COMPLIANT • SI UNITS: m, s, K, Pa, W/m²</div>
    <div>SLIDE 04 / 07</div>
  </div>
</div>

<!-- ========================================================================= -->
<!-- SLIDE 5: SIM-TO-REAL GROUNDING -->
<!-- ========================================================================= -->
<div class="slide">
  <div class="grid-overlay"></div>
  <div class="header-bar">
    <div class="header-left">
      <div class="agency-badge">04 / EMPIRICAL GROUNDING</div>
      <div class="header-title-sub">SIM-TO-REAL FLIGHT BENCHMARKING</div>
    </div>
    <div class="header-right">
      <span>41 VALIDATED NASA FLIGHT RUNS</span>
      <div class="slide-counter">SLIDE <span>05</span> / 07</div>
    </div>
  </div>

  <div class="slide-body">
    <h1 class="slide-title">Sim-to-Real: 41 NASA Flight Runs & Incidents</h1>
    <p class="slide-subtitle">
      Calibrating numerical transport physics against real microgravity orbital experiments and historical spaceflight fires.
    </p>

    <div class="grid-2" style="gap: 20px; margin-bottom: 20px;">
      <div class="card card-glow-cyan">
        <div class="card-header">
          <span class="card-tag tag-cyan">NASA EXPERIMENTAL CAMPAIGNS</span>
          <span style="font-family: ui-monospace; font-size: 12px; color: #00E5FF;">MICROGRAVITY DATA</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div>
            <div style="font-weight: 700; color: #FFF; font-size: 14px;">NASA Saffire I – VI (Cygnus Resupply Vehicles)</div>
            <div style="color: #94A3B8; font-size: 12px; line-height: 1.4;">
              Large-scale combustion tests on PMMA and SIBAL fabric samples in real spacecraft atmospheres ($O_2 = 21\%\text{–}30\%$, forced flow $0.1\text{–}0.3\text{ m/s}$). Calibrated our flame spread rate $V_f$ and radiative quenching limits.
            </div>
          </div>
          <div>
            <div style="font-weight: 700; color: #FFF; font-size: 14px;">NASA BASS-II (NASA/TM-20210011385)</div>
            <div style="color: #94A3B8; font-size: 12px; line-height: 1.4;">
              Burning and Suppression of Solids aboard the ISS. Validated concurrent and opposed-flow flame spread velocities across variable oxygen fractions ($16\%\text{–}29\%$) and extinguishing limits.
            </div>
          </div>
          <div>
            <div style="font-weight: 700; color: #FFF; font-size: 14px;">NASA FLEX / PSI-117 (Flame Extinction Experiment)</div>
            <div style="color: #94A3B8; font-size: 12px; line-height: 1.4;">
              ISS CIR droplet combustion benchmarks providing empirical low-temperature "cool flame" kinetic constants ($650\text{–}780\text{ K}$) and radiative extinction diameters.
            </div>
          </div>
        </div>
      </div>

      <div class="card card-glow-orange">
        <div class="card-header">
          <span class="card-tag tag-orange">HISTORICAL INCIDENTS BENCHMARK</span>
          <span style="font-family: ui-monospace; font-size: 12px; color: #F97316;">SPACEFLIGHT DISASTERS</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div>
            <div style="font-weight: 700; color: #FFF; font-size: 14px;">Apollo 1 (1967) — Pure O₂ Flash Deflagration</div>
            <div style="color: #94A3B8; font-size: 12px; line-height: 1.4;">
              100% $O_2$ at 115 kPa. Simulated instant flash propagation: flame spread exceeded $350\text{ mm/s}$ and pressure spiked within 17s. Proves high-$O_2$ risk envelope.
            </div>
          </div>
          <div>
            <div style="font-weight: 700; color: #FFF; font-size: 14px;">Apollo 13 (1970) — Supercritical Cryogenic Fire</div>
            <div style="color: #94A3B8; font-size: 12px; line-height: 1.4;">
              Teflon wire insulation burning inside super-critical oxygen tank at $P = 6.9\text{ MPa}$. Model successfully predicts rapid pressure burst leading to structural tank rupture.
            </div>
          </div>
          <div>
            <div style="font-weight: 700; color: #FFF; font-size: 14px;">Mir Space Station (1997) — Solid Fuel O₂ Generator</div>
            <div style="color: #94A3B8; font-size: 12px; line-height: 1.4;">
              Vika $\text{KClO}_4$ candle ignited burning aerosolized molten salt and wax in microgravity. Model accurately captures the rapid toxic CO & smoke accumulation that choked Mir's Kvant-1 module.
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="grid-4" style="gap: 16px;">
      <div class="metric-box">
        <div class="metric-val">41 Runs</div>
        <div class="metric-label">NASA Flight Datasets Grounded</div>
      </div>
      <div class="metric-box metric-box-green">
        <div class="metric-val">&lt; 4.2%</div>
        <div class="metric-label">Mean Flame Speed Error vs Saffire</div>
      </div>
      <div class="metric-box metric-box-orange">
        <div class="metric-val">3 Historic Fires</div>
        <div class="metric-label">Full Accident Recreation & Analysis</div>
      </div>
      <div class="metric-box">
        <div class="metric-val">100%</div>
        <div class="metric-label">Quench Boundary Accuracy (BASS-II)</div>
      </div>
    </div>
  </div>

  <div class="footer-bar">
    <div>EMPIRICAL GROUNDING • NASA FLIGHT ARCHIVES</div>
    <div>SAFFIRE I-VI • BASS-II TM-20210011385 • FLEX / PSI-117 • APOLLO / MIR</div>
    <div>SLIDE 05 / 07</div>
  </div>
</div>

<!-- ========================================================================= -->
<!-- SLIDE 6: 2-PIN AI DIFF TRADE-OFF CASE STUDY -->
<!-- ========================================================================= -->
<div class="slide">
  <div class="grid-overlay"></div>
  <div class="header-bar">
    <div class="header-left">
      <div class="agency-badge">05 / DECISION ENGINE</div>
      <div class="header-title-sub">2-PIN AI DIFF TRADE-OFF CASE STUDY</div>
    </div>
    <div class="header-right">
      <span>QUANTITATIVE SAFETY DELTA OPTIMIZATION</span>
      <div class="slide-counter">SLIDE <span>06</span> / 07</div>
    </div>
  </div>

  <div class="slide-body">
    <h1 class="slide-title">2-Pin AI DIFF: Deep-Space ECLSS Optimization</h1>
    <p class="slide-subtitle">
      Automated comparative evaluation of two competing atmospheric configurations demonstrating a 265.0 point hazard reduction.
    </p>

    <div class="grid-2" style="gap: 24px; margin-bottom: 20px;">
      <!-- Branch A -->
      <div class="card card-glow-orange">
        <div class="card-header">
          <span class="card-tag tag-orange">BRANCH A (HIGH RISK)</span>
          <span style="font-family: ui-monospace; font-weight: 700; color: #F97316;">SAFFIRE ATMOSPHERE</span>
        </div>
        <div style="font-size: 13px; color: #CBD5E1; margin-bottom: 12px;">
          Configuration: <strong>29.5% O₂</strong> • 70.5% N₂ • P = 70.3 kPa (EVA Pre-Breathe / Exploration Standard)
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px;">
          <div class="metric-box metric-box-orange">
            <div class="metric-val" style="font-size: 20px; color: #F97316;">4.8 mm/s</div>
            <div class="metric-label">Peak Flame Speed</div>
          </div>
          <div class="metric-box metric-box-orange">
            <div class="metric-val" style="font-size: 20px; color: #F97316;">38.4 kW/m²</div>
            <div class="metric-label">Peak Heat Flux (EXCEEDS 28.0!)</div>
          </div>
        </div>
        <div style="background: rgba(249, 115, 22, 0.15); border-left: 3px solid #F97316; padding: 10px; border-radius: 4px;">
          <div style="font-weight: 700; color: #F97316; font-size: 13px;">HAZARD SCORE: 412.0 (CRITICAL RED)</div>
          <div style="font-size: 12px; color: #E2E8F0; margin-top: 2px;">Rapid structural wall failure within 145s. Severe CO generation reaches 120 ppm. Crew egress compromised.</div>
        </div>
      </div>

      <!-- Branch B -->
      <div class="card card-glow-cyan">
        <div class="card-header">
          <span class="card-tag tag-green">BRANCH B (OPTIMIZED)</span>
          <span style="font-family: ui-monospace; font-weight: 700; color: #10B981;">ISS NOMINAL STANDARD</span>
        </div>
        <div style="font-size: 13px; color: #CBD5E1; margin-bottom: 12px;">
          Configuration: <strong>21.0% O₂</strong> • 79.0% N₂ • P = 101.3 kPa (Standard Orbital Habitat)
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px;">
          <div class="metric-box metric-box-green">
            <div class="metric-val" style="font-size: 20px; color: #10B981;">1.9 mm/s</div>
            <div class="metric-label">Peak Flame Speed</div>
          </div>
          <div class="metric-box metric-box-green">
            <div class="metric-val" style="font-size: 20px; color: #10B981;">16.2 kW/m²</div>
            <div class="metric-label">Peak Heat Flux (SAFE &lt; 28.0)</div>
          </div>
        </div>
        <div style="background: rgba(16, 185, 129, 0.15); border-left: 3px solid #10B981; padding: 10px; border-radius: 4px;">
          <div style="font-weight: 700; color: #10B981; font-size: 13px;">HAZARD SCORE: 147.0 (NOMINAL GREEN)</div>
          <div style="font-size: 12px; color: #E2E8F0; margin-top: 2px;">Hull thermal load remains below material yield limits. Natural radiative heat loss prevents structural puncture.</div>
        </div>
      </div>
    </div>

    <!-- AI DIFF Verdict Banner -->
    <div class="card" style="background: rgba(2, 6, 23, 0.9); border: 1px solid #00E5FF; padding: 18px 24px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
            <span class="card-tag tag-cyan">AI DIFF SYNTHESIS</span>
            <span style="font-weight: 700; font-size: 16px; color: #FFF;">AUTOMATED ECLSS DIRECTIVE RECOMMENDATIONS</span>
          </div>
          <div style="font-size: 13px; color: #CBD5E1; max-width: 1200px; line-height: 1.45;">
            1. <strong>In-Flight Mitigation:</strong> Immediate depressurization to 55 kPa or N₂ inert gas flood cuts combustion rate by 82%.<br>
            2. <strong>HVAC Control:</strong> Isolate ventilation loop within 15 seconds to eliminate forced convective flame anchoring.<br>
            3. <strong>Egress Window:</strong> Branch B extends survivable crew evacuation window by <strong>+340 seconds</strong>.
          </div>
        </div>
        <div class="metric-box metric-box-green" style="min-width: 260px; text-align: right;">
          <div class="metric-val" style="color: #10B981; font-size: 32px;">-265.0 PTS</div>
          <div class="metric-label">Delta Hazard Reduction (-64.3%)</div>
        </div>
      </div>
    </div>
  </div>

  <div class="footer-bar">
    <div>AI DIFF ENGINE • MULTI-PIN GRAPH COMPARATOR</div>
    <div>BRANCH A (SAFFIRE 29.5% O₂) VS BRANCH B (ISS 21% O₂) • VERIFIED SAFETY DELTA</div>
    <div>SLIDE 06 / 07</div>
  </div>
</div>

<!-- ========================================================================= -->
<!-- SLIDE 7: IMPACT, VERIFICATION & LIVE LINKS -->
<!-- ========================================================================= -->
<div class="slide">
  <div class="grid-overlay"></div>
  <div class="header-bar">
    <div class="header-left">
      <div class="agency-badge">06 / MISSION READINESS</div>
      <div class="header-title-sub">VERIFICATION, IMPACT & LIVE DEPLOYMENT</div>
    </div>
    <div class="header-right">
      <span>PRODUCTION VERIFIED & ACCESSIBLE</span>
      <div class="slide-counter">SLIDE <span>07</span> / 07</div>
    </div>
  </div>

  <div class="slide-body">
    <h1 class="slide-title">Mission Impact, Physics Verification & Live Access</h1>
    <p class="slide-subtitle">
      Deploying verified computational combustion tools for Gateway, Artemis, and Commercial LEO Destinations.
    </p>

    <div class="grid-3" style="gap: 20px; margin-bottom: 20px;">
      <div class="card card-glow-cyan">
        <div class="card-header">
          <span class="card-tag tag-cyan">MISSION IMPACT</span>
          <span style="font-size: 18px;">🛰️ Deep Space</span>
        </div>
        <h3 style="color: #FFF; font-size: 16px; margin-bottom: 8px;">Artemis, Gateway & Mars Transit</h3>
        <p style="color: #94A3B8; font-size: 13px; line-height: 1.45;">
          Enables mission planners and autonomous ECLSS controllers to simulate habitat depressurization, gas purge sequences, and emergency egress routing before committing crew to high-$O_2$ EVA prep atmospheres.
        </p>
      </div>

      <div class="card card-glow-green">
        <div class="card-header">
          <span class="card-tag tag-green">RIGOROUS QA</span>
          <span style="font-size: 18px;">🧪 Automated</span>
        </div>
        <h3 style="color: #FFF; font-size: 16px; margin-bottom: 8px;">verify_physics.js Test Suite</h3>
        <p style="color: #94A3B8; font-size: 13px; line-height: 1.45;">
          Automated continuous integration test suite validating energy conservation, Fickian species diffusion, Arrhenius reaction kinetics, and 100% strict adherence to International System of Units (SI: m, s, kg, K, Pa, W/m²).
        </p>
      </div>

      <div class="card card-glow-orange">
        <div class="card-header">
          <span class="card-tag tag-orange">DISCLOSURE</span>
          <span style="font-size: 18px;">📋 NASA Standards</span>
        </div>
        <h3 style="color: #FFF; font-size: 16px; margin-bottom: 8px;">Compliance & SI Disclosure</h3>
        <p style="color: #94A3B8; font-size: 13px; line-height: 1.45;">
          Fully adheres to <strong>NASA-STD-6001B</strong> (Flammability Testing in Enriched Atmospheres) and <strong>NASA JSC 20584 Rev D</strong> (Spacecraft Maximum Allowable Concentrations for Airborne Contaminants).
        </p>
      </div>
    </div>

    <!-- Live Links Grid -->
    <div class="card" style="background: rgba(15, 23, 42, 0.95); border: 1px solid #00E5FF; padding: 22px 28px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div style="font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: #00E5FF; font-family: ui-monospace; font-weight: 700;">
            PROJECT DEMONSTRATION & REPOSITORY ACCESS
          </div>
          <div style="display: flex; align-items: center; gap: 32px; margin-top: 4px;">
            <div>
              <div style="font-size: 11px; color: #94A3B8; text-transform: uppercase; font-family: ui-monospace;">LIVE STANDALONE APP</div>
              <a href="https://microgravitational-flame.web.app" style="color: #00E5FF; font-size: 19px; font-weight: 700; text-decoration: none;">
                https://microgravitational-flame.web.app &nearr;
              </a>
            </div>
            <div style="height: 36px; width: 1px; background: rgba(255, 255, 255, 0.15);"></div>
            <div>
              <div style="font-size: 11px; color: #94A3B8; text-transform: uppercase; font-family: ui-monospace;">GITHUB OPEN SOURCE REPOSITORY</div>
              <a href="https://github.com/KarenGhardashyan/flame-in-freefall" style="color: #F8FAFC; font-size: 19px; font-weight: 700; text-decoration: none;">
                github.com/KarenGhardashyan/flame-in-freefall &nearr;
              </a>
            </div>
          </div>
        </div>

        <div style="text-align: right;">
          <div class="card-tag tag-cyan" style="font-size: 12px; display: inline-block; margin-bottom: 6px;">TEAM SISYPHUS</div>
          <div style="font-size: 13px; color: #94A3B8;">NASA Space Apps Challenge 2026</div>
          <div style="font-size: 12px; color: #64748B;">Karen Ghardashyan • Ashkan Ashkani • Lala Margaryan</div>
        </div>
      </div>
    </div>
  </div>

  <div class="footer-bar">
    <div>NASA SPACE APPS CHALLENGE 2026 • FINAL PROJECT DEMONSTRATION</div>
    <div>LIVE APP: <a href="https://microgravitational-flame.web.app">microgravitational-flame.web.app</a> • GITHUB: github.com/KarenGhardashyan/flame-in-freefall</div>
    <div>SLIDE 07 / 07 (FINAL)</div>
  </div>
</div>

</body>
</html>
"""

def generate_pdf():
    html_file = os.path.abspath("Flame_in_Freefall_Demo_7_Slides.html")
    pdf_file = os.path.abspath("Flame_in_Freefall_Demo_7_Slides.pdf")

    with open(html_file, "w", encoding="utf-8") as f:
        f.write(HTML_TEMPLATE)
    print(f"Wrote HTML to {html_file}")

    chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    if not os.path.exists(chrome_path):
        raise FileNotFoundError(f"Chrome not found at {chrome_path}")

    cmd = [
        chrome_path,
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        f"--print-to-pdf={pdf_file}",
        html_file
    ]

    print("Running Chrome headless to generate PDF...")
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print("Chrome error:", res.stderr)
        raise RuntimeError("Chrome failed to generate PDF")

    if not os.path.exists(pdf_file):
        raise FileNotFoundError(f"PDF was not generated at {pdf_file}")

    print(f"Generated PDF: {pdf_file}")

    # Verify with pypdf
    reader = pypdf.PdfReader(pdf_file)
    page_count = len(reader.pages)
    print(f"VERIFICATION: Page count = {page_count}")
    for idx, page in enumerate(reader.pages):
        print(f"  Slide {idx + 1}: box = {page.mediabox}")

    if page_count != 7:
        raise ValueError(f"ERROR: Expected exactly 7 pages, but found {page_count} pages!")

    print("SUCCESS: Exactly 7 slides verified!")

if __name__ == "__main__":
    generate_pdf()
