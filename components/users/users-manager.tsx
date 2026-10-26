"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserCheck, UserX } from "lucide-react";
import {
  createUserAction,
  deleteUserAction,
  resetPasswordAction,
  setUserActiveAction,
  updateUserAction,
} from "@/app/(app)/(admin)/settings/users/actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/roles";

type Role = "ADMIN" | "STAFF";

export type UserRow = {
  id: string;
  name: string;
  username: string;
  type: Role;
  isActive: boolean;
  createdAt: Date;
  createdByName: string | null;
  billCount: number;
  lastSale: Date | null;
  lastActiveAdmin: boolean;
  defaultAdmin: boolean;
  canDelete: boolean;
};

/** Compact row action: an icon with its name as the tooltip and accessible label. */
function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="px-2"
    >
      {children}
    </Button>
  );
}

const ROLE_HINT: Record<Role, string> = {
  ADMIN: "Everything, including users, reports, cost prices and settings",
  STAFF: "POS / Billing only",
};

function RoleSelect({
  value,
  onChange,
  disabled,
  hint,
}: {
  value: Role;
  onChange: (role: Role) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-gray-600">
        Role
      </label>
      <Select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as Role)}
      >
        <option value="STAFF">{ROLE_LABELS.STAFF}</option>
        <option value="ADMIN">{ROLE_LABELS.ADMIN}</option>
      </Select>
      <p className="text-xs text-gray-500">{hint ?? ROLE_HINT[value]}</p>
    </div>
  );
}

