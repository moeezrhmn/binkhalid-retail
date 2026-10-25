import type { Metadata } from "next";
import { StaffManager } from "@/components/settings/staff-manager";
import { requireAdmin } from "@/lib/auth";
import { listUsers } from "@/server/services/users";

export const metadata: Metadata = { title: "Staff accounts" };

export default async function StaffPage() {
  const [admin, users] = await Promise.all([requireAdmin(), listUsers()]);
  return <StaffManager users={users} currentUserId={admin.id} />;
}
