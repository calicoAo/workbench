import { BookOpen, BriefcaseBusiness, CircleUserRound, HeartPulse, Home, PenTool, Shield, Users } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useState } from "react";

export type PixelAssetSlot = "hero-avatar" | "hero-half-body" | "level-badge" | "xp-frame" | "career" | "learning" | "creative" | "life" | "body" | "social";

export const PIXEL_ASSET_MANIFEST: Record<PixelAssetSlot, { src: string; logicalSize: readonly [number, number] }> = {
  "hero-avatar": { src: "/pixel/growth/hero-avatar@4x.png", logicalSize: [64, 64] },
  "hero-half-body": { src: "/pixel/growth/hero-half-body@4x.png", logicalSize: [96, 96] },
  "level-badge": { src: "/pixel/growth/level-badge@4x.png", logicalSize: [32, 32] },
  "xp-frame": { src: "/pixel/growth/xp-frame@4x.png", logicalSize: [160, 16] },
  career: { src: "/pixel/growth/dimension-career@4x.png", logicalSize: [24, 24] },
  learning: { src: "/pixel/growth/dimension-learning@4x.png", logicalSize: [24, 24] },
  creative: { src: "/pixel/growth/dimension-creative@4x.png", logicalSize: [24, 24] },
  life: { src: "/pixel/growth/dimension-life@4x.png", logicalSize: [24, 24] },
  body: { src: "/pixel/growth/dimension-body@4x.png", logicalSize: [24, 24] },
  social: { src: "/pixel/growth/dimension-social@4x.png", logicalSize: [24, 24] }
};

const fallbacks: Record<PixelAssetSlot, ComponentType<SVGProps<SVGSVGElement>>> = {
  "hero-avatar": CircleUserRound,
  "hero-half-body": Shield,
  "level-badge": Shield,
  "xp-frame": Shield,
  career: BriefcaseBusiness,
  learning: BookOpen,
  creative: PenTool,
  life: Home,
  body: HeartPulse,
  social: Users
};

export function PixelAsset({ slot, label, size }: { slot: PixelAssetSlot; label: string; size?: number }) {
  const asset = PIXEL_ASSET_MANIFEST[slot];
  const [failed, setFailed] = useState(false);
  const width = size ?? asset.logicalSize[0];
  const height = size ?? asset.logicalSize[1];
  const Fallback = fallbacks[slot];
  return <span className="pixel-icon-slot" style={{ width, height }} aria-label={label}>{failed ? <Fallback aria-hidden="true" width={Math.max(16, Math.round(width * .54))} height={Math.max(16, Math.round(height * .54))} /> : <img className="pixel-image" src={asset.src} width={width} height={height} alt="" onError={() => setFailed(true)} />}</span>;
}

export function pixelDimensionSlot(key: string): PixelAssetSlot {
  return (["career", "learning", "creative", "life", "body", "social"] as const).includes(key as never) ? key as PixelAssetSlot : "level-badge";
}
