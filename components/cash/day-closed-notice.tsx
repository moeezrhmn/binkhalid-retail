"use client";

import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import type { DayStatus } from "@/server/services/cash";
import { ReopenDayButton } from "./register-forms";

/**
 * Shown wherever money would move while the register day is closed: says why,
 * and offers the two ways forward (open a new day, or reopen the last one).
 */
export function DayClosedNotice({
  day,
  action,
  isAdmin = true,
  extra,
}: {
  day: DayStatus;
  /** What needs an open day, e.g. "receive payments". */
  action: string;
  isAdmin?: boolean;
  extra?: string;
}) {
  if (day.open) return null;
  return (
    <Alert tone="error" className="space-y-2">
      <p>
        <strong>The day is closed.</strong>{" "}
        {isAdmin
          ? `Open the day first to ${action}.`
          : `Ask an admin to open the day in Cash Register to ${action}.`}
        {day.lastClosedAt && isAdmin
          ? ` If the last day (closed at ${day.lastClosedAt}) was closed by mistake, you can reopen it instead.`
          : ""}
        {extra ? ` ${extra}` : ""}
      </p>
      {isAdmin ? (
        <div className="flex flex-wrap items-start gap-2">
          <Link href="/cash" className={buttonClasses({ size: "sm" })}>
            Open the day
          </Link>
          {day.lastClosedAt ? <ReopenDayButton closedAt={day.lastClosedAt} size="sm" /> : null}
        </div>
      ) : null}
    </Alert>
  );
}
