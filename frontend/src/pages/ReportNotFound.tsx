export default function ReportNotFound() {
  return (
    <main className="min-h-screen bg-stone-50 px-5 py-16 text-stone-800">
      <section className="mx-auto max-w-lg rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-800">
          G.S Gacuba 2A
        </p>

        <h1 className="mt-3 text-2xl font-bold">
          Report not found
        </h1>

        <p className="mt-3 text-sm leading-6 text-stone-600">
          This academic report is not available for online download yet.
          Please contact the school administration for assistance.
        </p>
      </section>
    </main>
  );
}