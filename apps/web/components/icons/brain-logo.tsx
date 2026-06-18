import * as React from "react";
import { cn } from "@/lib/utils";

interface BrainLogoProps extends React.SVGAttributes<SVGSVGElement> {
  size?: number;
}

export function BrainLogo({ size = 32, className, ...props }: BrainLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      {...props}
    >
      {/* Brain left hemisphere */}
      <path
        d="M16 4C10 4 6 8 6 13c0 3 1.5 5.5 3.5 7.5l-1 3.5 4-2A9 9 0 0016 23c5 0 9-4 9-9s-4-9-9-9z"
        className="fill-green-accent/20 stroke-ink"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Brain right hemisphere overlay */}
      <path
        d="M16 4c6 0 10 4 10 9 0 3-1.5 5.5-3.5 7.5l1 3.5-4-2A9 9 0 0116 23"
        className="fill-blue-accent/20 stroke-ink"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Neural nodes and connections */}
      <circle cx="12" cy="10" r="1.2" className="fill-green-accent stroke-ink" strokeWidth="0.8" />
      <circle cx="20" cy="10" r="1.2" className="fill-blue-accent stroke-ink" strokeWidth="0.8" />
      <circle cx="16" cy="14" r="1.2" className="fill-purple-accent stroke-ink" strokeWidth="0.8" />
      <circle cx="12" cy="17" r="1" className="fill-green-accent stroke-ink" strokeWidth="0.8" />
      <circle cx="20" cy="17" r="1" className="fill-blue-accent stroke-ink" strokeWidth="0.8" />
      {/* Neural lines */}
      <path d="M12 10l4 4" className="stroke-ink" strokeWidth="0.8" opacity="0.5" />
      <path d="M20 10l-4 4" className="stroke-ink" strokeWidth="0.8" opacity="0.5" />
      <path d="M12 17l4-3" className="stroke-ink" strokeWidth="0.8" opacity="0.4" />
      <path d="M20 17l-4-3" className="stroke-ink" strokeWidth="0.8" opacity="0.4" />
      <path d="M12 17l-2-4" className="stroke-ink" strokeWidth="0.8" opacity="0.3" />
      <path d="M20 17l2-4" className="stroke-ink" strokeWidth="0.8" opacity="0.3" />
      {/* Center synapse glow */}
      <circle cx="16" cy="14" r="0.5" className="fill-ink" />
    </svg>
  );
}
