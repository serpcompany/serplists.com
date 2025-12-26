import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Download, Upload, FileText, AlertCircle, CheckCircle } from "lucide-react";
import { useTemplates } from "@/contexts/TemplatesContext";
import { useAuth } from "@/contexts/CloudflareAuthContext";
import { toast } from "sonner";
import { exportTemplatesToJSON, downloadBackupFile, parseTemplatesFromJSON } from "@/lib/utils/templateBackup";
import { ChecklistTemplate } from "@/lib/schemas/checklistSchema";
// Supabase removed - using Cloudflare API
interface TemplateBackupProps {
  className?: string;
}
export const TemplateBackup: React.FC<TemplateBackupProps> = ({
  className
}) => {
  const {
    templates,
    importTemplates
  } = useTemplates();
  const {
    user
  } = useAuth();
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<ChecklistTemplate[] | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleExportAll = () => {
    try {
      const backup = exportTemplatesToJSON(templates, user?.email);
      downloadBackupFile(backup);
      toast.success(`Exported ${templates.length} templates successfully`);
    } catch (error) {
      toast.error("Failed to export templates");
      console.error("Export error:", error);
    }
  };
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/json") {
      toast.error("Please select a JSON file");
      return;
    }
    setSelectedFile(file);
    setIsImporting(true);
    try {
      const parsedTemplates = await parseTemplatesFromJSON(file);
      setImportPreview(parsedTemplates);
      toast.success(`Preview: ${parsedTemplates.length} templates ready to import`);
    } catch (error) {
      toast.error(`Failed to parse file: ${(error as Error).message}`);
      setImportPreview(null);
    } finally {
      setIsImporting(false);
    }
  };
  const handleConfirmImport = async () => {
    if (!importPreview || !user) return;
    setIsImporting(true);
    try {
      // The importPreview has already been validated by parseTemplatesFromJSON
      await importTemplates(importPreview as unknown);
      toast.success(`Successfully imported ${importPreview.length} templates`);
      setImportPreview(null);
      setSelectedFile(null);
      // Reset file input
      const fileInput = document.getElementById('template-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch (error) {
      toast.error(`Failed to import templates: ${(error as Error).message}`);
    } finally {
      setIsImporting(false);
    }
  };
  const handleCancelImport = () => {
    setImportPreview(null);
    setSelectedFile(null);
    const fileInput = document.getElementById('template-file-input') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };
  const downloadSampleTemplate = () => {
    const sampleTemplate: ChecklistTemplate = {
      id: "sample-template-001",
      title: "Moving Checklist",
      description: "A comprehensive checklist to help you organize your move and ensure nothing is forgotten.",
      userId: "sample",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isPublic: true,
      slug: "moving-checklist-sample",
      categories: ["moving", "packing"],
      tags: ["relocation", "organization", "home"],
      sections: [{
        id: "section-planning",
        title: "Planning Phase (8 weeks before)",
        items: [{
          id: "item-research",
          title: "Research moving companies",
          description: "Get quotes from at least 3 different moving companies",
          contents: [{
            id: "content-tips",
            type: "text",
            value: "**Tips for choosing a moving company:**\n\n- Check online reviews and BBB ratings\n- Verify licensing and insurance\n- Get written estimates\n- Ask about additional fees"
          }]
        }, {
          id: "item-budget",
          title: "Create moving budget",
          description: "Plan all expenses including movers, supplies, and unexpected costs",
          contents: []
        }, {
          id: "item-timeline",
          title: "Create moving timeline",
          description: "Plan key milestones and deadlines",
          contents: [{
            id: "content-timeline",
            type: "subItems",
            value: "",
            subItems: [{
              id: "sub-1",
              title: "8 weeks: Start planning and research"
            }, {
              id: "sub-2",
              title: "6 weeks: Book moving company"
            }, {
              id: "sub-3",
              title: "4 weeks: Start packing non-essentials"
            }, {
              id: "sub-4",
              title: "2 weeks: Confirm all arrangements"
            }, {
              id: "sub-5",
              title: "1 week: Pack essentials box"
            }]
          }]
        }]
      }, {
        id: "section-preparation",
        title: "Preparation Phase (4 weeks before)",
        items: [{
          id: "item-declutter",
          title: "Declutter and organize",
          description: "Sort through belongings and decide what to keep, donate, or discard",
          contents: []
        }, {
          id: "item-supplies",
          title: "Gather packing supplies",
          description: "Collect boxes, tape, bubble wrap, labels, and markers",
          contents: [{
            id: "content-supplies",
            type: "subItems",
            value: "",
            subItems: [{
              id: "supply-1",
              title: "Moving boxes (various sizes)"
            }, {
              id: "supply-2",
              title: "Packing tape"
            }, {
              id: "supply-3",
              title: "Bubble wrap or newspaper"
            }, {
              id: "supply-4",
              title: "Labels and permanent markers"
            }, {
              id: "supply-5",
              title: "Stretch wrap for furniture"
            }]
          }]
        }, {
          id: "item-change-address",
          title: "Change address with important services",
          description: "Update your address with banks, utilities, and subscription services",
          contents: []
        }]
      }, {
        id: "section-moving-day",
        title: "Moving Day",
        items: [{
          id: "item-essentials",
          title: "Pack essentials box",
          description: "Keep important items easily accessible",
          contents: []
        }, {
          id: "item-inventory",
          title: "Create inventory list",
          description: "Document all items being moved",
          contents: []
        }, {
          id: "item-final-walkthrough",
          title: "Final walkthrough",
          description: "Check all rooms, closets, and storage areas",
          contents: []
        }]
      }]
    };
    const sampleBackup = exportTemplatesToJSON([sampleTemplate], "Sample Export");
    downloadBackupFile(sampleBackup, "sample-moving-checklist.json");
    toast.success("Sample template downloaded! You can now import this file to see how it works.");
  };
  const publicTemplateCount = templates.filter(t => t.isPublic).length;
  const privateTemplateCount = templates.filter(t => !t.isPublic).length;
  return <div className={className}>
	      <Card>
	        <CardHeader>
	          <CardTitle className="flex items-center gap-2">
	            <FileText className="h-5 w-5" />
	            Template Backup & Import
	          </CardTitle>
	          <CardDescription>
	            Export your templates to backup files or import templates from JSON files
	          </CardDescription>
	        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current Templates Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{templates.length}</div>
              <div className="text-sm text-muted-foreground">Total Templates</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{publicTemplateCount}</div>
              <div className="text-sm text-muted-foreground">Public</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{privateTemplateCount}</div>
              <div className="text-sm text-muted-foreground">Private</div>
            </div>
          </div>

          <Separator />

	          {/* Export Section */}
	          <div className="space-y-4">
	            <h3 className="text-lg font-semibold">Export Templates</h3>
	            <Button onClick={handleExportAll} className="flex items-center gap-2">
	              <Download className="h-4 w-4" />
	              Export All My Templates
	            </Button>
	          </div>

          <Separator />

	          {/* Import Section */}
	          <div className="space-y-4">
	            <h3 className="text-lg font-semibold">Import Templates</h3>
	            <div className="space-y-2">
	              <Label htmlFor="template-file-input">Select a JSON template file</Label>
	              <Input id="template-file-input" type="file" accept=".json" onChange={handleFileSelect} disabled={isImporting} />
	              <p className="text-sm text-muted-foreground">
	                Need an example?{" "}
	                <Button variant="link" className="p-0 h-auto text-primary" onClick={downloadSampleTemplate}>
	                  Download sample template file
	                </Button>
	              </p>
	            </div>

            {/* Import Preview */}
            {importPreview && <Card className="border-dashed">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    Import Preview
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Badge variant="secondary">{importPreview.length} templates</Badge>
                    <Badge variant="outline">
                      {importPreview.filter(t => t.isPublic).length} public
                    </Badge>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="font-medium">Templates to import:</h4>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {importPreview.map((template, index: number) => <div key={index} className="text-sm p-2 bg-muted rounded">
                          <div className="font-medium">{template.title}</div>
                          {template.description && <div className="text-muted-foreground truncate">{template.description}</div>}
                          <div className="text-xs text-muted-foreground">
                            {template.sections.length} sections
                          </div>
                        </div>)}
                    </div>
                  </div>

                  <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-yellow-800 dark:text-yellow-200">
                          Import Notes:
                        </p>
                        <ul className="text-yellow-700 dark:text-yellow-300 mt-1 space-y-1">
                          <li>• Templates will be assigned new unique IDs</li>
                          <li>• All imported templates will be marked as public</li>
                          <li>• Existing templates won&apos;t be affected</li>
                          <li>• Slugs will be regenerated to avoid conflicts</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={handleConfirmImport} disabled={isImporting} className="flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      {isImporting ? "Importing..." : "Confirm Import"}
                    </Button>
                    <Button variant="outline" onClick={handleCancelImport}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>}
          </div>
        </CardContent>
      </Card>
    </div>;
};
