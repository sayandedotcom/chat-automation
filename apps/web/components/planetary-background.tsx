"use client";

import React from "react";

export function PlanetaryBackground({
  children,
  backgroundContent,
}: {
  children: React.ReactNode;
  backgroundContent?: React.ReactNode;
}) {
  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#08080f]">
      {/* Background Content (Stars, etc) - Rendered first so it's behind everything */}
      <div className="pointer-events-none absolute inset-0">{backgroundContent}</div>

      {/* Subtle star particles */}
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(1px 1px at 20px 30px, rgba(255,255,255,0.4), transparent),
              radial-gradient(1px 1px at 40px 70px, rgba(255,255,255,0.3), transparent),
              radial-gradient(1px 1px at 90px 40px, rgba(255,255,255,0.4), transparent),
              radial-gradient(1px 1px at 160px 120px, rgba(255,255,255,0.3), transparent),
              radial-gradient(1px 1px at 230px 80px, rgba(255,255,255,0.4), transparent),
              radial-gradient(1px 1px at 300px 150px, rgba(255,255,255,0.2), transparent),
              radial-gradient(1px 1px at 370px 60px, rgba(255,255,255,0.4), transparent),
              radial-gradient(1px 1px at 450px 200px, rgba(255,255,255,0.3), transparent),
              radial-gradient(1px 1px at 50px 100px, rgba(255,255,255,0.3), transparent),
              radial-gradient(1px 1px at 120px 180px, rgba(255,255,255,0.2), transparent),
              radial-gradient(1px 1px at 200px 50px, rgba(255,255,255,0.4), transparent),
              radial-gradient(1px 1px at 280px 220px, rgba(255,255,255,0.2), transparent),
              radial-gradient(1px 1px at 350px 130px, rgba(255,255,255,0.4), transparent),
              radial-gradient(1px 1px at 420px 90px, rgba(255,255,255,0.3), transparent)`,
            backgroundSize: "500px 300px",
          }}
        />
      </div>

      {/* Large planetary sphere at the bottom */}
      <div className="pointer-events-none absolute bottom-0 left-1/2 aspect-square w-[180vw] -translate-x-1/2 md:w-[140vw]">
        {/* Planet body - positioned so only top arc is visible */}
        <div
          className="absolute bottom-[-85%] left-1/2 h-full w-full -translate-x-1/2 rounded-full"
          style={{
            background: `
              radial-gradient(ellipse 100% 100% at 50% 0%, 
                rgba(88, 28, 135, 0.15) 0%,
                rgba(59, 7, 100, 0.1) 30%,
                rgba(15, 10, 40, 0.8) 60%,
                rgba(10, 10, 25, 1) 100%
              )
            `,
            boxShadow: `
              inset 0 200px 300px -100px rgba(139, 92, 246, 0.08),
              inset 0 100px 200px -50px rgba(88, 28, 135, 0.1)
            `,
          }}>
          {/* Secondary glow below the edge */}
          <div
            className="absolute top-0 right-[5%] left-[5%] h-[60px] rounded-full"
            style={{
              background: "linear-gradient(180deg, rgba(139, 92, 246, 0.15) 0%, transparent 100%)",
              filter: "blur(20px)",
            }}
          />
        </div>

        {/* Atmospheric glow above the planet */}
        <div
          className="absolute bottom-[12%] left-1/2 h-[30%] w-[80%] -translate-x-1/2"
          style={{
            background:
              "radial-gradient(ellipse 100% 100% at 50% 100%, rgba(88, 28, 135, 0.2) 0%, transparent 70%)",
            filter: "blur(40px)",
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 flex h-full flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}
