import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ToolEditForm } from "../ToolEditForm";
import type { MetadataFile } from "@/lib/metadataApi";
import * as metadataApi from "@/lib/metadataApi";

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

const baseSchema = {
  type: "object" as const,
  properties: {
    city: { type: "string", description: "A city name" },
    units: { type: "string", enum: ["C", "F"] },
  },
  required: ["city"],
};

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
        toolName="get_weather"
        initialDescription="Get the weather"
        toolInputSchema={baseSchema}
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
        toolName="get_weather"
        initialDescription="Get the weather"
        toolInputSchema={baseSchema}
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
        toolName="get_weather"
        initialDescription="Get the weather"
        toolInputSchema={baseSchema}
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
        toolName="get_weather"
        initialDescription="Get the weather"
        toolInputSchema={baseSchema}
        currentMetadata={baseMetadata}
        metadataPath="/fake/metadata.json"
        onSaved={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    const cityField = screen.getByLabelText(/Parameter: city/i);
    // Clear the city field
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
    const paramless = {
      ...baseSchema,
      properties: {},
      required: [] as string[],
    };
    const metadata: MetadataFile = {
      version: 1,
      tools: { noop: { description: "A tool with no args" } },
    };
    render(
      <ToolEditForm
        toolName="noop"
        initialDescription="A tool with no args"
        toolInputSchema={paramless}
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
