import { notFound } from "next/navigation";
import { CreateGroupStewardForm } from "@/components/forms/CreateGroupStewardForm";
import { requireAuthContext } from "@/lib/session";

export default async function NewGroupStewardPage() {
  const authContext = await requireAuthContext();
  if (!authContext.isSystemAdmin) notFound();

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-6 py-8">
      <h1 className="text-2xl font-semibold">Create a group steward</h1>
      <CreateGroupStewardForm />
    </main>
  );
}
