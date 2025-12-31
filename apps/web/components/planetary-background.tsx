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
    <div className="relative w-full h-screen bg-[#08080f] overflow-hidden">
      {/* Background Content (Stars, etc) - Rendered first so it's behind everything */}
      <div className="absolute inset-0 pointer-events-none">
        {backgroundContent}
      </div>

      {/* Subtle star particles */}
      <div className="absolute inset-0 opacity-40 pointer-events-none">
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
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[180vw] md:w-[140vw] aspect-square pointer-events-none">
        {/* Planet body - positioned so only top arc is visible */}
        <div
          className="absolute bottom-[-85%] left-1/2 -translate-x-1/2 w-full h-full rounded-full"
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
          }}
        >
          {/* Secondary glow below the edge */}
          <div
            className="absolute top-0 left-[5%] right-[5%] h-[60px] rounded-full"
            style={{
              background:
                "linear-gradient(180deg, rgba(139, 92, 246, 0.15) 0%, transparent 100%)",
              filter: "blur(20px)",
            }}
          />
        </div>

        {/* Atmospheric glow above the planet */}
        <div
          className="absolute bottom-[12%] left-1/2 -translate-x-1/2 w-[80%] h-[30%]"
          style={{
            background:
              "radial-gradient(ellipse 100% 100% at 50% 100%, rgba(88, 28, 135, 0.2) 0%, transparent 70%)",
            filter: "blur(40px)",
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full">
        {children}
      </div>
    </div>
  );
}
