import { LoadingState } from "@highcastle/ui";

/** Streaming skeleton — no fake numbers while the API responds. */
export default function Loading() {
  return <LoadingState label="Loading findings" lines={4} />;
}
