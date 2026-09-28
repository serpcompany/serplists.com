import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  detectTemplateSourceExtension,
  isMarkdownTemplateExtension,
  isYamlTemplateExtension,
  normalizePortableTemplate,
  parseTemplateMarkdown,
  parseTemplateYaml,
  renderTemplateMarkdown,
  renderTemplatePreviewHtml,
  renderTemplateReadme,
  type SupportedTemplateSourceExtension,
} from "../../src/lib/templates/templateMarkdown";
import {
  portableChecklistTemplateSchema,
  type PortableChecklistTemplate,
} from "../../src/lib/schemas/checklistSchema";
import { normalizeEol } from "./line-endings.mjs";

export type TemplateLintIssue = {
  filePath: string;
  code: string;
  message: string;
};

type TemplateSourceDetails = {
  extension: SupportedTemplateSourceExtension;
  normalizedTemplate: PortableChecklistTemplate;
  canonicalMarkdown: string;
  canonicalJson: string;
  canonicalReadme: string;
  canonicalPreviewHtml: string;
};

// Sources are compared with LF canonical output, so read them with LF line endings:
// a CRLF checkout (Windows, core.autocrlf=true) is not drift, and no carriage return
// leaks into titles parsed from Markdown or YAML.
const readSource = async (filePath: string) => normalizeEol(await readFile(filePath, "utf8"));

const normalizeJson = (template: PortableChecklistTemplate) => `${JSON.stringify(normalizePortableTemplate(template), null, 2)}\n`;

const buildTemplateSourceDetails = (
  extension: SupportedTemplateSourceExtension,
  template: PortableChecklistTemplate
): TemplateSourceDetails => {
  const normalizedTemplate = normalizePortableTemplate(template);
  return {
    extension,
    normalizedTemplate,
    canonicalMarkdown: renderTemplateMarkdown(normalizedTemplate),
    canonicalJson: normalizeJson(normalizedTemplate),
    canonicalReadme: renderTemplateReadme(normalizedTemplate),
    canonicalPreviewHtml: renderTemplatePreviewHtml(normalizedTemplate),
  };
};

const parseTemplateJson = (source: string) => {
  const parsed = JSON.parse(source);
  return normalizePortableTemplate(portableChecklistTemplateSchema.parse(parsed));
};

export const parseSingleTemplateSource = (source: string, extension: SupportedTemplateSourceExtension): TemplateSourceDetails => {
  if (isMarkdownTemplateExtension(extension)) {
    return buildTemplateSourceDetails(extension, parseTemplateMarkdown(source));
  }

  if (isYamlTemplateExtension(extension)) {
    const parsed = parseTemplateYaml(source);
    if ("kind" in parsed) {
      throw new Error("YAML template source must define a single template, not a template pack");
    }
    return buildTemplateSourceDetails(extension, parsed);
  }

  return buildTemplateSourceDetails(extension, parseTemplateJson(source));
};

// The generated Markdown must import back as the same template. Text blocks hold
// Markdown, so a fence or heading inside one must not break the format.
const checkMarkdownRoundTrip = (details: TemplateSourceDetails, filePath: string): TemplateLintIssue[] => {
  const issue = (message: string): TemplateLintIssue[] => [{ filePath, code: "markdown-roundtrip", message }];

  try {
    const reparsed = normalizePortableTemplate(parseTemplateMarkdown(details.canonicalMarkdown));
    return normalizeJson(reparsed) === details.canonicalJson
      ? []
      : issue("Generated Markdown imports as a different template");
  } catch (error) {
    return issue(
      `Generated Markdown does not import: ${error instanceof Error ? error.message : "unknown parse error"}`,
    );
  }
};

const validateTemplateRules = (template: PortableChecklistTemplate, filePath: string): TemplateLintIssue[] => {
  const issues: TemplateLintIssue[] = [];

  if (!template.sections.length) {
    issues.push({
      filePath,
      code: "empty-template",
      message: "Template must include at least one section",
    });
  }

  template.sections.forEach((section, sectionIndex) => {
    if (!section.items.length) {
      issues.push({
        filePath,
        code: "empty-section",
        message: `Section ${sectionIndex + 1} "${section.title}" must include at least one item`,
      });
    }

    section.items.forEach((item, itemIndex) => {
      const hasDescription = Boolean(item.description?.trim());
      const hasContents = Boolean(item.contents?.length);
      if (!hasDescription && !hasContents) {
        issues.push({
          filePath,
          code: "empty-item",
          message: `Item ${sectionIndex + 1}.${itemIndex + 1} "${item.title}" should include a description or at least one content block`,
        });
      }

      item.contents?.forEach((content, contentIndex) => {
        if ((content.type === "image" || content.type === "video" || content.type === "file" || content.type === "embed") && !content.value?.trim()) {
          issues.push({
            filePath,
            code: "empty-content-value",
            message: `Item ${sectionIndex + 1}.${itemIndex + 1} content block ${contentIndex + 1} (${content.type}) requires a value`,
          });
        }

        if (content.type === "subItems" && (!content.subItems || content.subItems.length === 0)) {
          issues.push({
            filePath,
            code: "empty-subitems",
            message: `Item ${sectionIndex + 1}.${itemIndex + 1} sub-items content must include at least one sub-item`,
          });
        }
      });
    });
  });

  return issues;
};

