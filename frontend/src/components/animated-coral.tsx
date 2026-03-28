"use client";

import Image from "next/image";

export function AnimatedCoral() {
  return (
    <div className="flex items-center justify-center h-full bg-white">
      <div className="text-center">
        <div className="mb-4 flex justify-center">
          <Image
            src="/wda.gif"
            alt="Animated workflow illustration"
            width={300}
            height={300}
            className="rounded-lg"
            unoptimized
          />
        </div>
        <div className="text-gray-600 text-lg font-medium">
          Create your first workflow to see the magic happen
        </div>
        <div className="text-gray-400 text-sm mt-2">
          Use the AI chat to describe what you want to build
        </div>
      </div>
    </div>
  );
}
