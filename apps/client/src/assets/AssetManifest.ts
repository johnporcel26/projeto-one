const root = "/";
export const Asset = {
  forestGround: `${root}Mapas/Floresta/Solo/0c435ac1-14da-43e4-968c-869fa3e07dbf.png`, shipFrames: [1, 2, 3, 4].map((n) => `${root}Mapas/Lobby/${n}.png`), beachFrames: [1, 2, 3, 4].map((n) => `${root}Mapas/Praia/${n}.png`),
  ted: (state: "idle" | "walk" | "attack" | "death", frame: number) => `${root}personagem/Player/${state}/${frame}.png`, tedIdleDirectional: (direction: "Costa" | "Lado", frame: number) => `${root}personagem/Player/idle/${direction}/${frame}.png`,
  alvida: (state: "Idle" | "Walking", direction: "Frente" | "Costa" | "Lado", frame: number) => `${root}Monsters/Alvida/${state}/${direction}/${frame}.png`, alvidaAttack: (frame: number) => `${root}Monsters/Alvida/Attack/${frame}.png`,
  buffalo: (animation: "idle" | "walk", direction: "down" | "up" | "side", frame: number) => `${root}enemies/buffalo/${animation}/${direction}/${animation}_${direction}_${String(frame).padStart(2, "0")}.png`,
  buffaloAttackDown: (frame: number) => `${root}enemies/buffalo/attack/down/attack_down_${String(frame).padStart(2, "0")}.png`,
  buffaloSpecialSpin: (frame: number) => `${root}enemies/buffalo/special_spin/spin_${String(frame).padStart(2, "0")}.png`,
  iceFrames: [1, 2, 3, 4].map((n) => `${root}Mapas/Gelo/solo/${n}.png`),
  wapol: (animation: "idle" | "walk", direction: "down" | "up" | "side", frame: number) => `${root}enemies/wapol/${animation}/${direction}/${frame}.png`,
  wapolAttack: (frame: number) => `${root}enemies/wapol/attack/down/${frame}.png`,
  tree: (id: string) => `${root}Mapas/Floresta/arvores/${id}.png`,
  item: (name: string) => `${root}Itens/${name}/1.png`, healingCounter: `${root}Itens/balcao/9de2a706-fb1a-44bf-bd89-986481a132fe.png`, fruit: (name: string) => `${root}Akumanomi/${name}/1.png`,
  fruitSkill: (fruit: "sube" | "guro" | "baku", skill: number, frame: string | number) => `${root}effects/fruits/${fruit}/h${skill}-${frame}.png`,
  subeDefenseFx: (frame: number) => `${root}effects/fruits/sube/h2-${frame}.png`,
  subeEvasionFx: (frame: number) => `${root}effects/fruits/sube/h3-${frame}.png`,
  oldDrunk: (state: "idle" | "drink" | "sway" | "interact" | "heal", frame: number) => `${root}npcs/old_drunk_healer/${state}/${state}_${String(frame).padStart(2, "0")}.png`, oldDrunkSeated: (state: "idle" | "drink" | "sway" | "interact" | "heal", frame: number) => `${root}npcs/old_drunk_healer/seated/${state}_${String(frame).padStart(2, "0")}.png`, oldDrunkFx: (frame: number) => `${root}npcs/old_drunk_healer/fx/heal_fx_${String(frame).padStart(2, "0")}.png`
} as const;
