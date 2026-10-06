import { MESSAGE_LIMIT, type ChatMessage } from "@domain/chat";
import {
  DEFAULT_DECK_ID,
  type DeckId,
  getDeck,
  isVoteValue,
  pointsFor,
} from "./deck";

export const MAX_PARTICIPANTS = 50;
export const REMOVED_TOKEN_LIMIT = 50;
export const GRACE_PERIOD_MS = 5 * 60 * 1000;

export type ParticipantRole = "voter" | "spectator";

export interface Participant {
  id: string;
  token: string;
  name: string;
  role: ParticipantRole;
  isOwner: boolean;
  isConnected: boolean;
  disconnectedAt: number | null;
  vote: string | null;
}

export interface RoomSnapshot {
  id: string;
  deckId: DeckId;
  round: number;
  isRevealed: boolean;
  participants: Participant[];
  ownerId: string | null;
  gracePeriodMs: number;
  messages: ChatMessage[];
  name: string | null;
  removedTokens: string[];
}

export interface RevealEntry {
  participantId: string;
  name: string;
  role: ParticipantRole;
  vote: string | null;
  points: number | null;
}

export function createRoom(id: string): RoomSnapshot {
  return {
    id,
    deckId: DEFAULT_DECK_ID,
    round: 1,
    isRevealed: false,
    participants: [],
    ownerId: null,
    gracePeriodMs: GRACE_PERIOD_MS,
    messages: [],
    name: null,
    removedTokens: [],
  };
}

/**
 * Snapshots persisted before a field existed still deserialize without it, so
 * loading has to backfill rather than trust the stored shape.
 */
export function restoreRoom(
  stored: Partial<RoomSnapshot> | null | undefined,
  roomId: string,
): RoomSnapshot {
  const base = createRoom(roomId);

  if (stored === null || stored === undefined) return base;

  return {
    ...base,
    ...stored,
    id: stored.id ?? base.id,
    gracePeriodMs: stored.gracePeriodMs ?? base.gracePeriodMs,
    participants: Array.isArray(stored.participants)
      ? stored.participants.map((participant) => ({
          ...participant,
          disconnectedAt:
            typeof participant.disconnectedAt === "number"
              ? participant.disconnectedAt
              : null,
        }))
      : [],
    messages: Array.isArray(stored.messages) ? stored.messages : [],
    name: typeof stored.name === "string" ? stored.name : null,
    removedTokens: Array.isArray(stored.removedTokens) ? stored.removedTokens : [],
  };
}

export function joinRoom(
  room: RoomSnapshot,
  participant: Omit<Participant, "vote" | "disconnectedAt">,
): RoomSnapshot {
  if (room.participants.length >= MAX_PARTICIPANTS) {
    return room;
  }

  const isFirstParticipant = room.participants.length === 0;
  const claimOwnership = room.ownerId === null || isFirstParticipant;

  const nextParticipant: Participant = {
    ...participant,
    vote: null,
    disconnectedAt: null,
  };
  const participants = [...room.participants, nextParticipant];

  if (claimOwnership) {
    for (const existing of participants) {
      existing.isOwner = existing.id === nextParticipant.id;
    }
  }

  return {
    ...room,
    participants,
    ownerId: claimOwnership ? nextParticipant.id : room.ownerId,
  };
}

export function disconnectParticipant(
  room: RoomSnapshot,
  participantId: string,
): RoomSnapshot {
  return {
    ...room,
    participants: room.participants.map((participant) =>
      participant.id === participantId
        ? { ...participant, isConnected: false, disconnectedAt: Date.now() }
        : participant,
    ),
  };
}

export function reconnectParticipant(
  room: RoomSnapshot,
  participantId: string,
): RoomSnapshot {
  return {
    ...room,
    participants: room.participants.map((participant) =>
      participant.id === participantId
        ? { ...participant, isConnected: true, disconnectedAt: null }
        : participant,
    ),
  };
}

export function leaveRoom(room: RoomSnapshot, participantId: string): RoomSnapshot {
  const participants = room.participants.filter(
    (participant) => participant.id !== participantId,
  );

  const ownerId = room.ownerId === participantId ? null : room.ownerId;

  return {
    ...room,
    participants,
    ownerId,
    isRevealed: false,
    messages: room.messages.filter(
      (message) => message.authorId !== participantId,
    ),
  };
}

/**
 * Frees the seats of people who have been gone longer than the grace window.
 * Without this the participant cap is permanent: a room could be filled with dead
 * slots and refuse everyone while one socket stayed open.
 */
export function reclaimDisconnected(
  room: RoomSnapshot,
  now: number = Date.now(),
): RoomSnapshot {
  if (room.participants.length < MAX_PARTICIPANTS) return room;

  const stale = room.participants.filter(
    (participant) =>
      !participant.isConnected &&
      participant.disconnectedAt !== null &&
      now - participant.disconnectedAt >= room.gracePeriodMs &&
      participant.id !== room.ownerId,
  );

  if (stale.length === 0) return room;

  const gone = new Set(stale.map((participant) => participant.id));

  return {
    ...room,
    participants: room.participants.filter((participant) => !gone.has(participant.id)),
    messages: room.messages.filter((message) => !gone.has(message.authorId)),
  };
}

