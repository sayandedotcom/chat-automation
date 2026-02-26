import {
  Strategy as GoogleStrategy,
  type VerifyCallback,
} from "passport-google-oauth20";
import { prisma } from "@workspace/database";
import { config } from "../config/index.js";
import type { SessionUser, OAuthProfile } from "../@types/index.js";

export const googleStrategy = new GoogleStrategy(
  {
    clientID: config.google.clientId,
    clientSecret: config.google.clientSecret,
    callbackURL: config.google.callbackUrl,
    scope: ["profile", "email"],
    passReqToCallback: false,
  },
  async (
    accessToken: string,
    refreshToken: string | undefined,
    profile: OAuthProfile,
    done: VerifyCallback,
  ) => {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) {
        return done(new Error("No email found in Google profile"), false);
      }

      let user = await prisma.user.findUnique({
        where: { email },
        include: { accounts: true },
      });

      const googleAccount = user?.accounts.find(
        (a) => a.providerId === "google",
      );

      if (googleAccount) {
        await prisma.account.update({
          where: { id: googleAccount.id },
          data: {
            accessToken,
            refreshToken: refreshToken ?? googleAccount.refreshToken,
          },
        });
      } else {
        if (!user) {
          user = await prisma.user.create({
            data: {
              email,
              name: profile.displayName,
              image: profile.photos?.[0]?.value,
              emailVerified: profile.emails?.[0]?.verified ?? false,
              accounts: {
                create: {
                  providerId: "google",
                  accountId: profile.id,
                  accessToken,
                  refreshToken,
                },
              },
            },
            include: { accounts: true },
          });
        } else {
          await prisma.account.create({
            data: {
              userId: user.id,
              providerId: "google",
              accountId: profile.id,
              accessToken,
              refreshToken,
            },
          });
        }
      }

      if (!user) {
        return done(new Error("Failed to create or find user"), false);
      }

      const sessionUser: SessionUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      };

      return done(null, sessionUser);
    } catch (error) {
      console.error("[GoogleStrategy] Error:", error);
      return done(error as Error, false);
    }
  },
);
