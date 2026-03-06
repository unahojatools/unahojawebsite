(function () {
  'use strict';
  const rules = window.taxRules2026;
  const $ = (id) => document.getElementById(id);
  const currency = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
  const currency0 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const pct2 = new Intl.NumberFormat('es-ES', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const fmtMoney = (n) => Number.isFinite(n) ? currency.format(n) : '—';
  const fmtMoney0 = (n) => Number.isFinite(n) ? currency0.format(n) : '—';
  const fmtPct = (n) => Number.isFinite(n) ? pct2.format(n) : '—';
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  function getNumber(id, fallback = 0) {
    const el = $(id);
    if (!el) return fallback;
    const v = Number(String(el.value).replace(',', '.'));
    return Number.isFinite(v) ? v : fallback;
  }
  function getBool(id) { return !!$(id)?.checked; }
  function getMode() { return document.querySelector('input[name="sn-mode"]:checked')?.value || 'simple'; }
  function getTerritoryRules(name) { return rules.territories[name] || rules.territories['Comunidad de Madrid']; }
  function getMonthlyBase(grossAnnual, pays) { return round2(grossAnnual / pays); }

  function getContributionRates(contractType) {
    return {
      worker: {
        commonContingencies: rules.socialSecurity.worker.commonContingencies,
        unemployment: contractType === 'temporary' ? rules.socialSecurity.worker.unemploymentTemporary : rules.socialSecurity.worker.unemploymentIndefinite,
        training: rules.socialSecurity.worker.training,
        mei: rules.socialSecurity.worker.mei
      },
      employer: {
        commonContingencies: rules.socialSecurity.employer.commonContingencies,
        unemployment: contractType === 'temporary' ? rules.socialSecurity.employer.unemploymentTemporary : rules.socialSecurity.employer.unemploymentIndefinite,
        training: rules.socialSecurity.employer.training,
        fogasa: rules.socialSecurity.employer.fogasa,
        mei: rules.socialSecurity.employer.mei,
        accidents: rules.socialSecurity.employer.accidentsDefault
      }
    };
  }

  function computeSolidarity(monthlyGross) {
    let worker = 0, employer = 0;
    for (const tier of rules.socialSecurity.solidarity) {
      const amount = Math.max(0, Math.min(monthlyGross, tier.to) - tier.from);
      if (amount > 0) {
        worker += amount * tier.worker;
        employer += amount * tier.employer;
      }
    }
    return { worker: round2(worker), employer: round2(employer) };
  }

  function computeSocialSecurity(input) {
    const monthlyGross = getMonthlyBase(input.grossAnnual, input.pays);
    const cappedBase = Math.min(monthlyGross, rules.socialSecurity.maxMonthlyBase);
    const rates = getContributionRates(input.contractType);
    const solidarity = computeSolidarity(monthlyGross);
    const workerMonthly = {
      commonContingencies: round2(cappedBase * rates.worker.commonContingencies),
      unemployment: round2(cappedBase * rates.worker.unemployment),
      training: round2(cappedBase * rates.worker.training),
      mei: round2(cappedBase * rates.worker.mei),
      solidarity: solidarity.worker
    };
    const employerMonthly = {
      commonContingencies: round2(cappedBase * rates.employer.commonContingencies),
      unemployment: round2(cappedBase * rates.employer.unemployment),
      training: round2(cappedBase * rates.employer.training),
      fogasa: round2(cappedBase * rates.employer.fogasa),
      mei: round2(cappedBase * rates.employer.mei),
      accidents: round2(cappedBase * rates.employer.accidents),
      solidarity: solidarity.employer
    };
    const totalWorkerMonthly = Object.values(workerMonthly).reduce((a, b) => a + b, 0);
    const totalEmployerMonthly = Object.values(employerMonthly).reduce((a, b) => a + b, 0);
    return {
      monthlyGross, cappedBase, workerMonthly, employerMonthly,
      workerAnnual: round2(totalWorkerMonthly * input.pays),
      employerAnnual: round2(totalEmployerMonthly * input.pays),
      totalWorkerMonthly: round2(totalWorkerMonthly),
      totalEmployerMonthly: round2(totalEmployerMonthly)
    };
  }

  function computeWorkIncomeReduction(netWorkIncome) {
    const r = rules.workIncomeReduction;
    if (netWorkIncome <= r.lowIncomeThreshold1) return round2(r.maxReduction);
    if (netWorkIncome <= r.lowIncomeThreshold2) return round2(Math.max(r.baseGeneral, r.maxReduction - ((netWorkIncome - r.lowIncomeThreshold1) / r.taperDivisor)));
    return round2(r.baseGeneral);
  }

  function computeFamilyMinimums(input) {
    const m = rules.personalMinimums;
    let taxpayer = m.taxpayer.under65;
    if (input.age >= 75) taxpayer = m.taxpayer.over75;
    else if (input.age >= 65) taxpayer = m.taxpayer.over65;
    let taxpayerDisability = 0;
    if (input.taxpayerDisability === '33') taxpayerDisability = m.disability.taxpayer33;
    if (input.taxpayerDisability === '65') taxpayerDisability = m.disability.taxpayer65;
    if (input.taxpayerDisability === 'assistance') taxpayerDisability = m.disability.taxpayer65 + m.disability.assistanceExtra;
    let descendants = 0;
    input.children.forEach((child, idx) => {
      descendants += m.descendants[Math.min(idx, m.descendants.length - 1)];
      if (child.under3) descendants += m.descendantUnder3Extra;
      if (child.disability >= 65) descendants += m.disability.family65;
      else if (child.disability >= 33) descendants += m.disability.family33;
    });
    let ascendants = 0;
    input.ascendants.forEach((asc) => {
      if (asc.age >= 65) {
        ascendants += m.ascendant.over65;
        if (asc.age >= 75) ascendants += m.ascendant.over75Extra;
      }
      if (asc.disability >= 65) ascendants += m.disability.family65;
      else if (asc.disability >= 33) ascendants += m.disability.family33;
    });
    const spouse = input.spouseDependent && input.spouseIncome < 8000 ? m.spouseNoIncome : 0;
    return { taxpayer, taxpayerDisability, descendants, ascendants, spouse, total: taxpayer + taxpayerDisability + descendants + ascendants + spouse };
  }

  function applyScale(base, stateScale, autonomousScale) {
    let previous = 0, stateQuota = 0, autonomousQuota = 0, marginalRate = 0;
    for (let i = 0; i < stateScale.length; i += 1) {
      const upper = stateScale[i].upTo;
      const stateRate = stateScale[i].rate;
      const autoRate = autonomousScale[Math.min(i, autonomousScale.length - 1)];
      const taxable = Math.max(0, Math.min(base, upper) - previous);
      if (taxable > 0) {
        stateQuota += taxable * stateRate;
        autonomousQuota += taxable * autoRate;
        marginalRate = stateRate + autoRate;
      }
      if (base <= upper) break;
      previous = upper;
    }
    return { stateQuota: round2(stateQuota), autonomousQuota: round2(autonomousQuota), totalQuota: round2(stateQuota + autonomousQuota), marginalRate };
  }

  function computeIRPF(input, ss) {
    const territory = getTerritoryRules(input.territory);
    const netBeforeReduction = round2(input.grossAnnual - ss.workerAnnual);
    const workReduction = computeWorkIncomeReduction(netBeforeReduction);
    const netWorkIncome = round2(Math.max(0, netBeforeReduction - workReduction));
    const minimums = computeFamilyMinimums(input);
    const taxableGeneralBase = round2(Math.max(0, netWorkIncome - minimums.total));
    const quota = applyScale(taxableGeneralBase, rules.stateScale, territory.autonomousScale);
    let retention = quota.totalQuota;
    if (territory.ceutaMelillaDeduction > 0) retention *= (1 - territory.ceutaMelillaDeduction);
    if (input.multiPayer) retention *= 1.03;
    return {
      territory, netBeforeReduction, workReduction, netWorkIncome, minimums, taxableGeneralBase,
      stateQuota: quota.stateQuota, autonomousQuota: quota.autonomousQuota,
      retentionAnnual: round2(retention), retentionMonthly: round2(retention / input.pays),
      effectiveRate: input.grossAnnual > 0 ? retention / input.grossAnnual : 0,
      marginalRate: quota.marginalRate
    };
  }

  function buildExplanation(r) {
    const pieces = [];
    pieces.push(`Con un bruto anual de ${fmtMoney0(r.input.grossAnnual)} en ${r.input.pays} pagas, el neto estimado se sitúa en ${fmtMoney0(r.annualNet)} al año y ${fmtMoney(r.monthlyNet)} por paga.`);
    pieces.push(`La cotización del trabajador ronda ${fmtMoney0(r.ss.workerAnnual)} al año y la retención IRPF estimada ${fmtMoney0(r.irpf.retentionAnnual)}.`);
    pieces.push(`El tipo efectivo de retención es ${fmtPct(r.irpf.effectiveRate)} y el tipo marginal aproximado ${fmtPct(r.irpf.marginalRate)}.`);
    pieces.push(`El coste empresa estimado asciende a ${fmtMoney0(r.employerCostAnnual)} anuales.`);
    if (r.irpf.territory.regime === 'foral') pieces.push('Para Navarra y País Vasco conviene revisar la norma foral exacta antes de usar el resultado con finalidad contractual o contable.');
    return pieces.join(' ');
  }

  function computeResult(input) {
    const ss = computeSocialSecurity(input);
    const irpf = computeIRPF(input, ss);
    const annualNet = round2(input.grossAnnual - ss.workerAnnual - irpf.retentionAnnual);
    const monthlyNet = round2(annualNet / input.pays);
    const grossMonthly = round2(input.grossAnnual / input.pays);
    const employerCostAnnual = round2(input.grossAnnual + ss.employerAnnual);
    return { input, ss, irpf, grossAnnual: input.grossAnnual, grossMonthly, annualNet, monthlyNet, employerCostAnnual, employerCostMonthly: round2(employerCostAnnual / input.pays), explanation: buildExplanation({ input, ss, irpf, annualNet, monthlyNet, employerCostAnnual }) };
  }

  function buildNominaModel(result) {
    const periodMonth = $('sn-payroll-month')?.value || '03';
    const periodYear = $('sn-payroll-year')?.value || '2026';
    const monthlyGross = round2(result.grossAnnual / result.input.pays);
    const prorata = result.input.pays === 12 ? round2((result.grossAnnual / 14) * 2 / 12) : 0;
    const salaryBase = round2(monthlyGross - prorata - (result.input.variableAnnual / result.input.pays));
    const variable = round2(result.input.variableAnnual / result.input.pays);
    const devengos = [
      { code: '001', units: '30', price: round2(salaryBase / 30), concept: 'Salario base', amount: salaryBase },
      { code: '020', units: '1', price: prorata, concept: 'Prorrata pagas extra', amount: prorata },
      { code: '030', units: '1', price: variable, concept: 'Bonus / variable', amount: variable }
    ].filter((i) => i.amount > 0.009);
    const deductions = [
      { code: '501', concept: 'Contingencias comunes', amount: result.ss.workerMonthly.commonContingencies },
      { code: '502', concept: 'Desempleo', amount: result.ss.workerMonthly.unemployment },
      { code: '503', concept: 'Formación profesional', amount: result.ss.workerMonthly.training },
      { code: '504', concept: 'MEI', amount: result.ss.workerMonthly.mei },
      { code: '505', concept: 'Solidaridad adicional', amount: result.ss.workerMonthly.solidarity },
      { code: '601', concept: 'Retención IRPF', amount: result.irpf.retentionMonthly }
    ].filter((i) => i.amount > 0.009);
    const totalDev = round2(devengos.reduce((a, b) => a + b.amount, 0));
    const totalDed = round2(deductions.reduce((a, b) => a + b.amount, 0));
    const liquid = round2(totalDev - totalDed);
    return {
      periodLabel: `${periodMonth}/${periodYear}`,
      issueDate: new Date().toLocaleDateString('es-ES'),
      companyName: $('sn-company-name')?.value || 'Empresa simulada, S.L.',
      companyCif: $('sn-company-cif')?.value || 'B00000000',
      companyAddress: $('sn-company-address')?.value || 'Calle Ejemplo 1, Madrid',
      ccc: $('sn-company-ccc')?.value || '01112222333344445555',
      workerName: $('sn-worker-name')?.value || 'Trabajador/a simulación',
      workerNif: $('sn-worker-nif')?.value || '00000000T',
      workerAddress: $('sn-worker-address')?.value || 'Dirección no informada',
      workerSs: $('sn-worker-ss')?.value || '00/0000000000',
      category: $('sn-worker-category')?.value || 'Técnico/a',
      employeeCode: $('sn-worker-code')?.value || 'EMP-001',
      department: $('sn-worker-department')?.value || 'General',
      position: $('sn-worker-position')?.value || 'Puesto administrativo',
      iban: $('sn-worker-iban')?.value || 'ES00 0000 0000 0000 0000 0000',
      swift: $('sn-worker-swift')?.value || '',
      days: 30,
      devengos, deductions, totalDev, totalDed, liquid,
      employerTable: [
        { concept: 'Contingencias comunes', base: result.ss.cappedBase, workerRate: 4.70, workerAmt: result.ss.workerMonthly.commonContingencies, employerRate: 23.60, employerAmt: result.ss.employerMonthly.commonContingencies },
        { concept: 'MEI', base: result.ss.cappedBase, workerRate: 0.13, workerAmt: result.ss.workerMonthly.mei, employerRate: 0.67, employerAmt: result.ss.employerMonthly.mei },
        { concept: 'Desempleo', base: result.ss.cappedBase, workerRate: result.input.contractType === 'temporary' ? 1.60 : 1.55, workerAmt: result.ss.workerMonthly.unemployment, employerRate: result.input.contractType === 'temporary' ? 6.70 : 5.50, employerAmt: result.ss.employerMonthly.unemployment },
        { concept: 'Formación profesional', base: result.ss.cappedBase, workerRate: 0.10, workerAmt: result.ss.workerMonthly.training, employerRate: 0.60, employerAmt: result.ss.employerMonthly.training },
        { concept: 'FOGASA', base: result.ss.cappedBase, workerRate: 0, workerAmt: 0, employerRate: 0.20, employerAmt: result.ss.employerMonthly.fogasa },
        { concept: 'AT y EP (genérico)', base: result.ss.cappedBase, workerRate: 0, workerAmt: 0, employerRate: 1.50, employerAmt: result.ss.employerMonthly.accidents },
        { concept: 'Solidaridad adicional', base: result.grossMonthly, workerRate: '', workerAmt: result.ss.workerMonthly.solidarity, employerRate: '', employerAmt: result.ss.employerMonthly.solidarity }
      ],
      bases: { employerCost: result.employerCostMonthly },
      legalNote: 'Documento generado automáticamente como simulación orientativa. Debe ser revisado antes de su uso laboral o contable.'
    };
  }

  function renderNomina(model) {
    const host = $('sn-nomina-preview');
    if (!host) return;
    host.innerHTML = `
      <div class="nomina-sheet">
        <div class="nomina-head">
          <div><h3>Nómina</h3><p><strong>Empresa:</strong> ${model.companyName} · ${model.companyCif}</p><p><strong>Domicilio:</strong> ${model.companyAddress}</p><p><strong>CCC:</strong> ${model.ccc}</p></div>
          <div><p><strong>Periodo:</strong> ${model.periodLabel}</p><p><strong>Emisión:</strong> ${model.issueDate}</p><p><strong>Total días:</strong> ${model.days}</p></div>
        </div>
        <div class="nomina-meta">
          <div><strong>Trabajador:</strong> ${model.workerName}</div><div><strong>NIF:</strong> ${model.workerNif}</div><div><strong>Nº SS:</strong> ${model.workerSs}</div><div><strong>Categoría:</strong> ${model.category}</div><div><strong>Código:</strong> ${model.employeeCode}</div><div><strong>Puesto:</strong> ${model.position}</div><div><strong>Sección:</strong> ${model.department}</div><div><strong>Domicilio:</strong> ${model.workerAddress}</div>
        </div>
        <table class="table nomina-table"><thead><tr><th>Código</th><th>Unidades</th><th>Precio</th><th>Concepto</th><th>Devengos</th><th>Deducciones</th></tr></thead><tbody>
          ${model.devengos.map(i => `<tr><td>${i.code}</td><td>${i.units}</td><td>${fmtMoney(i.price)}</td><td>${i.concept}</td><td>${fmtMoney(i.amount)}</td><td></td></tr>`).join('')}
          ${model.deductions.map(i => `<tr><td>${i.code}</td><td></td><td></td><td>${i.concept}</td><td></td><td>${fmtMoney(i.amount)}</td></tr>`).join('')}
        </tbody></table>
        <div class="nomina-totals"><div><strong>Total devengado:</strong> ${fmtMoney(model.totalDev)}</div><div><strong>Total deducido:</strong> ${fmtMoney(model.totalDed)}</div><div class="liquido-box"><strong>Líquido a percibir:</strong> ${fmtMoney(model.liquid)}</div></div>
        <table class="table nomina-ss-table"><thead><tr><th>Concepto</th><th>Base</th><th>Tipo trab.</th><th>Aportación trab.</th><th>Tipo emp.</th><th>Aportación emp.</th></tr></thead><tbody>
          ${model.employerTable.map(r => `<tr><td>${r.concept}</td><td>${fmtMoney(r.base)}</td><td>${r.workerRate === '' ? '—' : r.workerRate + '%'}</td><td>${fmtMoney(r.workerAmt)}</td><td>${r.employerRate === '' ? '—' : r.employerRate + '%'}</td><td>${fmtMoney(r.employerAmt)}</td></tr>`).join('')}
        </tbody></table>
        <div class="nomina-foot"><p><strong>IBAN:</strong> ${model.iban}${model.swift ? ' · <strong>SWIFT:</strong> ' + model.swift : ''}</p><p><strong>Coste empresa estimado:</strong> ${fmtMoney(model.bases.employerCost)}</p><p class="small">${model.legalNote}</p></div>
      </div>`;
  }

  /* PRINT PDF*/
    function openPayrollPrintFrame(model) {
  const oldFrame = document.getElementById('sn-print-frame');
  if (oldFrame) oldFrame.remove();

  const frame = document.createElement('iframe');
  frame.id = 'sn-print-frame';
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.setAttribute('aria-hidden', 'true');
  document.body.appendChild(frame);

  const fmtMoney = (n) =>
    new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2
    }).format(Number(n || 0));

  const periodLabel =
    model.periodLabel || `${model.periodMonth || ''}/${model.periodYear || ''}`;

  const doc = frame.contentWindow.document;
doc.open();
doc.write(`<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Nómina ${periodLabel}</title>
  <style>
    @page { size: A4; margin: 12mm; }

    :root{
      --bg:#ffffff;
      --text:#0f172a;
      --muted:#475569;
      --line:#dbe2ea;
      --line-strong:#b8c4d3;
      --surface:#f8fafc;
      --surface-2:#eef2f7;
      --brand:#6d5efc;
      --brand-soft:#f1efff;
      --radius:14px;
      --radius-sm:10px;
      --shadow:none;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, "DM Sans", Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .sheet {
      width: 100%;
      margin: 0 auto;
    }

    .doc-topbar {
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:10px;
      margin-bottom:8px;
      padding-bottom:6px;
      border-bottom:1px solid var(--line);
    }

    .brand-wrap {
      display:flex;
      gap:12px;
      align-items:center;
    }

    .brand-mark {
      width:40px;
      height:40px;
      border-radius:12px;
      background: linear-gradient(135deg, var(--brand), #8b7fff);
      color:#fff;
      display:flex;
      align-items:center;
      justify-content:center;
      font-weight:800;
      font-size:18px;
    }

    .brand-copy .eyebrow {
      margin:0;
      font-size:11px;
      letter-spacing:.08em;
      text-transform:uppercase;
      color:var(--muted);
    }

    .brand-copy h1 {
      margin:2px 0 0;
      font-size:24px;
      line-height:1.05;
      font-weight:800;
    }

    .doc-badge {
      border:1px solid var(--line);
      background:var(--surface);
      border-radius:999px;
      padding:8px 12px;
      font-size:11px;
      color:var(--muted);
      white-space:nowrap;
    }

    .grid-2 {
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:12px;
    }

    .card {
      border:1px solid var(--line);
      background:var(--surface);
      border-radius:var(--radius);
      padding:12px 14px;
    }

    .card-title {
      margin:0 0 8px;
      font-size:12px;
      font-weight:800;
      text-transform:uppercase;
      letter-spacing:.05em;
      color:var(--muted);
    }

    .meta-list {
      display:grid;
      gap:5px;
      font-size:12px;
      line-height:1.35;
    }

    .meta-list strong {
      color:var(--text);
    }

    table {
      width:100%;
      border-collapse:separate;
      border-spacing:0;
      margin-top:12px;
      font-size:11px;
      border:1px solid var(--line);
      border-radius:14px;
      overflow:hidden;
    }

    thead th {
      background:var(--surface-2);
      color:var(--text);
      font-weight:700;
      text-align:left;
      padding:8px 9px;
      border-bottom:1px solid var(--line);
    }

    tbody td {
      padding:7px 9px;
      border-bottom:1px solid var(--line);
      vertical-align:top;
    }

    tbody tr:last-child td {
      border-bottom:none;
    }

    .summary {
      display:grid;
      grid-template-columns:1.1fr .9fr;
      gap:12px;
      margin-top:12px;
    }

    .totals-card {
      border:1px solid var(--line);
      background:var(--surface);
      border-radius:var(--radius);
      padding:12px 14px;
    }

    .totals-card p {
      margin:0 0 6px;
      font-size:12px;
    }

    .liquido {
      border:1px solid rgba(109,94,252,.22);
      background:var(--brand-soft);
      border-radius:18px;
      padding:18px;
      display:flex;
      flex-direction:column;
      justify-content:center;
      align-items:center;
      text-align:center;
    }

    .liquido .label {
      font-size:11px;
      text-transform:uppercase;
      letter-spacing:.08em;
      color:var(--muted);
      margin-bottom:8px;
    }

    .liquido .value {
      font-size:34px;
      line-height:1;
      font-weight:900;
      color:var(--text);
    }

    .footer {
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:12px;
      margin-top:12px;
    }

    .signature-wrap {
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:18px;
      align-items:end;
      padding:12px 0 0;
    }

    .signature {
      border-top:1.5px solid var(--line-strong);
      padding-top:8px;
      min-height:44px;
      text-align:center;
      font-size:12px;
      color:var(--text);
    }

    .legal {
      margin-top:14px;
      padding-top:10px;
      border-top:1px solid var(--line);
      font-size:10px;
      line-height:1.45;
      color:var(--muted);
    }

    .doc-footer {
      margin-top:8px;
      font-size:10px;
      color:var(--muted);
      text-align:right;
    }

    @media print {
      body { background:#fff; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="doc-topbar">
      <div class="brand-wrap">
          <h1>Recibo de salarios</h1>
        </div>
      </div>
      <div class="doc-badge">Simulación orientativa · ${periodLabel}</div>
    </div>

    <div class="grid-2">
      <div class="card">
        <p class="card-title">Empresa</p>
        <div class="meta-list">
          <div><strong>Empresa:</strong> ${model.companyName || ''}</div>
          <div><strong>CIF:</strong> ${model.companyCif || ''}</div>
          <div><strong>Domicilio:</strong> ${model.companyAddress || ''}</div>
          <div><strong>CCC:</strong> ${model.ccc || ''}</div>
        </div>
      </div>

      <div class="card">
        <p class="card-title">Liquidación</p>
        <div class="meta-list">
          <div><strong>Periodo:</strong> ${periodLabel}</div>
          <div><strong>Fecha emisión:</strong> ${model.issueDate || ''}</div>
          <div><strong>Localidad:</strong> ${model.locality || ''}</div>
          <div><strong>Total días:</strong> ${model.days || 30}</div>
        </div>
      </div>
    </div>

    <div class="grid-2" style="margin-top:12px;">
      <div class="card">
        <p class="card-title">Trabajador</p>
        <div class="meta-list">
          <div><strong>Trabajador:</strong> ${model.workerName || ''}</div>
          <div><strong>NIF:</strong> ${model.workerNif || ''}</div>
          <div><strong>Nº afiliación SS:</strong> ${model.workerSs || ''}</div>
          <div><strong>Categoría:</strong> ${model.category || ''}</div>
        </div>
      </div>

      <div class="card">
        <p class="card-title">Datos internos</p>
        <div class="meta-list">
          <div><strong>Nº matrícula:</strong> ${model.employeeCode || ''}</div>
          <div><strong>Sección:</strong> ${model.section || model.department || ''}</div>
          <div><strong>Puesto:</strong> ${model.position || ''}</div>
          <div><strong>Domicilio:</strong> ${model.workerAddress || ''}</div>
        </div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Código</th>
          <th>Unidades</th>
          <th>Precio</th>
          <th>Concepto</th>
          <th>Devengos</th>
          <th>Deducciones</th>
        </tr>
      </thead>
      <tbody>
        ${(model.devengos || []).map(i => `
          <tr>
            <td>${i.code || ''}</td>
            <td>${i.units ?? ''}</td>
            <td>${fmtMoney(i.price || 0)}</td>
            <td>${i.concept || ''}</td>
            <td>${fmtMoney(i.amount || 0)}</td>
            <td></td>
          </tr>
        `).join('')}
        ${(model.deductions || []).map(i => `
          <tr>
            <td>${i.code || ''}</td>
            <td></td>
            <td></td>
            <td>${i.concept || ''}</td>
            <td></td>
            <td>${fmtMoney(i.amount || 0)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="summary">
      <div class="totals-card">
        <p><strong>Percepciones salariales:</strong> ${fmtMoney(model.salaryPerceptions || 0)}</p>
        <p><strong>Percepciones no salariales:</strong> ${fmtMoney(model.nonsalaryPerceptions || 0)}</p>
        <p><strong>Base Seguridad Social:</strong> ${fmtMoney(model.ssBase || 0)}</p>
        <p><strong>Base AT y desempleo:</strong> ${fmtMoney(model.atBase || 0)}</p>
        <p><strong>Base IRPF:</strong> ${fmtMoney(model.irpfBase || 0)}</p>
        <p><strong>Total devengado:</strong> ${fmtMoney(model.totalDev || 0)}</p>
        <p><strong>Total deducido:</strong> ${fmtMoney(model.totalDed || 0)}</p>
      </div>

      <div class="liquido">
        <div class="label">Líquido a percibir</div>
        <div class="value">${fmtMoney(model.liquid || 0)}</div>
      </div>
    </div>

    ${(model.employerTable && model.employerTable.length) ? `
      <table>
        <thead>
          <tr>
            <th>Concepto</th>
            <th>Base</th>
            <th>Tipo trab.</th>
            <th>Aportación trab.</th>
            <th>Tipo emp.</th>
            <th>Aportación emp.</th>
          </tr>
        </thead>
        <tbody>
          ${model.employerTable.map(r => `
            <tr>
              <td>${r.concept || ''}</td>
              <td>${fmtMoney(r.base || 0)}</td>
              <td>${r.workerRate === '' ? '—' : `${r.workerRate || 0}%`}</td>
              <td>${fmtMoney(r.workerAmt || 0)}</td>
              <td>${r.employerRate === '' ? '—' : `${r.employerRate || 0}%`}</td>
              <td>${fmtMoney(r.employerAmt || 0)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : ''}

    <div class="footer">
      <div class="card">
        <p class="card-title">Pago y coste</p>
        <div class="meta-list">
          <div><strong>IBAN:</strong> ${model.iban || ''}</div>
          ${model.swift ? `<div><strong>SWIFT/BIC:</strong> ${model.swift}</div>` : ''}
          <div><strong>Coste empresa:</strong> ${fmtMoney(model.employerCost || (model.bases && model.bases.employerCost) || 0)}</div>
        </div>
      </div>

      <div class="signature-wrap">
        <div class="signature">Sello empresa</div>
        <div class="signature">Recibí</div>
      </div>
    </div>

    <div class="legal">
      ${model.legalNote || 'Documento generado automáticamente como simulación orientativa. Debe ser revisado antes de su uso laboral o contable.'}
    </div>

    <div class="doc-footer">unahojatools.com/sueldo-neto/</div>
  </div>
</body>
</html>`);
doc.close();

  frame.onload = () => {
    setTimeout(() => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    }, 300);
  };
}

function downloadNominaPdf(model) {
  openPayrollPrintFrame(model);
}

  

  function parseChildrenDetailed() {
    const total = Math.max(0, Math.round(getNumber('sn-children', 0)));
    const under3 = Math.max(0, Math.round(getNumber('sn-children-under3', 0)));
    const disability33 = Math.max(0, Math.round(getNumber('sn-children-disability-33', 0)));
    const disability65 = Math.max(0, Math.round(getNumber('sn-children-disability-65', 0)));
    return Array.from({ length: total }, (_, i) => ({ under3: i < under3, disability: i < disability65 ? 65 : (i < disability65 + disability33 ? 33 : 0) }));
  }
  function parseAscendantsDetailed() {
    const over65 = Math.max(0, Math.round(getNumber('sn-asc-over65', 0)));
    const over75 = Math.max(0, Math.round(getNumber('sn-asc-over75', 0)));
    const disability33 = Math.max(0, Math.round(getNumber('sn-asc-disability-33', 0)));
    const disability65 = Math.max(0, Math.round(getNumber('sn-asc-disability-65', 0)));
    const total = Math.max(over65, over75, disability33, disability65);
    return Array.from({ length: total }, (_, i) => ({ age: i < over75 ? 76 : 66, disability: i < disability65 ? 65 : (i < disability65 + disability33 ? 33 : 0) }));
  }

  function getFormData() {
    const mode = getMode();
    const grossAnnual = getNumber('sn-gross-annual', 0);
    const pays = Number(document.querySelector('input[name="sn-pays"]:checked')?.value || 14);
    const variableAnnual = getNumber('sn-variable-annual', 0);
    const kindAnnual = getNumber('sn-kind-annual', 0);
    const manualGrossMonthly = getNumber('sn-gross-monthly', 0);
    const annual = mode === 'advanced' && manualGrossMonthly > 0 ? round2((manualGrossMonthly * pays) + variableAnnual + kindAnnual) : round2(grossAnnual + variableAnnual + kindAnnual);
    return {
      mode, grossAnnual: annual, pays,
      territory: $('sn-territory')?.value || 'Comunidad de Madrid',
      maritalStatus: $('sn-marital-status')?.value || 'single',
      age: Math.max(18, Math.round(getNumber('sn-age', 35))),
      contractType: $('sn-contract-type')?.value || 'indefinite',
      spouseDependent: getBool('sn-spouse-dependent'),
      spouseIncome: getNumber('sn-spouse-income', 0),
      taxpayerDisability: $('sn-taxpayer-disability')?.value || '0',
      variableAnnual, kindAnnual, manualGrossMonthly,
      extraPaysProrated: getBool('sn-prorated-extras'),
      multiPayer: getBool('sn-multi-payer'),
      children: parseChildrenDetailed(),
      ascendants: parseAscendantsDetailed()
    };
  }

  function updateKpis(r) {
    if ($('sn-kpi-net-month')) $('sn-kpi-net-month').textContent = fmtMoney(r.monthlyNet);
    if ($('sn-kpi-net-year')) $('sn-kpi-net-year').textContent = fmtMoney0(r.annualNet);
    if ($('sn-kpi-irpf')) $('sn-kpi-irpf').textContent = fmtMoney0(r.irpf.retentionAnnual);
    if ($('sn-kpi-ss')) $('sn-kpi-ss').textContent = fmtMoney0(r.ss.workerAnnual);
    if ($('sn-kpi-marginal')) $('sn-kpi-marginal').textContent = fmtPct(r.irpf.marginalRate);
    if ($('sn-kpi-cost')) $('sn-kpi-cost').textContent = fmtMoney0(r.employerCostAnnual);
  }

  function updateBreakdown(r) {
    $('sn-breakdown') && ($('sn-breakdown').innerHTML = `
      <tr><td>Bruto anual</td><td>${fmtMoney(r.grossAnnual)}</td></tr>
      <tr><td>Bruto mensual</td><td>${fmtMoney(r.grossMonthly)}</td></tr>
      <tr><td>Base mensual de cotización</td><td>${fmtMoney(r.ss.cappedBase)}</td></tr>
      <tr><td>SS trabajador anual</td><td>${fmtMoney(r.ss.workerAnnual)}</td></tr>
      <tr><td>Rendimiento neto previo</td><td>${fmtMoney(r.irpf.netBeforeReduction)}</td></tr>
      <tr><td>Reducción rendimientos trabajo</td><td>${fmtMoney(r.irpf.workReduction)}</td></tr>
      <tr><td>Mínimo personal y familiar</td><td>${fmtMoney(r.irpf.minimums.total)}</td></tr>
      <tr><td>Base liquidable general estimada</td><td>${fmtMoney(r.irpf.taxableGeneralBase)}</td></tr>
      <tr><td>Cuota estatal</td><td>${fmtMoney(r.irpf.stateQuota)}</td></tr>
      <tr><td>Cuota autonómica / foral</td><td>${fmtMoney(r.irpf.autonomousQuota)}</td></tr>
      <tr><td>IRPF anual estimado</td><td>${fmtMoney(r.irpf.retentionAnnual)}</td></tr>
      <tr><td>Neto final anual</td><td><strong>${fmtMoney(r.annualNet)}</strong></td></tr>`);
    $('sn-contrib-worker') && ($('sn-contrib-worker').innerHTML = `
      <tr><td>Contingencias comunes</td><td>${fmtMoney(r.ss.workerMonthly.commonContingencies)}</td><td>${fmtMoney(r.ss.workerMonthly.commonContingencies * r.input.pays)}</td></tr>
      <tr><td>Desempleo</td><td>${fmtMoney(r.ss.workerMonthly.unemployment)}</td><td>${fmtMoney(r.ss.workerMonthly.unemployment * r.input.pays)}</td></tr>
      <tr><td>Formación profesional</td><td>${fmtMoney(r.ss.workerMonthly.training)}</td><td>${fmtMoney(r.ss.workerMonthly.training * r.input.pays)}</td></tr>
      <tr><td>MEI</td><td>${fmtMoney(r.ss.workerMonthly.mei)}</td><td>${fmtMoney(r.ss.workerMonthly.mei * r.input.pays)}</td></tr>
      <tr><td>Solidaridad adicional</td><td>${fmtMoney(r.ss.workerMonthly.solidarity)}</td><td>${fmtMoney(r.ss.workerMonthly.solidarity * r.input.pays)}</td></tr>`);
    $('sn-contrib-employer') && ($('sn-contrib-employer').innerHTML = `
      <tr><td>Contingencias comunes</td><td>${fmtMoney(r.ss.employerMonthly.commonContingencies)}</td><td>${fmtMoney(r.ss.employerMonthly.commonContingencies * r.input.pays)}</td></tr>
      <tr><td>Desempleo</td><td>${fmtMoney(r.ss.employerMonthly.unemployment)}</td><td>${fmtMoney(r.ss.employerMonthly.unemployment * r.input.pays)}</td></tr>
      <tr><td>Formación profesional</td><td>${fmtMoney(r.ss.employerMonthly.training)}</td><td>${fmtMoney(r.ss.employerMonthly.training * r.input.pays)}</td></tr>
      <tr><td>FOGASA</td><td>${fmtMoney(r.ss.employerMonthly.fogasa)}</td><td>${fmtMoney(r.ss.employerMonthly.fogasa * r.input.pays)}</td></tr>
      <tr><td>MEI</td><td>${fmtMoney(r.ss.employerMonthly.mei)}</td><td>${fmtMoney(r.ss.employerMonthly.mei * r.input.pays)}</td></tr>
      <tr><td>AT/EP (tipo genérico)</td><td>${fmtMoney(r.ss.employerMonthly.accidents)}</td><td>${fmtMoney(r.ss.employerMonthly.accidents * r.input.pays)}</td></tr>
      <tr><td>Solidaridad adicional</td><td>${fmtMoney(r.ss.employerMonthly.solidarity)}</td><td>${fmtMoney(r.ss.employerMonthly.solidarity * r.input.pays)}</td></tr>`);
    $('sn-explanation') && ($('sn-explanation').textContent = r.explanation);
  }

  function buildScenarioRow(label, grossAnnual, territory, pays) {
    const modified = Object.assign(getFormData(), { grossAnnual, territory, pays });
    const r = computeResult(modified);
    return `<tr><td>${label}</td><td>${territory}</td><td>${pays}</td><td>${fmtMoney0(grossAnnual)}</td><td>${fmtMoney(r.monthlyNet)}</td><td>${fmtPct(r.irpf.marginalRate)}</td></tr>`;
  }

  function updateScenarioComparator(input) {
    const altGross = getNumber('sn-compare-gross', input.grossAnnual * 1.1);
    const altPays = Number($('sn-compare-pays')?.value || input.pays);
    const altTerritory = $('sn-compare-territory')?.value || input.territory;
    $('sn-scenarios') && ($('sn-scenarios').innerHTML = [buildScenarioRow('Actual', input.grossAnnual, input.territory, input.pays), buildScenarioRow('Escenario alternativo', altGross, altTerritory, altPays)].join(''));
  }

  function recalc() {
    const input = getFormData();
    const result = computeResult(input);
    updateKpis(result);
    updateBreakdown(result);
    updateScenarioComparator(input);
    const model = buildNominaModel(result);
    renderNomina(model);
    window.__snLastResult = result;
    window.__snLastNomina = model;
  }

  function setAdvancedVisibility() { const advanced = $('sn-advanced-fields'); if (advanced) advanced.hidden = getMode() !== 'advanced'; }
  function bind() {
    document.querySelectorAll('input, select').forEach((el) => {
      el.addEventListener('input', recalc, { passive: true });
      el.addEventListener('change', () => { setAdvancedVisibility(); recalc(); }, { passive: true });
    });
    $('sn-generate-pdf')?.addEventListener('click', () => downloadNominaPdf(window.__snLastNomina));
    $('sn-copy-summary')?.addEventListener('click', async () => {
      const r = window.__snLastResult;
      const summary = [`Territorio: ${r.input.territory}`, `Bruto anual: ${fmtMoney0(r.grossAnnual)}`, `Neto anual: ${fmtMoney0(r.annualNet)}`, `Neto por paga: ${fmtMoney(r.monthlyNet)}`, `IRPF anual: ${fmtMoney0(r.irpf.retentionAnnual)}`, `SS trabajador: ${fmtMoney0(r.ss.workerAnnual)}`, `Coste empresa: ${fmtMoney0(r.employerCostAnnual)}`].join('\n');
      await navigator.clipboard.writeText(summary);
    });
  }

  window.__salaryNetCalc = { computeResult, buildNominaModel };
  if (typeof document !== 'undefined') {
    bind();
    setAdvancedVisibility();
    try { recalc(); } catch (_) {}
  }
}());
