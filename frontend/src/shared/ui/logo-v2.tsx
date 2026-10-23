import { cn } from "@/shared/lib/cn";
import LogoMark from "@/shared/ui/logo-mark";
import React from "react";

type LogoSize = "sm" | "md" | "lg" | "xl";

const sizeMap: Record<
  LogoSize,
  { image: number; text: string; offset: string }
> = {
  sm: { image: 24, text: "text-base", offset: "ml-2.5" },
  md: { image: 32, text: "text-xl", offset: "ml-2.5" },
  lg: { image: 40, text: "text-2xl", offset: "ml-3" },
  xl: { image: 56, text: "text-4xl", offset: "ml-3.5" },
};

type LogoV2Props = {
  size?: LogoSize;
  withText?: boolean;
  className?: string;
};

const LogoV2: React.FC<LogoV2Props> = ({
  size = "md",
  withText = true,
  className,
}) => {
  const { image, text, offset } = sizeMap[size];

  return (
    <div className={cn("flex items-center select-none font-sans", className)}>
      <LogoMark size={image} />
      {withText && (
        <span className={cn("leading-none font-bold tracking-tight text-zinc-100 flex items-center", text, offset)}>
          <span>Block</span>
          <span className="text-cyan-400 font-extrabold ml-0.5">Harbor</span>
        </span>
      )}
    </div>
  );
};

export default LogoV2;
