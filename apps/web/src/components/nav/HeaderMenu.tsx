"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

const itemClass = "block px-4 py-2 text-sm hover:bg-neutral-50 whitespace-nowrap";
const logoutItemClass = `${itemClass} w-full text-left text-neutral-500`;

function Dropdown({
  label,
  align,
  children,
}: {
  label: string;
  align: "desktop" | "mobile";
  children: ReactNode;
}) {
  if (align === "mobile") {
    return (
      <details className="group">
        <summary className="cursor-pointer list-none px-4 py-2 text-sm font-medium marker:content-none [&::-webkit-details-marker]:hidden">
          {label}
        </summary>
        <div className="flex flex-col border-t border-neutral-100">
          {children}
        </div>
      </details>
    );
  }

  return (
    <details className="relative">
      <summary className="cursor-pointer list-none px-1 py-1 text-sm underline marker:content-none [&::-webkit-details-marker]:hidden">
        {label}
      </summary>
      <div className="absolute right-0 z-20 mt-2 min-w-[10rem] rounded-md border border-neutral-200 bg-white py-1 shadow-md">
        {children}
      </div>
    </details>
  );
}

export function HeaderMenu({
  isAuthenticated,
  isSystemAdmin,
}: {
  isAuthenticated: boolean;
  isSystemAdmin: boolean;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const router = useRouter();
  const { canInstall, promptInstall } = useInstallPrompt();

  async function handleLogout() {
    await fetch("/api/auth/session", { method: "DELETE" });
    setMobileOpen(false);
    router.push("/");
    router.refresh();
  }

  function aboutItems(onNavigate?: () => void) {
    return (
      <>
        <Link href="/about" className={itemClass} onClick={onNavigate}>
          About
        </Link>
        <Link href="/about/usage" className={itemClass} onClick={onNavigate}>
          Usage
        </Link>
        <Link href="/about/guidelines" className={itemClass} onClick={onNavigate}>
          Guidelines
        </Link>
        <Link href="/about/origins" className={itemClass} onClick={onNavigate}>
          Origins
        </Link>
      </>
    );
  }

  function accountItems(onNavigate?: () => void) {
    return (
      <>
        <Link href="/me" className={itemClass} onClick={onNavigate}>
          My profile
        </Link>
        {isSystemAdmin && (
          <Link href="/admin" className={itemClass} onClick={onNavigate}>
            Admin
          </Link>
        )}
        <button type="button" onClick={handleLogout} className={logoutItemClass}>
          Log out
        </button>
      </>
    );
  }

  return (
    <>
      <nav className="hidden items-center gap-4 md:flex">
        {canInstall && (
          <button
            type="button"
            onClick={promptInstall}
            className="text-sm underline"
          >
            Install app
          </button>
        )}
        <Dropdown label="About" align="desktop">
          {aboutItems()}
        </Dropdown>
        {isAuthenticated ? (
          <Dropdown label="My profile" align="desktop">
            {accountItems()}
          </Dropdown>
        ) : (
          <Link href="/login" className="text-sm underline">
            Sign in
          </Link>
        )}
      </nav>

      <div className="relative md:hidden">
        <button
          type="button"
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
          className="flex h-8 w-8 flex-col items-center justify-center gap-1"
        >
          <span className="h-0.5 w-5 bg-neutral-700" />
          <span className="h-0.5 w-5 bg-neutral-700" />
          <span className="h-0.5 w-5 bg-neutral-700" />
        </button>

        {mobileOpen && (
          <div className="absolute right-0 top-full z-20 flex w-56 flex-col divide-y divide-neutral-100 border border-neutral-200 bg-white shadow-md">
            <Dropdown label="About" align="mobile">
              {aboutItems(() => setMobileOpen(false))}
            </Dropdown>
            {isAuthenticated ? (
              <Dropdown label="My profile" align="mobile">
                {accountItems(() => setMobileOpen(false))}
              </Dropdown>
            ) : (
              <Link
                href="/login"
                className="px-4 py-2 text-sm font-medium"
                onClick={() => setMobileOpen(false)}
              >
                Sign in
              </Link>
            )}
            {canInstall && (
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  promptInstall();
                }}
                className="px-4 py-2 text-left text-sm font-medium"
              >
                Install app
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
