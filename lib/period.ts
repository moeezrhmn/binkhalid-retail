import { cookies } from "next/headers";
import { decodePeriod, PERIOD_COOKIE, rangeFromParams, type PeriodParams } from "./date-filter";

/**
 * The period in the URL, or else the one last chosen (saved in a cookie by
 * <PeriodFilter>), or else this month.
 */
export async function resolvePeriod(params: PeriodParams) {
  if (params.period) return rangeFromParams(params);
  const saved = (await cookies()).get(PERIOD_COOKIE)?.value;
  return rangeFromParams(decodePeriod(saved));
}