export function findByToken(
  room: RoomSnapshot,
  token: string,
): Participant | undefined {
  return room.participants.find((participant) => participant.token === token);
}

export function castVote(
  room: RoomSnapshot,
  participantId: string,
  value: string,
): RoomSnapshot {
  if (!isVoteValue(room.deckId, value)) return room;

  const participant = room.participants.find((entry) => entry.id === participantId);
  if (!participant || participant.role === "spectator") return room;

  const isSameVote = participant.vote === value;
  const nextVote = isSameVote ? null : value;

  return {
    ...room,
    isRevealed: false,
    participants: room.participants.map((entry) =>
      entry.id === participantId ? { ...entry, vote: nextVote } : entry,
    ),
  };
}

export function setDeck(room: RoomSnapshot, deckId: DeckId): RoomSnapshot {
  if (room.deckId === deckId) return room;

  return {
    ...room,
    deckId,
    isRevealed: false,
    participants: room.participants.map((participant) => ({
      ...participant,
      vote: null,
    })),
  };
}

export function reveal(room: RoomSnapshot): RoomSnapshot {
  return { ...room, isRevealed: true };
}

export function startNextRound(room: RoomSnapshot): RoomSnapshot {
  return {
    ...room,
    round: room.round + 1,
    isRevealed: false,
    participants: room.participants.map((participant) => ({
      ...participant,
      vote: null,
    })),
  };
}

export function resetRound(room: RoomSnapshot): RoomSnapshot {
  return {
    ...room,
    isRevealed: false,
    participants: room.participants.map((participant) => ({
      ...participant,
      vote: null,
    })),
  };
}

export function deleteRoom(room: RoomSnapshot): null {
  void room;
  return null;
}

export function setParticipantRole(
  room: RoomSnapshot,
  participantId: string,
  role: ParticipantRole,
): RoomSnapshot {
  const participant = room.participants.find((entry) => entry.id === participantId);
  if (!participant || participant.role === role) return room;

  return {
    ...room,
    participants: room.participants.map((entry) =>
      entry.id === participantId
        ? { ...entry, role, vote: role === "spectator" ? null : entry.vote }
        : entry,
    ),
  };
}

export function setParticipantName(
  room: RoomSnapshot,
  participantId: string,
  name: string,
): RoomSnapshot {
  return {
    ...room,
    participants: room.participants.map((participant) =>
      participant.id === participantId ? { ...participant, name } : participant,
    ),
  };
}

export function transferOwnership(
  room: RoomSnapshot,
  toParticipantId: string,
): RoomSnapshot {
  const target = room.participants.find(
    (participant) => participant.id === toParticipantId,
  );
  if (!target) return room;

  return {
    ...room,
    ownerId: target.id,
    participants: room.participants.map((participant) => ({
      ...participant,
      isOwner: participant.id === target.id,
    })),
  };
}

/**
 * Removal has to hold, otherwise the person just reloads with the token still in
 * sessionStorage and walks straight back in. The tombstone is capped because the
 * room only needs to outlive a reconnect, not remember people forever.
 */
export function removeParticipant(
  room: RoomSnapshot,
  participantId: string,
): RoomSnapshot {
  const without = leaveRoom(room, participantId);
  const token = room.participants.find(
    (participant) => participant.id === participantId,
  )?.token;

  if (token === undefined || without.removedTokens.includes(token)) return without;

  return {
    ...without,
    removedTokens: [...without.removedTokens, token].slice(-REMOVED_TOKEN_LIMIT),
  };
}

export function isRemovedToken(room: RoomSnapshot, token: string): boolean {
  return room.removedTokens.includes(token);
}

export function appendMessage(
  room: RoomSnapshot,
  message: ChatMessage,
): RoomSnapshot {
  return {
    ...room,
    messages: [...room.messages, message].slice(-MESSAGE_LIMIT),
  };
}

/**
 * The topic the owner gave the session. It survives the owner leaving, because the
 * room itself survives for the grace period and the name describes the room rather
 * than the person who happened to create it.
 */
export function setRoomName(room: RoomSnapshot, name: string): RoomSnapshot {
  if (room.name === name) return room;
  return { ...room, name };
}

export function clearRoomName(room: RoomSnapshot): RoomSnapshot {
  if (room.name === null) return room;
  return { ...room, name: null };
}

export function clearMessages(room: RoomSnapshot): RoomSnapshot {
  if (room.messages.length === 0) return room;
  return { ...room, messages: [] };
}

export function shouldRoomExpire(room: RoomSnapshot): boolean {
  if (room.participants.length === 0) return true;
  return !room.participants.some((participant) => participant.isConnected);
}

export function countConnected(room: RoomSnapshot): number {
  return room.participants.filter((participant) => participant.isConnected).length;
}

export function buildRevealEntries(room: RoomSnapshot): RevealEntry[] {
  return room.participants.map((participant) => ({
    participantId: participant.id,
    name: participant.name,
    role: participant.role,
    vote: participant.vote,
    points: participant.vote === null ? null : pointsFor(participant.vote),
  }));
}

export function tallyPoints(entries: RevealEntry[]): number {
  return entries.reduce(
    (total, entry) => total + (entry.points ?? 0),
    0,
  );
}

export function availableVotes(room: RoomSnapshot): readonly string[] {
  return getDeck(room.deckId);
}