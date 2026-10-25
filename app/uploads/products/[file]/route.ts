import { getCurrentUser } from "@/lib/auth";
import { readProductImage } from "@/server/services/images";

export async function GET(_request: Request, ctx: RouteContext<"/uploads/products/[file]">) {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });

  const { file } = await ctx.params;
  const image = await readProductImage(file);
  if (!image) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(image.body), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
