import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { X, Plus, Lock, Globe, Check } from "lucide-react";
import { PREDEFINED_CATEGORIES } from "@/utils/categories";
import { cn } from "@/lib/utils";

interface TemplateBasicInfoProps {
  title: string;
  description: string;
  templateType: "checklist" | "recipe";
  categories: string[];
  tags: string[];
  isPublic: boolean;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onTemplateTypeChange: (value: "checklist" | "recipe") => void;
  onCategoriesChange: (value: string[]) => void;
  onTagsChange: (value: string[]) => void;
  onPublicChange: (value: boolean) => void;
  errors: { type: string; message: string }[];
}

export const TemplateBasicInfo = ({
  title,
  description,
  templateType,
  categories,
  tags,
  isPublic,
  onTitleChange,
  onDescriptionChange,
  onTemplateTypeChange,
  onCategoriesChange,
  onTagsChange,
  onPublicChange,
  errors
}: TemplateBasicInfoProps) => {
  const [categoryInput, setCategoryInput] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);

  const addCategory = (category?: string) => {
    const categoryToAdd = category || categoryInput.trim();
    if (categoryToAdd && !categories.includes(categoryToAdd)) {
      onCategoriesChange([...categories, categoryToAdd]);
      setCategoryInput("");
      setCategoryPopoverOpen(false);
    }
  };

  const filteredCategories = PREDEFINED_CATEGORIES.filter((category: string) =>
    category.toLowerCase().includes(categoryInput.toLowerCase()) &&
    !categories.includes(category)
  );

  const removeCategory = (categoryToRemove: string) => {
    onCategoriesChange(categories.filter(cat => cat !== categoryToRemove));
  };

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      onTagsChange([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    onTagsChange(tags.filter(tag => tag !== tagToRemove));
  };

  const handleCategoryInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCategory();
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold">Template information</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Keep this concise. The title and summary should scan cleanly in both the console and the public library.
        </p>
      </div>

      <div className="space-y-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div>
            <Label htmlFor="title" className="text-base font-medium">Template Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Enter template title"
              className={`mt-2 text-lg ${
                errors.some((e) => e.type === "title") ? "border-red-500" : ""
              }`}
            />
          </div>

          <div>
            <Label htmlFor="description" className="text-base font-medium">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Brief description of your template"
              className="mt-2"
              rows={3}
            />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <Label htmlFor="template-type" className="text-base font-medium">Template Type</Label>
            <Select
              value={templateType}
              onValueChange={(value) => onTemplateTypeChange(value as "checklist" | "recipe")}
            >
              <SelectTrigger id="template-type" className="mt-2">
                <SelectValue placeholder="Select a template type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="checklist">Checklist</SelectItem>
                <SelectItem value="recipe">Recipe</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="categories" className="text-base font-medium">Categories</Label>
            
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
            
            {/* Input for adding new categories with autocomplete */}
            <div className="flex gap-2 mt-2">
              <div className="flex-1 relative">
                <Popover open={categoryPopoverOpen} onOpenChange={setCategoryPopoverOpen}>
                  <PopoverAnchor asChild>
                    <div className="w-full">
                      <Input
                        id="categories"
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
                    </div>
                  </PopoverAnchor>
                  <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] p-0" align="start">
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
        </div>

        <div className="border-t border-border/70 pt-8">
          <div>
            <Label htmlFor="tags" className="text-base font-medium">Tags</Label>
            <p className="text-sm text-muted-foreground mt-1 mb-2">
              Add tags to help organize and filter your templates
            </p>
            
            {/* Display existing tags as badges */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {tags.map((tag, index: number) => (
                  <Badge key={index} variant="outline" className="flex items-center gap-1">
                    {tag}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 ml-1 hover:bg-transparent"
                      onClick={() => removeTag(tag)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            )}
            
            {/* Input for adding new tags */}
            <div className="flex gap-2 mt-2">
              <Input
                id="tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add a tag..."
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
            <p className="text-sm text-muted-foreground mt-1">Type a tag and press Enter or click + to add</p>
          </div>
        </div>

        <div className="border-t border-border/70 pt-8">
          <div>
            <Label className="text-base font-medium">Privacy Settings</Label>

            <div className="mt-2 space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/20 p-4">
                <div className="flex items-center gap-3">
                  {isPublic ? (
                    <Globe className="h-5 w-5 text-green-600" />
                  ) : (
                    <Lock className="h-5 w-5 text-blue-600" />
                  )}
                  <div>
                    <span className="font-medium">
                      {isPublic ? 'Public Template' : 'Private Template'}
                    </span>
                    <p className="text-sm text-muted-foreground">
                      {isPublic
                        ? 'Anyone can discover and use this template'
                        : 'Only you can access this template'}
                    </p>
                  </div>
                </div>
                <Switch checked={isPublic} onCheckedChange={onPublicChange} />
              </div>
              <p className="text-xs text-muted-foreground">
                Public templates appear in the community library and can be discovered by other users.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
