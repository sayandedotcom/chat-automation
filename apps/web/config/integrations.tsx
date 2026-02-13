export interface Integration {
  id: string;
  name: string;
  description: string;
  icon: string;
  oauth: boolean;
  isLive: boolean;
}

export const integrations: Integration[] = [
  {
    id: "google-drive",
    name: "Google Drive",
    description: "Access and manage Google Drive files",
    icon: "/integrations/drive.svg",
    oauth: true,
    isLive: true,
  },
  {
    id: "google-sheets",
    name: "Google Sheets",
    description: "Access and manage Google Sheets files",
    icon: "/integrations/google_sheets.svg",
    oauth: true,
    isLive: true,
  },
  {
    id: "google-slides",
    name: "Google Slides",
    description: "Manage Google Slides presentations",
    icon: "/integrations/google_slides.svg",
    oauth: true,
    isLive: true,
  },
  {
    id: "google-docs",
    name: "Google Docs",
    description: "Manage Google Docs documents",
    icon: "/integrations/google_docs.svg",
    oauth: true,
    isLive: true,
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Manage Google Calendar events and schedules",
    icon: "/integrations/google_calendar.svg",
    oauth: true,
    isLive: true,
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "Manage Gmail emails and communications",
    icon: "/integrations/gmail.svg",
    oauth: true,
    isLive: true,
  },
  {
    id: "slack",
    name: "Slack",
    description: "Manage Slack messages and channels",
    icon: "/integrations/slack.svg",
    oauth: true,
    isLive: false,
  },
  {
    id: "github",
    name: "GitHub",
    description: "Manage GitHub repositories and issues",
    icon: "/integrations/github_dark.svg",
    oauth: true,
    isLive: false,
  },
  {
    id: "vercel",
    name: "Vercel",
    description: "Deploy and manage apps on Vercel",
    icon: "/integrations/vercel_dark.svg",
    oauth: true,
    isLive: true,
  },
  {
    id: "notion",
    name: "Notion",
    description: "Manage Notion pages and databases",
    icon: "/integrations/notion.svg",
    oauth: true,
    isLive: true,
  },
  {
    id: "linear",
    name: "Linear",
    description: "Manage Linear issues and projects",
    icon: "/integrations/linear.svg",
    oauth: true,
    isLive: false,
  },
  {
    id: "supabase",
    name: "Supabase",
    description: "Manage Supabase databases and auth",
    icon: "/integrations/supabase.svg",
    oauth: true,
    isLive: false,
  },
  {
    id: "sentry",
    name: "Sentry",
    description: "Manage Sentry issues and projects",
    icon: "/integrations/sentry.svg",
    oauth: true,
    isLive: false,
  },
  {
    id: "web-search",
    name: "Web Search",
    description: "Search the web for information",
    icon: "/integrations/web_search.png",
    oauth: false,
    isLive: false,
  },
];

// Derived helpers — single source of truth for consumers
/** Only integrations that have OAuth (shown on /integrations page) */
export const oauthIntegrations = integrations.filter((i) => i.oauth);

/** Only integrations that are live / available to connect */
export const liveIntegrations = integrations.filter((i) => i.isLive);

/** Map tool ID → icon path (for workflow timeline) */
export const toolIconMap: Record<string, string> = Object.fromEntries(
  integrations.map((i) => [i.id, i.icon]),
);

/** Map tool ID → display name (for workflow timeline) */
export const toolNameMap: Record<string, string> = Object.fromEntries(
  integrations.map((i) => [i.id, i.name]),
);
