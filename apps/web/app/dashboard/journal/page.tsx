export default function JournalPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-black tracking-tight text-ink">Journal</h1>
        <p className="text-sm font-mono text-ink-muted">Personal notes, reflections, and debugging logs.</p>
      </div>

      <div className="rounded-[4px] bg-surface border-2 border-ink p-8 shadow-hard text-center">
        <p className="text-sm font-mono font-bold text-ink-muted">Journal entries will appear here once you start writing.</p>
      </div>
    </div>
  );
}
