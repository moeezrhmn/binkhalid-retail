"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plus, UserCheck, UserX } from "lucide-react";
import {
  createStaffAction,
  resetPasswordAction,
  setStaffActiveAction,
} from "@/app/(app)/(admin)/settings/actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/format";

type User = {
  id: string;
  name: string;
  username: string;
  type: "ADMIN" | "STAFF";
  isActive: boolean;
  createdAt: Date;
};

export function StaffManager({ users, currentUserId }: { users: User[]; currentUserId: string }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<User | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (user: User) => {
    if (
      user.isActive &&
      !confirm(`Deactivate ${user.name}? They are logged out at once and cannot log in.`)
    )
      return;
    startTransition(async () => {
      const result = await setStaffActiveAction(user.id, !user.isActive);
      setMessage(
        result.ok
          ? {
              tone: "success",
              text: `${user.name} is now ${user.isActive ? "inactive" : "active"}.`,
            }
          : { tone: "error", text: result.error },
      );
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500">
          Staff log in with their own username and can only use POS / Billing. Each sale records who
          made it.
        </p>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden /> New staff account
        </Button>
      </div>
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Username</TH>
              <TH>Role</TH>
              <TH>Status</TH>
              <TH>Created</TH>
              <TH className="text-right">
                <span className="sr-only">Actions</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {users.map((user) => (
              <TR key={user.id}>
                <TD className="font-medium">
                  {user.name}
                  {user.id === currentUserId ? <span className="text-gray-400"> (you)</span> : null}
                </TD>
                <TD className="font-mono text-xs">{user.username}</TD>
                <TD>
                  {user.type === "ADMIN" ? (
                    <Badge tone="gold">Admin</Badge>
                  ) : (
                    <Badge tone="blue">Staff</Badge>
                  )}
                </TD>
                <TD>
                  {user.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
                </TD>
                <TD className="text-gray-600">{formatDate(user.createdAt)}</TD>
                <TD className="text-right whitespace-nowrap">
                  <Button variant="ghost" size="sm" onClick={() => setResetting(user)}>
                    <KeyRound className="size-4" aria-hidden /> Reset password
                  </Button>
                  {user.type === "STAFF" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggle(user)}
                      disabled={pending}
                    >
                      {user.isActive ? (
                        <>
                          <UserX className="size-4" aria-hidden /> Deactivate
                        </>
                      ) : (
                        <>
                          <UserCheck className="size-4" aria-hidden /> Activate
                        </>
                      )}
                    </Button>
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <CreateStaffDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(name) => {
          setCreating(false);
          setMessage({ tone: "success", text: `${name} can now log in.` });
          router.refresh();
        }}
      />
      <ResetPasswordDialog
        user={resetting}
        onClose={() => setResetting(null)}
        onDone={(name) => {
          setResetting(null);
          setMessage({ tone: "success", text: `Password changed for ${name}.` });
        }}
      />
    </div>
  );
}

function CreateStaffDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const [form, setForm] = useState({ name: "", username: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await createStaffAction(form);
      if (!result.ok) return setError(result.error);
      onCreated(form.name);
      setForm({ name: "", username: "", password: "" });
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New staff account"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? "Creating…" : "Create account"}
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field
          label="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          autoFocus
        />
        <Field
          label="Username"
          hint="Lowercase, e.g. ahmed"
          autoCapitalize="none"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
        />
        <Field
          label="Password"
          hint="At least 6 characters. Tell it to the staff member privately."
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        {error ? <Alert tone="error">{error}</Alert> : null}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

function ResetPasswordDialog({
  user,
  onClose,
  onDone,
}: {
  user: User | null;
  onClose: () => void;
  onDone: (name: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    if (!user) return;
    setError(null);
    startTransition(async () => {
      const result = await resetPasswordAction(user.id, password);
      if (!result.ok) return setError(result.error);
      setPassword("");
      onDone(user.name);
    });
  };

  return (
    <Dialog
      open={user !== null}
      onClose={() => {
        setPassword("");
        setError(null);
        onClose();
      }}
      title={`Reset password: ${user?.name ?? ""}`}
      footer={
        <Button onClick={save} disabled={pending || password.length === 0}>
          {pending ? "Saving…" : "Set password"}
        </Button>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field
          label="New password"
          hint="At least 6 characters"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {error ? <Alert tone="error">{error}</Alert> : null}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
