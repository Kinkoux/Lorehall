/**
 * Quick-reference game data, paraphrased from the D&D 5e System Reference
 * Document 5.1 (Wizards of the Coast, CC-BY-4.0). Kept deliberately short —
 * this is a table aid, not a rulebook.
 *
 * Names stay English (game terms); descriptions carry both locales.
 */

export type LocalizedText = { en: string; tr: string };

export type SkillRef = { name: string; ability: string; description: LocalizedText };

export const SKILLS: SkillRef[] = [
  {
    name: "Athletics",
    ability: "STR",
    description: {
      en: "Climbing, jumping, swimming, grappling — any feat of raw physical power, like scaling a cliff mid-storm or shoving someone off a ledge.",
      tr: "Tırmanma, atlama, yüzme, boğuşma — fırtınanın ortasında kayalık tırmanmak ya da birini çıkıntıdan itmek gibi kaba kuvvet isteyen her iş.",
    },
  },
  {
    name: "Acrobatics",
    ability: "DEX",
    description: {
      en: "Keeping your footing and balance: tightropes, icy decks, tumbling out of a grapple, landing tricky jumps.",
      tr: "Ayakta ve dengede kalmak: ip üstünde yürümek, buzlu güvertede tutunmak, boğuşmadan yuvarlanarak sıyrılmak, zor atlayışları oturtmak.",
    },
  },
  {
    name: "Sleight of Hand",
    ability: "DEX",
    description: {
      en: "Manual trickery — picking pockets, palming an object, planting something on someone without being noticed.",
      tr: "El çabukluğu — cep karıştırmak, bir nesneyi avuçta gizlemek, fark ettirmeden birinin üstüne bir şey yerleştirmek.",
    },
  },
  {
    name: "Stealth",
    ability: "DEX",
    description: {
      en: "Hiding and moving silently: slipping past guards, sneaking up on prey, vanishing into a crowd.",
      tr: "Saklanmak ve sessiz hareket etmek: nöbetçilerin yanından süzülmek, ava sezdirmeden yaklaşmak, kalabalıkta kaybolmak.",
    },
  },
  {
    name: "Arcana",
    ability: "INT",
    description: {
      en: "Lore about spells, magic items, planes of existence, and magical creatures or symbols.",
      tr: "Büyüler, büyülü eşyalar, varoluş düzlemleri ve büyülü yaratıklar ya da semboller hakkında bilgi.",
    },
  },
  {
    name: "History",
    ability: "INT",
    description: {
      en: "Recalling legends, ancient kingdoms, past wars, and the stories behind people and places.",
      tr: "Efsaneleri, kadim krallıkları, eski savaşları ve kişilerle mekânların ardındaki hikâyeleri hatırlamak.",
    },
  },
  {
    name: "Investigation",
    ability: "INT",
    description: {
      en: "Deduction from clues: finding a hidden mechanism, spotting the weak point in a wall, working out how someone died.",
      tr: "İpuçlarından çıkarım yapmak: gizli bir mekanizmayı bulmak, duvarın zayıf noktasını görmek, birinin nasıl öldüğünü çözmek.",
    },
  },
  {
    name: "Nature",
    ability: "INT",
    description: {
      en: "Knowledge of terrain, plants, animals, weather, and natural cycles.",
      tr: "Arazi, bitkiler, hayvanlar, hava ve doğa döngüleri hakkında bilgi.",
    },
  },
  {
    name: "Religion",
    ability: "INT",
    description: {
      en: "Lore about deities, rites, holy symbols, cults, and the practices of temples.",
      tr: "Tanrılar, ayinler, kutsal semboller, tarikatlar ve tapınak gelenekleri hakkında bilgi.",
    },
  },
  {
    name: "Animal Handling",
    ability: "WIS",
    description: {
      en: "Calming, controlling, or reading animals — steadying a spooked horse, sensing a beast's intentions.",
      tr: "Hayvanları sakinleştirmek, yönetmek ya da okumak — ürken atı yatıştırmak, bir yaratığın niyetini sezmek.",
    },
  },
  {
    name: "Insight",
    ability: "WIS",
    description: {
      en: "Reading people: detecting lies, predicting someone's next move from body language and tone.",
      tr: "İnsan okumak: yalanı yakalamak, beden dilinden ve ses tonundan karşındakinin bir sonraki hamlesini kestirmek.",
    },
  },
  {
    name: "Medicine",
    ability: "WIS",
    description: {
      en: "Stabilizing the dying and diagnosing illness or cause of death.",
      tr: "Ölmek üzere olanı stabilize etmek; hastalığı ya da ölüm nedenini teşhis etmek.",
    },
  },
  {
    name: "Perception",
    ability: "WIS",
    description: {
      en: "Noticing things with your senses — hearing whispers behind a door, spotting an ambush or a hidden creature.",
      tr: "Duyularınla fark etmek — kapının ardındaki fısıltıyı duymak, pusuyu ya da gizlenmiş bir yaratığı seçmek.",
    },
  },
  {
    name: "Survival",
    ability: "WIS",
    description: {
      en: "Tracking, foraging, navigating the wild, predicting weather, and avoiding natural hazards.",
      tr: "İz sürmek, yiyecek toplamak, vahşi doğada yön bulmak, havayı tahmin etmek ve doğal tehlikelerden kaçınmak.",
    },
  },
  {
    name: "Deception",
    ability: "CHA",
    description: {
      en: "Convincing lies — misleading with words, disguises, or false confidence; conning and fast-talking.",
      tr: "İkna edici yalanlar — sözle, kılık değiştirerek ya da sahte özgüvenle yanıltmak; dolandırmak, laf cambazlığı.",
    },
  },
  {
    name: "Intimidation",
    ability: "CHA",
    description: {
      en: "Influencing through threats, hostility, and menace — spoken or implied.",
      tr: "Tehdit, düşmanlık ve gözdağıyla etkilemek — açık açık ya da imayla.",
    },
  },
  {
    name: "Performance",
    ability: "CHA",
    description: {
      en: "Delighting an audience with music, dance, acting, or storytelling.",
      tr: "Müzik, dans, oyunculuk ya da hikâye anlatımıyla seyirciyi mest etmek.",
    },
  },
  {
    name: "Persuasion",
    ability: "CHA",
    description: {
      en: "Influencing with tact, good faith, and social grace — negotiating, requesting aid, inspiring trust.",
      tr: "İncelik, iyi niyet ve sosyal zarafetle etkilemek — pazarlık etmek, yardım istemek, güven uyandırmak.",
    },
  },
];

