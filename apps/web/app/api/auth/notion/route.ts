import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.NOTION_CLIENT_ID;
  const redirectUri =
    process.env.NOTION_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/notion/callback`;

  if (!clientId) {
    return NextResponse.json(
      { error: "NOTION_CLIENT_ID not configured" },
      { status: 500 }
    );
  }

  // Build Notion OAuth authorization URL
  const authUrl = new URL("https://api.notion.com/v1/oauth/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("owner", "user");

  return NextResponse.redirect(authUrl.toString());
}
