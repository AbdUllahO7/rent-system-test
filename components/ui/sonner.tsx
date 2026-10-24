"use client";

import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

export function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-neutral-900 group-[.toaster]:text-neutral-100 group-[.toaster]:border-neutral-800 group-[.toaster]:shadow-xl",
          description: "group-[.toast]:text-neutral-400",
          actionButton:
            "group-[.toast]:bg-emerald-600 group-[.toast]:text-white",
          cancelButton:
            "group-[.toast]:bg-neutral-800 group-[.toast]:text-neutral-400",
          error: "group-[.toaster]:border-rose-500/40 group-[.toaster]:bg-neutral-900 group-[.toaster]:text-rose-300",
          success: "group-[.toaster]:border-emerald-500/40 group-[.toaster]:bg-neutral-900 group-[.toaster]:text-emerald-300",
        },
      }}
      {...props}
    />
  );
}
