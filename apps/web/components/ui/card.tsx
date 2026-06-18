import * as React from "react";
import { cn } from "@/lib/utils";

interface SkillCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description: string;
  variant?: "green" | "blue" | "purple";
}

const variantStyles = {
  green: {
    bg: "bg-gradient-to-br from-green-start to-green-end",
    border: "border-ink",
    accent: "text-green-accent",
  },
  blue: {
    bg: "bg-gradient-to-br from-blue-start to-blue-end",
    border: "border-ink",
    accent: "text-blue-accent",
  },
  purple: {
    bg: "bg-gradient-to-br from-purple-start to-purple-end",
    border: "border-ink",
    accent: "text-purple-accent",
  },
};

export function SkillCard({
  title,
  description,
  variant = "green",
  className,
  children,
  ...props
}: SkillCardProps) {
  const s = variantStyles[variant];

  return (
    <div
      className={cn(
        "w-full rounded-[4px] p-6 border-2 transition-all duration-150 shadow-hard hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-hard-hover",
        s.bg,
        s.border,
        className
      )}
      {...props}
    >
      <h3 className={cn("text-base font-black tracking-tight mb-2", s.accent)}>
        {title}
      </h3>
      {description && (
        <p className="text-sm font-medium text-ink/70 leading-relaxed">
          {description}
        </p>
      )}
      {children}
    </div>
  );
}
