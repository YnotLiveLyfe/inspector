import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "@jest/globals";
import { WarningBadge } from "../WarningBadge";
import type { Warning } from "@/lib/metadataWarnings";

function advisory(toolName = "t"): Warning {
  return {
    toolName,
    kind: "short-tool-description",
    severity: "advisory",
    message: "x",
  };
}

function error(toolName = "t"): Warning {
  return {
    toolName,
    kind: "missing-tool-description",
    severity: "error",
    message: "x",
  };
}

describe("WarningBadge", () => {
  it("renders nothing when the warnings list is empty", () => {
    const { container } = render(<WarningBadge warnings={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders ⚠ followed by the count when warnings exist", () => {
    render(<WarningBadge warnings={[advisory(), advisory()]} />);
    expect(screen.getByText(/⚠\s*2/)).toBeInTheDocument();
  });

  it("applies error styling class when any warning is severity=error", () => {
    render(<WarningBadge warnings={[advisory(), error()]} />);
    const badge = screen.getByText(/⚠\s*2/);
    // Tailwind red class — we assert at least one "red" style token is present
    expect(badge.className).toMatch(/red/);
  });
});
