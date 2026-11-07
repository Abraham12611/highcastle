/**
 * @highcastle/ui — Nocturne Signal design system.
 *
 * Styles are shipped as plain CSS (no Tailwind build step required):
 *   import "@highcastle/ui/styles.css";
 *
 * Tailwind v4 consumers can additionally import
 * "@highcastle/ui/theme.css" for hc-* utilities — see README.md.
 */

export { cx } from "./cx.js";
export {
  HC_COLORS,
  type HcColorName,
  type Tone,
  type Severity,
  type Confidence,
  type RemediationStatus,
  type OracleVerdict,
  type ReplayVerdict,
  type AssertionOutcome,
  type ScanStatus,
  type ScanPhase,
  type ActorType,
  type AttemptStatus,
  type EvidenceKind,
} from "./tokens.js";
export { FOCUSABLE_SELECTOR, nextTrapIndex, rovingIndex } from "./focus.js";
export { Icon, ICON_NAMES, type IconName, type IconProps } from "./icons.js";

export {
  FortressMark,
  FortressLogo,
  FORTRESS_GRID,
  FORTRESS_GRID_SIZE,
  fortressPathD,
  type FortressMarkProps,
  type FortressLogoProps,
} from "./components/logo.js";

export {
  Button,
  IconButton,
  ButtonRow,
  type ButtonProps,
  type IconButtonProps,
} from "./components/button.js";
export {
  StatusPill,
  SeverityBadge,
  SeverityMeter,
  ConfidenceBadge,
  RemediationBadge,
  VerdictBadge,
  ScanStatusBadge,
  PhaseBadge,
  ActorBadge,
  AttemptStatusBadge,
  AssertionChip,
  type StatusPillProps,
} from "./components/badge.js";
export { Panel, PanelHeader, PanelBody, PanelFooter, type PanelProps } from "./components/panel.js";
export { Callout, type CalloutTone } from "./components/callout.js";
export {
  Field,
  TextInput,
  TextArea,
  Select,
  Checkbox,
  type FieldProps,
  type TextInputProps,
  type TextAreaProps,
  type SelectProps,
  type CheckboxProps,
} from "./components/form.js";
export {
  TopBar,
  NavRail,
  type TopBarProps,
  type NavRailProps,
  type NavItemData,
  type NavSectionData,
} from "./components/nav.js";
export { Tabs, type TabItem } from "./components/tabs.js";
export { Stepper, type StepperStep } from "./components/stepper.js";
export {
  Timeline,
  TimelineLiveIndicator,
  type TimelineEvent,
  type TimelineItemStatus,
} from "./components/timeline.js";
export { EvidenceCard, type EvidenceCardProps } from "./components/evidence-card.js";
export { CodeBlock } from "./components/code-block.js";
export { CopyButton } from "./components/copy-button.js";
export {
  EmptyState,
  ErrorState,
  LoadingState,
  InconclusiveState,
  BlockedState,
  Skeleton,
  Spinner,
} from "./components/states.js";
export { Modal, Drawer, ConfirmModal, type ModalProps } from "./components/modal.js";
export { ScopePanel, type ScopeEntry } from "./components/scope-panel.js";
export { SnapshotPill } from "./components/snapshot-pill.js";
export {
  ReplayDiff,
  type ReplaySide,
  type AssertionRow,
  type AssertionResult,
} from "./components/replay-diff.js";
export { StatusHeader } from "./components/status-header.js";
export { ContainmentLedger, type LedgerEntry, type LedgerRowStatus } from "./components/ledger.js";
export {
  ContainmentDiagram,
  ProofChainDiagram,
  WatchtowerArt,
  PerimeterArt,
} from "./components/diagrams.js";
