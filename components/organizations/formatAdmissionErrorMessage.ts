import type { AdmissionErrorPayload } from "./types";

export function formatAdmissionErrorMessage(
  payload: unknown,
  status: number,
): {
  message: string;
  code?: string;
} {
  if (status === 409) {
    let msg = "You already have an active ticket in this queue.";
    if (
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof (payload as { error: unknown }).error === "string" &&
      (payload as { error: string }).error.trim() !== ""
    ) {
      msg = (payload as { error: string }).error.trim();
    }
    return {
      message: msg,
      code: "ACTIVE_TICKET_EXISTS",
    };
  }

  if (status === 404) {
    return {
      message:
        "This queue is no longer active or could not be found. Please refresh the page.",
      code: "QUEUE_NOT_FOUND",
    };
  }

  if (payload && typeof payload === "object") {
    const p = payload as AdmissionErrorPayload;
    const code = p.code || p.reason;
    const rawError = typeof p.error === "string" ? p.error.trim() : "";
    const rawMessage = typeof p.message === "string" ? p.message.trim() : "";

    if (code === "QUEUE_CAPACITY_REACHED") {
      return {
        message:
          "This queue has reached its maximum waiting capacity. Please try again later.",
        code: "QUEUE_CAPACITY_REACHED",
      };
    }

    if (code === "DAILY_TICKET_LIMIT_REACHED") {
      return {
        message:
          "This queue has reached its daily ticket limit for today. Please try again tomorrow.",
        code: "DAILY_TICKET_LIMIT_REACHED",
      };
    }

    if (code === "ADMISSION_CUTOFF_REACHED") {
      return {
        message:
          rawMessage ||
          rawError ||
          "Admission cutoff reached for this service. No more tickets are being admitted today.",
        code: "ADMISSION_CUTOFF_REACHED",
      };
    }

    if (
      code === "ORGANIZATION_CLOSED" ||
      code === "OUTSIDE_WORKING_HOURS" ||
      code === "NO_ACTIVE_SCHEDULE"
    ) {
      return {
        message:
          rawMessage ||
          rawError ||
          "This organization is currently closed.",
        code,
      };
    }

    if (code === "INVALID_SCHEDULE_CONFIGURATION") {
      return {
        message:
          rawMessage ||
          (rawError &&
          rawError !== "Organization schedule is temporarily misconfigured"
            ? rawError
            : "Organization schedule is temporarily misconfigured. Please try again later."),
        code: "INVALID_SCHEDULE_CONFIGURATION",
      };
    }

    if (rawMessage) {
      return { message: rawMessage, code };
    }

    if (rawError) {
      return { message: rawError, code };
    }
  }

  return {
    message: "Unable to join the queue at this time. Please try again.",
  };
}