export type ConditionRef = { name: string; description: LocalizedText };

export const CONDITIONS: ConditionRef[] = [
  {
    name: "Blinded",
    description: {
      en: "You can't see; you automatically fail checks that need sight. Attacks against you have advantage, your attacks have disadvantage.",
      tr: "Göremezsin; görüş gerektiren kontrollerde otomatik başarısız olursun. Sana yapılan saldırılar avantajlı, senin saldırıların dezavantajlıdır.",
    },
  },
  {
    name: "Charmed",
    description: {
      en: "You can't attack the charmer or target them with harmful effects; the charmer has advantage on social checks against you.",
      tr: "Seni büyüleyene saldıramaz, onu zararlı etkilerle hedefleyemezsin; büyüleyen sana karşı sosyal kontrollerde avantajlıdır.",
    },
  },
  {
    name: "Deafened",
    description: {
      en: "You can't hear and automatically fail checks that require hearing.",
      tr: "Duyamazsın; duyma gerektiren kontrollerde otomatik başarısız olursun.",
    },
  },
  {
    name: "Frightened",
    description: {
      en: "Disadvantage on checks and attacks while the source of fear is in sight; you can't willingly move closer to it.",
      tr: "Korkunun kaynağı görüş alanındayken kontrollerde ve saldırılarda dezavantajlısın; ona kendi isteğinle yaklaşamazsın.",
    },
  },
  {
    name: "Grappled",
    description: {
      en: "Your speed is 0. Ends if the grappler is incapacitated or you're moved out of their reach.",
      tr: "Hızın 0 olur. Seni tutan etkisiz kalırsa ya da onun erişiminin dışına çıkarılırsan sona erer.",
    },
  },
  {
    name: "Incapacitated",
    description: {
      en: "You can't take actions or reactions.",
      tr: "Aksiyon ve reaksiyon yapamazsın.",
    },
  },
  {
    name: "Invisible",
    description: {
      en: "You can't be seen without magic or special senses. Attacks against you have disadvantage; your attacks have advantage.",
      tr: "Büyü ya da özel duyular olmadan görülemezsin. Sana yapılan saldırılar dezavantajlı, senin saldırıların avantajlıdır.",
    },
  },
  {
    name: "Paralyzed",
    description: {
      en: "Incapacitated, can't move or speak, auto-fail STR and DEX saves. Attacks against you have advantage; hits from within 5 ft are criticals.",
      tr: "Etkisizsin; hareket edemez, konuşamazsın; STR ve DEX kurtarma zarlarında otomatik başarısız olursun. Sana yapılan saldırılar avantajlıdır; 5 ft içinden gelen isabetler kritik olur.",
    },
  },
  {
    name: "Petrified",
    description: {
      en: "Turned to stone: incapacitated, unaware, weight ×10. Resistance to all damage; immune to poison and disease.",
      tr: "Taşa dönersin: etkisiz, çevreden habersiz, ağırlık ×10. Tüm hasara direnç; zehre ve hastalığa bağışıklık.",
    },
  },
  {
    name: "Poisoned",
    description: {
      en: "Disadvantage on attack rolls and ability checks.",
      tr: "Saldırı zarlarında ve yetenek kontrollerinde dezavantajlısın.",
    },
  },
  {
    name: "Prone",
    description: {
      en: "You can only crawl. Your attacks have disadvantage. Attacks against you: advantage within 5 ft, disadvantage beyond.",
      tr: "Sadece emekleyebilirsin. Saldırıların dezavantajlıdır. Sana yapılan saldırılar: 5 ft içinden avantajlı, daha uzaktan dezavantajlı.",
    },
  },
  {
    name: "Restrained",
    description: {
      en: "Speed 0. Attacks against you have advantage, yours have disadvantage; disadvantage on DEX saves.",
      tr: "Hız 0. Sana yapılan saldırılar avantajlı, seninkiler dezavantajlı; DEX kurtarma zarlarında dezavantajlısın.",
    },
  },
  {
    name: "Stunned",
    description: {
      en: "Incapacitated, can't move, speaks falteringly. Auto-fail STR and DEX saves; attacks against you have advantage.",
      tr: "Etkisizsin, hareket edemezsin, ancak kekeleyerek konuşabilirsin. STR ve DEX kurtarma zarlarında otomatik başarısız olursun; sana yapılan saldırılar avantajlıdır.",
    },
  },
  {
    name: "Unconscious",
    description: {
      en: "Incapacitated, prone, unaware, drops everything. Auto-fail STR/DEX saves; attacks have advantage, hits within 5 ft are criticals.",
      tr: "Etkisiz, yerde ve çevreden habersizsin; elindekiler düşer. STR/DEX kurtarma zarlarında otomatik başarısız olursun; sana yapılan saldırılar avantajlıdır, 5 ft içinden isabetler kritik olur.",
    },
  },
  {
    name: "Exhaustion",
    description: {
      en: "Six worsening levels: 1 disadvantage on checks, 2 speed halved, 3 disadvantage on attacks/saves, 4 HP max halved, 5 speed 0, 6 death. Long rest removes one level.",
      tr: "Gittikçe ağırlaşan altı seviye: 1 kontrollerde dezavantaj, 2 hız yarıya, 3 saldırılarda/kurtarma zarlarında dezavantaj, 4 azami HP yarıya, 5 hız 0, 6 ölüm. Uzun dinlenme bir seviye kaldırır.",
    },
  },
];

