import { cn } from "@/shared/lib/cn";
import React from "react";

type LogoMarkProps = {
  size?: number;
  className?: string;
};

/**
 * BlockHarbor logo mark:
 * Official BlockHarbor voxel brand emblem.
 */
const LogoMark: React.FC<LogoMarkProps> = ({ size = 28, className }) => (
  <img
    src="/images/logo-mark.png"
    alt="BlockHarbor"
    width={size}
    height={size}
    className={cn(
      "block shrink-0 rounded-lg object-contain select-none shadow-md shadow-sky-500/20",
      className
    )}
    style={{ width: size, height: size }}
  />
);

export default LogoMark;
