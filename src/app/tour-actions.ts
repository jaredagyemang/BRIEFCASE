"use server";

import { TOUR_KEYS, type TourKey } from "@/content/tours";
import { markTourSeen, resetTours } from "@/lib/tours";

// A page's tour has been shown (it's only shown once per coach).
export async function markTourSeenAction(key: string) {
  if ((TOUR_KEYS as readonly string[]).includes(key)) await markTourSeen(key as TourKey);
}

export async function resetToursAction() {
  await resetTours();
}
