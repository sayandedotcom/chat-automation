import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_ROUTES = ["/chat", "/integrations", "/greetings"];
const PUBLIC_ONLY_ROUTES = ["/"];
const SESSION_COOKIE = "session_token";
const SESSION_ID_COOKIE = "session_id";

const OLD_COOKIES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
  "better-auth.csrf_token",
  "connect.sid",
];

function isProductionHost(request: NextRequest): boolean {
  const host = request.headers.get("host") ?? "";
  return host.includes("sayande.xyz");
}

function deleteOldCookies(response: NextResponse, isProduction: boolean) {
  OLD_COOKIES.forEach((cookieName) => {
    response.cookies.delete(cookieName);
  });

  if (isProduction) {
    OLD_COOKIES.forEach((cookieName) => {
      response.cookies.set(cookieName, "", {
        expires: new Date(0),
        path: "/",
        domain: ".sayande.xyz",
      });
      response.cookies.set(cookieName, "", {
        expires: new Date(0),
        path: "/",
      });
    });
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProduction = isProductionHost(request);

  const hasOldCookies = OLD_COOKIES.some((cookie) =>
    request.cookies.has(cookie),
  );

  const hasSession =
    request.cookies.has(SESSION_COOKIE) ||
    request.cookies.has(SESSION_ID_COOKIE);

  const isProtectedRoute = PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/"),
  );

  const isPublicOnlyRoute = PUBLIC_ONLY_ROUTES.includes(pathname);

  if (hasOldCookies) {
    const response =
      isProtectedRoute && !hasSession
        ? NextResponse.redirect(new URL("/", request.url))
        : NextResponse.next();
    deleteOldCookies(response, isProduction);
    return response;
  }

  if (isProtectedRoute && !hasSession) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (isPublicOnlyRoute && hasSession) {
    return NextResponse.redirect(new URL("/chat", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
