import { Drawer } from "vaul";
import type { ReactNode } from "react";

export function Sheet({
  open,
  onOpenChange,
  children,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  title: string;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-foreground/35 backdrop-blur-[1px]" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-[var(--radius-panel)] border-t border-border bg-background outline-none">
          <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-foreground/15" />
          <Drawer.Title className="px-6 pb-2 pt-5 text-2xl font-medium leading-none tracking-tight">{title}</Drawer.Title>
          <div className="overflow-y-auto px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
