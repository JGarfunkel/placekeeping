import { PinMatrix } from "@/components/dev/PinMatrix";

export default function DevPinsPage() {
  return (
    <main className="flex flex-col gap-4 overflow-x-auto p-6">
      <div>
        <h1 className="text-xl font-semibold">Pin matrix</h1>
        <p className="text-sm text-neutral-600">
          Every vegetation x purpose combination resolvePin() can produce, stewarded and open.
        </p>
      </div>
      <PinMatrix />
    </main>
  );
}
