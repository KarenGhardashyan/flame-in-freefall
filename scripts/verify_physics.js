'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

// Load the browser build and exercise its local Fetch router without a server.
const apiPath = resolve(__dirname, '../frontend/standalone_api.js');
const window = {
  location: { protocol: 'file:', hostname: '' },
  fetch: async () => assert.fail('The standalone API attempted a network request')
};
runInNewContext(readFileSync(apiPath, 'utf8'), {
  window,
  Response,
  console: { log() {} }
}, { filename: apiPath });

const api = window.StandaloneAPI;
const fuels = ['pmma', 'sibal', 'heptane', 'hydrogen', 'methane'];
const oxygenPercentages = [12, 13.5, 14.9, 15, 21, 29.5, 69.99, 70, 89.99, 90, 100];
const pressuresAtm = [0.3, 0.71, 1, 2];
const velocitiesCms = [0, 0.5, 1.2, 2.5, 10, 20, 55, 60];
const gasConcentrations = { hydrogen: 6.5, methane: 7 };
const finiteFields = [
  'flame_temp_k', 'damkohler', 'loi_crit', 'spread_rate_mm_s',
  'hull_heat_flux_kw_m2', 'peak_overpressure_kpa', 'co_600s_ppm'
];
const nonFiniteText = /\b(?:NaN|undefined|Infinity)\b/;

function assertValidTelemetry(value, label, path = 'evaluation') {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) assert.fail(`${label} ${path} is ${value}`);
    return;
  }
  if (typeof value === 'string') {
    if (nonFiniteText.test(value)) assert.fail(`${label} ${path} printed invalid telemetry: ${value}`);
    return;
  }
  if (value === undefined) assert.fail(`${label} ${path} is undefined`);
  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) assertValidTelemetry(entry, label, `${path}.${key}`);
  }
}

function verifyScenario(params) {
  const result = api.evaluateFireSafety(params);
  const label = JSON.stringify(params);
  for (const field of finiteFields) {
    assert.ok(Number.isFinite(result[field]), `${label} requires finite ${field}`);
    assert.ok(result[field] >= 0, `${label} requires nonnegative ${field}`);
  }
  assert.ok(Object.hasOwn(result, 'time_to_smac_s'), `${label} requires time_to_smac_s`);
  assertValidTelemetry(result, label);
  const time = result.time_to_smac_s;
  const series = result.time_series;
  assert.equal(time, result.time_to_smac_sec, label);
  assert.equal(result.co_600s_ppm, series.co_ppm.at(-1), label);
  assert.equal(result.peak_overpressure_kpa, Math.max(...series.overpressure_kpa), label);
  assert.equal(result.outside_breach, result.hull_heat_flux_kw_m2 >= 28 || result.peak_overpressure_kpa >= 45, label);
  assert.equal(series.t_sec[0], 0, label);
  assert.equal(series.t_sec.at(-1), 600, label);
  for (const values of Object.values(series)) assert.equal(values.length, series.t_sec.length, label);

  if (result.co_600s_ppm === series.co_ppm[0]) {
    assert.equal(time, null, `${label} has no modeled CO accumulation`);
  } else {
    assert.ok(Number.isFinite(time) && time > 0, `${label} must give a finite, positive CO crossing time`);
  }
  if (params.o2_percent / 100 < result.loi_crit) {
    assert.equal(result.combustion_regime, 'extinction', `${label} is below critical LOI`);
    assert.equal(result.sim_telemetry.flame_color_mode, 'extinguished', label);
    assert.equal(result.spread_rate_mm_s, 0, label);
    assert.equal(result.hull_heat_flux_kw_m2, 0, label);
    assert.equal(result.peak_overpressure_kpa, 0, label);
  }
  if (params.fuel === 'hydrogen') {
    assert.equal(result.co_600s_ppm, 0, label);
    assert.ok(series.co_ppm.every(co => co === 0), label);
    assert.equal(time, null, label);
  }
  if (result.co_600s_ppm > 55) {
    assert.ok(Number.isFinite(time) && time <= 600, `${label} crossed 55 ppm in the modeled window`);
    const timeRow = api.telemetryRows(result).find(row => row.key === 'time_to_smac_s');
    assert.doesNotMatch(timeRow.text, /^>\s*600\s*s$/, label);
  }
  return result;
}

