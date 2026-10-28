"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { MailIcon } from "./mail-icons";

type SelectOption = { value: string; label: string };

type CustomSelectProps = {
  id: string;
  label?: string;
  value: string;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  onChange(value: string): void;
};

export function CustomSelect({ id, label, value, options, placeholder = "Choose an option", disabled = false, className = "", triggerRef, onChange }: CustomSelectProps) {
  const listId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const typeahead = useRef("");
  const typeaheadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 240 });
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const selectedIndex = options.findIndex((option) => option.value === value);

  useEffect(() => () => {
    if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current);
  }, []);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (!buttonRef.current?.contains(event.target as Node) && !listRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const trigger = buttonRef.current;
    setPortalTarget(trigger.closest('[role="dialog"]') ?? document.body);
    function positionList() {
      const rect = trigger.getBoundingClientRect();
      const desiredHeight = Math.min(options.length * 44 + 12, 240);
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const upward = below < desiredHeight && above > below;
      const maxHeight = Math.max(44, Math.min(desiredHeight, upward ? above : below));
      setPosition({ top: upward ? rect.top - maxHeight - 4 : rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - 8 - rect.width)), width: Math.min(rect.width, window.innerWidth - 16), maxHeight });
    }
    positionList();
    window.addEventListener("resize", positionList);
    window.addEventListener("scroll", positionList, true);
    return () => { window.removeEventListener("resize", positionList); window.removeEventListener("scroll", positionList, true); };
  }, [open, options.length]);

  useEffect(() => {
    const list = listRef.current;
    const option = list?.querySelector<HTMLElement>(`[data-option-index="${active}"]`);
    if (!list || !option) return;
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
  }, [active, open]);

  function show(index = Math.max(0, selectedIndex)) {
    if (disabled || options.length === 0) return;
    setActive(Math.min(index, options.length - 1));
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (option && option.value !== value) onChange(option.value);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled || options.length === 0) return;
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
    if (event.key === "Tab" && open) { choose(active); return; }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(active); else show();
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
      event.preventDefault();
      if (!open) { show(event.key === "End" || event.key === "ArrowUp" ? options.length - 1 : 0); return; }
      const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : active + (event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : event.key === "PageDown" ? 10 : -10);
      setActive(Math.max(0, Math.min(options.length - 1, next)));
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const next = (typeahead.current + event.key).toLocaleLowerCase();
      typeahead.current = next;
      if (typeaheadTimer.current) clearTimeout(typeaheadTimer.current);
      typeaheadTimer.current = setTimeout(() => { typeahead.current = ""; }, 700);
      const repeated = next.length > 1 && [...next].every((letter) => letter === next[0]);
      const term = repeated ? next[0] : next;
      const start = repeated && open ? (active + 1) % options.length : 0;
      const offset = options.findIndex((_, index) => options[(start + index) % options.length].label.toLocaleLowerCase().startsWith(term));
      const match = offset < 0 ? -1 : (start + offset) % options.length;
      if (match >= 0) { if (!open) show(match); else setActive(match); }
    }
  }

  return (
    <>
      <button
        aria-activedescendant={open ? `${listId}-option-${active}` : undefined}
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label}
        className={`custom-select ${className}`}
        disabled={disabled}
        id={id}
        onClick={() => open ? setOpen(false) : show()}
        onKeyDown={handleKeyDown}
        ref={(node) => { buttonRef.current = node; if (triggerRef) triggerRef.current = node; }}
        role="combobox"
        type="button"
      >
        <span>{options[selectedIndex]?.label ?? placeholder}</span>
        <MailIcon name="chevron-down" size={16} />
      </button>
      {open && portalTarget ? createPortal(
        <div aria-label={label ?? "Options"} className="custom-select-list" id={listId} ref={listRef} role="listbox" style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }}>
          {options.map((option, index) => (
            <div aria-selected={index === active} className={`custom-select-option${index === active ? " is-active" : ""}`} data-option-index={index} id={`${listId}-option-${index}`} key={option.value} onMouseMove={() => setActive(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(index)} role="option">
              {option.label}
            </div>
          ))}
        </div>, portalTarget,
      ) : null}
    </>
  );
}
