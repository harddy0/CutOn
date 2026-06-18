import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SkillCard } from "@/components/ui/card";
import { BrainLogo } from "@/components/icons/brain-logo";

const features = [
  {
    number: "01",
    title: "Ephemeral Ingestion",
    subtitle: "ZERO-STORAGE ARCHITECTURE",
    description:
      "Upload PDFs and TXT files. They're parsed, chunked, embedded into a vector index, then discarded. No cloud bills, no file bloat, no privacy risk.",
    variant: "blue" as const,
  },
  {
    number: "02",
    title: "Hybrid Semantic Search",
    subtitle: "DUAL-INDEX QUERY ENGINE",
    description:
      "Every query runs simultaneously against your document chunks AND personal journal entries. Results are merged by relevance with provenance back to the source.",
    variant: "green" as const,
  },
  {
    number: "03",
    title: "AI Study Buddy",
    subtitle: "CONTEXT-AWARE CONVERSATION",
    description:
      "A tutor that answers exclusively from your own materials — no hallucination, no generic fluff. It suggests journal entries and quizzes based on what you discuss.",
    variant: "purple" as const,
  },
  {
    number: "04",
    title: "Blind-Spot Quizzes",
    subtitle: "AUTOMATED GAP DETECTION",
    description:
      "The engine compares what you've uploaded against what you've journaled. It generates targeted quizzes exposing exactly what you haven't internalized yet.",
    variant: "blue" as const,
  },
];

const steps = [
  {
    step: "01",
    title: "Upload & Ingest",
    lines: [
      "Drop a PDF or TXT into your topic folder",
      "Backend chunks & embeds in the background",
      "No files stored — zero-storage pipeline",
    ],
    variant: "blue" as const,
  },
  {
    step: "02",
    title: "Learn & Journal",
    lines: [
      "Study the material at your own pace",
      "Write journal entries about breakthroughs & bugs",
      "Each entry is embedded alongside source docs",
    ],
    variant: "green" as const,
  },
  {
    step: "03",
    title: "Search & Master",
    lines: [
      "Query your combined knowledge with AI",
      "Retrieve relevant chunks + journal context",
      "Generate blind-spot quizzes to lock it in",
    ],
    variant: "purple" as const,
  },
];