for (const fuel of fuels) {
  const runs = oxygenPercentages.length * pressuresAtm.length * velocitiesCms.length;
  test(`${fuel}: ${runs} oxygen, pressure and ventilation combinations`, () => {
    for (const o2_percent of oxygenPercentages) {
      for (const pressure_atm of pressuresAtm) {
        for (const flow_velocity_cms of velocitiesCms) {
          verifyScenario({ fuel, o2_percent, pressure_atm, flow_velocity_cms,
            h2_conc_pct: gasConcentrations[fuel] ?? 0 });
        }
      }
    }
  });
}

test('the reported LOI separates nonburning and ignitable cases across pressure', () => {
  for (const fuel of fuels) {
    for (const pressure_atm of pressuresAtm) {
      const params = { fuel, pressure_atm, flow_velocity_cms: 10, h2_conc_pct: gasConcentrations[fuel] ?? 0 };
      const limit = api.evaluateFireSafety(params).loi_crit * 100;
      const below = verifyScenario({ ...params, o2_percent: limit - 0.01 });
      const above = verifyScenario({ ...params, o2_percent: limit + 0.01 });
      assert.equal(below.combustion_regime, 'extinction');
      assert.equal(above.combustion_regime, gasConcentrations[fuel] ? 'explosion_flash' : 'hot_flame');
    }
  }
});

test('premixed gas pulses require fuel, ignition, and the concentration threshold', () => {
  for (const [fuel, threshold] of [['hydrogen', 4], ['methane', 5]]) {
    const params = { fuel, o2_percent: 21, pressure_atm: 1, flow_velocity_cms: 10 };
    const empty = verifyScenario({ ...params, h2_conc_pct: 0 });
    const unlit = verifyScenario({ ...params, h2_conc_pct: threshold, is_ignited: false });
    const below = verifyScenario({ ...params, h2_conc_pct: threshold - 0.01 });
    const at = verifyScenario({ ...params, h2_conc_pct: threshold });
    for (const result of [empty, unlit]) {
      assert.equal(result.combustion_regime, 'extinction');
      assert.equal(result.peak_overpressure_kpa, 0);
    }
    assert.notEqual(below.combustion_regime, 'explosion_flash');
    assert.equal(at.combustion_regime, 'explosion_flash');
    assert.ok(at.peak_overpressure_kpa >= 45);
  }
});

test('CO crossing immediately below or above 600 seconds retains the correct category', () => {
  const params = { fuel: 'pmma', o2_percent: 42, pressure_atm: 1, flow_velocity_cms: 10,
    cabin_volume_m3: 28 };
  const initial = verifyScenario(params);
  assert.ok(initial.time_to_smac_s > 0);
  const boundaryVolume = params.cabin_volume_m3 * 600 / initial.time_to_smac_s;
  const justBefore = verifyScenario({ ...params, cabin_volume_m3: boundaryVolume * (1 - 1e-6) });
  const justAfter = verifyScenario({ ...params, cabin_volume_m3: boundaryVolume * (1 + 1e-6) });
  assert.ok(justBefore.co_600s_ppm > 55 && justBefore.time_to_smac_s < 600);
  assert.ok(justAfter.co_600s_ppm < 55 && justAfter.time_to_smac_s > 600);
});

