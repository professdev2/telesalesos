"use client";

import { useState, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";
import { searchPexelsThumbnailsAction } from "@/lib/training/actions";
import type { PexelsPhoto } from "@/lib/training/pexels-types";
import { cn } from "@/lib/utils";

export function CourseThumbnailField({
  id,
  defaultValue = "",
  errors,
}: {
  id: string;
  defaultValue?: string;
  errors?: string[];
}) {
  const [url, setUrl] = useState(defaultValue);
  const [query, setQuery] = useState("business training");
  const [photos, setPhotos] = useState<PexelsPhoto[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function search() {
    startTransition(async () => {
      setMessage(null);
      const result = await searchPexelsThumbnailsAction(query);
      if (result.error) {
        setPhotos([]);
        setMessage(result.error);
        return;
      }
      setPhotos(result.photos);
      if (result.photos.length === 0) {
        setMessage("No images found. Try another search.");
      }
    });
  }

  return (
    <div className="space-y-2 sm:col-span-2">
      <Label htmlFor={id}>Thumbnail (optional)</Label>
      <Input
        id={id}
        name="thumbnailUrl"
        type="url"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="https://images.pexels.com/..."
        aria-describedby={`${id}-help ${id}-error`}
      />
      <p id={`${id}-help`} className="text-muted-foreground text-xs">
        Click <strong>Search images</strong>, then click a photo. Do not paste a
        Pexels page link (pexels.com/photo/…) or a Google Drive share link.
      </p>
      {errors?.length ? (
        <p id={`${id}-error`} className="text-destructive text-xs">
          {errors.join(" ")}
        </p>
      ) : (
        <span id={`${id}-error`} className="sr-only" />
      )}

      <div className="flex flex-wrap items-end gap-2 pt-1">
        <div className="min-w-[12rem] flex-1 space-y-1">
          <Label htmlFor={`${id}-pexels-query`} className="text-xs">
            Search Pexels
          </Label>
          <Input
            id={`${id}-pexels-query`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="office, headset, training..."
          />
        </div>
        <button
          type="button"
          onClick={search}
          disabled={pending || !query.trim()}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          {pending ? "Searching..." : "Search images"}
        </button>
      </div>

      {message ? (
        <p className="text-muted-foreground text-xs">{message}</p>
      ) : null}

      {photos.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((photo) => {
            const selected = url === photo.src;
            return (
              <li key={photo.id}>
                <button
                  type="button"
                  onClick={() => setUrl(photo.src)}
                  className={cn(
                    "border-border relative aspect-video w-full overflow-hidden rounded-md border",
                    selected && "ring-ring ring-2 ring-offset-2 ring-offset-background",
                  )}
                  title={`${photo.alt} — Photo by ${photo.photographer} on Pexels`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.src}
                    alt={photo.alt}
                    className="size-full object-cover"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {url ? (
        <div className="border-border mt-1 aspect-video max-w-xs overflow-hidden rounded-md border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="size-full object-cover" />
        </div>
      ) : null}
    </div>
  );
}
