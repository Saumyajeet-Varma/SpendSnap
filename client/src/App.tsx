
function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-6 py-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Spend<span className="text-emerald-600">Snap</span>
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Your money, at a glance.
            </p>
          </div>

          <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
            Personal
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Dashboard</h2>
            <p className="mt-1 text-slate-500">
              Your financial overview starts here.
            </p>
          </div>

          <button
            type="button"
            className="rounded-xl bg-emerald-600 px-5 py-3 font-medium text-white transition hover:bg-emerald-700"
            onClick={() => alert("Expense entry will be implemented next.")}
          >
            + Add expense
          </button>
        </div>

        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              title: "Total balance",
              value: "₹0.00",
              description: "Across your accounts",
            },
            {
              title: "Income",
              value: "₹0.00",
              description: "This month",
            },
            {
              title: "Expenses",
              value: "₹0.00",
              description: "This month",
            },
          ].map((card) => (
            <article
              key={card.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <p className="text-sm font-medium text-slate-500">
                {card.title}
              </p>
              <p className="mt-4 text-3xl font-bold tracking-tight">
                {card.value}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                {card.description}
              </p>
            </article>
          ))}
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h3 className="text-lg font-semibold">Recent transactions</h3>
          <div className="py-12 text-center">
            <p className="font-medium text-slate-700">
              No transactions yet
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Your expenses and income will appear here.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
