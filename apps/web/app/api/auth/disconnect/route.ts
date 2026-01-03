import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  const { provider } = await request.json();
  const cookieStore = await cookies();

  const cookieNames: Record<string, string> = {
    gmail: "gmail_access_token",
    "google-docs": "google_docs_access_token",
    vercel: "vercel_access_token",
    notion: "notion_access_token",
  };

  const refreshCookieNames: Record<string, string> = {
    gmail: "gmail_refresh_token",
    "google-docs": "google_docs_refresh_token",
  };

  const cookieName = cookieNames[provider];
  if (!cookieName) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  // Delete the cookie
  cookieStore.delete(cookieName);

  // Delete refresh token if exists
  const refreshCookieName = refreshCookieNames[provider];
  if (refreshCookieName) {
    cookieStore.delete(refreshCookieName);
  }

  return NextResponse.json({ success: true });
}
