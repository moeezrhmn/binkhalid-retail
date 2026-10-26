import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";

// The old "Staff accounts" address; user management is now Settings → Users.
export default async function OldStaffPage() {
  await requireAdmin();
  redirect("/settings/users");
}
