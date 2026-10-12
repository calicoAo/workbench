import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import type { Request } from "../../app/api";
import { tx } from "../../app/i18n";
import { PixelAsset } from "./pixel-assets";
import type { GrowthOverview } from "./contracts";
export function TodayGrowthEntry({ request, userId, date }: { request: Request; userId: number; date: string }) {
  const query = useQuery({ queryKey: ["growth-overview", userId, 7, date], queryFn: () => request<GrowthOverview>(`/api/growth/overview?period=7&to=${date}`) });
  if (!query.data) return null;
  return <section className="today-growth-entry pixel-surface"><PixelAsset slot="hero-avatar" label={tx("英雄头像")} size={48} /><span><small>{tx("成长")}</small><strong>Lv.{query.data.hero.level}</strong><p>{tx("本周投入")} {formatDuration(query.data.summary.actualMinutes)}</p></span><Link to={`/growth?date=${date}`}>{tx("查看成长")}</Link></section>;
}

function formatDuration(minutes: number) { const hours = Math.floor(minutes / 60); const rest = minutes % 60; return hours ? rest ? `${hours}h ${rest}m` : `${hours}h` : `${minutes}m`; }
