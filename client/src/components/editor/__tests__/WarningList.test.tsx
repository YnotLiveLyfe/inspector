import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "@jest/globals";
import { WarningList } from "../WarningList";
import type { Warning } from "@/lib/metadataWarnings";

const missingTool: Warning = {
  toolName: "get_weather",
  kind: "missing-tool-description",
  severity: "error",
  message: "Tool has no description.",
};

const shortTool: Warning = {
  toolName: "get_weather",
  kind: "short-tool-description",
  severity: "advisory",
  message: "Too short.",
};

describe("WarningList", () => {
  it("renders null when the list is empty", () => {
    const { container } = render(<WarningList warnings={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders one list item per warning", () => {
    render(<WarningList warnings={[missingTool, shortTool]} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Tool has no description.")).toBeInTheDocument();
    expect(screen.getByText("Too short.")).toBeInTheDocument();
  });

  it("applies severity-based classes (red for error, amber for advisory)", () => {
    render(<WarningList warnings={[missingTool, shortTool]} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0].className).toMatch(/red/);
    expect(items[1].className).toMatch(/amber/);
  });
});
