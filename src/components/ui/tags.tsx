'use client'

import * as React from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'

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
    <div className={cn('space-y-2', className)}>
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selected.map((value) => {
            const option = options.find((current) => current.value === value)

            return (
              <Badge key={value} variant="secondary" className="gap-1 pr-1">
                {option?.label || value}
                <button
                  type="button"
                  onClick={() => handleRemove(value)}
                  className="ml-1 rounded-full p-0.5 hover:bg-background/50"
                  aria-label={`Remove ${option?.label || value}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )
          })}
        </div>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between bg-input font-normal"
            type="button"
          >
            <span className="text-muted-foreground">
              {selected.length > 0 ? `${selected.length} selected` : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
        >
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => handleSelect(option.value)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        selected.includes(option.value) ? 'opacity-100' : 'opacity-0',
                      )}
                    />
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
