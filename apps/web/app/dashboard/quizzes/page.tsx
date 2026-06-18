export default function QuizzesPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-black tracking-tight text-ink">Quizzes</h1>
        <p className="text-sm font-mono text-ink-muted">Blind-spot and topic review quizzes generated from your materials.</p>
      </div>

      <div className="rounded-[4px] bg-surface border-2 border-ink p-8 shadow-hard text-center">
        <p className="text-sm font-mono font-bold text-ink-muted">Generate a quiz from a topic to test your knowledge.</p>
      </div>
    </div>
  );
}
