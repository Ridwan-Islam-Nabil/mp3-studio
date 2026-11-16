import { describe, expect, it } from "vitest";
import { TOOL_IDS, isToolId, parseToolParams, toolLinkQuery, type ToolLink } from "./toolParams";

describe("TOOL_IDS", () => {
  it("is exactly the contract with the SEO pages", () => {
    expect(TOOL_IDS).toEqual(["remove-silence", "normalize", "ringtone", "convert", "keep", "split"]);
  });
  it("isToolId accepts only those ids", () => {
    for (const id of TOOL_IDS) expect(isToolId(id)).toBe(true);
    for (const bad of ["", "Normalize", "zip", "export-all", "batch", null, undefined, 3]) expect(isToolId(bad)).toBe(false);
  });
});

describe("parseToolParams", () => {
  it("missing, empty or unknown values → null (default editor)", () => {
    for (const q of [null, undefined, "", "?", "?foo=bar", "?tool=", "?tool=zip", "?tool=export-all", "?tool=remove_silence"]) {
      expect(parseToolParams(q)).toBeNull();
    }
  });

  it("parses every simple tool, with or without the leading ?", () => {
    expect(parseToolParams("?tool=remove-silence")).toEqual({ tool: "remove-silence" });
    expect(parseToolParams("tool=normalize")).toEqual({ tool: "normalize" });
    expect(parseToolParams("?tool=keep")).toEqual({ tool: "keep" });
    expect(parseToolParams("?tool=split")).toEqual({ tool: "split" });
  });

  it("is case- and whitespace-tolerant", () => {
    expect(parseToolParams("?tool=%20Normalize%20")).toEqual({ tool: "normalize" });
    expect(parseToolParams("?tool=RINGTONE&device=Android")).toEqual({ tool: "ringtone", device: "android" });
  });

  it("ringtone: iPhone by default, Android only with device=android", () => {
    expect(parseToolParams("?tool=ringtone")).toEqual({ tool: "ringtone", device: "iphone" });
    expect(parseToolParams("?tool=ringtone&device=android")).toEqual({ tool: "ringtone", device: "android" });
    expect(parseToolParams("?tool=ringtone&device=iphone")).toEqual({ tool: "ringtone", device: "iphone" });
    expect(parseToolParams("?tool=ringtone&device=nokia")).toEqual({ tool: "ringtone", device: "iphone" });
  });

  it("convert: format only for wav / m4a / mp3", () => {
    expect(parseToolParams("?tool=convert")).toEqual({ tool: "convert" });
    expect(parseToolParams("?tool=convert&format=wav")).toEqual({ tool: "convert", format: "wav" });
    expect(parseToolParams("?tool=convert&format=M4A")).toEqual({ tool: "convert", format: "m4a" });
    expect(parseToolParams("?tool=convert&format=mp3")).toEqual({ tool: "convert", format: "mp3" });
    expect(parseToolParams("?tool=convert&format=m4r")).toEqual({ tool: "convert" });
    expect(parseToolParams("?tool=convert&format=flac")).toEqual({ tool: "convert" });
  });

  it("ignores parameters that belong to other tools", () => {
    expect(parseToolParams("?tool=normalize&format=wav&device=android")).toEqual({ tool: "normalize" });
  });

  it("accepts URLSearchParams and uses the first tool value", () => {
    expect(parseToolParams(new URLSearchParams("tool=keep"))).toEqual({ tool: "keep" });
    expect(parseToolParams("?tool=keep&tool=normalize")).toEqual({ tool: "keep" });
  });
});

describe("toolLinkQuery", () => {
  it("round-trips through parseToolParams", () => {
    const links: ToolLink[] = [
      { tool: "remove-silence" }, { tool: "normalize" }, { tool: "keep" }, { tool: "split" },
      { tool: "ringtone", device: "iphone" }, { tool: "ringtone", device: "android" },
      { tool: "convert" }, { tool: "convert", format: "wav" },
    ];
    for (const link of links) expect(parseToolParams(toolLinkQuery(link))).toEqual(link);
    expect(toolLinkQuery({ tool: "convert", format: "m4a" })).toBe("?tool=convert&format=m4a");
  });
});
