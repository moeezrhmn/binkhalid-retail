import { getCurrentUser } from "@/lib/auth";
import { sidebarStatus } from "@/server/services/sidebar";

// The sidebar re-reads this on every page change, so the day status, drawer
// amount and low-stock count stay current while the layout itself is not re-rendered.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  return Response.json(await sidebarStatus(user.type === "ADMIN"), {
    headers: { "Cache-Control": "no-store" },
  });
}
