import { listUsersForAdmin } from "@placekeeping/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteUserButton } from "@/components/forms/DeleteUserButton";
import { UserLevelSelect } from "@/components/forms/UserLevelSelect";
import { requireAuthContext } from "@/lib/session";

export default async function AdminUsersPage() {
  const authContext = await requireAuthContext();
  if (!authContext.isSystemAdmin) notFound();

  const users = await listUsersForAdmin();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Users</h1>
        <Link href="/admin" className="text-sm underline">
          &larr; Admin
        </Link>
      </div>
      <ul className="flex flex-col divide-y divide-neutral-200 rounded-md border border-neutral-200">
        {users.map((u) => (
          <li
            key={u.userId}
            className="flex items-center justify-between gap-4 p-3"
          >
            <div className="flex min-w-0 flex-col">
              <Link
                href={`/user/${u.username}`}
                className="truncate font-medium underline"
              >
                {u.username}
                {u.isSystemAdmin ? " (admin)" : ""}
              </Link>
              <span className="truncate text-sm text-neutral-600">
                {u.name}
                {u.email ? ` · ${u.email}` : ""}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <UserLevelSelect userId={u.userId} initialLevel={u.level} />
              {!u.isSystemAdmin && u.userId !== authContext.userId && (
                <DeleteUserButton userId={u.userId} username={u.username} />
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
