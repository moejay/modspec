import { describe, it, expect } from "vitest";
import { parseCliArgs } from "../src/cli.js";

describe("parseCliArgs", () => {
  it("returns specDir from first positional argument", () => {
    const result = parseCliArgs(["./specs"]);
    expect(result.specDir).toBe("./specs");
  });

  it("defaults to serve mode when no --output flag", () => {
    const result = parseCliArgs(["./specs"]);
    expect(result.mode).toBe("serve");
    expect(result.outputPath).toBeNull();
  });

  it("switches to static mode with --output flag", () => {
    const result = parseCliArgs(["./specs", "--output", "graph.html"]);
    expect(result.mode).toBe("static");
    expect(result.outputPath).toBe("graph.html");
  });

  it("switches to static mode with -o flag", () => {
    const result = parseCliArgs(["./specs", "-o", "out.html"]);
    expect(result.mode).toBe("static");
    expect(result.outputPath).toBe("out.html");
  });

  it("defaults port to 3333", () => {
    const result = parseCliArgs(["./specs"]);
    expect(result.port).toBe(3333);
  });

  it("parses --port flag", () => {
    const result = parseCliArgs(["./specs", "--port", "4000"]);
    expect(result.port).toBe(4000);
  });

  it("returns help flag when --help is present", () => {
    const result = parseCliArgs(["--help"]);
    expect(result.help).toBe(true);
  });

  it("returns help flag when -h is present", () => {
    const result = parseCliArgs(["-h"]);
    expect(result.help).toBe(true);
  });

  it("returns help flag when no args", () => {
    const result = parseCliArgs([]);
    expect(result.help).toBe(true);
  });

  it("errors when --output has no value", () => {
    const result = parseCliArgs(["./specs", "--output"]);
    expect(result.error).toContain("--output requires a file path");
  });

  it("errors when --port has no value", () => {
    const result = parseCliArgs(["./specs", "--port"]);
    expect(result.error).toContain("--port requires a number");
  });
});
