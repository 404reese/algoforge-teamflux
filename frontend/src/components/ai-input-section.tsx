"use client";

import { AnimatedAIInput } from "./ui/animated-ai-input";

export function AIInputSection() {
  return (
    <div>
      <AnimatedAIInput />
    {/* <div className="w-full max-w-[960px] lg:w-[960px] py-12 sm:py-16 md:py-20 lg:py-24 flex flex-col justify-center items-center relative">
      
      <div className="absolute w-full h-full top-0 left-1/2 transform -translate-x-1/2 flex items-center justify-center overflow-hidden">
        <video
          src="/"
          autoPlay
          loop
          muted
          className="w-full h-full object-cover rounded-2xl"
        />
      </div>

      <div className="relative z-10 w-full">
        <AnimatedAIInput />
      </div>
    </div> */}
    </div>
  );
}
