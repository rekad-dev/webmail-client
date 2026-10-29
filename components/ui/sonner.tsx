"use client"

import type * as React from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      closeButton
      position="bottom-left"
      style={{ "--width": "min(460px, calc(100vw - 32px))" } as React.CSSProperties}
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
