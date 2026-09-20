import type { GameSnapshot } from "@onepiece/shared";
export const bridge = { snapshot: undefined as GameSnapshot | undefined, onSnapshot: undefined as ((snapshot: GameSnapshot) => void) | undefined };
