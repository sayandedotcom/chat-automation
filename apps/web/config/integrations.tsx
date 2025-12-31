export interface Integration {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export const integrations: Integration[] = [
  {
    id: "slack",
    name: "Slack",
    description: "Manage Slack messages and channels",
    icon: "/integrations/slack.svg",
  },
  {
    id: "linear",
    name: "Linear",
    description: "Manage Linear issues and projects",
    icon: "/integrations/linear.svg",
  },
  {
    id: "github",
    name: "GitHub",
    description: "Manage GitHub repositories and issues",
    icon: "/integrations/github_dark.svg",
  },
  {
    id: "google-drive",
    name: "Google Drive",
    description: "Access and manage Google Drive files",
    icon: "/integrations/drive.svg",
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "Manage Gmail emails and communications",
    icon: "/integrations/gmail.svg",
  },
  {
    id: "notion",
    name: "Notion",
    description: "Manage Notion pages and databases",
    icon: "/integrations/notion.svg",
  },
  {
    id: "vercel",
    name: "Vercel",
    description: "Deploy and manage apps on Vercel",
    icon: "/integrations/vercel_dark.svg",
  },
  {
    id: "supabase",
    name: "Supabase",
    description: "Manage Supabase databases and auth",
    icon: "/integrations/supabase.svg",
  },
  {
    id: "sentry",
    name: "Sentry",
    description: "Manage Sentry issues and projects",
    icon: "/integrations/sentry.svg",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Manage Google Calendar events and schedules",
    icon: "/integrations/google_calendar.svg",
  },
  {
    id: "google-slides",
    name: "Google Slides",
    description: "Manage Google Slides presentations",
    icon: "/integrations/google_slides.svg",
  },
  {
    id: "google-docs",
    name: "Google Docs",
    description: "Manage Google Docs documents",
    icon: "/integrations/google_docs.svg",
  },
];
