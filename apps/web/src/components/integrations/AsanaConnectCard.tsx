"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Identity = {
  id: string;
  remoteWorkspaceName: string | null;
  remoteUserName: string | null;
  status: string;
};

export function AsanaConnectCard({
  identities,
  status,
}: {
  identities: Identity[];
  // The ?asana= result the OAuth callback redirected back with.
  status: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function disconnect() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/integrations/asana/identities", {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to disconnect Asana");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-neutral-200 p-4">
      <h2 className="text-lg font-medium">Asana</h2>
      {status === "connected" && (
        <p className="text-sm text-green-700">Asana connected.</p>
      )}
      {status === "error" && (
        <p className="text-sm text-red-600">
          Couldn&apos;t connect to Asana. Please try again.
        </p>
      )}
      {identities.length > 0 ? (
        <>
          <p className="text-sm text-neutral-600">
            Connected as {identities[0].remoteUserName ?? "your Asana user"} in:
          </p>
          <ul className="list-disc pl-5 text-sm">
            {identities.map((i) => (
              <li key={i.id}>
                {i.remoteWorkspaceName ?? "Workspace"}
                {i.status !== "active" && (
                  <span className="ml-1 text-xs text-amber-700">
                    (needs reconnecting)
                  </span>
                )}
              </li>
            ))}
          </ul>
          <div className="flex gap-3">
            <a
              href="/api/integrations/asana/connect"
              className="text-sm underline"
            >
              Reconnect
            </a>
            <button
              type="button"
              onClick={disconnect}
              disabled={pending}
              className="text-sm underline disabled:opacity-50"
            >
              {pending ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-neutral-600">
            Connect Asana to create and follow maintenance tasks from spots
            bound to an Asana project.
          </p>
          <div>
            <a
              href="/api/integrations/asana/connect"
              className="inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
            >
              Connect Asana
            </a>
          </div>
        </>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
