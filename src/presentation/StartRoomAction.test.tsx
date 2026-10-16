import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTranslator } from "@application/i18n";
import { CreateRoomError } from "@application/createRoom";
import type * as CreateRoomModule from "@application/createRoom";
import { StartRoomAction } from "@presentation/StartRoomAction";

const translate = createTranslator("en-US");

const createRoom = vi.hoisted(() => vi.fn());

vi.mock("@application/createRoom", async (importOriginal) => {
  const original = await importOriginal<typeof CreateRoomModule>();
  return { ...original, createRoom };
});

describe("StartRoomAction", () => {
  beforeEach(() => {
    createRoom.mockReset();
  });

  function renderAction() {
    const onNavigate = vi.fn();
    render(<StartRoomAction onNavigate={onNavigate} translate={translate} />);
    return { onNavigate };
  }

  it("opens the room it created", async () => {
    createRoom.mockResolvedValue("abcd2345");
    const { onNavigate } = renderAction();

    await userEvent.click(screen.getByRole("button", { name: "Start a room" }));

    // The action holds the button for a floor of a third of a second, on purpose, so a
    // fast answer does not look like a dropped tap.
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith("/room/abcd2345"));
  });

  it("says it is working while the room is being made", async () => {
    let release = (): void => {};
    createRoom.mockReturnValue(
      new Promise<string>((resolve) => {
        release = () => resolve("abcd2345");
      }),
    );
    renderAction();

    await userEvent.click(screen.getByRole("button", { name: "Start a room" }));

    // A tap that looked like it had done nothing is the failure this answers.
    expect(screen.getByRole("button", { name: "Creating..." })).toBeTruthy();
    release();
  });

  it("does not let the room be started twice while it works", async () => {
    createRoom.mockReturnValue(new Promise<string>(() => {}));
    renderAction();

    const button = screen.getByRole("button", { name: "Start a room" });
    await userEvent.click(button);
    await userEvent.click(button);

    expect(createRoom).toHaveBeenCalledTimes(1);
  });

  it("says so when the room cannot be made", async () => {
    createRoom.mockRejectedValue(new CreateRoomError("network"));
    renderAction();

    await userEvent.click(screen.getByRole("button", { name: "Start a room" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  /**
   * The complaint has to go when the person tries again, otherwise a second failure
   * looks exactly like the first and the button looks like it did nothing at all.
   */
  it("takes the complaint back when the action is tried again", async () => {
    createRoom.mockRejectedValueOnce(new CreateRoomError("network"));
    createRoom.mockResolvedValueOnce("abcd2345");
    const { onNavigate } = renderAction();

    await userEvent.click(screen.getByRole("button", { name: "Start a room" }));
    expect(await screen.findByRole("alert")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Start a room" }));

    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith("/room/abcd2345"));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});