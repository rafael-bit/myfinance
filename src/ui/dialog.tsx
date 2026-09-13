import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-[1px] data-[state=open]:animate-in" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[min(100%-2rem,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-panel)] border border-border bg-card p-5 shadow-lg outline-none",
          )}
        >
          <Dialog.Title className="text-lg font-medium tracking-tight">{title}</Dialog.Title>
          {description ? <Dialog.Description className="mt-2 text-sm leading-6 text-muted">{description}</Dialog.Description> : null}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {cancelLabel}
            </Button>
            <Button
              variant={danger ? "danger" : "default"}
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function AppDialog({
  open,
  onOpenChange,
  title,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-[1px]" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 max-h-[85dvh] w-[min(100%-2rem,28rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[var(--radius-panel)] border border-border bg-card p-5 outline-none",
            className,
          )}
        >
          <Dialog.Title className="mb-4 text-xl font-medium tracking-tight">{title}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