export default function Home() {
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-canvas">
      {/* ── NAV ── */}
      <nav className="w-full bg-surface border-b-2 border-ink sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-14 md:h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <BrainLogo
              size={24}
              className="md:size-[28px] transition-transform duration-200 group-hover:scale-110 animate-float-slow"
            />
            <span className="text-base md:text-lg font-black tracking-tight text-ink">
              CutOn
            </span>
          </Link>
          <div className="flex items-center gap-2 md:gap-3">
            <Link href="/login?register=true">
              <Button variant="primary" size="sm">
                Get Started
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ════════════════════════════════════════
         HERO
         ════════════════════════════════════════ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-green-start/40 via-blue-start/20 to-purple-start/30 animate-gradient-slow" />

        <div className="max-w-7xl mx-auto px-4 md:px-8 pt-12 pb-16 md:pt-24 md:pb-28">
          <div className="max-w-3xl">
            {/* Eyebrow badge */}
            <div className="inline-flex items-center gap-2 bg-surface border-2 border-ink rounded-[4px] px-3 py-1.5 shadow-hard mb-5 md:mb-6 animate-float">
              <span className="w-2 h-2 rounded-full bg-green-accent animate-pulse border border-ink shrink-0" />
              <span className="text-[10px] md:text-[11px] font-mono font-bold text-ink-muted uppercase tracking-wider">
                v0.1.0 — Hybrid RAG Engine
              </span>
            </div>

            <h1 className="text-[2.5rem] md:text-7xl lg:text-8xl font-black tracking-tighter text-ink leading-[0.9] mb-5 md:mb-6 animate-fade-up">
              Your knowledge,
              <br />
              <span className="text-green-accent">deconstructed.</span>
              <br />
              <span className="text-blue-accent">Reconstructed.</span>
            </h1>

            <p className="text-base md:text-xl text-ink-muted max-w-xl mb-7 md:mb-8 leading-relaxed animate-fade-up-1">
              CutOn transforms PDFs and personal notes into a queryable,
              provenance-tracked memory bank.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 animate-fade-up-2">
              <Link href="/login?register=true" className="w-full sm:w-auto">
                <Button variant="primary" size="lg" className="w-full sm:w-auto">
                  Start Learning Free →
                </Button>
              </Link>
              <Link href="/login" className="w-full sm:w-auto">
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  Sign In
                </Button>
              </Link>
            </div>

            <div className="flex flex-wrap gap-3 mt-8 md:mt-10 animate-fade-up-3">
              {["No files stored", "Provenance tracking", "OpenAPI backend"].map(
                (tag) => (
                  <span
                    key={tag}
                    className="text-[11px] font-mono font-bold text-ink-muted/60 bg-surface border border-border-subtle rounded-[4px] px-2.5 py-1"
                  >
                    {tag}
                  </span>
                )
              )}
            </div>
          </div>
        </div>

        <div className="absolute -bottom-8 -right-8 w-64 h-64 bg-gradient-to-br from-green-start/20 to-green-end/10 border-2 border-ink rounded-[4px] shadow-hard rotate-12 hidden lg:block animate-float-delayed" />
        <div className="absolute top-32 -right-4 w-32 h-32 bg-gradient-to-br from-blue-start/20 to-blue-end/10 border-2 border-ink rounded-[4px] shadow-hard -rotate-6 hidden lg:block animate-float" />
        <div className="absolute bottom-16 left-1/4 w-20 h-20 bg-gradient-to-br from-purple-start/20 to-purple-end/10 border-2 border-ink rounded-[4px] shadow-hard rotate-45 hidden lg:block animate-float-slow" />
      </section>

      {/* ════════════════════════════════════════
         FEATURES
         ════════════════════════════════════════ */}
      <section className="relative py-12 md:py-28">
        <div className="absolute inset-0 -z-10 bg-gradient-to-tr from-blue-start/20 via-transparent to-green-start/20" />

        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="mb-10 md:mb-14 animate-fade-up">
            <span className="text-[11px] font-mono font-bold text-ink-muted uppercase tracking-widest">
              Core Architecture
            </span>
            <h2 className="text-2xl md:text-5xl font-black tracking-tight text-ink mt-2">
              What makes CutOn different
            </h2>
            <div className="w-12 md:w-16 h-1.5 bg-green-accent mt-3 md:mt-4 border border-ink" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
            {features.map((f, i) => (
              <div key={f.number} className={`animate-fade-up-${Math.min(i + 1, 4)}`}>
                <SkillCard
                  title={`${f.number}. ${f.title}`}
                  description={f.description}
                  variant={f.variant}
                >
                  <span className="inline-block mt-3 text-[10px] font-mono font-bold text-ink-muted uppercase tracking-widest">
                    {f.subtitle}
                  </span>
                </SkillCard>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
         HOW IT WORKS
         ════════════════════════════════════════ */}
      <section className="relative py-12 md:py-28">
        <div className="absolute inset-0 -z-10 bg-gradient-to-bl from-purple-start/20 via-transparent to-blue-start/20" />

        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="mb-10 md:mb-14 animate-fade-up">
            <span className="text-[11px] font-mono font-bold text-ink-muted uppercase tracking-widest">
              Workflow
            </span>
            <h2 className="text-2xl md:text-5xl font-black tracking-tight text-ink mt-2">
              From upload to insight
            </h2>
            <div className="w-12 md:w-16 h-1.5 bg-blue-accent mt-3 md:mt-4 border border-ink" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
            {steps.map((s, i) => (
              <div key={s.step} className={`animate-fade-up-${Math.min(i + 1, 4)}`}>
                <SkillCard title={s.title} description="" variant={s.variant}>
                  <span
                    className={`text-3xl md:text-4xl font-black leading-none tracking-tighter block mb-4 ${
                      s.variant === "green"
                        ? "text-green-accent"
                        : s.variant === "blue"
                          ? "text-blue-accent"
                          : "text-purple-accent"
                    }`}
                  >
                    {s.step}
                  </span>
                  <ul className="space-y-2">
                    {s.lines.map((line) => (
                      <li key={line} className="flex items-start gap-2">
                        <span
                          className={`mt-1.5 w-1.5 h-1.5 rounded-full border border-ink shrink-0 ${
                            s.variant === "green"
                              ? "bg-green-accent"
                              : s.variant === "blue"
                                ? "bg-blue-accent"
                                : "bg-purple-accent"
                          }`}
                        />
                        <span className="text-sm font-medium text-ink/70 leading-relaxed">
                          {line}
                        </span>
                      </li>
                    ))}
                  </ul>
                </SkillCard>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
         STATS / TRUST
         ════════════════════════════════════════ */}
      <section className="relative py-12 md:py-28">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-green-start/20 via-purple-start/10 to-blue-start/20" />

        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="mb-10 md:mb-14 animate-fade-up">
            <span className="text-[11px] font-mono font-bold text-ink-muted uppercase tracking-widest">
              Why it works
            </span>
            <h2 className="text-2xl md:text-5xl font-black tracking-tight text-ink mt-2">
              Engineered for retention
            </h2>
            <div className="w-12 md:w-16 h-1.5 bg-purple-accent mt-3 md:mt-4 border border-ink" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { stat: "Zero", label: "Files Stored", sub: "Ephemeral ingestion pipeline discards files after embedding", accent: "text-green-accent" },
              { stat: "2×", label: "Search Indexes", sub: "Documents + journals searched concurrently with merged results", accent: "text-blue-accent" },
              { stat: "5-Step", label: "Workflow", sub: "Upload → chunk → embed → journal → query → quiz", accent: "text-purple-accent" },
              { stat: "100%", label: "Provenance Tracked", sub: "Every answer cites its source chunk and journal entry by ID", accent: "text-green-accent" },
            ].map((item, i) => (
              <div
                key={item.label}
                className={`rounded-[4px] bg-surface border-2 border-ink p-5 md:p-6 shadow-hard animate-fade-up-${Math.min(i + 1, 4)}`}
              >
                <span className={`text-2xl md:text-4xl font-black tracking-tight block mb-1 ${item.accent}`}>
                  {item.stat}
                </span>
                <p className="text-sm font-black text-ink mb-1 md:mb-2">{item.label}</p>
                <p className="text-xs font-medium text-ink-muted/70 leading-relaxed">{item.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
         CTA
         ════════════════════════════════════════ */}
      <section className="relative py-14 md:py-28">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-green-start/30 via-purple-start/20 to-blue-start/30 animate-gradient-slow" />

        <div className="max-w-7xl mx-auto px-4 md:px-8 text-center">
          <div className="mb-5 md:mb-6 inline-flex animate-float">
            <BrainLogo size={36} className="md:size-[48px]" />
          </div>
          <h2 className="text-2xl md:text-5xl font-black tracking-tight text-ink mb-3 md:mb-4 animate-fade-up">
            Stop collecting.
            <br />
            <span className="text-green-accent">Start knowing.</span>
          </h2>
          <p className="text-ink-muted text-base md:text-lg max-w-xl mx-auto mb-7 md:mb-8 leading-relaxed px-2 animate-fade-up-1">
            Turn your folder of PDFs and scattered notes into a living,
            queryable knowledge base.
          </p>
          <div className="animate-fade-up-2">
            <Link href="/login?register=true">
              <Button variant="primary" size="lg">
                Get Started Free →
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="w-full border-t-2 border-ink bg-surface">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-5 md:py-6 flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex items-center gap-2">
            <BrainLogo size={18} />
            <span className="text-sm font-bold text-ink">CutOn</span>
            <span className="text-xs font-mono text-ink-muted ml-2">v0.1.0</span>
          </div>
          <div className="flex gap-4 md:gap-5">
            {["docs", "status", "privacy"].map((item) => (
              <span
                key={item}
                className="text-[11px] font-mono font-bold text-ink-muted/50 hover:text-ink transition-colors cursor-pointer uppercase tracking-wider"
              >
                {item}
              </span>
            ))}
          </div>
          <span className="text-xs font-mono text-ink-muted/50">© {year}</span>
        </div>
      </footer>
    </div>
  );
}