export type CombatActionRef = { name: string; description: LocalizedText };

export const COMBAT_ACTIONS: CombatActionRef[] = [
  {
    name: "Attack",
    description: {
      en: "Make one melee or ranged attack (some features grant more).",
      tr: "Bir yakın dövüş ya da menzilli saldırı yap (bazı özellikler fazlasını verir).",
    },
  },
  {
    name: "Cast a Spell",
    description: {
      en: "Cast a spell with a casting time of 1 action.",
      tr: "Yapım süresi 1 aksiyon olan bir büyü yap.",
    },
  },
  {
    name: "Dash",
    description: {
      en: "Gain your speed as extra movement this turn.",
      tr: "Bu tur hızın kadar ek hareket kazan.",
    },
  },
  {
    name: "Disengage",
    description: {
      en: "Your movement doesn't provoke opportunity attacks this turn.",
      tr: "Bu tur hareketin fırsat saldırısı tetiklemez.",
    },
  },
  {
    name: "Dodge",
    description: {
      en: "Until your next turn, attacks against you have disadvantage and you make DEX saves with advantage.",
      tr: "Bir sonraki turuna kadar sana yapılan saldırılar dezavantajlı olur ve DEX kurtarma zarlarını avantajla atarsın.",
    },
  },
  {
    name: "Help",
    description: {
      en: "Give an ally advantage on their next ability check or on their next attack against a creature within 5 ft of you.",
      tr: "Bir yoldaşına, bir sonraki yetenek kontrolünde ya da senin 5 ft yakınındaki bir yaratığa yapacağı bir sonraki saldırıda avantaj ver.",
    },
  },
  {
    name: "Hide",
    description: {
      en: "Make a Stealth check to become hidden.",
      tr: "Gizlenmek için Stealth kontrolü yap.",
    },
  },
  {
    name: "Ready",
    description: {
      en: "Choose a trigger and an action; use your reaction to act when it happens.",
      tr: "Bir tetikleyici ve bir aksiyon seç; tetiklendiğinde reaksiyonunu harcayarak harekete geç.",
    },
  },
  {
    name: "Search",
    description: {
      en: "Devote your turn to finding something (usually Perception or Investigation).",
      tr: "Turunu bir şey aramaya ayır (genellikle Perception ya da Investigation ile).",
    },
  },
  {
    name: "Use an Object",
    description: {
      en: "Interact with a second object or use an item's special function.",
      tr: "İkinci bir nesneyle etkileşime geç ya da bir eşyanın özel işlevini kullan.",
    },
  },
];
