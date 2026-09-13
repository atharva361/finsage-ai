/**
 * FinSage AI — Cautious Personal Financial Planner Agent
 * Core engine: data model · cash-flow projection · scenario simulator · risk scorer · advisor
 */

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  profile: {},          // user financial profile
  projection: [],       // 12-month cash-flow projection
  scenarios: [],        // purchase scenario results
  purchaseGoal: null,   // current purchase being evaluated
  charts: {},           // Chart.js instances
};

// ─── DOM helpers ──────────────────────────────────────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const fmt = (n, dec = 0) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: dec }).format(n);
const fmtNum = (n, dec = 0) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: dec }).format(n);
const pct = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── View router ──────────────────────────────────────────────────────────────
function showView(id) {
  $$('.view').forEach(v => v.classList.remove('active'));
  const el = $(`#view-${id}`);
  if (el) el.classList.add('active');
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info', icon = '💡') {
  const icons = { success: '✅', error: '❌', info: '💡', warning: '⚠️' };
  const wrap = $('#toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type] || icon}</span><span>${msg}</span>`;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3100);
}

// ─── Wizard state ─────────────────────────────────────────────────────────────
let wizardStep = 0;
const WIZARD_STEPS = ['Income', 'Expenses', 'Savings', 'Debts', 'Goals'];
const TOTAL_STEPS = WIZARD_STEPS.length;

function initWizard() {
  updateWizardUI();
  setupExpenseRows();
  setupDebtRows();
}

function updateWizardUI() {
  // progress
  const pct = ((wizardStep) / TOTAL_STEPS) * 100;
  $('#progress-fill').style.width = `${pct}%`;

  $$('.progress-label').forEach((el, i) => {
    el.classList.toggle('active', i === wizardStep);
    el.classList.toggle('done', i < wizardStep);
  });

  $$('.wizard-step').forEach((el, i) => {
    el.classList.toggle('active', i === wizardStep);
  });

  // buttons
  const prevBtn = $('#btn-prev');
  const nextBtn = $('#btn-next');
  if (prevBtn) prevBtn.style.display = wizardStep === 0 ? 'none' : 'flex';
  if (nextBtn) nextBtn.textContent = wizardStep === TOTAL_STEPS - 1 ? '🚀  Analyze My Finances' : 'Next →';
}

function wizardNext() {
  if (!validateStep(wizardStep)) return;
  if (wizardStep < TOTAL_STEPS - 1) {
    wizardStep++;
    updateWizardUI();
  } else {
    // final step — collect all data and go to dashboard
    collectProfile();
    buildProjection();
    renderDashboard();
    showView('dashboard');
    toast('Financial analysis complete!', 'success');
  }
}

function wizardPrev() {
  if (wizardStep > 0) {
    wizardStep--;
    updateWizardUI();
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────
function validateStep(step) {
  const checks = [
    // Step 0: Income
    () => {
      const v = parseFloat($('#income-monthly').value);
      if (!v || v <= 0) { toast('Please enter your monthly income', 'error'); return false; }
      return true;
    },
    // Step 1: Expenses — always valid (optional rows)
    () => true,
    // Step 2: Savings
    () => {
      const v = parseFloat($('#savings-balance').value);
      if (isNaN(v) || v < 0) { toast('Enter a valid savings balance (0 is fine)', 'error'); return false; }
      return true;
    },
    // Step 3: Debts — always valid
    () => true,
    // Step 4: Goals — always valid
    () => true,
  ];
  return checks[step] ? checks[step]() : true;
}

// ─── Expense dynamic rows ─────────────────────────────────────────────────────
const DEFAULT_EXPENSES = [
  { name: 'Rent / EMI', amount: '' },
  { name: 'Groceries', amount: '' },
  { name: 'Utilities', amount: '' },
];

function setupExpenseRows() {
  const container = $('#expense-rows');
  if (!container) return;
  container.innerHTML = '';
  DEFAULT_EXPENSES.forEach(e => addExpenseRow(e.name, e.amount));
}

function addExpenseRow(name = '', amount = '') {
  const container = $('#expense-rows');
  const row = document.createElement('div');
  row.className = 'expense-row';
  row.innerHTML = `
    <input class="form-input exp-name"   type="text"   placeholder="Category" value="${name}">
    <div class="input-wrap">
      <span class="input-prefix">₹</span>
      <input class="form-input currency exp-amount" type="number" min="0" placeholder="0" value="${amount}">
    </div>
    <button class="btn-remove-row" title="Remove" onclick="this.closest('.expense-row').remove()">✕</button>
  `;
  container.appendChild(row);
}

// ─── Debt dynamic rows ────────────────────────────────────────────────────────
function setupDebtRows() {
  // no default debt rows — start empty
}

function addDebtRow() {
  const container = $('#debt-rows');
  const row = document.createElement('div');
  row.className = 'expense-row';
  row.style.gridTemplateColumns = '1fr 1fr 1fr auto';
  row.innerHTML = `
    <input class="form-input debt-name"   type="text"   placeholder="Loan type (e.g. Car)">
    <div class="input-wrap">
      <span class="input-prefix">₹</span>
      <input class="form-input currency debt-balance" type="number" min="0" placeholder="Outstanding">
    </div>
    <div class="input-wrap">
      <span class="input-prefix">₹</span>
      <input class="form-input currency debt-emi" type="number" min="0" placeholder="Monthly EMI">
    </div>
    <button class="btn-remove-row" title="Remove" onclick="this.closest('.expense-row').remove()">✕</button>
  `;
  container.appendChild(row);
}

// ─── Collect profile ───────────────────────────────────────────────────────────
function collectProfile() {
  // Income
  const incomeMonthly      = parseFloat($('#income-monthly').value) || 0;
  const incomeGrowthPct    = parseFloat($('#income-growth').value)  || 0;
  const otherIncome        = parseFloat($('#other-income').value)   || 0;

  // Expenses
  const expenses = [];
  $$('#expense-rows .expense-row').forEach(row => {
    const name   = row.querySelector('.exp-name')?.value?.trim();
    const amount = parseFloat(row.querySelector('.exp-amount')?.value) || 0;
    if (name && amount > 0) expenses.push({ name, amount });
  });
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  // Savings
  const savingsBalance     = parseFloat($('#savings-balance').value)     || 0;
  const monthlySaving      = parseFloat($('#monthly-saving').value)      || 0;
  const emergencyTarget    = parseFloat($('#emergency-months').value)    || 6;

  // Debts
  const debts = [];
  $$('#debt-rows .expense-row').forEach(row => {
    const name    = row.querySelector('.debt-name')?.value?.trim();
    const balance = parseFloat(row.querySelector('.debt-balance')?.value) || 0;
    const emi     = parseFloat(row.querySelector('.debt-emi')?.value)     || 0;
    if (name) debts.push({ name, balance, emi });
  });
  const totalDebtEMI = debts.reduce((s, d) => s + d.emi, 0);

  // Goals
  const goalAmount    = parseFloat($('#goal-amount').value)    || 0;
  const goalMonths    = parseInt($('#goal-months').value)       || 12;
  const goalName      = $('#goal-name').value.trim()            || 'Purchase Goal';
  const riskTolerance = $('#risk-tolerance').value              || 'moderate';

  state.profile = {
    incomeMonthly, incomeGrowthPct, otherIncome,
    expenses, totalExpenses,
    savingsBalance, monthlySaving, emergencyTarget,
    debts, totalDebtEMI,
    goalAmount, goalMonths, goalName, riskTolerance,
    // computed
    monthlyNet: incomeMonthly + otherIncome - totalExpenses - totalDebtEMI,
    savingsRate: incomeMonthly > 0
      ? ((incomeMonthly + otherIncome - totalExpenses - totalDebtEMI) / incomeMonthly) * 100
      : 0,
    debtRatio: incomeMonthly > 0
      ? (totalDebtEMI / incomeMonthly) * 100
      : 0,
    emergencyFundMonths: totalExpenses > 0
      ? savingsBalance / totalExpenses
      : savingsBalance > 0 ? 99 : 0,
  };
}

// ─── 12-Month Cash Flow Projection ────────────────────────────────────────────
function buildProjection() {
  const p = state.profile;
  const today = new Date();
  let balance = p.savingsBalance;

  state.projection = Array.from({ length: 12 }, (_, i) => {
    const monthIdx = (today.getMonth() + i) % 12;
    const label    = MONTHS[monthIdx];
    const year     = today.getFullYear() + Math.floor((today.getMonth() + i) / 12);

    // income grows gradually
    const growthFactor = Math.pow(1 + p.incomeGrowthPct / 100, i / 12);
    const income       = (p.incomeMonthly + p.otherIncome) * growthFactor;

    // expenses slightly rise (2% annual inflation)
    const expInflation = Math.pow(1.02, i / 12);
    const expenses     = (p.totalExpenses + p.totalDebtEMI) * expInflation;

    const net      = income - expenses;
    balance       += net;

    // emergency fund coverage
    const efCoverage = expenses > 0 ? balance / expenses : 99;

    return {
      label: `${label} '${String(year).slice(2)}`,
      income: Math.round(income),
      expenses: Math.round(expenses),
      net: Math.round(net),
      balance: Math.round(balance),
      efCoverage: parseFloat(efCoverage.toFixed(1)),
    };
  });
}

// ─── Scenario Engine ──────────────────────────────────────────────────────────
/**
 * Tests three ways to pay for `purchaseGoal`:
 *  A) Lump Sum — pay from savings today
 *  B) EMI — spread over N months at an interest rate
 *  C) Defer — save for it and buy after M months
 *
 * For each scenario, simulate the 12-month projection and score risk.
 */
function runScenarios(goal) {
  const p       = state.profile;
  const amount  = goal.amount;
  const months  = goal.months;

  const scenarios = [];

  // ── A: Lump Sum ─────────────────────────────────────────────────────────────
  {
    const balanceAfter = p.savingsBalance - amount;
    const efAfter      = p.totalExpenses > 0 ? balanceAfter / p.totalExpenses : 99;
    const proj         = projectWithAdjustment(0, 0, amount, months); // one-time deduction now
    const risk         = scoreRisk(proj, efAfter, p.savingsRate, p.debtRatio, 0);
    scenarios.push({
      id: 'lump-sum',
      title: '💳 Lump Sum',
      desc: `Pay ${fmt(amount)} upfront from savings.`,
      balanceAfter,
      efMonthsAfter: efAfter,
      monthlyCost: 0,
      totalCost: amount,
      projectedBalance12: proj[11]?.balance,
      risk,
      proj,
    });
  }

  // ── B: EMI ──────────────────────────────────────────────────────────────────
  {
    const annualRate  = goal.emiRate / 100;        // e.g. 0.12
    const monthlyRate = annualRate / 12;
    const emiMonths   = goal.emiMonths || 12;
    let emi;
    if (monthlyRate === 0) {
      emi = amount / emiMonths;
    } else {
      emi = amount * (monthlyRate * Math.pow(1 + monthlyRate, emiMonths))
              / (Math.pow(1 + monthlyRate, emiMonths) - 1);
    }
    emi = Math.round(emi);
    const totalCost   = emi * emiMonths;
    const interest    = totalCost - amount;
    const newDebtRatio = p.incomeMonthly > 0
      ? ((p.totalDebtEMI + emi) / p.incomeMonthly) * 100
      : 0;
    const newSavingsRate = p.incomeMonthly > 0
      ? ((p.monthlyNet - emi) / p.incomeMonthly) * 100
      : 0;
    const proj        = projectWithAdjustment(emi, emiMonths, 0, 0);
    const efAfter     = state.projection[0]?.efCoverage ?? p.emergencyFundMonths;
    const risk        = scoreRisk(proj, efAfter, newSavingsRate, newDebtRatio, interest);
    scenarios.push({
      id: 'emi',
      title: '📅 EMI Plan',
      desc: `${emiMonths}-month EMI at ${goal.emiRate}% p.a.`,
      balanceAfter: p.savingsBalance,
      efMonthsAfter: efAfter,
      monthlyCost: emi,
      totalCost,
      interest,
      projectedBalance12: proj[11]?.balance,
      risk,
      proj,
      emi,
      emiMonths,
    });
  }

  // ── C: Defer & Save ──────────────────────────────────────────────────────────
  {
    const avgNet = state.projection.slice(0, months).reduce((s, m) => s + m.net, 0) / months;
    const canSavePerMonth = Math.max(0, p.monthlyNet * 0.5); // put half of surplus into goal
    const savedByTarget   = Math.round(canSavePerMonth * months + p.savingsBalance * 0.1);
    const shortfall       = Math.max(0, amount - savedByTarget);
    const deferMonths     = shortfall > 0
      ? Math.ceil(shortfall / Math.max(1, canSavePerMonth)) + months
      : months;
    const projBefore      = projectWithAdjustment(canSavePerMonth * 0, 0, 0, 0); // no extra load
    const efAfter         = state.projection[0]?.efCoverage ?? p.emergencyFundMonths;
    const risk            = scoreRisk(projBefore, efAfter + 1, p.savingsRate + 2, p.debtRatio, 0);
    // boost score since waiting improves stability
    risk.score = clamp(risk.score + 12, 0, 100);
    scenarios.push({
      id: 'defer',
      title: '⏳ Save & Buy Later',
      desc: `Save up and purchase after ~${deferMonths} months.`,
      balanceAfter: savedByTarget,
      efMonthsAfter: efAfter + 1,
      monthlyCost: canSavePerMonth,
      totalCost: amount,
      shortfall,
      deferMonths,
      projectedBalance12: projBefore[11]?.balance,
      risk,
      proj: projBefore,
    });
  }

  state.scenarios = scenarios;
  return scenarios;
}

/**
 * Project cash flow with optional EMI addition and lump-sum deduction.
 */
function projectWithAdjustment(extraMonthlyDeduction, emiForMonths, upfrontDeduction, upfrontMonth) {
  const p       = state.profile;
  const today   = new Date();
  let balance   = p.savingsBalance - upfrontDeduction;

  return Array.from({ length: 12 }, (_, i) => {
    const monthIdx   = (today.getMonth() + i) % 12;
    const year       = today.getFullYear() + Math.floor((today.getMonth() + i) / 12);
    const label      = `${MONTHS[monthIdx]} '${String(year).slice(2)}`;
    const growthF    = Math.pow(1 + p.incomeGrowthPct / 100, i / 12);
    const income     = (p.incomeMonthly + p.otherIncome) * growthF;
    const expInfl    = Math.pow(1.02, i / 12);
    const baseExp    = (p.totalExpenses + p.totalDebtEMI) * expInfl;
    const extraEMI   = i < emiForMonths ? extraMonthlyDeduction : 0;
    const expenses   = baseExp + extraEMI;
    const net        = income - expenses;
    balance         += net;
    const efCov     = baseExp > 0 ? balance / baseExp : 99;

    return {
      label, income: Math.round(income),
      expenses: Math.round(expenses), net: Math.round(net),
      balance: Math.round(balance), efCoverage: parseFloat(efCov.toFixed(1)),
    };
  });
}

// ─── Risk Scorer ──────────────────────────────────────────────────────────────
/**
 * Scores a scenario on a 0-100 scale (100 = safest).
 * Factors: emergency fund coverage, savings rate, debt ratio, interest cost.
 */
function scoreRisk(proj, efMonths, savingsRatePct, debtRatioPct, interestPaid) {
  // Emergency fund score (0-35)
  const efScore = clamp((efMonths / 6) * 35, 0, 35);

  // Savings rate score (0-30) — 20%+ is excellent
  const srScore = clamp((savingsRatePct / 20) * 30, 0, 30);

  // Debt ratio score (0-25) — below 30% is healthy
  const drScore = clamp(((1 - debtRatioPct / 60)) * 25, 0, 25);

  // Negative-balance months penalty (0-10)
  const negMonths = proj.filter(m => m.balance < 0).length;
  const negScore  = clamp((1 - negMonths / 6) * 10, 0, 10);

  const score = Math.round(efScore + srScore + drScore + negScore);

  let level, label;
  if (score >= 70)      { level = 'low';    label = 'Low Risk'; }
  else if (score >= 45) { level = 'medium'; label = 'Moderate Risk'; }
  else                  { level = 'high';   label = 'High Risk'; }

  return { score: clamp(score, 0, 100), level, label, efScore, srScore, drScore, negScore };
}

// ─── Financial Health Score ────────────────────────────────────────────────────
function computeHealthScore(p) {
  // Emergency fund: 0–35
  const ef  = clamp((p.emergencyFundMonths / 6) * 35, 0, 35);
  // Savings rate: 0–30
  const sr  = clamp((p.savingsRate / 20) * 30, 0, 30);
  // Debt ratio: 0–25
  const dr  = clamp((1 - p.debtRatio / 60) * 25, 0, 25);
  // Net positive cash flow: 0–10
  const cf  = p.monthlyNet > 0 ? 10 : 0;
  return Math.round(clamp(ef + sr + dr + cf, 0, 100));
}

// ─── Dashboard renderer ────────────────────────────────────────────────────────
function renderDashboard() {
  const p    = state.profile;
  const proj = state.projection;

  // ── Metrics ──
  $('#dash-income').textContent        = fmt(p.incomeMonthly + p.otherIncome);
  $('#dash-expenses').textContent      = fmt(p.totalExpenses + p.totalDebtEMI);
  const net = p.monthlyNet;
  const netEl = $('#dash-net');
  netEl.textContent = fmt(net);
  netEl.className   = `metric-value ${net >= 0 ? 'positive' : 'negative'}`;
  $('#dash-savings').textContent       = fmt(p.savingsBalance);
  $('#dash-ef').textContent            = `${p.emergencyFundMonths.toFixed(1)} mo`;
  $('#dash-savings-rate').textContent  = `${p.savingsRate.toFixed(1)}%`;

  // ── Health score ──
  const health = computeHealthScore(p);
  renderHealthRing(health, p);

  // ── Charts ──
  renderCashFlowChart(proj);
  renderExpenseDonut(p);
  renderBalanceAreaChart(proj);

  // ── Cash flow table ──
  renderCFTable(proj);

  // ── Insights ──
  renderInsights(p, proj, health);

  // ── Purchase planner ──
  prefillPurchasePlanner(p);
}

// ─── Health ring ──────────────────────────────────────────────────────────────
function renderHealthRing(score, p) {
  const R = 35; // radius
  const circ = 2 * Math.PI * R;
  const offset = circ - (score / 100) * circ;

  const fill = $('#score-ring-fill');
  if (!fill) return;
  fill.style.strokeDasharray  = circ;
  fill.style.strokeDashoffset = offset;

  const color = score >= 70 ? '#22c55e' : score >= 45 ? '#f59e0b' : '#ef4444';
  fill.style.stroke = color;

  $('#score-num').textContent = score;
  $('#score-num').style.color = color;

  // Mini bars
  const efPct = clamp((p.emergencyFundMonths / 6) * 100, 0, 100);
  const srPct = clamp((p.savingsRate / 20) * 100, 0, 100);
  const drPct = clamp((1 - p.debtRatio / 60) * 100, 0, 100);

  const efColor = efPct >= 70 ? 'green' : efPct >= 40 ? 'amber' : 'red';
  const srColor = srPct >= 70 ? 'green' : srPct >= 40 ? 'amber' : 'red';
  const drColor = drPct >= 70 ? 'green' : drPct >= 40 ? 'amber' : 'red';

  setMiniBar('bar-ef', efPct, efColor, `${p.emergencyFundMonths.toFixed(1)} mo`);
  setMiniBar('bar-sr', srPct, srColor, `${p.savingsRate.toFixed(0)}%`);
  setMiniBar('bar-dr', drPct, drColor, `${p.debtRatio.toFixed(0)}%`);
}

function setMiniBar(id, pct, colorClass, label) {
  const fill = $(`#${id}-fill`);
  const val  = $(`#${id}-val`);
  if (fill) { fill.style.width = `${pct}%`; fill.className = `mini-bar-fill ${colorClass}`; }
  if (val)  val.textContent = label;
}

// ─── Charts ───────────────────────────────────────────────────────────────────
const CHART_DEFAULTS = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { enabled: true } },
};

function destroyChart(key) {
  if (state.charts[key]) { state.charts[key].destroy(); delete state.charts[key]; }
}

function renderCashFlowChart(proj) {
  destroyChart('cashflow');
  const ctx = $('#chart-cashflow')?.getContext('2d');
  if (!ctx) return;
  state.charts.cashflow = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: proj.map(m => m.label),
      datasets: [
        {
          label: 'Income',
          data: proj.map(m => m.income),
          backgroundColor: 'rgba(79,142,255,0.6)',
          borderRadius: 5,
          borderSkipped: false,
        },
        {
          label: 'Expenses',
          data: proj.map(m => m.expenses),
          backgroundColor: 'rgba(239,68,68,0.5)',
          borderRadius: 5,
          borderSkipped: false,
        },
      ],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        x: { grid: { color: 'rgba(80,130,255,0.06)' }, ticks: { color: '#4a5f80', font: { size: 10 } } },
        y: { grid: { color: 'rgba(80,130,255,0.06)' }, ticks: { color: '#4a5f80', font: { size: 10 }, callback: v => '₹' + fmtNum(v / 1000) + 'k' } },
      },
      plugins: {
        ...CHART_DEFAULTS.plugins,
        legend: { display: true, labels: { color: '#8ba3cc', font: { size: 11 }, boxWidth: 10 } },
        tooltip: { callbacks: { label: c => `  ${c.dataset.label}: ${fmt(c.parsed.y)}` } },
      },
    },
  });
}