export const lintSingleTemplateSource = async (filePath: string): Promise<TemplateLintIssue[]> => {
  const extension = detectTemplateSourceExtension(path.basename(filePath));
  if (!extension) {
    return [{
      filePath,
      code: "unsupported-file-type",
      message: "Unsupported template source file type",
    }];
  }

  try {
    const source = await readSource(filePath);
    const details = parseSingleTemplateSource(source, extension);
    const issues = [
      ...validateTemplateRules(details.normalizedTemplate, filePath),
      ...checkMarkdownRoundTrip(details, filePath),
    ];

    if (extension === ".json" && source !== details.canonicalJson) {
      issues.push({
        filePath,
        code: "json-not-normalized",
        message: "JSON template does not match canonical normalized formatting",
      });
    }

    if (isMarkdownTemplateExtension(extension) && source !== details.canonicalMarkdown) {
      issues.push({
        filePath,
        code: "markdown-not-canonical",
        message: "Markdown template does not match canonical generated output",
      });
    }

    return issues;
  } catch (error) {
    return [{
      filePath,
      code: "parse-error",
      message: error instanceof Error ? error.message : "Unknown template parse error",
    }];
  }
};

export const lintTemplatePair = async (jsonPath: string, markdownPath: string): Promise<TemplateLintIssue[]> => {
  const issues: TemplateLintIssue[] = [];

  try {
    const [jsonSource, markdownSource] = await Promise.all([
      readSource(jsonPath),
      readSource(markdownPath),
    ]);

    const jsonDetails = parseSingleTemplateSource(jsonSource, ".json");
    const markdownDetails = parseSingleTemplateSource(markdownSource, ".md");

    issues.push(...validateTemplateRules(jsonDetails.normalizedTemplate, jsonPath));
    issues.push(...validateTemplateRules(markdownDetails.normalizedTemplate, markdownPath));
    issues.push(...checkMarkdownRoundTrip(jsonDetails, markdownPath));

    if (jsonDetails.canonicalJson !== normalizeJson(markdownDetails.normalizedTemplate)) {
      issues.push({
        filePath: markdownPath,
        code: "json-markdown-drift",
        message: `Markdown template is out of sync with ${path.basename(jsonPath)}`,
      });
    }

    if (markdownSource !== jsonDetails.canonicalMarkdown) {
      issues.push({
        filePath: markdownPath,
        code: "markdown-not-generated",
        message: `Markdown template should be regenerated from ${path.basename(jsonPath)}`,
      });
    }

    if (jsonSource !== jsonDetails.canonicalJson) {
      issues.push({
        filePath: jsonPath,
        code: "json-not-normalized",
        message: "JSON template does not match canonical normalized formatting",
      });
    }
  } catch (error) {
    issues.push({
      filePath: `${jsonPath} <-> ${markdownPath}`,
      code: "pair-parse-error",
      message: error instanceof Error ? error.message : "Failed to lint template pair",
    });
  }

  return issues;
};

export const lintYamlTemplateBundle = async (
  yamlPath: string,
  paths: {
    jsonPath?: string;
    readmePath?: string;
    previewHtmlPath?: string;
    markdownPath?: string;
  }
): Promise<TemplateLintIssue[]> => {
  const issues: TemplateLintIssue[] = [];

  try {
    const yamlSource = await readSource(yamlPath);
    const yamlDetails = parseSingleTemplateSource(yamlSource, path.extname(yamlPath).toLowerCase() as SupportedTemplateSourceExtension);

    issues.push(...validateTemplateRules(yamlDetails.normalizedTemplate, yamlPath));
    issues.push(...checkMarkdownRoundTrip(yamlDetails, paths.markdownPath ?? yamlPath));

    if (paths.jsonPath) {
      const jsonSource = await readSource(paths.jsonPath);
      if (jsonSource !== yamlDetails.canonicalJson) {
        issues.push({
          filePath: paths.jsonPath,
          code: "json-not-generated",
          message: `JSON artifact should be regenerated from ${path.basename(yamlPath)}`,
        });
      }
    }

    if (paths.readmePath) {
      const readmeSource = await readSource(paths.readmePath);
      if (readmeSource !== yamlDetails.canonicalReadme) {
        issues.push({
          filePath: paths.readmePath,
          code: "readme-not-generated",
          message: `README preview should be regenerated from ${path.basename(yamlPath)}`,
        });
      }
    }

    if (paths.previewHtmlPath) {
      const previewSource = await readSource(paths.previewHtmlPath);
      if (previewSource !== yamlDetails.canonicalPreviewHtml) {
        issues.push({
          filePath: paths.previewHtmlPath,
          code: "preview-html-not-generated",
          message: `HTML preview should be regenerated from ${path.basename(yamlPath)}`,
        });
      }
    }

    if (paths.markdownPath) {
      const markdownSource = await readSource(paths.markdownPath);
      if (markdownSource !== yamlDetails.canonicalMarkdown) {
        issues.push({
          filePath: paths.markdownPath,
          code: "markdown-not-generated",
          message: `Strict Markdown artifact should be regenerated from ${path.basename(yamlPath)}`,
        });
      }
    }
  } catch (error) {
    issues.push({
      filePath: yamlPath,
      code: "yaml-bundle-parse-error",
      message: error instanceof Error ? error.message : "Failed to lint YAML template bundle",
    });
  }

  return issues;
};
