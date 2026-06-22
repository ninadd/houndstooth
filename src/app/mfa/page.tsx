"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { trustThisDevice } from "@/lib/actions/mfa";
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

export default function MfaPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [code, setCode] = useState("");
  const [trust, setTrust] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factorId = factors?.totp?.[0]?.id;
    if (!factorId) {
      setError("No authenticator enrolled.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code,
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Session is now aal2 — optionally remember this device for 30 days.
    if (trust) await trustThisDevice();

    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-xl">Two-factor authentication</CardTitle>
          <CardDescription>
            Enter the code from your authenticator app
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
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
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="size-4"
                checked={trust}
                onChange={(e) => setTrust(e.target.checked)}
              />
              Trust this device for 30 days
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Verifying…" : "Verify"}
            </Button>
          </form>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="ghost" className="w-full">
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
