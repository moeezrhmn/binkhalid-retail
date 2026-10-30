import { cookies } from "next/headers";
import { Sidebar } from "@/components/sidebar";
import { ConfirmProvider } from "@/components/ui/confirm";
import { requireUser } from "@/lib/auth";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { sidebarStatus } from "@/server/services/sidebar";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const [status, cookieStore] = await Promise.all([
    sidebarStatus(user.type === "ADMIN"),
    cookies(),
  ]);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        user={user}
        initialStatus={status}
        initialCollapsed={cookieStore.get(SIDEBAR_COOKIE)?.value === "1"}
      />
      <main className="min-w-0 flex-1 px-3 py-3 md:px-5 md:py-4">
        <ConfirmProvider>{children}</ConfirmProvider>
      </main>
    </div>
  );
}
