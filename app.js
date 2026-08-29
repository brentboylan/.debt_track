const STORAGE_KEY = 'debtPlannerAccounts';

const strategyMeta = {
  current: {
    label: 'Current plan',
    description: 'Keep paying each debt at its current monthly amount. This is the baseline plan and usually takes the longest to clear everything.',
  },
  snowball: {
    label: 'Snowball',
    description: 'Pay the smallest balances first while making minimum payments on everything else. The psychological win comes from eliminating balances quickly and then rolling the freed-up payment into the next debt.',
  },
  avalanche: {
    label: 'Avalanche',
    description: 'Attack the highest APR debts first. This approach usually saves the most interest over time by reducing the most expensive debt as quickly as possible.',
  },
  stacked: {
    label: 'Stack after payoff',
    description: 'Keep minimum payments on every debt, but direct any extra monthly cash to the highest-priority debt until it is gone. Once one account is paid off, the payment that was formerly attached to it gets rolled into the next balance.',
  },
};

const demoAccounts = [
  { id: 1, name: 'Chase Visa', balance: 5200, apr: 18.99, payment: 180 },
  { id: 2, name: 'Amex', balance: 3400, apr: 24.99, payment: 160 },
  { id: 3, name: 'Auto Loan', balance: 9800, apr: 7.5, payment: 330 },
  { id: 4, name: 'Student Loan', balance: 14500, apr: 5.2, payment: 260 },
];

const state = {
  accounts: [],
  strategy: 'current',
  extraMonthly: 250,
  summarySort: { key: 'balance', direction: 'desc' },
};

const accountTableBody = document.getElementById('accountTableBody');
const accountForm = document.getElementById('accountForm');
const strategyButtons = Array.from(document.querySelectorAll('.strategy-btn'));
const extraMonthlyInput = document.getElementById('extraMonthlyInput');
const totalDebtValue = document.getElementById('totalDebtValue');
const monthlyOutflowValue = document.getElementById('monthlyOutflowValue');
const projectedPayoffValue = document.getElementById('projectedPayoffValue');
const resultsGrid = document.getElementById('resultsGrid');
const accountCountBadge = document.getElementById('accountCountBadge');
const comparisonChart = document.getElementById('comparisonChart');
const amortizationBody = document.getElementById('amortizationBody');
const strategyInfoText = document.getElementById('strategyInfoText');
const summaryTableBody = document.getElementById('summaryTableBody');
const sortButtons = Array.from(document.querySelectorAll('.sort-btn'));
const themeToggle = document.getElementById('themeToggle');

async function loadAccounts() {
  try {
    const response = await fetch('/api/accounts');
    if (response.ok) {
      const parsed = await response.json();
      if (Array.isArray(parsed) && parsed.length) {
        return parsed;
      }
    }
  } catch (error) {
    console.warn('Using local storage because the API is unavailable.', error);
  }

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed;
      }
    } catch (error) {
      console.warn('Unable to read saved accounts.', error);
    }
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(demoAccounts));
  return demoAccounts.map((account) => ({ ...account }));
}

async function saveAccounts() {
  const payload = JSON.stringify(state.accounts);

  try {
    await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
  } catch (error) {
    console.warn('Unable to save to backend; falling back to local storage.', error);
  }

  localStorage.setItem(STORAGE_KEY, payload);
}

