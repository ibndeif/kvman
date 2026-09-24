const irregularForms: ReadonlyArray<readonly [base: string, participle: string]> = [
  ['arise', 'arisen'], ['awake', 'awoken'], ['be', 'been'], ['bear', 'borne'], ['beat', 'beaten'], ['become', 'become'],
  ['begin', 'begun'], ['bend', 'bent'], ['bet', 'bet'], ['bid', 'bid'], ['bind', 'bound'], ['bite', 'bitten'],
  ['bleed', 'bled'], ['blow', 'blown'], ['break', 'broken'], ['breed', 'bred'], ['bring', 'brought'], ['broadcast', 'broadcast'],
  ['build', 'built'], ['burn', 'burnt'], ['burst', 'burst'], ['buy', 'bought'], ['cast', 'cast'], ['catch', 'caught'],
  ['choose', 'chosen'], ['cling', 'clung'], ['come', 'come'], ['cost', 'cost'], ['creep', 'crept'], ['cut', 'cut'],
  ['deal', 'dealt'], ['dig', 'dug'], ['do', 'done'], ['draw', 'drawn'], ['dream', 'dreamt'], ['drink', 'drunk'],
  ['drive', 'driven'], ['dwell', 'dwelt'], ['eat', 'eaten'], ['fall', 'fallen'], ['feed', 'fed'], ['feel', 'felt'],
  ['fight', 'fought'], ['find', 'found'], ['fit', 'fit'], ['flee', 'fled'], ['fling', 'flung'], ['fly', 'flown'],
  ['forbid', 'forbidden'], ['forecast', 'forecast'], ['foresee', 'foreseen'], ['forget', 'forgotten'], ['forgive', 'forgiven'], ['freeze', 'frozen'],
  ['get', 'gotten'], ['give', 'given'], ['go', 'gone'], ['grind', 'ground'], ['grow', 'grown'], ['hang', 'hung'],
  ['have', 'had'], ['hear', 'heard'], ['hide', 'hidden'], ['hit', 'hit'], ['hold', 'held'], ['hurt', 'hurt'],
  ['input', 'input'], ['keep', 'kept'], ['kneel', 'knelt'], ['know', 'known'], ['lay', 'laid'], ['lead', 'led'],
  ['lean', 'leant'], ['leap', 'leapt'], ['learn', 'learnt'], ['leave', 'left'], ['lend', 'lent'], ['let', 'let'],
  ['lie', 'lain'], ['light', 'lit'], ['lose', 'lost'], ['make', 'made'], ['mean', 'meant'], ['meet', 'met'],
  ['mislead', 'misled'], ['mistake', 'mistaken'], ['misunderstand', 'misunderstood'], ['offset', 'offset'], ['output', 'output'], ['overcome', 'overcome'],
  ['override', 'overridden'], ['overrun', 'overrun'], ['oversee', 'overseen'], ['overtake', 'overtaken'], ['overthrow', 'overthrown'], ['overwrite', 'overwritten'],
  ['pay', 'paid'], ['preset', 'preset'], ['prove', 'proven'], ['put', 'put'], ['quit', 'quit'], ['read', 'read'],
  ['rebuild', 'rebuilt'], ['recast', 'recast'], ['redo', 'redone'], ['remake', 'remade'], ['rerun', 'rerun'], ['reset', 'reset'],
  ['rewind', 'rewound'], ['rewrite', 'rewritten'], ['ride', 'ridden'], ['ring', 'rung'], ['rise', 'risen'], ['run', 'run'],
  ['say', 'said'], ['see', 'seen'], ['seek', 'sought'], ['sell', 'sold'], ['send', 'sent'], ['set', 'set'],
  ['sew', 'sewn'], ['shake', 'shaken'], ['shed', 'shed'], ['shine', 'shone'], ['shoot', 'shot'], ['show', 'shown'],
  ['shrink', 'shrunk'], ['shut', 'shut'], ['sing', 'sung'], ['sink', 'sunk'], ['sit', 'sat'], ['slay', 'slain'],
  ['sleep', 'slept'], ['slide', 'slid'], ['sling', 'slung'], ['speak', 'spoken'], ['speed', 'sped'], ['spend', 'spent'],
  ['spin', 'spun'], ['spit', 'spat'], ['split', 'split'], ['spread', 'spread'], ['spring', 'sprung'], ['stand', 'stood'],
  ['steal', 'stolen'], ['stick', 'stuck'], ['sting', 'stung'], ['stink', 'stunk'], ['stride', 'stridden'], ['strike', 'struck'],
  ['string', 'strung'], ['strive', 'striven'], ['swear', 'sworn'], ['sweep', 'swept'], ['swell', 'swollen'], ['swim', 'swum'],
  ['swing', 'swung'], ['take', 'taken'], ['teach', 'taught'], ['tear', 'torn'], ['tell', 'told'], ['think', 'thought'],
  ['throw', 'thrown'], ['thrust', 'thrust'], ['tread', 'trodden'], ['unbind', 'unbound'], ['undergo', 'undergone'], ['understand', 'understood'],
  ['undertake', 'undertaken'], ['undo', 'undone'], ['unwind', 'unwound'], ['upset', 'upset'], ['uphold', 'upheld'], ['wake', 'woken'],
  ['wear', 'worn'], ['weave', 'woven'], ['wed', 'wed'], ['weep', 'wept'], ['win', 'won'], ['wind', 'wound'],
  ['withdraw', 'withdrawn'], ['withhold', 'withheld'], ['withstand', 'withstood'], ['wring', 'wrung'], ['write', 'written'],
];

export const participleByBase: ReadonlyMap<string, string> = new Map(irregularForms);

export const baseByParticiple: ReadonlyMap<string, string> = new Map(
  irregularForms.map(([base, participle]) => [participle, base] as const),
);

export const baseFormParticiples: ReadonlySet<string> = new Set(
  irregularForms.filter(([base, participle]) => base === participle).map(([base]) => base),
);
