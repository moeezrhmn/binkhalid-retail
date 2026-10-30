import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Static checks that every way into the app checks who is asking, on the server.
// A menu item being hidden is not access control; these tests fail the build of
// anything new that forgets its check.

const ROOT = path.resolve(__dirname, "..");

function files(dir: string, name: RegExp): string[] {
  const full = path.join(ROOT, dir);
  return readdirSync(full).flatMap((entry) => {
    const p = path.join(full, entry);
    const rel = path.relative(ROOT, p);
    return statSync(p).isDirectory() ? files(rel, name) : name.test(entry) ? [rel] : [];
  });
}

const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

/** Each exported server action, with the start of its body. */
function exportedActions(source: string) {
  return [...source.matchAll(/export async function (\w+)\(/g)].map((match) => {
    // Skip the parameter list by matching brackets, then take the brace that opens
    // the body: the first "{" at the end of a line after ")" or ">" (return type).
    let depth = 1;
    let i = match.index! + match[0].length;
    for (; i < source.length && depth > 0; i++) {
      if (source[i] === "(") depth++;
      else if (source[i] === ")") depth--;
    }
    const opener = /[)>] \{\n/g;
    opener.lastIndex = i - 1;
    const found = opener.exec(source);
    const bodyStart = found ? found.index + found[0].length - 2 : i;
    return { name: match[1], body: source.slice(bodyStart, bodyStart + 400) };
  });
}

/** The first statement of the body must be the role check. */
function checksFirst(body: string, call: "requireAdmin" | "requireUser") {
  const first = body.slice(1).trim().split("\n")[0];
  return new RegExp(`^(const \\w+ = )?await ${call}\\(\\);$`).test(first);
}

describe("access control", () => {
  const adminPages = files("app/(app)/(admin)", /^page\.tsx$/);

  it("finds the admin pages", () => {
    expect(adminPages.length).toBeGreaterThan(20);
  });

  it.each(adminPages)("%s checks for an admin itself", (file) => {
    expect(read(file)).toMatch(/await requireAdmin\(\)/);
  });

  const adminActionFiles = files("app/(app)/(admin)", /^actions\.ts$/);

  it.each(adminActionFiles)("every action in %s starts with requireAdmin()", (file) => {
    const actions = exportedActions(read(file));
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect({ action: action.name, ok: checksFirst(action.body, "requireAdmin") }).toEqual({
        action: action.name,
        ok: true,
      });
    }
  });

  it("every POS action starts with requireUser() (staff may bill)", () => {
    for (const action of exportedActions(read("app/(app)/pos/actions.ts"))) {
      expect({ action: action.name, ok: checksFirst(action.body, "requireUser") }).toEqual({
        action: action.name,
        ok: true,
      });
    }
  });

  it("no server action outside the checked folders except login/logout", () => {
    const all = files("app", /\.tsx?$/).filter((file) => /^\s*["']use server["']/.test(read(file)));
    const checked = new Set([
      ...adminActionFiles,
      "app/(app)/pos/actions.ts",
      "app/actions/auth.ts",
    ]);
    expect(all.filter((file) => !checked.has(file))).toEqual([]);
  });

  it("print pages check the right role", () => {
    expect(read("app/print/labels/page.tsx")).toMatch(/await requireAdmin\(\)/);
    expect(read("app/print/statement/[id]/page.tsx")).toMatch(/await requireAdmin\(\)/);
    // Staff reprint receipts from the POS.
    expect(read("app/print/receipt/[id]/page.tsx")).toMatch(/await requireUser\(\)/);
  });

  it("route handlers check the session", () => {
    const routes = files("app", /^route\.ts$/);
    expect(routes.sort()).toEqual([
      "app/(app)/(admin)/reports/export/route.ts",
      "app/(app)/sidebar-status/route.ts",
      "app/uploads/products/[file]/route.ts",
    ]);
    // Staff get the day status only, never the drawer amount or stock counts.
    expect(read("app/(app)/sidebar-status/route.ts")).toMatch(
      /await getCurrentUser\(\)[\s\S]*sidebarStatus\(user\.type === "ADMIN"\)/,
    );
    expect(read("app/(app)/(admin)/reports/export/route.ts")).toMatch(/user\.type !== "ADMIN"/);
    expect(read("app/uploads/products/[file]/route.ts")).toMatch(/await getCurrentUser\(\)/);
  });

  it("the POS page and home page need a login", () => {
    expect(read("app/(app)/pos/page.tsx")).toMatch(/await requireUser\(\)/);
    expect(read("app/page.tsx")).toMatch(/await requireUser\(\)/);
  });
});
