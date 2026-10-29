"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      closeButton
      position="bottom-left"
      toastOptions={{
        classNames: {
          toast: "font-sans text-[length:var(--text-sm)]",
          description: "text-[length:var(--text-sm)]",
          actionButton: "cursor-pointer",
          closeButton: "cursor-pointer",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
