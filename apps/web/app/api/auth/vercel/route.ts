import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.VERCEL_CLIENT_ID;
  const redirectUri =
    process.env.VERCEL_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/vercel/callback`;

  if (!clientId) {
    return NextResponse.json(
      { error: "VERCEL_CLIENT_ID not configured" },
      { status: 500 }
    );
  }

  // Build Vercel OAuth authorization URL
  const authUrl = new URL("https://vercel.com/integrations/new");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");

  return NextResponse.redirect(authUrl.toString());
}