function renderExpenseDonut(p) {
  destroyChart('donut');
  const ctx = $('#chart-donut')?.getContext('2d');
  if (!ctx) return;
  const labels  = p.expenses.map(e => e.name);
  const data    = p.expenses.map(e => e.amount);
  if (p.totalDebtEMI > 0) { labels.push('Debt EMI'); data.push(p.totalDebtEMI); }

  const colors = ['#4f8eff','#7c6aff','#00d4b4','#22c55e','#f59e0b','#ef4444','#06b6d4','#a855f7'];

  state.charts.donut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors.slice(0, data.length), borderWidth: 0, hoverOffset: 8 }],
    },
    options: {
      ...CHART_DEFAULTS,
      cutout: '68%',
      plugins: {
        legend: { display: true, position: 'right', labels: { color: '#8ba3cc', font: { size: 10 }, boxWidth: 10, padding: 10 } },
        tooltip: { callbacks: { label: c => `  ${c.label}: ${fmt(c.parsed)}` } },
      },
    },
  });
}

function renderBalanceAreaChart(proj) {
  destroyChart('balance');
  const ctx = $('#chart-balance')?.getContext('2d');
  if (!ctx) return;
  const gradient = ctx.createLinearGradient(0, 0, 0, 260);
  gradient.addColorStop(0, 'rgba(79,142,255,0.3)');
  gradient.addColorStop(1, 'rgba(79,142,255,0.01)');

  state.charts.balance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: proj.map(m => m.label),
      datasets: [{
        label: 'Projected Balance',
        data: proj.map(m => m.balance),
        borderColor: '#4f8eff',
        backgroundColor: gradient,
        fill: true,
        tension: 0.45,
        pointBackgroundColor: '#4f8eff',
        pointRadius: 3,
        pointHoverRadius: 6,
        borderWidth: 2.5,
      }],
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        x: { grid: { color: 'rgba(80,130,255,0.06)' }, ticks: { color: '#4a5f80', font: { size: 10 } } },
        y: { grid: { color: 'rgba(80,130,255,0.06)' }, ticks: { color: '#4a5f80', font: { size: 10 }, callback: v => '₹' + fmtNum(v / 1000) + 'k' } },
      },
      plugins: {
        ...CHART_DEFAULTS.plugins,
        tooltip: { callbacks: { label: c => `  Balance: ${fmt(c.parsed.y)}` } },
      },
    },
  });
}

