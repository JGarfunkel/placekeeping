// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuickAddSpotDialog } from "./QuickAddSpotDialog";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

// No APIProvider in tests; geocodingLib stays null (the dialog falls back to
// manual entry after a timeout).
vi.mock("@vis.gl/react-google-maps", () => ({
  useMapsLibrary: () => null,
}));

vi.mock("@/components/forms/StewardAssociationPicker", () => ({
  StewardAssociationPicker: () => null,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("QuickAddSpotDialog", () => {
  it("closes the dialog after the spot is added successfully", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ spot: { spotId: 42 } }),
      }),
    );
    const onClose = vi.fn();

    render(<QuickAddSpotDialog latitude={1} longitude={2} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Test spot" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add spot" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/spots/42"));
    expect(onClose).toHaveBeenCalled();
  });
});
