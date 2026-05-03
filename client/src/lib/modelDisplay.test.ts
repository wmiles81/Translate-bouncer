import {
  contextK,
  displayName,
  inputPrice,
  isFree,
  outputPrice,
  provider,
  supportsTools,
} from "./modelDisplay";

describe("modelDisplay helpers", () => {
  it("provider extracts the part before /", () => {
    expect(provider({ id: "anthropic/claude-sonnet-4" })).toBe("anthropic");
    expect(provider({ id: "openai/gpt-5" })).toBe("openai");
    expect(provider({ id: "no-slash" })).toBe("no-slash");
  });

  it("isFree detects zero pricing", () => {
    expect(isFree({ id: "x", pricing: { prompt: "0", completion: "0" } })).toBe(true);
    expect(isFree({ id: "x", pricing: { prompt: "0.000001", completion: "0" } })).toBe(false);
    expect(isFree({ id: "x" })).toBe(true);
  });

  it("supportsTools checks supported_parameters", () => {
    expect(supportsTools({ id: "x", supported_parameters: ["tools"] })).toBe(true);
    expect(supportsTools({ id: "x", supported_parameters: ["other"] })).toBe(false);
    expect(supportsTools({ id: "x" })).toBe(false);
  });

  it("contextK formats with k or M suffix", () => {
    expect(contextK({ id: "x", context_length: 200000 })).toBe("200k");
    expect(contextK({ id: "x", context_length: 1_000_000 })).toBe("1M");
    expect(contextK({ id: "x", context_length: 1_500_000 })).toBe("1.5M");
    expect(contextK({ id: "x" })).toBe("?");
  });

  it("inputPrice and outputPrice convert per-token to per-million", () => {
    expect(inputPrice({ id: "x", pricing: { prompt: "0.000003" } })).toBe("$3.00");
    expect(outputPrice({ id: "x", pricing: { completion: "0.000015" } })).toBe("$15.00");
    expect(inputPrice({ id: "x", pricing: { prompt: "0" } })).toBe("free");
  });

  it("displayName falls back to id", () => {
    expect(displayName({ id: "a", name: "A" })).toBe("A");
    expect(displayName({ id: "a" })).toBe("a");
  });
});
