import type { JSX } from "react";
import { useId, useState } from "react";
import { useFormContext } from "react-hook-form";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tags } from "@/components/ui/tags";
import { Textarea } from "@/components/ui/textarea";
import { PREDEFINED_CATEGORIES } from "@/utils/categories";
import type { TemplateEditorDetailsFormValues } from "@/lib/forms/templateEditorDetailsForm";
import { TEMPLATE_FIELD_LIMITS } from "@/lib/schemas/templateFields";

interface TemplateBasicInfoProps {
  showIntro?: boolean;
}

export const TemplateBasicInfo = ({
  showIntro = true,
}: TemplateBasicInfoProps): JSX.Element => {
  const { setValue, watch } = useFormContext<TemplateEditorDetailsFormValues>();
  const [tagInput, setTagInput] = useState("");
  // One id per control, unique for each mounted panel, so every label names its control.
  const fieldId = useId();
  const ids = {
    title: `${fieldId}-title`,
    description: `${fieldId}-description`,
    templateType: `${fieldId}-type`,
    categories: `${fieldId}-categories`,
    tags: `${fieldId}-tags`,
    isPublic: `${fieldId}-public`,
    isPublicHint: `${fieldId}-public-hint`,
  };
  const title = watch("title");
  const description = watch("description");
  const templateType = watch("templateType");
  const categories = watch("categories");
  const tags = watch("tags");
  const isPublic = watch("isPublic");

  const categoryOptions = PREDEFINED_CATEGORIES.map((category) => ({
    label: category,
    value: category,
  }));

  const addTag = () => {
    if (tagInput.trim()) {
      setValue("tags", [...(tags || []), tagInput.trim()], {
        shouldDirty: true,
      });
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setValue(
      "tags",
      (tags || []).filter((tag) => tag !== tagToRemove),
      { shouldDirty: true },
    );
  };

  return (
    <div className="space-y-8">
      {showIntro ? (
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Template Settings
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Define what this template is and how it should be organized.
          </p>
        </div>
      ) : null}

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={ids.title}>Template Name</FieldLabel>
          <Input
            id={ids.title}
            value={title}
            maxLength={TEMPLATE_FIELD_LIMITS.title}
            onChange={(event) =>
              setValue("title", event.target.value, { shouldDirty: true })
            }
            placeholder="Enter template name..."
            className="bg-input"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={ids.description}>Goal / Summary</FieldLabel>
          <Textarea
            id={ids.description}
            value={description}
            maxLength={TEMPLATE_FIELD_LIMITS.description}
            onChange={(event) =>
              setValue("description", event.target.value, { shouldDirty: true })
            }
            placeholder="Describe what this template helps accomplish..."
            rows={3}
            className="resize-none bg-input"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={ids.templateType}>Template Type</FieldLabel>
          <Select
            value={templateType}
            onValueChange={(value: "checklist" | "recipe") =>
              setValue("templateType", value, { shouldDirty: true })
            }
          >
            <SelectTrigger className="bg-input" id={ids.templateType}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="checklist">Checklist</SelectItem>
              <SelectItem value="recipe">Recipe</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor={ids.categories}>Categories</FieldLabel>
          <Tags
            id={ids.categories}
            options={categoryOptions}
            selected={categories || []}
            onSelectionChange={(nextCategories) =>
              setValue("categories", nextCategories, { shouldDirty: true })
            }
            placeholder="Select categories..."
            searchPlaceholder="Search categories..."
            emptyMessage="No categories found."
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={ids.tags}>Tags</FieldLabel>
          <div className="mb-2 flex flex-wrap gap-2">
            {(tags || []).map((tag) => (
              <Badge key={tag} variant="outline" className="gap-1 pr-1">
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="ml-1 rounded-full p-0.5 hover:bg-background/50"
                  aria-label={`Remove tag ${tag}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              id={ids.tags}
              value={tagInput}
              maxLength={TEMPLATE_FIELD_LIMITS.listItemLength}
              onChange={(event) => setTagInput(event.target.value)}
              placeholder="Add tag..."
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addTag();
                }
              }}
              className="bg-input"
            />
            <Button variant="outline" onClick={addTag} type="button">
              Add
            </Button>
          </div>
        </Field>

        <Field>
          <div className="flex items-center justify-between">
            <div>
              <FieldLabel className="mb-0" htmlFor={ids.isPublic}>
                Public Template
              </FieldLabel>
              <p className="mt-1 text-xs text-muted-foreground" id={ids.isPublicHint}>
                Make this template visible in the public library
              </p>
            </div>
            <Switch
              id={ids.isPublic}
              aria-describedby={ids.isPublicHint}
              checked={isPublic}
              onCheckedChange={(checked) =>
                setValue("isPublic", checked, { shouldDirty: true })
              }
            />
          </div>
        </Field>
      </FieldGroup>
    </div>
  );
};
