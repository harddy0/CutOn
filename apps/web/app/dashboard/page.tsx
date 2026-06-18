import { BrainLogo } from "@/components/icons/brain-logo";

export default function DashboardPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <BrainLogo size={32} />
        <div>
          <h1 className="text-2xl font-black tracking-tight text-ink">Dashboard</h1>
          <p className="text-sm font-mono text-ink-muted">Welcome back to your knowledge base.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: "Topics", desc: "Organize your learning into topic areas", count: "—", accent: "text-blue-accent" },
          { label: "Documents", desc: "Uploaded PDFs and text files", count: "—", accent: "text-green-accent" },
          { label: "Journal Entries", desc: "Personal notes and reflections", count: "—", accent: "text-purple-accent" },
          { label: "Study Sessions", desc: "Conversations with the AI Study Buddy", count: "—", accent: "text-green-accent" },
          { label: "Quizzes", desc: "Blind-spot and topic review quizzes", count: "—", accent: "text-blue-accent" },
          { label: "RAG Queries", desc: "Semantic searches across your data", count: "—", accent: "text-purple-accent" },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-[4px] bg-surface border-2 border-ink p-5 shadow-hard"
          >
            <span className={`text-2xl font-black tracking-tight block mb-1 ${item.accent}`}>
              {item.count}
            </span>
            <p className="text-sm font-black text-ink">{item.label}</p>
            <p className="text-xs font-medium text-ink-muted/70 mt-1">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
