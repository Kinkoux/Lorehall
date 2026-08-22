export const landing = {
  en: {
    tagline: "One world · many campaigns",
    lede: "The shared ledger of your table. The world's lore, the party's characters, the initiative order, and the session chronicle — kept in one place while the dice stay on the table.",
    ctaCreate: "Start your world",
    ctaSignIn: "Sign in",
    features: {
      heading: "What the hall keeps",
      codex: {
        title: "World codex",
        body: "NPCs, places, factions, and lore — the DM's chronicle of the world, so nobody has to ask who Ser Alden was.",
      },
      sessions: {
        title: "Live sessions",
        body: "Initiative order, hit points, and death saves on every phone at the table. Type your real d20 roll — the dice stay physical.",
      },
      characters: {
        title: "Character ledgers",
        body: "Homebrew-friendly sheets with inventory, spell slots, and auto-computed modifiers. The DM sees the whole party's passive Perception.",
      },
      dm: {
        title: "The DM's screen",
        body: "A private script of story beats, prepared encounters that deploy in one click, quest log, and the party's gold — only the DM sees the strings.",
      },
    },
    // The shelves. Counts are badges drawn from the data, never written into
    // these lines — a sentence that says "319 spells" is wrong the moment the
    // SRD is re-fetched, and the number is already sitting beside the name.
    browse: {
      heading: "Open without an account",
      spells: "Spells",
      spellsBody: "The whole SRD spell list, filtered by level, class, school, and subclass.",
      monsters: "Monsters",
      monstersBody: "Stat blocks, each with an engraved plate of its own, filtered by challenge rating.",
      items: "Items",
      itemsBody: "Gear and magic items — every last one engraved, none of them a stock icon.",
      reference: "Rules reference",
      referenceBody: "Skills, conditions, and combat actions — the table answers, one tap away.",
      open: "Open",
    },
    plates: "Nine hundred and seventy-three engravings, cut for this hall and for nowhere else.",
    srdNote: "Game content from the 5e System Reference Document 5.1 (CC-BY-4.0). Lorehall is an unofficial fan-made companion.",
  },
  tr: {
    tagline: "Tek dünya · çok macera",
    lede: "Masanın ortak defteri. Dünyanın tarihi, partinin karakterleri, inisiyatif sırası ve oturum günlüğü — zarlar masada kalırken hepsi tek yerde.",
    ctaCreate: "Dünyanı kur",
    ctaSignIn: "Giriş yap",
    features: {
      heading: "Salonda ne saklanır",
      codex: {
        title: "Dünya kodeksi",
        body: "NPC'ler, mekânlar, gruplar ve tarih — DM'in dünya güncesi; kimse \"Ser Alden kimdi?\" diye sormak zorunda kalmaz.",
      },
      sessions: {
        title: "Canlı oturumlar",
        body: "İnisiyatif sırası, can puanları ve ölüm zarları masadaki her telefonda. Gerçek d20 sonucunu elle gir — zarlar fiziksel kalır.",
      },
      characters: {
        title: "Karakter defterleri",
        body: "Homebrew dostu sayfalar: envanter, büyü yuvaları, otomatik hesaplanan bonuslar. DM bütün partinin pasif algısını tek bakışta görür.",
      },
      dm: {
        title: "DM perdesi",
        body: "Özel hikâye planı, tek tıkla sahaya inen hazır karşılaşmalar, görev günlüğü ve partinin altını — ipleri yalnız DM görür.",
      },
    },
    browse: {
      heading: "Hesapsız da gezilir",
      spells: "Büyüler",
      spellsBody: "SRD'nin bütün büyü listesi; seviye, sınıf, okul ve alt sınıfa göre filtrelenir.",
      monsters: "Canavarlar",
      monstersBody: "Stat blokları, her biri kendi gravürüyle; CR'a göre filtrelenir.",
      items: "Eşyalar",
      itemsBody: "Teçhizat ve büyülü eşyalar — hepsi tek tek gravürlü, hiçbiri hazır ikon değil.",
      reference: "Kural rehberi",
      referenceBody: "Yetenekler, durumlar ve savaş aksiyonları — masanın cevapları tek dokunuşta.",
      open: "Aç",
    },
    plates: "Dokuz yüz yetmiş üç gravür; bu salon için çizildi, başka hiçbir yer için değil.",
    srdNote: "Oyun içeriği 5e System Reference Document 5.1'den (CC-BY-4.0). Lorehall resmî olmayan, hayran yapımı bir yardımcı uygulamadır.",
  },
} as const;
