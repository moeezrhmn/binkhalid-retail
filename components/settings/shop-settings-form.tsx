"use client";

import { useState, useTransition } from "react";
import { saveSettingsAction } from "@/app/(app)/(admin)/settings/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ShopSettings } from "@/lib/settings";

export function ShopSettingsForm({ initial }: { initial: ShopSettings }) {
  const [form, setForm] = useState(initial);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (change: Partial<ShopSettings>) => setForm((current) => ({ ...current, ...change }));
  const text = (key: keyof ShopSettings) => ({
    value: String(form[key]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set({ [key]: e.target.value }),
  });

  const save = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await saveSettingsAction(form);
      setMessage(
        result.ok
          ? { tone: "success", text: "Settings saved." }
          : { tone: "error", text: result.error },
      );
    });
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-semibold text-gray-900">Shop details</h2>
        <p className="-mt-2 text-sm text-gray-500">Printed at the top of receipts and on labels.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Shop name" required maxLength={60} {...text("shopName")} />
          <Field label="Phone" maxLength={40} {...text("shopPhone")} />
          <Field label="Address" maxLength={200} {...text("shopAddress")} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Receipt header"
            hint="Extra line under the shop name, e.g. NTN or a slogan"
            maxLength={200}
            {...text("receiptHeader")}
          />
          <Field
            label="Receipt footer"
            hint="e.g. Thank you! Exchange within 7 days with receipt."
            maxLength={200}
            {...text("receiptFooter")}
          />
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-semibold text-gray-900">Printing</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Label width (mm)" inputMode="numeric" {...text("labelWidthMm")} />
          <Field label="Label height (mm)" inputMode="numeric" {...text("labelHeightMm")} />
          <div className="space-y-1">
            <label htmlFor="receipt-width" className="block text-xs font-medium text-gray-600">
              Receipt paper width
            </label>
            <Select
              id="receipt-width"
              value={String(form.receiptWidthMm)}
              onChange={(e) => set({ receiptWidthMm: Number(e.target.value) })}
            >
              <option value="80">80 mm</option>
              <option value="58">58 mm</option>
            </Select>
          </div>
        </div>
      </Card>

      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
