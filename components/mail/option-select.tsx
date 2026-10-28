"use client";

import { useRef, useState, type RefObject } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

interface OptionSelectProps {
  id: string;
  /** Accessible name when no visible <label htmlFor> exists. */
  label?: string;
  value: string;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  onChange(value: string): void;
}

/** shadcn Select that opens inside the nearest dialog so focus trapping keeps working. */
export function OptionSelect({
  id,
  label,
  value,
  options,
  placeholder = "Choose an option",
  disabled = false,
  className,
  triggerRef,
  onChange,
}: OptionSelectProps) {
  const localRef = useRef<HTMLButtonElement | null>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  return (
    <Select
      disabled={disabled}
      onOpenChange={(open) => {
        if (open) setContainer(localRef.current?.closest<HTMLElement>('[role="dialog"]') ?? null);
      }}
      onValueChange={onChange}
      value={value}
    >
      <SelectTrigger
        aria-label={label}
        className={cn("w-full", className)}
        id={id}
        ref={(node) => {
          localRef.current = node;
          if (triggerRef) triggerRef.current = node;
        }}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent container={container}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
