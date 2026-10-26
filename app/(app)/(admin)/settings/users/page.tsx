import type { Metadata } from "next";
import { UsersManager } from "@/components/users/users-manager";
import { requireAdmin } from "@/lib/auth";
import { listUsers } from "@/server/services/users";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const admin = await requireAdmin();
  const users = await listUsers();
  return <UsersManager users={users} currentUserId={admin.id} />;
}