async function postJson(route, body) {
  const response = await window.fetch(route, { method: 'POST', body: JSON.stringify(body) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type'), /application\/json/);
  return response.json();
}

test('two-pin comparator returns one matrix of distinct signed deltas and table-free diagnostics', async () => {
  const branchA = { fuel: 'pmma', o2_percent: 21, pressure_atm: 1, flow_velocity_cms: 10 };
  const branchB = { fuel: 'methane', o2_percent: 42, pressure_atm: 2, flow_velocity_cms: 25, h2_conc_pct: 7 };
  const result = await postJson('/api/compare-blueprints', { branch_a: branchA, branch_b: branchB });
  const reverse = await postJson('/api/compare-blueprints', { branch_a: branchB, branch_b: branchA });
  assert.equal(result.status, 'success');
  assert.equal(result.rows.length, new Set(result.rows.map(row => row[0])).size);
  assert.deepEqual(result.rows.find(row => row[0] === 'Oxygen'), ['Oxygen', '21.0%', '42.0%', '+21.0%']);
  assert.deepEqual(result.rows.find(row => row[0] === 'Cabin pressure'), ['Cabin pressure', '1.00 atm', '2.00 atm', '+1.00 atm']);
  assert.deepEqual(result.rows.find(row => row[0] === 'Ventilation'), ['Ventilation', '10.0 cm/s', '25.0 cm/s', '+15.0 cm/s']);
  for (const key of ['tf', 'da', 'loi', 'flux', 'overpressure', 'co', 'risk', 'expl']) {
    const delta = result.metrics[`delta_${key}`];
    assert.ok(Number.isFinite(delta) && delta !== 0, key);
    assert.equal(delta, result.metrics[`${key}_b`] - result.metrics[`${key}_a`], key);
    assert.equal(reverse.metrics[`delta_${key}`], -delta, key);
  }
  const markdown = result.advisory_text;
  assert.doesNotMatch(markdown, /^\s*\|.+\|\s*$/m);
  assert.doesNotMatch(markdown, nonFiniteText);
  assert.match(markdown, /GOVERNING PHYSICS/i);
  assert.match(markdown, /ECLSS RESPONSE PRIORITIES/i);
  assert.match(markdown, /\b28(?:\.\d+)?\s*kW\/m²/i);
  assert.match(markdown, /\b45(?:\.\d+)?\s*kPa/i);
  assert.match(markdown, /\b55(?:\.\d+)?\s*ppm/i);
  assert.notEqual(markdown, reverse.advisory_text);
});

test('the engine and comparator agree on supported input aliases and units', async () => {
  const canonical = { fuel: 'hydrogen', o2_percent: 28.5, pressure_atm: 1.2, flow_velocity_cms: 12, h2_conc_pct: 6 };
  const aliases = { fuel_type: 'h2', o2_vol_fraction: 0.285, pressure_bar: 1.2 * 1.01325, flow_cms: 12, flammable_gas_pct: 6 };
  const expected = verifyScenario(canonical);
  const actual = api.evaluateFireSafety(aliases);
  assert.deepEqual(actual.model_inputs, expected.model_inputs);
  assert.equal(actual.peak_overpressure_kpa, expected.peak_overpressure_kpa);
  assert.equal(actual.co_600s_ppm, 0);

  const result = await postJson('/api/compare-blueprints', { branch_a: canonical, branch_b: aliases });
  assert.equal(result.safer_branch, 'EQUAL');
  for (const key of ['o2', 'p', 'v', 'tf', 'flux', 'overpressure', 'co']) {
    assert.equal(result.metrics[`delta_${key}`], 0, key);
  }
});

test('the safety officer describes the selected physics regime', async () => {
  const cool = { fuel: 'heptane', o2_percent: 21, pressure_atm: 1, flow_velocity_cms: 0.5 };
  const extinct = { ...cool, o2_percent: 12 };
  for (const [params, regime, mechanism] of [[cool, 'cool_flame', /FLEX/i], [extinct, 'extinction', /LOI/i]]) {
    const evaluation = verifyScenario(params);
    const advice = await postJson('/api/safety-officer', { params, evaluation });
    assert.equal(evaluation.combustion_regime, regime);
    assert.match(advice.advisory_text, mechanism);
    assert.match(advice.advisory_text, /GOVERNING PHYSICS/i);
    assert.match(advice.advisory_text, /ECLSS RESPONSE PRIORITIES/i);
    assert.doesNotMatch(advice.advisory_text, nonFiniteText);
  }
});
