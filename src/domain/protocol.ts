import { isChatMessage, type ChatMessage } from "@domain/chat";
import { isDeckId, type DeckId } from "@domain/deck";
import { isValidName } from "@domain/name";
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
}

export function toPublicState(
  room: RoomSnapshot,
  viewerToken: string | null = null,
): PublicRoomState {
  const reveals = room.isRevealed ? buildRevealEntries(room) : null;
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
    candidate.messages.every(isChatMessage)
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
  | { type: "set-room-name"; name: string | null }
  | { type: "chat"; text: string }
  | { type: "clear-chat" }
  | { type: "delete-room" }
  | { type: "ping" };

export type ServerMessage =
  | { type: "state"; state: PublicRoomState }
  | { type: "chat"; message: ChatMessage }
  | { type: "joined"; participantId: string; token: string; state: PublicRoomState }
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
    code?: unknown;
    message?: unknown;
  };

  switch (candidate.type) {
    case "state":
      return isViewPayload(candidate.state);
    case "chat":
      return isChatMessage(candidate.message);
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