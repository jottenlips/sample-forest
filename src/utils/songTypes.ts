import { Scene } from '../types';

export type ExportMode = 'mix' | 'stems' | 'stem';

export interface SongScene {
  sceneId: number;
  scene: Scene;
}

export function sceneDuration(scene: Scene): number {
  return scene.stepCount * (60 / scene.bpm / 4);
}
