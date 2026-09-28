import { useEffect, useState } from "react"
import { Toaster as Sonner, toast } from "sonner"

import {
  applyStoredTheme,
  getStoredTheme,
  subscribeToThemeChanges,
  type SerpListsTheme,
} from "@/lib/theme"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const [theme, setTheme] = useState<SerpListsTheme>(() => getStoredTheme())

  useEffect(() => {
    setTheme(applyStoredTheme())
    return subscribeToThemeChanges(setTheme)
  }, [])

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast }
