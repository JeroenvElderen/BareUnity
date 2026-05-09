import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-[var(--touch-target)] items-center justify-center rounded-xl text-sm font-semibold transition-[background,box-shadow,transform,color,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--card))] active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[rgb(var(--brand))] text-white shadow-[0_10px_22px_rgb(var(--brand)/0.22)] hover:bg-[rgb(var(--brand-2))]",
        outline:
          "border border-[rgb(var(--border))] bg-[rgb(var(--card)/0.92)] text-[rgb(var(--text-strong))] hover:border-[rgb(var(--brand)/0.45)] hover:bg-[rgb(var(--bg-soft))]",
        secondary:
          "bg-[rgb(var(--accent-soft)/0.84)] text-[rgb(var(--text-strong))] hover:bg-[rgb(var(--accent))]",
      },
      size: {
        default: "min-h-11 px-4 py-2",
        sm: "min-h-10 rounded-xl px-3",
        lg: "min-h-12 rounded-xl px-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
