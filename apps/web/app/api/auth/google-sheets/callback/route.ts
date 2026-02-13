import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=${encodeURIComponent(error)}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=no_code`,
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_SHEETS_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google-sheets/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=missing_credentials`,
    );
  }

  try {
    // Exchange authorization code for access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error("Google Sheets token exchange failed:", errorData);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=token_exchange_failed`,
      );
    }

    const tokens: GoogleTokenResponse = await tokenResponse.json();

    // Store tokens in cookies
    const cookieStore = await cookies();
    cookieStore.set("google_sheets_access_token", tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: tokens.expires_in,
    });

    if (tokens.refresh_token) {
      cookieStore.set("google_sheets_refresh_token", tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
    }

    // Sync credentials to MCP's credential store
    const agentApiUrl = process.env.AGENT_API_URL || "http://localhost:8000";
    try {
      const syncResponse = await fetch(
        `${agentApiUrl}/sync-gmail-credentials`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || "",
            client_id: clientId,
            client_secret: clientSecret,
            scopes: tokens.scope.split(" "),
          }),
        },
      );

      if (syncResponse.ok) {
        console.log("✅ Google Sheets credentials synced to MCP");
      } else {
        console.error(
          "⚠️ Failed to sync credentials to MCP:",
          await syncResponse.text(),
        );
      }
    } catch (syncError) {
      console.error("⚠️ Error syncing credentials to MCP:", syncError);
    }

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/integrations?success=google-sheets`,
    );
  } catch (error) {
    console.error("Google Sheets OAuth error:", error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=oauth_failed`,
    );
  }
}
