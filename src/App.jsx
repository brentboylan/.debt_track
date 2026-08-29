import { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'debtPlannerAccounts';

const strategyMeta = {
  current: {
    label: 'Current plan',
    description:
      'Keep paying each debt at its current monthly amount. This is the baseline plan and usually takes the longest to clear everything.',
  },
  snowball: {
    label: 'Snowball',
    description:
      'Pay the smallest balances first while making minimum payments on everything else. The psychological win comes from eliminating balances quickly and then rolling the freed-up payment into the next debt.',
  },
  avalanche: {
    label: 'Avalanche',
    description:
      'Attack the highest APR debts first. This approach usually saves the most interest over time by reducing the most expensive debt as quickly as possible.',
  },
  stacked: {
    label: 'Stack after payoff',
    description:
      'Keep minimum payments on every debt, but direct any extra monthly cash to the highest-priority debt until it is gone. Once one account is paid off, the payment that was formerly attached to it gets rolled into the next balance.',
  },
};

const defaultDeadlineYear = String(new Date().getFullYear());
const defaultDeadlineMonth = String(new Date().getMonth() + 1).padStart(2, '0');

const demoAccounts = [
  { id: 1, name: 'Chase Visa', balance: 5200, apr: 18.99, payment: 180, deadline: '2029-11' },
  { id: 2, name: 'Amex', balance: 3400, apr: 24.99, payment: 160, deadline: '2029-06' },
  { id: 3, name: 'Auto Loan', balance: 9800, apr: 7.5, payment: 330, deadline: '2028-10' },
  { id: 4, name: 'Student Loan', balance: 14500, apr: 5.2, payment: 260, deadline: '2031-12' },
];

function currency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
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

function parseMonthValue(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const match = value.match(/^\d{4}-\d{2}$/);
  if (!match) {
    return null;
  }

  const [year, month] = value.split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) {
    return null;
  }

  return new Date(year, month - 1, 1);
}

function monthToInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getProjectedDeadlineValue(account, strategyResults) {
  const match = strategyResults.find((entry) => Number(entry.id) === Number(account.id));
  if (!match || match.paidOffMonth === null || match.paidOffMonth === undefined) {
    return null;
  }

  const target = new Date();
  target.setMonth(target.getMonth() + match.paidOffMonth);
  return monthToInputValue(target);
}

function getMonthsUntilDeadline(value) {
  const target = parseMonthValue(value);
  if (!target) {
    return null;
  }

  const now = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const months = (target.getFullYear() - currentMonth.getFullYear()) * 12 + (target.getMonth() - currentMonth.getMonth());

  return months >= 0 ? months : null;
}

