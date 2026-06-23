"use client";

import type { ReactNode } from "react";

// Wraps a server-action form so the browser's native confirm dialog gates
// submission. Per CLAUDE.md, every destructive caregiver action is
// confirmed; this is the simplest no-modal way to enforce that without
// pulling in a UI library or building a multi-step flow.
export function ConfirmingForm({
  action,
  message,
  children,
  className,
}: {
  action: (formData: FormData) => void | Promise<void>;
  message: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
      className={className}
    >
      {children}
    </form>
  );
}
