export type LibraryType = "BOOK" | "MOVIE" | "SERIES" | "GAME";
export type LibraryStatus = "WANT" | "IN_PROGRESS" | "FINISHED" | "DROPPED";
export type LibraryItem = {
  id: number;
  type: LibraryType;
  title: string;
  originalTitle: string | null;
  creator: string | null;
  coverRef: string | null;
  status: LibraryStatus;
  rating: number | null;
  startedOn: string | null;
  finishedOn: string | null;
  externalRef: string | null;
  shortNote: string | null;
  description: string | null;
  releaseYear: number | null;
  version: number;
  relationCount?: number;
};
export type Relation = {
  id: number;
  targetType: string;
  targetId: number;
  summary: { title: string; date: string; deepLink: string } | null;
};
export const statuses: Array<{ key: "ALL" | LibraryStatus; label: string }> = [
  { key: "ALL", label: "全部" },
  { key: "WANT", label: "想体验" },
  { key: "IN_PROGRESS", label: "进行中" },
  { key: "FINISHED", label: "已完成" },
  { key: "DROPPED", label: "已放下" },
];
export const typeLabels: Record<LibraryType, string> = {
  BOOK: "书籍",
  MOVIE: "电影",
  SERIES: "剧集",
  GAME: "游戏",
};
export const statusLabels: Record<LibraryStatus, string> = {
  WANT: "想体验",
  IN_PROGRESS: "进行中",
  FINISHED: "已完成",
  DROPPED: "已放下",
};

