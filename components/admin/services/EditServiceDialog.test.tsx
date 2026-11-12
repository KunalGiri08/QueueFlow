// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { EditServiceDialog } from "./EditServiceDialog";
import type { ServiceItem } from "./types";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const mockService: ServiceItem = {
  id: "srv-1",
  name: "Cardiology Consultation",
  description: "Specialized cardiac assessments",
  organizationId: "org-1",
  isActive: true,
  createdAt: "2026-03-01T10:00:00.000Z",
  updatedAt: "2026-03-01T10:00:00.000Z",
  admissionCutoffMinutes: 60,
  durationMinutes: 45,
  bufferMinutes: 15,
};

describe("components/admin/services/EditServiceDialog", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mockPush.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders nothing when isOpen is false or service is null", () => {
    const { rerender } = render(
      <EditServiceDialog
        service={mockService}
        organizationId="org-1"
        isOpen={false}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    rerender(
      <EditServiceDialog
        service={null}
        organizationId="org-1"
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders dialog and pre-populates fields with service attributes", () => {
    render(
      <EditServiceDialog
        service={mockService}
        organizationId="org-1"
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Edit Service" })).toBeDefined();

    const nameInput = screen.getByLabelText(/service name/i) as HTMLInputElement;
    const descInput = screen.getByLabelText(/description/i) as HTMLInputElement;
    const cutoffInput = screen.getByLabelText(/admission cutoff/i) as HTMLInputElement;
    const durationInput = screen.getByLabelText(/appointment duration/i) as HTMLInputElement;
    const bufferInput = screen.getByLabelText(/buffer time/i) as HTMLInputElement;

    expect(nameInput.value).toBe("Cardiology Consultation");
    expect(descInput.value).toBe("Specialized cardiac assessments");
    expect(cutoffInput.value).toBe("60");
    expect(durationInput.value).toBe("45");
    expect(bufferInput.value).toBe("15");
  });

  it("pre-populates duration with 30 and buffer with 0 when service does not specify them", () => {
    const serviceWithoutDurationBuffer: ServiceItem = {
      ...mockService,
      durationMinutes: null,
      bufferMinutes: null,
    };
    render(
      <EditServiceDialog
        service={serviceWithoutDurationBuffer}
        organizationId="org-1"
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    const durationInput = screen.getByLabelText(/appointment duration/i) as HTMLInputElement;
    const bufferInput = screen.getByLabelText(/buffer time/i) as HTMLInputElement;
    expect(durationInput.value).toBe("30");
    expect(bufferInput.value).toBe("0");
  });

  it("calls onClose when cancel button, close button, or Escape key is triggered", () => {
    const onClose = vi.fn();
    render(
      <EditServiceDialog
        service={mockService}
        organizationId="org-1"
        isOpen={true}
        onClose={onClose}
        onSuccess={vi.fn()}
      />,
    );

    // Cancel button
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    // Close button
    fireEvent.click(
      screen.getByRole("button", { name: /close edit service dialog/i }),
    );
    expect(onClose).toHaveBeenCalledTimes(2);

    // Escape key
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("validates client-side constraints on empty name and invalid cutoff", () => {
    render(
      <EditServiceDialog
        service={mockService}
        organizationId="org-1"
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    const nameInput = screen.getByLabelText(/service name/i);
    const cutoffInput = screen.getByLabelText(/admission cutoff/i);
    const form = screen.getByRole("dialog").querySelector("form") as HTMLFormElement;

    // Blank name
    fireEvent.change(nameInput, { target: { value: "   " } });
    fireEvent.submit(form);
    expect(screen.getByText("Service name is required.")).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();

    // Reset name, set negative cutoff
    fireEvent.change(nameInput, { target: { value: "Valid Name" } });
    fireEvent.change(cutoffInput, { target: { value: "-5" } });
    fireEvent.submit(form);
    expect(
      screen.getByText("Admission cutoff minutes cannot be negative."),
    ).toBeDefined();

    // Set cutoff exceeding 480
    fireEvent.change(cutoffInput, { target: { value: "500" } });
    fireEvent.submit(form);
    expect(
      screen.getByText("Admission cutoff minutes cannot exceed 480 (8 hours)."),
    ).toBeDefined();

    // Set non-integer cutoff
    fireEvent.change(cutoffInput, { target: { value: "12.3" } });
    fireEvent.submit(form);
    expect(
      screen.getByText("Admission cutoff minutes must be an integer."),
    ).toBeDefined();
  });

  it("validates client-side constraints on duration and buffer minutes", () => {
    render(
      <EditServiceDialog
        service={mockService}
        organizationId="org-1"
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    const durationInput = screen.getByLabelText(/appointment duration/i);
    const bufferInput = screen.getByLabelText(/buffer time/i);
    const form = screen.getByRole("dialog").querySelector("form") as HTMLFormElement;

    // Non-integer duration
    fireEvent.change(durationInput, { target: { value: "30.5" } });
    fireEvent.submit(form);
    expect(screen.getByText("Duration minutes must be an integer.")).toBeDefined();

    // Duration < 5
    fireEvent.change(durationInput, { target: { value: "4" } });
    fireEvent.submit(form);
    expect(screen.getByText("Duration must be at least 5 minutes.")).toBeDefined();

    // Duration > 480
    fireEvent.change(durationInput, { target: { value: "481" } });
    fireEvent.submit(form);
    expect(screen.getByText("Duration cannot exceed 480 minutes (8 hours).")).toBeDefined();

    // Reset duration to valid, test non-integer buffer
    fireEvent.change(durationInput, { target: { value: "30" } });
    fireEvent.change(bufferInput, { target: { value: "10.2" } });
    fireEvent.submit(form);
    expect(screen.getByText("Buffer minutes must be an integer.")).toBeDefined();

    // Negative buffer
    fireEvent.change(bufferInput, { target: { value: "-1" } });
    fireEvent.submit(form);
    expect(screen.getByText("Buffer minutes cannot be negative.")).toBeDefined();

    // Buffer > 240
    fireEvent.change(bufferInput, { target: { value: "241" } });
    fireEvent.submit(form);
    expect(screen.getByText("Buffer cannot exceed 240 minutes (4 hours).")).toBeDefined();
  });

  it("submits PATCH request and triggers onSuccess callback with updated service", async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    let patchPayload: unknown;
    fetchMock.mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      patchPayload = JSON.parse(init?.body as string);
      return jsonResponse({
        id: "srv-1",
        name: "General Cardiology",
        description: "Routine heart screenings",
        organizationId: "org-1",
        isActive: true,
        createdAt: "2026-03-01T10:00:00.000Z",
        updatedAt: "2026-03-01T14:00:00.000Z",
        admissionCutoffMinutes: 45,
        durationMinutes: 60,
        bufferMinutes: 10,
      });
    });

    render(
      <EditServiceDialog
        service={mockService}
        organizationId="org-1"
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    const nameInput = screen.getByLabelText(/service name/i);
    const descInput = screen.getByLabelText(/description/i);
    const cutoffInput = screen.getByLabelText(/admission cutoff/i);
    const durationInput = screen.getByLabelText(/appointment duration/i);
    const bufferInput = screen.getByLabelText(/buffer time/i);
    const saveBtn = screen.getByRole("button", { name: /save changes/i });

    fireEvent.change(nameInput, { target: { value: "General Cardiology" } });
    fireEvent.change(descInput, { target: { value: "Routine heart screenings" } });
    fireEvent.change(cutoffInput, { target: { value: "45" } });
    fireEvent.change(durationInput, { target: { value: "60" } });
    fireEvent.change(bufferInput, { target: { value: "10" } });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "srv-1",
          name: "General Cardiology",
          description: "Routine heart screenings",
          admissionCutoffMinutes: 45,
          durationMinutes: 60,
          bufferMinutes: 10,
        }),
      );
    });

    expect(patchPayload).toEqual({
      name: "General Cardiology",
      description: "Routine heart screenings",
      admissionCutoffMinutes: 45,
      durationMinutes: 60,
      bufferMinutes: 10,
    });
  });

  it("sends admissionCutoffMinutes as null when cutoff field is cleared", async () => {
    const onSuccess = vi.fn();

    let patchPayload: unknown;
    fetchMock.mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      patchPayload = JSON.parse(init?.body as string);
      return jsonResponse({
        ...mockService,
        admissionCutoffMinutes: null,
      });
    });

    render(
      <EditServiceDialog
        service={mockService}
        organizationId="org-1"
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={onSuccess}
      />,
    );

    const cutoffInput = screen.getByLabelText(/admission cutoff/i);
    fireEvent.change(cutoffInput, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
    });

    expect(patchPayload).toEqual(
      expect.objectContaining({
        admissionCutoffMinutes: null,
      }),
    );
  });

  it("displays server error message on 400 validation failure", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: "Invalid request body",
          details: {
            fieldErrors: {
              admissionCutoffMinutes: [
                "Admission cutoff minutes cannot exceed 480 (8 hours)",
              ],
            },
          },
        },
        400,
      ),
    );

    render(
      <EditServiceDialog
        service={mockService}
        organizationId="org-1"
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(
      await screen.findByText(
        "Admission cutoff minutes cannot exceed 480 (8 hours)",
      ),
    ).toBeDefined();
  });

  it("displays server error message on 400 duration or buffer validation failure", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: "Invalid request body",
          details: {
            fieldErrors: {
              durationMinutes: ["Duration must be at least 5 minutes."],
            },
          },
        },
        400,
      ),
    );

    render(
      <EditServiceDialog
        service={mockService}
        organizationId="org-1"
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(
      await screen.findByText("Duration must be at least 5 minutes."),
    ).toBeDefined();
  });

  it("displays conflict error on 409 status code", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: "A service with this name already exists in this organization.",
        },
        409,
      ),
    );

    render(
      <EditServiceDialog
        service={mockService}
        organizationId="org-1"
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(
      await screen.findByText(
        "A service with this name already exists in this organization.",
      ),
    ).toBeDefined();
  });

  it("displays network error message on fetch failure", async () => {
    fetchMock.mockRejectedValue(new Error("Connection refused"));

    render(
      <EditServiceDialog
        service={mockService}
        organizationId="org-1"
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(
      await screen.findByText(
        "Failed to update service due to a network error. Please try again.",
      ),
    ).toBeDefined();
  });

  it("shows saving spinner and disables controls while save is in-flight", async () => {
    const deferred = createDeferred<Response>();
    fetchMock.mockImplementation(() => deferred.promise);

    render(
      <EditServiceDialog
        service={mockService}
        organizationId="org-1"
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    const saveBtn = screen.getByRole("button", { name: /save changes/i });
    const cancelBtn = screen.getByRole("button", { name: /cancel/i });

    fireEvent.click(saveBtn);

    expect(screen.getByText("Saving...")).toBeDefined();
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
    expect((cancelBtn as HTMLButtonElement).disabled).toBe(true);

    deferred.resolve(
      jsonResponse({
        ...mockService,
        name: "Updated",
      }),
    );
  });
});

