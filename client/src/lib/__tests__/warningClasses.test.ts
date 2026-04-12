import { describe, it, expect } from "@jest/globals";
import { severityClasses, severityTextClasses } from "../warningClasses";

describe("severityClasses", () => {
  it("returns red-variant classes when hasError=true", () => {
    const classes = severityClasses(true);
    expect(classes).toContain("red");
    expect(classes).not.toContain("amber");
  });

  it("returns amber-variant classes when hasError=false", () => {
    const classes = severityClasses(false);
    expect(classes).toContain("amber");
    expect(classes).not.toContain("red");
  });
});

describe("severityTextClasses", () => {
  it("returns red text classes when hasError=true", () => {
    const classes = severityTextClasses(true);
    expect(classes).toContain("red");
    expect(classes).not.toContain("amber");
  });

  it("returns amber text classes when hasError=false", () => {
    const classes = severityTextClasses(false);
    expect(classes).toContain("amber");
    expect(classes).not.toContain("red");
  });
});
