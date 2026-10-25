import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { requireAdmin } from "@/lib/auth";
import { formatDate, formatDateTime, formatRs } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { customerStatement, getCustomer } from "@/server/services/customers";

export const metadata: Metadata = { title: "Udhaar statement" };

export default async function StatementPrintPage({ params }: PageProps<"/print/statement/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const customer = /^[0-9a-f-]{36}$/.test(id) ? await getCustomer(id) : null;
  if (!customer) notFound();
  const [settings, statement] = await Promise.all([getSettings(), customerStatement(id)]);
  const balance = statement.at(-1)?.balance ?? 0;

  return (
    <>
      <style>{`@page { size: A4; margin: 14mm; } @media print { .no-print { display: none !important; } body { background: #fff !important; } }`}</style>
      <div className="no-print flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2">
        <PrintButton autoFocus />
        <span className="text-sm text-gray-600">
          A4 statement. Choose &quot;Save as PDF&quot; to send it digitally.
        </span>
      </div>
      <div className="mx-auto max-w-3xl bg-white p-8 text-sm text-black">
        <div className="flex justify-between border-b border-black pb-3">
          <div>
            <p className="text-xl font-bold">{settings.shopName}</p>
            {settings.shopAddress ? <p>{settings.shopAddress}</p> : null}
            {settings.shopPhone ? <p>Ph: {settings.shopPhone}</p> : null}
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold">Udhaar statement</p>
            <p>{formatDate(new Date())}</p>
          </div>
        </div>
        <div className="my-4">
          <p className="font-semibold">{customer.name}</p>
          {customer.phone ? <p>{customer.phone}</p> : null}
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="py-1.5">Date</th>
              <th className="py-1.5">Details</th>
              <th className="py-1.5 text-right">Udhaar</th>
              <th className="py-1.5 text-right">Paid back</th>
              <th className="py-1.5 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {statement.map((entry) => (
              <tr key={entry.id} className="border-b border-gray-300">
                <td className="py-1.5 whitespace-nowrap">{formatDateTime(entry.date)}</td>
                <td className="py-1.5">{entry.description}</td>
                <td className="py-1.5 text-right">{entry.charge ? formatRs(entry.charge) : ""}</td>
                <td className="py-1.5 text-right">
                  {entry.payment ? formatRs(entry.payment) : ""}
                </td>
                <td className="py-1.5 text-right">{formatRs(entry.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-right text-lg font-bold">
          Balance due: {balance < 0 ? `${formatRs(-balance)} advance` : formatRs(balance)}
        </p>
      </div>
    </>
  );
}
