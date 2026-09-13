import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] text-sm font-medium tracking-wide transition-[background-color,color,box-shadow,transform] duration-[var(--dur-base)] ease-[var(--ease-out)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/45 disabled:pointer-events-none disabled:opacity-40 min-h-11 px-4 active:scale-[0.99]",
  {
    variants: {
      variant: {
        default: "bg-signal text-signal-foreground hover:brightness-110",
        secondary: "bg-transparent text-foreground border border-border hover:bg-foreground/[0.03]",
        ghost: "text-muted hover:text-foreground hover:bg-foreground/[0.04]",
        danger: "bg-danger text-white",
        outline: "border border-border bg-transparent hover:bg-foreground/[0.03]",
        /** @deprecated alias → signal */
        gold: "bg-signal text-signal-foreground hover:brightness-110",
      },
      size: {
        default: "h-11",
        icon: "h-11 w-11 px-0",
        sm: "h-9 px-3 text-xs",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
