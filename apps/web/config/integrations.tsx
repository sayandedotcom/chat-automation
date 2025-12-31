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
];
