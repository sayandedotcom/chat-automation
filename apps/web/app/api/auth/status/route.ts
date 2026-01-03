import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();

  const status = {
    gmail: !!cookieStore.get("gmail_access_token"),
    "google-docs": !!cookieStore.get("google_docs_access_token"),
    vercel: !!cookieStore.get("vercel_access_token"),
    notion: !!cookieStore.get("notion_access_token"),
  };

  return NextResponse.json(status);
}
