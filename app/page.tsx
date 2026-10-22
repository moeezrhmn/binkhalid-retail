import { redirect } from "next/navigation";
import { homePathFor, requireUser } from "@/lib/auth";

export default async function Home() {
  const user = await requireUser();
  redirect(homePathFor(user));
}
