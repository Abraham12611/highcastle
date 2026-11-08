import { Icon, type IconName, type Tone } from "@highcastle/ui";

/**
 * How it works — five-step authorized pipeline:
 * scope → Vultr AI → isolated execution → independent verification → fix replay.
 * Stepped right-angle connectors, phase-colored markers.
 */

const STEPS: Array<{
  n: string;
  icon: IconName;
  tone: Tone;
  title: string;
  body: string;
}> = [
  {
    n: "01",
    icon: "lock",
    tone: "mint",
    title: "Authorized scope",
    body: "You record the exact host, test identities, request caps and expiry. Nothing executes outside it.",
  },
  {
    n: "02",
    icon: "chip",
    tone: "violet",
    title: "Vultr AI planning",
    body: "The model proposes a hypothesis from the source-aware threat map — untrusted input, never a command.",
  },
  {
    n: "03",
    icon: "terminal",
    tone: "cyan",
    title: "Isolated execution",
    body: "A disposable sandbox runs the policy-validated pack against the lab. No credentials, no egress.",
  },
  {
    n: "04",
    icon: "eye",
    tone: "success",
    title: "Independent oracle",
    body: "A deterministic verifier — not the model — decides reproduced, not reproduced, or inconclusive.",
  },
  {
    n: "05",
    icon: "shield-check",
    tone: "mint",
    title: "Fix replay",
    body: "Patch, re-run the same attack path, and prove the denial holds while legitimate access still works.",
  },
];

export function Workflow() {
  return (
    <section id="how-it-works" className="border-t border-hc-line">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <p className="hc-display text-xs text-hc-cyan">How it works</p>
        <h2 className="mt-3 text-2xl font-bold text-hc-text md:text-3xl">
          A test you can inspect, not a hunch you have to trust
        </h2>
        <ol className="mt-10 flex flex-col gap-8 md:flex-row md:gap-11">
          {STEPS.map((step) => (
            <li key={step.n} className="mkt-step-flow flex-1">
              <div className="flex items-center gap-3">
                <span
                  className="hc-mono inline-flex h-7 w-9 items-center justify-center rounded-[4px] border text-xs"
                  style={{
                    color: `var(--hc-${step.tone === "success" ? "success" : step.tone})`,
                    borderColor: `var(--hc-${step.tone === "success" ? "success" : step.tone}-deep)`,
                    background: `var(--hc-${step.tone === "success" ? "success" : step.tone}-wash)`,
                  }}
                >
                  {step.n}
                </span>
                <Icon name={step.icon} size={16} style={{ color: `var(--hc-${step.tone})` }} />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-hc-text">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-hc-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
