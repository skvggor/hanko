import { isChatMessage, type ChatMessage } from "@domain/chat";
import { isDeckId, type DeckId } from "@domain/deck";
import { isValidName } from "@domain/name";
import { isCatActivity, isCatState, type CatState } from "@domain/cat";
import {
  type ParticipantRole,
  type RoomSnapshot,
  buildRevealEntries,
  findByToken,
  tallyPoints,
} from "@domain/room";

export interface PublicParticipant {
  id: string;
  name: string;
  role: ParticipantRole;
  isOwner: boolean;
  isConnected: boolean;
  hasVoted: boolean;
  /**
   * False once their cat has been sent away, which every client has to honour.
   *
   * Optional rather than required, and read as present unless it says false. A state
   * that predates the field has to keep every cat on screen rather than blank the
   * room, so the absent case and the true case are the same answer by design.
   */
  hasCat?: boolean;
}

export interface RevealedVote {
  participantId: string;
  name: string;
  role: ParticipantRole;
  vote: string | null;
  points: number | null;
}

export interface PublicRoomState {
  id: string;
  deckId: DeckId;
  round: number;
  isRevealed: boolean;
  participants: PublicParticipant[];
  ownerId: string | null;
  gracePeriodMs: number;
  connectedCount: number;
  reveals: RevealedVote[] | null;
  totalPoints: number | null;
  myVote: string | null;
  messages: ChatMessage[];
  name: string | null;
  cats?: CatState[];
}

export function toPublicState(
  room: RoomSnapshot,
  viewerToken: string | null = null,
  cats: CatState[] = [],
): PublicRoomState {
  /**
   * Read from the frozen record rather than rebuilt, so a seat freed after the reveal
   * cannot move a number the room has already read together. Rebuilt only when the
   * record is missing altogether, because a revealed round with no numbers on it is
   * worse than a set of numbers nobody froze.
   */
  const reveals = room.isRevealed
    ? (room.revealedEntries ?? buildRevealEntries(room))
    : null;
  const viewer = viewerToken === null ? undefined : findByToken(room, viewerToken);

  return {
    id: room.id,
    deckId: room.deckId,
    round: room.round,
    isRevealed: room.isRevealed,
    participants: room.participants.map((participant) => ({
      id: participant.id,
      name: participant.name,
      role: participant.role,
      isOwner: participant.isOwner,
      isConnected: participant.isConnected,
      hasVoted: participant.vote !== null,
      hasCat: participant.hasCat,
    })),
    ownerId: room.ownerId,
    gracePeriodMs: room.gracePeriodMs,
    connectedCount: room.participants.filter(
      (participant) => participant.isConnected,
    ).length,
    reveals,
    totalPoints: reveals === null ? null : tallyPoints(reveals),
    myVote: viewer?.vote ?? null,
    messages: room.messages,
    name: room.name,
    cats,
  };
}

export function isViewPayload(value: unknown): value is PublicRoomState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<PublicRoomState>;
  return (
    typeof candidate.id === "string" &&
    isDeckId(candidate.deckId) &&
    typeof candidate.round === "number" &&
    typeof candidate.isRevealed === "boolean" &&
    Array.isArray(candidate.participants) &&
    Array.isArray(candidate.messages) &&
    candidate.messages.every(isChatMessage) &&
    (candidate.cats === undefined ||
      (Array.isArray(candidate.cats) && candidate.cats.every(isCatState)))
  );
}

export type ClientMessage =
  | { type: "join"; token: string | null; name: string; role: ParticipantRole }
  | { type: "vote"; value: string }
  | { type: "reveal" }
  | { type: "next-round" }
  | { type: "reset-round" }
  | { type: "set-deck"; deckId: DeckId }
  | { type: "set-role"; participantId: string; role: ParticipantRole }
  | { type: "set-name"; name: string }
  | { type: "transfer-ownership"; participantId: string }
  | { type: "remove-participant"; participantId: string }
  /**
   * Carries no participant id on purpose. Sending a cat away is a thing a person does
   * to their own cat, so the server reads who is asking off the socket rather than
   * off a field anybody could have filled in with somebody else's name.
   */
  | { type: "remove-cat" }
  /** Carries the pressing window's shape, since cat positions are normalised and "the edge" means nothing without it. */
  | { type: "shoo-cats"; aspect: number }
  | { type: "set-room-name"; name: string | null }
  | { type: "chat"; text: string }
  | { type: "clear-chat" }
  | {
      type: "cat-update";
      x: number;
      y: number;
      direction: "left" | "right";
      activity: "idle" | "walking" | "jumping" | "sleeping" | "angry";
      isPaused: boolean;
    }
  | { type: "delete-room" }
  | { type: "ping" };

