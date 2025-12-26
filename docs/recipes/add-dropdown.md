# Recipe: Add Dropdown

This recipe guides you through adding dropdown components using the actual shadcn/ui patterns from the codebase.

**Related Files:**
- `/Users/devin/repos/projects/serp-checklists/src/components/ui/select.tsx`
- `/Users/devin/repos/projects/serp-checklists/src/components/ui/dropdown-menu.tsx`
- `/Users/devin/repos/projects/serp-checklists/src/components/ui/multi-select.tsx`
- `/Users/devin/repos/projects/serp-checklists/src/components/ui/command.tsx`
- `/Users/devin/repos/projects/serp-checklists/src/components/ui/popover.tsx`

## Steps

### 1. Basic Select Dropdown (Form Inputs)

Use Select components for form inputs and single selections:

```typescript
// Basic Select implementation from the codebase pattern
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CategorySelect() {
  const [category, setCategory] = useState('');
  
  return (
    <Select value={category} onValueChange={setCategory}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select a category" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Categories</SelectLabel>
          <SelectItem value="personal">Personal</SelectItem>
          <SelectItem value="work">Work</SelectItem>
          <SelectItem value="travel">Travel</SelectItem>
          <SelectItem value="health">Health</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
```

### 2. Dropdown Menu for Actions (Real Example from Layout.tsx)

The codebase uses DropdownMenu for user actions and context menus:

