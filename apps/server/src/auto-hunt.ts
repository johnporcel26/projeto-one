import type { FruitId } from "@onepiece/shared";

/** Policy only: execution remains server-side in GameSession. Skills are deliberately opt-in for Alpha. */
export class AutoHuntSkillPlanner {
  constructor(readonly autoUseSkills = false) {}
  chooseSkill(_activeFruit: FruitId | null, _availableSkillIds: readonly string[]): string | null { return null; }
}
