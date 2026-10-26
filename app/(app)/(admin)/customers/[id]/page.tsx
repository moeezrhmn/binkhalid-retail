import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { CustomerFormButton, ReceivePaymentButton } from "@/components/customers/customer-dialogs";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatDateTime, formatRs } from "@/lib/format";
import { customerPurchases, customerStatement, getCustomer } from "@/server/services/customers";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const customer = /^[0-9a-f-]{36}$/.test(id) ? await getCustomer(id) : null;
  if (!customer) notFound();
  const [statement, purchases] = await Promise.all([customerStatement(id), customerPurchases(id)]);
  const balance = statement.at(-1)?.balance ?? 0;

  return (
    <>
      <PageHeader
        title={customer.name}
        description={[customer.phone ?? "No phone", customer.notes].filter(Boolean).join(" · ")}
        actions={
          <>
            <CustomerFormButton
              customer={{
                id: customer.id,
                name: customer.name,
                phone: customer.phone,
                notes: customer.notes,
              }}
            />
            <a
              href={`/print/statement/${customer.id}`}
              target="_blank"
              rel="noreferrer"
              className={buttonClasses({ variant: "secondary" })}
            >
              <Printer className="size-4" aria-hidden /> Statement
            </a>
            <ReceivePaymentButton
              customer={{ id: customer.id, name: customer.name }}
              balance={balance}
            />
          </>
        }
      />
      <div className="space-y-3">
        <Card className="flex flex-wrap items-center gap-6 p-4">
          <div>
            <p className="text-xs text-gray-500">Udhaar balance</p>
            <p className={cn("text-2xl font-bold", balance > 0 ? "text-red-600" : "text-gray-900")}>
              {balance < 0 ? `${formatRs(-balance)} advance` : formatRs(balance)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Bills</p>
            <p className="text-2xl font-bold text-gray-900">{purchases.length}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Total bought</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatRs(purchases.reduce((s, p) => s + p.total, 0))}
            </p>
          </div>
        </Card>

        <div className="grid gap-3 xl:grid-cols-2">
          <Card>
            <h2 className="px-4 pt-3 text-sm font-semibold text-gray-900">Udhaar statement</h2>
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Details</TH>
                  <TH className="text-right whitespace-nowrap">Udhaar</TH>
                  <TH className="text-right whitespace-nowrap">Paid back</TH>
                  <TH className="text-right whitespace-nowrap">Balance</TH>
                </tr>
              </THead>
              <TBody>
                {statement.map((entry) => (
                  <TR key={entry.id}>
                    <TD className="text-xs whitespace-nowrap text-gray-600">
                      {formatDateTime(entry.date)}
                    </TD>
                    <TD>
                      {entry.saleId ? (
                        <Link href={`/sales/${entry.saleId}`} className="hover:underline">
                          {entry.description}
                        </Link>
                      ) : (
                        entry.description
                      )}
                    </TD>
                    <TD className="text-right whitespace-nowrap">
                      {entry.charge ? formatRs(entry.charge) : ""}
                    </TD>
                    <TD className="text-right whitespace-nowrap text-brand-700">
                      {entry.payment ? formatRs(entry.payment) : ""}
                    </TD>
                    <TD className="text-right font-semibold whitespace-nowrap">
                      {formatRs(entry.balance)}
                    </TD>
                  </TR>
                ))}
                {statement.length === 0 ? (
                  <tr>
                    <TD colSpan={5} className="py-6 text-center text-gray-500">
                      No udhaar.
                    </TD>
                  </tr>
                ) : null}
              </TBody>
            </Table>
          </Card>

          <Card>
            <h2 className="px-4 pt-3 text-sm font-semibold text-gray-900">Purchases</h2>
            <Table>
              <THead>
                <tr>
                  <TH>Bill</TH>
                  <TH>Date</TH>
                  <TH className="text-right whitespace-nowrap">Items</TH>
                  <TH className="text-right whitespace-nowrap">Total</TH>
                  <TH className="text-right whitespace-nowrap">On udhaar</TH>
                </tr>
              </THead>
              <TBody>
                {purchases.map((sale) => (
                  <TR key={sale.id}>
                    <TD>
                      <Link
                        href={`/sales/${sale.id}`}
                        className="font-semibold text-brand-700 hover:underline"
                      >
                        #{sale.billNo}
                      </Link>
                      {sale.returned ? (
                        <span className="ml-2">
                          <Badge tone="gold">Returns</Badge>
                        </span>
                      ) : null}
                    </TD>
                    <TD className="text-xs whitespace-nowrap text-gray-600">
                      {formatDateTime(sale.completedAt)}
                    </TD>
                    <TD className="text-right whitespace-nowrap">{sale.itemCount}</TD>
                    <TD className="text-right whitespace-nowrap">{formatRs(sale.total)}</TD>
                    <TD className="text-right whitespace-nowrap text-gray-600">
                      {sale.udhaar ? formatRs(sale.udhaar) : ""}
                    </TD>
                  </TR>
                ))}
                {purchases.length === 0 ? (
                  <tr>
                    <TD colSpan={5} className="py-6 text-center text-gray-500">
                      No purchases yet.
                    </TD>
                  </tr>
                ) : null}
              </TBody>
            </Table>
          </Card>
        </div>
      </div>
    </>
  );
}
