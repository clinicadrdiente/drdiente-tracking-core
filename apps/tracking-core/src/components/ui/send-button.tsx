import * as React from "react";
import "./send-button.css";

export type SendStatus = "idle" | "loading" | "success" | "error";

export interface SendButtonProps
  extends Omit<React.ComponentProps<"button">, "type"> {
  /** Controlled status. If omitted, the button manages a brief send animation on click. */
  status?: SendStatus;
  idleLabel?: string;
  loadingLabel?: string;
  successLabel?: string;
  errorLabel?: string;
  type?: "button" | "submit" | "reset";
}

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
    <path
      d="M5 12h14M13 6l6 6-6 6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
    <path
      d="M20 6 9 17l-5-5"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * SendButton — Auros-styled action button with a paper-plane send animation.
 * Drop-in for forms (`type="submit"`). Pass `status` to control it from the
 * parent (loading/success/error), or leave it uncontrolled for a self-contained
 * click animation.
 */
export function SendButton({
  status: controlled,
  idleLabel = "Enviar",
  loadingLabel = "Enviando…",
  successLabel = "Enviado",
  errorLabel = "Reintentar",
  type = "submit",
  className,
  disabled,
  onClick,
  ...rest
}: SendButtonProps) {
  const [internal, setInternal] = React.useState<SendStatus>("idle");
  const status = controlled ?? internal;

  const label =
    status === "loading"
      ? loadingLabel
      : status === "success"
        ? successLabel
        : status === "error"
          ? errorLabel
          : idleLabel;

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    onClick?.(event);
    // Uncontrolled: play a quick send → success animation for standalone use.
    if (controlled === undefined && !event.defaultPrevented) {
      setInternal("loading");
      window.setTimeout(() => setInternal("success"), 850);
      window.setTimeout(() => setInternal("idle"), 2100);
    }
  }

  return (
    <button
      type={type}
      data-status={status}
      disabled={disabled || status === "loading"}
      onClick={handleClick}
      className={["send-btn", className].filter(Boolean).join(" ")}
      {...rest}
    >
      <span className="send-btn__label">{label}</span>
      <span className="send-btn__icon" aria-hidden="true">
        <span className="send-btn__arrow">
          <ArrowIcon />
        </span>
        <span className="send-btn__spinner" />
        <span className="send-btn__check">
          <CheckIcon />
        </span>
      </span>
    </button>
  );
}

export default SendButton;
