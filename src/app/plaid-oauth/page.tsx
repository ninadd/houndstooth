"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink, type PlaidLinkOnSuccess } from "react-plaid-link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { LINK_TOKEN_KEY, exchangePublicToken } from "@/lib/plaid-link";

/**
 * OAuth redirect landing page. Plaid sends the user here (with an
 * `?oauth_state_id=` param) after they authenticate at their bank. We resume
 * Link with the original link_token (from localStorage) plus the full received
 * redirect URI, then auto-open to complete the connection.
 */
export default function PlaidOAuthPage() {
  const router = useRouter();

  // Read synchronously on the client so there's no setState-in-effect; SSR
  // renders the same static "finishing" UI, so no hydration mismatch.
  const [token] = useState<string | null>(() =>
    typeof window === "undefined" ? null : localStorage.getItem(LINK_TOKEN_KEY),
  );
  const receivedRedirectUri =
    typeof window === "undefined" ? undefined : window.location.href;

  const finish = useCallback(() => {
    localStorage.removeItem(LINK_TOKEN_KEY);
    router.replace("/");
  }, [router]);

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (public_token) => {
      try {
        const data = await exchangePublicToken(public_token);
        toast.success(
          `Linked. Synced ${data.accounts} accounts, ${data.holdings} holdings.`,
        );
      } catch {
        toast.error("Failed to finish linking.");
      } finally {
        finish();
      }
    },
    [finish],
  );

  const { open, ready } = usePlaidLink({
    token,
    receivedRedirectUri,
    onSuccess,
    onExit: finish,
  });

  // Resume Link as soon as it's ready.
  useEffect(() => {
    if (token && ready) open();
  }, [token, ready, open]);

  // No token to resume with — nothing to do here.
  useEffect(() => {
    if (!token) router.replace("/");
  }, [token, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="size-6 animate-spin text-primary" />
      <p className="text-sm">Finishing your bank connection…</p>
    </main>
  );
}