function currency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function monthYearFromMonths(months) {
  if (months === null || months === undefined || months <= 0) {
    return 'Not projected';
  }

  const today = new Date();
  const target = new Date(today.getFullYear(), today.getMonth() + months, 1);
  return target.toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeCsv(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function parseCsvRow(row) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < row.length; index += 1) {
    const character = row[index];

    if (character === '"') {
      if (inQuotes && row[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += character;
    }
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function parseCsv(text) {
  const rows = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === '\n' && !inQuotes) {
      rows.push(current);
      current = '';
    } else if (character === '\r' && !inQuotes) {
      if (nextCharacter === '\n') {
        index += 1;
      }
      rows.push(current);
      current = '';
    } else {
      current += character;
    }
  }

  if (current.trim()) {
    rows.push(current);
  }

  return rows
    .filter((row) => row.trim().length > 0)
    .map((row) => parseCsvRow(row));
}

function getStrategyLabel(strategy) {
  return strategyMeta[strategy]?.label || 'Current plan';
}

function getStrategyDescription(strategy) {
  return strategyMeta[strategy]?.description || strategyMeta.current.description;
}

function renderStrategyInfo() {
  strategyInfoText.textContent = getStrategyDescription(state.strategy);
}

function priorityComparator(strategy) {
  if (strategy === 'snowball') {
    return (a, b) => a.balance - b.balance || a.apr - b.apr;
  }

  if (strategy === 'avalanche' || strategy === 'stacked') {
    return (a, b) => b.apr - a.apr || a.balance - b.balance;
  }

  return (a, b) => a.id - b.id;
}

function applyStrategyPayments(debts, strategy, extraMonthly) {
  const activeDebts = debts.filter((debt) => debt.balance > 0.01);

  if (strategy === 'current') {
    for (const debt of activeDebts) {
      const payment = Math.min(debt.balance, debt.payment);
      debt.balance -= payment;
      debt.totalPaid += payment;
    }
    return;
  }

  let surplus = toNumber(extraMonthly);
  const priority = [...activeDebts].sort(priorityComparator(strategy));

  for (const debt of priority) {
    const minimumPayment = Math.min(debt.balance, debt.payment);
    debt.balance -= minimumPayment;
    debt.totalPaid += minimumPayment;

    if (surplus > 0 && debt.balance > 0.01) {
      const extraPayment = Math.min(debt.balance, surplus);
      debt.balance -= extraPayment;
      debt.totalPaid += extraPayment;
      surplus -= extraPayment;
    }
  }

  if (surplus > 0) {
    for (const debt of priority) {
      if (surplus <= 0 || debt.balance <= 0.01) continue;
      const extraPayment = Math.min(debt.balance, surplus);
      debt.balance -= extraPayment;
      debt.totalPaid += extraPayment;
      surplus -= extraPayment;
    }
  }
}

function simulateStrategy(strategy, overrideExtra = state.extraMonthly) {
  const debts = state.accounts.map((account) => ({
    ...account,
    id: Number(account.id),
    name: String(account.name),
    balance: Number(account.balance),
    apr: Number(account.apr),
    payment: Number(account.payment),
    totalPaid: 0,
    totalInterest: 0,
    paidOffMonth: null,
  }));

  let month = 0;
  const maxMonths = 600;

  while (month < maxMonths && debts.some((debt) => debt.balance > 0.01)) {
    month += 1;

    for (const debt of debts) {
      if (debt.balance <= 0) continue;
      const interest = debt.balance * (debt.apr / 100 / 12);
      debt.balance += interest;
      debt.totalInterest += interest;
    }

    applyStrategyPayments(debts, strategy, overrideExtra);

    for (const debt of debts) {
      if (debt.balance <= 0.01 && debt.paidOffMonth === null) {
        debt.paidOffMonth = month;
      }
    }
  }

  return debts.map((debt) => ({
    ...debt,
    payoffMonth: debt.paidOffMonth,
    payoffLabel: monthYearFromMonths(debt.paidOffMonth),
  }));
}

function buildScenarioComparison() {
  return ['current', 'snowball', 'avalanche', 'stacked'].map((strategy) => {
    const results = simulateStrategy(strategy);
    const totalInterest = results.reduce((sum, debt) => sum + toNumber(debt.totalInterest), 0);
    const longestPayoff = Math.max(...results.map((debt) => debt.paidOffMonth || 0), 0);

    return {
      strategy,
      label: getStrategyLabel(strategy),
      interest: totalInterest,
      longestPayoff,
    };
  });
}

function renderComparisonChart() {
  const comparison = buildScenarioComparison();
  const maxInterest = Math.max(...comparison.map((item) => item.interest), 1);

  comparisonChart.innerHTML = comparison
    .map((item) => {
      const barHeight = Math.max(12, (item.interest / maxInterest) * 100);
      const selectedClass = item.strategy === state.strategy ? 'selected' : '';

      return `
        <div class="chart-column ${selectedClass}">
          <span class="chart-value">${currency(item.interest)}</span>
          <div class="chart-bar-wrap">
            <div class="chart-bar" style="height: ${barHeight}%"></div>
          </div>
          <span class="chart-label">${item.label}</span>
        </div>
      `;
    })
    .join('');
}

function getAmortizationRows(strategy) {
  const debts = state.accounts.map((account) => ({
    ...account,
    id: Number(account.id),
    name: String(account.name),
    balance: Number(account.balance),
    apr: Number(account.apr),
    payment: Number(account.payment),
    totalPaid: 0,
    totalInterest: 0,
  }));

  const rows = [];
  let month = 0;

  while (month < 24 && debts.some((debt) => debt.balance > 0.01)) {
    month += 1;

    const beforeInterestTotal = debts.reduce((sum, debt) => sum + debt.balance, 0);
    let monthlyInterest = 0;

    for (const debt of debts) {
      if (debt.balance <= 0) continue;
      const interest = debt.balance * (debt.apr / 100 / 12);
      debt.balance += interest;
      debt.totalInterest += interest;
      monthlyInterest += interest;
    }

    const afterInterestTotal = debts.reduce((sum, debt) => sum + debt.balance, 0);
    applyStrategyPayments(debts, strategy, state.extraMonthly);
    const endBalance = debts.reduce((sum, debt) => sum + debt.balance, 0);
    const principalPaid = afterInterestTotal - endBalance;

    rows.push({
      month,
      remaining: endBalance,
      interestPaid: monthlyInterest,
      principalPaid,
    });
  }

  return rows;
}

function renderAmortizationTable() {
  const rows = getAmortizationRows(state.strategy);

  amortizationBody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td>${row.month}</td>
          <td>${currency(row.remaining)}</td>
          <td>${currency(row.interestPaid)}</td>
          <td>${currency(row.principalPaid)}</td>
        </tr>
      `,
    )
    .join('');
}

function renderSummaryTable() {
  const scenarioResults = simulateStrategy(state.strategy);
  const payoffMap = new Map(scenarioResults.map((entry) => [Number(entry.id), entry]));

  const rows = [...state.accounts]
    .map((account) => {
      const result = payoffMap.get(Number(account.id));
      return {
        ...account,
        payoffMonth: result?.paidOffMonth || null,
        payoffLabel: result?.payoffLabel || 'Not projected',
      };
    })
    .sort((a, b) => {
      const direction = state.summarySort.direction === 'asc' ? 1 : -1;
      const sortKey = state.summarySort.key === 'payoff' ? 'payoffMonth' : state.summarySort.key;
      const left = a[sortKey];
      const right = b[sortKey];

      if (left === null || left === undefined) return 1 * direction;
      if (right === null || right === undefined) return -1 * direction;

      if (typeof left === 'string' && typeof right === 'string') {
        return left.localeCompare(right) * direction;
      }

      return (Number(left) - Number(right)) * direction;
    });

  summaryTableBody.innerHTML = rows
    .map(
      (account) => `
        <tr>
          <td>${escapeHtml(account.name)}</td>
          <td>${currency(account.balance)}</td>
          <td>${Number(account.apr).toFixed(2)}%</td>
          <td>${currency(account.payment)}</td>
          <td>${account.payoffLabel}</td>
        </tr>
      `,
    )
    .join('');
}

function applyTheme(theme) {
  const darkMode = theme === 'dark';
  document.body.classList.toggle('theme-dark', darkMode);
  themeToggle.textContent = darkMode ? 'Light mode' : 'Dark mode';
  themeToggle.setAttribute('aria-label', darkMode ? 'Switch to light mode' : 'Switch to dark mode');
  localStorage.setItem('debtPlannerTheme', theme);
}

function initializeTheme() {
  const savedTheme = localStorage.getItem('debtPlannerTheme');
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
  applyTheme(theme);
}

function renderTable() {
  if (!state.accounts.length) {
    accountTableBody.innerHTML = '<tr><td colspan="5">No debts yet. Add an account to begin planning.</td></tr>';
    accountCountBadge.textContent = '0';
    return;
  }

  accountTableBody.innerHTML = state.accounts
    .map(
      (account) => `
        <tr>
          <td><input class="account-input" data-field="name" data-id="${account.id}" value="${escapeHtml(account.name)}" /></td>
          <td><input class="account-input" type="number" step="0.01" min="0" data-field="balance" data-id="${account.id}" value="${account.balance}" /></td>
          <td><input class="account-input" type="number" step="0.01" min="0" data-field="apr" data-id="${account.id}" value="${account.apr}" /></td>
          <td><input class="account-input" type="number" step="0.01" min="0" data-field="payment" data-id="${account.id}" value="${account.payment}" /></td>
          <td><button class="delete-btn" data-delete-id="${account.id}" type="button">Delete</button></td>
        </tr>
      `,
    )
    .join('');

  accountCountBadge.textContent = String(state.accounts.length);
  renderSummaryTable();
}

function renderSummary(results) {
  const totalDebt = state.accounts.reduce((sum, account) => sum + toNumber(account.balance), 0);
  const totalMonthly = state.accounts.reduce((sum, account) => sum + toNumber(account.payment), 0);

  totalDebtValue.textContent = currency(totalDebt);
  monthlyOutflowValue.textContent = currency(totalMonthly);

  const projected = results.filter((debt) => debt.paidOffMonth).sort((a, b) => a.paidOffMonth - b.paidOffMonth);
  if (projected.length) {
    const largestMonth = projected[projected.length - 1].paidOffMonth;
    projectedPayoffValue.textContent = monthYearFromMonths(largestMonth);
  } else {
    projectedPayoffValue.textContent = '—';
  }
}

function renderResults() {
  const results = simulateStrategy(state.strategy);
  const scenarioLabel = getStrategyLabel(state.strategy);

  const sorted = [...results].sort((a, b) => {
    if (a.paidOffMonth && b.paidOffMonth) return a.paidOffMonth - b.paidOffMonth;
    if (a.paidOffMonth) return -1;
    return 1;
  });

  const totalInterest = results.reduce((sum, debt) => sum + toNumber(debt.totalInterest), 0);

  const accountCards = sorted
    .map((account) => {
      const statusClass = account.paidOffMonth ? 'good' : 'warning';
      const statusText = account.paidOffMonth ? 'Paid off' : 'Still active';
      const payoffText = account.paidOffMonth ? monthYearFromMonths(account.paidOffMonth) : 'Beyond 50 years';
      const totalPaid = account.totalPaid || account.payment * (account.paidOffMonth || 0);

      return `
        <article class="result-card">
          <span class="status-pill ${statusClass}">${statusText}</span>
          <h3>${escapeHtml(account.name)}</h3>
          <p><strong>Balance:</strong> ${currency(account.balance)}</p>
          <p><strong>APR:</strong> ${account.apr.toFixed(2)}%</p>
          <p><strong>Paid off:</strong> ${payoffText}</p>
          <p><strong>Projected total paid:</strong> ${currency(totalPaid)}</p>
        </article>
      `;
    })
    .join('');

  const scenarioSummary = `
    <article class="result-card selected">
      <span class="status-pill good">${scenarioLabel}</span>
      <h3>Scenario summary</h3>
      <p><strong>Strategy:</strong> ${scenarioLabel}</p>
      <p><strong>Extra monthly:</strong> ${currency(state.strategy === 'current' ? 0 : state.extraMonthly)}</p>
      <p><strong>Estimated interest:</strong> ${currency(totalInterest)}</p>
      <p><strong>Longest payoff:</strong> ${monthYearFromMonths(Math.max(...results.map((debt) => debt.paidOffMonth || 0), 0))}</p>
    </article>
  `;

  resultsGrid.innerHTML = accountCards + scenarioSummary;
  renderSummary(results);
}

function exportAccountsCsv() {
  const rows = [
    ['name', 'balance', 'apr', 'payment'],
    ...state.accounts.map((account) => [account.name, account.balance, account.apr, account.payment]),
  ];

  const csvContent = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'debt-accounts.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportTimelineCsv() {
  const rows = getAmortizationRows(state.strategy);
  const csvRows = [
    ['month', 'balance_left', 'interest_paid', 'principal_paid'],
    ...rows.map((row) => [row.month, row.remaining, row.interestPaid, row.principalPaid]),
  ];
  const csvContent = csvRows.map((row) => row.map(escapeCsv).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `timeline-${state.strategy}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importAccountsCsv(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const rows = parseCsv(String(reader.result || ''));
      if (!rows.length) {
        throw new Error('CSV is empty.');
      }

      const headers = rows[0].map((header) => header.toLowerCase());
      const nameIndex = headers.indexOf('name');
      const balanceIndex = headers.indexOf('balance');
      const aprIndex = headers.indexOf('apr');
      const paymentIndex = headers.indexOf('payment');

      if ([nameIndex, balanceIndex, aprIndex, paymentIndex].includes(-1)) {
        throw new Error('CSV must include name, balance, apr, and payment columns.');
      }

      const importedAccounts = rows.slice(1).map((row) => {
        const name = row[nameIndex]?.trim() || 'New debt';
        const balance = toNumber(row[balanceIndex]);
        const apr = toNumber(row[aprIndex]);
        const payment = toNumber(row[paymentIndex]);

        if (!name || balance <= 0 || apr < 0 || payment < 0) {
          throw new Error('Each row must include a valid name, balance, APR, and payment.');
        }

        return {
          id: Date.now() + Math.random() + Math.random(),
          name,
          balance,
          apr,
          payment,
        };
      });

      if (!importedAccounts.length) {
        throw new Error('No valid debt rows were found in the CSV.');
      }

      state.accounts = importedAccounts;
      saveAccounts();
      renderTable();
      renderResults();
      renderComparisonChart();
      renderAmortizationTable();
      renderStrategyInfo();
      event.target.value = '';
    } catch (error) {
      window.alert(error.message || 'Unable to import CSV.');
      event.target.value = '';
    }
  };

  reader.readAsText(file);
}

function updateAccountField(id, field, rawValue) {
  const account = state.accounts.find((item) => item.id === id);
  if (!account) return;

  const value = field === 'name' ? rawValue : Number(rawValue);
  account[field] = value;
  saveAccounts();
  renderResults();
  renderComparisonChart();
  renderAmortizationTable();
  renderSummaryTable();
}

function addAccount(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const name = String(form.get('name') || '').trim();
  const balance = toNumber(form.get('balance'));
  const apr = toNumber(form.get('apr'));
  const payment = toNumber(form.get('payment'));

  if (!name || balance <= 0 || apr < 0 || payment < 0) {
    return;
  }

  const newAccount = {
    id: Date.now() + Math.random(),
    name,
    balance,
    apr,
    payment,
  };

  state.accounts.push(newAccount);
  saveAccounts();
  event.currentTarget.reset();
  renderTable();
  renderResults();
  renderComparisonChart();
  renderAmortizationTable();
  renderSummaryTable();
}

function removeAccount(id) {
  state.accounts = state.accounts.filter((account) => account.id !== id);
  saveAccounts();
  renderTable();
  renderResults();
  renderComparisonChart();
  renderAmortizationTable();
  renderSummaryTable();
}

function resetDemo() {
  state.accounts = demoAccounts.map((account) => ({ ...account }));
  state.extraMonthly = 250;
  state.strategy = 'current';
  extraMonthlyInput.value = String(state.extraMonthly);
  strategyButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.strategy === state.strategy);
  });
  saveAccounts();
  renderTable();
  renderStrategyInfo();
  renderResults();
  renderComparisonChart();
  renderAmortizationTable();
  renderSummaryTable();
}

