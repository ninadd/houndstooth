import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function TopNav({ email }: { email: string }) {
  const initial = email.charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-full bg-primary" />
          <span className="text-sm font-semibold tracking-tight">Portfolio</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex size-8 items-center justify-center rounded-full bg-muted text-sm font-medium text-foreground outline-none ring-ring focus-visible:ring-2">
            {initial}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
              {email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <form action="/auth/signout" method="post">
              <DropdownMenuItem
                render={
                  <button type="submit" className="w-full cursor-pointer" />
                }
              >
                Sign out
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
