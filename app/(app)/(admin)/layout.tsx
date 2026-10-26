import { requireAdmin } from "@/lib/auth";

// Sends staff to /pos on the first visit. Layouts are not re-run when moving
// between pages inside them, so every admin page, server action and route
// handler also calls requireAdmin() itself (tests/access.test.ts checks this).
export default async function AdminLayout({ children }: LayoutProps<"/">) {
  await requireAdmin();
  return children;
}