function renderScenarioCharts(scenarios) {
  scenarios.forEach(sc => {
    destroyChart(`sc-${sc.id}`);
    const ctx = $(`#chart-sc-${sc.id}`)?.getContext('2d');
    if (!ctx) return;
    const gradient = ctx.createLinearGradient(0, 0, 0, 110);
    const col = sc.risk.level === 'low' ? '34,197,94' : sc.risk.level === 'medium' ? '245,158,11' : '239,68,68';
    gradient.addColorStop(0, `rgba(${col},0.25)`);
    gradient.addColorStop(1, `rgba(${col},0.01)`);

    state.charts[`sc-${sc.id}`] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: sc.proj.map(m => m.label),
        datasets: [{
          data: sc.proj.map(m => m.balance),
          borderColor: `rgb(${col})`,
          backgroundColor: gradient,
          fill: true, tension: 0.45,
          pointRadius: 0, borderWidth: 2,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { x: { display: false }, y: { display: false } },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        animation: { duration: 800 },
      },
    });
  });
}

// ─── Cash Flow Table ──────────────────────────────────────────────────────────
function renderCFTable(proj) {
  const tbody = $('#cf-tbody');
  if (!tbody) return;
  tbody.innerHTML = proj.map(m => `
    <tr>
      <td>${m.label}</td>
      <td class="td-positive">${fmt(m.income)}</td>
      <td class="td-negative">${fmt(m.expenses)}</td>
      <td class="${m.net >= 0 ? 'td-positive' : 'td-negative'}">${fmt(m.net)}</td>
      <td class="${m.balance >= 0 ? 'td-neutral' : 'td-negative'} font-bold">${fmt(m.balance)}</td>
      <td class="${m.efCoverage >= 6 ? 'td-positive' : m.efCoverage >= 3 ? 'text-amber' : 'td-negative'}">
        ${m.efCoverage >= 99 ? '∞' : m.efCoverage + ' mo'}
      </td>
    </tr>
  `).join('');
}

