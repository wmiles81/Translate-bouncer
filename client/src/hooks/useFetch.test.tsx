import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useFetch } from "./useFetch";

describe("useFetch", () => {
  it("fetches on mount, exposes data, and refetches on refresh()", async () => {
    let calls = 0;
    const fetcher = vi.fn(async () => {
      calls += 1;
      return [`result-${calls}`];
    });
    const { result } = renderHook(() => useFetch<string[]>(fetcher, []));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(["result-1"]);
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.data).toEqual(["result-2"]));
    expect(result.current.error).toBeNull();
  });

  it("refetches when the tab regains focus (a stale tab self-heals)", async () => {
    let calls = 0;
    const fetcher = vi.fn(async () => {
      calls += 1;
      return [`result-${calls}`];
    });
    const { result } = renderHook(() => useFetch<string[]>(fetcher, []));
    await waitFor(() => expect(result.current.data).toEqual(["result-1"]));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(result.current.data).toEqual(["result-2"]));
  });

  it("captures fetch errors without throwing", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("nope");
    });
    const { result } = renderHook(() => useFetch<string[]>(fetcher, []));
    await waitFor(() => expect(result.current.error?.message).toBe("nope"));
    expect(result.current.data).toEqual([]);
  });
});
