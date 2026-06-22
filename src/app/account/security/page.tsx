"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SecurityPage() {
  const [supabase] = useState(() => createClient());
  const [hasFactor, setHasFactor] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) =>
      setHasFactor((data?.totp?.length ?? 0) > 0),
    );
  }, [supabase]);

  async function startEnroll() {
    setError(null);
    setBusy(true);
    try {
      // Clear any leftover unverified factor from a prior attempt.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      for (const f of existing?.all ?? []) {
        if (f.status === "unverified") {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Authenticator",
      });
      if (error) {
        setError(error.message);
        return;
      }
      setFactorId(data.id);
      setQr(data.totp.qr_code); // SVG data-URI
      setSecret(data.totp.secret); // manual-entry fallback
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setError(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code,
      });
      if (error) {
        setError(error.message);
        return;
      }
      setHasFactor(true);
      setQr(null);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (
      !window.confirm("Disable two-factor authentication for your account?")
    ) {
      return;
    }
    setBusy(true);
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      for (const f of data?.all ?? []) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      setHasFactor(false);
      setQr(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <Card>
        <CardHeader>
          <CardTitle>Two-factor authentication</CardTitle>
          <CardDescription>
            Protect your account with an authenticator app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasFactor ? (
            <>
              <p className="text-sm text-muted-foreground">2FA is enabled.</p>
              <Button variant="destructive" onClick={disable} disabled={busy}>
                Disable 2FA
              </Button>
            </>
          ) : qr ? (
            <form onSubmit={confirmEnroll} className="space-y-4">
              <p className="text-sm">Scan with your authenticator app:</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- QR is an inline SVG data-URI */}
              <img src={qr} alt="TOTP QR code" className="h-44 w-44" />
              {secret && (
                <p className="break-all text-xs text-muted-foreground">
                  Manual key: <code>{secret}</code>
                </p>
              )}
              <div className="space-y-2">
                <Label htmlFor="code">6-digit code</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={busy}>
                {busy ? "Verifying…" : "Verify & enable"}
              </Button>
            </form>
          ) : (
            <>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button onClick={startEnroll} disabled={busy}>
                {busy ? "Setting up…" : "Enable 2FA"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