strategyButtons.forEach((button) => {
  button.addEventListener('click', () => {
    state.strategy = button.dataset.strategy;
    strategyButtons.forEach((item) => item.classList.toggle('active', item === button));
    renderStrategyInfo();
    renderResults();
    renderComparisonChart();
    renderAmortizationTable();
    renderSummaryTable();
  });
});

sortButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const sortKey = button.dataset.sort;
    if (state.summarySort.key === sortKey) {
      state.summarySort.direction = state.summarySort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      state.summarySort.key = sortKey;
      state.summarySort.direction = 'asc';
    }

    renderSummaryTable();
  });
});

extraMonthlyInput.addEventListener('input', (event) => {
  state.extraMonthly = toNumber(event.target.value);
  renderResults();
  renderComparisonChart();
  renderAmortizationTable();
  renderSummaryTable();
});

accountForm.addEventListener('submit', addAccount);

accountTableBody.addEventListener('input', (event) => {
  const target = event.target;
  const id = Number(target.dataset.id);
  const field = target.dataset.field;
  if (!field || !target.dataset.id) return;
  updateAccountField(id, field, target.value);
  renderTable();
});

accountTableBody.addEventListener('click', (event) => {
  const button = event.target.closest('[data-delete-id]');
  if (!button) return;
  removeAccount(Number(button.dataset.deleteId));
});

document.getElementById('resetDemo').addEventListener('click', resetDemo);

document.getElementById('exportCsvBtn').addEventListener('click', exportAccountsCsv);
document.getElementById('exportTimelineBtn').addEventListener('click', exportTimelineCsv);
document.getElementById('importCsvInput').addEventListener('change', importAccountsCsv);
themeToggle.addEventListener('click', () => {
  const nextTheme = document.body.classList.contains('theme-dark') ? 'light' : 'dark';
  applyTheme(nextTheme);
});

document.getElementById('addAccountBtn').addEventListener('click', () => {
  document.getElementById('nameInput').focus();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Service worker registration failed.', error);
    });
  });
}

async function initializeApp() {
  state.accounts = await loadAccounts();
  initializeTheme();
  extraMonthlyInput.value = String(state.extraMonthly);
  renderTable();
  renderStrategyInfo();
  renderResults();
  renderComparisonChart();
  renderAmortizationTable();
  renderSummaryTable();
}

initializeApp();