export function UsersManager({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startTransition(async () => {
      const result = await action();
      setMessage(
        result.ok
          ? { tone: "success", text: success }
          : { tone: "error", text: result.error ?? "Something went wrong" },
      );
      router.refresh();
    });

  const toggle = (user: UserRow) => {
    if (
      user.isActive &&
      !confirm(`Deactivate ${user.name}? They are logged out at once and cannot log in.`)
    )
      return;
    run(
      () => setUserActiveAction(user.id, !user.isActive),
      `${user.name} is now ${user.isActive ? "inactive" : "active"}.`,
    );
  };

  const remove = (user: UserRow) => {
    if (!confirm(`Delete ${user.name}'s account? This cannot be undone.`)) return;
    run(() => deleteUserAction(user.id), `${user.name}'s account was deleted.`);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-3xl text-sm text-gray-500">
          Admins can use everything and manage users. Staff can only use POS / Billing. Each bill
          records who served it. An account can be deleted only if it has no history; otherwise
          deactivate it. The default admin always remains.
        </p>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden /> New user
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
              <TH className="text-right">Bills served</TH>
              <TH>Last sale</TH>
              <TH>Created by</TH>
              <TH className="text-right">
                <span className="sr-only">Actions</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {users.map((user) => {
              const self = user.id === currentUserId;
              return (
                <TR key={user.id}>
                  <TD className="font-medium">
                    {user.name}
                    {self ? <span className="font-normal text-gray-400"> (you)</span> : null}
                    {user.defaultAdmin ? (
                      <span className="ml-2">
                        <Badge tone="gold">Default admin</Badge>
                      </span>
                    ) : null}
                    {user.lastActiveAdmin ? (
                      <span title="The only active admin cannot be deactivated, deleted or changed to staff">
                        <ShieldCheck
                          className="ml-1.5 inline size-4 text-gold-600"
                          aria-label="Only active admin"
                        />
                      </span>
                    ) : null}
                  </TD>
                  <TD className="font-mono text-xs">{user.username}</TD>
                  <TD>
                    <Badge tone={user.type === "ADMIN" ? "gold" : "blue"}>
                      {ROLE_LABELS[user.type]}
                    </Badge>
                  </TD>
                  <TD>
                    {user.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
                  </TD>
                  <TD className="text-right tabular-nums">{user.billCount}</TD>
                  <TD className="text-xs whitespace-nowrap text-gray-600">
                    {user.lastSale ? formatDateTime(user.lastSale) : "—"}
                  </TD>
                  <TD className="text-xs whitespace-nowrap text-gray-600">
                    {user.createdByName ?? "Setup"} · {formatDate(user.createdAt)}
                  </TD>
                  <TD className="text-right whitespace-nowrap">
                    {self || !user.defaultAdmin ? (
                      <>
                        <IconButton label={`Edit ${user.name}`} onClick={() => setEditing(user)}>
                          <Pencil className="size-4" />
                        </IconButton>
                        <IconButton
                          label={`Set a new password for ${user.name}`}
                          onClick={() => setResetting(user)}
                        >
                          <KeyRound className="size-4" />
                        </IconButton>
                      </>
                    ) : (
                      <span className="text-xs text-gray-400">Only they can change it</span>
                    )}
                    {!self && !user.defaultAdmin && !(user.isActive && user.lastActiveAdmin) ? (
                      <IconButton
                        label={user.isActive ? `Deactivate ${user.name}` : `Activate ${user.name}`}
                        onClick={() => toggle(user)}
                        disabled={pending}
                      >
                        {user.isActive ? (
                          <UserX className="size-4" />
                        ) : (
                          <UserCheck className="size-4 text-brand-700" />
                        )}
                      </IconButton>
                    ) : null}
                    {!self && !user.defaultAdmin && user.canDelete ? (
                      <IconButton
                        label={`Delete ${user.name}`}
                        onClick={() => remove(user)}
                        disabled={pending}
                      >
                        <Trash2 className="size-4 text-red-600" />
                      </IconButton>
                    ) : null}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>

      <CreateUserDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(name) => {
          setCreating(false);
          setMessage({ tone: "success", text: `${name} can now log in.` });
          router.refresh();
        }}
      />
      <EditUserDialog
        user={editing}
        self={editing?.id === currentUserId}
        onClose={() => setEditing(null)}
        onSaved={(name) => {
          setEditing(null);
          setMessage({ tone: "success", text: `Saved ${name}.` });
          router.refresh();
        }}
      />
      <ResetPasswordDialog
        user={resetting}
        onClose={() => setResetting(null)}
        onDone={(name) => {
          setResetting(null);
          setMessage({
            tone: "success",
            text: `Password changed for ${name}. They are logged out on every device.`,
          });
        }}
      />
    </div>
  );
}

function CreateUserDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const empty = { name: "", username: "", password: "", type: "STAFF" as Role };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await createUserAction(form);
      if (!result.ok) return setError(result.error);
      onCreated(form.name);
      setForm(empty);
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New user"
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
          hint="At least 6 characters. Tell it to the person privately."
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <RoleSelect value={form.type} onChange={(type) => setForm({ ...form, type })} />
        {error ? <Alert tone="error">{error}</Alert> : null}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

function EditUserDialog({
  user,
  self,
  onClose,
  onSaved,
}: {
  user: UserRow | null;
  self: boolean;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const [form, setForm] = useState({ name: "", username: "", type: "STAFF" as Role });
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (user && loadedFor !== user.id) {
    setLoadedFor(user.id);
    setForm({ name: user.name, username: user.username, type: user.type });
    setError(null);
  }

  const roleLocked = self || (user?.defaultAdmin ?? false) || (user?.lastActiveAdmin ?? false);
  const save = () => {
    if (!user) return;
    setError(null);
    startTransition(async () => {
      const result = await updateUserAction(user.id, form);
      if (!result.ok) return setError(result.error);
      setLoadedFor(null);
      onSaved(form.name);
    });
  };

  return (
    <Dialog
      open={user !== null}
      onClose={() => {
        setLoadedFor(null);
        onClose();
      }}
      title={`Edit ${user?.name ?? ""}`}
      footer={
        <Button onClick={save} disabled={pending || !form.name.trim() || !form.username.trim()}>
          {pending ? "Saving…" : "Save"}
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
          label="Name"
          hint="Shown on the POS and on receipts as who served the customer"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          autoFocus
        />
        <Field
          label="Username"
          hint="Used to log in. Lowercase, e.g. ahmed"
          autoCapitalize="none"
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
        />
        <RoleSelect
          value={form.type}
          onChange={(type) => setForm({ ...form, type })}
          disabled={roleLocked}
          hint={
            user?.defaultAdmin
              ? "The default admin always stays an admin."
              : self
                ? "You cannot change your own role. Ask another admin."
                : user?.lastActiveAdmin
                  ? "This is the only active admin. Make another admin first."
                  : form.type !== user?.type
                    ? "Changing the role logs this person out on every device."
                    : undefined
          }
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
  user: UserRow | null;
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
      title={`New password for ${user?.name ?? ""}`}
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
          hint="At least 6 characters. They will be logged out on every device."
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
