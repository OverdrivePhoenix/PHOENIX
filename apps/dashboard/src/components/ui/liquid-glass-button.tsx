import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// ================= Standard Shadcn Button =================
const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-on-primary shadow hover:bg-primary/90 active:scale-[0.98]",
        destructive:
          "bg-red-500/90 text-white shadow-sm hover:bg-red-600 active:scale-[0.98]",
        outline:
          "border border-white/10 bg-surface-container/40 hover:bg-surface-container hover:text-white active:scale-[0.98]",
        secondary:
          "bg-white/10 text-white shadow-sm hover:bg-white/15 active:scale-[0.98]",
        ghost:
          "hover:bg-white/10 hover:text-white",
        link:
          "text-primary underline-offset-4 hover:underline",
        glass:
          "bg-white/[0.06] hover:bg-white/[0.12] text-white border border-white/10 backdrop-blur-md shadow-[0_4px_16px_rgba(0,0,0,0.4)] active:scale-[0.98]"
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-7 rounded-md px-2.5 text-xs",
        lg: "h-11 rounded-xl px-6 text-base",
        icon: "h-8 w-8 rounded-full p-0 flex items-center justify-center",
        pill: "h-7 px-3 rounded-full text-xs"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
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

// ================= Liquid Glass Filter (Inline SVG) =================
let filterInjected = false;
export const LiquidGlassSvgFilter: React.FC = () => {
  return (
    <svg
      className="pointer-events-none absolute h-0 w-0 overflow-hidden"
      aria-hidden="true"
      style={{ position: "absolute", width: 0, height: 0 }}
    >
      <defs>
        <filter id="container-glass" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.04 0.07"
            numOctaves="3"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="7"
            xChannelSelector="R"
            yChannelSelector="G"
            result="displaced"
          />
          <feGaussianBlur in="displaced" stdDeviation="0.4" result="blurred" />
          <feComposite in="SourceGraphic" in2="blurred" operator="atop" />
        </filter>
      </defs>
    </svg>
  );
};

