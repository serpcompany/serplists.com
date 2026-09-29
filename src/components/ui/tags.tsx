'use client'

import * as React from 'react'
import { ChevronsUpDown, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export interface TagOption {
  label: string
  value: string
}

interface TagsProps {
  className?: string
  emptyMessage?: string
  // Set on the trigger button, so a <label htmlFor> names the picker.
  id?: string
  onSelectionChange: (selected: string[]) => void
  options: TagOption[]
  placeholder?: string
  searchPlaceholder?: string
  selected: string[]
}

// A multi-select: the chosen options as removable badges, and a searchable list in a
// popover to add or remove them. Built from the shadcn Badge, Button, Popover and Command.
export function Tags({
  className,
  emptyMessage = 'No options found.',
  id,
  onSelectionChange,
  options,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  selected,
}: TagsProps) {
  const [open, setOpen] = React.useState(false)

  const handleRemove = (value: string) => {
    onSelectionChange(selected.filter((current) => current !== value))
  }

  const handleSelect = (value: string) => {
    if (selected.includes(value)) {
      onSelectionChange(selected.filter((current) => current !== value))
    } else {
      onSelectionChange([...selected, value])
    }
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((value) => {
            const option = options.find((current) => current.value === value)

            return (
              <Badge key={value} variant="secondary" className="pr-0.5">
                {option?.label || value}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="size-4 rounded-full"
                  onClick={() => handleRemove(value)}
                  aria-label={`Remove ${option?.label || value}`}
                >
                  <X />
                </Button>
              </Badge>
            )
          })}
        </div>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={id}
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between font-normal"
              type="button"
            />
          }
        >
          <span className="text-muted-foreground">
            {selected.length > 0 ? `${selected.length} selected` : placeholder}
          </span>
          <ChevronsUpDown className="opacity-50" />
        </PopoverTrigger>
        <PopoverContent className="w-(--anchor-width) p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    data-checked={selected.includes(option.value)}
                    onSelect={() => handleSelect(option.value)}
                  >
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
