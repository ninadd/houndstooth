import Link from "next/link";
import { HoundstoothLogo } from "@/components/houndstooth-logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
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
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md outline-none ring-ring focus-visible:ring-2"
        >
          <HoundstoothLogo className="size-8 text-primary" />
          <span className="text-xl font-semibold tracking-tight">Houndstooth</span>
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger className="flex size-8 items-center justify-center rounded-full bg-muted text-sm font-medium text-foreground outline-none ring-ring focus-visible:ring-2">
            {initial}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {/* DropdownMenuLabel maps to Base UI's Menu.GroupLabel, which must
                live inside a Group — otherwise opening the menu throws. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                {email}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                render={
                  <Link href="/accounts" className="w-full cursor-pointer" />
                }
              >
                Accounts
              </DropdownMenuItem>
              <DropdownMenuItem
                render={
                  <Link
                    href="/account/security"
                    className="w-full cursor-pointer"
                  />
                }
              >
                Security
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <form action="/auth/signout" method="post">
                <DropdownMenuItem
                  nativeButton
                  render={
                    <button type="submit" className="w-full cursor-pointer" />
                  }
                >
                  Sign out
                </DropdownMenuItem>
              </form>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
