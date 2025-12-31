"use client";
import React from "react";
import { ShootingStars } from "@workspace/ui/components/shooting-stars";
import { StarsBackground } from "@workspace/ui/components/stars-background";
export function ShootingStarsAndStarsBackground({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md bg-neutral-900 flex flex-col items-center justify-center relative w-full h-screen">
      {children}
      <ShootingStars />
      <StarsBackground />
    </div>
  );
}
