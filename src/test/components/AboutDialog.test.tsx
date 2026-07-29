import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/preact";
import { AboutDialog } from "../../components/AboutDialog";

// Mock useLocales — return key as fallback, known keys in English
vi.mock("../../hooks/useLocales", () => ({
  t: (key: string, fallback?: string) => {
    const dict: Record<string, string> = {
      "about.title": "About AsuTorrent",
      "about.version": "Version 0.1.0",
      "about.tagline": "Torrent client built with Tauri + librqbit + Preact",
      "about.description":
        "AsuTorrent is a modern, open-source BitTorrent client.",
      "about.rust_backend": "Rust Backend",
      "about.frontend": "Frontend",
      "about.license": "MIT License",
      "about.close": "Close",
      "general.ok": "OK",
    };
    return dict[key] ?? fallback ?? key;
  },
}));

describe("AboutDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the title and version", () => {
    const onClose = vi.fn();
    render(<AboutDialog onClose={onClose} />);

    expect(screen.getByText("About AsuTorrent")).not.toBeNull();
    expect(screen.getByText("AsuTorrent")).not.toBeNull();
    expect(screen.getByText("Version 0.1.0")).not.toBeNull();
  });

  it("renders Rust and Frontend dependency sections", () => {
    const onClose = vi.fn();
    render(<AboutDialog onClose={onClose} />);

    expect(screen.getByText("Rust Backend")).not.toBeNull();
    expect(screen.getByText("Frontend")).not.toBeNull();

    // Check for known dependencies
    expect(screen.getByText("Tauri")).not.toBeNull();
    expect(screen.getByText("librqbit")).not.toBeNull();
    expect(screen.getByText("Preact")).not.toBeNull();
  });

  it("renders the license text", () => {
    const onClose = vi.fn();
    render(<AboutDialog onClose={onClose} />);

    expect(screen.getByText("MIT License")).not.toBeNull();
  });

  it("renders a close button", () => {
    const onClose = vi.fn();
    render(<AboutDialog onClose={onClose} />);

    const closeButton = screen.getByText("Close");
    expect(closeButton).not.toBeNull();
  });

  it("calls onClose when clicking the close button", () => {
    const onClose = vi.fn();
    render(<AboutDialog onClose={onClose} />);

    const closeButton = screen.getByText("Close");
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when clicking the overlay", () => {
    const onClose = vi.fn();
    const { container } = render(<AboutDialog onClose={onClose} />);

    const overlay = container.querySelector(".dialog-overlay");
    expect(overlay).not.toBeNull();
    fireEvent.click(overlay!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when clicking inside the dialog", () => {
    const onClose = vi.fn();
    render(<AboutDialog onClose={onClose} />);

    const dialog = document.querySelector(".about-dialog");
    expect(dialog).not.toBeNull();
    fireEvent.click(dialog!);
    expect(onClose).not.toHaveBeenCalled();
  });
});
