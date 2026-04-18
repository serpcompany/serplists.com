import { useState } from "react";
import { useFormContext } from "react-hook-form";
import { X, Plus, Lock, Globe, Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PREDEFINED_CATEGORIES } from "@/utils/categories";
import type { TemplateEditorDetailsFormValues } from "@/lib/forms/templateEditorDetailsForm";
import { cn } from "@/lib/utils";

interface TemplateBasicInfoProps {
  showIntro?: boolean;
}

export const TemplateBasicInfo = ({
  showIntro = true,
}: TemplateBasicInfoProps): JSX.Element => {
  const { control, watch, setValue } =
    useFormContext<TemplateEditorDetailsFormValues>();
  const [categoryInput, setCategoryInput] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);
  const categories = watch("categories");
  const tags = watch("tags");
  const isPublic = watch("isPublic");

  const addCategory = (category?: string) => {
    const categoryToAdd = category || categoryInput.trim();
    if (categoryToAdd && !categories.includes(categoryToAdd)) {
      setValue("categories", [...categories, categoryToAdd], {
        shouldDirty: true,
      });
      setCategoryInput("");
      setCategoryPopoverOpen(false);
    }
  };

  const filteredCategories = PREDEFINED_CATEGORIES.filter((category: string) =>
    category.toLowerCase().includes(categoryInput.toLowerCase()) &&
    !categories.includes(category)
  );

  const removeCategory = (categoryToRemove: string) => {
    setValue(
      "categories",
      categories.filter((category) => category !== categoryToRemove),
      { shouldDirty: true },
    );
  };

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setValue("tags", [...tags, tagInput.trim()], { shouldDirty: true });
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setValue(
      "tags",
      tags.filter((tag) => tag !== tagToRemove),
      { shouldDirty: true },
    );
  };

  const handleCategoryInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCategory();
    }
  };

  return (
    <div className="space-y-6">
      {showIntro ? (
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Template Settings</h3>
          <p className="text-sm leading-6 text-muted-foreground">
            Define what this template is and how it should be organized.
          </p>
        </div>
      ) : null}

      <div className="space-y-8">
        <FormField
          control={control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-base font-medium">Template Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="New Employee Onboarding"
                  className="mt-2 h-11 bg-input"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-base font-medium">Goal / Summary</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Describe what this template helps accomplish..."
                  rows={3}
                  className="mt-2 resize-none bg-input"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="templateType"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-base font-medium">Template Type</FormLabel>
              <FormControl>
                <Select
                  value={field.value}
                  onValueChange={(value) =>
                    field.onChange(value as "checklist" | "recipe")
                  }
                >
                  <SelectTrigger id="template-type" className="mt-2 h-11 bg-input">
                    <SelectValue placeholder="Select a template type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="checklist">Checklist</SelectItem>
                    <SelectItem value="recipe">Recipe</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="categories"
          render={() => (
            <FormItem>
              <Label htmlFor="categories" className="text-base font-medium">
                Categories
              </Label>

              {categories.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {categories.map((category) => (
                    <Badge
                      key={category}
                      variant="secondary"
                      className="gap-1 rounded-md"
                    >
                      {category}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ml-1 h-auto p-0 hover:bg-transparent"
                        onClick={() => removeCategory(category)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              ) : null}

              <div className="mt-3 flex gap-2">
                <div className="relative flex-1">
                  <Popover
                    open={categoryPopoverOpen}
                    onOpenChange={setCategoryPopoverOpen}
                  >
                    <PopoverAnchor asChild>
                      <div className="w-full">
                        <Input
                          id="categories"
                          value={categoryInput}
                          onChange={(event) => {
                            setCategoryInput(event.target.value);
                            if (event.target.value && !categoryPopoverOpen) {
                              setCategoryPopoverOpen(true);
                            }
                          }}
                          onFocus={() => {
                            if (categoryInput) {
                              setCategoryPopoverOpen(true);
                            }
                          }}
                          onKeyDown={handleCategoryInputKeyDown}
                          placeholder="Select categories..."
                          className="h-11 w-full bg-input"
                        />
                      </div>
                    </PopoverAnchor>
                    <PopoverContent
                      className="w-80 max-w-[calc(100vw-2rem)] p-0"
                      align="start"
                    >
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
                                  <Check className={cn("mr-2 h-4 w-4", "opacity-0")} />
                                  {category}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          ) : categoryInput ? (
                            <CommandEmpty>
                              Press Enter to add &quot;{categoryInput}&quot;.
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
                  onClick={() => addCategory()}
                  disabled={!categoryInput.trim()}
                  className="h-11"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="tags"
          render={() => (
            <FormItem>
              <Label htmlFor="tags" className="text-base font-medium">
                Tags
              </Label>

              {tags.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="gap-1 rounded-md"
                    >
                      {tag}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ml-1 h-auto p-0 hover:bg-transparent"
                        onClick={() => removeTag(tag)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              ) : null}

              <div className="mt-3 flex gap-2">
                <Input
                  id="tags"
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="Add tag..."
                  className="h-11 flex-1 bg-input"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addTag}
                  disabled={!tagInput.trim()}
                  className="h-11"
                >
                  Add
                </Button>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="isPublic"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <div>
                  <FormLabel className="mb-0 text-base font-medium">
                    Public Template
                  </FormLabel>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Make this template visible in the public library
                  </p>
                </div>
                <FormControl>
                  <div className="flex items-center gap-3">
                    {isPublic ? (
                      <Globe className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Lock className="h-4 w-4 text-muted-foreground" />
                    )}
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </div>
                </FormControl>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
};