// ─── Insights ─────────────────────────────────────────────────────────────────
function renderInsights(p, proj, health) {
  const list = $('#insight-list');
  if (!list) return;

  const insights = [];

  if (p.emergencyFundMonths < 3) {
    insights.push({ icon: '🚨', text: `<strong>Critical:</strong> Your emergency fund covers only <strong>${p.emergencyFundMonths.toFixed(1)} months</strong> of expenses. The recommended minimum is 3–6 months. Build this before making any large purchases.` });
  } else if (p.emergencyFundMonths < 6) {
    insights.push({ icon: '⚠️', text: `<strong>Alert:</strong> Emergency fund covers <strong>${p.emergencyFundMonths.toFixed(1)} months</strong>. Aim for at least 6 months for a safety cushion.` });
  } else {
    insights.push({ icon: '✅', text: `<strong>Well done!</strong> Your emergency fund covers <strong>${p.emergencyFundMonths.toFixed(1)} months</strong> of expenses — you're in a healthy position.` });
  }

  if (p.savingsRate < 10) {
    insights.push({ icon: '📉', text: `<strong>Low savings rate</strong> of <strong>${p.savingsRate.toFixed(1)}%</strong>. Try to reach 15–20% to build long-term wealth. Consider reducing discretionary spending.` });
  } else if (p.savingsRate > 20) {
    insights.push({ icon: '🌟', text: `<strong>Excellent savings rate</strong> of <strong>${p.savingsRate.toFixed(1)}%</strong>. You're saving well above the recommended 15%, giving you solid financial resilience.` });
  } else {
    insights.push({ icon: '💡', text: `<strong>Healthy savings rate</strong> of <strong>${p.savingsRate.toFixed(1)}%</strong>. You're on track — keep pushing toward 20%+ for even greater security.` });
  }

  if (p.debtRatio > 40) {
    insights.push({ icon: '⚠️', text: `<strong>High debt load:</strong> EMIs consume <strong>${p.debtRatio.toFixed(1)}%</strong> of income (safe limit is 30%). Prioritise paying down existing debts before taking new ones.` });
  } else if (p.debtRatio > 0) {
    insights.push({ icon: '📊', text: `<strong>Debt-to-income ratio</strong> is <strong>${p.debtRatio.toFixed(1)}%</strong> — within the acceptable range. Keep monitoring as you take on new commitments.` });
  }

  const negMonths = proj.filter(m => m.balance < 0).length;
  if (negMonths > 0) {
    insights.push({ icon: '🔴', text: `<strong>Warning:</strong> Your projected balance goes <strong>negative in ${negMonths} month(s)</strong> over the next year. You need to either increase income or cut expenses to avoid overdraft.` });
  } else {
    const endBalance = proj[11]?.balance ?? 0;
    insights.push({ icon: '📈', text: `<strong>Positive trajectory:</strong> Your savings balance is projected to reach <strong>${fmt(endBalance)}</strong> in 12 months, assuming steady income and expenses.` });
  }

  if (p.incomeGrowthPct > 0) {
    insights.push({ icon: '🚀', text: `Factoring in your <strong>${p.incomeGrowthPct}% annual income growth</strong>, your purchasing power improves over time. This gives you more flexibility for medium-term goals.` });
  }

  list.innerHTML = insights.map(i => `
    <div class="insight-item">
      <span class="insight-icon">${i.icon}</span>
      <span class="insight-text">${i.text}</span>
    </div>
  `).join('');
}