// ================= LiquidButton =================
const liquidbuttonVariants = cva(
  "group relative inline-flex items-center justify-center overflow-hidden rounded-xl font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer active:scale-[0.97]",
  {
    variants: {
      variant: {
        default:
          "text-white/90 hover:text-white bg-gradient-to-b from-white/[0.14] via-white/[0.05] to-white/[0.02] border border-white/[0.18] shadow-[0_8px_24px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.3)] backdrop-blur-xl",
        primary:
          "text-blue-100 hover:text-white bg-gradient-to-b from-blue-500/[0.30] via-blue-600/[0.15] to-blue-900/[0.25] border border-blue-400/[0.35] shadow-[0_8px_24px_rgba(37,99,235,0.35),inset_0_1px_2px_rgba(255,255,255,0.4)] backdrop-blur-xl",
        emerald:
          "text-emerald-100 hover:text-white bg-gradient-to-b from-emerald-500/[0.30] via-emerald-600/[0.15] to-emerald-950/[0.3] border border-emerald-400/[0.35] shadow-[0_8px_24px_rgba(16,185,129,0.3),inset_0_1px_2px_rgba(255,255,255,0.4)] backdrop-blur-xl",
        amber:
          "text-amber-100 hover:text-white bg-gradient-to-b from-amber-500/[0.32] via-amber-600/[0.15] to-amber-950/[0.3] border border-amber-400/[0.4] shadow-[0_8px_24px_rgba(245,158,11,0.3),inset_0_1px_2px_rgba(255,255,255,0.4)] backdrop-blur-xl",
        destructive:
          "text-red-100 hover:text-white bg-gradient-to-b from-red-500/[0.35] via-red-600/[0.18] to-red-950/[0.35] border border-red-400/[0.4] shadow-[0_8px_24px_rgba(239,68,68,0.35),inset_0_1px_2px_rgba(255,255,255,0.4)] backdrop-blur-xl"
      },
      size: {
        sm: "h-7 px-3 text-xs gap-1.5 rounded-lg",
        default: "h-9 px-4 text-sm gap-2 rounded-xl",
        lg: "h-11 px-5 text-base gap-2.5 rounded-2xl",
        icon: "h-8 w-8 p-0 rounded-full flex items-center justify-center",
        pill: "h-7 px-3 rounded-full text-xs gap-1.5"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface LiquidButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof liquidbuttonVariants> {
  asChild?: boolean;
  glow?: boolean;
}

const LiquidButton = React.forwardRef<HTMLButtonElement, LiquidButtonProps>(
  ({ className, variant, size, glow = true, asChild = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <>
        {/* Mount glass filter if not yet included */}
        <LiquidGlassSvgFilter />
        <Comp
          className={cn(liquidbuttonVariants({ variant, size, className }))}
          ref={ref}
          style={{
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)"
          }}
          {...props}
        >
          {/* Liquid Distortion & Specular Highlights */}
          <span
            className="pointer-events-none absolute inset-0 opacity-60 mix-blend-overlay transition-opacity duration-300 group-hover:opacity-100"
            style={{ filter: "url(#container-glass)" }}
          />

          {/* Fluid ambient sheen animation on hover */}
          <span className="pointer-events-none absolute -inset-[100%] z-0 translate-x-[-100%] rotate-45 bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 ease-in-out group-hover:translate-x-[100%]" />

          {/* Top highlight refraction edge */}
          <span className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-80 group-hover:opacity-100" />

          {/* Bottom subtle ambient shade */}
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[1px] bg-black/40" />

          {/* Content */}
          <span className="relative z-10 flex items-center justify-center gap-1.5 font-medium tracking-tight">
            {children}
          </span>
        </Comp>
      </>
    );
  }
);
LiquidButton.displayName = "LiquidButton";

// ================= MetalButton =================
export interface MetalButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?: "titanium" | "dark" | "gold" | "steel";
  size?: "sm" | "default" | "lg" | "icon" | "pill";
}

const MetalButton = React.forwardRef<HTMLButtonElement, MetalButtonProps>(
  (
    {
      className,
      variant = "dark",
      size = "default",
      asChild = false,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";

    const variantStyles = {
      titanium:
        "text-neutral-200 border-neutral-600/50 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-600 via-neutral-800 to-neutral-900 shadow-[inset_0_1px_1px_rgba(255,255,255,0.35),0_6px_16px_rgba(0,0,0,0.6)] hover:from-neutral-500 hover:via-neutral-700 hover:to-neutral-800 hover:text-white",
      dark:
        "text-white/90 border-white/[0.12] bg-gradient-to-b from-[#26282E] via-[#16171B] to-[#0E0F12] shadow-[inset_0_1px_1px_rgba(255,255,255,0.22),0_6px_20px_rgba(0,0,0,0.85)] hover:from-[#2F3238] hover:via-[#1D1E22] hover:to-[#121316] hover:text-white hover:border-white/[0.22]",
      steel:
        "text-slate-100 border-slate-500/40 bg-gradient-to-b from-slate-700 via-slate-800 to-slate-950 shadow-[inset_0_1px_2px_rgba(255,255,255,0.3),0_6px_16px_rgba(0,0,0,0.7)] hover:from-slate-600 hover:via-slate-700 hover:to-slate-900 hover:text-white",
      gold:
        "text-amber-100 border-amber-500/50 bg-gradient-to-b from-amber-600 via-amber-800 to-neutral-950 shadow-[inset_0_1px_2px_rgba(255,255,255,0.4),0_6px_16px_rgba(217,119,6,0.35)] hover:from-amber-500 hover:via-amber-700 hover:to-neutral-900 hover:text-white"
    };

    const sizeStyles = {
      sm: "h-7 px-3 text-xs gap-1.5 rounded-lg",
      default: "h-9 px-4 text-sm gap-2 rounded-xl",
      lg: "h-11 px-5 text-base gap-2.5 rounded-2xl",
      icon: "h-8 w-8 p-0 rounded-full flex items-center justify-center",
      pill: "h-7 px-3 rounded-full text-xs gap-1.5"
    };

    return (
      <Comp
        className={cn(
          "group relative inline-flex items-center justify-center overflow-hidden border font-mono font-medium tracking-wide transition-all duration-200 select-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        ref={ref}
        {...props}
      >
        {/* Subtle metallic hairline bevel */}
        <span className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[1px] bg-black/60" />

        {/* Content */}
        <span className="relative z-10 flex items-center justify-center gap-1.5">
          {children}
        </span>
      </Comp>
    );
  }
);
MetalButton.displayName = "MetalButton";

export {
  Button,
  buttonVariants,
  LiquidButton,
  liquidbuttonVariants,
  MetalButton
};
