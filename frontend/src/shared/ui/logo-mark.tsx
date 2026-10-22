import { cn } from "@/shared/lib/cn";
import React from "react";

type LogoMarkProps = {
  size?: number;
  className?: string;
};

/**
 * BlockHarbor logo mark:
 * A stylized geometric Minecraft voxel block with an integrated emerald harbor beacon motif.
 */
const LogoMark: React.FC<LogoMarkProps> = ({ size = 28, className }) => (
  <svg
    viewBox="0 0 48 48"
    width={size}
    height={size}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="BlockHarbor"
    className={cn("block shrink-0", className)}
  >
    {/* Isometric Cube Top Face */}
    <path
      d="M24 4L42 14.5L24 25L6 14.5L24 4Z"
      className="fill-emerald-400"
    />
    <path
      d="M24 7L38 15L24 23L10 15L24 7Z"
      className="fill-emerald-300"
    />

    {/* Isometric Cube Left Face */}
    <path
      d="M6 14.5L24 25V44L6 33.5V14.5Z"
      className="fill-emerald-700"
    />
    <path
      d="M9 17.5L21 24.5V40.5L9 33.5V17.5Z"
      className="fill-emerald-600"
    />

    {/* Isometric Cube Right Face */}
    <path
      d="M24 25L42 14.5V33.5L24 44V25Z"
      className="fill-emerald-900"
    />
    <path
      d="M27 24.5L39 17.5V33.5L27 40.5V24.5Z"
      className="fill-emerald-800"
    />

    {/* Harbor Beacon Core */}
    <rect
      x="20"
      y="18"
      width="8"
      height="8"
      rx="1.5"
      transform="rotate(45 24 22)"
      className="fill-white"
    />
    <circle cx="24" cy="22" r="2.5" className="fill-emerald-500" />
  </svg>
);

export default LogoMark;
