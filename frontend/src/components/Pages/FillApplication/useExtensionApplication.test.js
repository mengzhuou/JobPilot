import { act, renderHook } from "@testing-library/react";
import useExtensionApplication from "./useExtensionApplication";
import { confirmJobApplication } from "../../../connector";
jest.mock("../../../connector", () => ({ confirmJobApplication: jest.fn() }));

const payload = { jobUrl: "https://job-boards.greenhouse.io/example/jobs/1", jobTitle: "Engineer", company: "Example", externalJobId: "1" };
let latestLaunch;
const captureLaunch = event => { latestLaunch = event.detail; };
const receive = (status, extra = {}) => act(() => window.dispatchEvent(new MessageEvent("message", {
    source: window, origin: window.location.origin,
    data: { source: "jobpilot-extension", type: "launch-state", ...latestLaunch, status, mode: "loop", ...extra },
})));
beforeEach(() => {
    jest.useFakeTimers(); sessionStorage.clear(); localStorage.clear();
    document.documentElement.dataset.jobpilotExtension = "ready";
    Object.defineProperty(window, "crypto", { configurable: true, value: { randomUUID: () => "12345678-1234-1234-1234-123456789abc" } });
    jest.spyOn(window, "postMessage").mockImplementation(() => {});
    window.addEventListener("jobpilot:launch", captureLaunch);
    confirmJobApplication.mockReset().mockResolvedValue({ id: "saved" });
});
afterEach(() => { window.removeEventListener("jobpilot:launch", captureLaunch); jest.restoreAllMocks(); jest.useRealTimers(); });
test("every launch shows the modal without presuming submission", () => {
    const { result } = renderHook(() => useExtensionApplication(payload));
    act(() => result.current.openWithExtension());
    expect(result.current.showConfirmation).toBe(true);
    expect(confirmJobApplication).not.toHaveBeenCalled();
    act(() => result.current.setShowConfirmation(false));
    act(() => result.current.openWithExtension());
    expect(result.current.showConfirmation).toBe(true);
});
test("returning after closing shows the dialog but does not automatically answer Yes", () => {
    const { result } = renderHook(() => useExtensionApplication(payload));
    act(() => result.current.openWithExtension());
    act(() => result.current.setShowConfirmation(false));
    receive("closed");
    expect(result.current.showConfirmation).toBe(true);
    expect(confirmJobApplication).not.toHaveBeenCalled();
});
test("verified success saves once, then requests Autofill tab closure", async () => {
    const { result } = renderHook(() => useExtensionApplication(payload));
    act(() => result.current.openWithExtension());
    receive("submitted"); receive("submitted");
    expect(result.current.showConfirmation).toBe(true);
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(confirmJobApplication).toHaveBeenCalledTimes(1);
    expect(confirmJobApplication).toHaveBeenCalledWith(payload);
    expect(window.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "saved", sessionId: latestLaunch.sessionId }), window.location.origin);
    expect(result.current.showConfirmation).toBe(false);
});
test("regular Autofill leaves submission confirmation for the user", async () => {
    const { result } = renderHook(() => useExtensionApplication(payload));
    act(() => result.current.openWithExtension());
    receive("submitted", { mode: "autofill" });
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(confirmJobApplication).not.toHaveBeenCalled();
    expect(result.current.showConfirmation).toBe(true);
});
test("save failure leaves the dialog open for retry and never closes the app", async () => {
    confirmJobApplication.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useExtensionApplication(payload));
    act(() => result.current.openWithExtension()); receive("submitted");
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(result.current.showConfirmation).toBe(true);
    expect(result.current.error).toMatch(/Unable to save/);
    expect(window.postMessage.mock.calls.some(([message]) => message.type === "saved")).toBe(false);
    await act(async () => { await result.current.confirmApplied(); });
    expect(result.current.status).toBe("applied");
});
test("ignores another launch or foreign source and preserves original job identity", async () => {
    const { result, rerender } = renderHook(({ job }) => useExtensionApplication(job), { initialProps: { job: payload } });
    act(() => result.current.openWithExtension());
    rerender({ job: { ...payload, jobUrl: "https://example.org/different" } });
    receive("submitted", { sessionId: "wrong" });
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(confirmJobApplication).not.toHaveBeenCalled();
    receive("submitted");
    await act(async () => { jest.advanceTimersByTime(300); });
    expect(confirmJobApplication).toHaveBeenCalledWith(payload);
});
test("unavailable extension explains reload without launching an untracked job", () => {
    delete document.documentElement.dataset.jobpilotExtension;
    latestLaunch = null;
    const { result } = renderHook(() => useExtensionApplication(payload));
    act(() => result.current.openWithExtension());
    expect(latestLaunch).toBeNull();
    expect(result.current.error).toMatch(/reload/i);
});
