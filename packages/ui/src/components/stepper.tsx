import { cx } from "../cx.js";
import { Icon } from "../icons.js";

export interface StepperStep {
  key: string;
  label: string;
}

/**
 * Horizontal stepper for wizards (e.g. new assessment flow). Steps
 * before `current` render as done; the current step gets
 * aria-current="step". Presentational — place actions inside each
 * step's panel, not on the markers.
 */
export function Stepper({
  steps,
  current,
  className,
}: {
  steps: StepperStep[];
  /** Index of the active step (0-based). */
  current: number;
  className?: string;
}) {
  return (
    <ol className={cx("hc-stepper", className)}>
      {steps.map((step, i) => {
        const state = i < current ? "done" : i === current ? "current" : "todo";
        return (
          <li
            key={step.key}
            className={cx("hc-step", `hc-step--${state}`)}
            aria-current={state === "current" ? "step" : undefined}
          >
            <span className="hc-step-marker">
              {state === "done" ? <Icon name="check" size={13} /> : String(i + 1).padStart(2, "0")}
            </span>
            <span className="hc-step-label">{step.label}</span>
            {i < steps.length - 1 ? (
              <span
                className={cx("hc-step-connector", state === "done" && "hc-step-connector--done")}
                aria-hidden="true"
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
