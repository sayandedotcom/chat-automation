import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that require authentication
const PROTECTED_ROUTES = ["/chat", "/integrations", "/greetings"];

// Routes only accessible to unauthenticated users
const PUBLIC_ONLY_ROUTES = ["/"];

// Better Auth session cookie name
const SESSION_COOKIE = "better-auth.session_token";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);

  // Check if the current path matches a protected route
  const isProtectedRoute = PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/"),
  );

  // Check if the current path is a public-only route (homepage)
  const isPublicOnlyRoute = PUBLIC_ONLY_ROUTES.includes(pathname);

  // Unauthenticated user trying to access a protected route → redirect to homepage
  if (isProtectedRoute && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Authenticated user trying to access the homepage → redirect to /chat
  if (isPublicOnlyRoute && hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/chat";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api routes (/api/...)
     * - Next.js internals (/_next/...)
     * - Static files (favicon.ico, images, etc.)
     */
    "/((?!api|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
