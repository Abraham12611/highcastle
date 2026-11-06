export interface HealthPayload {
  status: "ok";
  service: string;
  timestamp: string;
}

export function healthPayload(service: string, now: Date = new Date()): HealthPayload {
  return {
    status: "ok",
    service,
    timestamp: now.toISOString(),
  };
}
