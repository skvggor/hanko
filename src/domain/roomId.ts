/**
 * The room id is the only secret guarding a room, so its shape lives in one place and
 * everything that reads or mints one goes through here. It used to be written twice,
 * as a regex in the router and again in the Worker, and the two copies drifted: both
 * accepted `[a-z0-9]` while the generator only ever draws from an alphabet that leaves
 * out i, l, o, 0 and 1. That is how /room/texto came to open a room no link the app
 * hands out could ever point at.
 *
 * The domain owns this because it is the only layer both the client router and the
 * Worker are allowed to read, so the alphabet cannot be re-derived on either side.
 */
export const ROOM_ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export const ROOM_ID_LENGTH = 8;

const ROOM_ID_PATTERN = new RegExp(`^[${ROOM_ID_ALPHABET}]{${ROOM_ID_LENGTH}}$`);

/**
 * Accepts only what generateRoomId can produce. Pinning the length too means the set of
 * ids that route to a room is exactly the set the app can mint, so there is no shape of
 * link that looks like a room without being one.
 */
export function isRoomId(value: string): boolean {
  return ROOM_ID_PATTERN.test(value);
}