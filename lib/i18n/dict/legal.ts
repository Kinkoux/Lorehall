/**
 * The hall's colophon: what it borrows, what it owns, and who to write to.
 *
 * One rule governs this file. `fan.policy` is the notice Wizards of the Coast
 * requires fan projects to carry, and it is reproduced word for word — the
 * same English string in both locales, because a translated licence notice is
 * no longer the notice. Everything around it is ordinary prose and mirrors.
 */
export const legal = {
  en: {
    metaTitle: "Legal & fan content",
    title: "Legal & fan content",
    subtitle: "What this hall borrows, what it drew itself, and where to write if something is wrong.",
    /** The footer's way in. Kept short — it sits beside the SRD line. */
    linkLabel: "Legal & fan content notice",

    fan: {
      heading: "Fan content",
      policy:
        "Lorehall is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.",
      body: "That block is the wording Wizards of the Coast asks fan projects to carry. It is reproduced here exactly as written, in English, and it says what it means: Lorehall is unofficial, nobody at Wizards approved it, and some of the material it stands on belongs to them.",
    },

    srd: {
      heading: "Game content",
      body: "The spells, monsters, items, conditions, and rules text in the compendium come from the 5e System Reference Document 5.1, used under the Creative Commons Attribution 4.0 International licence (CC-BY-4.0), attributed to Wizards of the Coast LLC. A handful of spells from other official books appear by name and casting details only, as references — their rules text is not reproduced here and lives in the books that print it. Anything else was written for this project.",
    },

    noncommercial: {
      heading: "Not a business",
      body: "Lorehall is a hobby, built for one physical table and left open for anyone who wants it. It is free as it stands today: no advertising, nothing for sale, no subscription, no revenue of any kind. That is an account of the site as it is now rather than a promise about every tomorrow — if it ever changes, this page changes first.",
    },

    independence: {
      heading: "Independence",
      body: "Lorehall is not affiliated with, sponsored by, or endorsed by Wizards of the Coast. Dungeons & Dragons, D&D, and the marks around them belong to their owners. Any other product or company named on the site is named descriptively — to say what a thing is — and stays the property of whoever holds it.",
    },

    art: {
      heading: "The engravings",
      body: "Every plate in the hall was drawn for this project. They illustrate SRD content — a spell, a beast, a piece of gear — but the images themselves are original work made for Lorehall, not scans or copies out of a published book.",
    },

    contact: {
      heading: "Corrections and takedowns",
      body: "If you hold rights to something here and see a problem, write and it will be handled — corrected, credited, or taken down. The project is public and has one maintainer; an issue on the repository reaches them directly.",
      repoLabel: "github.com/Kinkoux/Lorehall",
    },
  },

  tr: {
    metaTitle: "Yasal & fan içerik",
    title: "Yasal & fan içerik",
    subtitle: "Bu salonun neyi ödünç aldığı, neyi kendi çizdiği ve bir terslik varsa kime yazılacağı.",
    linkLabel: "Yasal / fan içerik bildirimi",

    fan: {
      heading: "Fan içeriği",
      // Aynı İngilizce blok, bilerek çevrilmedi: çevrilen bir lisans bildirimi
      // artık o bildirim değildir.
      policy:
        "Lorehall is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.",
      body: "Yukarıdaki blok, Wizards of the Coast'un hayran projelerinden taşımasını istediği zorunlu metindir; İngilizce aslıyla, kelimesi kelimesine bırakılmıştır. Söylediği şu: Lorehall resmî değildir, Wizards tarafından onaylanmamıştır ve dayandığı malzemenin bir kısmı onlara aittir.",
    },

    srd: {
      heading: "Oyun içeriği",
      body: "Kütüphanedeki büyüler, canavarlar, eşyalar, durumlar ve kural metinleri 5e System Reference Document 5.1'den gelir; Creative Commons Atıf 4.0 Uluslararası lisansıyla (CC-BY-4.0), Wizards of the Coast LLC atfıyla kullanılır. Diğer resmî kitaplardan bir avuç büyü yalnızca adı ve teknik başlıklarıyla, referans olarak yer alır — kural metinleri burada basılmaz, bastıkları kitaplarda yaşar. Geri kalan her şey bu proje için yazılmıştır.",
    },

    noncommercial: {
      heading: "Ticari bir iş değil",
      body: "Lorehall bir hobi; tek bir fiziksel masa için yapıldı ve isteyene açık bırakıldı. Bugünkü hâliyle ücretsizdir: reklam yok, satılan bir şey yok, abonelik yok, hiçbir türden gelir yok. Bu, sitenin bugünkü durumunun anlatımıdır; her yarın için verilmiş bir söz değil — değişirse ilk değişen bu sayfa olur.",
    },

    independence: {
      heading: "Bağımsızlık",
      body: "Lorehall'ın Wizards of the Coast ile bir bağı, sponsorluğu ya da onayı yoktur. Dungeons & Dragons, D&D ve çevresindeki markalar sahiplerine aittir. Sitede anılan başka ürün veya şirket adları tanımlayıcı amaçla — bir şeyin ne olduğunu söylemek için — anılır ve sahiplerinin mülkiyetinde kalır.",
    },

    art: {
      heading: "Gravürler",
      body: "Salondaki her gravür bu proje için çizildi. SRD içeriğini betimlerler — bir büyü, bir canavar, bir teçhizat parçası — ama görsellerin kendisi Lorehall için üretilmiş özgün çalışmalardır; basılı bir kitaptan tarama ya da kopya değildir.",
    },

    contact: {
      heading: "Düzeltme ve kaldırma",
      body: "Buradaki bir şey üzerinde hak sahibiyseniz ve bir sorun görüyorsanız yazın; düzeltilir, atfı verilir ya da kaldırılır. Proje açık kaynaktır ve tek bir kişi bakar; depodaki bir issue doğrudan ona ulaşır.",
      repoLabel: "github.com/Kinkoux/Lorehall",
    },
  },
} as const;
