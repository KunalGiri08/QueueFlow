// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { CreateQueueCard } from "./CreateQueueCard";

describe("components/admin/queues/CreateQueueCard", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe("Initial Rendering and Default Values", () => {
    it("renders form card with header, inputs, and accessible labels", () => {
      render(
        <CreateQueueCard
          serviceName="General Consultation"
          isCreating={false}
          formError={null}
          formSuccess={null}
          onCreateQueue={vi.fn()}
        />,
      );

      expect(screen.getByText("Add Queue to General Consultation")).toBeDefined();
      expect(
        screen.getByText(/Enter a unique queue name for this service/i),
      ).toBeDefined();

      const nameInput = screen.getByLabelText(/queue name/i) as HTMLInputElement;
      const waitingInput = screen.getByLabelText(/max waiting limit/i) as HTMLInputElement;
      const dailyInput = screen.getByLabelText(/max daily limit/i) as HTMLInputElement;
      const submitBtn = screen.getByRole("button", { name: /create queue/i }) as HTMLButtonElement;

      expect(nameInput.value).toBe("");
      expect(waitingInput.value).toBe("");
      expect(dailyInput.value).toBe("");
      expect(submitBtn.disabled).toBe(true); // Empty name keeps submit disabled
    });
  });

  describe("Inputs, Validation, and Payload Generation", () => {
    it("updates form inputs and enables submit button when name is entered", () => {
      render(
        <CreateQueueCard
          serviceName="General Consultation"
          isCreating={false}
          formError={null}
          formSuccess={null}
          onCreateQueue={vi.fn()}
        />,
      );

      const nameInput = screen.getByLabelText(/queue name/i) as HTMLInputElement;
      const submitBtn = screen.getByRole("button", { name: /create queue/i }) as HTMLButtonElement;

      fireEvent.change(nameInput, { target: { value: "Priority Line" } });
      expect(nameInput.value).toBe("Priority Line");
      expect(submitBtn.disabled).toBe(false);
    });

    it("submits valid trimmed name and omits empty capacity fields (unlimited)", async () => {
      const onCreateQueue = vi.fn().mockResolvedValue(true);
      render(
        <CreateQueueCard
          serviceName="General Consultation"
          isCreating={false}
          formError={null}
          formSuccess={null}
          onCreateQueue={onCreateQueue}
        />,
      );

      const nameInput = screen.getByLabelText(/queue name/i);
      fireEvent.change(nameInput, { target: { value: "   Walk-in Line   " } });
      fireEvent.click(screen.getByRole("button", { name: /create queue/i }));

      expect(onCreateQueue).toHaveBeenCalledWith({
        name: "Walk-in Line",
      });
    });

    it("submits valid integer capacity limits when provided", async () => {
      const onCreateQueue = vi.fn().mockResolvedValue(true);
      render(
        <CreateQueueCard
          serviceName="General Consultation"
          isCreating={false}
          formError={null}
          formSuccess={null}
          onCreateQueue={onCreateQueue}
        />,
      );

      fireEvent.change(screen.getByLabelText(/queue name/i), {
        target: { value: "Express Desk" },
      });
      fireEvent.change(screen.getByLabelText(/max waiting limit/i), {
        target: { value: "20" },
      });
      fireEvent.change(screen.getByLabelText(/max daily limit/i), {
        target: { value: "150" },
      });
      fireEvent.click(screen.getByRole("button", { name: /create queue/i }));

      expect(onCreateQueue).toHaveBeenCalledWith({
        name: "Express Desk",
        maxWaitingTickets: 20,
        maxDailyTickets: 150,
      });
    });

    it("resets form inputs when onCreateQueue succeeds", async () => {
      const onCreateQueue = vi.fn().mockResolvedValue(true);
      render(
        <CreateQueueCard
          serviceName="General Consultation"
          isCreating={false}
          formError={null}
          formSuccess={null}
          onCreateQueue={onCreateQueue}
        />,
      );

      const nameInput = screen.getByLabelText(/queue name/i) as HTMLInputElement;
      const waitingInput = screen.getByLabelText(/max waiting limit/i) as HTMLInputElement;
      const dailyInput = screen.getByLabelText(/max daily limit/i) as HTMLInputElement;

      fireEvent.change(nameInput, { target: { value: "Express Desk" } });
      fireEvent.change(waitingInput, { target: { value: "20" } });
      fireEvent.change(dailyInput, { target: { value: "150" } });
      fireEvent.click(screen.getByRole("button", { name: /create queue/i }));

      expect(onCreateQueue).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(nameInput.value).toBe("");
        expect(waitingInput.value).toBe("");
        expect(dailyInput.value).toBe("");
      });
    });

    it("keeps form inputs when onCreateQueue returns false (failure)", async () => {
      const onCreateQueue = vi.fn().mockResolvedValue(false);
      render(
        <CreateQueueCard
          serviceName="General Consultation"
          isCreating={false}
          formError={null}
          formSuccess={null}
          onCreateQueue={onCreateQueue}
        />,
      );

      const nameInput = screen.getByLabelText(/queue name/i) as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: "Failed Queue" } });
      fireEvent.click(screen.getByRole("button", { name: /create queue/i }));

      expect(onCreateQueue).toHaveBeenCalledTimes(1);
      expect(nameInput.value).toBe("Failed Queue");
    });
  });

  describe("Validation Rules and Boundary Checks", () => {
    it("displays error when name is whitespace only", () => {
      const onCreateQueue = vi.fn();
      render(
        <CreateQueueCard
          serviceName="General Consultation"
          isCreating={false}
          formError={null}
          formSuccess={null}
          onCreateQueue={onCreateQueue}
        />,
      );

      const nameInput = screen.getByLabelText(/queue name/i);
      fireEvent.change(nameInput, { target: { value: "   " } });
      fireEvent.submit(nameInput.closest("form")!);

      expect(onCreateQueue).not.toHaveBeenCalled();
      expect(screen.getByRole("alert").textContent).toContain("Queue name is required.");
    });

    it("validates boundary: rejects maxWaitingTickets < 1 and > 10,000", () => {
      const onCreateQueue = vi.fn();
      render(
        <CreateQueueCard
          serviceName="General Consultation"
          isCreating={false}
          formError={null}
          formSuccess={null}
          onCreateQueue={onCreateQueue}
        />,
      );

      fireEvent.change(screen.getByLabelText(/queue name/i), {
        target: { value: "Test Queue" },
      });
      const waitingInput = screen.getByLabelText(/max waiting limit/i);

      // Value < 1
      fireEvent.change(waitingInput, { target: { value: "0" } });
      fireEvent.click(screen.getByRole("button", { name: /create queue/i }));
      expect(onCreateQueue).not.toHaveBeenCalled();
      expect(screen.getByRole("alert").textContent).toContain(
        "Max waiting tickets must be an integer between 1 and 10,000.",
      );

      // Value > 10000
      fireEvent.change(waitingInput, { target: { value: "10001" } });
      fireEvent.click(screen.getByRole("button", { name: /create queue/i }));
      expect(onCreateQueue).not.toHaveBeenCalled();
      expect(screen.getByRole("alert").textContent).toContain(
        "Max waiting tickets must be an integer between 1 and 10,000.",
      );
    });

    it("validates boundary: rejects maxDailyTickets < 1 and > 100,000", () => {
      const onCreateQueue = vi.fn();
      render(
        <CreateQueueCard
          serviceName="General Consultation"
          isCreating={false}
          formError={null}
          formSuccess={null}
          onCreateQueue={onCreateQueue}
        />,
      );

      fireEvent.change(screen.getByLabelText(/queue name/i), {
        target: { value: "Test Queue" },
      });
      const dailyInput = screen.getByLabelText(/max daily limit/i);

      // Value < 1
      fireEvent.change(dailyInput, { target: { value: "-1" } });
      fireEvent.click(screen.getByRole("button", { name: /create queue/i }));
      expect(onCreateQueue).not.toHaveBeenCalled();
      expect(screen.getByRole("alert").textContent).toContain(
        "Max daily tickets must be an integer between 1 and 100,000.",
      );

      // Value > 100000
      fireEvent.change(dailyInput, { target: { value: "100001" } });
      fireEvent.click(screen.getByRole("button", { name: /create queue/i }));
      expect(onCreateQueue).not.toHaveBeenCalled();
      expect(screen.getByRole("alert").textContent).toContain(
        "Max daily tickets must be an integer between 1 and 100,000.",
      );
    });

    it("accepts valid boundary values: waiting 1 & 10000, daily 1 & 100000", async () => {
      const onCreateQueue = vi.fn().mockResolvedValue(true);
      render(
        <CreateQueueCard
          serviceName="General Consultation"
          isCreating={false}
          formError={null}
          formSuccess={null}
          onCreateQueue={onCreateQueue}
        />,
      );

      fireEvent.change(screen.getByLabelText(/queue name/i), {
        target: { value: "Boundary Queue" },
      });
      fireEvent.change(screen.getByLabelText(/max waiting limit/i), {
        target: { value: "10000" },
      });
      fireEvent.change(screen.getByLabelText(/max daily limit/i), {
        target: { value: "100000" },
      });
      fireEvent.click(screen.getByRole("button", { name: /create queue/i }));

      expect(onCreateQueue).toHaveBeenCalledWith({
        name: "Boundary Queue",
        maxWaitingTickets: 10000,
        maxDailyTickets: 100000,
      });
    });
  });

  describe("Service Switching, Alerts, and Disabled States", () => {
    it("resets form inputs when serviceId prop changes", () => {
      const { rerender } = render(
        <CreateQueueCard
          serviceId="srv-1"
          serviceName="General Consultation"
          isCreating={false}
          formError={null}
          formSuccess={null}
          onCreateQueue={vi.fn()}
        />,
      );

      const nameInput = screen.getByLabelText(/queue name/i) as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: "Consultation Queue" } });
      expect(nameInput.value).toBe("Consultation Queue");

      // Switch to different service
      rerender(
        <CreateQueueCard
          serviceId="srv-2"
          serviceName="Pharmacy"
          isCreating={false}
          formError={null}
          formSuccess={null}
          onCreateQueue={vi.fn()}
        />,
      );

      expect(nameInput.value).toBe("");
      expect(screen.getByText("Add Queue to Pharmacy")).toBeDefined();
    });

    it("displays external formError and formSuccess alerts with accessibility roles", () => {
      const { rerender } = render(
        <CreateQueueCard
          serviceName="General Consultation"
          isCreating={false}
          formError="A queue with this name already exists in this service."
          formSuccess={null}
          onCreateQueue={vi.fn()}
        />,
      );

      const alert = screen.getByRole("alert");
      expect(alert.id).toBe("queue-form-error");
      expect(alert.textContent).toContain(
        "A queue with this name already exists in this service.",
      );

      rerender(
        <CreateQueueCard
          serviceName="General Consultation"
          isCreating={false}
          formError={null}
          formSuccess='Queue "General Walk-in" created successfully.'
          onCreateQueue={vi.fn()}
        />,
      );

      const status = screen.getByRole("status");
      expect(status.id).toBe("queue-form-success");
      expect(status.textContent).toContain(
        'Queue "General Walk-in" created successfully.',
      );
    });

    it("disables inputs, buttons, and displays spinner while isCreating is true", () => {
      render(
        <CreateQueueCard
          serviceName="General Consultation"
          isCreating={true}
          formError={null}
          formSuccess={null}
          onCreateQueue={vi.fn()}
        />,
      );

      const nameInput = screen.getByLabelText(/queue name/i) as HTMLInputElement;
      const waitingInput = screen.getByLabelText(/max waiting limit/i) as HTMLInputElement;
      const dailyInput = screen.getByLabelText(/max daily limit/i) as HTMLInputElement;
      const submitBtn = screen.getByRole("button", { name: /creating\.\.\./i }) as HTMLButtonElement;

      expect(nameInput.disabled).toBe(true);
      expect(waitingInput.disabled).toBe(true);
      expect(dailyInput.disabled).toBe(true);
      expect(submitBtn.disabled).toBe(true);
      expect(screen.getByText(/creating\.\.\./i)).toBeDefined();
    });

    it("clears error and success callbacks when user types in inputs", () => {
      const onClearError = vi.fn();
      const onClearSuccess = vi.fn();
      render(
        <CreateQueueCard
          serviceName="General Consultation"
          isCreating={false}
          formError="Some error"
          formSuccess="Some success"
          onCreateQueue={vi.fn()}
          onClearError={onClearError}
          onClearSuccess={onClearSuccess}
        />,
      );

      const nameInput = screen.getByLabelText(/queue name/i);
      fireEvent.change(nameInput, { target: { value: "New Value" } });

      expect(onClearError).toHaveBeenCalledTimes(1);
      expect(onClearSuccess).toHaveBeenCalledTimes(1);
    });
  });
});