```typescript
// Real implementation from src/components/Layout.tsx
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LogOut, Settings, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

export function UserDropdown({ user, onLogout, userProfile }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="p-0 h-auto hover:bg-transparent">
          <Avatar className="h-8 w-8 cursor-pointer transition-opacity hover:opacity-80">
            <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
              {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-background border shadow-lg" sideOffset={8}>
        <div className="px-3 py-2 border-b">
          <p className="text-sm font-medium">{user?.name}</p>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
        </div>
        
        <DropdownMenuItem asChild>
          <Link to="/account" className="w-full flex items-center gap-2 cursor-pointer">
            <Settings className="h-4 w-4" />
            Account Settings
          </Link>
        </DropdownMenuItem>
        
        {userProfile.username && (
          <DropdownMenuItem asChild>
            <Link 
              to={`/profile/${userProfile.username}`} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="w-full flex items-center gap-2 cursor-pointer"
            >
              <ExternalLink className="h-4 w-4" />
              Public Profile
            </Link>
          </DropdownMenuItem>
        )}
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem 
          onClick={onLogout} 
          className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### 3. Multi-Select Dropdown (Real Implementation)

The codebase has a custom MultiSelect component used in SearchAndFilters:

```typescript
// Real implementation from src/components/ui/multi-select.tsx
import * as React from "react"
import { X, Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface MultiSelectProps {
  options: string[]
  selected: string[]
  onChange: (selected: string[]) => void
  placeholder?: string
  className?: string
  maxSelected?: number
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select options...",
  className,
  maxSelected,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [searchValue, setSearchValue] = React.useState("")

  const handleSelect = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((item) => item !== option))
    } else {
      if (maxSelected && selected.length >= maxSelected) {
        return
      }
      onChange([...selected, option])
    }
  }

  const handleRemove = (option: string) => {
    onChange(selected.filter((item) => item !== option))
  }

  const handleClear = () => {
    onChange([])
  }

  const filteredOptions = options.filter((option: string) =>
    option.toLowerCase().includes(searchValue.toLowerCase())
  )

  return (
    <div className={cn("w-full", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-start text-left font-normal"
            onClick={() => setOpen(!open)}
          >
            <div className="flex flex-1 flex-wrap items-center gap-1">
              {selected.length === 0 ? (
                <span className="text-muted-foreground">{placeholder}</span>
              ) : (
                <>
                  {selected.slice(0, 2).map((option) => (
                    <Badge
                      key={option}
                      variant="secondary"
                      className="mr-1 mb-1"
                    >
                      {option}
                      <Button
                        className="ml-1 h-auto p-0 text-muted-foreground hover:text-foreground"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleRemove(option)
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                  {selected.length > 2 && (
                    <Badge variant="secondary" className="mr-1 mb-1">
                      +{selected.length - 2} more
                    </Badge>
                  )}
                </>
              )}
            </div>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Search categories..."
              value={searchValue}
              onValueChange={setSearchValue}
            />
            <CommandList>
              <CommandEmpty>No categories found.</CommandEmpty>
              <CommandGroup>
                {selected.length > 0 && (
                  <CommandItem
                    onSelect={handleClear}
                    className="justify-center text-center"
                  >
                    Clear all
                  </CommandItem>
                )}
                {filteredOptions.map((option) => (
                  <CommandItem
                    key={option}
                    onSelect={() => handleSelect(option)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selected.includes(option) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {option}
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

// Usage from src/components/checklist-library/SearchAndFilters.tsx
export function CategoryFilter({ allCategories, selectedCategories, setSelectedCategories }) {
  return (
    <div className="flex-1 max-w-md">
      <MultiSelect
        options={allCategories}
        selected={selectedCategories}
        onChange={setSelectedCategories}
        placeholder="Select categories..."
        className="w-full"
      />
    </div>
  );
}
```

### 4. Searchable Dropdown with Command (Real Pattern from TemplateBasicInfo)

The codebase uses Command + Popover for searchable dropdowns with autocomplete:

```typescript
// Real implementation from src/components/template-editor/TemplateBasicInfo.tsx
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Plus, X } from "lucide-react";

export function CategoryAutocomplete({ categories, onCategoriesChange, predefinedCategories }) {
  const [categoryInput, setCategoryInput] = useState("");
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);

  const addCategory = (category?: string) => {
    const categoryToAdd = category || categoryInput.trim();
    if (categoryToAdd && !categories.includes(categoryToAdd)) {
      onCategoriesChange([...categories, categoryToAdd]);
      setCategoryInput("");
      setCategoryPopoverOpen(false);
    }
  };

  const filteredCategories = predefinedCategories.filter((category: string) =>
    category.toLowerCase().includes(categoryInput.toLowerCase()) &&
    !categories.includes(category)
  );

  const removeCategory = (categoryToRemove: string) => {
    onCategoriesChange(categories.filter(cat => cat !== categoryToRemove));
  };

  const handleCategoryInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCategory();
    }
  };

  return (
    <div>
      {/* Display existing categories as badges */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {categories.map((category, index: number) => (
            <Badge key={index} variant="secondary" className="flex items-center gap-1">
              {category}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto p-0 ml-1 hover:bg-transparent"
                onClick={() => removeCategory(category)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}
      
      {/* Input with autocomplete */}
      <div className="flex gap-2 mt-2">
        <div className="flex-1 relative">
          <Popover open={categoryPopoverOpen} onOpenChange={setCategoryPopoverOpen}>
            <PopoverTrigger asChild>
              <Input
                value={categoryInput}
                onChange={(e) => {
                  setCategoryInput(e.target.value);
                  if (e.target.value.length > 0 && !categoryPopoverOpen) {
                    setCategoryPopoverOpen(true);
                  }
                }}
                onKeyDown={handleCategoryInputKeyDown}
                placeholder="Type a category and press Enter or click + to add"
                className="w-full"
                onFocus={() => {
                  if (categoryInput.length > 0) {
                    setCategoryPopoverOpen(true);
                  }
                }}
              />
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandList>
                  {filteredCategories.length > 0 ? (
                    <CommandGroup heading="Suggested categories">
                      {filteredCategories.map((category) => (
                        <CommandItem
                          key={category}
                          onSelect={() => addCategory(category)}
                          className="cursor-pointer"
                        >
                          <Check className="mr-2 h-4 w-4 opacity-0" />
                          {category}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ) : categoryInput.length > 0 ? (
                    <CommandEmpty>
                      Press Enter to add "{categoryInput}" as a new category
                    </CommandEmpty>
                  ) : null}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addCategory()}
          disabled={!categoryInput.trim()}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
```

### 5. Form Integration with React Hook Form

When integrating with forms, use the Form components:

```typescript
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const formSchema = z.object({
  category: z.string().min(1, "Category is required"),
  tags: z.array(z.string()).optional(),
});

export function FormWithDropdowns() {
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      category: "",
      tags: [],
    },
  });
  
  const onSubmit = (data) => {
    console.log("Form data:", data);
  };
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="business">Business</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="education">Education</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="tags"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tags</FormLabel>
              <FormControl>
                <MultiSelect
                  options={["urgent", "important", "low-priority", "high-priority"]}
                  selected={field.value || []}
                  onChange={field.onChange}
                  placeholder="Select tags..."
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  );
}
```

### 6. Async Data Loading Pattern

For dropdowns with API data, follow the pattern from the codebase:

```typescript
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

export function AsyncUserSelect() {
  const [selectedUser, setSelectedUser] = useState("");
  
  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await fetch('/api/users');
      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }
      return response.json();
    },
  });

  useEffect(() => {
    if (error) {
      toast.error('Failed to load users');
    }
  }, [error]);
  
  return (
    <Select 
      value={selectedUser} 
      onValueChange={setSelectedUser}
      disabled={isLoading}
    >
      <SelectTrigger>
        <SelectValue placeholder={isLoading ? "Loading..." : "Select user"} />
      </SelectTrigger>
      <SelectContent>
        {isLoading ? (
          <div className="flex items-center justify-center p-4">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <SelectGroup>
            <SelectLabel>Users</SelectLabel>
            {users.map(user => (
              <SelectItem key={user.id} value={user.id}>
                <div className="flex items-center">
                  <Avatar className="h-6 w-6 mr-2">
                    <AvatarImage src={user.avatar} />
                    <AvatarFallback>{user.name[0]}</AvatarFallback>
                  </Avatar>
                  {user.name}
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}
```

### 7. Filter Dropdown Pattern (Real Example)

The codebase uses a clear pattern for filters with state management:

```typescript
// Real pattern from src/components/checklist-library/SearchAndFilters.tsx
import { Filter, X } from "lucide-react";

export function FilterDropdownPattern({ 
  allCategories, 
  selectedCategories, 
  setSelectedCategories 
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
      <div className="flex items-center gap-2 shrink-0">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Filter by categories:</span>
      </div>
      <div className="flex-1 max-w-md">
        <MultiSelect
          options={allCategories}
          selected={selectedCategories}
          onChange={setSelectedCategories}
          placeholder="Select categories..."
          className="w-full"
        />
      </div>
      {selectedCategories.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelectedCategories([])}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4 mr-1" />
          Clear filters
        </Button>
      )}
    </div>
  );
}
```

## Testing

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CategorySelect } from './CategorySelect';

describe('CategorySelect', () => {
  it('renders with placeholder', () => {
    render(<CategorySelect />);
    expect(screen.getByText('Select a category')).toBeInTheDocument();
  });
  
  it('opens dropdown on click', () => {
    render(<CategorySelect />);
    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);
    
    expect(screen.getByText('Personal')).toBeInTheDocument();
    expect(screen.getByText('Work')).toBeInTheDocument();
  });
  
  it('selects item on click', () => {
    render(<CategorySelect />);
    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);
    
    const item = screen.getByText('Personal');
    fireEvent.click(item);
    
    expect(trigger).toHaveTextContent('Personal');
  });

  it('handles multi-select correctly', () => {
    const mockOnChange = jest.fn();
    render(
      <MultiSelect
        options={['option1', 'option2', 'option3']}
        selected={[]}
        onChange={mockOnChange}
        placeholder="Select options..."
      />
    );

    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);

    const option1 = screen.getByText('option1');
    fireEvent.click(option1);

    expect(mockOnChange).toHaveBeenCalledWith(['option1']);
  });
});
```

## Common Pitfalls

1. **Forgetting asChild prop** - Always use `asChild` when customizing trigger buttons
2. **Missing value/onChange** - Select components must be controlled
3. **Accessibility issues** - Ensure proper ARIA labels and keyboard navigation
4. **Z-index problems** - Use Portal components for proper layering
5. **Missing loading states** - Always handle loading and error states in async dropdowns
6. **Not clearing search** - Reset search input when selections are made
7. **Event propagation** - Use `stopPropagation()` for nested interactive elements

## Key Patterns from the Codebase

1. **Use Select for form inputs** - Single selections in forms
2. **Use DropdownMenu for actions** - Context menus and user actions
3. **Use Command + Popover for search** - Searchable dropdowns with autocomplete
4. **Use MultiSelect for filters** - Multiple selection with badges
5. **Always handle loading states** - Show loading indicators for async data
6. **Provide clear actions** - Include "Clear all" options for multi-select
7. **Use proper styling** - Follow the design system consistently

## See Also:
- [Add Data Type Recipe](./add-data-type.md)
- [Add Message Handler Recipe](./add-message-handler.md)
- [Add New Tab Recipe](./add-new-tab.md)
- [Component Development Best Practices](../patterns/component-pattern.md)