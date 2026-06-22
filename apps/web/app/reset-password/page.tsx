"use client";

import { useState, Suspense, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BrainLogo } from "@/components/icons/brain-logo";
import { resetPassword, ApiError } from "@/lib/api";

// ---------------------------------------------------------------------------
// Hook that reads search params (must be inside Suspense)
// ---------------------------------------------------------------------------

function useResetParams() {
  const searchParams = useSearchParams();
  return {
    token: searchParams.get("token") || "",
    email: searchParams.get("email") || "",
  };
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

function ResetPasswordForm() {
  const router = useRouter();
  const { token, email } = useResetParams();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (newPassword.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }

      if (newPassword !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }

      if (!token) {
        setError("Invalid or missing reset token.");
        return;
      }

      setLoading(true);

      try {
        await resetPassword({ token, new_password: newPassword });
        setSuccess(true);
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
    [token, newPassword, confirmPassword]
  );

  // Show success confirmation
  if (success) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col lg:flex-row">
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
                  Password Reset
                </span>
              </div>
              <blockquote className="text-xl font-black text-ink leading-snug">
                &ldquo;Your password has been successfully reset.&rdquo;
              </blockquote>
            </div>
            <div className="flex flex-wrap gap-4 text-xs font-mono font-bold text-ink-muted/50">
              <span>Secure</span>
              <span>Encrypted</span>
              <span>Protected</span>
            </div>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-5 md:p-8 lg:p-6">
          <div className="w-full max-w-sm text-center">
            <Link href="/" className="flex items-center gap-2 lg:hidden mb-6 md:mb-8 justify-center">
              <BrainLogo size={24} />
              <span className="text-lg font-black text-ink">CutOn</span>
            </Link>

            <div className="w-12 h-12 rounded-full bg-green-start border-2 border-ink flex items-center justify-center mx-auto mb-4 shadow-hard">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M4 10l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-accent" />
              </svg>
            </div>

            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-ink mb-2">
              Password Reset
            </h1>
            <p className="text-sm text-ink-muted mb-8">
              Your password has been successfully reset. You can now sign in with your new password.
            </p>

            <Button
              onClick={() => router.push("/login")}
              variant="primary"
              className="w-full"
              size="lg"
            >
              Sign In
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas flex flex-col lg:flex-row">
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
                Create New Password
              </span>
            </div>
            <blockquote className="text-xl font-black text-ink leading-snug">
              &ldquo;Choose a strong, unique password that you don&rsquo;t use elsewhere.&rdquo;
            </blockquote>
            <p className="text-sm font-mono text-ink-muted mt-4">
              &bull; CutOn Security
            </p>
          </div>
          <div className="flex flex-wrap gap-4 text-xs font-mono font-bold text-ink-muted/50">
            <span>8+ Characters</span>
            <span>Encrypted</span>
            <span>Secure</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-5 md:p-8 lg:p-6">
        <div className="w-full max-w-sm">
          <Link href="/" className="flex items-center gap-2 lg:hidden mb-6 md:mb-8">
            <BrainLogo size={24} />
            <span className="text-lg font-black text-ink">CutOn</span>
          </Link>

          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-ink mb-1">
            Reset your password
          </h1>
          <p className="text-sm text-ink-muted mb-6 md:mb-8">
            {email
              ? `Enter a new password for ${email}.`
              : "Enter a new password for your account."}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="newPassword"
                className="block text-xs font-mono font-bold text-ink-muted uppercase tracking-wider mb-1.5"
              >
                New password
              </label>
              <input
                id="newPassword"
                name="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
                className="w-full h-12 px-3.5 bg-surface border-2 border-ink rounded-[4px] text-sm font-medium text-ink placeholder:text-ink-muted/40 focus:outline-none focus:ring-2 focus:ring-green-accent/30 transition-all"
              />
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-xs font-mono font-bold text-ink-muted uppercase tracking-wider mb-1.5"
              >
                Confirm password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your new password"
                required
                minLength={8}
                className="w-full h-12 px-3.5 bg-surface border-2 border-ink rounded-[4px] text-sm font-medium text-ink placeholder:text-ink-muted/40 focus:outline-none focus:ring-2 focus:ring-green-accent/30 transition-all"
              />
            </div>

            {error && (
              <div className="rounded-[4px] border-2 border-red-400 bg-red-50 p-3">
                <p className="text-xs font-mono font-bold text-red-600">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              size="lg"
              disabled={loading || !token}
            >
              {loading ? "Resetting..." : "Reset Password"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs font-mono text-ink-muted">
              Remember your password?{" "}
              <Link
                href="/login"
                className="font-bold text-ink underline underline-offset-2 hover:text-green-accent transition-colors"
              >
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-canvas flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-green-accent animate-pulse border border-ink" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