export type ServerMessage =
  | { type: "state"; state: PublicRoomState }
  | { type: "chat"; message: ChatMessage }
  | { type: "joined"; participantId: string; token: string; state: PublicRoomState }
  | { type: "cat-state"; cat: CatState }
  | { type: "error"; code: string }
  | { type: "room-deleted" }
  | { type: "removed" }
  | { type: "pong" };

export const ERROR_CODES = {
  nameRequired: "name_required",
  nameInvalid: "name_invalid",
  roomNotFound: "room_not_found",
  roomDeleted: "room_deleted",
  notOwner: "not_owner",
  unauthorized: "unauthorized",
  invalidVote: "invalid_vote",
  emptyMessage: "empty_message",
  sessionNameRequired: "session_name_required",
  sessionNameInvalid: "session_name_invalid",
  rateLimited: "rate_limited",
  participantRemoved: "participant_removed",
  roomFull: "room_full",
} as const;

export function isClientMessage(value: unknown): value is ClientMessage {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { type?: unknown };

  switch (candidate.type) {
    case "join":
      return typeof (candidate as { name?: unknown }).name === "string";
    case "vote":
      return typeof (candidate as { value?: unknown }).value === "string";
    case "chat":
      return typeof (candidate as { text?: unknown }).text === "string";
    case "set-room-name": {
      const name = (candidate as { name?: unknown }).name;
      return name === null || typeof name === "string";
    }
    case "set-name":
      return typeof (candidate as { name?: unknown }).name === "string";
    case "cat-update": {
      const update = candidate as {
        x?: unknown;
        y?: unknown;
        direction?: unknown;
        activity?: unknown;
        isPaused?: unknown;
      };
      return (
        typeof update.x === "number" &&
        Number.isFinite(update.x) &&
        typeof update.y === "number" &&
        Number.isFinite(update.y) &&
        (update.direction === "left" || update.direction === "right") &&
        isCatActivity(update.activity) &&
        typeof update.isPaused === "boolean"
      );
    }
    case "set-deck":
      return isDeckId((candidate as { deckId?: unknown }).deckId);
    case "set-role": {
      const role = (candidate as { role?: unknown }).role;
      return (
        typeof (candidate as { participantId?: unknown }).participantId === "string" &&
        (role === "voter" || role === "spectator")
      );
    }
    case "transfer-ownership":
    case "remove-participant":
      return typeof (candidate as { participantId?: unknown }).participantId === "string";
    case "remove-cat":
      return true;
    case "shoo-cats": {
      const aspect = (candidate as { aspect?: unknown }).aspect;
      return typeof aspect === "number" && Number.isFinite(aspect);
    }
    case "reveal":
    case "next-round":
    case "reset-round":
    case "clear-chat":
    case "delete-room":
    case "ping":
      return true;
    default:
      return false;
  }
}

export function isServerMessage(value: unknown): value is ServerMessage {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as {
    type?: unknown;
    state?: unknown;
    message?: unknown;
    cat?: unknown;
    code?: unknown;
  };

  switch (candidate.type) {
    case "state":
      return isViewPayload(candidate.state);
    case "chat":
      return isChatMessage(candidate.message);
    case "cat-state":
      return isCatState(candidate.cat);
    case "joined":
      return (
        isViewPayload(candidate.state) &&
        typeof (candidate as { participantId?: unknown }).participantId === "string" &&
        typeof (candidate as { token?: unknown }).token === "string"
      );
    case "error":
      return typeof candidate.code === "string";
    case "room-deleted":
    case "removed":
    case "pong":
      return true;
    default:
      return false;
  }
}

export function isValidJoinName(name: string): boolean {
  return isValidName(name);
}
