import { NextResponse } from "next/server";

// Google Slides OAuth scopes
const GOOGLE_SLIDES_SCOPES = [
  "https://www.googleapis.com/auth/presentations",
  "https://www.googleapis.com/auth/presentations.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri =
    process.env.GOOGLE_SLIDES_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google-slides/callback`;

  if (!clientId) {
    return NextResponse.json(
      { error: "GOOGLE_CLIENT_ID not configured" },
      { status: 500 },
    );
  }

  // Build Google OAuth authorization URL
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", GOOGLE_SLIDES_SCOPES);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("include_granted_scopes", "true"); // Incremental auth: inherit previously granted scopes

  return NextResponse.redirect(authUrl.toString());
}
