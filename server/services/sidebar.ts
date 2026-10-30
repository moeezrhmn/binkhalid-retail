import { db } from "@/lib/db";
import { SHOP_TIME_ZONE, shopDate, toYmd } from "@/lib/dates";
import { currentSession, summarize } from "./cash";

export type SidebarStatus = {
  day: { open: boolean; since: string | null };
  /** Admins only: cash that should be in the drawer now. */
  expectedCash: number | null;
  /** Admins only: active items at or below their minimum stock. */
  lowStock: number | null;
};

const time = new Intl.DateTimeFormat("en-GB", {
  timeZone: SHOP_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const dayAndTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: SHOP_TIME_ZONE,
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** "9:12 am" for today, "26 Oct, 9:12 am" for a day left open since an earlier date. */
function openedLabel(openedAt: Date, now = new Date()) {
  const sameDay = toYmd(shopDate(openedAt)) === toYmd(shopDate(now));
  return (sameDay ? time : dayAndTime).format(openedAt).toLowerCase();
}

export async function sidebarStatus(isAdmin: boolean): Promise<SidebarStatus> {
  const session = await currentSession();
  const day = { open: Boolean(session), since: session ? openedLabel(session.openedAt) : null };
  if (!isAdmin) return { day, expectedCash: null, lowStock: null };

  const [summary, lowStock] = await Promise.all([
    session ? summarize(session, null) : null,
    db.variant.count({
      where: {
        isActive: true,
        product: { isActive: true },
        stockQty: { lte: db.variant.fields.minStock },
      },
    }),
  ]);
  return { day, expectedCash: summary?.expectedCash ?? null, lowStock };
}
