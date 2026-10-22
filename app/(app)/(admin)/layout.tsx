import { requireAdmin } from "@/lib/auth";

// Staff are sent to /pos. Admin pages and their server actions must still call
// requireAdmin() themselves: a layout check alone does not protect actions.
export default async function AdminLayout({ children }: LayoutProps<"/">) {
  await requireAdmin();
  return children;
}
