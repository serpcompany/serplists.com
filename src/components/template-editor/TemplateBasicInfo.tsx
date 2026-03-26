import { useState } from "react";
import { useFormContext } from "react-hook-form";
import { X, Plus, Lock, Globe, Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import {
  FormControl,
  FormDescription,
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

export const TemplateBasicInfo = (): JSX.Element => {
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
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">Template form</h3>
        <p className="text-sm leading-6 text-muted-foreground">
          Define the core template metadata first. Keep it clear enough for a human operator,
          but structured enough that AI can follow it without guessing.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <section className="rounded-lg border border-border/80 bg-card px-5 py-5">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Identity
              </p>
              <h4 className="mt-2 text-base font-semibold text-foreground">
                Name the SOP and describe the outcome.
              </h4>
            </div>

            <div className="space-y-5">
              <FormField
                control={control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Template name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Technical SEO audit SOP"
                        className="text-base"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Use the clearest working name, not a marketing headline.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Goal / summary</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe what a human or AI should accomplish by following this SOP."
                        rows={4}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      This summary appears in the editor and also influences how the template reads publicly.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </section>

          <section className="rounded-lg border border-border/80 bg-card px-5 py-5">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Organization
              </p>
              <h4 className="mt-2 text-base font-semibold text-foreground">
                Classify the template so it is easy to find later.
              </h4>
            </div>

            <div className="space-y-5">
              <FormField
                control={control}
                name="categories"
                render={() => (
                  <FormItem>
                    <Label htmlFor="categories" className="text-sm font-medium">
                      Categories
                    </Label>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Use broad buckets like SEO, Content, or Ops.
                    </p>

                    {categories.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {categories.map((category, index: number) => (
                          <Badge
                            key={index}
                            variant="secondary"
                            className="flex items-center gap-1 rounded-md"
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

                    <div className="flex gap-2">
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
                                placeholder="Add category"
                                className="w-full"
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
                        size="sm"
                        onClick={() => addCategory()}
                        disabled={!categoryInput.trim()}
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
                    <Label htmlFor="tags" className="text-sm font-medium">
                      Tags
                    </Label>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Use tighter descriptors like audit, onboarding, or reporting.
                    </p>

                    {tags.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {tags.map((tag, index: number) => (
                          <Badge
                            key={index}
                            variant="outline"
                            className="flex items-center gap-1 rounded-md"
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

                    <div className="flex gap-2">
                      <Input
                        id="tags"
                        value={tagInput}
                        onChange={(event) => setTagInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            addTag();
                          }
                        }}
                        placeholder="Add tag"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addTag}
                        disabled={!tagInput.trim()}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-lg border border-border/80 bg-card px-5 py-5">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Access
              </p>
              <h4 className="mt-2 text-base font-semibold text-foreground">
                Choose the form factor and who can discover it.
              </h4>
            </div>

            <div className="space-y-5">
              <FormField
                control={control}
                name="templateType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">
                      Template type
                    </FormLabel>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={(value) =>
                          field.onChange(value as "checklist" | "recipe")
                        }
                      >
                        <SelectTrigger id="template-type">
                          <SelectValue placeholder="Select a template type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="checklist">Checklist</SelectItem>
                          <SelectItem value="recipe">Recipe</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormDescription>
                      Use checklist for step-by-step execution and recipe for more prescriptive playbooks.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="isPublic"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Visibility</FormLabel>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between rounded-lg border border-border/80 bg-muted/20 p-4">
                        <div className="flex items-center gap-3">
                          {isPublic ? (
                            <Globe className="h-5 w-5 text-green-600" />
                          ) : (
                            <Lock className="h-5 w-5 text-blue-600" />
                          )}
                          <div>
                            <span className="font-medium">
                              {isPublic ? "Public template" : "Private template"}
                            </span>
                            <p className="text-sm text-muted-foreground">
                              {isPublic
                                ? "Anyone can discover and copy this SOP."
                                : "Keep the SOP private while the workflow is still being shaped."}
                            </p>
                          </div>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </div>
                      <FormDescription>
                        Start private while the form is still changing. Publish only when the SOP is stable.
                      </FormDescription>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
