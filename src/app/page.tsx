import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopNav } from "@/components/dashboard/top-nav";
import { HeroCharts } from "@/components/dashboard/hero-charts";
import { AllocationCards } from "@/components/dashboard/allocation-cards";
import { Card, CardContent } from "@/components/ui/card";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already guards this, but be defensive.
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <TopNav email={user.email ?? "account"} />

      <main className="mx-auto max-w-5xl space-y-10 px-4 py-8 sm:px-6">
        <HeroCharts />

        <AllocationCards />

        {/* Accounts placeholder — populated in Milestone 2 (Plaid). */}
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Connect your institutions to see live accounts here.
            <div className="mt-1 text-xs">Coming in Milestone 2.</div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
