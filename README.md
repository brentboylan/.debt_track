# Debt Tracker & Payoff Planner

A lightweight debt planner for tracking balances, APRs, monthly payments, and payoff strategies.

## Features
- Add and edit debt accounts with name, balance, APR, and monthly payment
- Track the current payment plan and see projected payoff month/year for each account
- Compare strategies including current plan, snowball, avalanche, and stack-after-payoff
- Use an extra monthly payment to model accelerated payoff paths
- Export and import account data through CSV files
- Review a simple strategy comparison chart and a monthly amortization snapshot
- Sort the debt summary table and export a month-by-month payoff timeline CSV
- Persist accounts through a small local backend so data survives browser refreshes and is not limited to local storage alone
- Install the app on a phone as a PWA and use it with dark mode or offline caching

## Strategy definitions
- Snowball: Pay the smallest balances first while continuing minimum payments on all debts. This is motivating because debts disappear quickly, even if it is not the lowest-interest approach.
- Avalanche: Focus on the highest APR loans first. This usually minimizes total interest paid over time.
- Stack after payoff: Keep minimum payments on every account, but send all extra cash to the most urgent debt until it is eliminated. Once one debt is gone, the freed-up payment gets rolled into the next account.

## Run locally
From the project folder, start the local backend/server:

```bash
cd d:/\.debt_track
node server.js
```

Then visit `http://localhost:8000`.
