"use client";

import { useEffect, useRef, useState } from "react";

import { vimeoPlayerUrl } from "@/lib/training/validation";

/**
 * Native Vimeo chrome, masked when the pointer is outside the player.
 *
 * Vimeo cannot toggle its control bar from the parent page. Custom SDK
 * play/pause was unreliable here, so we keep controls enabled and cover the
 * bottom chrome until the pointer is over this player (including the iframe).
 */
export function VimeoHoverPlayer({
  videoId,
  title,
}: {
  videoId: string;
  title: string;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const hotRef = useRef(false);
  const [hot, setHot] = useState(false);

  useEffect(() => {
    function pointerInside(clientX: number, clientY: number) {
      const shell = shellRef.current;
      if (!shell) return false;
      const box = shell.getBoundingClientRect();
      return (
        clientX >= box.left &&
        clientX <= box.right &&
        clientY >= box.top &&
        clientY <= box.bottom
      );
    }

    function setHotState(next: boolean) {
      if (hotRef.current === next) return;
      hotRef.current = next;
      setHot(next);
    }

    function onDocumentMouseMove(event: MouseEvent) {
      setHotState(pointerInside(event.clientX, event.clientY));
    }

    function onDocumentMouseLeave() {
      setHotState(false);
    }

    document.addEventListener("mousemove", onDocumentMouseMove);
    document.documentElement.addEventListener("mouseleave", onDocumentMouseLeave);

    return () => {
      document.removeEventListener("mousemove", onDocumentMouseMove);
      document.documentElement.removeEventListener(
        "mouseleave",
        onDocumentMouseLeave,
      );
    };
  }, []);

  const src = new URL(vimeoPlayerUrl(videoId));
  src.searchParams.set("playsinline", "1");

  return (
    <div ref={shellRef} className="relative size-full bg-black">
      <iframe
        src={src.toString()}
        title={title}
        className="absolute inset-0 size-full border-0"
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media; clipboard-write"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />

      {/* Covers Vimeo’s bottom chrome while the pointer is outside the player */}
      {!hot ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-black"
        />
      ) : null}
    </div>
  );
}
