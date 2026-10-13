import "server-only";

import type { PexelsPhoto } from "@/lib/training/pexels-types";

export type { PexelsPhoto };

type PexelsSearchResponse = {
  photos?: {
    id: number;
    alt: string | null;
    photographer: string;
    src: { medium?: string; large?: string; landscape?: string };
  }[];
};

/**
 * Search Pexels for catalog thumbnails. Server-only; uses PEXELS_API_KEY.
 * Returns [] when the key is missing or the request fails.
 */
export async function searchPexelsPhotos(
  query: string,
  perPage = 12,
): Promise<PexelsPhoto[]> {
  const key = process.env.PEXELS_API_KEY?.trim();
  const term = query.trim().slice(0, 80);
  if (!key || !term) return [];

  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", term);
  url.searchParams.set("per_page", String(Math.min(Math.max(perPage, 1), 24)));
  url.searchParams.set("orientation", "landscape");

  try {
    const response = await fetch(url, {
      headers: { Authorization: key },
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      console.error("pexels search failed", response.status);
      return [];
    }
    const body = (await response.json()) as PexelsSearchResponse;
    return (body.photos ?? [])
      .map((photo) => {
        // medium is a reliable catalog-size JPEG on images.pexels.com
        const src = photo.src.medium ?? photo.src.landscape ?? photo.src.large;
        if (!src?.startsWith("https://images.pexels.com/")) return null;
        return {
          id: photo.id,
          alt: photo.alt?.trim() || term,
          photographer: photo.photographer,
          src,
        };
      })
      .filter((photo): photo is PexelsPhoto => photo !== null);
  } catch (error) {
    console.error("pexels search error", error);
    return [];
  }
}

export function isPexelsConfigured(): boolean {
  return Boolean(process.env.PEXELS_API_KEY?.trim());
}
