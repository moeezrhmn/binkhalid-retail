import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { CustomerFormButton } from "@/components/customers/customer-dialogs";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatDate, formatRs } from "@/lib/format";
import { listCustomers, totalOutstanding } from "@/server/services/customers";

export const metadata: Metadata = { title: "Customers" };

const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const params = await searchParams;
  const q = one(params.q)?.trim() ?? "";
  const owing = one(params.owing) === "1";
  const page = Number(one(params.page)) || 1;
  const [result, outstanding] = await Promise.all([
    listCustomers({ q, owing, page }),
    totalOutstanding(),
  ]);
  const query = { q: q || undefined, owing: owing ? "1" : undefined };

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm whitespace-nowrap",
      active
        ? "border-brand-700 bg-brand-700 text-white"
        : "border-gray-300 bg-white text-gray-700 hover:border-brand-600",
    );

  return (
    <>
      <PageHeader
        title="Customers"
        description={`Purchase history and udhaar. Total udhaar owed to the shop: ${formatRs(outstanding)}`}
        actions={<CustomerFormButton />}
      />
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <form action="/customers" className="relative w-80 max-w-full">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-gray-400"
              aria-hidden
            />
            <Input
              name="q"
              defaultValue={q}
              placeholder="Search by name or phone"
              aria-label="Search customers"
              className="pl-8"
              autoFocus
            />
            {owing ? <input type="hidden" name="owing" value="1" /> : null}
          </form>
          <Link
            href={
              owing
                ? `/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`
                : `/customers?owing=1${q ? `&q=${encodeURIComponent(q)}` : ""}`
            }
            className={chip(owing)}
          >
            Owes udhaar
          </Link>
        </div>
        <Card>
          <Table>
            <THead>
              <tr>
                <TH>Customer</TH>
                <TH>Phone</TH>
                <TH className="text-right">Bills</TH>
                <TH>Last purchase</TH>
                <TH className="text-right">Udhaar</TH>
              </tr>
            </THead>
            <TBody>
              {result.items.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <Link
                      href={`/customers/${c.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {c.name}
                    </Link>
                  </TD>
                  <TD className="text-gray-600">{c.phone ?? "—"}</TD>
                  <TD className="text-right">{c.billCount}</TD>
                  <TD className="text-gray-600">
                    {c.lastPurchase ? formatDate(c.lastPurchase) : "—"}
                  </TD>
                  <TD
                    className={cn(
                      "text-right font-semibold",
                      c.balance > 0 ? "text-red-600" : "text-gray-400",
                    )}
                  >
                    {c.balance > 0
                      ? formatRs(c.balance)
                      : c.balance < 0
                        ? `${formatRs(-c.balance)} advance`
                        : "—"}
                  </TD>
                </TR>
              ))}
              {result.items.length === 0 ? (
                <tr>
                  <TD colSpan={5} className="py-10 text-center text-gray-500">
                    {q || owing
                      ? "No customers match."
                      : "No customers yet. They are added at the POS or here."}
                  </TD>
                </tr>
              ) : null}
            </TBody>
          </Table>
        </Card>
        <Pagination page={result.page} pageCount={result.pageCount} params={query} />
      </div>
    </>
  );
}