// ─── Purchase Planner ─────────────────────────────────────────────────────────
function prefillPurchasePlanner(p) {
  const nameEl = $('#purchase-name');
  if (nameEl && p.goalName) nameEl.value = p.goalName;
  const amtEl = $('#purchase-amount');
  if (amtEl && p.goalAmount) amtEl.value = p.goalAmount;
  const moEl = $('#purchase-months');
  if (moEl && p.goalMonths) moEl.value = p.goalMonths;
}

function analyzePurchase() {
  const name      = $('#purchase-name').value.trim()          || 'Goal';
  const amount    = parseFloat($('#purchase-amount').value)   || 0;
  const months    = parseInt($('#purchase-months').value)     || 12;
  const emiRate   = parseFloat($('#purchase-emi-rate').value) || 12;
  const emiMonths = parseInt($('#purchase-emi-months').value) || 12;

  if (amount <= 0) { toast('Enter the purchase amount', 'error'); return; }
  if (amount > state.profile.savingsBalance * 50) {
    toast('Amount seems unusually large — please double-check', 'warning');
  }

  state.purchaseGoal = { name, amount, months, emiRate, emiMonths };
  const scenarios = runScenarios(state.purchaseGoal);
  renderScenarios(scenarios);
  renderAdvisor(scenarios, state.profile);
  toast(`Analyzing ${name}…`, 'info');

  // Scroll to results
  setTimeout(() => $('#scenarios-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
}

// ─── Scenario Renderer ────────────────────────────────────────────────────────
function renderScenarios(scenarios) {
  const container = $('#scenarios-section');
  if (!container) return;
  container.classList.remove('hidden');

  // Sort: best score first
  const sorted = [...scenarios].sort((a, b) => b.risk.score - a.risk.score);
  const bestId = sorted[0].id;

  const grid = $('#scenarios-grid');
  grid.innerHTML = scenarios.map(sc => {
    const isRec  = sc.id === bestId;
    const cls    = isRec ? 'recommended' : sc.risk.level === 'high' ? 'risky' : 'moderate';
    const badge  = isRec ? '✅ Recommended' : sc.risk.level === 'high' ? '⚠️ High Risk' : '⚡ Alternative';
    const badgeCls = isRec ? '' : sc.risk.level === 'high' ? 'risky' : 'moderate';

    return `
      <div class="scenario-card ${cls}">
        <div class="scenario-badge ${badgeCls}">${badge}</div>
        <div class="scenario-title">${sc.title}</div>
        <div class="scenario-desc">${sc.desc}</div>

        <div style="height:110px; margin-bottom:1rem;">
          <canvas id="chart-sc-${sc.id}"></canvas>
        </div>

        <div class="scenario-metrics">
          <div class="scenario-metric">
            <span class="scenario-metric-label">Monthly Cost</span>
            <span class="scenario-metric-val ${sc.monthlyCost === 0 ? 'blue' : 'amber'}">
              ${sc.monthlyCost === 0 ? 'None' : fmt(sc.monthlyCost)}
            </span>
          </div>
          <div class="scenario-metric">
            <span class="scenario-metric-label">Total Cost</span>
            <span class="scenario-metric-val">${fmt(sc.totalCost)}</span>
          </div>
          ${sc.interest ? `
          <div class="scenario-metric">
            <span class="scenario-metric-label">Total Interest</span>
            <span class="scenario-metric-val red">${fmt(sc.interest)}</span>
          </div>` : ''}
          ${sc.deferMonths ? `
          <div class="scenario-metric">
            <span class="scenario-metric-label">Months to Buy</span>
            <span class="scenario-metric-val amber">${sc.deferMonths} mo</span>
          </div>` : ''}
          <div class="scenario-metric">
            <span class="scenario-metric-label">Balance After</span>
            <span class="scenario-metric-val ${sc.balanceAfter >= 0 ? 'green' : 'red'}">
              ${fmt(sc.balanceAfter)}
            </span>
          </div>
          <div class="scenario-metric">
            <span class="scenario-metric-label">12-Month Balance</span>
            <span class="scenario-metric-val ${(sc.projectedBalance12 ?? 0) >= 0 ? 'blue' : 'red'}">
              ${fmt(sc.projectedBalance12 ?? 0)}
            </span>
          </div>
          <div class="scenario-metric">
            <span class="scenario-metric-label">Emergency Fund</span>
            <span class="scenario-metric-val ${sc.efMonthsAfter >= 6 ? 'green' : sc.efMonthsAfter >= 3 ? 'amber' : 'red'}">
              ${sc.efMonthsAfter >= 99 ? '∞' : sc.efMonthsAfter.toFixed(1) + ' mo'}
            </span>
          </div>
        </div>

        <div class="risk-meter">
          <div class="risk-label">
            <span>Safety Score</span>
            <span>${sc.risk.score}/100 — ${sc.risk.label}</span>
          </div>
          <div class="risk-track">
            <div class="risk-fill ${sc.risk.level}" style="width:${sc.risk.score}%"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Render mini sparkline charts after DOM update
  setTimeout(() => renderScenarioCharts(scenarios), 50);
}

// ─── AI Advisor ───────────────────────────────────────────────────────────────
function renderAdvisor(scenarios, p) {
  const panel = $('#advisor-panel');
  if (!panel) return;
  panel.classList.remove('hidden');

  const sorted  = [...scenarios].sort((a, b) => b.risk.score - a.risk.score);
  const best    = sorted[0];
  const worst   = sorted[sorted.length - 1];
  const goal    = state.purchaseGoal;

  // ── Build personalized reasoning ──
  const bullets = [];

  // Emergency fund check
  if (p.emergencyFundMonths < 3) {
    bullets.push(`🚨 Your emergency fund is critically low at <strong>${p.emergencyFundMonths.toFixed(1)} months</strong>. Making a large purchase now poses serious risk — an unexpected expense could leave you financially exposed.`);
  } else if (p.emergencyFundMonths < 6) {
    bullets.push(`⚠️ Emergency fund covers only <strong>${p.emergencyFundMonths.toFixed(1)} months</strong>. A large upfront payment would weaken this safety net.`);
  }

  // Lump sum viability
  const lump = scenarios.find(s => s.id === 'lump-sum');
  if (lump && lump.balanceAfter < 0) {
    bullets.push(`💳 <strong>Lump Sum is not viable</strong> — paying ${fmt(goal.amount)} upfront would leave your savings at <strong>${fmt(lump.balanceAfter)}</strong>, a negative balance.`);
  } else if (lump && lump.balanceAfter < p.totalExpenses * 2) {
    bullets.push(`💳 Lump sum would drain most of your savings, leaving only <strong>${fmt(lump.balanceAfter)}</strong> — below 2 months of expenses.`);
  }

  // EMI viability
  const emi = scenarios.find(s => s.id === 'emi');
  if (emi && p.debtRatio + (emi.monthlyCost / p.incomeMonthly * 100) > 50) {
    bullets.push(`📅 Adding an EMI of <strong>${fmt(emi.monthlyCost)}/month</strong> would push your debt-to-income ratio above 50% — a financially stressful level.`);
  }

  // Defer viability
  const defer = scenarios.find(s => s.id === 'defer');
  if (defer && defer.shortfall > 0) {
    bullets.push(`⏳ Deferring the purchase by <strong>${defer.deferMonths} months</strong> lets you save up and avoid interest costs entirely, though it requires patience.`);
  }

  // Income growth consideration
  if (p.incomeGrowthPct > 5) {
    bullets.push(`📈 With a <strong>${p.incomeGrowthPct}% annual income growth</strong>, your affordability improves over time — deferring may cost less in real terms.`);
  }

  // Risk tolerance nuance
  const rtMessages = {
    conservative: 'Given your <strong>conservative risk profile</strong>, I prioritize options that preserve emergency reserves above all else.',
    moderate: 'With a <strong>moderate risk tolerance</strong>, I balance cost efficiency with financial safety.',
    aggressive: 'Your <strong>aggressive stance</strong> allows for more flexibility, but I still flag scenarios that threaten your safety net.',
  };
  bullets.push(rtMessages[p.riskTolerance] || rtMessages.moderate);

  // ── Build recommendation text ──
  let recText = '';
  if (best.id === 'defer') {
    recText = `<strong>Save First, Buy Later.</strong> Given your current financial position, I recommend deferring the purchase of <strong>${goal.name}</strong> by approximately <strong>${best.deferMonths} months</strong>. This avoids both interest costs and emergency-fund depletion. Set aside a dedicated savings target each month and purchase once you've comfortably reached ${fmt(goal.amount)}.`;
  } else if (best.id === 'emi') {
    recText = `<strong>Structured EMI Plan.</strong> An EMI of <strong>${fmt(emi?.monthlyCost ?? 0)}/month</strong> over <strong>${emi?.emiMonths ?? 12} months</strong> is your safest path. It preserves your savings buffer while keeping monthly outflows manageable. Ensure your emergency fund remains above 3 months before proceeding.`;
  } else {
    recText = `<strong>Lump Sum Payment.</strong> Your savings are robust enough to absorb this purchase. Paying upfront avoids interest entirely. Post-purchase, your balance of <strong>${fmt(best.balanceAfter)}</strong> still covers <strong>${fmt(best.efMonthsAfter)} months</strong> of expenses — a healthy buffer.`;
  }

  // ── Safety conditions ──
  const conditions = [];
  if (p.emergencyFundMonths < 6) conditions.push(`Build emergency fund to at least 6 months of expenses (${fmt(p.totalExpenses * 6)}) first.`);
  if (p.savingsRate < 10) conditions.push('Increase your savings rate to at least 10% before major purchases.');
  if (p.debtRatio > 35) conditions.push('Pay down existing debts to reduce your EMI burden before adding new loans.');

  const conditionsHTML = conditions.length
    ? `<div style="margin-top:1rem; padding:1rem; background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.25); border-radius:10px;">
        <div style="font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.07em; color:#f59e0b; margin-bottom:0.5rem;">⚠️ Pre-conditions to meet first</div>
        <ul style="padding-left:1.25rem; color:#8ba3cc; font-size:0.84rem; line-height:1.8;">
          ${conditions.map(c => `<li>${c}</li>`).join('')}
        </ul>
      </div>`
    : '';

  $('#advisor-reasoning').innerHTML = bullets.map(b => `
    <div class="insight-item" style="margin-bottom:0.5rem;">
      <span class="insight-text">${b}</span>
    </div>
  `).join('');

  $('#advisor-rec-text').innerHTML = recText;
  $('#advisor-conditions').innerHTML = conditionsHTML;
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
function switchTab(btn) {
  const tabId = btn.dataset.tab;
  const group = btn.dataset.group;
  // find all sibling tab-btns and panels belonging to the same group
  const btns   = document.querySelectorAll(`.tab-btn[data-group="${group}"]`);
  const panels = document.querySelectorAll('.tab-panel');
  btns.forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  // only toggle panels that are in the same group (identified by matching tab ids)
  const groupTabIds = [...btns].map(b => b.dataset.tab);
  panels.forEach(p => {
    if (groupTabIds.includes(p.id)) {
      p.classList.toggle('active', p.id === tabId);
    }
  });
}

// ─── Reset ────────────────────────────────────────────────────────────────────
function resetApp() {
  Object.keys(state.charts).forEach(k => { state.charts[k]?.destroy(); delete state.charts[k]; });
  state.profile = {}; state.projection = []; state.scenarios = []; state.purchaseGoal = null;
  wizardStep = 0;
  showView('welcome');
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  showView('welcome');

  // Welcome CTA
  $('#btn-start')?.addEventListener('click', () => {
    showView('wizard');
    initWizard();
  });

  // Wizard navigation
  $('#btn-next')?.addEventListener('click', wizardNext);
  $('#btn-prev')?.addEventListener('click', wizardPrev);

  // Add row buttons
  $('#btn-add-expense')?.addEventListener('click', () => addExpenseRow());
  $('#btn-add-debt')?.addEventListener('click', addDebtRow);

  // Dashboard tabs
  document.querySelectorAll('.tab-btn[data-group]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn));
  });

  // Purchase analyzer
  $('#btn-analyze-purchase')?.addEventListener('click', analyzePurchase);

  // Reset
  $('#btn-reset')?.addEventListener('click', resetApp);

  // Income growth slider label
  const growthSlider = $('#income-growth');
  const growthLabel  = $('#income-growth-label');
  growthSlider?.addEventListener('input', () => {
    if (growthLabel) growthLabel.textContent = `${growthSlider.value}%`;
  });

  // Emergency months slider label
  const efSlider = $('#emergency-months');
  const efLabel  = $('#emergency-months-label');
  efSlider?.addEventListener('input', () => {
    if (efLabel) efLabel.textContent = `${efSlider.value} months`;
  });

  // EMI months slider
  const emiSlider = $('#purchase-emi-months');
  const emiLabel  = $('#emi-months-label');
  emiSlider?.addEventListener('input', () => {
    if (emiLabel) emiLabel.textContent = `${emiSlider.value} months`;
  });
});
