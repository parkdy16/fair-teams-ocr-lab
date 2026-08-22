import React from "react";
import {
  Activity,
  BadgeCheck,
  Brain,
  CircleDot,
  Crosshair,
  Diamond,
  Eye,
  Flame,
  Footprints,
  Gauge,
  Goal,
  Handshake,
  HeartHandshake,
  Move,
  Route,
  Shield,
  Sparkles,
  Star,
  Swords,
  Target,
  Trophy,
  WandSparkles,
  Waves,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type { PlayerPresetIconKey } from "@/lib/rosterPlayerModel";

export const PLAYER_PRESET_ICON_COMPONENTS: Record<PlayerPresetIconKey, LucideIcon> = {
  target: Target,
  crosshair: Crosshair,
  wand: WandSparkles,
  route: Route,
  sparkles: Sparkles,
  shield: Shield,
  "badge-check": BadgeCheck,
  zap: Zap,
  activity: Activity,
  gauge: Gauge,
  brain: Brain,
  eye: Eye,
  handshake: Handshake,
  flame: Flame,
  move: Move,
  "circle-dot": CircleDot,
  swords: Swords,
  trophy: Trophy,
  star: Star,
  diamond: Diamond,
  "heart-handshake": HeartHandshake,
  waves: Waves,
  footprints: Footprints,
  goal: Goal,
};

export const PLAYER_PRESET_ICON_OPTIONS = Object.keys(
  PLAYER_PRESET_ICON_COMPONENTS,
) as PlayerPresetIconKey[];

export function PlayerPresetIcon({
  iconKey,
  className,
}: {
  iconKey: PlayerPresetIconKey;
  className?: string;
}) {
  const Icon = PLAYER_PRESET_ICON_COMPONENTS[iconKey] || Star;
  return <Icon className={className} aria-hidden="true" />;
}
