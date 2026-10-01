import type { ChecklistTemplate } from "@/types/checklist";

export const buildSampleTemplate = (): ChecklistTemplate => ({
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
});
