"use client";

import { useState, Suspense, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BrainLogo } from "@/components/icons/brain-logo";
import { login, register, ApiError } from "@/lib/api";

// ---------------------------------------------------------------------------
// Hook that reads search params (must be inside Suspense)
// ---------------------------------------------------------------------------

function useAuthMode() {
  const searchParams = useSearchParams();
  return searchParams.get("register") === "true";
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

function LoginForm() {
  const router = useRouter();
  const isRegister = useAuthMode();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setLoading(true);

      try {
        if (isRegister) {
          await register({
            email,
            password,
            first_name: firstName,
            last_name: lastName,
          });
        } else {
          await login({ email, password });
        }
        // Redirect to dashboard on success
        router.push("/dashboard");
      } catch (err) {
        if (err instanceof ApiError) {
          const detail = err.detail;
          if (typeof detail === "string") {
            setError(detail);
          } else if (Array.isArray(detail)) {
            setError(detail.map((d: { msg: string }) => d.msg).join(", "));
          } else if (typeof detail === "object" && detail !== null) {
            setError(JSON.stringify(detail));
          } else {
            setError(`Request failed (${err.status})`);
          }
        } else {
          setError("Connection error. Is the server running?");
        }
      } finally {
        setLoading(false);
      }
    },
    [isRegister, email, password, firstName, lastName, router]
  );

  return (
    <div className="min-h-screen bg-canvas flex flex-col lg:flex-row">
      {/* ── LEFT: Brand panel (desktop only) ── */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-green-start via-blue-start/50 to-purple-start/30 border-r-2 border-ink relative overflow-hidden min-h-screen">
        <div
          className="absolute inset-0 animate-gradient-slow opacity-50"
          style={{
            backgroundImage:
              "linear-gradient(135deg, rgba(226,245,237,0.3), rgba(224,236,248,0.2), rgba(240,232,248,0.3))",
            backgroundSize: "200% 200%",
          }}
        />
        <div className="relative z-10 flex flex-col justify-between p-10 xl:p-12">
          <Link href="/" className="flex items-center gap-2.5">
            <BrainLogo size={28} />
            <span className="text-xl font-black text-ink">CutOn</span>
          </Link>
          <div className="max-w-sm">
            <div className="inline-flex items-center gap-2 bg-surface border-2 border-ink rounded-[4px] px-3 py-1.5 shadow-hard mb-6">
              <span className="w-2 h-2 rounded-full bg-green-accent animate-pulse border border-ink shrink-0" />
              <span className="text-[11px] font-mono font-bold text-ink-muted uppercase tracking-wider">
                Hybrid RAG Engine
              </span>
            </div>
            <blockquote className="text-xl font-black text-ink leading-snug">
              &ldquo;The best way to learn is to teach yourself — with a
              system that remembers everything.&rdquo;
            </blockquote>
            <p className="text-sm font-mono text-ink-muted mt-4">
              — CutOn Core Philosophy
            </p>
          </div>
          <div className="flex flex-wrap gap-4 text-xs font-mono font-bold text-ink-muted/50">
            <span>PDF Ingestion</span>
            <span>Semantic Search</span>
            <span>Blind-Spot Quizzes</span>
          </div>
        </div>
      </div>

      {/* ── RIGHT: Form ── */}
      <div className="flex-1 flex items-center justify-center p-5 md:p-8 lg:p-6">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <Link
            href="/"
            className="flex items-center gap-2 lg:hidden mb-6 md:mb-8"
          >
            <BrainLogo size={24} />
            <span className="text-lg font-black text-ink">CutOn</span>
          </Link>

          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-ink mb-1">
            {isRegister ? "Create account" : "Welcome back"}
          </h1>
          <p className="text-sm text-ink-muted mb-6 md:mb-8">
            {isRegister
              ? "Start building your personal knowledge repository."
              : "Sign in to access your knowledge base."}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-3">
                <div className="flex-1">
                  <label
                    htmlFor="firstName"
                    className="block text-xs font-mono font-bold text-ink-muted uppercase tracking-wider mb-1.5"
                  >
                    First name
                  </label>
                  <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Ada"
                    required
                    className="w-full h-12 px-3.5 bg-surface border-2 border-ink rounded-[4px] text-sm font-medium text-ink placeholder:text-ink-muted/40 focus:outline-none focus:ring-2 focus:ring-green-accent/30 transition-all"
                  />
                </div>
                <div className="flex-1">
                  <label
                    htmlFor="lastName"
                    className="block text-xs font-mono font-bold text-ink-muted uppercase tracking-wider mb-1.5"
                  >
                    Last name
                  </label>
                  <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Lovelace"
                    required
                    className="w-full h-12 px-3.5 bg-surface border-2 border-ink rounded-[4px] text-sm font-medium text-ink placeholder:text-ink-muted/40 focus:outline-none focus:ring-2 focus:ring-green-accent/30 transition-all"
                  />
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="block text-xs font-mono font-bold text-ink-muted uppercase tracking-wider mb-1.5"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full h-12 px-3.5 bg-surface border-2 border-ink rounded-[4px] text-sm font-medium text-ink placeholder:text-ink-muted/40 focus:outline-none focus:ring-2 focus:ring-green-accent/30 transition-all"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-mono font-bold text-ink-muted uppercase tracking-wider mb-1.5"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full h-12 px-3.5 bg-surface border-2 border-ink rounded-[4px] text-sm font-medium text-ink placeholder:text-ink-muted/40 focus:outline-none focus:ring-2 focus:ring-green-accent/30 transition-all"
              />
            </div>

            {error && (
              <div className="rounded-[4px] border-2 border-red-400 bg-red-50 p-3">
                <p className="text-xs font-mono font-bold text-red-600">
                  {error}
                </p>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              size="lg"
              disabled={loading}
            >
              {loading ? "Please wait\u2026" : isRegister ? "Create Account" : "Sign In"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs font-mono text-ink-muted">
              {isRegister
                ? "Already have an account?"
                : "Don\u2019t have an account?"}{" "}
              <Link
                href={isRegister ? "/login" : "/login?register=true"}
                className="font-bold text-ink underline underline-offset-2 hover:text-green-accent transition-colors"
              >
                {isRegister ? "Sign In" : "Get Started"}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page export — Suspense boundary for useSearchParams()
// ---------------------------------------------------------------------------

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-canvas flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-green-accent animate-pulse border border-ink" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
