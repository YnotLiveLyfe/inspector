import "@testing-library/jest-dom";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { ToolEditForm } from "../ToolEditForm";
import type { MetadataFile } from "@/lib/metadataApi";
import * as metadataApi from "@/lib/metadataApi";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

jest.mock("@/lib/metadataApi", () => {
  const actual = jest.requireActual("@/lib/metadataApi");
  return {
    ...actual,
    saveMetadata: jest.fn(),
  };
});

const mockedSave = metadataApi.saveMetadata as jest.MockedFunction<
  typeof metadataApi.saveMetadata
>;

function makeTool(
  name: string,
  description: string,
  properties: Record<
    string,
    { description?: string; type?: string; enum?: string[] }
  > = {},
  required: string[] = [],
): Tool {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties: properties as Record<string, unknown>,
      required,
    },
  } as Tool;
}

const baseTool: Tool = makeTool(
  "get_weather",
  "Get the current weather and forecast for the given city with full detail.",
  {
    city: { type: "string", description: "A city name" },
    units: {
      type: "string",
      enum: ["C", "F"],
      description: "Temperature units to return (Celsius or Fahrenheit)",
    },
  },
  ["city"],
);

const baseMetadata: MetadataFile = {
  version: 1,
  tools: {
    get_weather: {
      description: "Get the weather",
      parameters: {
        city: { description: "Existing city description" },
      },
    },
  },
};

