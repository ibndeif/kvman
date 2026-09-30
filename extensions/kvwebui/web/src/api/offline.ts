import type { Problem } from '@kvman/sdk';

// What a call or stream gets when kvman doesn't answer.
export const offlineProblem: Problem = { code: 'kvwebui/OFFLINE', message: "kvman didn't answer." };