function formatMonthLabel(value) {
  const parsed = parseMonthValue(value);
  if (!parsed) {
    return 'No deadline';
  }

  return parsed.toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

function getRequiredMonthlyPayment(balance, apr, deadline) {
  const balanceValue = toNumber(balance);
  const aprValue = toNumber(apr);
  const months = getMonthsUntilDeadline(deadline);

  if (!months || months <= 0 || balanceValue <= 0) {
    return null;
  }

  const monthlyRate = aprValue / 100 / 12;
  if (monthlyRate === 0) {
    return balanceValue / months;
  }

  const payment = (balanceValue * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
  return Number.isFinite(payment) ? payment : null;
}

function getAccountDeadlineInfo(account) {
  const deadline = account?.deadline || '';
  const requiredPayment = getRequiredMonthlyPayment(account?.balance, account?.apr, deadline);
  const defaultPayment = toNumber(account?.payment);
  const delta = requiredPayment === null ? null : requiredPayment - defaultPayment;

  return {
    deadlineLabel: formatMonthLabel(deadline),
    requiredPayment,
    defaultPayment,
    delta,
    deltaText: delta === null
      ? 'No deadline'
      : delta > 0
        ? `${currency(delta)} more than default payment`
        : delta < 0
          ? `${currency(Math.abs(delta))} less than default payment`
          : 'Matches default payment',
  };
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

  return rows.filter((row) => row.trim().length > 0).map((row) => parseCsvRow(row));
}

function getStrategyLabel(strategy) {
  return strategyMeta[strategy]?.label || strategyMeta.current.label;
}

function getStrategyDescription(strategy) {
  return strategyMeta[strategy]?.description || strategyMeta.current.description;
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

function simulateStrategy(accounts, strategy, extraMonthly) {
  const debts = accounts.map((account) => ({
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

    applyStrategyPayments(debts, strategy, extraMonthly);

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

function getAmortizationRows(accounts, strategy, extraMonthly) {
  const debts = accounts.map((account) => ({
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

    let monthlyInterest = 0;
    for (const debt of debts) {
      if (debt.balance <= 0) continue;
      const interest = debt.balance * (debt.apr / 100 / 12);
      debt.balance += interest;
      debt.totalInterest += interest;
      monthlyInterest += interest;
    }

    const afterInterestTotal = debts.reduce((sum, debt) => sum + debt.balance, 0);
    applyStrategyPayments(debts, strategy, extraMonthly);
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

function buildScenarioComparison(accounts, extraMonthly) {
  return ['current', 'snowball', 'avalanche', 'stacked'].map((strategy) => {
    const results = simulateStrategy(accounts, strategy, extraMonthly);
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

async function saveAccounts(accounts) {
  const payload = JSON.stringify(accounts);

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

export default function App() {
  const [accounts, setAccounts] = useState([]);
  const [strategy, setStrategy] = useState('current');
  const [extraMonthly, setExtraMonthly] = useState(250);
  const [summarySort, setSummarySort] = useState({ key: 'balance', direction: 'desc' });
  const [collapsedSections, setCollapsedSections] = useState({
    accounts: false,
    strategy: false,
    summary: false,
    comparison: false,
    delta: false,
    timeline: false,
  });
  const [isCompactLayout, setIsCompactLayout] = useState(() => typeof window !== 'undefined' ? window.innerWidth <= 760 : false);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('debtPlannerTheme');
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!import.meta.env.DEV && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.warn('Service worker registration failed.', error);
      });
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const compact = window.innerWidth <= 760;
      setIsCompactLayout(compact);
      if (!compact) {
        setCollapsedSections((current) => ({
          ...current,
          accounts: false,
          strategy: false,
          summary: false,
          comparison: false,
          delta: false,
          timeline: false,
        }));
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('theme-dark', theme === 'dark');
    localStorage.setItem('debtPlannerTheme', theme);
  }, [theme]);

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      const initialAccounts = await loadAccounts();
      if (!isMounted) return;
      setAccounts(initialAccounts);
      setReady(true);
    };

    initialize();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveAccounts(accounts);
  }, [accounts, ready]);

  const scenarioResults = useMemo(
    () => simulateStrategy(accounts, strategy, extraMonthly),
    [accounts, strategy, extraMonthly],
  );

  const comparison = useMemo(() => buildScenarioComparison(accounts, extraMonthly), [accounts, extraMonthly]);

  const maxComparisonInterest = Math.max(...comparison.map((item) => item.interest), 1);

  const amortizationRows = useMemo(
    () => getAmortizationRows(accounts, strategy, extraMonthly),
    [accounts, strategy, extraMonthly],
  );

  const summaryRows = useMemo(() => {
    const payoffMap = new Map(scenarioResults.map((entry) => [Number(entry.id), entry]));

    return [...accounts]
      .map((account) => {
        const result = payoffMap.get(Number(account.id));
        const deadlineInfo = getAccountDeadlineInfo(account);

        return {
          ...account,
          payoffMonth: result?.paidOffMonth || null,
          payoffLabel: result?.payoffLabel || 'Not projected',
          deadlineLabel: deadlineInfo.deadlineLabel,
          requiredPayment: deadlineInfo.requiredPayment,
          paymentDeltaText: deadlineInfo.deltaText,
        };
      })
      .sort((a, b) => {
        const direction = summarySort.direction === 'asc' ? 1 : -1;
        const sortKey = summarySort.key === 'payoff' ? 'payoffMonth' : summarySort.key;
        const left = a[sortKey];
        const right = b[sortKey];

        if (left === null || left === undefined) return 1 * direction;
        if (right === null || right === undefined) return -1 * direction;

        if (typeof left === 'string' && typeof right === 'string') {
          return left.localeCompare(right) * direction;
        }

        return (Number(left) - Number(right)) * direction;
      });
  }, [accounts, scenarioResults, summarySort]);

  const totalDebt = accounts.reduce((sum, account) => sum + toNumber(account.balance), 0);
  const totalMonthly = accounts.reduce((sum, account) => sum + toNumber(account.payment), 0);
  const totalInterest = scenarioResults.reduce((sum, debt) => sum + toNumber(debt.totalInterest), 0);
  const largestProjectedMonth = Math.max(...scenarioResults.map((debt) => debt.paidOffMonth || 0), 0);

  const projectedPayoff = scenarioResults.filter((debt) => debt.paidOffMonth).sort((a, b) => a.paidOffMonth - b.paidOffMonth);
  const finalPayoffLabel = projectedPayoff.length ? monthYearFromMonths(projectedPayoff[projectedPayoff.length - 1].paidOffMonth) : '—';

  const currentPlanInterest = comparison.find((item) => item.strategy === 'current')?.interest || 0;
  const bestStrategy = comparison.reduce(
    (best, current) => (current.interest < best.interest ? current : best),
    comparison[0] || { strategy: 'current', interest: 0, label: 'Current plan' },
  );
  const savingsVsCurrent = Math.max(currentPlanInterest - bestStrategy.interest, 0);
  const bestStrategyLabel = bestStrategy.strategy === strategy ? 'Current strategy is the strongest option' : `${getStrategyLabel(bestStrategy.strategy)} is the strongest option`;
  const strategySavingsText = savingsVsCurrent > 0 ? `${currency(savingsVsCurrent)} less interest than the current plan` : 'No improvement over the current plan';

  function handleAddAccount(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get('name') || '').trim();
    const balance = toNumber(formData.get('balance'));
    const apr = toNumber(formData.get('apr'));
    const payment = toNumber(formData.get('payment'));
    const deadlineMonth = String(formData.get('deadlineMonth') || '').trim();
    const deadlineYear = String(formData.get('deadlineYear') || '').trim();
    const deadline = deadlineMonth && deadlineYear ? `${deadlineYear}-${deadlineMonth}` : '';

    if (!name || balance <= 0 || apr < 0 || payment < 0) {
      return;
    }

    const newAccount = {
      id: Date.now() + Math.random(),
      name,
      balance,
      apr,
      payment,
      deadline,
    };

    setAccounts((current) => [...current, newAccount]);
    event.currentTarget.reset();
  }

  function handleAccountFieldChange(id, field, rawValue) {
    setAccounts((current) =>
      current.map((account) => {
        if (account.id !== id) return account;
        if (field === 'name' || field === 'deadline') {
          return { ...account, [field]: rawValue };
        }
        return { ...account, [field]: Number(rawValue) };
      }),
    );
  }

  function handleDeadlineFieldChange(id, part, value) {
    setAccounts((current) =>
      current.map((account) => {
        if (account.id !== id) return account;
        const currentDeadline = account.deadline || `${new Date().getFullYear()}-01`;
        const [existingYear, existingMonth] = currentDeadline.split('-');
        const nextYear = part === 'year' ? value : existingYear || String(new Date().getFullYear());
        const nextMonth = part === 'month' ? value : existingMonth || '01';

        if (!nextYear || !nextMonth) {
          return { ...account, deadline: '' };
        }

        return { ...account, deadline: `${nextYear}-${nextMonth}` };
      }),
    );
  }

  function handleDeleteAccount(id) {
    setAccounts((current) => current.filter((account) => account.id !== id));
  }

  function handleResetDemo() {
    setAccounts(demoAccounts.map((account) => ({ ...account })));
    setExtraMonthly(250);
    setStrategy('current');
  }

  function toggleSection(section) {
    if (!isCompactLayout) return;
    setCollapsedSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  function handleExportCsv() {
    const rows = [
      ['name', 'balance', 'apr', 'payment', 'deadline'],
      ...accounts.map((account) => [account.name, account.balance, account.apr, account.payment, account.deadline || '']),
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

  function handleTimelineExport() {
    const rows = getAmortizationRows(accounts, strategy, extraMonthly);
    const csvRows = [
      ['month', 'balance_left', 'interest_paid', 'principal_paid'],
      ...rows.map((row) => [row.month, row.remaining, row.interestPaid, row.principalPaid]),
    ];
    const csvContent = csvRows.map((row) => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `timeline-${strategy}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function handleImportCsv(event) {
    const [file] = event.target.files || [];
    if (!file) return;

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
        const deadlineIndex = headers.indexOf('deadline');

        if ([nameIndex, balanceIndex, aprIndex, paymentIndex].includes(-1)) {
          throw new Error('CSV must include name, balance, apr, and payment columns.');
        }

        const importedAccounts = rows.slice(1).map((row) => {
          const name = row[nameIndex]?.trim() || 'New debt';
          const balance = toNumber(row[balanceIndex]);
          const apr = toNumber(row[aprIndex]);
          const payment = toNumber(row[paymentIndex]);
          const deadline = deadlineIndex >= 0 ? String(row[deadlineIndex] || '').trim() : '';

          if (!name || balance <= 0 || apr < 0 || payment < 0) {
            throw new Error('Each row must include a valid name, balance, APR, and payment.');
          }

          return {
            id: Date.now() + Math.random() + Math.random(),
            name,
            balance,
            apr,
            payment,
            deadline,
          };
        });

        if (!importedAccounts.length) {
          throw new Error('No valid debt rows were found in the CSV.');
        }

        setAccounts(importedAccounts);
        event.target.value = '';
      } catch (error) {
        window.alert(error.message || 'Unable to import CSV.');
        event.target.value = '';
      }
    };

    reader.readAsText(file);
  }

  function handleSortClick(key) {
    setSummarySort((current) => {
      if (current.key === key) {
        return {
          key,
          direction: current.direction === 'asc' ? 'desc' : 'asc',
        };
      }

      return { key, direction: 'asc' };
    });
  }

  const statusCards = [...scenarioResults].sort((a, b) => {
    if (a.paidOffMonth && b.paidOffMonth) return a.paidOffMonth - b.paidOffMonth;
    if (a.paidOffMonth) return -1;
    return 1;
  });

  const getSortIndicator = (key) => {
    if (summarySort.key !== key) return '';
    return summarySort.direction === 'asc' ? ' ↑' : ' ↓';
  };

  const payoffDeltaRows = useMemo(() => {
    const currentResults = simulateStrategy(accounts, 'current', extraMonthly);
    const currentMap = new Map(currentResults.map((entry) => [Number(entry.id), entry]));

    return accounts.map((account) => {
      const current = currentMap.get(Number(account.id));
      const target = scenarioResults.find((entry) => Number(entry.id) === Number(account.id));
      const currentPayoff = current?.paidOffMonth ?? null;
      const targetPayoff = target?.paidOffMonth ?? null;
      const deltaMonths = currentPayoff !== null && targetPayoff !== null ? targetPayoff - currentPayoff : null;

      return {
        ...account,
        currentPayoff,
        targetPayoff,
        deltaMonths,
        deltaText: deltaMonths === null ? '—' : `${deltaMonths > 0 ? '+' : ''}${deltaMonths} mo`,
      };
    });
  }, [accounts, extraMonthly, scenarioResults]);

  const renderSectionHeader = (title, sectionKey) => {
    if (!isCompactLayout) {
      return <h2>{title}</h2>;
    }

    return (
      <button type="button" className="section-toggle" onClick={() => toggleSection(sectionKey)} aria-expanded={!collapsedSections[sectionKey]}>
        <span>{title}</span>
        <span className="section-toggle-icon">{collapsedSections[sectionKey] ? '+' : '−'}</span>
      </button>
    );
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">Debt planner</div>
          <h1>Debt payoff tracker</h1>
        </div>
        <div className="header-actions">
          <button className="secondary-btn" type="button" onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}>
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button className="primary-btn" type="button" onClick={handleExportCsv}>Export CSV</button>
        </div>
      </header>

      <section className="panel summary-panel summary-panel-top">
        <div className="panel-heading">
          <h2>Debt summary</h2>
        </div>

        <div className="table-wrap">
          <table className="summary-table-mobile">
            <thead>
              <tr>
                <th>
                  <button className="sort-btn" type="button" onClick={() => handleSortClick('name')}>
                    Name{getSortIndicator('name')}
                  </button>
                </th>
                <th>
                  <button className="sort-btn" type="button" onClick={() => handleSortClick('balance')}>
                    Balance{getSortIndicator('balance')}
                  </button>
                </th>
                <th>
                  <button className="sort-btn" type="button" onClick={() => handleSortClick('apr')}>
                    APR{getSortIndicator('apr')}
                  </button>
                </th>
                <th>
                  <button className="sort-btn" type="button" onClick={() => handleSortClick('payment')}>
                    Payment{getSortIndicator('payment')}
                  </button>
                </th>
                <th>
                  <button className="sort-btn" type="button" onClick={() => handleSortClick('payoff')}>
                    Payoff month{getSortIndicator('payoff')}
                  </button>
                </th>
                <th>Target date</th>
                <th>Required payment</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((account) => (
                <tr key={account.id}>
                  <td data-label="Name">{account.name}</td>
                  <td data-label="Balance">{currency(account.balance)}</td>
                  <td data-label="APR">{Number(account.apr).toFixed(2)}%</td>
                  <td data-label="Payment">{currency(account.payment)}</td>
                  <td data-label="Payoff month">{account.payoffLabel}</td>
                  <td data-label="Target date">{account.deadlineLabel}</td>
                  <td data-label="Required payment">
                    {account.requiredPayment === null ? (
                      '—'
                    ) : (
                      <div className="required-payment-stack">
                        <span>{currency(account.requiredPayment)}</span>
                        {account.paymentDeltaText && <small className="account-difference-note">{account.paymentDeltaText}</small>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <main className="layout">
        <section className="panel">
          <div className="panel-heading">
            {isCompactLayout ? (
              <button type="button" className="section-toggle" onClick={() => toggleSection('accounts')} aria-expanded={!collapsedSections.accounts}>
                <span>Debt accounts</span>
                <span className="section-toggle-icon">{collapsedSections.accounts ? '+' : '−'}</span>
              </button>
            ) : (
              <h2>Debt accounts</h2>
            )}
            <span className="badge" id="accountCountBadge">{accounts.length}</span>
          </div>
 
          {(!isCompactLayout || !collapsedSections.accounts) && (
            <>
          <div className="table-wrap">
            <table className="account-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Balance</th>
                  <th>APR</th>
                  <th>Monthly payment</th>
                  <th>Deadline</th>
                  <th>Required</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {accounts.length === 0 ? (
                  <tr>
                    <td colSpan="7">No debts yet. Add an account to begin planning.</td>
                  </tr>
                ) : (
                  accounts.map((account) => {
                    const deadlineInfo = getAccountDeadlineInfo(account);
                    const referencePayoff = scenarioResults.find((entry) => Number(entry.id) === Number(account.id));
                    const referencePayoffLabel = referencePayoff?.payoffLabel || 'No estimate yet';
                    const effectiveDeadline = account.deadline || getProjectedDeadlineValue(account, scenarioResults) || '';

                    return (
                      <tr key={account.id}>
                        <td data-label="Name">
                          <input
                            className="account-input"
                            value={account.name}
                            onChange={(event) => handleAccountFieldChange(account.id, 'name', event.target.value)}
                          />
                        </td>
                        <td data-label="Balance">
                          <input
                            className="account-input"
                            type="number"
                            step="0.01"
                            min="0"
                            value={account.balance}
                            onChange={(event) => handleAccountFieldChange(account.id, 'balance', event.target.value)}
                          />
                        </td>
                        <td data-label="APR">
                          <input
                            className="account-input"
                            type="number"
                            step="0.01"
                            min="0"
                            value={account.apr}
                            onChange={(event) => handleAccountFieldChange(account.id, 'apr', event.target.value)}
                          />
                        </td>
                        <td data-label="Monthly payment">
                          <input
                            className="account-input"
                            type="number"
                            step="0.01"
                            min="0"
                            value={account.payment}
                            onChange={(event) => handleAccountFieldChange(account.id, 'payment', event.target.value)}
                          />
                        </td>
                        <td data-label="Deadline">
                          <div className="deadline-field-stack">
                            <div className="month-select-group">
                              <select
                                className="account-input"
                                value={effectiveDeadline ? effectiveDeadline.slice(5) : defaultDeadlineMonth}
                                onChange={(event) => handleDeadlineFieldChange(account.id, 'month', event.target.value)}
                              >
                                <option value="">Month</option>
                                {['01','02','03','04','05','06','07','08','09','10','11','12'].map((month) => (
                                  <option key={month} value={month}>{new Date(2024, Number(month) - 1, 1).toLocaleString('en-US', { month: 'long' })}</option>
                                ))}
                              </select>
                              <select
                                className="account-input"
                                value={effectiveDeadline ? effectiveDeadline.slice(0, 4) : defaultDeadlineYear}
                                onChange={(event) => handleDeadlineFieldChange(account.id, 'year', event.target.value)}
                              >
                                <option value="">Year</option>
                                {Array.from({ length: 31 }, (_, index) => new Date().getFullYear() - 5 + index).map((year) => (
                                  <option key={year} value={year}>{year}</option>
                                ))}
                              </select>
                            </div>
                            <small className="account-goal-note">Default payoff: {referencePayoffLabel}</small>
                          </div>
                        </td>
                        <td data-label="Required">
                          <div className="required-payment-stack">
                            {deadlineInfo.requiredPayment === null ? (
                              <span>—</span>
                            ) : (
                              <>
                                <span>{currency(deadlineInfo.requiredPayment)}</span>
                                <small className="account-difference-note">{deadlineInfo.deltaText}</small>
                              </>
                            )}
                          </div>
                        </td>
                        <td data-label="Action">
                          <button className="delete-btn" type="button" onClick={() => handleDeleteAccount(account.id)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <form className="account-form" onSubmit={handleAddAccount}>
            <h3>Add an account</h3>
            <div className="form-grid">
              <label className="field">
                <span>Name</span>
                <input name="name" type="text" placeholder="Example: Visa" required />
              </label>
              <label className="field">
                <span>Balance</span>
                <input name="balance" type="number" min="0" step="0.01" placeholder="0.00" required />
              </label>
              <label className="field">
                <span>APR</span>
                <input name="apr" type="number" min="0" step="0.01" placeholder="18.99" required />
              </label>
              <label className="field">
                <span>Monthly payment</span>
                <input name="payment" type="number" min="0" step="0.01" placeholder="200" required />
              </label>
              <label className="field">
                <span>Target payoff date (optional)</span>
                <div className="month-select-group">
                  <select name="deadlineMonth" className="account-input" defaultValue={defaultDeadlineMonth}>
                    <option value="">Month</option>
                    {['01','02','03','04','05','06','07','08','09','10','11','12'].map((month) => (
                      <option key={month} value={month}>{new Date(2024, Number(month) - 1, 1).toLocaleString('en-US', { month: 'long' })}</option>
                    ))}
                  </select>
                  <select name="deadlineYear" className="account-input" defaultValue={defaultDeadlineYear}>
                    <option value="">Year</option>
                    {Array.from({ length: 31 }, (_, index) => new Date().getFullYear() - 5 + index).map((year) => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
                <small className="account-goal-note">Reference: default payoff uses your current strategy estimate after adding the loan.</small>
              </label>
            </div>
            <div className="header-actions">
              <button className="primary-btn" type="submit">Add account</button>
              <button className="secondary-btn" type="button" onClick={handleResetDemo}>Reset demo</button>
              <label className="secondary-btn file-label" htmlFor="importCsvInput">
                Import CSV
              </label>
              <input id="importCsvInput" type="file" accept=".csv,text/csv" onChange={handleImportCsv} hidden />
              <button className="secondary-btn" type="button" onClick={handleTimelineExport}>Export timeline</button>
            </div>
          </form>
          </>
         )}
        </section>
 
        <aside className="panel sidebar-panel">
          <div className="panel-heading sidebar-heading">
            {renderSectionHeader('Payoff strategy', 'strategy')}
          </div>

          {(!isCompactLayout || !collapsedSections.strategy) && (
            <>
              <div>
                <div className="strategy-list">
                  {Object.entries(strategyMeta).map(([key, value]) => (
                    <button
                      key={key}
                      type="button"
                      className={`strategy-btn ${strategy === key ? 'active' : ''}`}
                      onClick={() => setStrategy(key)}
                    >
                      {value.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="field">
                  <span>Extra monthly payment</span>
                  <input
                    type="number"
                    min="0"
                    step="10"
                    value={extraMonthly}
                    onChange={(event) => setExtraMonthly(toNumber(event.target.value))}
                  />
                </label>
              </div>

              <div className="info-box">
                <h3>How it works</h3>
                <p>{getStrategyDescription(strategy)}</p>
                <p className="insight-note">
                  {bestStrategyLabel}: {currency(savingsVsCurrent)} less interest than the current plan.
                </p>
              </div>
            </>
          )}
        </aside>
      </main>

      <section className="results-panel panel">
        <div className="panel-heading">
          {renderSectionHeader('Scenario summary', 'summary')}
        </div>
        {(!isCompactLayout || !collapsedSections.summary) && (
          <>
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Total debt</span>
            <strong>{currency(totalDebt)}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Monthly outflow</span>
            <strong>{currency(totalMonthly)}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Projected payoff</span>
            <strong>{finalPayoffLabel}</strong>
          </div>
          <div className="stat-card insight-card">
            <span className="stat-label">Recommended plan</span>
            <strong>{getStrategyLabel(bestStrategy.strategy)}</strong>
            <small>{strategySavingsText}</small>
          </div>
        </div>

        <div className="recommendation-banner">
          <div>
            <span className="recommendation-label">Recommendation</span>
            <h3>{bestStrategyLabel}</h3>
          </div>
          <strong>{currency(savingsVsCurrent)} in interest savings</strong>
        </div>

        <div className="results-grid">
          {statusCards.map((account) => {
            const statusClass = account.paidOffMonth ? 'good' : 'warning';
            const statusText = account.paidOffMonth ? 'Paid off' : 'Still active';
            const payoffText = account.paidOffMonth ? monthYearFromMonths(account.paidOffMonth) : 'Beyond 50 years';
            const totalPaid = account.totalPaid || account.payment * (account.paidOffMonth || 0);

            return (
              <article className="result-card" key={account.id}>
                <span className={`status-pill ${statusClass}`}>{statusText}</span>
                <h3>{account.name}</h3>
                <p><strong>Balance:</strong> {currency(account.balance)}</p>
                <p><strong>APR:</strong> {Number(account.apr).toFixed(2)}%</p>
                <p><strong>Paid off:</strong> {payoffText}</p>
                <p><strong>Projected total paid:</strong> {currency(totalPaid)}</p>
              </article>
            );
          })}

          <article className="result-card selected">
            <span className="status-pill good">{getStrategyLabel(strategy)}</span>
            <h3>Scenario summary</h3>
            <p><strong>Strategy:</strong> {getStrategyLabel(strategy)}</p>
            <p><strong>Extra monthly:</strong> {currency(strategy === 'current' ? 0 : extraMonthly)}</p>
            <p><strong>Estimated interest:</strong> {currency(totalInterest)}</p>
            <p><strong>Longest payoff:</strong> {monthYearFromMonths(largestProjectedMonth)}</p>
          </article>
        </div>
          </>
        )}
      </section>

      <section className="insights-grid">
        <div className="panel">
          <div className="panel-heading">
            {renderSectionHeader('Strategy comparison', 'comparison')}
          </div>

          {(!isCompactLayout || !collapsedSections.comparison) && (
            <div className="comparison-chart">
            {comparison.map((item) => {
              const barHeight = Math.max(12, (item.interest / maxComparisonInterest) * 100);
              const deltaFromCurrent = item.strategy === 'current' ? 0 : currentPlanInterest - item.interest;
              return (
                <div key={item.strategy} className={`chart-column ${strategy === item.strategy ? 'selected' : ''}`}>
                  <span className="chart-value">{currency(item.interest)}</span>
                  <span className="comparison-delta">
                    {deltaFromCurrent > 0 ? `-${currency(deltaFromCurrent)}` : '—'}
                  </span>
                  <div className="chart-bar-wrap">
                    <div className="chart-bar" style={{ height: `${barHeight}%` }} />
                  </div>
                  <span className="chart-label">{item.label}</span>
                </div>
              );
            })}
          </div>
            )}
        </div>

        <div className="panel">
            <div className="panel-heading">
              {renderSectionHeader('Debt payoff delta', 'delta')}
            </div>
            {(!isCompactLayout || !collapsedSections.delta) && (
              <div className="table-wrap">
                <table className="delta-table-mobile">
                  <thead>
                    <tr>
                      <th>Debt</th>
                      <th>Current</th>
                      <th>{getStrategyLabel(strategy)}</th>
                      <th>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payoffDeltaRows.map((account) => (
                      <tr key={account.id}>
                        <td data-label="Debt">{account.name}</td>
                        <td data-label="Current">{account.currentPayoff ? monthYearFromMonths(account.currentPayoff) : 'Not projected'}</td>
                        <td data-label={getStrategyLabel(strategy)}>{account.targetPayoff ? monthYearFromMonths(account.targetPayoff) : 'Not projected'}</td>
                        <td data-label="Change">{account.deltaText}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>

        <div className="panel">
          <div className="panel-heading">
            {renderSectionHeader('Payoff timeline', 'timeline')}
          </div>
          {(!isCompactLayout || !collapsedSections.timeline) && (
            <div className="table-wrap">
              <table className="timeline-table-mobile">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Remaining</th>
                    <th>Interest</th>
                    <th>Principal</th>
                  </tr>
                </thead>
                <tbody>
                  {amortizationRows.length === 0 ? (
                    <tr>
                      <td colSpan="4">No timeline yet.</td>
                    </tr>
                  ) : (
                    amortizationRows.map((row) => (
                      <tr key={row.month}>
                        <td data-label="Month">{row.month}</td>
                        <td data-label="Remaining">{currency(row.remaining)}</td>
                        <td data-label="Interest">{currency(row.interestPaid)}</td>
                        <td data-label="Principal">{currency(row.principalPaid)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

    </div>
  );
}