describe("ToolEditForm parameter rendering", () => {
  beforeEach(() => {
    mockedSave.mockReset();
    mockedSave.mockResolvedValue(undefined);
  });

  it("renders one textarea per parameter found in inputSchema", () => {
    render(
      <ToolEditForm
        tool={baseTool}
        currentMetadata={baseMetadata}
        metadataPath="/fake/metadata.json"
        onSaved={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByLabelText(/^Description$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Parameter: city/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Parameter: units/i)).toBeInTheDocument();
  });

  it("seeds param textareas from currentMetadata when present", () => {
    render(
      <ToolEditForm
        tool={baseTool}
        currentMetadata={baseMetadata}
        metadataPath="/fake/metadata.json"
        onSaved={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    const cityField = screen.getByLabelText(/Parameter: city/i);
    expect(cityField).toHaveValue("Existing city description");
    // No metadata for `units` → empty
    const unitsField = screen.getByLabelText(/Parameter: units/i);
    expect(unitsField).toHaveValue("");
  });

  it("includes param descriptions in the save payload", async () => {
    const onSaved = jest.fn();
    render(
      <ToolEditForm
        tool={baseTool}
        currentMetadata={baseMetadata}
        metadataPath="/fake/metadata.json"
        onSaved={onSaved}
        onCancel={jest.fn()}
      />,
    );

    const cityField = screen.getByLabelText(/Parameter: city/i);
    fireEvent.change(cityField, { target: { value: "Updated city desc" } });

    const unitsField = screen.getByLabelText(/Parameter: units/i);
    fireEvent.change(unitsField, { target: { value: "C or F" } });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(mockedSave).toHaveBeenCalledTimes(1);
    });

    const savedPayload = mockedSave.mock.calls[0][1];
    expect(savedPayload.tools.get_weather.parameters).toEqual({
      city: { description: "Updated city desc" },
      units: { description: "C or F" },
    });
    expect(onSaved).toHaveBeenCalled();
  });

  it("omits empty param descriptions from the save payload", async () => {
    render(
      <ToolEditForm
        tool={baseTool}
        currentMetadata={baseMetadata}
        metadataPath="/fake/metadata.json"
        onSaved={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    const cityField = screen.getByLabelText(/Parameter: city/i);
    // Clear the city field. The city has a non-empty override in baseMetadata,
    // so isBlockingInContext downgrades the missing-param warning to non-blocking.
    fireEvent.change(cityField, { target: { value: "" } });

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(mockedSave).toHaveBeenCalledTimes(1);
    });

    const savedPayload = mockedSave.mock.calls[0][1];
    // Empty description → parameter omitted; since units was ALSO empty,
    // the whole parameters block should be absent (keeps the JSON clean).
    expect(savedPayload.tools.get_weather.parameters).toBeUndefined();
  });

  it("still allows saving when the tool has no parameters at all", async () => {
    const paramlessTool = makeTool(
      "noop",
      "A tool that takes no arguments whatsoever and does nothing much.",
      {},
    );
    const metadata: MetadataFile = {
      version: 1,
      tools: { noop: { description: "A tool with no args" } },
    };
    render(
      <ToolEditForm
        tool={paramlessTool}
        currentMetadata={metadata}
        metadataPath="/fake/metadata.json"
        onSaved={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    // The form should not crash and no param textareas should appear.
    expect(screen.queryByLabelText(/Parameter:/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(mockedSave).toHaveBeenCalledTimes(1);
    });
    const savedPayload = mockedSave.mock.calls[0][1];
    expect(savedPayload.tools.noop.parameters).toBeUndefined();
  });
});

describe("ToolEditForm — Phase 2b warnings", () => {
  beforeEach(() => {
    mockedSave.mockReset();
    mockedSave.mockResolvedValue(undefined);
  });

  const metadataFile: MetadataFile = {
    version: 1,
    tools: {
      get_weather: {
        description:
          "Get current weather conditions for the given city with forecast.",
        parameters: {
          city: {
            description: "City name such as Minneapolis or Tokyo.",
          },
        },
      },
    },
  };

  it("Save is disabled when the tool description is empty (blocking)", () => {
    const tool = makeTool(
      "get_weather",
      "Get current weather and forecast for the given city with full details.",
      {
        city: { type: "string", description: "City name such as Minneapolis." },
      },
    );
    render(
      <ToolEditForm
        tool={tool}
        currentMetadata={metadataFile}
        metadataPath="/fake/metadata.json"
        onSaved={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    const descTextarea = screen.getByLabelText(/^Description$/i);
    fireEvent.change(descTextarea, { target: { value: "" } });
    const saveButton = screen.getByRole("button", { name: /save/i });
    expect(saveButton).toBeDisabled();
  });

  it("Save is disabled when a param has empty source doc and no saved override", () => {
    // 'region' has empty description, and metadataFile has NO override for region.
    const tool = makeTool(
      "get_weather",
      "Get current weather and forecast for the given city with full details.",
      {
        city: { type: "string", description: "City name such as Minneapolis." },
        region: { type: "string", description: "" },
      },
    );
    render(
      <ToolEditForm
        tool={tool}
        currentMetadata={metadataFile}
        metadataPath="/fake/metadata.json"
        onSaved={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    const saveButton = screen.getByRole("button", { name: /save/i });
    expect(saveButton).toBeDisabled();
    // Help text is rendered
    expect(
      screen.getByText(/Fix missing descriptions to save/i),
    ).toBeInTheDocument();
  });

  it("Save stays ENABLED when clearing an existing non-empty override (downgrade rule)", () => {
    // city has non-empty override in metadataFile → clearing should not block
    const tool = makeTool(
      "get_weather",
      "Get current weather and forecast for the given city with full details.",
      {
        city: { type: "string", description: "City name such as Minneapolis." },
      },
    );
    render(
      <ToolEditForm
        tool={tool}
        currentMetadata={metadataFile}
        metadataPath="/fake/metadata.json"
        onSaved={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    const cityField = screen.getByLabelText(/Parameter: city/i);
    fireEvent.change(cityField, { target: { value: "" } });
    const saveButton = screen.getByRole("button", { name: /save/i });
    expect(saveButton).not.toBeDisabled();
  });

  it("Warning list updates as the user types in the description field (live reactivity)", async () => {
    const tool = makeTool(
      "get_weather",
      "Get current weather and forecast for the given city with full details.",
      {
        city: { type: "string", description: "City name such as Minneapolis." },
      },
    );
    render(
      <ToolEditForm
        tool={tool}
        currentMetadata={metadataFile}
        metadataPath="/fake/metadata.json"
        onSaved={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    // Start clean: no "very short" text
    expect(screen.queryByText(/very short/i)).not.toBeInTheDocument();
    // Replace the description with a too-short value
    const descTextarea = screen.getByLabelText(/^Description$/i);
    act(() => {
      fireEvent.change(descTextarea, { target: { value: "short" } });
    });
    expect(screen.getByText(/very short/i)).toBeInTheDocument();
  });

  it("Renders the inline WarningList above Save/Cancel", () => {
    // Tool with empty description and a param with no source doc / no override
    const tool = makeTool("get_weather", "", {
      city: { type: "string", description: "" },
    });
    // Metadata with no get_weather entry at all → no overrides
    const blankMetadata: MetadataFile = {
      version: 1,
      tools: {},
    };
    render(
      <ToolEditForm
        tool={tool}
        currentMetadata={blankMetadata}
        metadataPath="/fake/metadata.json"
        onSaved={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    // Both the tool missing and the param missing warnings should render
    const warningTexts = screen
      .getAllByRole("listitem")
      .map((el) => el.textContent ?? "");
    expect(
      warningTexts.some((t) => t.includes("Tool has no description")),
    ).toBe(true);
    expect(
      warningTexts.some((t) =>
        t.includes("Parameter 'city' has no description"),
      ),
    ).toBe(true);
  });

  it("passes authToken through to saveMetadata when provided", async () => {
    render(
      <ToolEditForm
        tool={baseTool}
        authToken="test-token-xyz"
        currentMetadata={baseMetadata}
        metadataPath="/fake/metadata.json"
        onSaved={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(mockedSave).toHaveBeenCalledTimes(1);
    });

    const tokenArg = mockedSave.mock.calls[0][2];
    expect(tokenArg).toBe("test-token-xyz");
  });
});
