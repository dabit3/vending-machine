"use client";

import { useSyncExternalStore } from "react";
import { UserButton } from "@clerk/nextjs";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

const subscribe = () => () => {};

export default function ProfileMenu() {
  const { resolvedTheme, forcedTheme, setTheme } = useTheme();
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
  const canSwitchTheme =
    hydrated &&
    !forcedTheme &&
    (resolvedTheme === "dark" || resolvedTheme === "light");

  return (
    <UserButton>
      <UserButton.MenuItems>
        <UserButton.Action label="manageAccount" />
        {canSwitchTheme && (
          <UserButton.Action
            key={nextTheme}
            label={`Switch to ${nextTheme} mode`}
            labelIcon={
              nextTheme === "light" ? <Sun aria-hidden /> : <Moon aria-hidden />
            }
            onClick={() => setTheme(nextTheme)}
          />
        )}
        <UserButton.Action label="signOut" />
      </UserButton.MenuItems>
    </UserButton>
  );
}
