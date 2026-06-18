import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-[4px] text-sm font-bold border-2 border-ink transition-all duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 disabled:pointer-events-none disabled:opacity-40 active:translate-x-[1px] active:translate-y-[1px] active:shadow-hard-active",
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-br from-green-start to-green-end text-ink shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover",
        secondary:
          "bg-gradient-to-br from-blue-start to-blue-end text-ink shadow-hard hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-hover",
        ghost:
          "bg-transparent text-ink-muted hover:text-ink hover:bg-canvas border-2 border-transparent hover:border-border-subtle",
        outline:
          "bg-surface text-ink border-2 border-ink hover:bg-card-hover",
      },
      size: {
        default: "h-11 px-5 py-2.5",
        sm: "h-9 rounded-[4px] px-3.5 text-xs",
        lg: "h-14 rounded-[4px] px-8 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
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
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
