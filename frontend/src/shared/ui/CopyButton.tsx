"use client";
import { cn } from "@/shared/lib/cn";
import { Check, Copy } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";

interface CopyButtonProps {
  value?: string;
  text?: string;
  label?: string;
  className?: string;
  iconClassName?: string;
  title?: string;
  stopPropagation?: boolean;
}

export const CopyButton: React.FC<CopyButtonProps> = ({
  value,
  text,
  label,
  className,
  iconClassName,
  title,
  stopPropagation = true,
}) => {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetText = value ?? text ?? "";

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (stopPropagation) e.stopPropagation();
      e.preventDefault();
      if (!targetText) return;
      try {
        navigator.clipboard?.writeText(targetText);
        setCopied(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), 1200);
      } catch {
        /* noop */
      }
    },
    [targetText, stopPropagation],
  );

  const Icon = copied ? Check : Copy;

  return (
    <button
      type="button"
      title={ title || (copied ? "Copied!" : "Copy") }
      onClick={ handleClick }
      className={ cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
        label && "px-2.5 py-1.5 border border-border/60",
        className,
      ) }
    >
      <Icon
        className={ cn(
          "h-3.5 w-3.5 transition-transform",
          copied && "text-emerald-400 scale-110",
          iconClassName,
        ) }
      />
      {label && (
        <span className={ cn("font-medium", copied && "text-emerald-400") }>
          {copied ? "Copied!" : label}
        </span>
      )}
    </button>
  );
};

export default CopyButton;
